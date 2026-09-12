import { Session, SessionFormat } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { slugifyTitle } from "./titleMatch";
import { sydneyTodayParts, sydneyWallClockToUtc } from "./sydneyTime";

/**
 * Ritz Randwick (ritzcinemas.com.au — a single, standalone venue, not the
 * wider Palace Cinemas chain, so this scraper doesn't generalise to other
 * Palace-network cinemas without its own investigation).
 *
 * There's no JSON API here — session times are baked straight into the
 * server-rendered HTML of each movie's own page, e.g.
 * `https://www.ritzcinemas.com.au/movies/<slug>`, as a flat, undated list
 * of `<li><a class="sessions-link" data-name="...">…<span class="Time">
 * 4:00 pm</span>…` entries covering the next several days (matching the
 * "Today / Tomorrow / Monday / …" day-picker tabs also on that page) —
 * with no date attribute anywhere on an individual session. So the date
 * for each one is inferred purely from position: the list is in
 * chronological order, and every time the clock time *goes backwards*
 * compared to the previous entry, that's a new day starting (one day per
 * day-picker tab, so day N is simply `now + N days`). This is a
 * best-effort heuristic rather than something the site states outright —
 * it held up against a real fetch during development, but a very unusual
 * schedule (e.g. a single very-early session on some day) could in
 * principle fool it.
 *
 * `Cinema.providerId` is unused here — this scraper is tied to one fixed
 * venue.
 *
 * Ticket links: each session `<a>` also carries a `data-id` (the session
 * id) — `https://www.ritzcinemas.com.au/tickets?c=0000000004&s=<data-id>`
 * is exactly the URL that same `<a>`'s real `href` points to, confirmed
 * live. `c=0000000004` is Ritz's own fixed cinema code (a constant, since
 * this scraper only ever covers this one venue).
 */

const BASE_URL = "https://www.ritzcinemas.com.au";
const TICKET_CINEMA_CODE = "0000000004";

function extractTimes(html: string): { name: string; sessionId: string | null; time: string }[] {
  const liRegex = /<li[^>]*>\s*<a class="Link sessions-link"([^>]*)>([\s\S]*?)<\/a>/g;
  const out: { name: string; sessionId: string | null; time: string }[] = [];
  for (const m of html.matchAll(liRegex)) {
    const attrs = m[1];
    const timeMatch = m[2].match(/<span class="Time">([^<]+)<\/span>/);
    if (!timeMatch) continue;
    const name = attrs.match(/data-name="([^"]*)"/)?.[1] ?? "";
    const sessionId = attrs.match(/data-id="(\d+)"/)?.[1] ?? null;
    out.push({ name, sessionId, time: timeMatch[1].trim() });
  }
  return out;
}

// The Ritz regularly runs "Celluloid Dreams" 70mm re-release seasons and
// other special-format screenings (their own `data-name` attribute is the
// only place that kind of detail shows up in this markup — not
// separately structured) — best-effort keyword match against it, not
// live-confirmed against an actual 70mm session's exact wording, so this
// is a heuristic rather than something reverse-engineered from a real
// example. Falls back to plain "2D" when nothing matches, same as before.
function mapFormat(sessionName: string): SessionFormat {
  const s = sessionName.toLowerCase();
  if (s.includes("70mm") || s.includes("70 mm")) return "70mm";
  if (s.includes("imax")) return "IMAX";
  if (s.includes("extreme")) return "Extreme Screen";
  if (s.includes("subtitle") || s.includes("subtitled") || s.includes("open caption")) return "Subtitled";
  return "2D";
}

function parseTimeOfDay(time: string): { hour: number; minute: number } | null {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") hour += 12;
  return { hour, minute: Number(m[2]) };
}

export const ritzRandwickScraper: CinemaScraper = {
  name: "Ritz Randwick (ritzcinemas.com.au)",

  async discoverNewSessions({ cinema, candidateMovies, existingSessions, now }) {
    const discovered: Session[] = [];
    const today = sydneyTodayParts(now);

    for (const movie of candidateMovies) {
      const slug = slugifyTitle(movie.title);
      let html: string;
      try {
        const res = await fetch(`${BASE_URL}/movies/${slug}`);
        if (!res.ok) continue;
        html = await res.text();
      } catch (err) {
        console.error(`[ritzRandwickScraper] fetch failed for "${movie.title}":`, err);
        continue;
      }

      const rows = extractTimes(html);
      if (rows.length === 0) continue;

      let dayOffset = 0;
      let prevMinutesOfDay = -1;

      for (const row of rows) {
        const parsed = parseTimeOfDay(row.time);
        if (!parsed) continue;
        const minutesOfDay = parsed.hour * 60 + parsed.minute;
        if (minutesOfDay < prevMinutesOfDay) dayOffset += 1;
        prevMinutesOfDay = minutesOfDay;

        // Add dayOffset to Sydney's *calendar* date (not the raw UTC
        // instant — see sydneyTodayParts's doc comment) via UTC-field
        // arithmetic, which is safe because these are just calendar
        // numbers at this point, not a real timezone-bound instant yet.
        const targetDayUtcMs = Date.UTC(today.year, today.month, today.day + dayOffset);
        const targetDay = new Date(targetDayUtcMs);
        const startsAt = sydneyWallClockToUtc(
          targetDay.getUTCFullYear(),
          targetDay.getUTCMonth(),
          targetDay.getUTCDate(),
          parsed.hour,
          parsed.minute
        );
        if (startsAt.getTime() < now.getTime()) continue;
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
          format: mapFormat(row.name),
          publishedAt: now.toISOString(),
          ticketUrl: row.sessionId
            ? `${BASE_URL}/tickets?c=${TICKET_CINEMA_CODE}&s=${row.sessionId}`
            : undefined,
        });
      }
    }

    return discovered;
  },
};
