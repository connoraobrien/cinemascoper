import { DB, Movie, Cinema, Session, AppNotification } from "./types";
import { getScraperForProvider } from "./scrapers";
import { matchRulesForSession } from "./matching";
import { makeId } from "./ids";
import { titlesMatch } from "./scrapers/titleMatch";

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

export interface ScrapedCinemaResult {
  cinemaId: string;
  sessions: Session[];
  shadowMovies: Movie[];
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
 * The slow part of a poll tick: real network calls out to each tracked
 * cinema's own provider (see `lib/scrapers/`). Deliberately takes no `DB`
 * mutation lock — it only *reads* a snapshot of `db` (cinemas, existing
 * sessions) for dedup context, and returns what it found rather than
 * writing anything itself. This separation is what fixes a real bug: this
 * step can now take a real amount of time (Ritz alone fetches 7 day pages,
 * Event up to ~28 date pages, Dendy/Golden Age one lookup per movie in
 * their whole lineup) — previously the entire scrape ran *inside* the
 * store's load-mutate-save cycle (`withDB`), holding a snapshot of the
 * database open the whole time; anything Connor did in the app while a
 * poll was mid-flight (add to watchlist, mark tickets, add a cinema) would
 * get silently overwritten the moment that stale snapshot was finally
 * saved back. Keeping this step DB-write-free, and committing its results
 * through a short, fresh `withDB` call afterward (see `commitPollResults`
 * below and its call site in `app/api/poll/route.ts`), shrinks that
 * "in-flight" window from "the whole scrape" down to one fast read-modify-
 * write, which is what actually stops progress from disappearing.
 *
 * Cinemas are scraped in parallel (`Promise.all`) rather than one at a time
 * — previously sequential specifically to be gentle on the real sites and
 * stay inside a serverless function's time budget, but with several
 * providers now each making a handful of real requests per cinema, doing
 * them one cinema at a time made an ordinary poll tick take a genuinely
 * long time. Parallel is safe here without any extra coordination: a
 * shadow movie's id is a deterministic hash of its normalized title (see
 * `lib/scrapers/shadowMovies.ts`), so two cinemas independently discovering
 * the same untracked title in the same tick just produce two `Movie`
 * objects with the *same* id rather than a duplicate — `commitPollResults`
 * dedupes by id when it writes them in.
 */
export async function scrapeAllCinemas(db: DB, allMovies: Movie[], now: Date): Promise<ScrapedCinemaResult[]> {
  const watchlistedIds = new Set(db.watchlist.map((w) => w.movieId));
  const candidates = candidateMovies(allMovies, now, watchlistedIds);

  return Promise.all(
    db.cinemas.map(async (cinema): Promise<ScrapedCinemaResult> => {
      const scraper = getScraperForProvider(cinema.provider);
      const existingForCinema = db.sessions.filter((s) => s.cinemaId === cinema.id);
      try {
        const result = await scraper.discoverNewSessions({
          cinema,
          candidateMovies: candidates,
          allKnownMovies: allMovies,
          existingSessions: existingForCinema,
          now,
        });
        return { cinemaId: cinema.id, sessions: result.sessions, shadowMovies: result.shadowMovies };
      } catch (err) {
        console.error(`[pollEngine] scraper for ${cinema.name} (${cinema.provider}) threw:`, err);
        return { cinemaId: cinema.id, sessions: [], shadowMovies: [] };
      }
    })
  );
}

/**
 * A scraper's `shadowMovies` can now contain either a genuine unrecognised
 * placeholder OR a real movie `resolveMovieForTitle` just matched via a
 * single-title TMDB lookup (see `lib/scrapers/shadowMovies.ts`) — including
 * a title that already had an *old* placeholder sitting in `db.manualMovies`
 * from before that title could be matched (exactly what happened with
 * "Tony"/"The Odyssey" before the AU-release-date fix). The new real movie
 * gets a different id (`tmdb-<id>`) than the old placeholder
 * (`scraped-<hash>`), so without this migration step, every
 * session/notification already recorded against the old placeholder would
 * stay stuck on it forever — still reading as a re-release, since a
 * placeholder has no real release date — and a *new* session for the same
 * real-world screening would look like an unrelated extra session rather
 * than the same one (the `alreadyKnown` dedup below keys off `movieId`
 * too), i.e. a visible duplicate. This finds any existing placeholder
 * whose title matches a freshly-resolved real movie, moves every session
 * and notification pointing at the old id over to the new one, and drops
 * the now-superseded placeholder. A no-op for a genuine placeholder
 * (nothing to upgrade *to*) or a real movie with no stale placeholder to
 * replace (the common case, once this catches up).
 */
