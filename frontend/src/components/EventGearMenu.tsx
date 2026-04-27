import { MouseEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { budgetsV1Enabled } from '../config/flags';

export type EventGearMenuPage =
  | 'schedule'
  | 'details'
  | 'route'
  | 'budget'
  | 'registrations'
  | 'manifest'
  | 'communications';

type EventGearMenuProps = {
  eventId: number;
  currentPage: EventGearMenuPage;
  copying?: boolean;
  deleting?: boolean;
  menuId?: string;
  onCopy: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  onDelete: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
};

const eventMenuPages: Array<{ key: EventGearMenuPage; label: string; path: (eventId: number) => string }> = [
  { key: 'schedule', label: 'Schedule', path: (eventId) => `/events/${eventId}` },
  { key: 'details', label: 'Details', path: (eventId) => `/events/${eventId}/details` },
  { key: 'route', label: 'Route', path: (eventId) => `/events/${eventId}/route` },
  { key: 'budget', label: 'Budget', path: (eventId) => `/events/${eventId}/budget` },
  { key: 'registrations', label: 'Registrations', path: (eventId) => `/events/${eventId}/registrations` },
  { key: 'manifest', label: 'Manifest', path: (eventId) => `/manifests?eventId=${eventId}` },
  { key: 'communications', label: 'Communications', path: (eventId) => `/events/${eventId}/comms` }
];

const EventGearMenu = ({
  eventId,
  currentPage,
  copying = false,
  deleting = false,
  menuId = `event-${currentPage}-actions-menu`,
  onCopy,
  onDelete
}: EventGearMenuProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!menuRef.current || !target) return;
      if (!menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="event-schedule-actions" ref={menuRef}>
      <button
        className="ghost event-schedule-gear"
        type="button"
        aria-label={open ? 'Close actions menu' : 'Open actions menu'}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.06.73 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.22 1.12-.52 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
        </svg>
      </button>
      {open && (
        <div className="event-schedule-menu" id={menuId} role="menu">
          {eventMenuPages
            .filter((item) => (budgetsV1Enabled ? true : item.key !== 'budget'))
            .filter((item) => item.key !== currentPage)
            .map((item) => (
              <button
                key={item.key}
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate(item.path(eventId));
                }}
              >
                {item.label}
              </button>
            ))}
          <button
            className="event-schedule-menu-item"
            type="button"
            role="menuitem"
            onClick={(event) => {
              setOpen(false);
              void onCopy(event);
            }}
            disabled={copying}
          >
            {copying ? 'Copying...' : 'Copy'}
          </button>
          <button
            className="event-schedule-menu-item danger"
            type="button"
            role="menuitem"
            onClick={(event) => {
              setOpen(false);
              void onDelete(event);
            }}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button
            className="event-schedule-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/events');
            }}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
};

export default EventGearMenu;
