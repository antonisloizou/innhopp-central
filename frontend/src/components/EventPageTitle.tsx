import type { ReactNode } from 'react';
import type { EventStatus } from '../api/events';

type EventPageTitleEvent = {
  name: string;
  location?: string | null;
  status?: EventStatus | null;
  remaining_slots?: number | null;
};

type Props = {
  event: EventPageTitleEvent;
  section: string;
  showSlotsBadge?: boolean;
  showStatusBadge?: boolean;
  titleWrapper?: (title: ReactNode) => ReactNode;
};

const EventPageTitle = ({
  event,
  section,
  showSlotsBadge = false,
  showStatusBadge = true,
  titleWrapper
}: Props) => {
  const title = <h2 className="event-detail-title">{`${event.name}: ${section}`}</h2>;
  const remaining = Math.max(event.remaining_slots ?? 0, 0);
  const isFull = remaining === 0;
  const showSlots = showSlotsBadge && event.status !== 'past';

  return (
    <div className="event-schedule-headline-text">
      <div className="event-header-top">{titleWrapper ? titleWrapper(title) : title}</div>
      <p className="event-location">{event.location || 'Location TBD'}</p>
      {(showStatusBadge && event.status) || showSlots ? (
        <div className="event-detail-header-badges">
          {showStatusBadge && event.status ? <span className={`badge status-${event.status}`}>{event.status}</span> : null}
          {showSlots ? <span className={`badge ${isFull ? 'danger' : 'success'}`}>{isFull ? 'FULL' : `${remaining} SLOTS AVAILABLE`}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

export default EventPageTitle;
