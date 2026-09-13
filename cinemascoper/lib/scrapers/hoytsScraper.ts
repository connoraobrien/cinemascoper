import { Movie, Session, SessionFormat } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { titlesMatch } from "./titleMatch";
import { resolveMovieForTitle } from "./shadowMovies";

/**
 * Hoyts. Reverse-engineered from what hoyts.com.au's own cinema pages call
 * — both endpoints are genuinely public (no auth/API key, no cookies
 * required) even though they're not documented for third-party use:
 *
 *  - `GET https://apim-aea.hoyts.com.au/cinemaapi-au-live/api/movies`
 *    the whole current catalogue: `{ vistaId, name, ... }[]`. `vistaId`
 *    (e.g. "HO00010775") is what session objects call `movieId`.
 *  - `GET https://apim-aea.hoyts.com.au/cinemaapi-au-live/api/sessions/<code>`
 *    every upcoming session at one cinema (all dates in one response):
 *    `{ id, cinemaId, movieId, date, utcDate, typeId, screenName, ... }[]`.
 *    `date` is local (Australian) wall-clock time with no offset — don't
 *    `new Date()` it directly (see `sydneyIsoWallClockToUtc`'s doc comment
 *    for why that's wrong on a server). Use `utcDate` instead — a real ISO
 *    string with an explicit `+00:00` offset, confirmed via a live fetch —
 *    which `new Date()` parses correctly regardless of server timezone.
 *    `<code>` is the Hoyts cinema code (e.g. "BROADW" for Hoyts Broadway)
 *    — `Cinema.providerId`, resolved via `/api/cinemas` by the cinema
 *    search in the "Add a cinema" form rather than typed by hand (see
 *    `app/api/cinema-search/route.ts`).
 *  - Ticket links: `https://www.hoyts.com.au/orders/tickets?cinemaId=<code>&sessionId=<id>`
 *    — confirmed live against hoyts.com.au's own session-time buttons.
 *
 * `typeId` — live-checked across a spread of Hoyts venues (picked by
 * cross-referencing each venue's own advertised `features` from
 * `/api/cinemas` — IMAX, ONYX, D-BOX, APEX, SCREENX, Atmos venues each
 * checked directly) to find every real value actually in use, not just the
 * ones this scraper originally modelled: `STANDARD`, `LUX`, `XTREME`,
 * `IMAX`, `SCREENX`, `ONYX`, `DBOX`, `APEX`. The three originally missing —
 * `SCREENX`, `ONYX`, `APEX` — were silently falling through to plain "2D"
 * (`DBOX` too). No real `4DX` or `DOLBY` typeId turned up in this check
 * despite `features` listing "Atmos" at some venues — Atmos is a sound
 * format, not a distinct bookable screen type, so it doesn't show up in
 * `typeId` the way ONYX/APEX/SCREENX/DBOX do. Kept the old best-effort
 * `4DX`/`DOLBY` substring checks anyway in case a venue this check didn't
 * happen to cover uses either — a miss there means "not modelled yet", not
 * evidence the format doesn't exist at any Hoyts venue.
 */

const API_BASE = "https://apim-aea.hoyts.com.au/cinemaapi-au-live/api";

function mapFormat(typeId: string | undefined): SessionFormat {
  const s = (typeId ?? "").toUpperCase();
  switch (s) {
    case "XTREME":
      return "Extreme Screen"; // Hoyts' own large-format brand (Xtremescreen) — distinct from IMAX
    case "LUX":
      return "Gold Class";
    case "IMAX":
      return "IMAX";
    case "SCREENX":
      return "ScreenX"; // confirmed live — panoramic wraparound-screen format
    case "ONYX":
      return "Onyx"; // confirmed live — Samsung's LED cinema screen (no projector)
    case "APEX":
      return "Apex"; // confirmed live — Hoyts' newest ultra-premium format
    case "DBOX":
      return "D-BOX"; // confirmed live — motion seating, not strictly a screen format but real and distinct
  }
  // Not confirmed against a live Hoyts typeId (no example seen in the
  // venues checked), but several Hoyts venues do advertise 4DX and Dolby
  // Cinema screens, so a best-effort substring match is worth having rather
  // than silently folding them into plain "2D" — treat a miss here as "not
  // modelled yet", not as evidence the format doesn't exist at this cinema.
  if (s.includes("4DX")) return "4DX";
  if (s.includes("DOLBY")) return "Dolby Cinema";
  return "2D";
}

