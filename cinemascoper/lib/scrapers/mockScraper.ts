import { Session, SessionFormat } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";

const FORMATS: SessionFormat[] = ["2D", "2D", "2D", "3D", "IMAX", "Gold Class", "Subtitled"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomUpcomingTime(now: Date, minDays: number, maxDays: number): Date {
  const dayOffset = minDays + Math.random() * (maxDays - minDays);
  const hour = 10 + Math.floor(Math.random() * 12); // 10am - 10pm sessions
  const minute = pick([0, 15, 30, 45]);
  const d = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Simulated scraper for offline dev/demos (not wired to any real cinema —
 * see `lib/scrapers/index.ts`). Each poll
 * tick, for every candidate movie at a cinema, there's a modest chance a
 * "new" session time gets published — mirroring how real chains drip-feed
 * ticketing windows in the weeks before release rather than publishing a
 * full schedule all at once.
 */
export const mockScraper: CinemaScraper = {
  name: "Simulated session-time scraper",

  async discoverNewSessions({ cinema, candidateMovies, existingSessions, now }) {
    const discovered: Session[] = [];

    for (const movie of candidateMovies) {
      const already = existingSessions.filter(
        (s) => s.movieId === movie.id && s.cinemaId === cinema.id
      );

      // Chains publish a handful of sessions per movie and then top up.
      // Once a cinema already has a decent spread, new discoveries taper off.
      const publishChance = already.length === 0 ? 0.55 : Math.max(0.08, 0.3 - already.length * 0.04);
      if (Math.random() > publishChance) continue;

      const howMany = already.length === 0 ? 1 + Math.floor(Math.random() * 2) : 1;

      for (let i = 0; i < howMany; i++) {
        const startsAt = randomUpcomingTime(now, 0.5, 21);
        // Skip if we've already got a session within 20 minutes of this
        // slot for the same movie/cinema (avoid noisy near-duplicates).
        const dup = [...existingSessions, ...discovered].some(
          (s) =>
            s.movieId === movie.id &&
            s.cinemaId === cinema.id &&
            Math.abs(new Date(s.startsAt).getTime() - startsAt.getTime()) < 20 * 60 * 1000
        );
        if (dup) continue;

        discovered.push({
          id: makeId("ss"),
          movieId: movie.id,
          cinemaId: cinema.id,
          startsAt: startsAt.toISOString(),
          format: pick(FORMATS),
          publishedAt: now.toISOString(),
        });
      }
    }

    return discovered;
  },
};
