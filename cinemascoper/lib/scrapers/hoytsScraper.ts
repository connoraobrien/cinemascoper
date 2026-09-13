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
 * `typeId` maps onto our small `SessionFormat` enum only approximately —
 * Hoyts has more screen types (Xtremescreen, LUX, D-BOX, …) than we model.
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
  }
  // Not confirmed against a live Hoyts typeId (no example seen yet), but
  // several Hoyts venues do run 4DX and Dolby Cinema screens, so a
  // best-effort substring match is worth having rather than silently
  // folding them into plain "2D" — same caveat as ritzRandwickScraper's
  // mapFormat: treat a miss here as "not modelled yet", not as evidence the
  // format doesn't exist at this cinema.
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
