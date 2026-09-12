// Core domain types for CinemaScoper.
// Kept dependency-free (no React/Next imports) so this layer can be
// unit-exercised directly with `tsx` or `node`, independent of the app.

export type ReleaseType = "Standard Theatrical" | "Limited Release" | "Film Festival";

export type SessionFormat = "2D" | "3D" | "IMAX" | "Gold Class" | "Subtitled";

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
  releaseDate: string; // ISO date, e.g. "2026-10-15"
  runtimeMinutes: number;
  genres: string[];
  synopsis: string;
  posterColor: string; // placeholder art: a CSS gradient seed, used when posterUrl is absent (or fails to load)
  posterUrl?: string; // a real poster image (from TMDB) when one is available
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

export interface AppNotification {
  id: string;
  createdAt: string;
  read: boolean;
  kind: "new-session";
  movieId: string;
  cinemaId: string;
  sessionId: string;
  ruleType: AlertRuleType;
  message: string;
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
}
