import { Session } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { slugifyTitle } from "./titleMatch";

/**
 * Dendy. Every venue runs on its own subdomain (newtown.dendy.com.au,
 * canberra.dendy.com.au, …) with a public, unauthenticated GraphQL
 * endpoint at `/graphql` — `Cinema.providerId` is that subdomain (e.g.
 * "newtown"). Reverse-engineered from what the venue's own site calls:
 *
 *  - `findMovieBySlug(urlSlug: String!, siteIds: [ID])` resolves a movie
 *    by its URL slug (e.g. "practical-magic-2") to its Dendy movie id.
 *    `siteIds` must be a real, non-empty circuit id or it returns null —
 *    empirically `"36"` identifies the whole Dendy circuit (confirmed
 *    identical across two different venue subdomains), not one venue, so
 *    it's hardcoded below rather than something each cinema needs to
 *    supply.
 *  - `showingsForDate(movieId, siteIds, resultVersion, …)` returns every
 *    upcoming showing for that movie at this venue: `{ id, time,
 *    seatsRemaining, … }[]`. `time` is already a UTC ISO string. This one
 *    is *exactly* the query + variable shape the real site itself sent on
 *    a fresh page load (captured live, not reconstructed from the
 *    schema) — deliberately kept verbatim, right down to fields we don't
 *    use, rather than trimmed down to a smaller hand-written query,
 *    because this API turns out to reject some perfectly reasonable-
 *    looking smaller queries with an opaque permission error (e.g. adding
 *    a real `date`, or a `movieId` of `null`, both 403). A trimmed
 *    version might work fine — it just hasn't actually been tried against
 *    the live site, so this sticks with the one shape known to work.
 *    `resultVersion: null` (explicitly, not omitted) is what makes a
 *    *first* call for a given movie return full data rather than "nothing
 *    changed since your last check" — which is exactly what every poll
 *    tick needs, since a fresh scraper invocation has no prior version to
 *    compare against.
 *  - Passing a real `date` value, or omitting `movieId`, both get a 403
 *    permission error — this query is apparently only open for "give me
 *    everything for one already-known movie", which is exactly the shape
 *    we need per candidate movie anyway.
 *
 * We don't have Dendy's own movie-listing endpoint reverse-engineered, so
 * matching relies on guessing each candidate's slug via `slugifyTitle` —
 * confirmed to work for at least one real title ("Practical Magic 2" ->
 * "practical-magic-2"); a miss just means "doesn't look like it's
 * showing here" rather than an error.
 */

const CIRCUIT_SITE_ID = "36";

const FIND_MOVIE_QUERY = `query ($urlSlug: String!, $siteIds: [ID]) {
  findMovieBySlug(urlSlug: $urlSlug, siteIds: $siteIds) {
    id
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

async function graphql<T>(subdomain: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`https://${subdomain}.dendy.com.au/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  async discoverNewSessions({ cinema, candidateMovies, existingSessions, now }) {
    const subdomain = cinema.providerId;
    if (!subdomain) return [];

    const discovered: Session[] = [];

    for (const movie of candidateMovies) {
      const slug = slugifyTitle(movie.title);

      const found = await graphql<{ findMovieBySlug: { id: string } | null }>(subdomain, FIND_MOVIE_QUERY, {
        urlSlug: slug,
        siteIds: [CIRCUIT_SITE_ID],
      });
      const dendyMovieId = found?.findMovieBySlug?.id;
      if (!dendyMovieId) continue;

      // Full variable set, matching the exact confirmed-working shape the
      // real site sent (see doc comment above) — `resultVersion: null` in
      // particular is what makes this return full data on a first call.
      const showings = await graphql<{ showingsForDate: { data: { id: string; time: string }[] | null } }>(
        subdomain,
        SHOWINGS_QUERY,
        {
          ids: [],
          movieId: dendyMovieId,
          movieIds: [],
          titleClassId: null,
          titleClassIds: null,
          siteIds: [],
          everyShowingBadgeIds: [null],
          anyShowingBadgeIds: null,
          resultVersion: null,
        }
      );
      const rows = showings?.showingsForDate?.data ?? [];

      for (const row of rows) {
        const startsAt = new Date(row.time);
        if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime()) continue;
        const startsAtIso = startsAt.toISOString();

        const alreadyKnown = [...existingSessions, ...discovered].some(
          (s) => s.movieId === movie.id && s.cinemaId === cinema.id && s.startsAt === startsAtIso
        );
        if (alreadyKnown) continue;

        discovered.push({
          id: makeId("ss"),
          movieId: movie.id,
          cinemaId: cinema.id,
          startsAt: startsAtIso,
          format: "2D", // Dendy's own API doesn't cleanly expose screen format in this query
          publishedAt: now.toISOString(),
        });
      }
    }

    return discovered;
  },
};
