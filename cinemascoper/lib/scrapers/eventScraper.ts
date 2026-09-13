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
// back, up to a sane ceiling on per-cinema fetches in one poll tick. Widened
// again 28 → 40 after a live check found George Street's own `Data.Dates`
// currently has 32 entries (including a couple of already-on-sale dates
// months out, e.g. early December) — 28 was quietly cutting off the last
// few of those, a real instance of "other screenings not getting picked
// up" even before the header/bot-detection fix above, not just a
// format-labelling issue.
const MAX_DATES_PER_POLL = 40;

// Connor separately reported Event George Street specifically only showing
// sessions out to a few days ahead ("this coming Friday or whatever"). The
// batching/retry below (originally: firing up to 27 simultaneous GET
// requests at Event's own endpoint for one cinema was aggressive enough to
// plausibly get some rate-limited/dropped, with no retry and no log line to
// show it) was a real improvement but turned out not to be the whole
// picture — see `withEventGate` just below for the rest of the story.
const DATE_FETCH_BATCH_SIZE = 6;
const DATE_FETCH_RETRY_COUNT = 2;
const DATE_FETCH_RETRY_DELAY_MS = 500;

/**
 * After the per-cinema batching above shipped, Connor reported it got
 * *worse*: not just George Street trailing off after a few days, but every
 * Event cinema he tracks (George Street AND IMAX Sydney, both hit here)
 * failing to load session times at all. The batching fix only bounded how
 * many requests fly at once *for one cinema* — but `scrapeAllCinemas` (see
 * `lib/pollEngine.ts`) scrapes every tracked cinema in parallel, and every
 * Event cinema is really the same `eventcinemas.com.au` host underneath a
 * different `cinemaId`. So with two-plus Event cinemas tracked, that "safe"
 * 6-wide batch became two, three, or more 6-wide batches landing on Event's
 * servers in the same instant — the exact kind of burst the batching was
 * meant to avoid, just recreated one level up. That fits what Connor saw
 * far better than a fix that made George Street's individual burst *smaller*
 * somehow making things worse for it alone would.
 *
 * This gate makes every Event cinema's network calls (the "today" lookup
 * and the batched date fetches) queue behind one another globally, so no
 * matter how many Event cinemas are tracked, Event's own servers only ever
 * see one cinema's worth of traffic at a time — restoring the effective
 * behaviour batching was going for, across cinemas and not just within one.
 * Everything else about a cinema's scrape (matching titles, TMDB lookups
 * for unrecognised ones, building sessions) still runs freely in parallel;
 * only the actual requests to Event are serialized.
 */
