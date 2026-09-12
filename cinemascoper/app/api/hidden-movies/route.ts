import { NextRequest, NextResponse } from "next/server";
import { withDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";

/** Hides a movie from the Release Radar and mutes notifications for it — also untracks it, since
 * "hide" and "watchlisted" are contradictory states. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const movieId: string | undefined = body?.movieId;
  if (!movieId) return NextResponse.json({ error: "movieId is required" }, { status: 400 });

  await withDB((db) => {
    if (!db.hiddenMovieIds.includes(movieId)) db.hiddenMovieIds.push(movieId);
    db.watchlist = db.watchlist.filter((w) => w.movieId !== movieId);
    db.alertRules = db.alertRules.filter((r) => !(r.type === "targeted" && r.movieId === movieId));
  });

  return NextResponse.json(await buildState());
}

/** Un-hides a movie (`?movieId=`). */
export async function DELETE(req: NextRequest) {
  const movieId = req.nextUrl.searchParams.get("movieId");
  if (!movieId) return NextResponse.json({ error: "movieId query param required" }, { status: 400 });

  await withDB((db) => {
    db.hiddenMovieIds = db.hiddenMovieIds.filter((id) => id !== movieId);
  });

  return NextResponse.json(await buildState());
}
