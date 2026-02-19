import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { listEvents, listSeasons, Event, Season } from '../api/events';
import { listGroundCrews, GroundCrew } from '../api/logistics';
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

const formatVehicleSummary = (vehicles?: GroundCrew['vehicles']) => {
  if (!vehicles || vehicles.length === 0) return 'No vehicles';
  return vehicles.map((v) => v.name).join(', ');
};

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

const LogisticsGroundCrewDashboardPage = () => {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [groundCrews, setGroundCrews] = useState<GroundCrew[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [pickupFilter, setPickupFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewRoute, setPreviewRoute] = useState<GroundCrew | null>(null);
  const vehicleDropdownRef = useRef<HTMLDetailsElement | null>(null);
  const datesDropdownRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResp, eventResp, groundCrewResp] = await Promise.all([
          listSeasons(),
          listEvents(),
          listGroundCrews()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setGroundCrews(Array.isArray(groundCrewResp) ? groundCrewResp : []);
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
    return groundCrews
      .filter((t) => {
        if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
        if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
        return true;
      })
      .flatMap((t) => t.vehicles || [])
      .map((v) => v.name?.trim())
      .filter((name): name is string => Boolean(name && !seen.has(name) && seen.add(name)))
      .sort((a, b) => a.localeCompare(b));
  }, [groundCrews, selectedSeason, selectedEvent]);

  const dateOptions = useMemo(() => {
    const seen = new Set<string>();
    return groundCrews
      .filter((t) => {
        if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
        if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
        if (
          selectedVehicles.length > 0 &&
          !(t.vehicles || []).some((v) => selectedVehicles.includes(v.name))
        )
          return false;
        return true;
      })
      .map((t) => getDateKey(t.scheduled_at))
      .filter((dateKey) => Boolean(dateKey && !seen.has(dateKey) && seen.add(dateKey)))
      .sort((a, b) => a.localeCompare(b));
  }, [groundCrews, selectedSeason, selectedEvent, selectedVehicles]);

  const filteredGroundCrews = useMemo(() => {
    return groundCrews
      .filter((t) => {
        if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
        if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
        if (
          selectedVehicles.length > 0 &&
          !(t.vehicles || []).some((v) => selectedVehicles.includes(v.name))
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
  }, [groundCrews, selectedSeason, selectedEvent, selectedVehicles, selectedDates, pickupFilter, destinationFilter]);

  const totalDurationMinutes = useMemo(() => {
    return filteredGroundCrews.reduce((sum, t) => {
      const duration = t.duration_minutes;
      return sum + (typeof duration === 'number' && duration > 0 ? duration : 0);
    }, 0);
  }, [filteredGroundCrews]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Ground Crew</h2>
        </div>
        <div className="card-actions">
          <Link className="ghost" to="/logistics" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            Back to logistics
          </Link>
         <Link className="primary button-link" to="/logistics/ground-crew/new">
            Create entry
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
                style={{ width: '100%', minWidth: '180px' }}
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
                style={{ width: '100%', minWidth: '180px' }}
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
                    ? selectedVehicles[0]
                    : `${selectedVehicles.length} vehicles selected`}
                </summary>
                <div className="multi-select-panel">
                  {selectedVehicles.length > 0 && (
                    <button type="button" className="multi-select-option" onClick={() => setSelectedVehicles([])}>
                      Clear vehicle filters
                    </button>
                  )}
                  {vehicleOptions.length === 0 ? (
                    <div className="muted" style={{ padding: '0.4rem 0.45rem' }}>
                      No vehicles
                    </div>
                  ) : (
                    vehicleOptions.map((vehicleName) => {
                      const checked = selectedVehicles.includes(vehicleName);
                      return (
                        <label key={vehicleName} className="multi-select-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedVehicles((prev) => [...prev, vehicleName]);
                              } else {
                                setSelectedVehicles((prev) => prev.filter((v) => v !== vehicleName));
                              }
                            }}
                          />
                          {vehicleName}
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
                    <div className="muted" style={{ padding: '0.4rem 0.45rem' }}>
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
              <span>Start location</span>
              <input
                type="text"
                value={pickupFilter}
                onChange={(e) => setPickupFilter(e.target.value)}
                placeholder="Filter start location"
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
              <h3>Ground crew routes</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="badge neutral">
                {filteredGroundCrews.length} routes
              </span>
              <span className="badge neutral">
                ⏱ {totalDurationMinutes > 0 ? formatDuration(totalDurationMinutes) : '0m'}
              </span>
            </div>
          </header>
          {loading ? (
            <p className="muted">Loading ground crew routes…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : filteredGroundCrews.length === 0 ? (
            <p className="muted">No ground crew routes match the selected filters.</p>
          ) : (
            <ul className="status-list" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
              {filteredGroundCrews.map((t) => (
                <li key={t.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    className="card-link"
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => setPreviewRoute(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPreviewRoute(t);
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <span className="badge" style={{ backgroundColor: '#2b8a3e', color: '#fff' }}>
                          {events.find((e) => e.id === t.event_id)?.name || `Event #${t.event_id ?? '—'}`}
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
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--overlay-scrim)',
              backdropFilter: 'blur(6px)',
              zIndex: 9999,
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem 1rem'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setPreviewRoute(null);
              } else if (e.key === 'Enter') {
                navigate(`/logistics/ground-crew/${previewRoute.id}`);
                setPreviewRoute(null);
              }
            }}
          >
            <div
              className="card overlay-panel-with-close"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/logistics/ground-crew/${previewRoute.id}`);
                setPreviewRoute(null);
              }}
              style={{
                position: 'relative',
                width: 'min(720px, 92vw)',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 18px 48px rgba(0,0,0,0.4), 0 0 0 1px var(--modal-border)',
                cursor: 'pointer',
                backgroundColor: 'var(--modal-surface)',
                border: '1px solid var(--modal-border)',
                color: 'var(--text-strong)'
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
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  {previewRoute.pickup_location} → {previewRoute.destination}
                </h3>
                <span className="badge schedule-type-badge" style={{ background: '#2563eb' }}>
                  Ground Crew
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: '0.85rem',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  padding: '1rem'
                }}
              >
                <div>
                  <div className="muted" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>DURATION</div>
                  <div>{formatDuration(previewRoute.duration_minutes)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>SCHEDULED AT</div>
                  <div>{formatScheduledAt(previewRoute.scheduled_at)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>EVENT</div>
                  <div>{events.find((e) => e.id === previewRoute.event_id)?.name || `Event #${previewRoute.event_id ?? '—'}`}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="muted" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>VEHICLES</div>
                  <div style={{ marginTop: '0.15rem' }}>
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
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="muted" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>NOTES</div>
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

export default LogisticsGroundCrewDashboardPage;
