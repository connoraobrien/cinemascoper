import { DB, Movie, Cinema, Session, AppNotification } from "./types";
import { getScraperForProvider } from "./scrapers";
import { matchRulesForSession } from "./matching";
import { makeId } from "./ids";

const CANDIDATE_WINDOW_MIN_DAYS = -14; // still show sessions for recently-released films
const CANDIDATE_WINDOW_MAX_DAYS = 45; // chains rarely open tickets further out than this

function candidateMovies(movies: Movie[], now: Date): Movie[] {
  return movies.filter((m) => {
    const days = (new Date(m.releaseDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return days >= CANDIDATE_WINDOW_MIN_DAYS && days <= CANDIDATE_WINDOW_MAX_DAYS;
  });
}

function movieTitle(movies: Movie[], id: string): string {
  return movies.find((m) => m.id === id)?.title ?? "A tracked movie";
}

function cinemaName(cinemas: Cinema[], id: string): string {
  return cinemas.find((c) => c.id === id)?.name ?? "a tracked cinema";
}

export interface PollSummary {
  ranAt: string;
  cinemasChecked: number;
  newSessions: Session[];
  newNotifications: AppNotification[];
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
  const candidates = candidateMovies(allMovies, now);
  const newSessions: Session[] = [];
  const newNotifications: AppNotification[] = [];

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
      for (const { rule } of matches) {
        const notification: AppNotification = {
          id: makeId("nt"),
          createdAt: now.toISOString(),
          read: false,
          kind: "new-session",
          movieId: session.movieId,
          cinemaId: session.cinemaId,
          sessionId: session.id,
          ruleType: rule.type,
          message:
            rule.type === "blanket"
              ? `${cinemaName(db.cinemas, session.cinemaId)} just published a new session for "${movieTitle(
                  allMovies,
                  session.movieId
                )}".`
              : `New session for your tracked movie "${movieTitle(allMovies, session.movieId)}" at ${cinemaName(
                  db.cinemas,
                  session.cinemaId
                )}.`,
        };
        db.notifications.unshift(notification);
        newNotifications.push(notification);
      }
    }
  }

  db.lastPollAt = now.toISOString();

  return {
    ranAt: now.toISOString(),
    cinemasChecked: db.cinemas.length,
    newSessions,
    newNotifications,
  };
}
