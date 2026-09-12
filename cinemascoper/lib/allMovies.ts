import { DB, Movie } from "./types";
import { getMovies } from "./movies";

/**
 * The discover-window catalogue (`getMovies()`) plus anything Connor has
 * manually added via the "search all of TMDB" flow (`db.manualMovies`) —
 * the one list every lookup/validity-check that needs to find "a movie by
 * id" should use, so a manually-added film (an already-released title, an
 * obscure re-release, anything outside the usual upcoming-release window)
 * behaves exactly like a discovered one everywhere: watchlisting,
 * targeted alert rules, and — importantly — being polled for new sessions
 * (see `candidateMovies` in `lib/pollEngine.ts`).
 *
 * The discover-window copy wins on an id collision (it's the fresher,
 * TTL-cached fetch); a manual movie only "falls out" of this merge once
 * TMDB's own discover window naturally grows to include it.
 */
export async function getAllKnownMovies(db: DB): Promise<Movie[]> {
  const discovered = await getMovies();
  const knownIds = new Set(discovered.map((m) => m.id));
  const manualOnly = db.manualMovies.filter((m) => !knownIds.has(m.id));
  return [...discovered, ...manualOnly];
}
