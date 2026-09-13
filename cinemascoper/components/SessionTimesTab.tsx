"use client";

import { useMemo, useState } from "react";
import { Cinema, JoinedSession, SessionFormat } from "@/lib/clientTypes";
import { SectionHeading, Chip, EmptyState } from "./ui";
import { SearchIcon, CheckIcon, EyeOffIcon, TicketIcon } from "./Icons";
import { groupSessionsByDate } from "./SessionList";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { sydneyTimeOfDayMinutes } from "@/lib/scrapers/sydneyTime";
import { formatDayLabel, formatTimeOfDay, monthYearLabel } from "@/lib/dateUtils";

function timeStringToMinutes(t: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** One bookable time slot — the innermost thing in the day → movie → cinema
 * hierarchy below. Shows the time, format badge, preview badge, a "got
 * tickets" toggle, and a tickets button, all in one compact pill —
 * everything a flat `SessionList` row showed, just nested one level deeper
 * now that cinema/movie are already established by the group it's in. */
function SessionTimeChip({
  session,
  onTogglePurchased,
}: {
  session: JoinedSession;
  onTogglePurchased: (sessionId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-base-800 bg-base-900 px-2.5 py-1.5 text-sm">
      <span className="font-medium text-base-100">{formatTimeOfDay(session.startsAt)}</span>
      <span className="rounded-full border border-base-700 bg-base-850 px-1.5 py-0.5 text-[11px] text-base-400">
        {session.format}
      </span>
      {session.isPreview && (
        <span
          title="Screening ahead of this film's official release day — a sneak preview"
          className="rounded-full border border-violet-700/40 bg-violet-950/40 px-1.5 py-0.5 text-[11px] font-medium text-violet-300"
        >
          Preview
        </span>
      )}
      <button
        onClick={() => onTogglePurchased(session.id)}
        title={session.ticketPurchased ? "You've got tickets — tap to undo" : "Mark that you've got tickets"}
        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
          session.ticketPurchased
            ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
            : "border-base-700 text-base-400 hover:border-base-600 hover:text-base-100"
        }`}
      >
        {session.ticketPurchased ? <CheckIcon className="h-3.5 w-3.5" /> : <TicketIcon className="h-3.5 w-3.5" />}
        {session.ticketPurchased ? "Got tickets" : "Got tickets?"}
      </button>
      {session.ticketUrl && (
        <a
          href={session.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-accent-dim/50 bg-accent-soft px-2 py-1 text-xs font-medium text-accent hover:border-accent-dim"
        >
          <TicketIcon className="h-3.5 w-3.5" /> Tickets
        </a>
      )}
    </div>
  );
}

/**
 * The Sessions tab's main view: day, then every movie showing that day,
 * then every cinema it's showing at, then that cinema's session times —
 * per Connor's ask, replacing what used to be one big flat list of times.
 * Built directly on `groupSessionsByDate` (the same day-grouping the old
 * flat `SessionList` used) so the two nested `Map`s below just add the
 * movie and cinema levels on top of it.
 */
function DayMovieCinemaSessionView({
  sessions,
  emptyHint,
  onTogglePurchased,
  onHideMovie,
}: {
  sessions: JoinedSession[];
  emptyHint: string;
  onTogglePurchased: (sessionId: string) => void;
  onHideMovie: (movieId: string) => void;
}) {
  const days = groupSessionsByDate(sessions);

  if (days.length === 0) {
    return <EmptyState title={emptyHint} />;
  }

  let lastMonthYear = "";

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => {
        const monthYear = monthYearLabel(day.dateKey);
        const showMonthYear = monthYear !== lastMonthYear;
        lastMonthYear = monthYear;

        // Movies showing that day, in first-seen order (sessions within a
        // day already come out time-ascending from groupSessionsByDate, so
        // this reads as "whichever film has the earliest session today
        // comes first") — then, within each movie, the cinemas it's on at
        // that day, same first-seen-order logic one level down.
        const movieOrder: string[] = [];
        const byMovie = new Map<string, JoinedSession[]>();
        for (const s of day.sessions) {
          if (!byMovie.has(s.movieId)) {
            movieOrder.push(s.movieId);
            byMovie.set(s.movieId, []);
          }
          byMovie.get(s.movieId)!.push(s);
        }

        return (
          <div key={day.dateKey}>
            {showMonthYear && (
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-600">{monthYear}</p>
            )}
            <p className="mb-2 text-xs font-medium text-base-400">{formatDayLabel(day.dateKey)}</p>
            <div className="flex flex-col gap-3">
              {movieOrder.map((movieId) => {
                const movieSessions = byMovie.get(movieId)!;
                const cinemaOrder: string[] = [];
                const byCinema = new Map<string, JoinedSession[]>();
                for (const s of movieSessions) {
                  if (!byCinema.has(s.cinemaId)) {
                    cinemaOrder.push(s.cinemaId);
                    byCinema.set(s.cinemaId, []);
                  }
                  byCinema.get(s.cinemaId)!.push(s);
                }

                return (
                  <div key={movieId} className="rounded-xl border border-base-800 bg-base-850 p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="font-medium text-base-100">{movieSessions[0].movieTitle}</span>
                      <button
                        onClick={() => onHideMovie(movieId)}
                        title="Hide this movie — you've seen it, or you're not interested"
                        className="text-base-600 hover:text-base-300"
                      >
                        <EyeOffIcon className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {cinemaOrder.map((cinemaId) => {
                        const cinemaSessions = byCinema.get(cinemaId)!;
                        return (
                          <div key={cinemaId}>
                            <p className="mb-1 text-xs text-base-400">{cinemaSessions[0].cinemaName}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {cinemaSessions.map((s) => (
                                <SessionTimeChip key={s.id} session={s} onTogglePurchased={onTogglePurchased} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Upcoming times at your cinemas" — every session at a cinema you're
 * tracking, filterable every way Connor asked for: cinema (a real
 * multi-select dropdown — see `MultiSelectDropdown` — rather than a row of
 * toggle chips, which got "chunky" once there were more than a few
 * cinemas), format (same dropdown treatment), film, director, date range,
 * and time of day — plus a one-tap "only films on my watchlist" toggle, so
 * the same tab covers both "what's on at my cinemas generally" and "what's
 * on for what I'm following", per Connor's ask. (Used to also have a
 * new-release-vs-re-release filter; Connor asked for that to be dropped —
 * see the doc comment on `isReRelease` in `lib/dateUtils.ts` for why the
 * underlying computation is still there, just unused.)
 */
export function SessionTimesTab({
  sessions,
  myCinemas,
  watchlistIds,
  onTogglePurchased,
  onHideMovie,
}: {
  sessions: JoinedSession[];
  myCinemas: Cinema[];
  watchlistIds: Set<string>;
  onTogglePurchased: (sessionId: string) => void;
  onHideMovie: (movieId: string) => void;
}) {
  const [titleFilter, setTitleFilter] = useState("");
  const [directorFilter, setDirectorFilter] = useState("");
  const [selectedCinemaIds, setSelectedCinemaIds] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<Set<SessionFormat>>(new Set());
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const availableFormats = useMemo(() => {
    const set = new Set<SessionFormat>();
    for (const s of sessions) set.add(s.format);
    return [...set].sort();
  }, [sessions]);

  const fromMinutes = timeStringToMinutes(fromTime);
  const toMinutes = timeStringToMinutes(toTime);

  const filtered = useMemo(() => {
    const q = titleFilter.trim().toLowerCase();
    const d = directorFilter.trim().toLowerCase();
    return sessions.filter((s) => {
      if (q && !s.movieTitle.toLowerCase().includes(q)) return false;
      if (d && !(s.movieDirector ?? "").toLowerCase().includes(d)) return false;
      if (selectedCinemaIds.size > 0 && !selectedCinemaIds.has(s.cinemaId)) return false;
      if (watchlistOnly && !watchlistIds.has(s.movieId)) return false;
      if (selectedFormats.size > 0 && !selectedFormats.has(s.format)) return false;
      const dateKey = s.startsAt.slice(0, 10);
      if (fromDate && dateKey < fromDate) return false;
      if (toDate && dateKey > toDate) return false;
      const timeOfDay = sydneyTimeOfDayMinutes(new Date(s.startsAt));
      if (fromMinutes !== null && timeOfDay < fromMinutes) return false;
      if (toMinutes !== null && timeOfDay > toMinutes) return false;
      return true;
    });
  }, [
    sessions,
    titleFilter,
    directorFilter,
    selectedCinemaIds,
    watchlistOnly,
    watchlistIds,
    selectedFormats,
    fromDate,
    toDate,
    fromMinutes,
    toMinutes,
  ]);

  const anyFilterActive =
    titleFilter ||
    directorFilter ||
    selectedCinemaIds.size > 0 ||
    watchlistOnly ||
    selectedFormats.size > 0 ||
    fromDate ||
    toDate ||
    fromTime ||
    toTime;

  const clearFilters = () => {
    setTitleFilter("");
    setDirectorFilter("");
    setSelectedCinemaIds(new Set());
    setFromDate("");
    setToDate("");
    setFromTime("");
    setToTime("");
    setSelectedFormats(new Set());
    setWatchlistOnly(false);
  };

  return (
    <div>
      <SectionHeading
        title="Sessions"
        subtitle="Every upcoming session at your cinemas — including special screenings not on your watchlist — filterable every which way."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={!watchlistOnly} onClick={() => setWatchlistOnly(false)}>
          All films at my cinemas
        </Chip>
        <Chip active={watchlistOnly} onClick={() => setWatchlistOnly(true)}>
          Only my watchlist
        </Chip>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {myCinemas.length > 0 && (
          <MultiSelectDropdown
            label="Cinemas"
            allLabel="All cinemas"
            options={myCinemas.map((c) => ({ id: c.id, label: c.name }))}
            selected={selectedCinemaIds}
            onChange={setSelectedCinemaIds}
          />
        )}
        {availableFormats.length > 1 && (
          <MultiSelectDropdown
            label="Format"
            allLabel="All formats"
            options={availableFormats.map((f) => ({ id: f, label: f }))}
            selected={selectedFormats}
            onChange={(next) => setSelectedFormats(next as Set<SessionFormat>)}
          />
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-500" />
          <input
            value={titleFilter}
            onChange={(e) => setTitleFilter(e.target.value)}
            placeholder="Filter by film…"
            className="w-44 rounded-lg border border-base-700 bg-base-900 py-2 pl-8 pr-3 text-sm text-base-200 placeholder:text-base-600 focus:border-accent-dim focus:outline-none"
          />
        </div>
        <input
          value={directorFilter}
          onChange={(e) => setDirectorFilter(e.target.value)}
          placeholder="Filter by director…"
          className="w-40 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-sm text-base-200 placeholder:text-base-600 focus:border-accent-dim focus:outline-none"
        />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-base-500">From date</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-base-500">To date</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-base-500">Not before</span>
          <input
            type="time"
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
            title="No sessions before this time of day"
            className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-base-500">Not after</span>
          <input
            type="time"
            value={toTime}
            onChange={(e) => setToTime(e.target.value)}
            title="No sessions after this time of day"
            className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
          />
        </div>
        {anyFilterActive && (
          <button
            onClick={clearFilters}
            className="rounded-lg border border-base-700 px-2.5 py-2 text-xs text-base-400 hover:border-base-600 hover:text-base-100"
          >
            Clear filters
          </button>
        )}
      </div>

      <DayMovieCinemaSessionView
        sessions={filtered}
        emptyHint="Nothing scheduled yet that matches this filter."
        onTogglePurchased={onTogglePurchased}
        onHideMovie={onHideMovie}
      />
    </div>
  );
}
