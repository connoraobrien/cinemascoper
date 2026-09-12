"use client";

import { useEffect, useMemo, useState } from "react";
import { WatchlistMovie, JoinedSession, Cinema } from "@/lib/clientTypes";
import { EmptyState, ReleaseTypeBadge, SectionHeading, Chip } from "./ui";
import { formatDate, daysUntil, formatDayLabel } from "@/lib/dateUtils";
import { EyeOffIcon, PlayIcon, PlusIcon, SearchIcon, XIcon } from "./Icons";
import { SessionRows, groupSessionsByDate } from "./SessionList";

type StatusFilter = "all" | "released" | "coming-soon" | "tba";
type SessionsFilter = "all" | "has-sessions" | "no-sessions";

// Quick date-period presets for the Watchlist's date filter — "can you make
// the date filtering a little bit easier? So that you can maybe filter by
// time periods as well?" — each just sets the underlying from/to range, so
// a manual override afterwards still works exactly like before.
type DatePreset = "any" | "today" | "week" | "weekend" | "next30";

function presetRange(preset: DatePreset): { from: string; to: string } {
  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const add = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };
  switch (preset) {
    case "today":
      return { from: toKey(today), to: toKey(today) };
    case "week":
      return { from: toKey(today), to: toKey(add(7)) };
    case "weekend": {
      // Next Saturday through Sunday (today counts as day 0 of the week).
      const day = today.getDay();
      const daysToSat = (6 - day + 7) % 7;
      const sat = add(daysToSat);
      const sun = add(daysToSat + 1);
      return { from: toKey(sat), to: toKey(sun) };
    }
    case "next30":
      return { from: toKey(today), to: toKey(add(30)) };
    default:
      return { from: "", to: "" };
  }
}

function statusOf(movie: WatchlistMovie): Exclude<StatusFilter, "all"> {
  if (!movie.releaseDate) return "tba";
  return daysUntil(movie.releaseDate) < 0 ? "released" : "coming-soon";
}

interface SearchHit {
  tmdbId: number;
  title: string;
  releaseDate: string;
  posterUrl?: string;
  matchedDirector?: string;
}

