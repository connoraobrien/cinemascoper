import { NextRequest, NextResponse } from "next/server";
import { withDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";
import { runPoll } from "@/lib/pollEngine";
import { getMovies } from "@/lib/movies";
import { seedDefaultsIfEmpty } from "@/lib/seedDefaults";

// GET has no request-derived inputs, so without this Next.js could statically
// render (and cache) the very first poll tick at build time instead of
// re-running it on every real cron hit. Force it dynamic.
export const dynamic = "force-dynamic";

/**
 * If you set a `CRON_SECRET` env var, Vercel Cron automatically sends it
 * back as `Authorization: Bearer <secret>` on every scheduled hit — so this
 * rejects anyone else who finds the URL and GETs it directly. Leave
 * `CRON_SECRET` unset (the default) and this is a no-op, which is fine for
 * local dev or a casual deploy.
 */
function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * The background check tick: calls out to each tracked cinema's real
 * provider (see `lib/scrapers/`). In production this is what
 * vercel.json's cron hits on a schedule (Vercel Cron sends a GET); the
 * dashboard also calls this on a client-side interval and via the manual
 * "Run check now" button, both as POST. Either verb runs the same tick.
 */
async function tick() {
  const allMovies = await getMovies();
  return withDB(async (db) => {
    seedDefaultsIfEmpty(db, allMovies);
    return runPoll(db, allMovies, new Date());
  });
}

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  const summary = await tick();
  return NextResponse.json({ summary, state: await buildState() });
}

export async function POST() {
  const summary = await tick();
  return NextResponse.json({ summary, state: await buildState() });
}
