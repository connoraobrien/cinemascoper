# CinemaScoper

A lean, personal Australian cinema tracker: an upcoming-release radar, a
cinema/movie tracking matrix, and a session-time alert feed — built so you
never miss the moment a cinema you care about drops tickets for a movie
you're watching for.

**Session times are real.** Cinemas you add are checked against that
venue's own real, public session-times source (see "Cinema providers"
below) — Hoyts, Event Cinemas (including IMAX Sydney), Dendy, Golden Age
Cinema & Bar, Ritz Randwick, and effectively any other Australian cinema
via a flicks.com.au fallback. **Movie data is real too**, from TMDB, once
you set a `TMDB_API_KEY` env var (see "Movie data — TMDB" below) — without
one it falls back to an invented demo catalogue so the app still works out
of the box.

## Features

- **Alerts** — new session times for a tracked movie arrive as one digest
  per movie (which cinemas, which days — not one alert per screening) and
  release-date changes arrive as their own distinct alert kind; filter by
  kind, delete individual alerts or clear them all.
- **Sessions** — every upcoming session at your cinemas, not just what's on
  your watchlist (including special/revival screenings a cinema shows that
  never matched a tracked movie — see "Shadow movies" below), filterable by
  film, director, one-or-many cinemas, a date range, format, new-release vs.
  re-release, and time of day, with a one-tap "only my watchlist" toggle. A
  session on a film's actual release day is flagged so it's easy to spot.
- **Releases** (Release Radar) — browse upcoming releases (tiles, a
  date-grouped list, or a real month calendar; TBA titles sort to the
  bottom, not the top), filter by release type, "Mainstream only", or "New
  releases only" (hides old catalogue titles you've added), search by
  title or director, tap a tile to preview its session times without
  committing to your watchlist, and search all of TMDB (by title or
  director, including already-released films) to add anything the discover
  window missed.
- **Watchlist** — every tracked movie's sessions, organised by day and
  noting cinema + format, with ticket links and trailers; filter by
  cinema/date (with quick presets — today, this week, this weekend, next 30
  days) or by released/coming soon/TBA, and see at a glance (and filter by)
  which tracked movies actually have session times yet.
- **My Tickets** — a simple itinerary of sessions you've marked "Got
  tickets?" from anywhere in the app, distinct from just tracking a movie.
- Hide a movie you've already seen (or aren't interested in) from Release
  Radar or Watchlist — it also stops its alerts and drops it off the
  watchlist; unhide it again from Settings.
- **Settings** — add/remove cinemas, set **blanket** rules (alert on *any*
  new session at a cinema) or **targeted** rules (alert only for one
  watchlisted movie there), manage hidden movies, and a storage-backend
  banner that tells you straight away whether your data will actually
  persist (see "Deploying" below).
- A **"Run check now"** button (and a 45s client-side interval) triggers a
  real background check on demand; `vercel.json` wires the same endpoint to
  a real cron schedule if you deploy it.

### Shadow movies — sessions for titles CinemaScoper doesn't otherwise know

Three providers (Hoyts, Event Cinemas, flicks.com.au) fetch a cinema's whole
current lineup rather than asking about one movie at a time. When one of
those lists a title that doesn't match anything in the TMDB catalogue, the
watchlist, or a manually-added movie — an old catalogue title getting a
revival screening, a one-off special event like a 70mm season — CinemaScoper
auto-registers a minimal placeholder for it (see
`lib/scrapers/shadowMovies.ts`) so its sessions still show up in the
Sessions tab, rather than being silently dropped. These placeholders have no
real poster/synopsis/release date, so they're deliberately left out of
Release Radar and the trackable-movie lists — they're for "what's actually
on", not for tracking.

