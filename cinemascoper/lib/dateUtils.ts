/** Small date helpers shared by API routes and UI. No external deps. */

export function isPast(iso: string, now: Date = new Date()): boolean {
  return new Date(iso).getTime() < now.getTime();
}

export function daysUntil(iso: string, now: Date = new Date()): number {
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Fri 18 Sep" — a compact day label for grouped lists (no year; pair with `monthYearLabel` when a
 * year/month boundary needs calling out). Accepts either a full ISO datetime or a bare "YYYY-MM-DD". */
export function formatDayLabel(dateKey: string): string {
  const d = new Date(dateKey.length <= 10 ? `${dateKey}T00:00:00` : dateKey);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

/** "September 2026" — used as a signpost row whenever a grouped-by-date list crosses into a new
 * month or year, so a long list still reads clearly without repeating the year on every row. */
export function monthYearLabel(dateKey: string): string {
  const d = new Date(dateKey.length <= 10 ? `${dateKey}T00:00:00` : dateKey);
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

/** "7:45 pm" — just the time-of-day, for rows that already show their date via a group header. */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { hour: "numeric", minute: "2-digit" });
}

// A session more than this many days after its movie's own release date
// reads as a re-release / revival screening rather than "new" — e.g. the
// Ritz's 70mm seasons, or an old catalogue title Golden Age puts back on.
//
// Deliberately generous (well over a year) rather than tuned to a normal
// theatrical run's length: Connor reported the previous, much shorter
// threshold (90 days, ~3 months) was wrongly flagging brand-new sessions of
// a movie still in its ordinary cinematic run — a slow-rollout awards-season
// film, or just a long-legs word-of-mouth hit, can easily still be selling
// tickets 4-6 months after release without that being a "re-release" in any
// meaningful sense. Connor's own framing was "screenings of movies released
// years ago" — so this is set comfortably past a year, not tuned to the
// shortest gap that would ever look wrong.
const RE_RELEASE_THRESHOLD_DAYS = 450;

/** Whether a session at `sessionStartsAtIso` reads as a re-release of `releaseDate` rather than
 * part of the film's original theatrical run. Connor asked to drop the re-release feature from the
 * UI entirely ("too hard" to get right — a placeholder with no TMDB match always reads as a
 * re-release here, which doesn't distinguish a genuine revival screening from just an unmatched
 * title), so as of that change nothing in the UI reads this anymore — kept computed (same precedent
 * as `isReleaseDay` below) rather than torn out, since `JoinedSession.isReRelease` staying in the
 * shape is harmless and someone building a better version of this later has the field ready to use.
 * A blank `releaseDate` (unknown — e.g. a scraper-discovered title with no TMDB match) counts as a
 * re-release too, since it's clearly not a freshly-tracked upcoming release. */
export function isReRelease(releaseDate: string, sessionStartsAtIso: string): boolean {
  if (!releaseDate) return true;
  const releaseMs = new Date(`${releaseDate}T00:00:00`).getTime();
  const sessionMs = new Date(sessionStartsAtIso).getTime();
  if (Number.isNaN(releaseMs) || Number.isNaN(sessionMs)) return false;
  return (sessionMs - releaseMs) / 86_400_000 > RE_RELEASE_THRESHOLD_DAYS;
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 1) return "just now";
  if (Math.abs(diffMin) < 60) return diffMin > 0 ? `in ${diffMin}m` : `${Math.abs(diffMin)}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return diffHr > 0 ? `in ${diffHr}h` : `${Math.abs(diffHr)}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return diffDay > 0 ? `in ${diffDay}d` : `${Math.abs(diffDay)}d ago`;
}
