import { NextRequest, NextResponse } from "next/server";
import { withDB, readDB } from "@/lib/store";
import { buildState } from "@/lib/apiState";
import { scrapeAllCinemas, commitPollResults } from "@/lib/pollEngine";
import { getAllKnownMovies } from "@/lib/allMovies";
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
 *
 * Deliberately three separate store touches rather than one long one:
 *
 *  1. A short `withDB` call that seeds defaults if this is a brand-new,
 *     never-used DB (a no-op otherwise) — cheap, and committing it before
 *     scraping starts means step 2 always sees any just-seeded cinemas.
 *  2. The real scrape (`scrapeAllCinemas`), which can take real time (Ritz
 *     alone fetches 7 day pages, Event up to ~28), against a read-only
 *     snapshot — no store lock held for any of it.
 *  3. A fresh, short `withDB` call that re-reads the *current* store and
 *     commits the scrape results into it (`commitPollResults`).
 *
 * This is what actually fixes "my progress disappears": previously the
 * whole scrape ran inside one `withDB` call, holding a stale snapshot open
 * for the entire scrape and silently overwriting anything done in the app
 * in the meantime with that stale copy. See the doc comments on
 * `scrapeAllCinemas` / `commitPollResults` in `lib/pollEngine.ts` for the
 * full mechanism.
 */
async function tick() {
  const now = new Date();

  // Only touch the store for seeding when it's actually needed (a brand
  // new DB) — checked here against a plain read first, rather than always
  // running a short `withDB` call regardless, so an already-set-up install
  // (every real tick, forever, after the very first one) doesn't pay for
  // an extra unconditional KV round-trip that would always turn out to be
  // a no-op. `seedDefaultsIfEmpty` re-checks the same condition itself
  // once inside `withDB`, so a real race against another first-ever
  // request can't double-seed.
  const seedSnapshot = await readDB();
  if (seedSnapshot.watchlist.length === 0 && seedSnapshot.cinemas.length === 0) {
    const allMoviesForSeed = await getAllKnownMovies(seedSnapshot);
    await withDB((db) => {
      seedDefaultsIfEmpty(db, allMoviesForSeed);
    });
  }

  const scrapeSnapshot = await readDB();
  const allMovies = await getAllKnownMovies(scrapeSnapshot);
  const results = await scrapeAllCinemas(scrapeSnapshot, allMovies, now);

  return withDB((db) => commitPollResults(db, results, allMovies, now));
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