Ritz Randwick, Dendy and Golden Age Cinema & Bar don't have this: their
sites only expose a per-movie lookup (no "what's on today" listing to
reverse-engineer), so they can only ever report sessions for a movie
CinemaScoper already knows to ask about. A revival screening at one of
those three venues (the Ritz's "Celluloid Dreams" 70mm seasons, say) still
needs that title added — a manual "search all of TMDB and add" is the way
to make sure it's asked about.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The dashboard seeds itself with a handful
of Sydney/Melbourne cinemas and tracked movies on first load — add, remove,
and rewire everything from the Settings tab (the gear icon in the header).

## Deploying so it runs all the time

Running it locally only checks for new sessions while your laptop has the
app open. To have it actually monitor in the background — even when your
laptop's asleep — deploy it, so the schedule in `vercel.json` can hit
`/api/poll` on its own once a day, at 9:30am Sydney time (23:30 UTC) — after
Sydney IMAX session times tend to drop.

> **Heads up on daylight saving:** cron schedules run at a fixed UTC time,
> not a fixed *local* time, and Sydney's clocks shift for daylight saving
> (roughly October–April). So this runs at 9:30am while Sydney is on
> standard time (AEST, most of the year including right now) but drifts to
> 10:30am local during daylight saving (AEDT). If that hour matters to you,
> flip the schedule in `vercel.json` between `"30 23 * * *"` (AEST) and
> `"30 22 * * *"` (AEDT) around each clock change, and redeploy.
>
> Free (Hobby) Vercel accounts are limited to cron jobs that run at most
> once a day — this schedule already fits that.

These steps use **Vercel** (there's a generous free tier, and `vercel.json`
is already set up for it) and its CLI, so you don't need a GitHub account
or to touch git at all:

1. **Create a free account** at vercel.com if you don't have one.
2. From inside the `cinemascoper` folder in Terminal, run:
   ```bash
   npx vercel login
   npx vercel --prod
   ```
   The first command opens your browser to log in; the second uploads the
   folder and deploys it, printing a live URL when it's done.
3. **Add persistent storage.** Running on Vercel means the app runs as
   short-lived serverless functions rather than one long-running process,
   so the local `data/db.json` file this app uses for storage doesn't
   survive between requests there — you'd see cinemas/rules/alerts reset
   themselves. Fix: in the Vercel dashboard, open the project → **Storage**
   tab → **Create Database** → choose the KV (Redis) option → connect it to
   this project. Vercel wires up the right environment variables
   automatically; `lib/store.ts` already knows to use them the moment
   they're present. Redeploy once (`npx vercel --prod` again) after adding
   it.
4. **Add real movie data.** In the dashboard's **Settings → Environment
   Variables**, add `TMDB_API_KEY` with a key from
   [themoviedb.org](https://www.themoviedb.org/settings/api) (free to
   create). Redeploy after adding it — see "Movie data — TMDB" below for
   what this actually fetches. Skipping this step is fine too; the app
   just uses its invented demo catalogue instead.
5. **Optional but recommended — lock the app down.** Once deployed, the URL
   is reachable by anyone who has it (there's no login by default). In the
   dashboard's **Settings → Environment Variables**, you can add:
   - `APP_USERNAME` + `APP_PASSWORD` — any values you like. Every page and
     API route will then prompt for that login before doing anything.
   - `CRON_SECRET` — any random string. Vercel Cron automatically sends it
     back on scheduled hits to `/api/poll`, so that endpoint only accepts
     requests from your own cron, not from anyone who guesses the URL.
   Redeploy after adding either.

After that, the background check genuinely runs on a schedule, independent
of whether you (or your laptop) are anywhere near it — open the deployed
URL any time to see what it's found.

> This project was generated in a sandboxed build environment with no
> access to the npm registry (so `npm install` / `npm run build` couldn't be
> run there) and no outbound network access to arbitrary hosts (so the real
> cinema integrations below couldn't be exercised against the live sites
> from inside that sandbox either, though each one's exact endpoint and
> response shape *was* verified there via a real browser first, and is
> documented in that scraper's own file). The code was written and reviewed
> carefully — every file passed a TypeScript syntax check, and the
> data/matching/alert engine plus every scraper's pure parsing/date logic
> (title matching, Sydney timezone conversion, DST handling) was exercised
> directly with `tsx`, independent of Next.js — but please run `npm run
> build` yourself after installing, and keep an eye on the Sessions tab
> after your first real deploy, in case a cinema's site has changed
> since.

## Architecture

Everything under `lib/` is framework-agnostic (no React/Next imports), so
the hardest logic — the matching engine and every scraper — can be tested
with plain Node/`tsx`, independent of the app:

- `lib/types.ts` — the domain model (Movie, Cinema, Session, AlertRule,
  Notification, …). `Cinema` carries a `provider` (which real source it's
  scraped from) and a `providerId` (that source's own identifier for the
  venue) — see the doc comment there for what each provider expects.
- `lib/movies.ts` — real upcoming AU releases from TMDB when a
  `TMDB_API_KEY` env var is set (see "Movie data — TMDB" below); falls back
  to `lib/seedMovies.ts`'s invented demo catalogue otherwise, so the app
  works with nothing configured too. Everything else calls `getMovies()`
  from here rather than importing either source directly.
- `lib/store.ts` — a small store with two backends, chosen automatically: a
  JSON file (`data/db.json`) for local dev / any always-on host, or Vercel
  KV when its env vars are present (see "Deploying so it runs all the time"
  above). Everything else talks to the store only through `readDB()` /
  `withDB()`, so that's the only file a different backend would touch.
- `lib/scrapers/` — one real, working integration per provider (see
  "Cinema providers" below for what each one actually calls), behind a
  shared `CinemaScraper` interface and a registry keyed by provider
  (`lib/scrapers/index.ts`). `mockScraper.ts` (a simulated stand-in) is
  kept around for offline dev/demos, not used by any real cinema.
  `shadowMovies.ts` is the "unrecognised title from a cinema's own lineup"
  placeholder-movie logic (see "Shadow movies" above).
- `lib/cinemaSearch.ts` — backs the cinema search in the "Add a cinema"
  form (`app/api/cinema-search/route.ts`), so adding a real cinema is
  "search its name, pick it" rather than "go find some internal code".
- `lib/matching.ts` — decides which alert rules fire for a freshly
  discovered session (blanket vs. targeted).
- `lib/pollEngine.ts` — the actual background check: calls every cinema
  you've added out to its real provider, discovers new sessions, runs them
  through `matching.ts`, and records notifications.
- `lib/apiState.ts` — joins the store against the movie catalogue into the
  one payload the dashboard hydrates from.

The Next.js layer is a thin shell on top: `app/api/*/route.ts` are small
route handlers that call into `lib/`, and `app/page.tsx` + `components/*`
are the dashboard UI (Tailwind, dark mode only, no component library).

### Cinema providers

Each of these was reverse-engineered from what the venue's own website
calls behind the scenes — every endpoint below is genuinely public
(no login, API key, or cookies needed), even though none of them are
documented for third-party use, so a change on the cinema's side could
break one without notice. Each `lib/scrapers/*Scraper.ts` file has the
full details (exact endpoint, request/response shape, and any quirks) in
its own doc comment.

| Provider | Covers | How |
| --- | --- | --- |
| `hoyts` | Any Hoyts cinema | `apim-aea.hoyts.com.au`'s own JSON API |
| `event` | Any Event Cinemas venue, including IMAX Sydney (its own venue, not part of George Street) | `eventcinemas.com.au`'s own `GetSessions` JSON endpoint |
| `dendy` | Newtown, Canberra, Coorparoo, Portside, Southport | Each venue's own `<subdomain>.dendy.com.au/graphql` |
| `golden-age` | Golden Age Cinema & Bar, Surry Hills (fixed, single venue) | `ourgoldenage.com.au`'s "Ferve" ticketing widget API |
| `ritz-randwick` | Ritz Randwick (fixed, single venue) | Session times embedded directly in `ritzcinemas.com.au`'s own HTML |
| `flicks` | Any other Australian cinema | flicks.com.au's public per-day session pages — the universal fallback that makes "add any cinema" actually work for the ~400 AU cinemas that don't have a bespoke integration above |

A few of these lean on best-effort heuristics rather than something the
site states outright (matching a tracked movie to a title string the
venue uses; for Ritz Randwick, inferring which calendar day a session
falls on from where the times "wrap around" in an undated list) — each is
explained where it's implemented, and a miss just means "didn't find a
session" rather than a crash.

Event Cinemas' own `GetSessions` endpoint only opens bookings so far ahead
of time in the first place, but this scraper now follows however many dates
it actually offers (up to a generous cap) rather than an artificially tight
one — if IMAX/Event sessions still don't reach as far out as the venue's own
site shows, that's Event's own booking window, not a limit CinemaScoper is
imposing.

### Movie data — TMDB

Set a `TMDB_API_KEY` env var (locally in `.env.local`, or in Vercel's
**Settings → Environment Variables** for a deployment — see "Deploying so
it runs all the time" above) and `lib/movies.ts` fetches real upcoming AU
releases from TMDB instead of the invented `lib/seedMovies.ts` catalogue.
No key set is a supported mode too — it just falls back to the demo
catalogue, so local dev works with nothing configured.

What it fetches: TMDB's `discover/movie`, filtered to `region: "AU"` and
theatrical release types, spanning from two weeks ago (so a just-opened
film still shows) to about six months out — using TMDB's region-scoped
`release_date.gte/lte` filters rather than its global `primary_release_date`
ones, so this is actually Australia's own release slate rather than
whatever's earliest in TMDB's entire catalogue — then one follow-up call
per movie for runtime, genre names, and its AU-specific release date. Results
are cached in memory for a few hours; a transient TMDB failure (or an
invalid key) falls back to the demo catalogue rather than showing an empty
Release Radar. Nothing downstream needed to change — every consumer only
depends on the `Movie` shape in `lib/types.ts`, and every scraper matches
sessions to a movie by title string (see `lib/scrapers/titleMatch.ts`), not
by any TMDB-specific id — so a different provider is a `lib/movies.ts` swap
away too.

> This wiring hasn't been exercised against a real TMDB response — this
> sandbox has no outbound access to api.themoviedb.org either — so it's
> worth a look at the Release Radar after your first deploy with a key set,
> same as the cinema scrapers above.

### Adding a new cinema provider

Implement `CinemaScraper` (see `lib/scrapers/types.ts`) against the
venue's real site and register it in `lib/scrapers/index.ts` and the
`PROVIDER_OPTIONS` list in `components/SettingsTab.tsx` (plus
`lib/cinemaSearch.ts` if it should be searchable by name rather than a
fixed single venue). Nothing else needs to change.

### Scheduling & push notifications

`vercel.json` already points a cron at `/api/poll` once daily for a Vercel
deployment (see "Deploying so it runs all the time" above — free/Hobby
accounts cap cron jobs at once a day; a paid plan lifts that if you want
it checking more often). A poll now makes real network calls per cinema
(more of them the more cinemas/watchlist movies you have), but comfortably
fits inside Vercel's current Hobby function duration (300s by default, as
of writing) — cinemas are checked one at a time rather than in parallel,
gently, so this is unlikely to matter in practice. Any other host just
needs something to hit that same URL on a schedule.

This build is in-app notifications only (a badge + feed). To add browser
push, register a service worker and call the Web Push API from inside
`runPoll` in `lib/pollEngine.ts` wherever a notification is created.

## Tech stack

Next.js 14 (App Router) · React 18 · Tailwind CSS · TypeScript. No other
runtime dependencies — the JSON store, id generation, HTML/GraphQL
scraping and Sydney-timezone handling are all hand-rolled with plain
`fetch`, rather than pulling in a database, uuid, cheerio, GraphQL client
or date library for a single-user tool this small.

Pinned to `next@14.2.35`, the patched release for the [December 2025
Next.js security advisory](https://nextjs.org/blog/security-update-2025-12-11)
(anything before that on the 14.x line is vulnerable — `npm install` will
warn loudly if you ever drift back below it). Next 14's general support
window has since ended in favor of Next 16, so at some point it's worth
migrating; that's a bigger jump than this build needed for now.
