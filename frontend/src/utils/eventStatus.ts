import type { Event, EventStatus } from '../api/events';
import { parseEventLocal } from './eventDate';

export const isPastEvent = (event: Event, now = Date.now()) => {
  if (event.status === 'past') return true;

  const ends = parseEventLocal(event.ends_at);
  const starts = parseEventLocal(event.starts_at);
  if (ends) return ends.getTime() < now;
  if (starts) return starts.getTime() < now;
  return false;
};

/** Whether an event has reached the lifecycle stage where participant payments are actionable. */
export const isEventLaunchedOrLater = (status: EventStatus | null | undefined) =>
  status === 'launched' || status === 'scouted' || status === 'live' || status === 'past';
