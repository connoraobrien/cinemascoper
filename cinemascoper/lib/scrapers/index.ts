import { CinemaProvider } from "../types";
import { CinemaScraper } from "./types";
import { mockScraper } from "./mockScraper";
import { hoytsScraper } from "./hoytsScraper";
import { eventScraper } from "./eventScraper";
import { dendyScraper } from "./dendyScraper";
import { goldenAgeScraper } from "./goldenAgeScraper";
import { ritzRandwickScraper } from "./ritzRandwickScraper";
import { flicksScraper } from "./flicksScraper";

/**
 * Provider -> scraper registry. `flicks` (flicks.com.au) is the universal
 * fallback that makes "add any cinema" work for venues without one of the
 * bespoke integrations — see each scraper's own doc comment for exactly
 * which real, unauthenticated endpoint it calls.
 */
const registry: Record<CinemaProvider, CinemaScraper> = {
  hoyts: hoytsScraper,
  event: eventScraper,
  dendy: dendyScraper,
  "golden-age": goldenAgeScraper,
  "ritz-randwick": ritzRandwickScraper,
  flicks: flicksScraper,
  mock: mockScraper,
};

export function getScraperForProvider(provider: CinemaProvider): CinemaScraper {
  return registry[provider] ?? mockScraper;
}
