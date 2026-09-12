import { Session } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { titlesMatch } from "./titleMatch";
import { sydneyTodayParts, sydneyWallClockToUtc } from "./sydneyTime";

/**
 * The universal fallback: flicks.com.au (a well-known third-party AU
 * session-times aggregator, not run by any cinema chain) publishes a
 * clean, public, unauthenticated per-day session page for essentially
 * every cinema in the country —
 * `https://www.flicks.com.au/cinema/sessions/<slug>/<YYYY-MM-DD>/` — so
 * this one scraper covers *any* cinema Connor adds that doesn't have one
 * of the bespoke, more-precise integrations (Hoyts/Event/Dendy/Golden
 * Age/Ritz Randwick above). `Cinema.providerId` is that cinema's slug on
 * flicks.com.au, e.g. "golden-age-cinema-and-bar-sydney" (from
 * flicks.com.au/cinema/<slug>/) — resolved via the cinema search in the
 * "Add a cinema" form (backed by flicks.com.au's own
 * `sitemap-cinemas.xml`, ~400 AU cinemas), not typed by hand.
 *
 * Each day's page is a list of `<article class="…cinema-times__article">`
 * blocks, one per movie, with `<h3 class="cinema-times__movie-title">`
 * and one `<span class="times-calendar-times__el__time">` per session.
 *
 * Known limitation: times are treated as Australian Eastern time
 * (Sydney/Melbourne/Brisbane's clock, DST-aware) regardless of the
 * cinema's actual state — fine for every cinema Connor has added so far,
 * but a WA/SA/NT venue added later would need this generalised to a
 * real per-cinema timezone (not built, since nothing today needs it).
 */

const DAYS_AHEAD = 7;

function parseTimeOfDay(time: string): { hour: number; minute: number } | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") hour += 12;
  return { hour, minute: Number(m[2]) };
}

function extractMovieBlocks(html: string): { title: string; times: string[] }[] {
  const chunks = html.split("<article").slice(1); // first split part is before any article
  return chunks.map((chunk) => {
    const title = chunk.match(/cinema-times__movie-title">([^<]+)</)?.[1]?.trim() ?? "";
    const times = [...chunk.matchAll(/times-calendar-times__el__time">([^<]+)</g)].map((m) => m[1].trim());
    return { title, times };
  });
}

function toDateParam(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export const flicksScraper: CinemaScraper = {
  name: "flicks.com.au (universal fallback)",

  async discoverNewSessions({ cinema, candidateMovies, existingSessions, now }) {
    if (!cinema.providerId) return [];
    const discovered: Session[] = [];
    const today = sydneyTodayParts(now);

    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const targetDay = new Date(Date.UTC(today.year, today.month, today.day + dayOffset));
      const dateParam = toDateParam(targetDay.getUTCFullYear(), targetDay.getUTCMonth(), targetDay.getUTCDate());

      let html: string;
      try {
        const res = await fetch(
          `https://www.flicks.com.au/cinema/sessions/${encodeURIComponent(cinema.providerId)}/${dateParam}/`
        );
        if (!res.ok) continue;
        html = await res.text();
      } catch (err) {
        console.error(`[flicksScraper] fetch failed for ${cinema.name} on ${dateParam}:`, err);
        continue;
      }

      for (const block of extractMovieBlocks(html)) {
        const movie = candidateMovies.find((m) => titlesMatch(m.title, block.title));
        if (!movie) continue;

        for (const timeStr of block.times) {
          const parsed = parseTimeOfDay(timeStr);
          if (!parsed) continue;

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
            format: "2D",
            publishedAt: now.toISOString(),
          });
        }
      }
    }

    return discovered;
  },
};
