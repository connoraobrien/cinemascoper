"use client";

import { BellIcon, FilmIcon, RefreshIcon } from "./Icons";
import { formatRelative } from "@/lib/dateUtils";

export type TabKey = "releases" | "matrix" | "feed" | "watchlist";

const TABS: { key: TabKey; label: string }[] = [
  { key: "releases", label: "Upcoming Releases" },
  { key: "matrix", label: "Tracking Matrix" },
  { key: "feed", label: "Session Times Feed" },
  { key: "watchlist", label: "Watchlist" },
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
            <FilmIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-base-100">CinemaScoper</p>
            <p className="text-[11px] leading-tight text-base-500">AU release radar &amp; session alerts</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTabChange("feed")}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-base-700 text-base-300 hover:border-base-600 hover:text-base-100"
            title="Session times feed"
          >
            <BellIcon className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-alert px-1 text-[10px] font-semibold text-base-950">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={onRunCheck}
            disabled={polling}
            className="inline-flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-sm font-medium text-base-200 hover:border-base-600 disabled:opacity-60"
            title="Simulate a background check for new session times"
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
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === t.key ? "bg-base-800 text-base-100" : "text-base-400 hover:text-base-200"
            }`}
          >
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
