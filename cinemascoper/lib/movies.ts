import { Movie, ReleaseType } from "./types";
import { SEED_MOVIES } from "./seedMovies";

/**
 * Real movie data, from TMDB — replaces the invented `SEED_MOVIES` demo
 * catalogue whenever a `TMDB_API_KEY` env var is set (falls back to the
 * demo catalogue when it isn't, so local dev with no key still works).
 *
 * What this fetches: TMDB's `discover/movie` filtered to `region: "AU"`
 * and theatrical release types (2 = limited, 3 = wide), spanning from
 * `LOOKBACK_DAYS` ago (so a movie that *just* opened is still visible) to
 * `LOOKAHEAD_DAYS` out. For each result, one follow-up call to
 * `/movie/{id}?append_to_response=release_dates` gets runtime, full genre
 * names, and the AU-specific release_dates entry — used to tell "Limited
 * Release" apart from "Standard Theatrical" (TMDB doesn't have a "Film
 * Festival" release type, so real data never produces that ReleaseType;
 * it stays available for the demo catalogue only).
 *
 * Filtering deliberately uses `release_date.gte/lte` (which, combined with
 * `region`, TMDB scopes to *that region's own* release dates) rather than
 * `primary_release_date.gte/lte` (the movie's single global release date,
 * unaffected by `region`) — the latter was tried first and, sorted
 * ascending across TMDB's whole catalogue, mostly surfaced obscure titles
 * clustered right at the window's start date rather than actual upcoming
 * Australian releases. `region` narrows which release counts; it doesn't
 * narrow *which date field* gets filtered/sorted unless you also pick the
 * region-aware filter.
 *
 * Candidates are pulled by `popularity.desc`, not `release_date.asc` —
 * tried second. TMDB tracks a *lot* of "Limited Release" (type 2) AU
 * entries — every one-off revival screening, tiny single-cinema season,
 * etc. — dense enough that an ascending-date sort combined with any fixed
 * page/movie cap exhausted the cap on whatever was earliest in the window
 * (in practice, everything within about 3 weeks out) and never reached
 * further-out releases at all, no matter how far `LOOKAHEAD_DAYS` was
 * pushed out. Sorting by popularity instead spreads the kept movies across
 * the whole window (popular titles aren't clustered at the front) and
 * favours ones actually worth showing on a release radar; results are
 * still sorted back into date order afterwards for display.
 *
 * Capped at MAX_MOVIES and cached in memory for CACHE_TTL_MS: this is a
 * single-user, low-traffic app, and every extra movie is one extra TMDB
 * call, so there's no reason to hit the API more than occasionally or to
 * pull more candidates than the Release Radar can usefully show.
 *
 * Not live-verified against the real TMDB API from this sandbox (no
 * outbound access to api.themoviedb.org here) — the request shapes below
 * follow TMDB's documented v3 API, but this is the one piece of this
 * project's real-data work that hasn't been exercised against a live
 * response. Worth checking the Release Radar after your first deploy.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_MOVIES = 80; // bounds discover pages fetched and detail lookups made
const MAX_PAGES = 6; // TMDB returns 20 results/page
const LOOKBACK_DAYS = 14;
const LOOKAHEAD_DAYS = 270; // ~9 months of upcoming releases — wider than a typical "coming soon" page on
// purpose, since a single-cinema/limited release can be locked in that far out and Connor would
// rather scroll past more titles than miss one; the "Mainstream releases" filter (popularity-based,
// see ReleasesTab) is the intended way to cut back down to the big titles day-to-day.

/** A movie a mainstream-only filter should keep — TMDB's own popularity score, not vote count
 * (which skews toward old, already-widely-rated titles over new releases). Chosen by eyeballing
 * typical scores for wide theatrical releases vs. the long tail of festival/limited entries TMDB
 * also tracks for AU; not scientifically tuned. */
export const MAINSTREAM_POPULARITY_THRESHOLD = 15;

let cache: { at: number; movies: Movie[] } | null = null;

// Same palette style as the demo catalogue's invented posterColor values —
// used as a background behind a real poster image, and as the only art for
// any movie TMDB has no poster for.
const POSTER_FALLBACKS = [
  "from-orange-500/70 to-red-900/80",
  "from-sky-500/70 to-blue-900/80",
  "from-indigo-600/70 to-slate-900/80",
  "from-amber-600/70 to-rose-950/80",
  "from-emerald-600/70 to-teal-950/80",
  "from-cyan-600/70 to-slate-950/80",
  "from-fuchsia-600/70 to-purple-950/80",
  "from-teal-500/70 to-blue-950/80",
  "from-violet-600/70 to-indigo-950/80",
  "from-yellow-500/70 to-orange-950/80",
];

function fallbackGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return POSTER_FALLBACKS[hash % POSTER_FALLBACKS.length];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface TmdbDiscoverResult {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  popularity?: number;
}

