"use client";

import { JoinedSession } from "@/lib/clientTypes";
import { formatDayLabel, formatTimeOfDay, monthYearLabel } from "@/lib/dateUtils";
import { sydneyDateKey } from "@/lib/scrapers/sydneyTime";
import { EmptyState } from "./ui";
import { CheckIcon, EyeOffIcon, TicketIcon } from "./Icons";

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
 * One session's row — the innermost bit of markup shared by `SessionList`
 * (below) and the Watchlist's day-tabbed view (`DayTabbedSessionList` in
 * `WatchlistTab.tsx`), which needed the same row but without the date
 * grouping/heading `SessionList` normally wraps it in (the day is already
 * established by whichever tab is selected there).
 */
function SessionRow({
  session: s,
  showMovieTitle,
  onTogglePurchased,
  onHideMovie,
}: {
  session: JoinedSession;
  showMovieTitle: boolean;
  onTogglePurchased?: (sessionId: string) => void;
  onHideMovie?: (movieId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-800 bg-base-850 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-base-200">
        <span className="font-medium text-base-100">{formatTimeOfDay(s.startsAt)}</span>
        <span className="text-base-500">&middot;</span>
        {showMovieTitle && (
          <span className="inline-flex items-center gap-1 text-base-200">
            {s.movieTitle}
            {onHideMovie && (
              <button
                onClick={() => onHideMovie(s.movieId)}
                title="Hide this movie — you've seen it, or you're not interested"
                className="text-base-600 hover:text-base-300"
              >
                <EyeOffIcon className="h-3 w-3" />
              </button>
            )}
          </span>
        )}
        <span className="text-base-300">{s.cinemaName}</span>
        <span className="rounded-full border border-base-700 bg-base-900 px-1.5 py-0.5 text-[11px] text-base-400">
          {s.format}
        </span>
        {s.isPreview && (
          <span
            title="Screening ahead of this film's official release day — a sneak preview"
            className="rounded-full border border-violet-700/40 bg-violet-950/40 px-1.5 py-0.5 text-[11px] font-medium text-violet-300"
          >
            Preview
          </span>
        )}
        {s.isReRelease && (
          <span className="rounded-full border border-amber-700/40 bg-amber-950/40 px-1.5 py-0.5 text-[11px] text-amber-300">
            Re-release
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {onTogglePurchased && (
          <button
            onClick={() => onTogglePurchased(s.id)}
            title={s.ticketPurchased ? "You've got tickets — tap to undo" : "Mark that you've got tickets"}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              s.ticketPurchased
                ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
                : "border-base-700 text-base-400 hover:border-base-600 hover:text-base-100"
            }`}
          >
            {s.ticketPurchased ? <CheckIcon className="h-3.5 w-3.5" /> : <TicketIcon className="h-3.5 w-3.5" />}
            {s.ticketPurchased ? "Got tickets" : "Got tickets?"}
          </button>
        )}
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
      </div>
    </li>
  );
}

/** A plain `<ul>` of session rows, sorted by time, with none of `SessionList`'s date grouping —
 * exported for `WatchlistTab.tsx`'s day-tabbed view, which already shows one day at a time and
 * only needs the rows themselves. */
export function SessionRows({
  sessions,
  showMovieTitle = false,
  onTogglePurchased,
  onHideMovie,
}: {
  sessions: JoinedSession[];
  showMovieTitle?: boolean;
  onTogglePurchased?: (sessionId: string) => void;
  onHideMovie?: (movieId: string) => void;
}) {
  const sorted = [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          showMovieTitle={showMovieTitle}
          onTogglePurchased={onTogglePurchased}
          onHideMovie={onHideMovie}
        />
      ))}
    </ul>
  );
}

/**
 * The one shared "session times, organised by date, noting cinema and
 * format" view — used in the Release Radar preview panel, the Watchlist's
 * "All expanded" view, the Session Times tab, and My Tickets, so all four
 * read consistently. `showMovieTitle` turns on a per-row title (for a
 * multi-movie list, e.g. the Session Times tab); otherwise a row just shows
 * cinema/time/format. `onTogglePurchased`/`onHideMovie` are both optional —
 * pass them to turn on the "got tickets" toggle and per-row "seen it, hide"
 * action; omit either to leave that row control out entirely.
 */
export function SessionList({
  sessions,
  showMovieTitle = false,
  emptyHint = "No session times published yet.",
  onTogglePurchased,
  onHideMovie,
}: {
  sessions: JoinedSession[];
  showMovieTitle?: boolean;
  emptyHint?: string;
  onTogglePurchased?: (sessionId: string) => void;
  onHideMovie?: (movieId: string) => void;
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
            <SessionRows
              sessions={group.sessions}
              showMovieTitle={showMovieTitle}
              onTogglePurchased={onTogglePurchased}
              onHideMovie={onHideMovie}
            />
          </div>
        );
      })}
    </div>
  );
}
