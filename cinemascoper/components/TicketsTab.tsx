"use client";

import { JoinedSession } from "@/lib/clientTypes";
import { EmptyState, SectionHeading } from "./ui";
import { SessionList } from "./SessionList";

/**
 * "My Tickets" — a simple itinerary of screenings Connor's actually booked
 * (via the "Got tickets?" toggle on any session row elsewhere in the app),
 * distinct from the watchlist/tracking machinery: this is just "what am I
 * actually going to", sorted soonest-first.
 */
export function TicketsTab({
  tickets,
  onTogglePurchased,
}: {
  tickets: JoinedSession[];
  onTogglePurchased: (sessionId: string) => void;
}) {
  return (
    <div>
      <SectionHeading
        title="My Tickets"
        subtitle="Sessions you've marked as booked — tap “Got tickets” on any session elsewhere in the app to add one here."
      />
      {tickets.length === 0 ? (
        <EmptyState
          title="No booked sessions yet."
          hint="Find a session in Sessions, Watchlist or Release Radar and tap “Got tickets?” to add it here."
        />
      ) : (
        <SessionList sessions={tickets} showMovieTitle onTogglePurchased={onTogglePurchased} />
      )}
    </div>
  );
}
