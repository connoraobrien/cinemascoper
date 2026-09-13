import { Movie, Session, SessionFormat } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { titlesMatch } from "./titleMatch";
import { sydneyIsoWallClockToUtc } from "./sydneyTime";
import { resolveMovieForTitle } from "./shadowMovies";

/**
 * Event Cinemas (this also covers IMAX Sydney — it's its own Event
 * Cinemas venue, distinct from Event George Street, with its own
 * cinemaId). Reverse-engineered from what eventcinemas.com.au's own
 * cinema pages call — genuinely public, no auth/cookies required:
 *
 *  - `GET https://www.eventcinemas.com.au/Cinemas/GetSessions?cinemaIds=<id>[&date=YYYY-MM-DD]`
 *    without `&date`, returns *today's* sessions and a `Data.Dates`
 *    array of every date it'll return more sessions for if asked
 *    (typically the next couple of weeks); with `&date=`, that day's
 *    sessions. So getting a real look-ahead means one call per date, up
 *    to `MAX_DATES_PER_POLL` below — kept modest to stay well inside a
 *    serverless function's time budget on a single poll tick.
 *  - Shape: `Data.Movies[].Name` for the title, and each movie's
 *    `CinemaModels[]` (one per requested cinemaId) carries `.Sessions[]`:
 *    `{ Id, MovieId, CinemaId, StartTime, ScreenType, ScreenTypeName,
 *    BookingUrl }`. `StartTime` (e.g. "2026-09-12T16:30", confirmed via a
 *    live fetch) is local wall-clock with no offset and no seconds — don't
 *    `new Date()` it directly (see `sydneyIsoWallClockToUtc`'s doc comment
 *    for why that silently gives the wrong instant on a server). `BookingUrl`
 *    is a ready-made ticket link straight from the API — used as-is rather
 *    than hand-building one.
 *
 * `<id>` (e.g. "15" for George Street, "96" for IMAX Sydney) is
 * `Cinema.providerId` — resolved via the cinema search in the "Add a
 * cinema" form (see `app/api/cinema-search/route.ts`), not typed by hand.
 */

// Widened from 10: Connor reported IMAX Sydney sessions Event's own site
// shows further out (e.g. "The Odyssey" past the ~1-week mark) not showing
// up here. Event's `Data.Dates` array is bounded by whatever Event itself
// has actually opened bookings for, so this cap no longer artificially cuts
// that short — it's now generous enough to just take everything Event hands
// back, up to a sane ceiling on per-cinema fetches in one poll tick.
const MAX_DATES_PER_POLL = 28;

// Connor separately reported Event George Street specifically only showing
// sessions out to a few days ahead ("this coming Friday or whatever") even
// though `MAX_DATES_PER_POLL` above should allow much further. The likely
// cause: firing up to 27 simultaneous GET requests at Event's own endpoint
// for one cinema (`Promise.all` over every date at once, the previous
// shape here) is aggressive enough to plausibly get some of them
// rate-limited/dropped — and a failed date fetch was silently skipped with
// no retry and no log line, which would look exactly like "only the
// nearest few days came back" without anything actually being wrong with
// the date list itself. Fetching in smaller batches, with one retry for
// anything that fails, is meant to rule that out (or fix it, if that's
// what it was) without needing live access to Event's site to confirm —
// this sandbox has none. If sessions are still capped short after this,
// that'd genuinely point at Event's own booking window for that specific
// venue rather than a fetch problem here.
const DATE_FETCH_BATCH_SIZE = 6;
const DATE_FETCH_RETRY_DELAY_MS = 400;

function mapFormat(screenTypeName: string | undefined): SessionFormat {
  const s = (screenTypeName ?? "").toLowerCase();
  // Checked before the plain "imax" test below, since "imax" alone would
  // otherwise also match e.g. "VMAX" was never actually a substring match —
  // this is just keeping the more specific brands first for clarity.
  if (s.includes("vmax")) return "VMAX"; // Event's own large-format brand — now modelled distinctly rather than folded into IMAX
  if (s.includes("imax")) return "IMAX";
  if (s.includes("4dx")) return "4DX";
  if (s.includes("dolby")) return "Dolby Cinema";
  if (s.includes("gold")) return "Gold Class";
  if (s.includes("70mm") || s.includes("70 mm")) return "70mm";
  if (s.includes("extreme")) return "Extreme Screen";
  if (s.includes("subtitle")) return "Subtitled";
  return "2D";
}

interface EventSession {
  Id: number;
  StartTime: string; // local wall-clock, no offset — see doc comment above
  ScreenType?: string;
  ScreenTypeName?: string;
  BookingUrl?: string;
}

