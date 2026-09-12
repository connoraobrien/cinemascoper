"use client";

import { WatchlistMovie, JoinedSession, Cinema } from "@/lib/clientTypes";
import { EmptyState, ReleaseTypeBadge, SectionHeading } from "./ui";
import { formatDate, formatDateTime, daysUntil } from "@/lib/dateUtils";
import { XIcon } from "./Icons";

export function WatchlistTab({
  watchlist,
  sessions,
  myCinemas,
  selectedId,
  onSelect,
  onUntrack,
}: {
  watchlist: WatchlistMovie[];
  sessions: JoinedSession[];
  myCinemas: Cinema[];
  selectedId: string | null;
  onSelect: (movieId: string) => void;
  onUntrack: (movieId: string) => void;
}) {
  const selected = watchlist.find((m) => m.id === selectedId) ?? null;
  const myCinemaIds = new Set(myCinemas.map((c) => c.id));

  const sessionsFor = (movieId: string) =>
    sessions.filter((s) => s.movieId === movieId && myCinemaIds.has(s.cinemaId));

  return (
    <div>
      <SectionHeading
        title="My Watchlist"
        subtitle="Movies you're keeping an eye on. Tap one to see its times at your cinemas, or its release countdown."
      />

      {watchlist.length === 0 ? (
        <EmptyState title="Your watchlist is empty." hint="Track a movie from the Releases tab to add it here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <ul className="flex flex-col gap-2">
            {watchlist.map((movie) => {
              const movieSessions = sessionsFor(movie.id);
              const isSelected = movie.id === selectedId;
              return (
                <li key={movie.id}>
                  <button
                    onClick={() => onSelect(movie.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      isSelected ? "border-accent-dim/60 bg-accent-soft/40" : "border-base-700 bg-base-900 hover:border-base-600"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-base-100">{movie.title}</p>
                      <p className="mt-0.5 text-xs text-base-500">
                        {movieSessions.length > 0
                          ? `${movieSessions.length} session(s) at your cinemas`
                          : `Releases ${formatDate(movie.releaseDate)}`}
                      </p>
                    </div>
                    <ReleaseTypeBadge type={movie.releaseType} />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="rounded-xl border border-base-700 bg-base-900 p-5">
            {!selected ? (
              <EmptyState title="Select a movie to see details." />
            ) : (
              <MovieDetail movie={selected} sessions={sessionsFor(selected.id)} onUntrack={() => onUntrack(selected.id)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MovieDetail({
  movie,
  sessions,
  onUntrack,
}: {
  movie: WatchlistMovie;
  sessions: JoinedSession[];
  onUntrack: () => void;
}) {
  const days = daysUntil(movie.releaseDate);

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
          className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-base-400 hover:border-red-800 hover:text-red-400"
        >
          <XIcon className="h-3.5 w-3.5" /> Untrack
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ReleaseTypeBadge type={movie.releaseType} />
        <span className="text-xs text-base-500">
          {movie.runtimeMinutes} min &middot; {movie.genres.join(", ")}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-base-700 bg-base-850 px-4 py-4 text-center">
          <p className="text-sm font-medium text-base-200">
            No session times published at your cinemas yet.
          </p>
          <p className="mt-1 text-xs text-base-500">
            {days >= 0 ? `In cinemas ${formatDate(movie.releaseDate)} (in ${days} day${days === 1 ? "" : "s"}).` : `Released ${formatDate(movie.releaseDate)}.`}
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-base-500">
            Session times at your cinemas
          </p>
          <ul className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-base-800 bg-base-850 px-3 py-2 text-sm"
              >
                <span className="text-base-200">{s.cinemaName}</span>
                <span className="text-base-400">
                  {formatDateTime(s.startsAt)} &middot; {s.format}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
