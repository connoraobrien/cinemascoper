import { DB, Movie, Cinema, Session, AppNotification } from "./types";
import { getScraperForProvider } from "./scrapers";
import { matchRulesForSession } from "./matching";
import { makeId } from "./ids";

const CANDIDATE_WINDOW_MIN_DAYS = -14; // still show sessions for recently-released films
const CANDIDATE_WINDOW_MAX_DAYS = 45; // chains rarely open tickets further out than this

/**
 * A movie is worth asking each scraper about if it's release-date-near
 * (the normal case), OR it's something Connor has actually watchlisted —
 * that second clause is what makes an already-released film, an obscure
 * re-release, or anything else added via the "search all of TMDB" flow
 * (see `lib/allMovies.ts`) actually get polled: a 1970s film the Ritz is
 * doing a 70mm re-release of will never fall inside the normal release-date
 * window, but if it's on the watchlist, Connor clearly wants to know.
 */
function candidateMovies(movies: Movie[], now: Date, watchlistedIds: Set<string>): Movie[] {
  return movies.filter((m) => {
    if (watchlistedIds.has(m.id)) return true;
    const days = (new Date(m.releaseDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return days >= CANDIDATE_WINDOW_MIN_DAYS && days <= CANDIDATE_WINDOW_MAX_DAYS;
  });
}

export interface PollSummary {
  ranAt: string;
  cinemasChecked: number;
  newSessions: Session[];
  newNotifications: AppNotification[];
}

/**
 * Folds a batch of newly-discovered, rule-matching sessions for one movie
 * into notification digests: appends to whatever unread "new-session"
 * notification for this movie already exists (so cinemas/dates accumulate
 * across as many poll ticks as it stays unread), or starts a fresh one.
 * See the doc comment on `AppNotification` in `lib/types.ts`.
 */
function foldIntoDigest(
  db: DB,
  movieId: string,
  sessionIds: string[],
  ruleType: AppNotification["ruleType"],
  now: Date,
  newNotifications: AppNotification[]
) {
  if (sessionIds.length === 0) return;

  const open = db.notifications.find((n) => n.kind === "new-session" && n.movieId === movieId && !n.read);
  if (open) {
    open.sessionIds.push(...sessionIds);
    open.createdAt = now.toISOString(); // bump so it resurfaces as the most recent alert
    if (ruleType === "blanket") open.ruleType = "blanket"; // blanket coverage is the more inclusive description
    return;
  }

  const notification: AppNotification = {
    id: makeId("nt"),
    createdAt: now.toISOString(),
    read: false,
    kind: "new-session",
    movieId,
    sessionIds: [...sessionIds],
    ruleType,
  };
  db.notifications.unshift(notification);
  newNotifications.push(notification);
}

/**
 * Detects a watchlisted movie's release date moving since the last poll
 * tick and emits a distinct "release-date-change" notification for it —
 * kept separate from "new-session" digests since it's a different kind of
 * update Connor asked to be able to filter independently. Only tracked for
 * watchlisted movies: everything else's date shuffles around on TMDB
 * constantly and would be pure noise.
 */
function detectReleaseDateChanges(db: DB, allMovies: Movie[], now: Date, newNotifications: AppNotification[]) {
  for (const w of db.watchlist) {
    const movie = allMovies.find((m) => m.id === w.movieId);
    if (!movie || !movie.releaseDate) continue;

    const previous = db.trackedReleaseDates[w.movieId];
    if (previous && previous !== movie.releaseDate) {
      const notification: AppNotification = {
        id: makeId("nt"),
        createdAt: now.toISOString(),
        read: false,
        kind: "release-date-change",
        movieId: w.movieId,
        sessionIds: [],
        previousReleaseDate: previous,
        newReleaseDate: movie.releaseDate,
      };
      db.notifications.unshift(notification);
      newNotifications.push(notification);
    }
    db.trackedReleaseDates[w.movieId] = movie.releaseDate;
  }
}

/**
 * The background check: what the cron in `vercel.json` triggers on a
 * schedule by calling out to each cinema's own real provider (see
 * `lib/scrapers/`). Scoped to `db.cinemas` — every cinema you've added is,
 * by definition, one you're tracking (see the doc comment on `DB.cinemas`
 * in `lib/types.ts`).
 *
 * Async, and cinemas are checked one at a time rather than in parallel —
 * deliberately gentle on the handful of real sites this hits, and it
 * keeps one slow/flaky cinema from racing a serverless function's time
 * budget against every other cinema's requests.
 */
export async function runPoll(db: DB, allMovies: Movie[], now: Date = new Date()): Promise<PollSummary> {
  const watchlistedIds = new Set(db.watchlist.map((w) => w.movieId));
  const candidates = candidateMovies(allMovies, now, watchlistedIds);
  const newSessions: Session[] = [];
  const newNotifications: AppNotification[] = [];

  // Newly-discovered, rule-matching session ids this tick, grouped by
  // movie so each movie folds into at most one digest per tick (see
  // `foldIntoDigest`) rather than one append per session.
  const matchedByMovie = new Map<string, { sessionIds: string[]; ruleType: AppNotification["ruleType"] }>();

  for (const cinema of db.cinemas) {
    const scraper = getScraperForProvider(cinema.provider);
    const existingForCinema = db.sessions.filter((s) => s.cinemaId === cinema.id);

    let discovered: Session[] = [];
    try {
      discovered = await scraper.discoverNewSessions({
        cinema,
        candidateMovies: candidates,
        existingSessions: existingForCinema,
        now,
      });
    } catch (err) {
      console.error(`[pollEngine] scraper for ${cinema.name} (${cinema.provider}) threw:`, err);
      continue;
    }

    for (const session of discovered) {
      db.sessions.push(session);
      newSessions.push(session);

      const matches = matchRulesForSession(session, db.alertRules, db.watchlist);
      if (matches.length === 0) continue;

      const entry = matchedByMovie.get(session.movieId) ?? { sessionIds: [], ruleType: matches[0].rule.type };
      entry.sessionIds.push(session.id);
      if (matches.some((m) => m.rule.type === "blanket")) entry.ruleType = "blanket";
      matchedByMovie.set(session.movieId, entry);
    }
  }

  for (const [movieId, { sessionIds, ruleType }] of matchedByMovie) {
    foldIntoDigest(db, movieId, sessionIds, ruleType, now, newNotifications);
  }

  detectReleaseDateChanges(db, allMovies, now, newNotifications);

  db.lastPollAt = now.toISOString();

  return {
    ranAt: now.toISOString(),
    cinemasChecked: db.cinemas.length,
    newSessions,
    newNotifications,
  };
}

// Re-exported for any caller that still wants a human-readable cinema name
// from a poll-time context (kept for parity with the old module shape).
export function cinemaNameFor(cinemas: Cinema[], id: string): string {
  return cinemas.find((c) => c.id === id)?.name ?? "a tracked cinema";
}
