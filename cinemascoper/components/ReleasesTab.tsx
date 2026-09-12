"use client";

import { useMemo, useState } from "react";
import { Movie, ReleaseType } from "@/lib/clientTypes";
import { formatDate } from "@/lib/dateUtils";
import { Chip, EmptyState, ReleaseTypeBadge, SectionHeading } from "./ui";
import { MovieCard } from "./MovieCard";
import { CalendarIcon, GridIcon, PlusIcon, CheckIcon } from "./Icons";

const FILTERS: ("All" | ReleaseType)[] = ["All", "Standard Theatrical", "Limited Release", "Film Festival"];
type ViewMode = "grid" | "byDate";

/** Groups movies by their release day (calendar date, not full timestamp),
 * in ascending date order — the "by date" alternative to the tile grid. */
function groupByDate(movies: Movie[]): { dateKey: string; movies: Movie[] }[] {
  const groups = new Map<string, Movie[]>();
  for (const movie of movies) {
    const dateKey = movie.releaseDate.slice(0, 10); // YYYY-MM-DD, ignoring time-of-day
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
  onToggleTrack,
  onSelectMovie,
}: {
  movies: Movie[];
  trackedIds: Set<string>;
  onToggleTrack: (movieId: string) => void;
  onSelectMovie: (movieId: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [view, setView] = useState<ViewMode>("grid");

  const filtered = useMemo(() => {
    const list = filter === "All" ? movies : movies.filter((m) => m.releaseType === filter);
    return [...list].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  }, [movies, filter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div>
      <SectionHeading
        title="Australian Release Radar"
        subtitle="Upcoming theatrical releases. Track anything you want session-time alerts for."
        action={
          <div className="flex items-center gap-1 rounded-lg border border-base-700 bg-base-900 p-0.5">
            <button
              onClick={() => setView("grid")}
              title="Tile view"
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "grid" ? "bg-base-700 text-base-100" : "text-base-400 hover:text-base-200"
              }`}
            >
              <GridIcon className="h-3.5 w-3.5" /> Tiles
            </button>
            <button
              onClick={() => setView("byDate")}
              title="Grouped by release date"
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "byDate" ? "bg-base-700 text-base-100" : "text-base-400 hover:text-base-200"
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" /> By date
            </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No releases match this filter." />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              tracked={trackedIds.has(movie.id)}
              onToggleTrack={() => onToggleTrack(movie.id)}
              onClick={() => onSelectMovie(movie.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((group) => (
            <div key={group.dateKey}>
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
                    <button
                      onClick={() => onSelectMovie(movie.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      <span className="truncate text-sm font-medium text-base-100 hover:text-accent">
                        {movie.title}
                      </span>
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
                      {trackedIds.has(movie.id) ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : (
                        <PlusIcon className="h-3.5 w-3.5" />
                      )}
                      {trackedIds.has(movie.id) ? "Tracking" : "Track"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
