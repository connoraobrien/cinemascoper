import { NextRequest, NextResponse } from "next/server";
import { withDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";
import { makeId } from "@/lib/ids";
import { CinemaProvider } from "@/lib/types";

const PROVIDERS: CinemaProvider[] = ["hoyts", "event", "dendy", "golden-age", "ritz-randwick", "flicks", "mock"];
// Providers that need a real, non-empty providerId to do anything (the
// single-venue ones — golden-age, ritz-randwick — don't use it at all).
const NEEDS_PROVIDER_ID: CinemaProvider[] = ["hoyts", "event", "dendy", "flicks"];

/**
 * Cinemas are fully user-managed now (see the doc comment on `DB.cinemas`
 * in `lib/types.ts`) — this is the one CRUD surface for them. Adding one
 * both creates it *and* starts tracking it; there's no separate "add to
 * my cinemas from a catalogue" step any more.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name: string | undefined = body?.name?.trim();
  const city: string | undefined = body?.city?.trim();
  const suburb: string | undefined = body?.suburb?.trim();
  const provider: string | undefined = body?.provider;
  const providerId: string = body?.providerId?.trim() ?? "";

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!provider || !PROVIDERS.includes(provider as CinemaProvider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (NEEDS_PROVIDER_ID.includes(provider as CinemaProvider) && !providerId) {
    return NextResponse.json({ error: "This provider needs providerId" }, { status: 400 });
  }

  await withDB((db) => {
    db.cinemas.push({
      id: makeId("cn"),
      name,
      city: city ?? "",
      suburb: suburb ?? "",
      provider: provider as CinemaProvider,
      providerId,
      addedAt: new Date().toISOString(),
    });
  });

  return NextResponse.json(await buildState());
}

export async function DELETE(req: NextRequest) {
  const cinemaId = req.nextUrl.searchParams.get("cinemaId");
  if (!cinemaId) {
    return NextResponse.json({ error: "cinemaId query param required" }, { status: 400 });
  }

  await withDB((db) => {
    db.cinemas = db.cinemas.filter((c) => c.id !== cinemaId);
    // Nothing left for these to refer to once the cinema itself is gone.
    db.alertRules = db.alertRules.filter((r) => r.cinemaId !== cinemaId);

    const droppedSessionIds = new Set(db.sessions.filter((s) => s.cinemaId === cinemaId).map((s) => s.id));
    db.sessions = db.sessions.filter((s) => s.cinemaId !== cinemaId);

    // "new-session" notifications are digests that can span several
    // cinemas (see AppNotification's doc comment in lib/types.ts) — drop
    // just this cinema's sessions out of each one, and only remove the
    // notification entirely if that empties it. "release-date-change"
    // notifications aren't tied to a cinema at all.
    db.notifications = db.notifications
      .map((n) =>
        n.kind === "new-session" ? { ...n, sessionIds: n.sessionIds.filter((id) => !droppedSessionIds.has(id)) } : n
      )
      .filter((n) => n.kind !== "new-session" || n.sessionIds.length > 0);
  });

  return NextResponse.json(await buildState());
}
