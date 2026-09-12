import { NextRequest, NextResponse } from "next/server";
import { withDB, readDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";
import { getAllKnownMovies } from "@/lib/allMovies";
import { makeId } from "@/lib/ids";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cinemaId: string | undefined = body?.cinemaId;
  const type: string | undefined = body?.type;
  const movieId: string | undefined = body?.movieId;

  if (type !== "blanket" && type !== "targeted") {
    return NextResponse.json({ error: "type must be 'blanket' or 'targeted'" }, { status: 400 });
  }
  if (type === "targeted" && (!movieId || !(await getAllKnownMovies(await readDB())).some((m) => m.id === movieId))) {
    return NextResponse.json({ error: "targeted rules require a known movieId" }, { status: 400 });
  }

  const result = await withDB((db) => {
    if (!cinemaId || !db.cinemas.some((c) => c.id === cinemaId)) {
      return { error: "Unknown cinemaId" as const };
    }
    const duplicate = db.alertRules.some(
      (r) => r.cinemaId === cinemaId && r.type === type && (type === "blanket" || r.movieId === movieId)
    );
    if (!duplicate) {
      db.alertRules.push({
        id: makeId("ar"),
        cinemaId,
        type,
        movieId: type === "targeted" ? movieId : undefined,
        createdAt: new Date().toISOString(),
      });
    }
    return { error: null };
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(await buildState());
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  await withDB((db) => {
    db.alertRules = db.alertRules.filter((r) => r.id !== id);
  });

  return NextResponse.json(await buildState());
}
