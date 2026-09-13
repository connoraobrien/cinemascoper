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
   * sessions discovered on this pass, plus any newly-minted `shadowMovies`
   * (see `lib/scrapers/shadowMovies.ts`) those sessions refer to. Should
   * never throw on a network hiccup — catch internally and return an empty
   * result — so one flaky cinema can't break the poll tick for every other
   * cinema you're tracking.
   *
   * `allKnownMovies` is every movie CinemaScoper knows about at all (the
   * discover window, manually-added, watchlisted, and shadow movies from
   * earlier polls) — wider than `candidateMovies` (which is scoped to
   * "worth asking about this poll tick", see `pollEngine.ts`). Every real
   * scraper now sees a whole cinema's own lineup rather than asking about
   * one movie at a time, and matches against this wider list first — so an
   * older, already-released title that's merely outside the normal
   * candidate window (but still known) still gets attributed to its real
   * Movie record. A title that doesn't match anything in `allKnownMovies`
   * either isn't given up on immediately: see `resolveMovieForTitle` in
   * `lib/scrapers/shadowMovies.ts`, which every real scraper calls instead
   * of creating a shadow movie directly — it tries a real, single-title
   * TMDB lookup first, and only falls back to an unrecognised placeholder
   * if that genuinely turns up nothing.
   */
  discoverNewSessions(args: {
    cinema: Cinema;
    candidateMovies: Movie[];
    allKnownMovies: Movie[];
    existingSessions: Session[];
    now: Date;
  }): Promise<{ sessions: Session[]; shadowMovies: Movie[] }>;
}
