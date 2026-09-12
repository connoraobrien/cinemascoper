import { NextRequest, NextResponse } from "next/server";
import { withDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";
import { fetchTmdbMovieById } from "@/lib/movies";

/**
 * Adds one movie by its TMDB id to `db.manualMovies` (upserting if it's
 * already there) — the second step of the "search all of TMDB" flow after
 * GET /api/movie-search, and what lets an already-released film or a
 * re-release outside the normal discover window be tracked at all. This
 * only makes the movie *known* (selectable, pollable — see
 * `lib/allMovies.ts`); the client still calls POST /api/watchlist
 * afterwards to actually track it, same as any other movie.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tmdbId: number | undefined = body?.tmdbId;
  if (typeof tmdbId !== "number") {
    return NextResponse.json({ error: "tmdbId (number) is required" }, { status: 400 });
  }

  const fetched = await fetchTmdbMovieById(tmdbId);
  if (!fetched) {
    return NextResponse.json({ error: "Couldn't fetch that movie from TMDB" }, { status: 502 });
  }
  const movie = { ...fetched, source: "manual" as const };

  await withDB((db) => {
    db.manualMovies = [...db.manualMovies.filter((m) => m.id !== movie.id), movie];
    // Re-adding a movie is also how you'd "un-hide" it from search.
    db.hiddenMovieIds = db.hiddenMovieIds.filter((id) => id !== movie.id);
  });

  return NextResponse.json(await buildState());
}
