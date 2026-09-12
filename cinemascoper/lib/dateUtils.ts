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
