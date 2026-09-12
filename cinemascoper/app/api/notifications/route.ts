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

/** Delete one notification (`?id=`) or every notification (`?all=true`). */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all") === "true";

  if (!id && !all) {
    return NextResponse.json({ error: "id or all=true query param required" }, { status: 400 });
  }

  await withDB((db) => {
    if (all) {
      db.notifications = [];
    } else if (id) {
      db.notifications = db.notifications.filter((n) => n.id !== id);
    }
  });

  return NextResponse.json(await buildState());
}
