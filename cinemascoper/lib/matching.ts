import { AlertRule, Session, WatchlistEntry } from "./types";

export interface MatchResult {
  rule: AlertRule;
  reason: string;
}

/**
 * Which of the user's alert rules should fire for a freshly-discovered
 * session? Mirrors the two tracking modes from the spec:
 *  - "blanket": alert for ANY new session at a selected cinema.
 *  - "targeted": alert ONLY when that cinema publishes times for one
 *    specific watchlisted movie.
 */
export function matchRulesForSession(
  session: Session,
  rules: AlertRule[],
  watchlist: WatchlistEntry[]
): MatchResult[] {
  const isWatchlisted = watchlist.some((w) => w.movieId === session.movieId);
  const results: MatchResult[] = [];

  for (const rule of rules) {
    if (rule.cinemaId !== session.cinemaId) continue;

    if (rule.type === "blanket") {
      results.push({ rule, reason: "blanket-cinema-match" });
      continue;
    }

    // targeted
    if (rule.movieId === session.movieId && isWatchlisted) {
      results.push({ rule, reason: "targeted-movie-match" });
    }
  }

  return results;
}
