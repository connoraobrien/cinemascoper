// Shapes returned by /api/state, shared across client components.
// Deliberately re-declared (rather than importing AppState from lib/apiState,
// which pulls in `fs`/`path` via lib/store) so client components never
// accidentally bundle server-only code.

import { Movie, Cinema, AlertRule, Session, AppNotification, ReleaseType, CinemaProvider } from "./types";

export type { Movie, Cinema, AlertRule, Session, AppNotification, ReleaseType, CinemaProvider };

export interface WatchlistMovie extends Movie {
  addedAt: string;
}

export interface JoinedAlertRule extends AlertRule {
  cinemaName: string;
  movieTitle?: string;
}

export interface JoinedSession extends Session {
  movieTitle: string;
  cinemaName: string;
}

export interface JoinedNotification extends AppNotification {
  movieTitle: string;
  cinemaName: string;
}

export interface AppState {
  movies: Movie[];
  cinemas: Cinema[];
  watchlist: WatchlistMovie[];
  alertRules: JoinedAlertRule[];
  sessions: JoinedSession[];
  notifications: JoinedNotification[];
  unreadCount: number;
  lastPollAt: string | null;
}

export interface PollSummary {
  ranAt: string;
  cinemasChecked: number;
  newSessions: Session[];
  newNotifications: AppNotification[];
}
