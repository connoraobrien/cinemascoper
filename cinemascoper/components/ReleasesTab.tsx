"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Movie, ReleaseType, JoinedSession } from "@/lib/clientTypes";
import { formatDate, daysUntil, monthYearLabel } from "@/lib/dateUtils";
import { Chip, EmptyState, IconButton, ReleaseTypeBadge, SectionHeading, releaseTypeLabel } from "./ui";
import { MovieCard } from "./MovieCard";
import { SessionList } from "./SessionList";
import { CalendarIcon, CheckIcon, GridIcon, PlayIcon, PlusIcon, SearchIcon, XIcon } from "./Icons";
import { MAINSTREAM_POPULARITY_THRESHOLD } from "@/lib/movies";

const FILTERS: ("All" | ReleaseType)[] = ["All", "Standard Theatrical", "Limited Release", "Film Festival"];
type ViewMode = "grid" | "byDate" | "calendar";

// "Show only new releases" — hides a movie that released more than this
// long ago: a watchlisted or manually-added old catalogue title (e.g. from
// the "search all of TMDB" flow, so a cinema could be polled for a
// re-release of it), or a real movie a cinema scraper resolved via a
// single-title TMDB lookup that just happens to be an old one (see
// `resolveMovieForTitle` in `lib/scrapers/shadowMovies.ts`). Defaults to
// **on** — Connor can turn it off to browse everything — so Release Radar
// stays what its own subtitle says it is ("Upcoming theatrical releases")
// regardless of how an old title entered the catalogue, rather than
// depending on the catalogue itself always staying narrow to keep old
// titles out.
const OLD_RELEASE_DAYS = 365;

/** Places movies with no release date (TBA) after everything else, rather than sorting them first
 * (an empty string sorts before any real date string) — "put films that don't have a release date
 * at the bottom of the page rather than at the top." */
function sortByReleaseDate(movies: Movie[]): Movie[] {
  return [...movies].sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return a.title.localeCompare(b.title);
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return a.releaseDate.localeCompare(b.releaseDate);
  });
}

function groupByDate(movies: Movie[]): { dateKey: string; movies: Movie[] }[] {
  const groups = new Map<string, Movie[]>();
  for (const movie of movies) {
    if (!movie.releaseDate) continue; // TBA titles aren't placeable on any date-grouped view
    const dateKey = movie.releaseDate.slice(0, 10);
    const list = groups.get(dateKey);
    if (list) list.push(movie);
    else groups.set(dateKey, [movie]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, movies]) => ({ dateKey, movies }));
}

