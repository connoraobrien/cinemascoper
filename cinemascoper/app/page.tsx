"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "@/lib/clientTypes";
import { Nav, TabKey } from "@/components/Nav";
import { ReleasesTab } from "@/components/ReleasesTab";
import { SettingsTab } from "@/components/SettingsTab";
import { AlertsTab } from "@/components/AlertsTab";
import { SessionTimesTab } from "@/components/SessionTimesTab";
import { WatchlistTab } from "@/components/WatchlistTab";
import { TicketsTab } from "@/components/TicketsTab";

// How often the dashboard re-checks in the background while the tab is
// open (a real /api/poll call, not a simulation). In production,
// `vercel.json`'s cron hits the same endpoint on its own schedule
// regardless of whether anyone has the app open — this client-side
// interval is just an extra, more frequent check while you're looking at it.
const AUTO_POLL_MS = 45_000;

async function jsonFetch<T = AppState>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("alerts");
  const [polling, setPolling] = useState(false);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await jsonFetch<AppState>("/api/state");
      setState(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CinemaScoper.");
    }
  }, []);

  const runCheck = useCallback(async () => {
    setPolling(true);
    try {
      const { state: next } = await jsonFetch<{ state: AppState }>("/api/poll", { method: "POST" });
      setState(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Background check failed.");
    } finally {
      setPolling(false);
    }
  }, []);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      runCheck();
    }, AUTO_POLL_MS);
    return () => clearInterval(id);
  }, [runCheck]);

  const toggleTrack = useCallback(
    async (movieId: string) => {
      if (!state) return;
      const isTracked = state.watchlist.some((m) => m.id === movieId);
      const next = isTracked
        ? await jsonFetch(`/api/watchlist?movieId=${encodeURIComponent(movieId)}`, { method: "DELETE" })
        : await jsonFetch("/api/watchlist", { method: "POST", body: JSON.stringify({ movieId }) });
      setState(next);
    },
    [state]
  );

  // Adding a movie found via the "search all of TMDB" box: first make sure
  // the app knows about it at all (it may be well outside the normal
  // discover window — see lib/allMovies.ts), then track it, same as any
  // other movie.
  const addMovieByTmdbId = useCallback(async (tmdbId: number) => {
    await jsonFetch("/api/movies", { method: "POST", body: JSON.stringify({ tmdbId }) });
    const movieId = `tmdb-${tmdbId}`;
    const next = await jsonFetch<AppState>("/api/watchlist", { method: "POST", body: JSON.stringify({ movieId }) });
    setState(next);
    setSelectedWatchlistId(movieId);
    setTab("watchlist");
  }, []);

  const hideMovie = useCallback(async (movieId: string) => {
    const next = await jsonFetch<AppState>("/api/hidden-movies", { method: "POST", body: JSON.stringify({ movieId }) });
    setState(next);
  }, []);

  const unhideMovie = useCallback(async (movieId: string) => {
    const next = await jsonFetch<AppState>(`/api/hidden-movies?movieId=${encodeURIComponent(movieId)}`, {
      method: "DELETE",
    });
    setState(next);
  }, []);

  // Toggling "Got tickets?" on any session row across the app — the same
  // handler backs Session Times, Watchlist, the Release Radar preview, and
  // My Tickets, since they all render sessions through the shared
  // SessionList component.
  const togglePurchased = useCallback(
    async (sessionId: string) => {
      if (!state) return;
      const isPurchased = state.myTickets.some((s) => s.id === sessionId);
      const next = isPurchased
        ? await jsonFetch<AppState>(`/api/tickets?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" })
        : await jsonFetch<AppState>("/api/tickets", { method: "POST", body: JSON.stringify({ sessionId }) });
      setState(next);
    },
    [state]
  );

  const addCinema = useCallback(
    async (input: { name: string; city: string; suburb: string; provider: string; providerId: string }) => {
      const next = await jsonFetch<AppState>("/api/cinemas", { method: "POST", body: JSON.stringify(input) });
      setState(next);
    },
    []
  );

  const removeCinema = useCallback(async (cinemaId: string) => {
    const next = await jsonFetch<AppState>(`/api/cinemas?cinemaId=${encodeURIComponent(cinemaId)}`, {
      method: "DELETE",
    });
    setState(next);
  }, []);

  const addRule = useCallback(
    async (input: { cinemaId: string; type: "blanket" | "targeted"; movieId?: string }) => {
      const next = await jsonFetch<AppState>("/api/alert-rules", { method: "POST", body: JSON.stringify(input) });
      setState(next);
    },
    []
  );

  const removeRule = useCallback(async (id: string) => {
    const next = await jsonFetch<AppState>(`/api/alert-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setState(next);
  }, []);

  const markRead = useCallback(async (id: string) => {
    const next = await jsonFetch<AppState>("/api/notifications", { method: "POST", body: JSON.stringify({ id }) });
    setState(next);
  }, []);

  const markAllRead = useCallback(async () => {
    const next = await jsonFetch<AppState>("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) });
    setState(next);
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    const next = await jsonFetch<AppState>(`/api/notifications?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setState(next);
  }, []);

  const clearAllNotifications = useCallback(async () => {
    const next = await jsonFetch<AppState>("/api/notifications?all=true", { method: "DELETE" });
    setState(next);
  }, []);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-base-400">
        {error ? (
          <div className="text-center">
            <p className="text-sm font-medium text-red-400">{error}</p>
            <button onClick={refresh} className="mt-3 rounded-lg border border-base-700 px-3 py-1.5 text-sm hover:border-base-600">
              Retry
            </button>
          </div>
        ) : (
          <p className="text-sm">Loading CinemaScoper…</p>
        )}
      </div>
    );
  }

  const trackedIds = new Set(state.watchlist.map((m) => m.id));
  const myCinemaIds = new Set(state.cinemas.map((c) => c.id));

  return (
    <div className="min-h-screen">
      <Nav
        activeTab={tab}
        onTabChange={setTab}
        unreadCount={state.unreadCount}
        lastPollAt={state.lastPollAt}
        polling={polling}
        onRunCheck={runCheck}
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {tab === "alerts" && (
          <AlertsTab
            notifications={state.notifications}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onDeleteNotification={deleteNotification}
            onClearAllNotifications={clearAllNotifications}
          />
        )}

        {tab === "sessions" && (
          <SessionTimesTab
            sessions={state.sessions}
            myCinemas={state.cinemas}
            watchlistIds={trackedIds}
            onTogglePurchased={togglePurchased}
            onHideMovie={hideMovie}
          />
        )}

        {tab === "releases" && (
          <ReleasesTab
            movies={state.movies}
            trackedIds={trackedIds}
            sessions={state.sessions}
            myCinemaIds={myCinemaIds}
            onToggleTrack={toggleTrack}
            onHide={hideMovie}
            onTogglePurchased={togglePurchased}
          />
        )}

        {tab === "watchlist" && (
          <WatchlistTab
            watchlist={state.watchlist}
            sessions={state.sessions}
            myCinemas={state.cinemas}
            selectedId={selectedWatchlistId}
            onSelect={setSelectedWatchlistId}
            onUntrack={toggleTrack}
            onAddMovie={addMovieByTmdbId}
            onHideMovie={hideMovie}
            onTogglePurchased={togglePurchased}
          />
        )}

        {tab === "tickets" && <TicketsTab tickets={state.myTickets} onTogglePurchased={togglePurchased} />}

        {tab === "settings" && (
          <SettingsTab
            cinemas={state.cinemas}
            watchlist={state.watchlist}
            alertRules={state.alertRules}
            storage={state.storage}
            hiddenMovies={state.hiddenMovies}
            onAddCinema={addCinema}
            onRemoveCinema={removeCinema}
            onAddRule={addRule}
            onRemoveRule={removeRule}
            onUnhideMovie={unhideMovie}
          />
        )}
      </main>
    </div>
  );
}
