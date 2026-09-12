import { NextRequest, NextResponse } from "next/server";
import { withDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";
import { getMovies } from "@/lib/movies";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const movieId: string | undefined = body?.movieId;

  if (!movieId || !(await getMovies()).some((m) => m.id === movieId)) {
    return NextResponse.json({ error: "Unknown movieId" }, { status: 400 });
  }

  await withDB((db) => {
    if (!db.watchlist.some((w) => w.movieId === movieId)) {
      db.watchlist.push({ movieId, addedAt: new Date().toISOString() });
    }
  });

  return NextResponse.json(await buildState());
}

export async function DELETE(req: NextRequest) {
  const movieId = req.nextUrl.searchParams.get("movieId");
  if (!movieId) {
    return NextResponse.json({ error: "movieId query param required" }, { status: 400 });
  }

  await withDB((db) => {
    db.watchlist = db.watchlist.filter((w) => w.movieId !== movieId);
    // Dropping a movie also removes any targeted rules built around it —
    // otherwise you'd end up with an orphaned rule for a movie you're no
    // longer tracking.
    db.alertRules = db.alertRules.filter((r) => !(r.type === "targeted" && r.movieId === movieId));
  });

  return NextResponse.json(await buildState());
}
