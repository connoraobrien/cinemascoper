"use client";

import { useMemo, useState } from "react";
import { Cinema, JoinedSession, SessionFormat } from "@/lib/clientTypes";
import { SectionHeading, Chip } from "./ui";
import { SearchIcon } from "./Icons";
import { SessionList } from "./SessionList";
import { sydneyTimeOfDayMinutes } from "@/lib/scrapers/sydneyTime";

type ReleaseKindFilter = "all" | "new" | "re-release";

function timeStringToMinutes(t: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * "Upcoming times at your cinemas" — every session at a cinema you're
 * tracking, filterable every way Connor asked for: cinema (multi-select,
 * via toggleable chips rather than a fiddly native multiselect box),
 * film, director, date range, format, new-release-vs-re-release, and time
 * of day — plus a one-tap "only films on my watchlist" toggle, so the same
 * tab covers both "what's on at my cinemas generally" and "what's on for
 * what I'm following", per Connor's ask.
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
  const [formatFilter, setFormatFilter] = useState<"all" | SessionFormat>("all");
  const [releaseKind, setReleaseKind] = useState<ReleaseKindFilter>("all");
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const availableFormats = useMemo(() => {
    const set = new Set<SessionFormat>();
    for (const s of sessions) set.add(s.format);
    return [...set].sort();
  }, [sessions]);

  const toggleCinema = (id: string) => {
    setSelectedCinemaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      if (formatFilter !== "all" && s.format !== formatFilter) return false;
      if (releaseKind === "new" && s.isReRelease) return false;
      if (releaseKind === "re-release" && !s.isReRelease) return false;
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
    formatFilter,
    releaseKind,
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
    formatFilter !== "all" ||
    releaseKind !== "all" ||
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
    setFormatFilter("all");
    setReleaseKind("all");
    setWatchlistOnly(false);
  };

  return (
    <div>
      <SectionHeading
        title="Sessions"
        subtitle="Every upcoming session at your cinemas — including special screenings and re-releases not on your watchlist — filterable every which way."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={!watchlistOnly} onClick={() => setWatchlistOnly(false)}>
          All films at my cinemas
        </Chip>
        <Chip active={watchlistOnly} onClick={() => setWatchlistOnly(true)}>
          Only my watchlist
        </Chip>
        <span className="mx-1 h-4 w-px bg-base-800" />
        <Chip active={releaseKind === "all"} onClick={() => setReleaseKind("all")}>
          New &amp; re-releases
        </Chip>
        <Chip active={releaseKind === "new"} onClick={() => setReleaseKind("new")}>
          New releases only
        </Chip>
        <Chip active={releaseKind === "re-release"} onClick={() => setReleaseKind("re-release")}>
          Re-releases only
        </Chip>
      </div>

      {myCinemas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-base-500">Cinemas:</span>
          {myCinemas.map((c) => (
            <Chip key={c.id} active={selectedCinemaIds.has(c.id)} onClick={() => toggleCinema(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {availableFormats.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-base-500">Format:</span>
          <Chip active={formatFilter === "all"} onClick={() => setFormatFilter("all")}>
            All
          </Chip>
          {availableFormats.map((f) => (
            <Chip key={f} active={formatFilter === f} onClick={() => setFormatFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>
      )}

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

      <SessionList
        sessions={filtered}
        showMovieTitle
        emptyHint="Nothing scheduled yet that matches this filter."
        onTogglePurchased={onTogglePurchased}
        onHideMovie={onHideMovie}
      />
    </div>
  );
}