function migrateUpgradedShadowMovie(db: DB, resolvedMovie: Movie): void {
  if (resolvedMovie.source === "scraped") return;

  const stalePlaceholder = db.manualMovies.find(
    (m) => m.source === "scraped" && m.id !== resolvedMovie.id && titlesMatch(m.title, resolvedMovie.title)
  );
  if (!stalePlaceholder) return;

  const oldId = stalePlaceholder.id;
  const newId = resolvedMovie.id;

  for (const s of db.sessions) {
    if (s.movieId === oldId) s.movieId = newId;
  }
  for (const n of db.notifications) {
    if (n.movieId === oldId) n.movieId = newId;
  }
  if (db.hiddenMovieIds.includes(oldId) && !db.hiddenMovieIds.includes(newId)) {
    db.hiddenMovieIds.push(newId);
  }
  db.hiddenMovieIds = db.hiddenMovieIds.filter((id) => id !== oldId);
  db.manualMovies = db.manualMovies.filter((m) => m.id !== oldId);

  console.log(`[pollEngine] "${resolvedMovie.title}": migrated from shadow placeholder ${oldId} to real movie ${newId}`);
}

/**
 * The fast part of a poll tick: takes whatever `scrapeAllCinemas` already
 * found (no network calls here) and writes it into `db` — meant to run
 * inside a single short `withDB` call, against a *freshly re-loaded* `db`
 * (loaded right before this runs, well after scraping finished), not the
 * snapshot `scrapeAllCinemas` read its dedup context from. That gap is why
 * every session gets a second, cheap `alreadyKnown` check here against the
 * live `db.sessions` — insurance against the (small, since scraping now
 * runs in parallel rather than taking minutes) chance that something else
 * wrote a session in between, so re-committing stale scrape results can't
 * duplicate it.
 */
export function commitPollResults(
  db: DB,
  results: ScrapedCinemaResult[],
  allMovies: Movie[],
  now: Date
): PollSummary {
  const newSessions: Session[] = [];
  const newNotifications: AppNotification[] = [];
  const matchedByMovie = new Map<string, { sessionIds: string[]; ruleType: AppNotification["ruleType"] }>();

  const knownShadowIds = new Set(db.manualMovies.map((m) => m.id));
  for (const r of results) {
    for (const shadow of r.shadowMovies) {
      migrateUpgradedShadowMovie(db, shadow);
      if (knownShadowIds.has(shadow.id)) continue;
      knownShadowIds.add(shadow.id);
      db.manualMovies.push(shadow);
    }
  }

  for (const r of results) {
    for (const session of r.sessions) {
      const alreadyKnown = db.sessions.some(
        (s) => s.movieId === session.movieId && s.cinemaId === session.cinemaId && s.startsAt === session.startsAt
      );
      if (alreadyKnown) continue;

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
    cinemasChecked: results.length,
    newSessions,
    newNotifications,
  };
}

/**
 * Convenience wrapper kept for anything that wants the old "one call does
 * everything" shape (e.g. a test script) — scrapes and commits back to
 * back against the *same* `db` object with no re-read in between. Real
 * request handling (`app/api/poll/route.ts`) does NOT use this: it calls
 * `scrapeAllCinemas` and `commitPollResults` separately, with a fresh
 * `withDB`-scoped re-read of `db` in between, specifically to avoid the
 * long-held-snapshot race described on `scrapeAllCinemas` above.
 */
export async function runPoll(db: DB, allMovies: Movie[], now: Date = new Date()): Promise<PollSummary> {
  const results = await scrapeAllCinemas(db, allMovies, now);
  return commitPollResults(db, results, allMovies, now);
}

// Re-exported for any caller that still wants a human-readable cinema name
// from a poll-time context (kept for parity with the old module shape).
export function cinemaNameFor(cinemas: Cinema[], id: string): string {
  return cinemas.find((c) => c.id === id)?.name ?? "a tracked cinema";
}
