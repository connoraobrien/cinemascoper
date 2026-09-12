import { Movie } from "@/lib/clientTypes";
import { formatDate, daysUntil } from "@/lib/dateUtils";
import { ReleaseTypeBadge } from "./ui";
import { PlusIcon, CheckIcon, EyeOffIcon } from "./Icons";

export function MovieCard({
  movie,
  tracked,
  onToggleTrack,
  onClick,
  onHide,
}: {
  movie: Movie;
  tracked: boolean;
  onToggleTrack: () => void;
  onClick?: () => void;
  onHide?: () => void;
}) {
  const releaseLabel = releaseCountdownLabel(movie.releaseDate);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-base-700 bg-base-900 transition-colors hover:border-base-600">
      {onHide && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          title="Hide this movie — stop showing it here and mute its alerts"
          className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-base-950/80 text-base-300 opacity-0 backdrop-blur transition-opacity hover:text-base-100 group-hover:opacity-100"
        >
          <EyeOffIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={onClick}
        // A real movie-poster ratio (2:3), not the old short widescreen strip — posterUrl is
        // already a portrait TMDB poster image, so bg-cover was cropping it awkwardly before.
        className={`aspect-[2/3] w-full bg-gradient-to-br ${movie.posterColor} bg-cover bg-center text-left`}
        style={movie.posterUrl ? { backgroundImage: `url(${movie.posterUrl})` } : undefined}
        aria-label={`${movie.title} details`}
      />
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onClick} className="text-left text-sm font-semibold leading-snug text-base-100 hover:text-accent">
            {movie.title}
          </button>
          <ReleaseTypeBadge type={movie.releaseType} />
        </div>

        <p className="text-xs text-base-500">
          {movie.director && <span>Dir. {movie.director}</span>}
          {movie.director && movie.runtimeMinutes > 0 && <span className="mx-1">&middot;</span>}
          {movie.runtimeMinutes > 0 && <span>{movie.runtimeMinutes} min</span>}
        </p>

        <p className="line-clamp-2 text-xs text-base-400">{movie.synopsis}</p>

        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="text-xs text-base-500">
            {movie.releaseDate ? (
              <>
                <span className="text-base-300">{formatDate(movie.releaseDate)}</span>
                <span className="mx-1">&middot;</span>
                <span>{releaseLabel}</span>
              </>
            ) : (
              <span>Yet to be announced</span>
            )}
          </div>
          <button
            onClick={onToggleTrack}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              tracked
                ? "border-accent-dim/50 bg-accent-soft text-accent"
                : "border-base-700 text-base-300 hover:border-base-600 hover:text-base-100"
            }`}
          >
            {tracked ? <CheckIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
            {tracked ? "Tracking" : "Track"}
          </button>
        </div>
      </div>
    </div>
  );
}

function releaseCountdownLabel(releaseDate: string): string {
  if (!releaseDate) return "TBA";
  const days = daysUntil(releaseDate);
  return days > 1 ? `in ${days} days` : days === 1 ? "tomorrow" : days === 0 ? "today" : `${Math.abs(days)}d ago`;
}
