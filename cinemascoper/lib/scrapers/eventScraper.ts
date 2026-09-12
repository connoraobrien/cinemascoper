import { Session, SessionFormat } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { titlesMatch } from "./titleMatch";
import { sydneyIsoWallClockToUtc } from "./sydneyTime";

/**
 * Event Cinemas (this also covers IMAX Sydney — it's its own Event
 * Cinemas venue, distinct from Event George Street, with its own
 * cinemaId). Reverse-engineered from what eventcinemas.com.au's own
 * cinema pages call — genuinely public, no auth/cookies required:
 *
 *  - `GET https://www.eventcinemas.com.au/Cinemas/GetSessions?cinemaIds=<id>[&date=YYYY-MM-DD]`
 *    without `&date`, returns *today's* sessions and a `Data.Dates`
 *    array of every date it'll return more sessions for if asked
 *    (typically the next couple of weeks); with `&date=`, that day's
 *    sessions. So getting a real look-ahead means one call per date, up
 *    to `MAX_DATES_PER_POLL` below — kept modest to stay well inside a
 *    serverless function's time budget on a single poll tick.
 *  - Shape: `Data.Movies[].Name` for the title, and each movie's
 *    `CinemaModels[]` (one per requested cinemaId) carries `.Sessions[]`:
 *    `{ Id, MovieId, CinemaId, StartTime, ScreenType, ScreenTypeName,
 *    BookingUrl }`. `StartTime` (e.g. "2026-09-12T16:30", confirmed via a
 *    live fetch) is local wall-clock with no offset and no seconds — don't
 *    `new Date()` it directly (see `sydneyIsoWallClockToUtc`'s doc comment
 *    for why that silently gives the wrong instant on a server). `BookingUrl`
 *    is a ready-made ticket link straight from the API — used as-is rather
 *    than hand-building one.
 *
 * `<id>` (e.g. "15" for George Street, "96" for IMAX Sydney) is
 * `Cinema.providerId` — resolved via the cinema search in the "Add a
 * cinema" form (see `app/api/cinema-search/route.ts`), not typed by hand.
 */

const MAX_DATES_PER_POLL = 10;

function mapFormat(screenTypeName: string | undefined): SessionFormat {
  const s = (screenTypeName ?? "").toLowerCase();
  if (s.includes("imax")) return "IMAX";
  if (s.includes("gold")) return "Gold Class";
  if (s.includes("vmax")) return "IMAX"; // Event's own large-format brand — closest fit we model
  return "2D";
}

interface EventSession {
  Id: number;
  StartTime: string; // local wall-clock, no offset — see doc comment above
  ScreenType?: string;
  ScreenTypeName?: string;
  BookingUrl?: string;
}

interface EventCinemaModel {
  Id: number;
  Sessions: EventSession[];
}

interface EventMovie {
  Id: number;
  Name: string;
  CinemaModels: EventCinemaModel[];
}

interface GetSessionsResponse {
  Success: boolean;
  Data: {
    Movies: EventMovie[];
    Dates: string[];
    SelectedDate: string;
  };
}

async function fetchDay(cinemaId: string, date?: string): Promise<GetSessionsResponse | null> {
  try {
    const url = new URL("https://www.eventcinemas.com.au/Cinemas/GetSessions");
    url.searchParams.set("cinemaIds", cinemaId);
    if (date) url.searchParams.set("date", date);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const eventScraper: CinemaScraper = {
  name: "Event Cinemas (eventcinemas.com.au)",

  async discoverNewSessions({ cinema, candidateMovies, existingSessions, now }) {
    if (!cinema.providerId) return [];

    const first = await fetchDay(cinema.providerId);
    if (!first || !first.Success) return [];

    const dates = [first.Data.SelectedDate, ...first.Data.Dates.filter((d) => d !== first.Data.SelectedDate)].slice(
      0,
      MAX_DATES_PER_POLL
    );

    const responses = [first, ...(await Promise.all(dates.slice(1).map((d) => fetchDay(cinema.providerId, d))))];

    const discovered: Session[] = [];

    for (const day of responses) {
      if (!day || !day.Success) continue;

      for (const eventMovie of day.Data.Movies) {
        const movie = candidateMovies.find((m) => titlesMatch(m.title, eventMovie.Name));
        if (!movie) continue;

        const cinemaModel = eventMovie.CinemaModels.find((c) => String(c.Id) === cinema.providerId);
        if (!cinemaModel) continue;

        for (const raw of cinemaModel.Sessions) {
          const startsAt = sydneyIsoWallClockToUtc(raw.StartTime);
          if (!startsAt || startsAt.getTime() < now.getTime()) continue;
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
            format: mapFormat(raw.ScreenTypeName ?? raw.ScreenType),
            publishedAt: now.toISOString(),
            ticketUrl: raw.BookingUrl || `https://www.eventcinemas.com.au/orders/tickets#sessionId=${raw.Id}`,
          });
        }
      }
    }

    return discovered;
  },
};
