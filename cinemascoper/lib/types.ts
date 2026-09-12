// Core domain types for CinemaScoper.
// Kept dependency-free (no React/Next imports) so this layer can be
// unit-exercised directly with `tsx` or `node`, independent of the app.

export type ReleaseType = "Standard Theatrical" | "Limited Release" | "Film Festival";

// Widened from the original 7 per Connor's ask to "go bigger" — every
// large/premium format actually in play across the cinemas CinemaScoper
// integrates with (or reasonably could): Event's own VMAX brand no longer
// folds into "IMAX" (it's visually and technically distinct — see
// eventScraper's mapFormat), plus 4DX and Dolby Cinema, which several Hoyts
// and Event venues run, even though no scraper here has a *confirmed* live
// example of one yet (see the doc comments on hoytsScraper/eventScraper's
// mapFormat for exactly what's confirmed vs best-effort).
export type SessionFormat =
  | "2D"
  | "3D"
  | "IMAX"
  | "VMAX"
  | "4DX"
  | "Dolby Cinema"
  | "Gold Class"
  | "Subtitled"
  | "70mm"
  | "Extreme Screen";

/**
 * Which real (or simulated) session-times source a cinema is scraped from.
 * See `lib/scrapers/` for the implementation behind each one, and
 * `providerId`'s doc comment on `Cinema` for what that provider expects it
 * to contain.
 *
 * "flicks" is the universal fallback — it works for *any* cinema in
 * Australia (via flicks.com.au's own listings), so it's what backs the
 * "add any cinema" flow for venues that don't have one of the bespoke,
 * more-precise integrations below.
 */
export type CinemaProvider = "hoyts" | "event" | "dendy" | "golden-age" | "ritz-randwick" | "flicks" | "mock";

export interface Movie {
  id: string;
  title: string;
  releaseType: ReleaseType;
  releaseDate: string; // ISO date, e.g. "2026-10-15" — empty string means "yet to be announced"
  runtimeMinutes: number;
  genres: string[];
  synopsis: string;
  posterColor: string; // placeholder art: a CSS gradient seed, used when posterUrl is absent (or fails to load)
  posterUrl?: string; // a real poster image (from TMDB) when one is available
  director?: string;
  trailerUrl?: string; // a YouTube watch link (from TMDB's videos), when one is available
  popularity?: number; // TMDB's own popularity score — backs the "Mainstream releases" filter
  /**
   * Where this Movie record came from: undefined/"tmdb" for the normal
   * discover-window catalogue, "manual" for one added via the "search all
   * of TMDB" flow (lib/allMovies.ts), "scraped" for a placeholder a cinema
   * scraper auto-created for a title it found showing but didn't recognise
   * from TMDB or the watchlist (see lib/scrapers/shadowMovies.ts) — e.g. an
   * old catalogue title getting a 70mm re-release. "scraped" movies are
   * deliberately excluded from Release Radar / the trackable movie list
   * (no real metadata to show) but their sessions still surface in the
   * Session Times tab, which is the whole point of creating them.
   */
  source?: "tmdb" | "manual" | "scraped";
}

export interface Cinema {
  id: string;
  name: string;
  city: string;
  suburb: string;
  provider: CinemaProvider;
  /**
   * The provider's own identifier for this specific venue — what
   * `lib/scrapers/<provider>Scraper.ts` needs to fetch the right sessions.
   * Meaning depends on `provider`:
   *  - "hoyts": the Hoyts cinema code, e.g. "BROADW" (from hoyts.com.au's
   *    own `/api/cinemas` listing — resolved for you by the cinema search
   *    in the "Add a cinema" form, not typed by hand).
   *  - "event": the numeric Event Cinemas cinemaId, e.g. "15" (same —
   *    resolved via search, from eventcinemas.com.au's own cinema picker).
   *  - "dendy": the venue's subdomain on dendy.com.au, e.g. "newtown".
   *  - "golden-age" / "ritz-randwick": unused (each is a single fixed
   *    venue with its own scraper) — left empty.
   *  - "flicks": the cinema's slug on flicks.com.au, e.g.
   *    "golden-age-cinema-and-bar-sydney" (from
   *    flicks.com.au/cinema/<slug>/) — resolved via the same search.
   *  - "mock": unused.
   */
  providerId: string;
  addedAt: string;
}

export interface Session {
  id: string;
  movieId: string;
  cinemaId: string;
  startsAt: string; // ISO datetime
  format: SessionFormat;
  publishedAt: string; // ISO datetime the session was "published" (simulated scrape discovery)
  ticketUrl?: string; // deep link to buy tickets for this exact session, when the provider exposes one
}

export type AlertRuleType = "blanket" | "targeted";

export interface AlertRule {
  id: string;
  cinemaId: string;
  type: AlertRuleType;
  movieId?: string; // required when type === "targeted"
  createdAt: string;
}

export interface WatchlistEntry {
  movieId: string;
  addedAt: string;
}

export type NotificationKind = "new-session" | "release-date-change";

/**
 * `kind: "new-session"` notifications are *digests*, not one-per-screening:
 * `sessionIds` accumulates every newly-discovered session for this movie
 * that matched a rule, across as many poll ticks as the notification stays
 * unread (see `lib/pollEngine.ts`) — reading it "closes" the digest, and the
 * next new session starts a fresh one. `movieTitle`/cinema/date breakdown
 * is computed fresh at read time in `lib/apiState.ts` from `sessionIds`
 * rather than stored, so it can't go stale relative to `db.sessions`.
 *
 * `kind: "release-date-change"` is a single, distinct event — a tracked
 * movie's own release date moved — and isn't digested with anything else.
 */
export interface AppNotification {
  id: string;
  createdAt: string;
  read: boolean;
  kind: NotificationKind;
  movieId: string;
  // "new-session" only:
  sessionIds: string[];
  ruleType?: AlertRuleType;
  // "release-date-change" only:
  previousReleaseDate?: string;
  newReleaseDate?: string;
}

export interface DB {
  watchlist: WatchlistEntry[];
  // Cinemas are now fully user-managed (see CinemaProvider) rather than
  // picked from a fixed catalogue, so the cinema *is* the "my cinemas"
  // entry — there's no separate join table any more. Adding one starts
  // tracking it; deleting it stops.
  cinemas: Cinema[];
  alertRules: AlertRule[];
  sessions: Session[];
  notifications: AppNotification[];
  lastPollAt: string | null;
  // Movies added via the "search all of TMDB" flow (lib/allMovies.ts) —
  // merged with the normal discover-window catalogue everywhere a full
  // movie list is needed, so an already-released film or an obscure title
  // outside the usual release window can still be tracked and polled.
  manualMovies: Movie[];
  // Ids Connor has hidden from the Release Radar (and muted notifications
  // for) — see the "hide" action on a movie tile.
  hiddenMovieIds: string[];
  // The last release date CinemaScoper saw for each *watchlisted* movie,
  // so a poll tick can detect when TMDB moves a tracked movie's date and
  // fire a "release-date-change" notification (see lib/pollEngine.ts).
  // Only tracked for watchlisted movies — everything else's date churns
  // constantly on TMDB and would be pure noise.
  trackedReleaseDates: Record<string, string>;
  // Session ids Connor has marked "I've got tickets" for — backs the
  // "My Tickets" tab (see lib/apiState.ts's `myTickets`), a personal
  // itinerary of screenings he's actually committed to rather than just
  // tracking. A session id dropping out of `sessions` entirely (cinema
  // removed, or it just aged out) naturally makes the ticket a no-op —
  // nothing needs to clean this up proactively.
  purchasedSessionIds: string[];
}
