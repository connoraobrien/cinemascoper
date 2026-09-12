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

/** Infers the year for a "D Mon" (or similar) date with no year given,
 * assuming it's meant to be soon (never more than ~2 months in the past
 * relative to `now` — handles the December/January rollover). */
export function inferYear(month: number, day: number, now: Date): number {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day));
  const twoMonthsMs = 62 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() < now.getTime() - twoMonthsMs) return now.getUTCFullYear() + 1;
  return now.getUTCFullYear();
}
