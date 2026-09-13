import { Movie, Session } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { titlesMatch } from "./titleMatch";
import { resolveMovieForTitle } from "./shadowMovies";

/**
 * Dendy. Every venue runs on its own subdomain (newtown.dendy.com.au,
 * canberra.dendy.com.au, …) with a GraphQL endpoint at `/graphql` —
 * `Cinema.providerId` is that subdomain (e.g. "newtown"). Reverse-engineered
 * from what the venue's own site calls:
 *
 *  - `movies(type: "now-playing-and-coming-soon", …)` — the venue's *whole*
 *    current lineup in one call: `{ data: { id, name, urlSlug }[], count }`.
 *    Found by patching `window.fetch` in a real browser and clicking through
 *    the "Now Playing"/"Coming Soon" tabs (introspection is disabled on this
 *    schema, `__schema` is rejected outright, so this couldn't be found by
 *    asking the API directly) — confirmed live, returns every movie
 *    currently listed at the venue including retrospective/one-off titles,
 *    each with its own real `id` (so `findMovieBySlug` is no longer needed
 *    at all: this query already hands back the id `showingsForDate` wants).
 *    This is what makes Dendy a full-listing scraper now, same as
 *    Hoyts/Event/flicks — previously it only ever asked about
 *    `candidateMovies` via a guessed slug, so an untracked title (an old
 *    catalogue re-release, a one-off event) never surfaced here even if it
 *    was genuinely showing.
 *  - `showingsForDate(movieId, siteIds, resultVersion, …)` returns every
 *    upcoming showing for that movie at this venue: `{ id, time,
 *    seatsRemaining, … }[]`. `time` is already a UTC ISO string (`"Z"`
 *    suffix) — no conversion needed. `resultVersion: null` (explicitly,
 *    not omitted) is what makes a *first* call for a given movie return
 *    full data rather than "nothing changed since your last check".
 *
 * IMPORTANT — what actually authorizes a request here (found by live
 * network capture, correcting an earlier wrong assumption in this file):
 * it's three HTTP headers the real site sends on every GraphQL call —
 * `site-id`, `circuit-id`, and `client-type: consumer` — *not* the
 * `siteIds` GraphQL variable, which the real site itself often just sends
 * as `[]`. Earlier versions of this scraper had no headers at all and sent
 * a guessed constant in the `siteIds` variable instead — that guess
 * happened to make `findMovieBySlug` succeed (it's more lenient), which
 * masked the real problem: `showingsForDate` rejected every request with
 * an opaque "permission" 403, so Dendy silently discovered zero sessions,
 * ever, at every venue, the whole time. `circuit-id` is `"15"` for every
 * Dendy venue (it identifies the Dendy brand itself, confirmed identical
 * live across all 5 venues below); `site-id` is venue-specific — each of
 * the 5 was read directly off that venue's own outgoing requests:
 *
 *   newtown 36 · canberra 34 · coorparoo 39 · portside 38 · southport 37
 *
 * A venue not in `SITE_IDS` has no known site-id, so this scraper can't
 * authenticate for it and returns no sessions rather than guessing.
 *
 * Ticket links: clicking a showtime on the real site client-side-navigates
 * to `https://<subdomain>.dendy.com.au/checkout/showing/<id>` — confirmed
 * by actually clicking one and reading `window.location.href` — where
 * `<id>` is `showingsForDate`'s own `data[].id` (its separate `showingId`
 * field is null in practice and isn't what the URL uses, despite the name).
 */

const CIRCUIT_ID = "15";

const SITE_IDS: Record<string, string> = {
  newtown: "36",
  canberra: "34",
  coorparoo: "39",
  portside: "38",
  southport: "37",
};

// Verbatim from a real page load (captured via a `window.fetch` patch while
// clicking the "Now Playing"/"Coming Soon" tabs) — the whole current
// lineup for a venue in one call.
const MOVIES_QUERY = `query ($limit: Int, $orderBy: String, $descending: Boolean, $searchString: String, $siteIds: [ID], $currentMovieId: ID, $movieIdsToExclude: [ID], $titleClassId: ID, $titleClassIds: [ID], $type: String, $subtype: String) {
  movies(
    limit: $limit
    orderBy: $orderBy
    descending: $descending
    searchString: $searchString
    siteIds: $siteIds
    currentMovieId: $currentMovieId
    movieIdsToExclude: $movieIdsToExclude
    titleClassId: $titleClassId
    titleClassIds: $titleClassIds
    type: $type
    subtype: $subtype
  ) {
    data {
      id
      name
      urlSlug
      __typename
    }
    count
    __typename
  }
}`;

