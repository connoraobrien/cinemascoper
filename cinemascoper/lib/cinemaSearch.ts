// Backs the cinema search in the "Add a cinema" form: given a provider and
// a free-text query, returns candidate venues with the `providerId` that
// provider's scraper needs — so adding a real cinema is "search for its
// name, pick it" rather than "go find and type in some internal code".
//
// Each lookup hits the provider's own public listing once per (cold)
// server instance and caches the result in memory for a while — these
// lists change rarely, and this is a low-traffic personal tool.

export interface CinemaSearchResult {
  providerId: string;
  name: string;
  suburb?: string;
  state?: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { at: number; data: CinemaSearchResult[] }>();

async function cached(key: string, fetcher: () => Promise<CinemaSearchResult[]>): Promise<CinemaSearchResult[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const data = await fetcher();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function fetchHoytsCinemas(): Promise<CinemaSearchResult[]> {
  return cached("hoyts", async () => {
    const res = await fetch("https://apim-aea.hoyts.com.au/cinemaapi-au-live/api/cinemas");
    if (!res.ok) return [];
    const cinemas: { id: string; name: string; suburb: string; state: string }[] = await res.json();
    // Assumes this `id` is the same code `/api/sessions/<id>` expects
    // (confirmed only that hoyts.com.au's own Broadway page calls
    // `/api/sessions/BROADW` — not specifically that "BROADW" is this
    // list's `id` for that same cinema, since a single-cinema-page load
    // doesn't itself call this listing endpoint to look that up). If a
    // cinema picked from search 404s when actually polled, this is the
    // assumption to check first.
    return cinemas.map((c) => ({ providerId: c.id, name: c.name, suburb: c.suburb, state: c.state }));
  });
}

async function fetchEventCinemas(): Promise<CinemaSearchResult[]> {
  return cached("event", async () => {
    const res = await fetch("https://www.eventcinemas.com.au/cinemas");
    if (!res.ok) return [];
    const html = await res.text();
    // Each venue is one `data-id="…" … data-name="…" … data-url="…"` anchor.
    const out: CinemaSearchResult[] = [];
    for (const m of html.matchAll(/<a class="eccheckbox"([^>]*)>/g)) {
      const attrs = m[1];
      const id = attrs.match(/data-id="([^"]+)"/)?.[1];
      const name = attrs.match(/data-name="([^"]+)"/)?.[1];
      if (id && name) out.push({ providerId: id, name });
    }
    return out;
  });
}

const DENDY_VENUES: CinemaSearchResult[] = [
  { providerId: "newtown", name: "Dendy Newtown", suburb: "Newtown", state: "NSW" },
  { providerId: "canberra", name: "Dendy Canberra", suburb: "Canberra", state: "ACT" },
  { providerId: "coorparoo", name: "Dendy Coorparoo", suburb: "Coorparoo", state: "QLD" },
  { providerId: "portside", name: "Dendy Portside", suburb: "Hamilton", state: "QLD" },
  { providerId: "southport", name: "Dendy Southport", suburb: "Southport", state: "QLD" },
];

async function fetchFlicksCinemas(): Promise<CinemaSearchResult[]> {
  return cached("flicks", async () => {
    const res = await fetch("https://www.flicks.com.au/sitemap-cinemas.xml/");
    if (!res.ok) return [];
    const xml = await res.text();
    const slugs = [...xml.matchAll(/<loc>https:\/\/www\.flicks\.com\.au\/cinema\/([^/]+)\/<\/loc>/g)].map((m) => m[1]);
    return slugs.map((slug) => ({
      providerId: slug,
      name: slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    }));
  });
}

function matches(query: string, result: CinemaSearchResult): boolean {
  const q = query.toLowerCase();
  return (
    result.name.toLowerCase().includes(q) ||
    (result.suburb ?? "").toLowerCase().includes(q) ||
    result.providerId.toLowerCase().includes(q)
  );
}

export async function searchCinemas(provider: string, query: string): Promise<CinemaSearchResult[]> {
  const q = query.trim();
  let all: CinemaSearchResult[];
  switch (provider) {
    case "hoyts":
      all = await fetchHoytsCinemas();
      break;
    case "event":
      all = await fetchEventCinemas();
      break;
    case "dendy":
      all = DENDY_VENUES;
      break;
    case "flicks":
      all = await fetchFlicksCinemas();
      break;
    default:
      return [];
  }
  if (!q) return all.slice(0, 25);
  return all.filter((c) => matches(q, c)).slice(0, 25);
}
