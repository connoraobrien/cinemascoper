// Shapes returned by /api/state, shared across client components.
// Deliberately re-declared (rather than importing AppState from lib/apiState,
// which pulls in `fs`/`path` via lib/store) so client components never
// accidentally bundle server-only code.

import {
  Movie,
  Cinema,
  AlertRule,
  Session,
  AppNotification,
  NotificationKind,
  ReleaseType,
  CinemaProvider,
  SessionFormat,
} from "./types";

export type {
  Movie,
  Cinema,
  AlertRule,
  Session,
  AppNotification,
  NotificationKind,
  ReleaseType,
  CinemaProvider,
  SessionFormat,
};

export interface WatchlistMovie extends Movie {
  addedAt: string;
}

export interface JoinedAlertRule extends AlertRule {
  cinemaName: string;
  movieTitle?: string;
}

export interface JoinedSession extends Session {
  movieTitle: string;
  movieDirector?: string;
  movieReleaseDate: string;
  cinemaName: string;
  isReleaseDay: boolean;
  isReRelease: boolean;
  ticketPurchased: boolean;
}

export interface NotificationCinemaGroup {
  cinemaId: string;
  cinemaName: string;
  dates: string[]; // "YYYY-MM-DD", ascending
}

export interface JoinedNotification extends AppNotification {
  movieTitle: string;
  cinemaGroups: NotificationCinemaGroup[]; // "new-session" kind only
  message: string;
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
  hiddenMovies: Movie[];
  myTickets: JoinedSession[];
  storage: "kv" | "file";
}

export interface PollSummary {
  ranAt: string;
  cinemasChecked: number;
  newSessions: Session[];
  newNotifications: AppNotification[];
}