// Verbatim from a real page load (see doc comment above) — resist the
// urge to trim the unused fields without testing against the live site
// first.
const SHOWINGS_QUERY = `query ($ids: [ID], $movieId: ID, $movieIds: [ID], $titleClassId: ID, $titleClassIds: [ID], $siteIds: [ID], $everyShowingBadgeIds: [ID], $anyShowingBadgeIds: [ID], $resultVersion: String) {
  showingsForDate(
    ids: $ids
    movieId: $movieId
    movieIds: $movieIds
    titleClassId: $titleClassId
    titleClassIds: $titleClassIds
    siteIds: $siteIds
    everyShowingBadgeIds: $everyShowingBadgeIds
    anyShowingBadgeIds: $anyShowingBadgeIds
    resultVersion: $resultVersion
  ) {
    data {
      id
      time
      showingId
      seatsRemaining
      seatsRemainingWithoutSocialDistancing
      movie {
        id
        name
        __typename
      }
      __typename
    }
    count
    resultVersion
    __typename
  }
}`;

interface DendyMovie {
  id: string;
  name: string;
  urlSlug: string;
}

async function graphql<T>(
  subdomain: string,
  siteId: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T | null> {
  try {
    const res = await fetch(`https://${subdomain}.dendy.com.au/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/graphql-response+json,application/json;q=0.9",
        "site-id": siteId,
        "circuit-id": CIRCUIT_ID,
        "client-type": "consumer",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors) return null;
    return json.data as T;
  } catch {
    return null;
  }
}

export const dendyScraper: CinemaScraper = {
  name: "Dendy (dendy.com.au GraphQL)",

  async discoverNewSessions({ cinema, allKnownMovies, existingSessions, now }) {
    const subdomain = cinema.providerId;
    const siteId = SITE_IDS[subdomain];
    if (!subdomain || !siteId) return { sessions: [], shadowMovies: [] };

    const lineup = await graphql<{ movies: { data: DendyMovie[] } }>(subdomain, siteId, MOVIES_QUERY, {
      limit: 100,
      orderBy: "magic",
      descending: false,
      searchString: "",
      siteIds: [],
      currentMovieId: null,
      movieIdsToExclude: null,
      titleClassId: null,
      titleClassIds: null,
      type: "now-playing-and-coming-soon",
      subtype: "watched",
    });
    const dendyMovies = lineup?.movies?.data ?? [];

    const discovered: Session[] = [];
    const knownForMatch = [...allKnownMovies];
    const shadowMovies: Movie[] = [];

    for (const dendyMovie of dendyMovies) {
      // Match against everything known, not just this tick's near-term
      // candidates — see the doc comment on `discoverNewSessions` in
      // lib/scrapers/types.ts.
      let movie = knownForMatch.find((m) => titlesMatch(m.title, dendyMovie.name));
      if (!movie) {
        movie = await resolveMovieForTitle(dendyMovie.name, knownForMatch);
        if (!knownForMatch.some((m) => m.id === movie!.id)) {
          knownForMatch.push(movie);
          shadowMovies.push(movie);
        }
      }

      // Full variable set, matching the exact confirmed-working shape the
      // real site sent (see doc comment above) — `resultVersion: null` in
      // particular is what makes this return full data on a first call.
      const showings = await graphql<{
        showingsForDate: { data: { id: string; time: string }[] | null };
      }>(subdomain, siteId, SHOWINGS_QUERY, {
        ids: [],
        movieId: dendyMovie.id,
        movieIds: [],
        titleClassId: null,
        titleClassIds: null,
        siteIds: [],
        everyShowingBadgeIds: [null],
        anyShowingBadgeIds: null,
        resultVersion: null,
      });
      const rows = showings?.showingsForDate?.data ?? [];

      for (const row of rows) {
        const startsAt = new Date(row.time);
        if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime()) continue;
        const startsAtIso = startsAt.toISOString();

        const alreadyKnown = [...existingSessions, ...discovered].some(
          (s) => s.movieId === movie!.id && s.cinemaId === cinema.id && s.startsAt === startsAtIso
        );
        if (alreadyKnown) continue;

        discovered.push({
          id: makeId("ss"),
          movieId: movie.id,
          cinemaId: cinema.id,
          startsAt: startsAtIso,
          format: "2D", // Dendy's own API doesn't cleanly expose screen format in this query
          publishedAt: now.toISOString(),
          ticketUrl: `https://${subdomain}.dendy.com.au/checkout/showing/${row.id}`,
        });
      }
    }

    return { sessions: discovered, shadowMovies };
  },
};
