"use client";

import { useMemo, useState } from "react";
import { Movie, ReleaseType } from "@/lib/clientTypes";
import { Chip, EmptyState, SectionHeading } from "./ui";
import { MovieCard } from "./MovieCard";

const FILTERS: ("All" | ReleaseType)[] = ["All", "Standard Theatrical", "Limited Release", "Film Festival"];

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

  const filtered = useMemo(() => {
    const list = filter === "All" ? movies : movies.filter((m) => m.releaseType === filter);
    return [...list].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  }, [movies, filter]);

  return (
    <div>
      <SectionHeading
        title="Australian Release Radar"
        subtitle="Upcoming theatrical releases. Track anything you want session-time alerts for."
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
      ) : (
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
      )}
    </div>
  );
}
