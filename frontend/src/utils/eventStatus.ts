import type { Event } from '../api/events';
import { parseEventLocal } from './eventDate';

export const isPastEvent = (event: Event, now = Date.now()) => {
  if (event.status === 'past') return true;

  const ends = parseEventLocal(event.ends_at);
  const starts = parseEventLocal(event.starts_at);
  if (ends) return ends.getTime() < now;
  if (starts) return starts.getTime() < now;
  return false;
};
