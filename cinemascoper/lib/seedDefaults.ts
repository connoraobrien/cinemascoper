import { DB, Cinema, Movie } from "./types";
import { makeId } from "./ids";

const DEFAULT_WATCHLIST_SIZE = 4;

/**
 * First-run seeding so the dashboard shows something real immediately
 * instead of empty tabs — two cinemas on genuine, working providers (see
 * `lib/scrapers/`) rather than fake catalogue entries. Only applies once:
 * as soon as the user has touched their watchlist or cinema list, this is
 * a no-op, so it never re-adds cinemas you've since removed.
 *
 * The default watchlist is picked from whatever `movies` you pass in
 * (already-fetched, so this stays synchronous) — the soonest-releasing
 * handful — rather than hardcoded ids, since those only exist in the demo
 * catalogue and would be silently orphaned once TMDB is wired in (see
 * `lib/movies.ts`).
 */
export function seedDefaultsIfEmpty(db: DB, movies: Movie[], now: Date = new Date()): boolean {
  if (db.watchlist.length > 0 || db.cinemas.length > 0) return false;

  const cinemas: Cinema[] = [
    {
      id: makeId("cn"),
      name: "Hoyts Broadway",
      city: "Sydney",
      suburb: "Chippendale",
      provider: "hoyts",
      providerId: "BROADW",
      addedAt: now.toISOString(),
    },
    {
      id: makeId("cn"),
      name: "Dendy Newtown",
      city: "Sydney",
      suburb: "Newtown",
      provider: "dendy",
      providerId: "newtown",
      addedAt: now.toISOString(),
    },
  ];
  db.cinemas.push(...cinemas);

  const defaultWatchlist = [...movies]
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
    .slice(0, DEFAULT_WATCHLIST_SIZE);
  for (const movie of defaultWatchlist) {
    db.watchlist.push({ movieId: movie.id, addedAt: now.toISOString() });
  }

  // One blanket rule (alert on anything new at Hoyts Broadway) so the alert
  // pipeline has something to demonstrate as soon as the first poll runs.
  db.alertRules.push({ id: makeId("ar"), cinemaId: cinemas[0].id, type: "blanket", createdAt: now.toISOString() });

  return true;
}
