import { NextRequest, NextResponse } from "next/server";

/**
 * Optional whole-app login gate. This is a personal tracker with no
 * accounts and no auth on any of its API routes — fine on `localhost`,
 * where only you can reach it, but worth locking down once it's deployed
 * to a public URL. Set `APP_USERNAME` + `APP_PASSWORD` and every page and
 * API route (except `/api/poll`, which Vercel Cron needs to reach on its
 * own schedule — see that route's `CRON_SECRET` check instead) will prompt
 * for a browser login before doing anything. Leave both unset — the
 * default — and this does nothing.
 */
export function middleware(req: NextRequest) {
  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const [u, p] = atob(auth.slice("Basic ".length)).split(":");
      if (u === user && p === pass) {
        return NextResponse.next();
      }
    } catch {
      // fall through to the 401 below
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="CinemaScoper"' },
  });
}

export const config = {
  // Everything except /api/poll, which authenticates cron hits itself.
  matcher: ["/((?!api/poll).*)"],
};
