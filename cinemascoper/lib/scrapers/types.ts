import { Cinema, Movie, Session } from "../types";

/**
 * The contract every cinema provider implements. CinemaScoper ships with
 * real integrations for Hoyts, Event Cinemas, Dendy, Golden Age Cinema &
 * Bar and Ritz Randwick (see the sibling `*Scraper.ts` files — each has a
 * doc comment describing the real, unauthenticated endpoint it calls,
 * reverse-engineered from the venue's own site), plus `flicksScraper.ts`,
 * a universal fallback that works for *any* cinema listed on
 * flicks.com.au — which is how "add any cinema" is satisfied without a
 * bespoke integration for every possible venue — and `mockScraper.ts`, a
 * simulated stand-in kept for demos/offline dev.
 *
 * Async because real scrapers make network calls. Register a new
 * provider in `index.ts` — nothing in `pollEngine.ts` or the UI needs to
 * change.
 */
export interface CinemaScraper {
  /** Human-readable name, surfaced in logs / the poll summary. */
  name: string;

  /**
   * Look for session times at `cinema` for any of `candidateMovies` that
   * aren't already present in `existingSessions`. Returns only the *new*
   * sessions discovered on this pass. Should never throw on a network
   * hiccup — catch internally and return `[]` — so one flaky cinema can't
   * break the poll tick for every other cinema you're tracking.
   */
  discoverNewSessions(args: {
    cinema: Cinema;
    candidateMovies: Movie[];
    existingSessions: Session[];
    now: Date;
  }): Promise<Session[]>;
}
