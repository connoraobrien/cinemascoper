"use client";

import { JoinedSession } from "@/lib/clientTypes";
import { formatDayLabel, formatTimeOfDay, monthYearLabel } from "@/lib/dateUtils";
import { sydneyDateKey } from "@/lib/scrapers/sydneyTime";
import { EmptyState } from "./ui";
import { TicketIcon } from "./Icons";

/** Groups sessions by their Sydney calendar day (ascending), each day's sessions sorted by time —
 * "show all of the sessions on each day, and note what cinema they're at and in what format". */
export function groupSessionsByDate(sessions: JoinedSession[]): { dateKey: string; sessions: JoinedSession[] }[] {
  const groups = new Map<string, JoinedSession[]>();
  for (const s of sessions) {
    const key = sydneyDateKey(new Date(s.startsAt));
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, list]) => ({ dateKey, sessions: [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) }));
}

/**
 * The one shared "session times, organised by date, noting cinema and
 * format" view — used in the Release Radar preview panel, the Watchlist
 * movie detail, and the Session Times tab, so all three read consistently.
 * `showMovieTitle` turns on a per-row title (for a multi-movie list, e.g.
 * the Session Times tab); otherwise a row just shows cinema/time/format.
 */
export function SessionList({
  sessions,
  showMovieTitle = false,
  emptyHint = "No session times published yet.",
}: {
  sessions: JoinedSession[];
  showMovieTitle?: boolean;
  emptyHint?: string;
}) {
  const grouped = groupSessionsByDate(sessions);

  if (grouped.length === 0) {
    return <EmptyState title={emptyHint} />;
  }

  let lastMonthYear = "";

  return (
    <div className="flex flex-col gap-4">
      {grouped.map((group) => {
        const monthYear = monthYearLabel(group.dateKey);
        const showMonthYear = monthYear !== lastMonthYear;
        lastMonthYear = monthYear;

        return (
          <div key={group.dateKey}>
            {showMonthYear && (
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-600">{monthYear}</p>
            )}
            <p className="mb-1.5 text-xs font-medium text-base-400">{formatDayLabel(group.dateKey)}</p>
            <ul className="flex flex-col gap-1.5">
              {group.sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-800 bg-base-850 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 text-base-200">
                    <span className="font-medium text-base-100">{formatTimeOfDay(s.startsAt)}</span>
                    <span className="text-base-500">&middot;</span>
                    {showMovieTitle && <span className="text-base-200">{s.movieTitle}</span>}
                    <span className="text-base-300">{s.cinemaName}</span>
                    <span className="rounded-full border border-base-700 bg-base-900 px-1.5 py-0.5 text-[11px] text-base-400">
                      {s.format}
                    </span>
                  </div>
                  {s.ticketUrl && (
                    <a
                      href={s.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-accent-dim/50 bg-accent-soft px-2 py-1 text-xs font-medium text-accent hover:border-accent-dim"
                    >
                      <TicketIcon className="h-3.5 w-3.5" /> Tickets
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