function MovieSearchBox({ onAdd }: { onAdd: (tmdbId: number) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/movie-search?q=${encodeURIComponent(query)}`);
        const { results } = await res.json();
        setResults(results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="mb-5 rounded-xl border border-base-700 bg-base-900 p-4">
      <p className="mb-1 text-sm font-semibold text-base-100">Can't find a film?</p>
      <p className="mb-2.5 text-xs text-base-500">
        Search all of TMDB by title or director — including already-released films and older
        titles a cinema might be re-releasing (e.g. a 70mm season) — and add it straight to your
        watchlist.
      </p>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-500" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search any film title…"
          className="w-full rounded-lg border border-base-700 bg-base-950 py-2 pl-8 pr-3 text-sm text-base-200 placeholder:text-base-600 focus:border-accent-dim focus:outline-none"
        />
      </div>
      {open && (query.trim() || results.length > 0) && (
        <ul className="mt-1.5 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-base-800 bg-base-850 p-1.5">
          {searching && <li className="px-2 py-1 text-xs text-base-500">Searching…</li>}
          {!searching && results.length === 0 && (
            <li className="px-2 py-1 text-xs text-base-500">No matches yet — try a different search.</li>
          )}
          {!searching &&
            results.map((r) => (
              <li key={r.tmdbId}>
                <button
                  onClick={() => {
                    onAdd(r.tmdbId);
                    setQuery("");
                    setResults([]);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-base-300 hover:bg-base-800 hover:text-base-100"
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded bg-base-700 bg-cover bg-center"
                    style={r.posterUrl ? { backgroundImage: `url(${r.posterUrl})` } : undefined}
                  />
                  <span className="flex-1 truncate">
                    {r.title}
                    {r.matchedDirector && <span className="text-base-500"> &middot; Dir. {r.matchedDirector}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-base-500">
                    {r.releaseDate ? r.releaseDate.slice(0, 4) : "TBA"}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function WatchlistTab({
  watchlist,
  sessions,
  myCinemas,
  selectedId,
  onSelect,
  onUntrack,
  onAddMovie,
  onHideMovie,
  onTogglePurchased,
}: {
  watchlist: WatchlistMovie[];
  sessions: JoinedSession[];
  myCinemas: Cinema[];
  selectedId: string | null;
  onSelect: (movieId: string) => void;
  onUntrack: (movieId: string) => void;
  onAddMovie: (tmdbId: number) => void;
  onHideMovie: (movieId: string) => void;
  onTogglePurchased: (sessionId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sessionsFilter, setSessionsFilter] = useState<SessionsFilter>("all");
  const [expandAll, setExpandAll] = useState(false);
  const selected = watchlist.find((m) => m.id === selectedId) ?? null;
  const myCinemaIds = new Set(myCinemas.map((c) => c.id));

  const sessionsFor = (movieId: string) =>
    sessions.filter((s) => s.movieId === movieId && myCinemaIds.has(s.cinemaId));

  const filteredWatchlist = watchlist.filter((m) => {
    if (statusFilter !== "all" && statusOf(m) !== statusFilter) return false;
    if (sessionsFilter !== "all") {
      const hasSessions = sessionsFor(m.id).length > 0;
      if (sessionsFilter === "has-sessions" && !hasSessions) return false;
      if (sessionsFilter === "no-sessions" && hasSessions) return false;
    }
    return true;
  });

  return (
    <div>
      <SectionHeading
        title="My Watchlist"
        subtitle="Movies you're keeping an eye on, with every upcoming session at your cinemas."
      />

      <MovieSearchBox onAdd={onAddMovie} />

      {watchlist.length === 0 ? (
        <EmptyState title="Your watchlist is empty." hint="Track a movie from Release Radar, or search for one above." />
      ) : (
        <>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {(["all", "coming-soon", "released", "tba"] as StatusFilter[]).map((f) => (
              <Chip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)}>
                {f === "all" ? "All" : f === "coming-soon" ? "Coming soon" : f === "released" ? "Released" : "TBA"}
              </Chip>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "has-sessions", "no-sessions"] as SessionsFilter[]).map((f) => (
                <Chip key={f} active={sessionsFilter === f} onClick={() => setSessionsFilter(f)}>
                  {f === "all" ? "Any" : f === "has-sessions" ? "Has session times" : "No session times yet"}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-base-700 bg-base-900 p-0.5">
              <button
                onClick={() => setExpandAll(false)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  !expandAll ? "bg-base-700 text-base-100" : "text-base-400 hover:text-base-200"
                }`}
              >
                One at a time
              </button>
              <button
                onClick={() => setExpandAll(true)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  expandAll ? "bg-base-700 text-base-100" : "text-base-400 hover:text-base-200"
                }`}
              >
                All expanded
              </button>
            </div>
          </div>

          {expandAll ? (
            <AllExpanded
              watchlist={filteredWatchlist}
              sessionsFor={sessionsFor}
              onUntrack={onUntrack}
              onHideMovie={onHideMovie}
              onTogglePurchased={onTogglePurchased}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div>
                {filteredWatchlist.length === 0 ? (
                  <EmptyState title="Nothing matches this filter." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filteredWatchlist.map((movie) => {
                      const movieSessions = sessionsFor(movie.id);
                      const isSelected = movie.id === selectedId;
                      return (
                        <li key={movie.id}>
                          <button
                            onClick={() => onSelect(movie.id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                              isSelected ? "border-accent-dim/60 bg-accent-soft/40" : "border-base-700 bg-base-900 hover:border-base-600"
                            }`}
                          >
                            <span className="relative shrink-0">
                              <span
                                className={`block h-10 w-10 rounded-md bg-gradient-to-br ${movie.posterColor} bg-cover bg-center`}
                                style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
                              />
                              <span
                                title={movieSessions.length > 0 ? "Has session times at your cinemas" : "No session times yet"}
                                className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-base-900 ${
                                  movieSessions.length > 0 ? "bg-emerald-400" : "bg-base-600"
                                }`}
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-base-100">{movie.title}</p>
                              <p className="mt-0.5 text-xs text-base-500">
                                {movieSessions.length > 0
                                  ? `${movieSessions.length} session(s) at your cinemas`
                                  : movie.releaseDate
                                    ? `Releases ${formatDate(movie.releaseDate)}`
                                    : "Yet to be announced"}
                              </p>
                            </div>
                            <ReleaseTypeBadge type={movie.releaseType} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-base-700 bg-base-900 p-5">
                {!selected ? (
                  <EmptyState title="Select a movie to see details." />
                ) : (
                  <MovieDetail
                    movie={selected}
                    sessions={sessionsFor(selected.id)}
                    myCinemas={myCinemas}
                    onUntrack={() => onUntrack(selected.id)}
                    onHide={() => onHideMovie(selected.id)}
                    onTogglePurchased={onTogglePurchased}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AllExpanded({
  watchlist,
  sessionsFor,
  onUntrack,
  onHideMovie,
  onTogglePurchased,
}: {
  watchlist: WatchlistMovie[];
  sessionsFor: (movieId: string) => JoinedSession[];
  onUntrack: (movieId: string) => void;
  onHideMovie: (movieId: string) => void;
  onTogglePurchased: (sessionId: string) => void;
}) {
  if (watchlist.length === 0) return <EmptyState title="Nothing matches this filter." />;

  return (
    <div className="flex flex-col gap-4">
      {watchlist.map((movie) => (
        <div key={movie.id} className="rounded-xl border border-base-700 bg-base-900 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`h-10 w-10 shrink-0 rounded-md bg-gradient-to-br ${movie.posterColor} bg-cover bg-center`}
                style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
              />
              <div>
                <p className="text-sm font-semibold text-base-100">{movie.title}</p>
                <p className="text-xs text-base-500">
                  {movie.releaseDate ? formatDate(movie.releaseDate) : "Yet to be announced"}
                </p>
              </div>
              <ReleaseTypeBadge type={movie.releaseType} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => onHideMovie(movie.id)}
                title="You've seen it — hide it and stop its alerts"
                className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-400 hover:border-base-600 hover:text-base-100"
              >
                <EyeOffIcon className="h-3.5 w-3.5" /> Seen it
              </button>
              <button
                onClick={() => onUntrack(movie.id)}
                className="rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-400 hover:border-red-800 hover:text-red-400"
              >
                Untrack
              </button>
            </div>
          </div>
          <DayTabbedSessionList
            key={movie.id}
            sessions={sessionsFor(movie.id)}
            emptyHint="No session times published yet at your cinemas."
            onTogglePurchased={onTogglePurchased}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * "Instead of listing all of the session times under the movies in a big
 * list, could you have, under the movies, tabs for each of the days that
 * there are sessions? and then when you click the day, the list of
 * screenings for that movie will come up?" — one movie's sessions, tabbed
 * by day instead of `SessionList`'s stacked day sections. Give this a
 * `key` tied to whatever movie/filter it's showing (see the call site in
 * `MovieDetail` below) so its day selection resets rather than carrying
 * over a stale `dateKey` when Connor switches movies.
 */
function DayTabbedSessionList({
  sessions,
  emptyHint,
  onTogglePurchased,
}: {
  sessions: JoinedSession[];
  emptyHint: string;
  onTogglePurchased: (sessionId: string) => void;
}) {
  const days = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  if (days.length === 0) {
    return <EmptyState title={emptyHint} />;
  }

  const activeDateKey = days.some((d) => d.dateKey === selectedDateKey) ? selectedDateKey : days[0].dateKey;
  const activeDay = days.find((d) => d.dateKey === activeDateKey)!;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {days.map((d) => (
          <button
            key={d.dateKey}
            onClick={() => setSelectedDateKey(d.dateKey)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              d.dateKey === activeDateKey
                ? "border-accent-dim/60 bg-accent-soft text-accent"
                : "border-base-700 text-base-400 hover:border-base-600 hover:text-base-100"
            }`}
          >
            {formatDayLabel(d.dateKey)}
            <span className="ml-1 text-[10px] text-base-500">({d.sessions.length})</span>
          </button>
        ))}
      </div>
      <SessionRows sessions={activeDay.sessions} onTogglePurchased={onTogglePurchased} />
    </div>
  );
}

