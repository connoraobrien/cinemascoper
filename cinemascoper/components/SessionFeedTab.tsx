"use client";

import { JoinedNotification, JoinedSession } from "@/lib/clientTypes";
import { EmptyState, SectionHeading } from "./ui";
import { CheckIcon, ClockIcon } from "./Icons";
import { formatDateTime, formatRelative } from "@/lib/dateUtils";

export function SessionFeedTab({
  notifications,
  sessions,
  myCinemaIds,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: JoinedNotification[];
  sessions: JoinedSession[];
  myCinemaIds: Set<string>;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const unread = notifications.filter((n) => !n.read).length;
  const matchedUpcoming = sessions.filter((s) => myCinemaIds.has(s.cinemaId)).slice(0, 30);

  return (
    <div>
      <SectionHeading
        title="Session Times Feed"
        subtitle="Alerts fired by your tracking rules, plus every upcoming session at your cinemas."
        action={
          unread > 0 ? (
            <button
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-3 py-1.5 text-xs font-medium text-base-300 hover:border-base-600 hover:text-base-100"
            >
              <CheckIcon className="h-3.5 w-3.5" /> Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-base-500">Alerts</div>
      {notifications.length === 0 ? (
        <EmptyState
          title="No alerts yet."
          hint={`Run a check (top right) to simulate your cinemas publishing new session times.`}
        />
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {notifications.slice(0, 40).map((n) => (
            <li
              key={n.id}
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
                n.read ? "border-base-800 bg-base-900/60" : "border-alert/40 bg-alert-soft/60"
              }`}
            >
              <div>
                <p className={`text-sm ${n.read ? "text-base-300" : "text-base-100 font-medium"}`}>{n.message}</p>
                <p className="mt-1 text-xs text-base-500">
                  {n.ruleType === "blanket" ? "Blanket rule" : "Targeted rule"} &middot; {formatRelative(n.createdAt)}
                </p>
              </div>
              {!n.read && (
                <button
                  onClick={() => onMarkRead(n.id)}
                  className="shrink-0 rounded-lg border border-base-700 px-2 py-1 text-xs text-base-300 hover:border-base-600 hover:text-base-100"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-base-500">Upcoming at your cinemas</div>
      {matchedUpcoming.length === 0 ? (
        <EmptyState title="Nothing scheduled yet at your cinemas." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {matchedUpcoming.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-base-800 bg-base-900 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2 text-sm">
                <ClockIcon className="h-4 w-4 text-base-500" />
                <span className="font-medium text-base-100">{s.movieTitle}</span>
                <span className="text-base-500">at</span>
                <span className="text-base-300">{s.cinemaName}</span>
              </div>
              <div className="text-xs text-base-400">
                {formatDateTime(s.startsAt)} &middot; {s.format}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