export function ReleasesTab({
  movies,
  trackedIds,
  sessions,
  myCinemaIds,
  onToggleTrack,
  onHide,
  onTogglePurchased,
}: {
  movies: Movie[];
  trackedIds: Set<string>;
  sessions: JoinedSession[];
  myCinemaIds: Set<string>;
  onToggleTrack: (movieId: string) => void;
  onHide: (movieId: string) => void;
  onTogglePurchased: (sessionId: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [view, setView] = useState<ViewMode>("grid");
  const [mainstreamOnly, setMainstreamOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = filter === "All" ? movies : movies.filter((m) => m.releaseType === filter);
    if (mainstreamOnly) list = list.filter((m) => (m.popularity ?? 0) >= MAINSTREAM_POPULARITY_THRESHOLD);
    if (newOnly) {
      list = list.filter((m) => !m.releaseDate || daysUntil(m.releaseDate) > -OLD_RELEASE_DAYS);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => m.title.toLowerCase().includes(q) || (m.director ?? "").toLowerCase().includes(q));
    }
    return sortByReleaseDate(list);
  }, [movies, filter, mainstreamOnly, newOnly, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const previewMovie = previewId ? movies.find((m) => m.id === previewId) ?? null : null;

  return (
    <div>
      <SectionHeading
        title="Australian Release Radar"
        subtitle="Upcoming theatrical releases. Tap a movie to preview its session times, or track it for alerts."
        action={
          <div className="flex items-center gap-1 rounded-lg border border-base-700 bg-base-900 p-0.5">
            <ViewButton icon={<GridIcon className="h-3.5 w-3.5" />} label="Tiles" active={view === "grid"} onClick={() => setView("grid")} />
            <ViewButton icon={<CalendarIcon className="h-3.5 w-3.5" />} label="By date" active={view === "byDate"} onClick={() => setView("byDate")} />
            <ViewButton icon={<CalendarIcon className="h-3.5 w-3.5" />} label="Calendar" active={view === "calendar"} onClick={() => setView("calendar")} />
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === "All" ? "All" : releaseTypeLabel(f)}
            </Chip>
          ))}
          <Chip active={mainstreamOnly} onClick={() => setMainstreamOnly((v) => !v)}>
            Mainstream only
          </Chip>
          <Chip active={newOnly} onClick={() => setNewOnly((v) => !v)}>
            New releases only
          </Chip>
        </div>
        <div className="relative max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or director…"
            className="w-full rounded-lg border border-base-700 bg-base-900 py-2 pl-8 pr-3 text-sm text-base-200 placeholder:text-base-600 focus:border-accent-dim focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No releases match this filter." />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              tracked={trackedIds.has(movie.id)}
              onToggleTrack={() => onToggleTrack(movie.id)}
              onClick={() => setPreviewId(movie.id)}
              onHide={() => onHide(movie.id)}
            />
          ))}
        </div>
      ) : view === "byDate" ? (
        <ByDateList groups={grouped} trackedIds={trackedIds} onToggleTrack={onToggleTrack} onSelect={setPreviewId} />
      ) : (
        <MonthCalendar movies={filtered} onSelect={setPreviewId} />
      )}

      {previewMovie && (
        <MoviePreviewPanel
          movie={previewMovie}
          tracked={trackedIds.has(previewMovie.id)}
          sessions={sessions.filter((s) => s.movieId === previewMovie.id && myCinemaIds.has(s.cinemaId))}
          onToggleTrack={() => onToggleTrack(previewMovie.id)}
          onTogglePurchased={onTogglePurchased}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}

function ViewButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-base-700 text-base-100" : "text-base-400 hover:text-base-200"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ByDateList({
  groups,
  trackedIds,
  onToggleTrack,
  onSelect,
}: {
  groups: { dateKey: string; movies: Movie[] }[];
  trackedIds: Set<string>;
  onToggleTrack: (movieId: string) => void;
  onSelect: (movieId: string) => void;
}) {
  let lastMonthYear = "";
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const monthYear = monthYearLabel(group.dateKey);
        const showMonthYear = monthYear !== lastMonthYear;
        lastMonthYear = monthYear;

        return (
          <div key={group.dateKey}>
            {showMonthYear && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-600">{monthYear}</p>
            )}
            <div className="mb-2.5 flex items-baseline gap-2 border-b border-base-800 pb-1.5">
              <h3 className="text-sm font-semibold text-base-100">{formatDate(group.dateKey)}</h3>
              <span className="text-xs text-base-500">
                {group.movies.length} release{group.movies.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {group.movies.map((movie) => (
                <li
                  key={movie.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-base-800 bg-base-900 px-3.5 py-2.5"
                >
                  <button onClick={() => onSelect(movie.id)} className="flex min-w-0 items-center gap-2.5 text-left">
                    <span
                      className={`h-8 w-8 shrink-0 rounded-md bg-gradient-to-br ${movie.posterColor} bg-cover bg-center`}
                      style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
                    />
                    <span className="truncate text-sm font-medium text-base-100 hover:text-accent">{movie.title}</span>
                    <ReleaseTypeBadge type={movie.releaseType} />
                  </button>
                  <button
                    onClick={() => onToggleTrack(movie.id)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      trackedIds.has(movie.id)
                        ? "border-accent-dim/50 bg-accent-soft text-accent"
                        : "border-base-700 text-base-300 hover:border-base-600 hover:text-base-100"
                    }`}
                  >
                    {trackedIds.has(movie.id) ? <CheckIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
                    {trackedIds.has(movie.id) ? "Tracking" : "Track"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MonthCalendar({ movies, onSelect }: { movies: Movie[]; onSelect: (movieId: string) => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  // "If there's 2+ more etc., can you make it so that this can be expanded
  // to show all of the release dates of that day?" — a day cell only ever
  // shows its first 3 releases inline (not enough room for more in a
  // ~5.5rem cell); clicking "+N more" opens every release for that one day
  // in a small popover instead of navigating away from the calendar.
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Movie[]>();
    for (const m of movies) {
      if (!m.releaseDate) continue;
      const key = m.releaseDate.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(m);
      else map.set(key, [m]);
    }
    return map;
  }, [movies]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = today.toISOString().slice(0, 10);

  const cells: { dateKey: string | null; day: number | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ dateKey: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dateKey, day: d });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-base-100">
          {cursor.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
        </p>
        <div className="flex gap-1.5">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-lg border border-base-700 px-2.5 py-1 text-xs text-base-300 hover:border-base-600 hover:text-base-100"
          >
            &larr; Prev
          </button>
          <button
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-lg border border-base-700 px-2.5 py-1 text-xs text-base-300 hover:border-base-600 hover:text-base-100"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-lg border border-base-700 px-2.5 py-1 text-xs text-base-300 hover:border-base-600 hover:text-base-100"
          >
            Next &rarr;
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-base-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="pb-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.dateKey) return <div key={i} className="min-h-[5.5rem] rounded-lg" />;
          const releases = byDay.get(cell.dateKey) ?? [];
          const isToday = cell.dateKey === todayKey;
          return (
            <div
              key={i}
              className={`flex min-h-[5.5rem] flex-col gap-1 rounded-lg border p-1.5 ${
                isToday ? "border-accent-dim/50 bg-accent-soft/20" : "border-base-800 bg-base-900"
              }`}
            >
              <span className={`text-[11px] ${isToday ? "font-semibold text-accent" : "text-base-500"}`}>{cell.day}</span>
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {releases.slice(0, 3).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSelect(m.id)}
                    title={m.title}
                    className="truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight text-base-200 hover:bg-base-800"
                    style={{ backgroundColor: "rgba(94,234,212,0.08)" }}
                  >
                    {m.title}
                  </button>
                ))}
                {releases.length > 3 && (
                  <button
                    onClick={() => setExpandedDateKey(cell.dateKey)}
                    className="px-1 text-left text-[10px] font-medium text-accent hover:underline"
                  >
                    +{releases.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {expandedDateKey && (
        <DayReleasesPopover
          dateKey={expandedDateKey}
          releases={byDay.get(expandedDateKey) ?? []}
          onSelect={(id) => {
            setExpandedDateKey(null);
            onSelect(id);
          }}
          onClose={() => setExpandedDateKey(null)}
        />
      )}
    </div>
  );
}

function DayReleasesPopover({
  dateKey,
  releases,
  onSelect,
  onClose,
}: {
  dateKey: string;
  releases: Movie[];
  onSelect: (movieId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-base-700 bg-base-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-base-100">{formatDate(dateKey)}</p>
            <p className="text-xs text-base-500">
              {releases.length} release{releases.length === 1 ? "" : "s"}
            </p>
          </div>
          <IconButton title="Close" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </IconButton>
        </div>
        <ul className="flex flex-col gap-1.5 overflow-y-auto p-3">
          {releases.map((movie) => (
            <li key={movie.id}>
              <button
                onClick={() => onSelect(movie.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-base-800"
              >
                <span
                  className={`h-8 w-8 shrink-0 rounded-md bg-gradient-to-br ${movie.posterColor} bg-cover bg-center`}
                  style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-base-100">{movie.title}</span>
                <ReleaseTypeBadge type={movie.releaseType} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MoviePreviewPanel({
  movie,
  tracked,
  sessions,
  onToggleTrack,
  onTogglePurchased,
  onClose,
}: {
  movie: Movie;
  tracked: boolean;
  sessions: JoinedSession[];
  onToggleTrack: () => void;
  onTogglePurchased: (sessionId: string) => void;
  onClose: () => void;
}) {
  const days = daysUntil(movie.releaseDate || new Date().toISOString());

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-base-700 bg-base-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`h-36 w-full shrink-0 bg-gradient-to-br ${movie.posterColor} bg-cover bg-center`}
          style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
        />
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-base-100">{movie.title}</h3>
              <p className="mt-0.5 text-xs text-base-500">
                {movie.director && <span>Dir. {movie.director}</span>}
                {movie.director && movie.runtimeMinutes > 0 && <span className="mx-1">&middot;</span>}
                {movie.runtimeMinutes > 0 && <span>{movie.runtimeMinutes} min</span>}
                {movie.genres.length > 0 && <span> &middot; {movie.genres.join(", ")}</span>}
              </p>
            </div>
            <IconButton title="Close" onClick={onClose}>
              <XIcon className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ReleaseTypeBadge type={movie.releaseType} />
            <span className="text-xs text-base-500">
              {movie.releaseDate
                ? `${formatDate(movie.releaseDate)} (${days >= 0 ? `in ${days}d` : `${Math.abs(days)}d ago`})`
                : "Yet to be announced"}
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

          <p className="mb-4 text-sm text-base-400">{movie.synopsis}</p>

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-base-500">Session times at your cinemas</p>
          <SessionList
            sessions={sessions}
            emptyHint="No session times published yet at your cinemas."
            onTogglePurchased={onTogglePurchased}
          />
        </div>

        <div className="border-t border-base-800 p-4">
          <button
            onClick={onToggleTrack}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              tracked
                ? "border-accent-dim/50 bg-accent-soft text-accent"
                : "border-accent-dim/50 bg-accent-soft text-accent hover:bg-accent-soft/80"
            }`}
          >
            {tracked ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
            {tracked ? "Tracking — tap to untrack" : "Track this movie"}
          </button>
        </div>
      </div>
    </div>
  );
}
