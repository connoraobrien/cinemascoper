import { Session } from "../types";
import { makeId } from "../ids";
import { CinemaScraper } from "./types";
import { slugifyTitle } from "./titleMatch";
import { inferYear, monthIndexFromAbbrev, sydneyWallClockToUtc } from "./sydneyTime";

/**
 * Golden Age Cinema & Bar (ourgoldenage.com.au — a single venue, so
 * `Cinema.providerId` is unused). Two-step, both genuinely public with no
 * auth/cookies:
 *
 *  1. Each film's own page, `https://www.ourgoldenage.com.au/film/<slug>`,
 *     embeds `"ferveID":"<hash>"` somewhere in its page data — the id
 *     Golden Age's ticketing widget ("Ferve") uses for that title. The
 *     regex below tolerates it showing up either as plain JSON or
 *     backslash-escaped (it's nested inside a serialized string in the
 *     page's own script payload).
 *  2. `GET https://tix.ourgoldenage.com.au/api/v1/Items/DatesCached?itemHash=<hash>&app=false`
 *     returns `{ SuccessMessages: [htmlFragment] }` — a legacy
 *     widget-renders-HTML-into-JSON API rather than clean structured
 *     data. The fragment has one row per session with the date/time as
 *     plain text, e.g. "Sun 13 Sep 8:40 PM to 10:10 PM" (no year — see
 *     `inferYear`).
 */

// Ticket links: each session's "buy" control on the real site is a
// `javascript:ferve.pricing.returnEventPricing('<hash>')` call that opens
// an in-page pricing modal, not a plain navigable URL — confirmed live,
// and there's no separate session-specific page to link to instead. So the
// ticket link here is the film's own page, which has that same widget
// embedded and ready to click through, rather than guessing at a fake
// session-specific deep link that doesn't actually exist.
const BASE_URL = "https://www.ourgoldenage.com.au";
const FERVE_ID_RE = /ferveID[\\"]*:[\\"]*([0-9a-f]{16,40})/i;
const DATE_TIME_RE = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;

async function findFerveId(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/film/${slug}`);
    if (!res.ok) return null;
    const html = await res.text();
    return html.match(FERVE_ID_RE)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function fetchDateTimeStrings(ferveId: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://tix.ourgoldenage.com.au/api/v1/Items/DatesCached?itemHash=${encodeURIComponent(ferveId)}&app=false`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const fragment: string | undefined = json?.SuccessMessages?.[0];
    if (!fragment) return [];
    const rows = [...fragment.matchAll(/<div class="ft_ed_dateTime">([\s\S]*?)<\/div>/g)];
    return rows.map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  } catch {
    return [];
  }
}

export const goldenAgeScraper: CinemaScraper = {
  name: "Golden Age Cinema & Bar (ourgoldenage.com.au)",

  async discoverNewSessions({ cinema, candidateMovies, existingSessions, now }) {
    const discovered: Session[] = [];

    for (const movie of candidateMovies) {
      const slug = slugifyTitle(movie.title);
      const ferveId = await findFerveId(slug);
      if (!ferveId) continue;

      const rows = await fetchDateTimeStrings(ferveId);
      for (const row of rows) {
        const m = row.match(DATE_TIME_RE);
        if (!m) continue;
        const day = Number(m[1]);
        const month = monthIndexFromAbbrev(m[2]);
        if (month === undefined) continue;
        let hour = Number(m[3]) % 12;
        if (m[5].toLowerCase() === "pm") hour += 12;
        const minute = Number(m[4]);
        const year = inferYear(month, day, now);

        const startsAt = sydneyWallClockToUtc(year, month, day, hour, minute);
        if (startsAt.getTime() < now.getTime()) continue;
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
          format: "2D",
          publishedAt: now.toISOString(),
          ticketUrl: `${BASE_URL}/film/${slug}`,
        });
      }
    }

    return discovered;
  },
};
