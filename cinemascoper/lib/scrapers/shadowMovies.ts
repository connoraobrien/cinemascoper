import { Movie } from "../types";
import { normalizeTitle } from "./titleMatch";
import { findTmdbMovieByTitle } from "../movies";

/** Small, stable (not time-based, unlike `makeId`) hash so the same raw title always resolves to
 * the same shadow-movie id across separate poll ticks — otherwise every poll would mint a fresh
 * "movie" for the same re-release title and duplicate it forever instead of reusing one record. */
function stableTitleHash(normalized: string): string {
  let h = 0;
  for (let i = 0; i < normalized.length; i++) h = (Math.imul(h, 31) + normalized.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function shadowMovieId(title: string): string {
  return `scraped-${stableTitleHash(normalizeTitle(title))}`;
}

/**
 * The genuine last resort: a title that's neither in the known-movies
 * catalogue nor findable on TMDB (see `resolveMovieForTitle` below, which
 * is what every scraper actually calls) gets a minimal placeholder `Movie`
 * instead — an older catalogue title with no TMDB listing at all, a
 * one-off special/community event, or similar — rather than silently
 * dropping its session. Reuses one already created for the same normalized
 * title (so repeated polls don't mint duplicates). See the doc comment on
 * `Movie.source` in `lib/types.ts` for how it's kept out of Release
 * Radar/tracking while still showing up in the Sessions tab.
 */
export function resolveShadowMovie(rawTitle: string, knownMovies: Movie[]): Movie {
  const id = shadowMovieId(rawTitle);
  const existing = knownMovies.find((m) => m.id === id);
  if (existing) return existing;
  return {
    id,
    title: rawTitle,
    releaseType: "Limited Release",
    releaseDate: "",
    runtimeMinutes: 0,
    genres: [],
    synopsis: "",
    posterColor: "from-slate-600/70 to-slate-950/80",
    source: "scraped",
  };
}

/**
 * What every real (full-listing) scraper actually calls for a title it
 * can't match against `knownMovies` (the discover-window catalogue,
 * watchlist, and anything resolved by an earlier poll). Tries a real,
 * single-title TMDB match first (`findTmdbMovieByTitle`) — not just for a
 * title that's never been seen before, but *every* time, even for one
 * that already has a cached shadow placeholder from an earlier poll. That
 * "always try, don't just trust the cache" choice is deliberate: it's what
 * makes *matching* self-healing for a title that was wrongly turned into a
 * placeholder before this fallback existed, or before TMDB's own AU
 * release-date data caught up with it — exactly what happened with "Tony"
 * and "The Odyssey". (Any *already-recorded* session/notification still
 * pointing at the old placeholder's id gets moved over separately, by
 * `migrateUpgradedShadowMovie` in `lib/pollEngine.ts`, once this returns a
 * real movie for a title that used to resolve to that placeholder — this
 * function only decides which `Movie` a title resolves to, not what to do
 * with history recorded under a previous answer.) A title that's genuinely
 * not on TMDB (an old catalogue title never listed for AU, a
 * community/special screening) pays one extra TMDB search call per time a
 * scraper encounters it — inconsequential for a single-user app polling a
 * handful of cinemas — and falls back to the same placeholder behaviour as
 * before.
 *
 * Only falls back to `resolveShadowMovie` (a placeholder with no real
 * release date, which always reads as a re-release — see `isReRelease` in
 * `lib/dateUtils.ts`) when TMDB genuinely has nothing for this title, not
 * merely when the movie happens to be outside the normal discover window —
 * that's the actual fix for real, still-running releases wrongly showing
 * up as re-releases.
 */
export async function resolveMovieForTitle(rawTitle: string, knownMovies: Movie[]): Promise<Movie> {
  try {
    const tmdbMatch = await findTmdbMovieByTitle(rawTitle);
    if (tmdbMatch) {
      // Reuse the already-known record with this id if one exists (e.g. from
      // an earlier scraper in this same poll tick) rather than a fresh
      // object with identical content — keeps `knownMovies.some(id===...)`
      // dedup checks at the call site meaningful.
      return knownMovies.find((m) => m.id === tmdbMatch.id) ?? tmdbMatch;
    }
  } catch (err) {
    console.error(`[shadowMovies] TMDB lookup for "${rawTitle}" failed:`, err);
  }

  return resolveShadowMovie(rawTitle, knownMovies);
}
