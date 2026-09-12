import { Movie, Session, SessionFormat } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { titlesMatch, decodeHtmlText } from "./titleMatch";
import { resolveShadowMovie } from "./shadowMovies";
import { sydneyTodayParts, sydneyWallClockToUtc, sydneyWeekdayName } from "./sydneyTime";

/**
 * Ritz Randwick (ritzcinemas.com.au — a single, standalone venue, not the
 * wider Palace Cinemas chain, so this scraper doesn't generalise to other
 * Palace-network cinemas without its own investigation).
 *
 * Rewritten after Connor reported real sessions coming up "doubled up, and
 * on days that they're not actually for" — live investigation (via a real
 * browser, since this sandbox can't reach ritzcinemas.com.au directly)
 * found the actual root cause and a much better real data source than the
 * one the previous version of this scraper used:
 *
 * The site's `/now-showing` page is day-tabbed, and confirmed live to list
 * EVERY movie showing that day (not just ones CinemaScoper already knows to
 * ask about) — including retrospective/special-event titles like "Mulholland
 * Drive (2001)" or a "70mm The Odyssey" Celluloid Dreams screening, each
 * tagged with its own `data-genre` (e.g. `"Drama,Mystery,Thriller,
 * Retrospective"` vs `"...,New Release"`). Confirmed real day-tab URLs:
 *
 *   `/now-showing`            -> today
 *   `/now-showing/tomorrow`   -> tomorrow
 *   `/now-showing/<weekday>`  -> the next occurrence of that weekday, for
 *                                every day from "today+2" through "today+6"
 *                                (e.g. "monday", "tuesday", … whichever
 *                                weekday names those five calendar dates
 *                                actually are — NOT a fixed Monday-Friday
 *                                set; a live capture done on a Saturday
 *                                showed Monday-Friday simply because that's
 *                                what the next five days happened to be)
 *
 * so this fetches all 7 of those (today's calendar date computed once via
 * `sydneyTodayParts`, then `sydneyWeekdayName` for whichever real weekday
 * each of days 2-6 falls on) — a fixed, one-week booking window, the same
 * kind of limitation already documented on eventScraper's `MAX_DATES_PER_POLL`.
 * Ritz doesn't expose anything further out than this even on its own site
 * (confirmed by checking a movie's own "Select day" picker, which tops out
 * at the same 7 days) — so a Celluloid Dreams 70mm date more than a week
 * away genuinely won't appear until the booking window reaches it. That's a
 * real limitation of what Ritz itself has open for booking, not something
 * this scraper can fix by asking differently.
 *
 * Each day's page is known-day-explicit (the date comes from *which URL was
 * fetched*, not inferred from the data), which is what actually fixes both
 * of Connor's complaints at once: the previous version inferred day
 * boundaries from a per-movie, undated session list by watching for the
 * clock time "going backwards" — a heuristic that quietly breaks (wrong day,
 * or a session counted twice across two different per-movie fetches) the
 * moment the real ordering isn't perfectly monotonic. There's no such
 * inference here any more.
 *
 * Markup (confirmed live, both on `/now-showing` and on a movie's own page):
 *   <a class="Link sessions-link" href="/tickets?c=0000000004&s=90754"
 *      data-id="90754" data-name="Practical Magic 2"
 *      data-genre="Fantasy,Romance,New Release">
 *     <span class="Time">8:50 pm</span>
 *     <span class="Attribute">NFT</span>
 *   </a>
 * `data-id` is the session id, `data-name` the movie title as Ritz spells
 * it, `data-genre` a comma-separated tag list (used here only for format
 * hints — genuinely reliable new-vs-retrospective signal, but the
 * new-release/re-release computation is centralised in lib/dateUtils.ts's
 * `isReRelease` for every cinema, not overridden per-provider), and a
 * session can carry zero or more `<span class="Attribute">` tags such as
 * "70MM", "RETRO", "SellingFast" — 70MM specifically is folded into
 * `mapFormat` below alongside the existing `data-name` keyword check.
 *
 * Ticket links: `https://www.ritzcinemas.com.au/tickets?c=0000000004&s=<data-id>`
 * — exactly what that same `<a>`'s real `href` points to, confirmed live.
 * `c=0000000004` is Ritz's own fixed cinema code (a constant, since this
 * scraper only ever covers this one venue) — `Cinema.providerId` is unused.
 */

const BASE_URL = "https://www.ritzcinemas.com.au";
const TICKET_CINEMA_CODE = "0000000004";
const DAYS_AHEAD = 7; // the full booking window Ritz itself exposes — see doc comment above

interface RitzRow {
  name: string;
  sessionId: string | null;
  time: string;
  attributes: string[];
}

