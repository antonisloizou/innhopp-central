import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { listEvents, listSeasons, Event, Season } from '../api/events';
import { listTransports, Transport } from '../api/logistics';
import { formatEventLocal, parseEventLocal } from '../utils/eventDate';

const formatScheduledAt = (iso?: string) => {
  if (!iso) return 'Not scheduled';
  return formatEventLocal(iso, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const formatDuration = (minutes?: number | null) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes <= 0) return 'n/a';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

const formatVehicleSummary = (vehicles?: Transport['vehicles']) => {
  if (!vehicles || vehicles.length === 0) return 'No vehicles';
  return vehicles.map((v) => v.name).join(', ');
};

const getVehicleFilterKey = (vehicle: NonNullable<Transport['vehicles']>[number], index: number) =>
  typeof vehicle.event_vehicle_id === 'number'
    ? `vehicle:${vehicle.event_vehicle_id}`
    : `legacy:${vehicle.name}:${vehicle.driver || ''}:${vehicle.passenger_capacity}:${index}`;

const getDateKey = (iso?: string) => {
  const parsed = parseEventLocal(iso);
  if (!parsed) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const LogisticsDashboardPage = () => {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [pickupFilter, setPickupFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewRoute, setPreviewRoute] = useState<Transport | null>(null);
  const vehicleDropdownRef = useRef<HTMLDetailsElement | null>(null);
  const datesDropdownRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResp, eventResp, transportResp] = await Promise.all([
          listSeasons(),
          listEvents(),
          listTransports()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setTransports(Array.isArray(transportResp) ? transportResp : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load logistics');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!previewRoute) {
      document.body.style.overflow = '';
      return;
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [previewRoute]);

  useEffect(() => {
    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      [vehicleDropdownRef.current, datesDropdownRef.current].forEach((dropdown) => {
        if (dropdown?.open && target && !dropdown.contains(target)) {
          dropdown.removeAttribute('open');
        }
      });
    };

    document.addEventListener('mousedown', handleOutsidePointer);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
    };
  }, []);

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    const seasonId = Number(selectedSeason);
    return events.filter((event) => event.season_id === seasonId);
  }, [events, selectedSeason]);

  const vehicleOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { key: string; label: string }[] = [];
    transports
      .filter((t) => {
        if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
        if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
        return true;
      })
      .forEach((t) => {
        (t.vehicles || []).forEach((v, index) => {
          const key = getVehicleFilterKey(v, index);
          const label = v.name?.trim();
          if (label && !seen.has(key)) {
            seen.add(key);
            options.push({ key, label });
          }
        });
      });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [transports, selectedSeason, selectedEvent]);

  const dateOptions = useMemo(() => {
    const seen = new Set<string>();
    return transports
      .filter((t) => {
        if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
        if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
        if (
          selectedVehicles.length > 0 &&
          !(t.vehicles || []).some((v, index) => selectedVehicles.includes(getVehicleFilterKey(v, index)))
        )
          return false;
        return true;
      })
      .map((t) => getDateKey(t.scheduled_at))
      .filter((dateKey) => Boolean(dateKey && !seen.has(dateKey) && seen.add(dateKey)))
      .sort((a, b) => a.localeCompare(b));
  }, [transports, selectedSeason, selectedEvent, selectedVehicles]);

  const filteredTransports = useMemo(() => {
    return transports
      .filter((t) => {
        if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
        if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
        if (
          selectedVehicles.length > 0 &&
          !(t.vehicles || []).some((v, index) => selectedVehicles.includes(getVehicleFilterKey(v, index)))
        )
          return false;
        if (selectedDates.length > 0 && !selectedDates.includes(getDateKey(t.scheduled_at))) return false;
        if (pickupFilter && !t.pickup_location.toLowerCase().includes(pickupFilter.toLowerCase()))
          return false;
        if (
          destinationFilter &&
          !t.destination.toLowerCase().includes(destinationFilter.toLowerCase())
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = parseEventLocal(a.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTime = parseEventLocal(b.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
        if (aTime === bTime) {
          return `${a.pickup_location} ${a.destination}`.localeCompare(`${b.pickup_location} ${b.destination}`);
        }
        return aTime - bTime;
      });
  }, [transports, selectedSeason, selectedEvent, selectedVehicles, selectedDates, pickupFilter, destinationFilter]);

  const selectedVehicleLabels = useMemo(
    () =>
      vehicleOptions
        .filter((option) => selectedVehicles.includes(option.key))
        .map((option) => option.label),
    [selectedVehicles, vehicleOptions]
  );

  const totalDurationMinutes = useMemo(() => {
    return filteredTransports.reduce((sum, t) => {
      const duration = t.duration_minutes;
      return sum + (typeof duration === 'number' && duration > 0 ? duration : 0);
    }, 0);
  }, [filteredTransports]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Transport</h2>
        </div>
        <div className="card-actions">
          <Link className="ghost logistics-list-back-link" to="/logistics">
            Back to logistics
          </Link>
         <Link className="primary button-link" to="/logistics/new">
            Create route
          </Link>
        </div>
      </header>

      <div className="stack">
        <article className="card">
          <div className="form-grid logistics-filter-grid">
            <label className="form-field">
              <span>Season</span>
              <select
                value={selectedSeason}
                onChange={(e) => {
                  setSelectedSeason(e.target.value);
                  setSelectedEvent('');
                  setSelectedVehicles([]);
                  setSelectedDates([]);
                }}
                className="logistics-dashboard-filter-select"
              >
                <option value="">All seasons</option>
                {[...seasons].sort((a, b) => b.name.localeCompare(a.name)).map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Event</span>
              <select
                value={selectedEvent}
                onChange={(e) => {
                  setSelectedEvent(e.target.value);
                  setSelectedVehicles([]);
                  setSelectedDates([]);
                }}
                className="logistics-dashboard-filter-select"
              >
                <option value="">All events</option>
                {filteredEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Vehicle</span>
              <details className="multi-select-dropdown" ref={vehicleDropdownRef}>
                <summary>
                  {selectedVehicles.length === 0
                    ? 'All vehicles'
                    : selectedVehicles.length === 1
                    ? selectedVehicleLabels[0]
                    : `${selectedVehicles.length} vehicles selected`}
                </summary>
                <div className="multi-select-panel">
                  {selectedVehicles.length > 0 && (
                    <button type="button" className="multi-select-option" onClick={() => setSelectedVehicles([])}>
                      Clear vehicle filters
                    </button>
                  )}
                  {vehicleOptions.length === 0 ? (
                    <div className="muted logistics-dashboard-empty-option">
                      No vehicles
                    </div>
                  ) : (
                    vehicleOptions.map((vehicle) => {
                      const checked = selectedVehicles.includes(vehicle.key);
                      return (
                        <label key={vehicle.key} className="multi-select-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedVehicles((prev) => [...prev, vehicle.key]);
                              } else {
                                setSelectedVehicles((prev) => prev.filter((v) => v !== vehicle.key));
                              }
                            }}
                          />
                          {vehicle.label}
                        </label>
                      );
                    })
                  )}
                </div>
              </details>
            </label>
            <label className="form-field">
              <span>Dates</span>
              <details className="multi-select-dropdown" ref={datesDropdownRef}>
                <summary>
                  {selectedDates.length === 0
                    ? 'All dates'
                    : selectedDates.length === 1
                    ? formatDateLabel(selectedDates[0])
                    : `${selectedDates.length} dates selected`}
                </summary>
                <div className="multi-select-panel">
                  {selectedDates.length > 0 && (
                    <button type="button" className="multi-select-option" onClick={() => setSelectedDates([])}>
                      Clear date filters
                    </button>
                  )}
                  {dateOptions.length === 0 ? (
                    <div className="muted logistics-dashboard-empty-option">
                      No scheduled dates
                    </div>
                  ) : (
                    dateOptions.map((dateKey) => {
                      const checked = selectedDates.includes(dateKey);
                      return (
                        <label key={dateKey} className="multi-select-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDates((prev) => [...prev, dateKey]);
                              } else {
                                setSelectedDates((prev) => prev.filter((d) => d !== dateKey));
                              }
                            }}
                          />
                          {formatDateLabel(dateKey)}
                        </label>
                      );
                    })
                  )}
                </div>
              </details>
            </label>
            <label className="form-field">
              <span>Pickup location</span>
              <input
                type="text"
                value={pickupFilter}
                onChange={(e) => setPickupFilter(e.target.value)}
                placeholder="Filter pickup"
              />
            </label>
            <label className="form-field">
              <span>Destination</span>
              <input
                type="text"
                value={destinationFilter}
                onChange={(e) => setDestinationFilter(e.target.value)}
                placeholder="Filter destination"
              />
            </label>
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Transport routes</h3>
            </div>
            <div className="logistics-dashboard-badge-row">
              <span className="badge neutral">
                {filteredTransports.length} {filteredTransports.length === 1 ? 'route' : 'routes'}
              </span>
              <span className="badge neutral">
                ⏱ {totalDurationMinutes > 0 ? formatDuration(totalDurationMinutes) : '0m'}
              </span>
            </div>
          </header>
          {loading ? (
            <p className="muted">Loading transports…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : filteredTransports.length === 0 ? (
            <p className="muted">No transports match the selected filters.</p>
          ) : (
            <ul className="status-list logistics-list-scroll">
              {filteredTransports.map((t) => (
                <li key={t.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    className="card-link logistics-dashboard-preview-trigger"
                    onClick={() => setPreviewRoute(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPreviewRoute(t);
                      }
                    }}
                  >
                    <div className="logistics-dashboard-route-row">
                      <div>
                        <strong>
                          {t.pickup_location} → {t.destination}
                        </strong>
                        <div className="muted route-subtitle">
                          <span className="route-subtitle-item route-subtitle-item--schedule">
                            <span className="route-subtitle-icon" aria-hidden>
                              📅
                            </span>
                            <span className="route-subtitle-text">{formatScheduledAt(t.scheduled_at)}</span>
                          </span>
                          <span className="route-subtitle-spacer route-subtitle-spacer--after-duration" aria-hidden />
                          <span className="route-subtitle-item route-subtitle-item--duration">
                            <span className="route-subtitle-icon" aria-hidden>
                              ⏱
                            </span>
                            <span className="route-subtitle-text">{formatDuration(t.duration_minutes)}</span>
                          </span>
                          <span className="route-subtitle-spacer" aria-hidden />
                          <span className="route-subtitle-item route-subtitle-item--vehicles">
                            <span className="route-subtitle-icon" aria-hidden>
                              🚐
                            </span>
                            <span className="route-subtitle-text">{formatVehicleSummary(t.vehicles)}</span>
                          </span>
                        </div>
                      </div>
                      <div className="logistics-dashboard-event-badges">
                        <span className="badge logistics-list-event-badge">
                          {events.find((e) => e.id === t.event_id)?.name || `Event #${t.event_id ?? '—'}`}
                        </span>
                        <span className="badge neutral">
                          {t.passenger_count} passenger{t.passenger_count === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
      {previewRoute &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={() => setPreviewRoute(null)}
            role="button"
            tabIndex={-1}
            className="logistics-dashboard-overlay"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setPreviewRoute(null);
              } else if (e.key === 'Enter') {
                navigate(`/logistics/${previewRoute.id}`);
                setPreviewRoute(null);
              }
            }}
          >
            <div
              className="card overlay-panel-with-close logistics-dashboard-overlay-panel"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/logistics/${previewRoute.id}`);
                setPreviewRoute(null);
              }}
            >
              <button
                type="button"
                className="overlay-close-button overlay-close-top-left"
                aria-label="Close overlay"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewRoute(null);
                }}
              >
                ×
              </button>
              <div className="card-header logistics-dashboard-overlay-header">
                <h3 className="logistics-dashboard-overlay-title">
                  {previewRoute.pickup_location} → {previewRoute.destination}
                </h3>
                <span className="badge schedule-type-badge logistics-dashboard-type-badge">
                  Transport
                </span>
              </div>
              <div className="logistics-dashboard-overlay-grid">
                <div>
                  <div className="muted logistics-dashboard-overlay-label">DURATION</div>
                  <div>{formatDuration(previewRoute.duration_minutes)}</div>
                </div>
                <div>
                  <div className="muted logistics-dashboard-overlay-label">SCHEDULED AT</div>
                  <div>{formatScheduledAt(previewRoute.scheduled_at)}</div>
                </div>
                <div>
                  <div className="muted logistics-dashboard-overlay-label">PASSENGERS</div>
                  <div>{previewRoute.passenger_count}</div>
                </div>
                <div>
                  <div className="muted logistics-dashboard-overlay-label">EVENT</div>
                  <div>{events.find((e) => e.id === previewRoute.event_id)?.name || `Event #${previewRoute.event_id ?? '—'}`}</div>
                </div>
                <div className="form-field-full-span">
                  <div className="muted logistics-dashboard-overlay-label">VEHICLES</div>
                  <div className="logistics-dashboard-overlay-subsection">
                    {!previewRoute.vehicles || previewRoute.vehicles.length === 0 ? (
                      <div className="muted">—</div>
                    ) : (
                      previewRoute.vehicles.map((v, idx) => (
                        <div key={idx} className="muted">
                          <strong>{v.name}</strong>
                          {v.driver ? ` (Driver: ${v.driver})` : ''}
                          {typeof v.passenger_capacity === 'number' ? ` • Capacity: ${v.passenger_capacity}` : ''}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="form-field-full-span">
                  <div className="muted logistics-dashboard-overlay-label">NOTES</div>
                  <div>{previewRoute.notes || '—'}</div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
};

export default LogisticsDashboardPage;
