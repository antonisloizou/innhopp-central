import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEvents, listSeasons, Event, Season } from '../api/events';
import { listTransports, Transport } from '../api/logistics';
import { formatEventLocal } from '../utils/eventDate';

const formatDateTime = (iso?: string, force24h = false) => {
  if (!iso) return 'Not scheduled';
  return formatEventLocal(iso, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: force24h ? false : undefined
  });
};

const LogisticsDashboardPage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
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

  const filteredTransports = useMemo(() => {
    return transports.filter((t) => {
      if (selectedSeason && t.season_id !== Number(selectedSeason)) return false;
      if (selectedEvent && t.event_id !== Number(selectedEvent)) return false;
      if (pickupFilter && !t.pickup_location.toLowerCase().includes(pickupFilter.toLowerCase()))
        return false;
      if (
        destinationFilter &&
        !t.destination.toLowerCase().includes(destinationFilter.toLowerCase())
      )
        return false;
      return true;
    });
  }, [transports, selectedSeason, selectedEvent, pickupFilter, destinationFilter]);

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
          <div
            className="form-grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              alignItems: 'end',
              gap: '0.75rem'
            }}
          >
            <label className="form-field">
              <span>Season</span>
              <select
                value={selectedSeason}
                onChange={(e) => {
                  setSelectedSeason(e.target.value);
                  setSelectedEvent('');
                }}
                style={{ width: '100%', minWidth: '180px', maxWidth: '25%' }}
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
                onChange={(e) => setSelectedEvent(e.target.value)}
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
            <span className="badge neutral">
              {filteredTransports.length} {filteredTransports.length === 1 ? 'route' : 'routes'}
            </span>
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
                        <div className="muted">{formatDateTime(t.scheduled_at)}</div>
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
                    {t.vehicles && t.vehicles.length > 0 && (
                      <div className="muted">
                        Vehicles:{' '}
                        {t.vehicles
                          .map((v) => `${v.name}${v.driver ? ` (Driver: ${v.driver})` : ''} • Cap: ${v.passenger_capacity}`)
                          .join('; ')}
                      </div>
                    )}
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
