import { Session, SessionFormat } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { titlesMatch } from "./titleMatch";

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
 *    `date` is already local (Australian) wall-clock time, no timezone
 *    math needed. `<code>` is the Hoyts cinema code (e.g. "BROADW" for
 *    Hoyts Broadway) — `Cinema.providerId`, resolved via `/api/cinemas`
 *    by the cinema search in the "Add a cinema" form rather than typed by
 *    hand (see `app/api/cinema-search/route.ts`).
 *
 * `typeId` maps onto our small `SessionFormat` enum only approximately —
 * Hoyts has more screen types (Xtremescreen, LUX, D-BOX, …) than we model.
 */

const API_BASE = "https://apim-aea.hoyts.com.au/cinemaapi-au-live/api";

function mapFormat(typeId: string | undefined): SessionFormat {
  switch (typeId) {
    case "XTREME":
      return "IMAX";
    case "LUX":
      return "Gold Class";
    default:
      return "2D";
  }
}

interface HoytsMovie {
  vistaId: string;
  name: string;
}

interface HoytsSession {
  id: number;
  cinemaId: string;
  movieId: string;
  date: string; // local wall-clock, no offset, e.g. "2026-09-12T10:45:00"
  typeId?: string;
  disabled?: boolean;
}

export const hoytsScraper: CinemaScraper = {
  name: "Hoyts (apim-aea.hoyts.com.au)",

  async discoverNewSessions({ cinema, candidateMovies, existingSessions, now }) {
    if (!cinema.providerId) return [];

    let movies: HoytsMovie[];
    let sessions: HoytsSession[];
    try {
      const [moviesRes, sessionsRes] = await Promise.all([
        fetch(`${API_BASE}/movies`),
        fetch(`${API_BASE}/sessions/${encodeURIComponent(cinema.providerId)}`),
      ]);
      if (!moviesRes.ok || !sessionsRes.ok) return [];
      movies = await moviesRes.json();
      sessions = await sessionsRes.json();
    } catch (err) {
      console.error(`[hoytsScraper] fetch failed for ${cinema.name}:`, err);
      return [];
    }

    const nameByVistaId = new Map(movies.map((m) => [m.vistaId, m.name]));
    const discovered: Session[] = [];

    for (const raw of sessions) {
      const hoytsTitle = nameByVistaId.get(raw.movieId);
      if (!hoytsTitle) continue;

      const movie = candidateMovies.find((m) => titlesMatch(m.title, hoytsTitle));
      if (!movie) continue;

      const startsAt = new Date(raw.date);
      if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime()) continue;
      const startsAtIso = startsAt.toISOString();

      const alreadyKnown = [...existingSessions, ...discovered].some(
        (s) => s.movieId === movie.id && s.cinemaId === cinema.id && s.startsAt === startsAtIso
      );
      if (alreadyKnown) continue;

      discovered.push({
        id: makeId("ss"),
        movieId: movie.id,
        cinemaId: cinema.id,
        startsAt: startsAtIso,
        format: mapFormat(raw.typeId),
        publishedAt: now.toISOString(),
      });
    }

    return discovered;
  },
};