interface EventCinemaModel {
  Id: number;
  Sessions: EventSession[];
}

interface EventMovie {
  Id: number;
  Name: string;
  CinemaModels: EventCinemaModel[];
}

interface GetSessionsResponse {
  Success: boolean;
  Data: {
    Movies: EventMovie[];
    Dates: string[];
    SelectedDate: string;
  };
}

async function fetchDay(cinemaId: string, date?: string): Promise<GetSessionsResponse | null> {
  try {
    const url = new URL("https://www.eventcinemas.com.au/Cinemas/GetSessions");
    url.searchParams.set("cinemaIds", cinemaId);
    if (date) url.searchParams.set("date", date);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** `fetchDay` plus one retry after a short pause — see the doc comment on `DATE_FETCH_BATCH_SIZE`
 * above for why a failed/unsuccessful response here is treated as "probably transient" rather than
 * "this date genuinely has nothing", and logs (rather than silently drops) a date that still fails
 * after the retry, so a real ongoing gap is at least visible in the deploy's logs. */
async function fetchDayWithRetry(cinemaId: string, date: string | undefined, label: string): Promise<GetSessionsResponse | null> {
  const first = await fetchDay(cinemaId, date);
  if (first && first.Success) return first;

  await new Promise((resolve) => setTimeout(resolve, DATE_FETCH_RETRY_DELAY_MS));
  const retry = await fetchDay(cinemaId, date);
  if (!retry || !retry.Success) {
    console.error(`[eventScraper] cinema ${cinemaId}: gave up on ${label} after a retry`);
  }
  return retry;
}

/** Fetches every date in `dates` for `cinemaId`, `DATE_FETCH_BATCH_SIZE` at a time rather than all
 * at once — see the doc comment on `DATE_FETCH_BATCH_SIZE` above. */
async function fetchDaysInBatches(cinemaId: string, dates: string[]): Promise<(GetSessionsResponse | null)[]> {
  const out: (GetSessionsResponse | null)[] = [];
  for (let i = 0; i < dates.length; i += DATE_FETCH_BATCH_SIZE) {
    const batch = dates.slice(i, i + DATE_FETCH_BATCH_SIZE);
    out.push(...(await Promise.all(batch.map((d) => fetchDayWithRetry(cinemaId, d, d)))));
  }
  return out;
}

export const eventScraper: CinemaScraper = {
  name: "Event Cinemas (eventcinemas.com.au)",

  async discoverNewSessions({ cinema, allKnownMovies, existingSessions, now }) {
    if (!cinema.providerId) return { sessions: [], shadowMovies: [] };

    const first = await fetchDayWithRetry(cinema.providerId, undefined, "today");
    if (!first || !first.Success) return { sessions: [], shadowMovies: [] };

    const dates = [first.Data.SelectedDate, ...first.Data.Dates.filter((d) => d !== first.Data.SelectedDate)].slice(
      0,
      MAX_DATES_PER_POLL
    );

    const responses = [first, ...(await fetchDaysInBatches(cinema.providerId, dates.slice(1)))];

    const discovered: Session[] = [];
    const knownForMatch = [...allKnownMovies];
    const shadowMovies: Movie[] = [];

    for (const day of responses) {
      if (!day || !day.Success) continue;

      for (const eventMovie of day.Data.Movies) {
        // Match against everything known, not just this tick's near-term
        // candidates — see the doc comment on `discoverNewSessions` in
        // lib/scrapers/types.ts.
        let movie = knownForMatch.find((m) => titlesMatch(m.title, eventMovie.Name));
        if (!movie) {
          movie = await resolveMovieForTitle(eventMovie.Name, knownForMatch);
          if (!knownForMatch.some((m) => m.id === movie!.id)) {
            knownForMatch.push(movie);
            shadowMovies.push(movie);
          }
        }

        const cinemaModel = eventMovie.CinemaModels.find((c) => String(c.Id) === cinema.providerId);
        if (!cinemaModel) continue;

        for (const raw of cinemaModel.Sessions) {
          const startsAt = sydneyIsoWallClockToUtc(raw.StartTime);
          if (!startsAt || startsAt.getTime() < now.getTime()) continue;
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
            format: mapFormat(raw.ScreenTypeName ?? raw.ScreenType),
            publishedAt: now.toISOString(),
            ticketUrl: raw.BookingUrl || `https://www.eventcinemas.com.au/orders/tickets#sessionId=${raw.Id}`,
          });
        }
      }
    }

    return { sessions: discovered, shadowMovies };
  },
};
