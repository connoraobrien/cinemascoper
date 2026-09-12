import { readDB, withDB } from "./store";
import { seedDefaultsIfEmpty } from "./seedDefaults";
import { getMovies } from "./movies";
import { daysUntil } from "./dateUtils";
import { Movie } from "./types";

/**
 * Builds the single joined payload the whole dashboard hydrates from.
 * CinemaScoper is small enough that one shared shape (rather than a
 * REST resource per entity) keeps the client trivial: after any mutation
 * the app just re-renders from the fresh state returned by that endpoint.
 */
export async function buildState() {
  const allMovies = await getMovies();
  const movieMap = new Map(allMovies.map((m) => [m.id, m] as const));
  function movieById(id: string): Movie | undefined {
    return movieMap.get(id);
  }

  // Seeding is lazy (first request that finds an empty store) rather than
  // happening at module load, so a fresh store is only ever written once
  // real request handling begins.
  await withDB((db) => seedDefaultsIfEmpty(db, allMovies));

  const db = await readDB();
  const now = new Date();

  function cinemaName(id: string): string {
    return db.cinemas.find((c) => c.id === id)?.name ?? "Unknown cinema";
  }

  const watchlist = db.watchlist
    .map((w) => {
      const movie = movieById(w.movieId);
      return movie ? { ...movie, addedAt: w.addedAt } : null;
    })
    .filter((m): m is Movie & { addedAt: string } => Boolean(m))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

  const cinemas = [...db.cinemas].sort((a, b) => a.name.localeCompare(b.name));

  const alertRules = db.alertRules
    .map((r) => ({
      ...r,
      cinemaName: cinemaName(r.cinemaId),
      movieTitle: r.movieId ? movieById(r.movieId)?.title : undefined,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const sessions = db.sessions
    .map((s) => ({
      ...s,
      movieTitle: movieById(s.movieId)?.title ?? "Unknown movie",
      cinemaName: cinemaName(s.cinemaId),
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const upcomingSessions = sessions.filter((s) => daysUntil(s.startsAt, now) >= 0);

  const notifications = db.notifications
    .map((n) => ({
      ...n,
      movieTitle: movieById(n.movieId)?.title ?? "Unknown movie",
      cinemaName: cinemaName(n.cinemaId),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    movies: allMovies,
    cinemas,
    watchlist,
    alertRules,
    sessions: upcomingSessions,
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    lastPollAt: db.lastPollAt,
  };
}

export type AppState = Awaited<ReturnType<typeof buildState>>;