function dayPath(dayOffset: number, today: { year: number; month: number; day: number }): string {
  if (dayOffset === 0) return "/now-showing";
  if (dayOffset === 1) return "/now-showing/tomorrow";
  const targetUtcMs = Date.UTC(today.year, today.month, today.day + dayOffset);
  return `/now-showing/${sydneyWeekdayName(new Date(targetUtcMs))}`;
}

function extractSessions(html: string): RitzRow[] {
  const anchorRe = /<a class="Link sessions-link"([^>]*)>([\s\S]*?)<\/a>/g;
  const out: RitzRow[] = [];
  for (const m of html.matchAll(anchorRe)) {
    const attrsHtml = m[1];
    const inner = m[2];
    const timeMatch = inner.match(/<span class="Time">([^<]+)<\/span>/);
    if (!timeMatch) continue;
    const rawName = attrsHtml.match(/data-name="([^"]*)"/)?.[1] ?? "";
    if (!rawName) continue;
    const name = decodeHtmlText(rawName);
    const sessionId = attrsHtml.match(/data-id="(\d+)"/)?.[1] ?? null;
    const attributes = [...inner.matchAll(/<span class="Attribute[^"]*">([^<]*)<\/span>/g)].map((a) => a[1].trim());
    out.push({ name, sessionId, time: timeMatch[1].trim(), attributes });
  }
  return out;
}

// The Ritz regularly runs "Celluloid Dreams" 70mm re-release seasons and
// other special-format screenings — best-effort keyword match against the
// session's own `data-name` text and its `Attribute` tags (e.g. a confirmed
// real example carried the tag "70MM"), not exhaustively confirmed against
// every possible wording, so this is a heuristic rather than something
// reverse-engineered from every real example. Falls back to plain "2D" when
// nothing matches, same as before.
function mapFormat(row: RitzRow): SessionFormat {
  const haystack = `${row.name} ${row.attributes.join(" ")}`.toLowerCase();
  if (haystack.includes("70mm") || haystack.includes("70 mm")) return "70mm";
  if (haystack.includes("vmax")) return "VMAX";
  if (haystack.includes("imax")) return "IMAX";
  if (haystack.includes("4dx")) return "4DX";
  if (haystack.includes("dolby")) return "Dolby Cinema";
  if (haystack.includes("gold class") || haystack.includes("gold")) return "Gold Class";
  if (haystack.includes("extreme")) return "Extreme Screen";
  if (haystack.includes("subtitle") || haystack.includes("subtitled") || haystack.includes("open caption")) {
    return "Subtitled";
  }
  return "2D";
}

function parseTimeOfDay(time: string): { hour: number; minute: number } | null {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") hour += 12;
  return { hour, minute: Number(m[2]) };
}

async function fetchDay(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.error(`[ritzRandwickScraper] fetch failed for ${path}:`, err);
    return null;
  }
}

export const ritzRandwickScraper: CinemaScraper = {
  name: "Ritz Randwick (ritzcinemas.com.au)",

  async discoverNewSessions({ cinema, allKnownMovies, existingSessions, now }) {
    const today = sydneyTodayParts(now);
    const discovered: Session[] = [];
    const knownForMatch = [...allKnownMovies];
    const shadowMovies: Movie[] = [];

    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const path = dayPath(dayOffset, today);
      const html = await fetchDay(path);
      if (!html) continue;

      const targetUtcMs = Date.UTC(today.year, today.month, today.day + dayOffset);
      const targetDay = new Date(targetUtcMs);
      const year = targetDay.getUTCFullYear();
      const month = targetDay.getUTCMonth();
      const day = targetDay.getUTCDate();

      for (const row of extractSessions(html)) {
        const parsed = parseTimeOfDay(row.time);
        if (!parsed) continue;

        // Match against everything known, not just this tick's near-term
        // candidates — see the doc comment on `discoverNewSessions` in
        // lib/scrapers/types.ts. This is the change that lets an
        // already-known-but-old title (or a brand new retrospective one)
        // surface correctly instead of only ever checking candidateMovies.
        let movie = knownForMatch.find((m) => titlesMatch(m.title, row.name));
        if (!movie) {
          movie = resolveShadowMovie(row.name, knownForMatch);
          if (!knownForMatch.some((m) => m.id === movie!.id)) {
            knownForMatch.push(movie);
            shadowMovies.push(movie);
          }
        }

        const startsAt = sydneyWallClockToUtc(year, month, day, parsed.hour, parsed.minute);
        if (startsAt.getTime() < now.getTime()) continue;
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
          format: mapFormat(row),
          publishedAt: now.toISOString(),
          ticketUrl: row.sessionId
            ? `${BASE_URL}/tickets?c=${TICKET_CINEMA_CODE}&s=${row.sessionId}`
            : undefined,
        });
      }
    }

    return { sessions: discovered, shadowMovies };
  },
};
