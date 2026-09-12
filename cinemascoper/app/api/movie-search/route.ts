import { NextRequest, NextResponse } from "next/server";
import { searchTmdbMovies } from "@/lib/movies";

// Backs the "search all of TMDB" box (Watchlist tab) — finds a film
// regardless of whether it falls inside the normal discover window (an
// old title, an obscure re-release, anything not yet locked into a wide
// AU release). Lightweight: no detail call per result, just enough to
// show a picker — see POST /api/movies for what happens once one is
// actually picked.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await searchTmdbMovies(q);
  return NextResponse.json({ results });
}