interface TmdbReleaseDateEntry {
  release_date: string;
  type: number; // 1 Premiere, 2 Theatrical (limited), 3 Theatrical, 4 Digital, 5 Physical, 6 TV
}

interface TmdbCrewMember {
  job: string;
  name: string;
}

interface TmdbVideo {
  site: string; // "YouTube" is the only one we care about
  type: string; // "Trailer" | "Teaser" | …
  key: string;
  official?: boolean;
}

interface TmdbDetail {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_date: string;
  popularity?: number;
  runtime: number | null;
  genres: { id: number; name: string }[];
  release_dates?: { results: { iso_3166_1: string; release_dates: TmdbReleaseDateEntry[] }[] };
  credits?: { crew: TmdbCrewMember[] };
  videos?: { results: TmdbVideo[] };
}

export interface MovieSearchResult {
  tmdbId: number;
  title: string;
  releaseDate: string; // may be "" for an unannounced/TBA title
  posterUrl?: string;
  matchedDirector?: string; // set only when this result came from the by-director search below
}

interface TmdbPerson {
  id: number;
  name: string;
  known_for_department?: string;
}

async function tmdbGet<T>(path: string, apiKey: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Picks "Limited Release" vs "Standard Theatrical" from the AU entry's own release types. */
function auReleaseInfo(detail: TmdbDetail): { releaseType: ReleaseType; releaseDate?: string } {
  const au = detail.release_dates?.results?.find((r) => r.iso_3166_1 === "AU");
  const theatrical = (au?.release_dates ?? []).filter((d) => d.type === 2 || d.type === 3);
  if (theatrical.length === 0) return { releaseType: "Standard Theatrical" };
  const wide = theatrical.find((d) => d.type === 3);
  const earliest = [...theatrical].sort((a, b) => a.release_date.localeCompare(b.release_date))[0];
  return {
    releaseType: wide ? "Standard Theatrical" : "Limited Release",
    releaseDate: earliest.release_date.slice(0, 10),
  };
}

function directorFrom(detail: TmdbDetail): string | undefined {
  return detail.credits?.crew?.find((c) => c.job === "Director")?.name;
}

/** Prefers an official YouTube trailer, then any YouTube trailer, then an official teaser —
 * TMDB doesn't always have a "Trailer" entry yet for a far-out release. */
function trailerUrlFrom(detail: TmdbDetail): string | undefined {
  const videos = (detail.videos?.results ?? []).filter((v) => v.site === "YouTube");
  const pick =
    videos.find((v) => v.type === "Trailer" && v.official) ??
    videos.find((v) => v.type === "Trailer") ??
    videos.find((v) => v.type === "Teaser" && v.official) ??
    videos.find((v) => v.type === "Teaser");
  return pick ? `https://www.youtube.com/watch?v=${pick.key}` : undefined;
}

/** Shared mapping from a TMDB detail response (`append_to_response=release_dates,credits,videos`)
 * to our own `Movie` shape — used both for the bulk discover fetch below and for adding a single
 * movie by id via the "search all of TMDB" flow (see `fetchTmdbMovieById`). */
function mapDetailToMovie(detail: TmdbDetail): Movie {
  const { releaseType, releaseDate } = auReleaseInfo(detail);
  const id = `tmdb-${detail.id}`;
  return {
    id,
    title: detail.title,
    releaseType,
    releaseDate: releaseDate ?? detail.release_date ?? "",
    runtimeMinutes: detail.runtime ?? 0,
    genres: detail.genres.map((g) => g.name),
    synopsis: detail.overview || "No synopsis available yet.",
    posterColor: fallbackGradient(id),
    posterUrl: detail.poster_path ? `${TMDB_IMAGE_BASE}${detail.poster_path}` : undefined,
    director: directorFrom(detail),
    trailerUrl: trailerUrlFrom(detail),
    popularity: detail.popularity,
  };
}

const DETAIL_APPEND = "release_dates,credits,videos";

async function fetchFromTmdb(apiKey: string): Promise<Movie[]> {
  const now = new Date();
  const gte = isoDate(new Date(now.getTime() - LOOKBACK_DAYS * 86400000));
  const lte = isoDate(new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000));

  const discovered: TmdbDiscoverResult[] = [];
  for (let page = 1; page <= MAX_PAGES && discovered.length < MAX_MOVIES; page++) {
    const data = await tmdbGet<{ results: TmdbDiscoverResult[]; total_pages: number }>("/discover/movie", apiKey, {
      region: "AU",
      with_release_type: "2|3",
      // Region-scoped filter (see doc comment above) — not primary_release_date,
      // which ignores `region` and pulls from TMDB's whole global catalogue.
      "release_date.gte": gte,
      "release_date.lte": lte,
      // popularity, not release_date (see doc comment above) — an ascending
      // date sort exhausts the movie cap on whatever's earliest and never
      // reaches the rest of the window; final display order is still by
      // date, just sorted back into that order after fetching (below).
      sort_by: "popularity.desc",
      include_adult: "false",
      page: String(page),
    });
    if (!data) break;
    discovered.push(...data.results);
    if (page >= data.total_pages) break;
  }

  const movies: Movie[] = [];
  for (const d of discovered.slice(0, MAX_MOVIES)) {
    const detail = await tmdbGet<TmdbDetail>(`/movie/${d.id}`, apiKey, { append_to_response: DETAIL_APPEND });
    if (!detail) continue;
    movies.push({ ...mapDetailToMovie(detail), popularity: detail.popularity ?? d.popularity });
  }

  return movies.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

/**
 * Falls back to searching by director when the title search above doesn't
 * turn up much — "I'm looking for a film by a director but I don't know
 * what it's called." Two calls: find the person (`/search/person`, picking
 * whoever's actually known for directing over an actor/crew member who
 * happens to share a name), then their filmography as a director
 * (`/discover/movie?with_crew=<personId>`). Not live-verified against a
 * real TMDB response from this sandbox (see the doc comment at the top of
 * this file) — `with_crew` is TMDB's documented (if less-used than
 * `with_cast`) discover parameter for "this person appears in the crew",
 * which includes directing credits; worth confirming after deploy that it
 * doesn't also pull in, say, a producer or composer of the same name's work.
 */
async function searchTmdbByDirector(query: string, apiKey: string): Promise<MovieSearchResult[]> {
  const people = await tmdbGet<{ results: TmdbPerson[] }>("/search/person", apiKey, {
    query,
    include_adult: "false",
  });
  const person =
    people?.results?.find((p) => p.known_for_department === "Directing") ?? people?.results?.[0] ?? null;
  if (!person) return [];

  const discover = await tmdbGet<{ results: TmdbDiscoverResult[] }>("/discover/movie", apiKey, {
    with_crew: String(person.id),
    sort_by: "popularity.desc",
    include_adult: "false",
  });
  if (!discover) return [];

  return discover.results.slice(0, 8).map((r) => ({
    tmdbId: r.id,
    title: r.title,
    releaseDate: r.release_date ?? "",
    posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : undefined,
    matchedDirector: person.name,
  }));
}

/**
 * Backs the "search all of TMDB" box (Watchlist tab) — for a film that
 * isn't in the current discover window: not yet locked into a wide AU
 * release, an old title getting a re-release (e.g. the Ritz's 70mm
 * screenings), or anything else `getMovies()` wouldn't have surfaced.
 * Lightweight on purpose (no per-result detail call) — a detail lookup
 * only happens for the one result Connor actually picks, via
 * `fetchTmdbMovieById`. Searches by title and by director in parallel and
 * merges the two (title matches first, then any director hits not already
 * present) — so a search that's actually a director's name still turns up
 * their films without a separate mode to switch into.
 */
export async function searchTmdbMovies(query: string): Promise<MovieSearchResult[]> {
  const apiKey = process.env.TMDB_API_KEY;
  const q = query.trim();
  if (!apiKey || !q) return [];

  const [titleData, directorHits] = await Promise.all([
    tmdbGet<{ results: TmdbDiscoverResult[] }>("/search/movie", apiKey, {
      query: q,
      include_adult: "false",
      region: "AU",
    }),
    searchTmdbByDirector(q, apiKey),
  ]);

  const titleHits: MovieSearchResult[] = (titleData?.results ?? []).slice(0, 12).map((r) => ({
    tmdbId: r.id,
    title: r.title,
    releaseDate: r.release_date ?? "",
    posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : undefined,
  }));

  const seen = new Set(titleHits.map((r) => r.tmdbId));
  const merged = [...titleHits];
  for (const hit of directorHits) {
    if (seen.has(hit.tmdbId)) continue;
    seen.add(hit.tmdbId);
    merged.push(hit);
  }

  return merged.slice(0, 16);
}

/** Fetches full detail for one TMDB movie id and maps it to our `Movie` shape — used when Connor
 * picks a result from the search above to add it (see `db.manualMovies` in `lib/types.ts`). */
export async function fetchTmdbMovieById(tmdbId: number): Promise<Movie | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;
  const detail = await tmdbGet<TmdbDetail>(`/movie/${tmdbId}`, apiKey, { append_to_response: DETAIL_APPEND });
  if (!detail) return null;
  return mapDetailToMovie(detail);
}

/**
 * The one entry point everything else (`apiState.ts`, the poll/watchlist/
 * alert-rules routes) should call instead of importing `SEED_MOVIES`
 * directly. Cached, so a burst of requests (dashboard load + auto-poll
 * interval) only triggers one real fetch.
 */
export async function getMovies(): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return SEED_MOVIES;

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.movies;

  const movies = await fetchFromTmdb(apiKey);
  if (movies.length === 0) {
    // A transient TMDB failure (or a bad key) shouldn't blank the whole
    // dashboard — fall back to the demo catalogue rather than an empty list,
    // and don't cache the failure so the next request tries again.
    return SEED_MOVIES;
  }

  cache = { at: Date.now(), movies };
  return movies;
}
