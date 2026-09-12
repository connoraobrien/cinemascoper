"use client";

import { useMemo, useState } from "react";
import { Cinema, JoinedSession } from "@/lib/clientTypes";
import { SectionHeading } from "./ui";
import { SearchIcon } from "./Icons";
import { SessionList } from "./SessionList";

/**
 * "Upcoming times at your cinemas" — every session at a cinema you're
 * tracking, filterable by film / cinema / date, i.e. the "calendar-like
 * function" Connor asked for to look for sessions across everything
 * he's following without going movie-by-movie.
 */
export function SessionTimesTab({ sessions, myCinemas }: { sessions: JoinedSession[]; myCinemas: Cinema[] }) {
  const [titleFilter, setTitleFilter] = useState("");
  const [cinemaFilter, setCinemaFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    const q = titleFilter.trim().toLowerCase();
    return sessions.filter((s) => {
      if (q && !s.movieTitle.toLowerCase().includes(q)) return false;
      if (cinemaFilter !== "all" && s.cinemaId !== cinemaFilter) return false;
      const dateKey = s.startsAt.slice(0, 10);
      if (fromDate && dateKey < fromDate) return false;
      if (toDate && dateKey > toDate) return false;
      return true;
    });
  }, [sessions, titleFilter, cinemaFilter, fromDate, toDate]);

  return (
    <div>
      <SectionHeading
        title="Session Times"
        subtitle="Every upcoming session at your cinemas — filter down to a film, a cinema, or a date range."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-500" />
          <input
            value={titleFilter}
            onChange={(e) => setTitleFilter(e.target.value)}
            placeholder="Filter by film…"
            className="w-52 rounded-lg border border-base-700 bg-base-900 py-2 pl-8 pr-3 text-sm text-base-200 placeholder:text-base-600 focus:border-accent-dim focus:outline-none"
          />
        </div>
        <select
          value={cinemaFilter}
          onChange={(e) => setCinemaFilter(e.target.value)}
          className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
        >
          <option value="all">All your cinemas</option>
          {myCinemas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          title="From date"
          className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
        />
        <span className="text-xs text-base-500">to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          title="To date"
          className="rounded-lg border border-base-700 bg-base-900 px-2.5 py-2 text-sm text-base-200 focus:border-accent-dim focus:outline-none"
        />
        {(titleFilter || cinemaFilter !== "all" || fromDate || toDate) && (
          <button
            onClick={() => {
              setTitleFilter("");
              setCinemaFilter("all");
              setFromDate("");
              setToDate("");
            }}
            className="rounded-lg border border-base-700 px-2.5 py-2 text-xs text-base-400 hover:border-base-600 hover:text-base-100"
          >
            Clear filters
          </button>
        )}
      </div>

      <SessionList sessions={filtered} showMovieTitle emptyHint="Nothing scheduled yet that matches this filter." />
    </div>
  );
}
