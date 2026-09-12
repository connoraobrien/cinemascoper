"use client";

import { useEffect, useMemo, useState } from "react";
import { WatchlistMovie, JoinedSession, Cinema } from "@/lib/clientTypes";
import { EmptyState, ReleaseTypeBadge, SectionHeading, Chip } from "./ui";
import { formatDate, daysUntil } from "@/lib/dateUtils";
import { PlayIcon, PlusIcon, SearchIcon, XIcon } from "./Icons";
import { SessionList } from "./SessionList";

type StatusFilter = "all" | "released" | "coming-soon" | "tba";

function statusOf(movie: WatchlistMovie): Exclude<StatusFilter, "all"> {
  if (!movie.releaseDate) return "tba";
  return daysUntil(movie.releaseDate) < 0 ? "released" : "coming-soon";
}

interface SearchHit {
  tmdbId: number;
  title: string;
  releaseDate: string;
  posterUrl?: string;
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
        Search all of TMDB — including already-released films and older titles a cinema might be
        re-releasing (e.g. a 70mm season) — and add it straight to your watchlist.
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
                  <span className="flex-1 truncate">{r.title}</span>
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
}: {
  watchlist: WatchlistMovie[];
  sessions: JoinedSession[];
  myCinemas: Cinema[];
  selectedId: string | null;
  onSelect: (movieId: string) => void;
  onUntrack: (movieId: string) => void;
  onAddMovie: (tmdbId: number) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandAll, setExpandAll] = useState(false);
  const selected = watchlist.find((m) => m.id === selectedId) ?? null;
  const myCinemaIds = new Set(myCinemas.map((c) => c.id));

  const sessionsFor = (movieId: string) =>
    sessions.filter((s) => s.movieId === movieId && myCinemaIds.has(s.cinemaId));

  const filteredWatchlist = watchlist.filter((m) => statusFilter === "all" || statusOf(m) === statusFilter);

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "coming-soon", "released", "tba"] as StatusFilter[]).map((f) => (
                <Chip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)}>
                  {f === "all" ? "All" : f === "coming-soon" ? "Coming soon" : f === "released" ? "Released" : "TBA"}
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
            <AllExpanded watchlist={filteredWatchlist} sessionsFor={sessionsFor} onUntrack={onUntrack} />
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
                            <span
                              className={`h-10 w-10 shrink-0 rounded-md bg-gradient-to-br ${movie.posterColor} bg-cover bg-center`}
                              style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
                            />
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
}: {
  watchlist: WatchlistMovie[];
  sessionsFor: (movieId: string) => JoinedSession[];
  onUntrack: (movieId: string) => void;
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
            <button
              onClick={() => onUntrack(movie.id)}
              className="shrink-0 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-400 hover:border-red-800 hover:text-red-400"
            >
              Untrack
            </button>
          </div>
          <SessionList sessions={sessionsFor(movie.id)} emptyHint="No session times published yet at your cinemas." />
        </div>
      ))}
    </div>
  );
}

function MovieDetail({
  movie,
  sessions,
  myCinemas,
  onUntrack,
}: {
  movie: WatchlistMovie;
  sessions: JoinedSession[];
  myCinemas: Cinema[];
  onUntrack: () => void;
}) {
  const [cinemaFilter, setCinemaFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const days = movie.releaseDate ? daysUntil(movie.releaseDate) : 0;

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
        <button
          onClick={onUntrack}
          title="Remove from watchlist"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-400 hover:border-red-800 hover:text-red-400"
        >
          <XIcon className="h-3.5 w-3.5" /> Untrack
        </button>
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
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-base-700 bg-base-850 px-2 py-1.5 text-xs text-base-200 focus:border-accent-dim focus:outline-none"
              title="From date"
            />
            <span className="text-xs text-base-500">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-base-700 bg-base-850 px-2 py-1.5 text-xs text-base-200 focus:border-accent-dim focus:outline-none"
              title="To date"
            />
          </div>
          <SessionList sessions={filteredSessions} emptyHint="No sessions match this filter." />
        </div>
      )}
    </div>
  );
}
