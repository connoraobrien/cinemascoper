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
- **Sessions** — organised as day → movie → cinema → times, rather than one
  flat list: pick a date, see what's showing that day, which of your
  cinemas it's at, and every session time there (each with its format,
  "Got tickets?" toggle, and a tickets button) underneath. Covers every
  upcoming session at your cinemas, not just what's on your watchlist
  (including special/revival screenings a cinema shows that never matched a
  tracked movie — see "Shadow movies" below), filterable by film, director,
  cinema (a real multi-select dropdown, not a row of chips), format (same),
  a date range, and time of day, with a one-tap "only my watchlist" toggle.
  An individual screening ahead of a movie's
  official release day is flagged as a "Preview".
- **Releases** (Release Radar) — browse upcoming releases (tiles, a
  date-grouped list, or a real month calendar — a busy day's "+N more" is
  clickable, opening every release for that day rather than cutting off at
  3; TBA titles sort to the bottom, not the top), filter by release type,
  "Mainstream only", or "New releases only" (on by default — hides an old
  title, however it entered the catalogue, so this stays what its own
  subtitle says: upcoming releases), search by title or director, tap a
  tile to preview its session times without committing to your watchlist,
  and search all of TMDB (by title or director, including already-released
  films) to add anything the discover window missed.
- **Watchlist** — every tracked movie's sessions, with ticket links and
  trailers, browsable day by day via tabs under each movie (click a day to
  see just that day's screenings) rather than one long stacked list; filter
  by cinema/date (with quick presets — today, this week, this weekend, next
  30 days) or by released/coming soon/TBA, and see at a glance (and filter
  by) which tracked movies actually have session times yet.
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
- A **"Run check now"** button (and a 5-minute client-side interval, guarded
  so an overlapping check can't fire while one's still running) triggers a
  real background check on demand; `vercel.json` wires the same endpoint to
  a real cron schedule if you deploy it.

### Shadow movies — sessions for titles CinemaScoper doesn't otherwise know

Every provider now fetches a cinema's whole current lineup rather than
asking about one movie at a time. When one of those lists a title that
doesn't match anything already known, the scraper doesn't give up on it
straight away: `resolveMovieForTitle` (`lib/scrapers/shadowMovies.ts`)
first tries a real, single-title TMDB search for that exact title — this
is what correctly identifies a normal, still-running release your Release
Radar's own narrow window just doesn't happen to cover (see "Movie data —
TMDB" above), so it gets its own real poster, synopsis, and release date
rather than being mistaken for something obscure. Only when TMDB genuinely
has nothing for a title — an old catalogue title with no TMDB listing at
all, a one-off special event like the Ritz's "Celluloid Dreams" 70mm
seasons, a community screening — does CinemaScoper fall back to a minimal
placeholder (a "shadow movie") so its sessions still show up in the
Sessions tab rather than being silently dropped. A placeholder has no real
poster/synopsis/release date, so it's deliberately left out of Release
Radar and the trackable-movie lists — it's for "what's actually on", not
for tracking. (There used to be a "new release vs. re-release" filter on
Sessions that leaned on this — a placeholder with no release date always
read as a re-release. Dropped: telling a genuine revival screening apart
from "TMDB just doesn't have a release date for this title" wasn't
reliable from scraped data alone, so `isReRelease` in `lib/dateUtils.ts`
is still computed but nothing in the UI reads it anymore.)

Every real cinema integration is still capped at whatever booking window
that venue's own site actually opens — typically about a week (Ritz,
Dendy) up to a couple of weeks (Event/IMAX, following whatever `Data.Dates`
that API itself offers). A special screening dated further out than that
genuinely won't appear yet; it'll surface once the venue's own booking
window reaches it, the same real limitation as any human checking that
venue's site today.

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
   tab → **Marketplace Database Storage** → search for and install
   **"Upstash for Redis"**, then connect/create an account and link it to
   this project. (Vercel's own native "KV" product was retired in December
   2024 — **Upstash for Redis** is the direct successor and the one to
   pick; a different-looking product called "Redis for Vercel"/Redis Cloud
   also shows up in the Marketplace and looks similar at a glance, but it
   hands you a plain connection string for the `redis` npm client instead
   of the REST API URL/token pair this app's `lib/kvStore.ts` actually
   expects — if you pick that one by mistake, the Storage banner in
   Settings will keep saying "local file" no matter what you set.) Once
   Upstash for Redis is connected, Vercel injects `KV_REST_API_URL` /
   `KV_REST_API_TOKEN` into the project automatically — `lib/store.ts`
   already knows to use them the moment they're present. Redeploy once
   (`npx vercel --prod` again) after adding it, and check the Storage
   banner in Settings actually flips from "local file" to confirm it
   worked.
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
| `event` | Any Event Cinemas venue, including IMAX Sydney (its own venue, not part of George Street) | `eventcinemas.com.au`'s own `GetSessions` JSON endpoint, requests queued globally across every tracked Event cinema (see below) |
| `dendy` | Newtown, Canberra, Coorparoo, Portside, Southport | Each venue's own `<subdomain>.dendy.com.au/graphql` — a `movies(type: "now-playing-and-coming-soon")` query for the whole lineup, then `showingsForDate` per movie |
| `golden-age` | Golden Age Cinema & Bar, Surry Hills (fixed, single venue) | `ourgoldenage.com.au/films/now-showing` for the whole lineup, then each film's own page + the "Ferve" ticketing widget API for its times |
| `ritz-randwick` | Ritz Randwick (fixed, single venue) | `ritzcinemas.com.au`'s own day-tabbed `/now-showing` listing (today, tomorrow, and the next 5 calendar days by weekday name) — every movie showing each day, with the day known from which URL was fetched |
| `flicks` | Any other Australian cinema | flicks.com.au's public per-day session pages — the universal fallback that makes "add any cinema" actually work for the ~400 AU cinemas that don't have a bespoke integration above |

A few of these lean on best-effort heuristics rather than something the
site states outright — chiefly matching a tracked movie to whatever title
string the venue itself uses (see `lib/scrapers/titleMatch.ts`) — each is
explained where it's implemented, and a miss just means "didn't find a
session" rather than a crash. Titles pulled straight out of raw HTML by
regex (Ritz, Golden Age, flicks — Hoyts/Event/Dendy come from clean JSON
APIs and don't need this) are run through `decodeHtmlText` in the same
file, which decodes any HTML entity the site's markup used for an
apostrophe/quote/dash (e.g. a raw `&#8217;` showing up as literal text
rather than the `'` it's meant to be) and folds "smart" typographic
punctuation down to plain ASCII, so a title like "Don't Look Back in
Anger" displays cleanly rather than with stray entity text in it. The Ritz Randwick scraper in particular used
to infer which calendar day a session fell on from where times "wrapped
around" in an undated list — a heuristic that turned out to genuinely
double sessions up and misattribute them to the wrong day whenever the real
ordering wasn't perfectly monotonic. It's since been rewritten to fetch
each day from that day's own explicit URL instead (see the doc comment on
`lib/scrapers/ritzRandwickScraper.ts`), which removes the inference
entirely rather than tuning it.

Event Cinemas' own `GetSessions` endpoint only opens bookings so far ahead
of time in the first place, but this scraper now follows however many dates
it actually offers (up to a generous cap) rather than an artificially tight
one — if IMAX/Event sessions still don't reach as far out as the venue's own
site shows, that's Event's own booking window, not a limit CinemaScoper is
imposing. Those date fetches happen in small batches (6 at a time, up to 2
retries) rather than firing every date at once, *and* — since several Event
cinemas are scraped in parallel (each tracked cinema is checked at the same
time, not one after another) and every Event venue is really the same
`eventcinemas.com.au` host underneath a different `cinemaId` — every Event
cinema's requests now also queue behind one another globally, so tracking
more than one Event venue doesn't multiply the burst hitting Event's own
servers at once. (This followed a real regression: a first attempt just at
bounding the burst *within* one cinema wasn't enough once more than one
Event cinema was scraped at the same time — Connor reported every Event
cinema, including IMAX Sydney, failing to load sessions at all after that
first fix, not just George Street trailing off short.) `fetchDay` also now
logs the actual HTTP status or error on a failed request rather than
swallowing it silently, so if sessions are still missing after this,
`[eventScraper]` lines in the deploy's logs will say why instead of nothing
at all.

**Formats** (`SessionFormat` in `lib/types.ts`) now cover 2D, 3D, IMAX,
VMAX, 4DX, Dolby Cinema, Gold Class, Subtitled, 70mm, and Extreme Screen.
VMAX used to fold into "IMAX" in `eventScraper.ts` (the closest fit at the
time) — it's now its own distinct value there, since it's a visually and
technically different large-format brand. 4DX and Dolby Cinema detection on
Hoyts/Ritz is a best-effort keyword match, not confirmed against a real
live example of either at those venues yet (no example seen in testing) —
worth a look after your first deploy if either of those runs at a cinema
you've added.

### Movie data — TMDB

Set a `TMDB_API_KEY` env var (locally in `.env.local`, or in Vercel's
**Settings → Environment Variables** for a deployment — see "Deploying so
it runs all the time" above) and `lib/movies.ts` fetches real upcoming AU
releases from TMDB instead of the invented `lib/seedMovies.ts` catalogue.
No key set is a supported mode too — it just falls back to the demo
catalogue, so local dev works with nothing configured.

What it fetches: TMDB's `discover/movie`, filtered to `region: "AU"` and
theatrical release types, spanning from two weeks ago (so a just-opened
film still shows) to about nine months out — using TMDB's region-scoped
`release_date.gte/lte` filters rather than its global `primary_release_date`
ones, so this is actually Australia's own release slate rather than
whatever's earliest in TMDB's entire catalogue — then one follow-up call
per movie for runtime, genre names, and its AU-specific release date.
Results are cached in memory for a few hours; a transient TMDB failure (or
an invalid key) falls back to the demo catalogue rather than showing an
empty Release Radar. Nothing downstream needed to change — every consumer
only depends on the `Movie` shape in `lib/types.ts`, and every scraper
matches sessions to a movie by title string (see
`lib/scrapers/titleMatch.ts`), not by any TMDB-specific id — so a
different provider is a `lib/movies.ts` swap away too.

> This bulk fetch is deliberately narrow — it's what fills Release Radar,
> and widening it to "cover more of a normal theatrical run" was tried and
> reverted after it flooded Release Radar with old titles (see the
> "Shadow movies" section below for the actual fix to the problem that was
> trying to solve). A cinema scraper that runs into a real, recently-
> released movie this narrow window doesn't cover does a separate,
> *targeted* single-title lookup instead — `findTmdbMovieByTitle`, also in
> this file — which doesn't affect what Release Radar shows in bulk at
> all.

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
(more of them the more cinemas/watchlist movies you have) — cinemas are now
checked **in parallel** (`Promise.all` in `lib/pollEngine.ts`'s
`scrapeAllCinemas`, rather than one at a time as before) to keep an
ordinary tick fast, which still comfortably fits inside Vercel's current
Hobby function duration (300s by default, as of writing). See "Keeping
polls from clobbering your in-app changes" below for how a tick's store
writes are structured to stay safe under this. Any other host just needs
something to hit that same URL on a schedule.

#### Keeping polls from clobbering your in-app changes

A poll tick used to run entirely inside one long database
read-modify-write (`withDB` in `lib/store.ts`): load the store once, spend
however long the whole scrape took, then save it back at the end. That's
fine when a "scrape" is instant, but once every cinema started making real
network calls, a tick could legitimately take several seconds to tens of
seconds — and anything done in the app during that window (adding to the
watchlist, marking tickets, adding a cinema) would get silently overwritten
the moment the poll's now-stale snapshot was finally saved back. That's the
mechanism behind "my progress just disappears" if you've seen it.

Fixed by splitting a tick into two pieces (`app/api/poll/route.ts` +
`lib/pollEngine.ts`): `scrapeAllCinemas` only *reads* a snapshot of the
store and makes the real network calls — no database write held open for
any of it — and then a short, separate `commitPollResults` call re-reads
the *current* store and writes the results in, fast. That shrinks the
"something could get overwritten" window from the whole scrape down to one
quick read-modify-write, which is what actually stops changes from being
lost. The client-side auto-poll interval also now refuses to start a
second tick while one's still in flight (see `pollingRef` in
`app/page.tsx`), on top of being widened from 45 seconds to 5 minutes —
both aimed at the same problem from the browser side.

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
