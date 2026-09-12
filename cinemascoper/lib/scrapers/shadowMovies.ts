import { Movie } from "../types";
import { normalizeTitle } from "./titleMatch";

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
 * When a cinema's own "what's showing" listing (Hoyts/Event/flicks — the
 * three scrapers that see a venue's *whole* lineup rather than asking
 * about one movie at a time) includes a title CinemaScoper doesn't
 * recognise from TMDB, the watchlist, or a previous poll — an older
 * catalogue title, a revival screening, a one-off special event like the
 * Ritz's "Celluloid Dreams" 70mm season — this creates a minimal
 * placeholder `Movie` for it (or reuses one already created for the same
 * normalized title, so repeated polls don't mint duplicates) rather than
 * silently dropping that session. See the doc comment on `Movie.source`
 * in `lib/types.ts` for how it's kept out of Release Radar/tracking while
 * still showing up in the Session Times tab.
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
