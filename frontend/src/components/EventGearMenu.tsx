import { MouseEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { budgetsV1Enabled } from '../config/flags';
import { useAuth } from '../auth/AuthProvider';
import { isParticipantOnlySession } from '../auth/access';
import { exportInnhopp, getEvent, Innhopp } from '../api/events';
import { parseCoordinates } from '../utils/coordinates';
import { renderSatelliteMapForExport } from '../utils/innhoppExport';

export type EventGearMenuPage =
  | 'schedule'
  | 'print'
  | 'details'
  | 'route'
  | 'budget'
  | 'accounting'
  | 'registrations'
  | 'manifest'
  | 'communications'
  | 'checklists';

type EventGearMenuProps = {
  eventId: number;
  currentPage: EventGearMenuPage;
  copying?: boolean;
  deleting?: boolean;
  menuId?: string;
  onPrint?: () => void;
  onCopy?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  onDelete?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
};

const eventMenuPages: Array<{ key: EventGearMenuPage; label: string; path: (eventId: number) => string }> = [
  { key: 'schedule', label: 'Schedule', path: (eventId) => `/events/${eventId}` },
  { key: 'details', label: 'Details', path: (eventId) => `/events/${eventId}/details` },
  { key: 'checklists', label: 'Operational Checklists', path: (eventId) => `/events/${eventId}/checklists` },
  { key: 'route', label: 'Route', path: (eventId) => `/events/${eventId}/route` },
  { key: 'budget', label: 'Budget', path: (eventId) => `/events/${eventId}/budget` },
  { key: 'accounting', label: 'Accounting', path: (eventId) => `/events/${eventId}/accounting` },
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
  onPrint,
  onCopy,
  onDelete
}: EventGearMenuProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const participantOnly = isParticipantOnlySession(user);
  const forceDocumentNavigation = !!user?.impersonator || participantOnly;
  const [open, setOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ completed: number; total: number; current: string; failures: string[]; done: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const navigateTo = (path: string) => {
    if (forceDocumentNavigation) {
      window.location.assign(path);
      return;
    }
    navigate(path);
  };

  const downloadInnhoppExport = (innhopp: Innhopp, file: Blob) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${String(innhopp.sequence).padStart(2, '0')}-${innhopp.name || 'innhopp'}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportAll = async () => {
    if (exportProgress) return;
    setExportProgress({ completed: 0, total: 0, current: 'Loading Innhopps…', failures: [], done: false });
    try {
      const event = await getEvent(eventId);
      const innhopps = [...event.innhopps].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
      setExportProgress({ completed: 0, total: innhopps.length, current: 'Preparing export…', failures: [], done: false });

      const failures: string[] = [];
      for (let index = 0; index < innhopps.length; index += 1) {
        const innhopp = innhopps[index];
        setExportProgress({ completed: index, total: innhopps.length, current: innhopp.name || `Innhopp ${innhopp.sequence}`, failures: [...failures], done: false });
        try {
          const coordinates = parseCoordinates(innhopp.coordinates);
          if (!coordinates) throw new Error('A valid coordinate is required.');
          const [localMap, areaMap] = await Promise.all([
            renderSatelliteMapForExport(coordinates, 250),
            renderSatelliteMapForExport(coordinates, 1852)
          ]);
          downloadInnhoppExport(innhopp, await exportInnhopp(innhopp.id, localMap, areaMap));
        } catch (error) {
          failures.push(`${innhopp.name || `Innhopp ${innhopp.sequence}`}: ${error instanceof Error ? error.message : 'Export failed.'}`);
        }
        setExportProgress({ completed: index + 1, total: innhopps.length, current: innhopp.name || `Innhopp ${innhopp.sequence}`, failures: [...failures], done: index + 1 === innhopps.length });
      }
      if (innhopps.length === 0) {
        setExportProgress({ completed: 0, total: 0, current: 'This event has no Innhopps to export.', failures: [], done: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load Innhopps.';
      setExportProgress({
        completed: 0,
        total: 0,
        current: message,
        failures: [message],
        done: true
      });
    }
  };

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
            .filter((item) => !participantOnly || item.key === 'schedule' || item.key === 'route')
            .filter((item) => (budgetsV1Enabled ? true : item.key !== 'budget' && item.key !== 'accounting'))
            .filter((item) => item.key !== currentPage)
            .map((item) => (
              <button
                key={item.key}
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigateTo(item.path(eventId));
                }}
              >
                {item.label}
              </button>
            ))}
          {onPrint ? (
            <button
              className="event-schedule-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (forceDocumentNavigation) {
                  window.location.assign(`/events/${eventId}/print`);
                  return;
                }
                onPrint();
              }}
            >
              Print
            </button>
          ) : null}
          {!participantOnly ? (
            <>
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void handleExportAll();
                }}
                disabled={!!exportProgress}
              >
                Export all Innhopps
              </button>
              {onCopy ? <button
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
              </button> : null}
              {onDelete ? <button
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
              </button> : null}
            </>
          ) : null}
          <button
            className="event-schedule-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigateTo('/events');
            }}
          >
            Back
          </button>
        </div>
      )}
      {exportProgress && typeof document !== 'undefined'
        ? createPortal(
            <div className="innhopp-export-progress-backdrop" role="presentation">
              <section className="card innhopp-export-progress-panel" role="dialog" aria-modal="true" aria-labelledby="innhopp-export-progress-title">
                <h3 id="innhopp-export-progress-title">
                  {exportProgress.done
                    ? 'Innhopp export complete'
                    : 'Exporting Innhopps'}
                </h3>
                <p className="muted" aria-live="polite">
                  {exportProgress.total > 0
                    ? `${exportProgress.completed} of ${exportProgress.total}: ${exportProgress.current}`
                    : exportProgress.current}
                </p>
                <progress value={exportProgress.total > 0 ? exportProgress.completed : exportProgress.done ? 1 : 0} max={exportProgress.total || 1}>
                  {exportProgress.completed} of {exportProgress.total}
                </progress>
                {exportProgress.done ? (
                  <>
                    {exportProgress.total === 0 && exportProgress.failures.length === 0 ? null : exportProgress.failures.length > 0 ? (
                      <p className="error-text">
                        {exportProgress.failures.length} export{exportProgress.failures.length === 1 ? '' : 's'} failed. {exportProgress.failures.join(' ')}
                      </p>
                    ) : (
                      <p className="success-text">All Innhopps have been downloaded.</p>
                    )}
                    <div className="innhopp-export-progress-actions">
                      <button type="button" onClick={() => setExportProgress(null)}>Done</button>
                    </div>
                  </>
                ) : null}
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default EventGearMenu;