let eventGateTail: Promise<unknown> = Promise.resolve();
function withEventGate<T>(fn: () => Promise<T>): Promise<T> {
  const result = eventGateTail.then(fn, fn);
  eventGateTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function mapFormat(screenTypeName: string | undefined): SessionFormat {
  // Stripped of spaces/hyphens before matching — found via a live check of
  // a real GetSessions response that Event's own `ScreenTypeName` for VMAX
  // is literally "V-Max", which the previous plain `.includes("vmax")`
  // check never matched (the hyphen breaks the substring match), so every
  // real VMAX session was silently falling through to plain "2D". Stripping
  // punctuation before matching, rather than special-casing "v-max", also
  // means a future cosmetic respelling ("V Max", "V-MAX") won't quietly
  // reintroduce the same bug.
  const s = (screenTypeName ?? "").toLowerCase().replace(/[\s-]/g, "");
  // Checked before the plain "imax" test below, since "imax" alone would
  // otherwise also match "vmax" — this is just keeping the more specific
  // brands first for clarity.
  if (s.includes("vmax")) return "VMAX"; // Event's own large-format brand — now modelled distinctly rather than folded into IMAX
  if (s.includes("imax")) return "IMAX";
  if (s.includes("4dx")) return "4DX";
  if (s.includes("dolby")) return "Dolby Cinema";
  if (s.includes("boutique")) return "Boutique"; // confirmed live at George Street — a real, distinct Event screen type, previously unmodelled
  if (s.includes("gold")) return "Gold Class";
  if (s.includes("70mm")) return "70mm";
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

// Found by actually calling this endpoint two ways side by side: a plain
// `fetch(url)` with no headers (what this scraper was sending) against a
// real browser tab's own `fetch` to the same URL. Both got a real 200
// response *in that test* — but eventcinemas.com.au is served through
// Cloudflare (confirmed via the live response's own `server: cloudflare`
// header), which very commonly runs bot-management rules on exactly this
// kind of endpoint: a real API a page's own JS calls, not meant for
// third-party use, with no API key to gate it instead. A bare server-side
// fetch — Vercel's outbound requests come from well-known datacenter IP
// ranges, with none of a real browser's `User-Agent`, `Accept-Language`, or
// `sec-ch-ua` client hints — is exactly the shape Cloudflare's heuristics
// are built to catch, and would explain Connor's report precisely: every
// Event cinema failing at once (a host-level block hits every request to it
// the same way, unlike a per-cinema rate limit) that a from-the-browser
// spot-check can't reproduce (a real browser passes the same checks a real
// visitor would). Sending headers that make this request look like it came
// from an ordinary page load — a real desktop Chrome `User-Agent`, `Accept`,
// `Accept-Language`, and a `Referer` pointing at the cinema's own page — is
// the standard fix for this class of block. Couldn't be confirmed by
// actually redeploying and watching it succeed (this sandbox has no
// outbound access to eventcinemas.com.au to test against), so if sessions
// are still missing after this, the status/response logging below will at
// least show whether it's still the same failure or something new.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-AU,en;q=0.9",
  Referer: "https://www.eventcinemas.com.au/",
};

async function fetchDay(cinemaId: string, date?: string): Promise<GetSessionsResponse | null> {
  const url = new URL("https://www.eventcinemas.com.au/Cinemas/GetSessions");
  url.searchParams.set("cinemaIds", cinemaId);
  if (date) url.searchParams.set("date", date);
  try {
    const res = await fetch(url.toString(), { headers: BROWSER_HEADERS });
    if (!res.ok) {
      // Logged (not just swallowed) so a real, ongoing failure shows up in
      // Vercel's logs with an actual reason (rate-limited? blocked outright?
      // a genuinely bad cinemaId?) instead of just "no sessions" with
      // nothing to go on — this is exactly the visibility that was missing
      // when Event cinemas went quiet after Round 5's first attempt at this.
      // `cf-ray`/`server` are included specifically to confirm or rule out
      // the Cloudflare-block theory above from the real logs, not guesswork.
      console.error(
        `[eventScraper] cinema ${cinemaId}: GetSessions returned HTTP ${res.status} ` +
          `(server=${res.headers.get("server") ?? "?"}, cf-ray=${res.headers.get("cf-ray") ?? "?"})`
      );
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[eventScraper] cinema ${cinemaId}: GetSessions request failed:`, err);
    return null;
  }
}

/** `fetchDay` plus up to `DATE_FETCH_RETRY_COUNT` retries, each after a short pause — see the doc
 * comment on `DATE_FETCH_BATCH_SIZE` above for why a failed/unsuccessful response here is treated as
 * "probably transient" rather than "this date genuinely has nothing", and logs (rather than silently
 * drops) a date that still fails after every retry, so a real ongoing gap is at least visible in the
 * deploy's logs. */
async function fetchDayWithRetry(cinemaId: string, date: string | undefined, label: string): Promise<GetSessionsResponse | null> {
  let last: GetSessionsResponse | null = null;
  for (let attempt = 0; attempt <= DATE_FETCH_RETRY_COUNT; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, DATE_FETCH_RETRY_DELAY_MS));
    last = await fetchDay(cinemaId, date);
    if (last && last.Success) return last;
  }
  console.error(`[eventScraper] cinema ${cinemaId}: gave up on ${label} after ${DATE_FETCH_RETRY_COUNT} retries`);
  return last;
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

    // Every network call below goes through `withEventGate` — see its doc
    // comment above for why: without it, several Event cinemas scraped in
    // parallel (the normal case — `scrapeAllCinemas` scrapes every tracked
    // cinema at once) would still burst Event's servers even though each
    // cinema individually behaves.
    const first = await withEventGate(() => fetchDayWithRetry(cinema.providerId!, undefined, "today"));
    if (!first || !first.Success) {
      console.error(`[eventScraper] cinema ${cinema.providerId} (${cinema.name}): couldn't load today's sessions at all this tick`);
      return { sessions: [], shadowMovies: [] };
    }

    const dates = [first.Data.SelectedDate, ...first.Data.Dates.filter((d) => d !== first.Data.SelectedDate)].slice(
      0,
      MAX_DATES_PER_POLL
    );

    const responses = [first, ...(await withEventGate(() => fetchDaysInBatches(cinema.providerId!, dates.slice(1))))];

    const discovered: Session[] = [];
    const knownForMatch = [...allKnownMovies];
    const shadowMovies: Movie[] = [];

    // Event's `MAX_DATES_PER_POLL` widening means a single poll tick can see
    // this movie lineup dozens of times over (once per date page), but only
    // *distinct, still-unmatched* titles actually need a TMDB lookup. Find
    // them all first and resolve every one of them at once — rather than
    // `await`ing `resolveMovieForTitle` one at a time inside the loop below,
    // which serialized what's often 10-20+ distinct titles' worth of TMDB
    // round-trips back to back. That serial chain was itself a meaningful
    // chunk of how long one Event cinema's scrape took, on top of the date
    // fetches above — this cuts it down to the duration of the single
    // slowest lookup instead of the sum of all of them.
    const unmatchedTitles = new Set<string>();
    for (const day of responses) {
      if (!day || !day.Success) continue;
      for (const eventMovie of day.Data.Movies) {
        if (!knownForMatch.some((m) => titlesMatch(m.title, eventMovie.Name))) {
          unmatchedTitles.add(eventMovie.Name);
        }
      }
    }
    const resolved = await Promise.all(
      [...unmatchedTitles].map(async (title) => [title, await resolveMovieForTitle(title, knownForMatch)] as const)
    );
    // Keyed by the exact raw Event title rather than re-matched via
    // `titlesMatch` below — `resolveMovieForTitle` can fall back to TMDB's
    // top search hit even when it doesn't cleanly `titlesMatch` the query
    // (see `findTmdbMovieByTitle`), so re-deriving the movie for a title
    // by fuzzy-matching a second time could miss it and silently drop that
    // title's sessions. Resolving it once and remembering the answer against
    // the literal title it was resolved for sidesteps that entirely.
    const resolvedByRawTitle = new Map<string, Movie>();
    for (const [title, movie] of resolved) {
      resolvedByRawTitle.set(title, movie);
      if (!knownForMatch.some((m) => m.id === movie.id)) {
        knownForMatch.push(movie);
        shadowMovies.push(movie);
      }
    }

    for (const day of responses) {
      if (!day || !day.Success) continue;

      for (const eventMovie of day.Data.Movies) {
        // Match against everything known, not just this tick's near-term
        // candidates — see the doc comment on `discoverNewSessions` in
        // lib/scrapers/types.ts. Every title was either already matched
        // above or resolved by the batch just above, so this is a
        // synchronous lookup now, not a fallback that still needs to await
        // anything.
        const movie = knownForMatch.find((m) => titlesMatch(m.title, eventMovie.Name)) ?? resolvedByRawTitle.get(eventMovie.Name);
        if (!movie) continue; // defensive only — every title was resolved above

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
