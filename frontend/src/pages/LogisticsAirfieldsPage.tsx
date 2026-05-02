import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAirfields, Airfield } from '../api/airfields';
import { listEvents, listSeasons, Event, Season } from '../api/events';
import { formatMetersWithFeet } from '../utils/units';

const LogisticsAirfieldsPage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResp, eventResp, airfieldResp] = await Promise.all([
          listSeasons(),
          listEvents(),
          listAirfields()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setAirfields(Array.isArray(airfieldResp) ? airfieldResp : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load airfields');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return events.filter((ev) => ev.season_id === Number(selectedSeason));
  }, [events, selectedSeason]);

  const activeEventIds = useMemo(() => {
    if (selectedEvent) return new Set([Number(selectedEvent)]);
    if (selectedSeason) {
      const ids = events.filter((ev) => ev.season_id === Number(selectedSeason)).map((ev) => ev.id);
      return new Set(ids);
    }
    return null;
  }, [events, selectedEvent, selectedSeason]);

  const filteredAirfields = useMemo(() => {
    const locationNeedle = locationFilter.trim().toLowerCase();
    return airfields
      .filter((airfield) => {
        if (activeEventIds) {
          const belongsToSelectedEvents = events.some(
            (event) => activeEventIds.has(event.id) && Array.isArray(event.airfield_ids) && event.airfield_ids.includes(airfield.id)
          );
          if (!belongsToSelectedEvents) return false;
        }

        if (!locationNeedle) return true;
        const searchable = [airfield.name, airfield.coordinates, airfield.description || ''].join(' ').toLowerCase();
        return searchable.includes(locationNeedle);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [airfields, activeEventIds, events, locationFilter]);

  const eventsByAirfieldId = useMemo(() => {
    const map = new Map<number, Event[]>();
    airfields.forEach((airfield) => {
      const linked = events.filter((ev) => Array.isArray(ev.airfield_ids) && ev.airfield_ids.includes(airfield.id));
      map.set(airfield.id, linked);
    });
    return map;
  }, [airfields, events]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Airfields</h2>
        </div>
        <div className="card-actions logistics-list-actions">
          <Link className="ghost logistics-list-back-link" to="/logistics">
            Back to logistics
          </Link>
          <Link className="primary button-link" to="/airfields/new">
            Create airfield
          </Link>
        </div>
      </header>

      <article className="card">
        <div className="form-grid logistics-list-filters">
          <label className="form-field">
            <span>Season</span>
            <select
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setSelectedEvent('');
              }}
              className="logistics-list-season-select"
            >
              <option value="">All seasons</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Event</span>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="logistics-list-event-select"
            >
              <option value="">All events</option>
              {filteredEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Location</span>
            <input
              type="text"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="Search name, coordinates, notes"
            />
          </label>
        </div>
      </article>

      <article className="card">
        <header className="card-header">
          <div>
            <h3>Airfields</h3>
          </div>
          <span className="badge neutral">
            {filteredAirfields.length} {filteredAirfields.length === 1 ? 'airfield' : 'airfields'}
          </span>
        </header>
        {loading ? (
          <p className="muted">Loading airfields…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : filteredAirfields.length === 0 ? (
          <p className="muted">No airfields match the selected filters.</p>
        ) : (
          <ul className="status-list logistics-list-scroll">
            {filteredAirfields.map((airfield) => {
              const relatedEvents = eventsByAirfieldId.get(airfield.id) || [];
              const subtitle = [
                airfield.coordinates ? `Coords: ${airfield.coordinates}` : '',
                `Elevation: ${formatMetersWithFeet(airfield.elevation)}`,
                relatedEvents.length > 0
                  ? `Used by: ${relatedEvents
                      .map((ev) => ev.name)
                      .slice(0, 2)
                      .join(', ')}${relatedEvents.length > 2 ? ` +${relatedEvents.length - 2}` : ''}`
                  : 'Not assigned to any event'
              ]
                .filter(Boolean)
                .join(' • ');

              return (
                <li key={airfield.id} className="logistics-list-item">
                  <Link to={`/airfields/${airfield.id}`} className="card-link logistics-list-link">
                    <div className="logistics-list-row logistics-list-row-between">
                      <strong>{airfield.name}</strong>
                      <span className="badge logistics-list-event-badge">#{airfield.id}</span>
                    </div>
                    <div className="muted logistics-list-meta">{subtitle}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
};

export default LogisticsAirfieldsPage;
