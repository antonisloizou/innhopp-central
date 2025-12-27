import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listSeasons, listEvents, Season, Event } from '../api/events';
import { listOthers, OtherLogistic } from '../api/logistics';

const formatDateTime = (iso?: string | null) => {
  if (!iso) return 'Unscheduled';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unscheduled';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
};

const LogisticsOthersPage = () => {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
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
        const [seasonResp, eventResp, otherResp] = await Promise.all([listSeasons(), listEvents(), listOthers()]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setOthers(Array.isArray(otherResp) ? otherResp : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load logistics');
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

  const filteredOthers = useMemo(() => {
    return others.filter((o) => {
      if (selectedEvent) return o.event_id === Number(selectedEvent);
      if (selectedSeason) {
        const ev = events.find((e) => e.id === o.event_id);
        return ev?.season_id === Number(selectedSeason);
      }
      return true;
    });
  }, [others, selectedEvent, selectedSeason, events]);

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>Other logistics</h2>
        </div>
        <div className="card-actions" style={{ gap: '0.5rem' }}>
          <Link className="ghost" to="/logistics" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            Back to logistics
          </Link>
          <Link className="primary button-link" to="/logistics/others/new">
            Create entry
          </Link>
        </div>
      </header>

      <article className="card">
        <div className="form-grid">
          <label className="form-field">
            <span>Season</span>
            <select
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setSelectedEvent('');
              }}
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
            <select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>
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
            <h3>Other logistics</h3>
          </div>
          <span className="badge neutral">
            {filteredOthers.length} {filteredOthers.length === 1 ? 'entry' : 'entries'}
          </span>
        </header>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : filteredOthers.length === 0 ? (
          <p className="muted">No entries match the selected filters.</p>
        ) : (
          <ul className="status-list" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
            {filteredOthers.map((entry) => (
              <li key={entry.id}>
                <Link
                  to={`/logistics/others/${entry.id}`}
                  className="card-link"
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <strong>{entry.name}</strong>
                    <span className="badge neutral">{entry.event_id ? events.find((e) => e.id === entry.event_id)?.name || `Event #${entry.event_id}` : 'Unassigned'}</span>
                  </div>
                  <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {entry.coordinates ? `Coords: ${entry.coordinates}` : 'Coords: n/a'}
                    {entry.scheduled_at ? `• ${formatDateTime(entry.scheduled_at)}` : ''}
                  </div>
                  {entry.description && <div className="muted">Description: {entry.description}</div>}
                  {entry.notes && <div className="muted">Notes: {entry.notes}</div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
};

export default LogisticsOthersPage;