interface HoytsMovie {
  vistaId: string;
  name: string;
}

interface HoytsSession {
  id: number;
  cinemaId: string;
  movieId: string;
  date: string; // local wall-clock, no offset, e.g. "2026-09-12T10:45:00" — don't parse this one, see doc comment above
  utcDate: string; // real UTC, e.g. "2026-09-12T02:45:00+00:00" — use this instead
  typeId?: string;
  disabled?: boolean;
}

export const hoytsScraper: CinemaScraper = {
  name: "Hoyts (apim-aea.hoyts.com.au)",

  async discoverNewSessions({ cinema, allKnownMovies, existingSessions, now }) {
    if (!cinema.providerId) return { sessions: [], shadowMovies: [] };

    let movies: HoytsMovie[];
    let sessions: HoytsSession[];
    try {
      const [moviesRes, sessionsRes] = await Promise.all([
        fetch(`${API_BASE}/movies`),
        fetch(`${API_BASE}/sessions/${encodeURIComponent(cinema.providerId)}`),
      ]);
      if (!moviesRes.ok || !sessionsRes.ok) return { sessions: [], shadowMovies: [] };
      movies = await moviesRes.json();
      sessions = await sessionsRes.json();
    } catch (err) {
      console.error(`[hoytsScraper] fetch failed for ${cinema.name}:`, err);
      return { sessions: [], shadowMovies: [] };
    }

    const nameByVistaId = new Map(movies.map((m) => [m.vistaId, m.name]));
    const discovered: Session[] = [];
    const knownForMatch = [...allKnownMovies];
    const shadowMovies: Movie[] = [];

    for (const raw of sessions) {
      const hoytsTitle = nameByVistaId.get(raw.movieId);
      if (!hoytsTitle) continue;

      // Match against everything CinemaScoper knows about, not just this
      // tick's near-term candidates — an older, already-released title
      // Hoyts is re-screening is still "known" if it's in TMDB or was
      // manually added; a title that's merely unrecognised *here* still
      // gets a real, single-title TMDB lookup before falling through to a
      // shadow placeholder (see the doc comment on `resolveMovieForTitle`).
      let movie = knownForMatch.find((m) => titlesMatch(m.title, hoytsTitle));
      if (!movie) {
        movie = await resolveMovieForTitle(hoytsTitle, knownForMatch);
        if (!knownForMatch.some((m) => m.id === movie!.id)) {
          knownForMatch.push(movie);
          shadowMovies.push(movie);
        }
      }

      const startsAt = new Date(raw.utcDate);
      if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime()) continue;
      const startsAtIso = startsAt.toISOString();

      const alreadyKnown = [...existingSessions, ...discovered].some(
        (s) => s.movieId === movie!.id && s.cinemaId === cinema.id && s.startsAt === startsAtIso
      );
      if (alreadyKnown) continue;

      discovered.push({
        id: makeId("ss"),
        movieId: movie.id,
        cinemaId: cinema.id,
        startsAt: startsAtIso,
        format: mapFormat(raw.typeId),
        publishedAt: now.toISOString(),
        ticketUrl: `https://www.hoyts.com.au/orders/tickets?cinemaId=${encodeURIComponent(cinema.providerId)}&sessionId=${raw.id}`,
      });
    }

    return { sessions: discovered, shadowMovies };
  },
};
