import { createPortal } from 'react-dom';
import { formatEventLocal, getEventLocalTimeParts } from '../utils/eventDate';
import { computeDisplayFlightTimeMinutes } from '../utils/innhoppFlightTime';
import { formatMetersWithFeet } from '../utils/units';
import { EntryType, ScheduleEntry } from './schedulePreviewTypes';

const formatDurationMinutes = (minutes?: number | null) => {
  if (!Number.isFinite(minutes) || (minutes as number) <= 0) return 'Unavailable';
  const total = minutes as number;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '';
  const parts = getEventLocalTimeParts(iso);
  if (!parts) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = formatEventLocal(iso, { year: 'numeric', month: 'short', day: 'numeric' });
  if (!day) return '';
  return `${day}, ${pad(parts.hour)}:${pad(parts.minute)}`;
};

type Props = {
  entry: ScheduleEntry;
  closing: boolean;
  onClose: () => void;
  onNavigateToEntry?: (entry: ScheduleEntry) => void;
  canOpenMapsActions: boolean;
  typeBadgeClassNames: Record<EntryType, string>;
};

const ScheduleEntryPreviewOverlay = ({
  entry,
  closing,
  onClose,
  onNavigateToEntry,
  canOpenMapsActions,
  typeBadgeClassNames
}: Props) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      role="button"
      tabIndex={-1}
      className={`event-schedule-preview-backdrop${closing ? ' event-schedule-preview-backdrop--closing' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div
        className={`card overlay-panel-with-close event-schedule-preview-panel${closing ? ' event-schedule-preview-panel--closing' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <button
          type="button"
          className="overlay-close-button overlay-close-top-left"
          aria-label="Close overlay"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
        <div className="card-header event-schedule-preview-header">
          <h3 className="event-schedule-preview-title">{entry.title}</h3>
          <div className="event-schedule-preview-badges">
            {(() => {
              if (entry.type === 'Transport' || entry.type === 'Ground Crew') {
                return (
                  <>
                    <span className={`badge ${entry.transportComplete ? 'success' : 'danger'} event-schedule-preview-status-badge`}>
                      {entry.transportComplete ? '✓' : '!'}
                    </span>
                    <span className={`badge ${typeBadgeClassNames[entry.type]}`}>{entry.type}</span>
                  </>
                );
              }
              if (entry.type === 'Accommodation') {
                return (
                  <>
                    <span
                      className={`badge ${entry.booked && !entry.missingCoordinates ? 'success' : 'danger'} event-schedule-preview-status-badge`}
                    >
                      {entry.booked && !entry.missingCoordinates ? '✓' : '!'}
                    </span>
                    <span className={`badge ${typeBadgeClassNames[entry.type]}`}>{entry.type}</span>
                  </>
                );
              }
              if (entry.type === 'Innhopp') {
                return (
                  <>
                    <span className={`badge ${entry.ready ? 'success' : 'danger'} event-schedule-preview-status-badge`}>
                      {entry.ready ? '✓' : '!'}
                    </span>
                    <span className={`badge ${typeBadgeClassNames[entry.type]}`}>{entry.type}</span>
                  </>
                );
              }
              if (entry.type === 'Other') {
                return (
                  <>
                    <span className={`badge ${entry.otherComplete ? 'success' : 'danger'} event-schedule-preview-status-badge`}>
                      {entry.otherComplete ? '✓' : '!'}
                    </span>
                    <span className={`badge ${typeBadgeClassNames[entry.type]}`}>{entry.type}</span>
                  </>
                );
              }
              if (entry.type === 'Meal') {
                return (
                  <>
                    <span className={`badge ${entry.mealComplete ? 'success' : 'danger'} event-schedule-preview-status-badge`}>
                      {entry.mealComplete ? '✓' : '!'}
                    </span>
                    <span className={`badge ${typeBadgeClassNames[entry.type]}`}>{entry.type}</span>
                  </>
                );
              }
              return null;
            })()}
          </div>
        </div>
        <div className="card-body event-schedule-preview-grid">
          {(() => {
            const renderField = (key: string, label: string, value: React.ReactNode) => (
              <div key={key}>
                <div className="muted event-schedule-preview-label">{label}</div>
                <div>{value ?? '—'}</div>
              </div>
            );

            if (entry.type === 'Innhopp') {
              const fields: React.ReactNode[] = [];
              if (entry.scheduledAt) {
                fields.push(renderField('scheduled_at', 'SCHEDULED AT', formatDateTime(entry.scheduledAt)));
              }
              fields.push(renderField('elevation', 'ELEVATION', entry.innhoppElevation != null ? formatMetersWithFeet(entry.innhoppElevation) : '—'));
              const flightTimeMinutes = computeDisplayFlightTimeMinutes(
                entry.innhoppDistanceByAir,
                entry.innhoppAircraftSpeedKmh,
                entry.innhoppMinimumLoadDuration
              );
              fields.push(renderField('flight_time', 'FLIGHT TIME', flightTimeMinutes != null ? formatDurationMinutes(flightTimeMinutes) : '—'));
              if (entry.innhoppAircraftWarning) {
                fields.push(renderField('aircraft_warning', 'AIRCRAFT WARNING', entry.innhoppAircraftWarning));
              }
              fields.push(renderField('takeoff', 'TAKEOFF AIRFIELD', entry.innhoppTakeoffName || '—'));
              fields.push(
                renderField(
                  'elevation_diff',
                  'ELEVATION DIFFERENCE',
                  entry.innhoppElevationDiff != null ? formatMetersWithFeet(entry.innhoppElevationDiff) : '—'
                )
              );
              fields.push(renderField('landing_airfield', 'LANDING AIRFIELD', entry.innhoppLandingName || '—'));
              fields.push(
                renderField(
                  'primary',
                  'PRIMARY AREA',
                  entry.innhoppPrimaryName ? `${entry.innhoppPrimaryName}${entry.innhoppPrimarySize ? ` (${entry.innhoppPrimarySize})` : ''}` : '—'
                )
              );
              fields.push(
                renderField(
                  'secondary',
                  'SECONDARY AREA',
                  entry.innhoppSecondaryName
                    ? `${entry.innhoppSecondaryName}${entry.innhoppSecondarySize ? ` (${entry.innhoppSecondarySize})` : ''}`
                    : '—'
                )
              );
              fields.push(renderField('risk', 'RISK ASSESSMENT', entry.innhoppRisk || '—'));
              fields.push(renderField('minimum', 'MINIMUM REQUIREMENTS', entry.innhoppMinimumRequirements || '—'));
              fields.push(renderField('notes', 'NOTES', entry.notes || '—'));
              fields.push(
                renderField(
                  'landowners',
                  'LANDOWNERS PERMISSION',
                  entry.innhoppLandOwnerPermission == null ? '—' : entry.innhoppLandOwnerPermission ? 'Yes' : 'No'
                )
              );
              if ((entry.innhoppCoordinates && canOpenMapsActions) || (entry.to && onNavigateToEntry)) {
                fields.push(
                  <div key="actions" className="event-schedule-preview-action-grid form-field-full-span">
                    <div className="event-schedule-preview-action-row">
                      {entry.innhoppCoordinates && canOpenMapsActions ? (
                        <button
                          type="button"
                          className="link-button event-schedule-preview-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.innhoppCoordinates || '')}`,
                              '_blank'
                            );
                          }}
                        >
                          Open in Maps
                        </button>
                      ) : null}
                      {entry.to && onNavigateToEntry ? (
                        <button
                          type="button"
                          className="link-button event-schedule-preview-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToEntry(entry);
                            onClose();
                          }}
                        >
                          Open details
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              }
              return fields;
            }

            return (
              <>
                {entry.type === 'Accommodation' ? (
                  <>
                    <div>
                      <div className="muted event-schedule-preview-label">BOOKED</div>
                      <div>{entry.booked ? 'Yes' : 'No'}</div>
                    </div>
                    {entry.scheduledAt ? (
                      <div>
                        <div className="muted event-schedule-preview-label">SCHEDULED AT</div>
                        <div>{formatDateTime(entry.scheduledAt)}</div>
                      </div>
                    ) : null}
                    <div>
                      <div className="muted event-schedule-preview-label">NOTES</div>
                      <div>{entry.notes || '—'}</div>
                    </div>
                    <div className="form-field-full-span event-schedule-preview-action-row">
                      {entry.coordinates && canOpenMapsActions ? (
                        <button
                          type="button"
                          className="link-button event-schedule-preview-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.coordinates || '')}`,
                              '_blank'
                            );
                          }}
                        >
                          Open in Maps
                        </button>
                      ) : null}
                      {entry.to && onNavigateToEntry ? (
                        <button
                          type="button"
                          className="link-button event-schedule-preview-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToEntry(entry);
                            onClose();
                          }}
                        >
                          Open details
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    {entry.type === 'Transport' || entry.type === 'Ground Crew' ? (
                      <div>
                        <div className="muted event-schedule-preview-label">DURATION</div>
                        <div>{entry.routeDurationLabel || 'Unavailable'}</div>
                      </div>
                    ) : entry.subtitle ? (
                      <div>
                        <div className="muted event-schedule-preview-label">SUBTITLE</div>
                        <div>{entry.subtitle}</div>
                      </div>
                    ) : null}
                    {entry.type === 'Meal' && (
                      <div>
                        <div className="muted event-schedule-preview-label">LOCATION</div>
                        <div>{entry.location || '—'}</div>
                      </div>
                    )}
                    {entry.scheduledAt ? (
                      <div>
                        <div className="muted event-schedule-preview-label">SCHEDULED AT</div>
                        <div>{formatDateTime(entry.scheduledAt)}</div>
                      </div>
                    ) : null}
                    <div>
                      <div className="muted event-schedule-preview-label">NOTES</div>
                      <div>{entry.notes || '—'}</div>
                    </div>
                    {(entry.type === 'Transport' || entry.type === 'Ground Crew') && entry.vehicles ? (
                      <div>
                        <div className="muted event-schedule-preview-label">VEHICLES</div>
                        <div className="event-schedule-preview-subsection">
                          {entry.vehicles.length === 0 ? (
                            <div className="muted">—</div>
                          ) : (
                            entry.vehicles.map((v, idx) => (
                              <div key={idx} className="muted">
                                <strong>{v.name}</strong>
                                {v.driver ? ` (Driver: ${v.driver})` : ''}
                                {typeof v.passenger_capacity === 'number' ? ` • Capacity: ${v.passenger_capacity}` : ''}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                    {((canOpenMapsActions &&
                    (entry.type === 'Transport' || entry.type === 'Ground Crew') &&
                    entry.transportRouteOrigin &&
                    entry.transportRouteDestination) || (entry.to && onNavigateToEntry)) ? (
                      <div className="form-field-full-span event-schedule-preview-action-row">
                        {canOpenMapsActions &&
                        (entry.type === 'Transport' || entry.type === 'Ground Crew') &&
                        entry.transportRouteOrigin &&
                        entry.transportRouteDestination ? (
                          <button
                            type="button"
                            className="link-button event-schedule-preview-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(entry.transportRouteOrigin || '')}&destination=${encodeURIComponent(entry.transportRouteDestination || '')}`,
                                '_blank'
                              );
                            }}
                          >
                            Open route
                          </button>
                        ) : null}
                        {entry.to && onNavigateToEntry ? (
                          <button
                            type="button"
                            className="link-button event-schedule-preview-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToEntry(entry);
                              onClose();
                            }}
                          >
                            Open details
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {entry.type === 'Other' && (entry.coordinates && canOpenMapsActions || (entry.to && onNavigateToEntry)) ? (
                      <div className="form-field-full-span event-schedule-preview-action-row">
                        {entry.coordinates && canOpenMapsActions ? (
                          <button
                            type="button"
                            className="link-button event-schedule-preview-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.coordinates || '')}`,
                                '_blank'
                              );
                            }}
                          >
                            Open in Maps
                          </button>
                        ) : null}
                        {entry.to && onNavigateToEntry ? (
                          <button
                            type="button"
                            className="link-button event-schedule-preview-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToEntry(entry);
                              onClose();
                            }}
                          >
                            Open details
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {entry.type === 'Meal' && entry.to && onNavigateToEntry ? (
                      <div className="form-field-full-span event-schedule-preview-action-row">
                        <button
                          type="button"
                          className="link-button event-schedule-preview-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToEntry(entry);
                            onClose();
                          }}
                        >
                          Open details
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ScheduleEntryPreviewOverlay;
