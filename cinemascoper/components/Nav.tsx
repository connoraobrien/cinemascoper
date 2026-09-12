"use client";

import { ReactNode } from "react";
import { BellIcon, BookmarkIcon, ClockIcon, FilmIcon, GearIcon, RefreshIcon, ScopeReelLogo, TicketIcon } from "./Icons";
import { formatRelative } from "@/lib/dateUtils";

export type TabKey = "alerts" | "sessions" | "releases" | "watchlist" | "tickets" | "settings";

// Ordered the way Connor actually reaches for them day to day — Alerts
// first, cinema/rule management tucked away behind the gear icon instead
// (see the Settings button below) rather than taking up a tab he said he
// won't use as often. Short labels (fit on one line at any width) each
// paired with an icon, per Connor's ask.
const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: "alerts", label: "Alerts", icon: <BellIcon className="h-3.5 w-3.5" /> },
  { key: "sessions", label: "Sessions", icon: <ClockIcon className="h-3.5 w-3.5" /> },
  { key: "releases", label: "Releases", icon: <FilmIcon className="h-3.5 w-3.5" /> },
  { key: "watchlist", label: "Watchlist", icon: <BookmarkIcon className="h-3.5 w-3.5" /> },
  { key: "tickets", label: "My Tickets", icon: <TicketIcon className="h-3.5 w-3.5" /> },
];

export function Nav({
  activeTab,
  onTabChange,
  unreadCount,
  lastPollAt,
  polling,
  onRunCheck,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  unreadCount: number;
  lastPollAt: string | null;
  polling: boolean;
  onRunCheck: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-base-800 bg-base-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ScopeReelLogo className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-base font-semibold leading-tight tracking-wide text-base-100">
              CinemaScoper
            </p>
            <p className="text-[11px] leading-tight text-base-500">AU release radar &amp; session alerts</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTabChange("alerts")}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-base-700 text-base-300 hover:border-base-600 hover:text-base-100"
            title="Alerts"
          >
            <BellIcon className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-alert px-1 text-[10px] font-semibold text-base-950">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange("settings")}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-base-300 hover:border-base-600 hover:text-base-100 ${
              activeTab === "settings" ? "border-accent-dim/60 bg-accent-soft text-accent" : "border-base-700"
            }`}
            title="Settings — manage cinemas & alert rules"
          >
            <GearIcon className="h-4 w-4" />
          </button>

          <button
            onClick={onRunCheck}
            disabled={polling}
            className="inline-flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-sm font-medium text-base-200 hover:border-base-600 disabled:opacity-60"
            title="Check your cinemas for new session times right now"
          >
            <RefreshIcon className={`h-4 w-4 ${polling ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{polling ? "Checking…" : "Run check now"}</span>
          </button>
        </div>
      </div>

      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === t.key ? "bg-base-800 text-base-100" : "text-base-400 hover:text-base-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 self-center text-xs text-base-500 sm:inline">
          {lastPollAt ? `Last checked ${formatRelative(lastPollAt)}` : "Not checked yet"}
        </span>
      </nav>
    </header>
  );
}
