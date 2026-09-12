/**
 * A handful of the real cinema integrations return session times as plain
 * Australian wall-clock strings with no UTC offset (e.g. "8:40 PM" on
 * "13 Sep") rather than an ISO datetime — this project has no date
 * library, so this is a small hand-rolled "what UTC instant is this
 * Sydney wall-clock time" converter, correct across the AEST/AEDT
 * daylight-saving switchover without hardcoding either offset or the
 * switchover dates.
 */
const SYDNEY_TZ = "Australia/Sydney";

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function monthIndexFromAbbrev(abbrev: string): number | undefined {
  return MONTHS[abbrev.slice(0, 3).toLowerCase()];
}

/**
 * `year`/`month` (0-11)/`day`/`hour` (0-23)/`minute` describe a wall-clock
 * moment *as read on a clock in Sydney* — returns the `Date` (a UTC
 * instant) that actually corresponds to it.
 */
export function sydneyWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Treat the wall-clock numbers as if they were already UTC to get a
  // starting instant within a few hours of the truth, then measure how far
  // off that guess actually lands in Sydney and correct for the gap. Two
  // passes handle the (rare) case where the correction itself crosses a
  // DST boundary.
  let guess = Date.UTC(year, month, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: SYDNEY_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const hourPart = get("hour") % 24; // Intl can render midnight as "24"
    const sydneyReading = Date.UTC(get("year"), get("month") - 1, get("day"), hourPart, get("minute"));
    const desired = Date.UTC(year, month, day, hour, minute);
    const diff = desired - sydneyReading;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Today's calendar date *as read on a clock in Sydney* — used as the
 * anchor for "day offset" style scrapers (e.g. "day tab 2 of the picker
 * means today+2"), since naively adding days to a UTC instant and reading
 * its UTC calendar fields back can land on the wrong Sydney day (Sydney
 * is far enough ahead of UTC that its calendar date has often already
 * rolled over for most of the UTC day). */
export function sydneyTodayParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

const ISO_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Parses an ISO-shaped "YYYY-MM-DDTHH:mm[:ss[.sss]]" string that has *no*
 * timezone offset — several of the real cinema APIs return exactly this
 * (their own Sydney wall-clock time, serialized without a "Z" or offset) —
 * and returns the UTC instant it actually refers to. Returns `null` if the
 * string doesn't match that shape.
 *
 * Deliberately not `new Date(thatString)`: JavaScript treats an offset-less
 * date-time string as being in the *runtime's own* local timezone, not
 * Sydney's — and a Vercel/serverless function's local timezone is UTC, so
 * `new Date("2026-09-12T10:45:00")` silently produces 10:45am UTC (i.e.
 * 8:45pm or 9:45pm Sydney, depending on daylight saving) instead of the
 * intended 10:45am Sydney. This was a real bug in this project (Hoyts and
 * Event Cinemas session times were off by the Sydney/UTC offset) before
 * being routed through this instead.
 */
export function sydneyIsoWallClockToUtc(isoLike: string): Date | null {
  const m = isoLike.match(ISO_LOCAL_RE);
  if (!m) return null;
  const [, year, month, day, hour, minute] = m;
  return sydneyWallClockToUtc(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

/** The calendar date *as read on a clock in Sydney* for a UTC instant, as a
 * sortable "YYYY-MM-DD" key — used to group sessions by day for display
 * (notification digests, the cinema/date breakdown in the Watchlist and
 * Session Times tabs) without re-deriving Sydney's date from a raw UTC
 * instant by hand at every call site. */
export function sydneyDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Infers the year for a "D Mon" (or similar) date with no year given,
 * assuming it's meant to be soon (never more than ~2 months in the past
 * relative to `now` — handles the December/January rollover). */
export function inferYear(month: number, day: number, now: Date): number {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day));
  const twoMonthsMs = 62 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() < now.getTime() - twoMonthsMs) return now.getUTCFullYear() + 1;
  return now.getUTCFullYear();
}
