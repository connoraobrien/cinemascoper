import { NextRequest, NextResponse } from "next/server";
import { withDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";

/** Marks a session "I've got tickets" — backs the My Tickets tab (see `myTickets` in
 * lib/apiState.ts). Idempotent: booking the same session twice is a no-op. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string | undefined = body?.sessionId;
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

  await withDB((db) => {
    if (!db.purchasedSessionIds.includes(sessionId)) db.purchasedSessionIds.push(sessionId);
  });

  return NextResponse.json(await buildState());
}

/** Un-marks a session (`?sessionId=`) — "I don't have tickets to this any more". */
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId query param required" }, { status: 400 });

  await withDB((db) => {
    db.purchasedSessionIds = db.purchasedSessionIds.filter((id) => id !== sessionId);
  });

  return NextResponse.json(await buildState());
}
