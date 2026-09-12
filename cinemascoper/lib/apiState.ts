import { readDB, withDB, storageBackend } from "./store";
import { seedDefaultsIfEmpty } from "./seedDefaults";
import { getAllKnownMovies } from "./allMovies";
import { daysUntil, isReRelease } from "./dateUtils";
import { sydneyDateKey } from "./scrapers/sydneyTime";
import { Movie } from "./types";

export interface NotificationCinemaGroup {
  cinemaId: string;
  cinemaName: string;
  dates: string[]; // "YYYY-MM-DD", ascending, deduped — see AppNotification's doc comment in lib/types.ts
}

/**
 * Builds the single joined payload the whole dashboard hydrates from.
 * CinemaScoper is small enough that one shared shape (rather than a
 * REST resource per entity) keeps the client trivial: after any mutation
 * the app just re-renders from the fresh state returned by that endpoint.
 */
export async function buildState() {
  const knownMovies = await getAllKnownMovies(await readDB());
  const movieMap = new Map(knownMovies.map((m) => [m.id, m] as const));
  function movieById(id: string): Movie | undefined {
    return movieMap.get(id);
  }

  // Seeding is lazy (first request that finds an empty store) rather than
  // happening at module load, so a fresh store is only ever written once
  // real request handling begins.
  await withDB((db) => seedDefaultsIfEmpty(db, knownMovies));

  const db = await readDB();
  const now = new Date();

  function cinemaName(id: string): string {
    return db.cinemas.find((c) => c.id === id)?.name ?? "Unknown cinema";
  }

  const hiddenIds = new Set(db.hiddenMovieIds);
  // "scraped" placeholders (an auto-registered title from a cinema listing
  // that didn't match anything known — see lib/scrapers/shadowMovies.ts)
  // have no real metadata and aren't meant to be browsed or tracked; they
  // stay out of both the trackable list and the hidden-movies list, but
  // their sessions still surface fine in `sessions` below, joined via
  // `movieById` against the full `knownMovies` list.
  const trackableMovies = knownMovies.filter((m) => m.source !== "scraped");
  const movies = trackableMovies.filter((m) => !hiddenIds.has(m.id));
  const hiddenMovies = trackableMovies.filter((m) => hiddenIds.has(m.id));

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

  const purchasedIds = new Set(db.purchasedSessionIds);
  const sessions = db.sessions
    .map((s) => {
      const movie = movieById(s.movieId);
      const releaseDate = movie?.releaseDate ?? "";
      return {
        ...s,
        movieTitle: movie?.title ?? "Unknown movie",
        movieDirector: movie?.director,
        movieReleaseDate: releaseDate,
        cinemaName: cinemaName(s.cinemaId),
        // "Easily tell that the sessions on the day is the film's release
        // day" — compared on Sydney calendar dates so it lines up with how
        // sessions are grouped everywhere else (see sydneyDateKey).
        isReleaseDay: Boolean(releaseDate) && sydneyDateKey(new Date(s.startsAt)) === releaseDate.slice(0, 10),
        isReRelease: isReRelease(releaseDate, s.startsAt),
        ticketPurchased: purchasedIds.has(s.id),
      };
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const upcomingSessions = sessions.filter((s) => daysUntil(s.startsAt, now) >= 0);

  // "My Tickets" — every upcoming session Connor's actually marked as
  // booked, sorted soonest-first, regardless of watchlist/cinema filters —
  // a simple personal itinerary rather than another filtered view of the
  // same session list.
  const myTickets = upcomingSessions.filter((s) => s.ticketPurchased);

  const sessionById = new Map(db.sessions.map((s) => [s.id, s] as const));

  // "new-session" notifications are digests (see the doc comment on
  // AppNotification in lib/types.ts) — the cinema/date breakdown is
  // computed fresh here from `sessionIds` + the current `db.sessions`
  // rather than stored, so it never drifts if a session is later removed
  // (e.g. a cinema gets un-tracked — see app/api/cinemas/route.ts).
  function cinemaGroupsFor(sessionIds: string[]): NotificationCinemaGroup[] {
    const byCinema = new Map<string, Set<string>>();
    for (const sid of sessionIds) {
      const s = sessionById.get(sid);
      if (!s) continue;
      const dates = byCinema.get(s.cinemaId) ?? new Set<string>();
      dates.add(sydneyDateKey(new Date(s.startsAt)));
      byCinema.set(s.cinemaId, dates);
    }
    return [...byCinema.entries()]
      .map(([cinemaId, dates]) => ({
        cinemaId,
        cinemaName: cinemaName(cinemaId),
        dates: [...dates].sort(),
      }))
      .sort((a, b) => a.cinemaName.localeCompare(b.cinemaName));
  }

  const notifications = db.notifications
    .map((n) => {
      const movieTitle = movieById(n.movieId)?.title ?? "Unknown movie";
      // Back-compat: a notification persisted before this "digest" model
      // shipped has a single `sessionId` and no `sessionIds` array at all —
      // fold it into a one-element array rather than crashing on it.
      const legacySessionId = (n as unknown as { sessionId?: string }).sessionId;
      const sessionIds = n.sessionIds ?? (legacySessionId ? [legacySessionId] : []);

      if (n.kind === "release-date-change") {
        return {
          ...n,
          sessionIds,
          movieTitle,
          cinemaGroups: [] as NotificationCinemaGroup[],
          message: `"${movieTitle}"'s release date changed.`,
        };
      }
      const cinemaGroups = cinemaGroupsFor(sessionIds);
      return {
        ...n,
        sessionIds,
        movieTitle,
        cinemaGroups,
        message:
          n.ruleType === "blanket"
            ? `New session times at your cinemas for "${movieTitle}".`
            : `New session times for your tracked movie "${movieTitle}".`,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    movies,
    cinemas,
    watchlist,
    alertRules,
    sessions: upcomingSessions,
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    lastPollAt: db.lastPollAt,
    hiddenMovies,
    myTickets,
    storage: storageBackend(),
  };
}

export type AppState = Awaited<ReturnType<typeof buildState>>;
