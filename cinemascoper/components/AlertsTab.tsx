"use client";

import { useMemo, useState } from "react";
import { JoinedNotification, NotificationKind } from "@/lib/clientTypes";
import { EmptyState, Chip, IconButton, SectionHeading } from "./ui";
import { CheckIcon, TrashIcon } from "./Icons";
import { formatDate, formatDayLabel, formatRelative } from "@/lib/dateUtils";

type KindFilter = "all" | NotificationKind;

const KIND_LABEL: Record<NotificationKind, string> = {
  "new-session": "New sessions",
  "release-date-change": "Release date changes",
};

export function AlertsTab({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDeleteNotification,
  onClearAllNotifications,
}: {
  notifications: JoinedNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAllNotifications: () => void;
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const unread = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(
    () => (kindFilter === "all" ? notifications : notifications.filter((n) => n.kind === kindFilter)),
    [notifications, kindFilter]
  );

  const counts = useMemo(() => {
    const c: Record<NotificationKind, number> = { "new-session": 0, "release-date-change": 0 };
    for (const n of notifications) c[n.kind]++;
    return c;
  }, [notifications]);

  return (
    <div>
      <SectionHeading
        title="Alerts"
        subtitle="New session times and release-date changes for the movies you're tracking."
        action={
          notifications.length > 0 ? (
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-3 py-1.5 text-xs font-medium text-base-300 hover:border-base-600 hover:text-base-100"
                >
                  <CheckIcon className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm("Delete all alerts? This can't be undone.")) onClearAllNotifications();
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-base-700 px-3 py-1.5 text-xs font-medium text-base-300 hover:border-red-800 hover:text-red-400"
              >
                <TrashIcon className="h-3.5 w-3.5" /> Clear all
              </button>
            </div>
          ) : undefined
        }
      />

      {notifications.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            All ({notifications.length})
          </Chip>
          {(Object.keys(KIND_LABEL) as NotificationKind[]).map((k) => (
            <Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
              {KIND_LABEL[k]} ({counts[k]})
            </Chip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={notifications.length === 0 ? "No alerts yet." : "Nothing matches this filter."}
          hint={
            notifications.length === 0
              ? "You'll see alerts here as soon as your tracked cinemas publish new session times, or a tracked movie's release date changes."
              : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border px-4 py-3 ${
                n.read ? "border-base-800 bg-base-900/60" : "border-alert/40 bg-alert-soft/60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.read ? "text-base-300" : "text-base-100 font-medium"}`}>{n.message}</p>

                  {n.kind === "new-session" && n.cinemaGroups.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {n.cinemaGroups.map((g) => (
                        <li key={g.cinemaId} className="text-xs text-base-400">
                          <span className="text-base-200">{g.cinemaName}</span>: {g.dates.map(formatDayLabel).join(", ")}
                        </li>
                      ))}
                    </ul>
                  )}

                  {n.kind === "release-date-change" && (
                    <p className="mt-1.5 text-xs text-base-400">
                      {n.previousReleaseDate ? formatDate(n.previousReleaseDate) : "TBA"} &rarr;{" "}
                      <span className="text-base-200">{n.newReleaseDate ? formatDate(n.newReleaseDate) : "TBA"}</span>
                    </p>
                  )}

                  <p className="mt-1.5 text-xs text-base-500">{formatRelative(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!n.read && (
                    <button
                      onClick={() => onMarkRead(n.id)}
                      className="rounded-lg border border-base-700 px-2 py-1 text-xs text-base-300 hover:border-base-600 hover:text-base-100"
                    >
                      Mark read
                    </button>
                  )}
                  <IconButton title="Delete this alert" variant="danger" onClick={() => onDeleteNotification(n.id)}>
                    <TrashIcon className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
