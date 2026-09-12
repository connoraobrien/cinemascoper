import { NextRequest, NextResponse } from "next/server";
import { withDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";

/** Mark one notification read (`{ id }`) or everything read (`{ all: true }`). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  await withDB((db) => {
    if (body?.all) {
      db.notifications = db.notifications.map((n) => ({ ...n, read: true }));
    } else if (body?.id) {
      db.notifications = db.notifications.map((n) => (n.id === body.id ? { ...n, read: true } : n));
    }
  });

  return NextResponse.json(await buildState());
}
