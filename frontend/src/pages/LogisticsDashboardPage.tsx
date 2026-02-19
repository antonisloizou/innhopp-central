import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEvents, listSeasons, Event, Season } from '../api/events';
import { listTransports, Transport } from '../api/logistics';
import { formatEventLocal, parseEventLocal } from '../utils/eventDate';

const formatScheduledAt = (iso?: string) => {
  if (!iso) return 'Not scheduled';
  return formatEventLocal(iso, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    const seasonId = Number(selectedSeason);
    return events.filter((event) => event.season_id === seasonId);
  }, [events, selectedSeason]);

  const vehicleOptions = useMemo(() => {
    const seen = new Set<string>();
    return transports
      .filter((t) => {
        if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
        if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
        return true;
      })
      .flatMap((t) => t.vehicles || [])
      .map((v) => v.name?.trim())
      .filter((name): name is string => Boolean(name && !seen.has(name) && seen.add(name)))
      .sort((a, b) => a.localeCompare(b));
  }, [transports, selectedSeason, selectedEvent]);

  const dateOptions = useMemo(() => {
    const seen = new Set<string>();
    return transports
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
  }, [transports, selectedSeason, selectedEvent, selectedVehicles]);

  const filteredTransports = useMemo(() => {
    return transports
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
  }, [transports, selectedSeason, selectedEvent, selectedVehicles, selectedDates, pickupFilter, destinationFilter]);

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
          <Link className="ghost" to="/logistics" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
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
              <details className="multi-select-dropdown">
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
              <details className="multi-select-dropdown">
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
            <ul className="status-list" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
              {filteredTransports.map((t) => (
                <li key={t.id}>
                  <Link to={`/logistics/${t.id}`} className="card-link" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div>
                        <strong>
                          {t.pickup_location} → {t.destination}
                        </strong>
                        <div className="muted route-subtitle">
                          <span className="route-subtitle-item">
                            <span className="route-subtitle-icon" aria-hidden>
                              📅
                            </span>
                            {formatScheduledAt(t.scheduled_at)}
                          </span>
                          <span className="route-subtitle-spacer" aria-hidden />
                          <span className="route-subtitle-item">
                            <span className="route-subtitle-icon" aria-hidden>
                              ⏱
                            </span>
                            {formatDuration(t.duration_minutes)}
                          </span>
                          <span className="route-subtitle-spacer" aria-hidden />
                          <span className="route-subtitle-item">
                            <span className="route-subtitle-icon" aria-hidden>
                              🚐
                            </span>
                            {formatVehicleSummary(t.vehicles)}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <span className="badge" style={{ backgroundColor: '#2b8a3e', color: '#fff' }}>
                          {events.find((e) => e.id === t.event_id)?.name || `Event #${t.event_id ?? '—'}`}
                        </span>
                        <span className="badge neutral">
                          {t.passenger_count} passenger{t.passenger_count === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
};

export default LogisticsDashboardPage;
