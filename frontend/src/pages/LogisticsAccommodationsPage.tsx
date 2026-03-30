import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSeasons, listEvents, Season, Event, Accommodation, listAllAccommodations } from '../api/events';
import { formatEventLocal, parseEventLocal } from '../utils/eventDate';

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

const accommodationSortTime = (acc: Accommodation) =>
  parseEventLocal(acc.check_in_at)?.getTime() ??
  parseEventLocal(acc.check_out_at)?.getTime() ??
  Number.POSITIVE_INFINITY;

const LogisticsAccommodationsPage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResp, eventResp, accResp] = await Promise.all([
          listSeasons(),
          listEvents(),
          listAllAccommodations()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setAccommodations(Array.isArray(accResp) ? accResp : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load accommodations');
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

  const filteredAccommodations = useMemo(() => {
    return accommodations
      .filter((a) => {
        if (selectedEvent) return a.event_id === Number(selectedEvent);
        if (selectedSeason) {
          const ev = events.find((e) => e.id === a.event_id);
          return ev?.season_id === Number(selectedSeason);
        }
        return true;
      })
      .sort((a, b) => {
        const aTime = accommodationSortTime(a);
        const bTime = accommodationSortTime(b);
        if (aTime === bTime) return a.name.localeCompare(b.name);
        return aTime - bTime;
      });
  }, [accommodations, selectedEvent, selectedSeason, events]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Accommodations</h2>
        </div>
        <div className="card-actions logistics-list-actions">
          <Link className="ghost logistics-list-back-link" to="/logistics">
            Back to logistics
          </Link>
          <Link className="primary button-link" to="/logistics/accommodations/new">
            Create accommodation
          </Link>
        </div>
      </header>

      <div className="stack">
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
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Accommodations</h3>
            </div>
            <span className="badge neutral">
              {filteredAccommodations.length} {filteredAccommodations.length === 1 ? 'accommodation' : 'accommodations'}
            </span>
          </header>
          {loading ? (
            <p className="muted">Loading accommodations…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : filteredAccommodations.length === 0 ? (
            <p className="muted">No accommodations match the selected filters.</p>
          ) : (
            <ul className="status-list logistics-list-scroll">
              {filteredAccommodations.map((acc) => (
                <li key={acc.id}>
                  <Link
                    to={`/events/${acc.event_id}/accommodations/${acc.id}`}
                    className="card-link logistics-list-link"
                  >
                    <div className="logistics-list-row logistics-list-row-between logistics-list-row-start">
                      <strong>{acc.name}</strong>
                      <div className="logistics-list-badge-row">
                        <span className="badge logistics-list-event-badge">
                          {events.find((e) => e.id === acc.event_id)?.name || `Event #${acc.event_id}`}
                        </span>
                        <span className={`badge ${acc.booked ? 'success' : 'danger'}`}>
                          {acc.booked ? 'BOOKED' : 'NOT BOOKED'}
                        </span>
                      </div>
                    </div>
                    <div className="muted logistics-list-meta logistics-list-meta-aligned">
                      {events.find((e) => e.id === acc.event_id)?.name || `Event #${acc.event_id}`} • Capacity: {acc.capacity}
                      {acc.check_in_at ? ` • Check-in: ${formatDateTime(acc.check_in_at, true)}` : ''}
                      {acc.check_out_at ? ` • Check-out: ${formatDateTime(acc.check_out_at, true)}` : ''}
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

export default LogisticsAccommodationsPage;