function MovieDetail({
  movie,
  sessions,
  myCinemas,
  onUntrack,
  onHide,
  onTogglePurchased,
}: {
  movie: WatchlistMovie;
  sessions: JoinedSession[];
  myCinemas: Cinema[];
  onUntrack: () => void;
  onHide: () => void;
  onTogglePurchased: (sessionId: string) => void;
}) {
  const [cinemaFilter, setCinemaFilter] = useState<string>("all");
  const [preset, setPreset] = useState<DatePreset>("any");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const days = movie.releaseDate ? daysUntil(movie.releaseDate) : 0;

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    const { from, to } = presetRange(p);
    setFromDate(from);
    setToDate(to);
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (cinemaFilter !== "all" && s.cinemaId !== cinemaFilter) return false;
      const dateKey = s.startsAt.slice(0, 10);
      if (fromDate && dateKey < fromDate) return false;
      if (toDate && dateKey > toDate) return false;
      return true;
    });
  }, [sessions, cinemaFilter, fromDate, toDate]);

  return (
    <div>
      <div
        className={`mb-4 h-20 w-full rounded-lg bg-gradient-to-br ${movie.posterColor} bg-cover bg-center`}
        style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
      />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-base-100">{movie.title}</h3>
          <p className="mt-1 text-sm text-base-400">{movie.synopsis}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onHide}
            title="You've seen it — hide it and stop its alerts"
            className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-400 hover:border-base-600 hover:text-base-100"
          >
            <EyeOffIcon className="h-3.5 w-3.5" /> Seen it
          </button>
          <button
            onClick={onUntrack}
            title="Remove from watchlist"
            className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-400 hover:border-red-800 hover:text-red-400"
          >
            <XIcon className="h-3.5 w-3.5" /> Untrack
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ReleaseTypeBadge type={movie.releaseType} />
        <span className="text-xs text-base-500">
          {movie.director && <>Dir. {movie.director} &middot; </>}
          {movie.runtimeMinutes > 0 && <>{movie.runtimeMinutes} min &middot; </>}
          {movie.genres.join(", ")}
        </span>
        {movie.trailerUrl && (
          <a
            href={movie.trailerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-2 py-1 text-xs text-base-300 hover:border-base-600 hover:text-base-100"
          >
            <PlayIcon className="h-3.5 w-3.5" /> Trailer
          </a>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-base-700 bg-base-850 px-4 py-4 text-center">
          <p className="text-sm font-medium text-base-200">No session times published at your cinemas yet.</p>
          <p className="mt-1 text-xs text-base-500">
            {!movie.releaseDate
              ? "Release date yet to be announced."
              : days >= 0
                ? `In cinemas ${formatDate(movie.releaseDate)} (in ${days} day${days === 1 ? "" : "s"}).`
                : `Released ${formatDate(movie.releaseDate)}.`}
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {([
              ["any", "Any time"],
              ["today", "Today"],
              ["week", "This week"],
              ["weekend", "This weekend"],
              ["next30", "Next 30 days"],
            ] as [DatePreset, string][]).map(([p, label]) => (
              <Chip key={p} active={preset === p} onClick={() => applyPreset(p)}>
                {label}
              </Chip>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={cinemaFilter}
              onChange={(e) => setCinemaFilter(e.target.value)}
              className="rounded-lg border border-base-700 bg-base-850 px-2 py-1.5 text-xs text-base-200 focus:border-accent-dim focus:outline-none"
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
              onChange={(e) => {
                setPreset("any");
                setFromDate(e.target.value);
              }}
              className="rounded-lg border border-base-700 bg-base-850 px-2 py-1.5 text-xs text-base-200 focus:border-accent-dim focus:outline-none"
              title="From date"
            />
            <span className="text-xs text-base-500">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPreset("any");
                setToDate(e.target.value);
              }}
              className="rounded-lg border border-base-700 bg-base-850 px-2 py-1.5 text-xs text-base-200 focus:border-accent-dim focus:outline-none"
              title="To date"
            />
          </div>
          <DayTabbedSessionList
            key={movie.id}
            sessions={filteredSessions}
            emptyHint="No sessions match this filter."
            onTogglePurchased={onTogglePurchased}
          />
        </div>
      )}
    </div>
  );
}
