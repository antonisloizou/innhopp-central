import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Event, Season, listEvents, listSeasons } from '../api/events';

const normalizeEvents = (raw: Event[]) =>
  (Array.isArray(raw) ? raw : []).map((event) => ({
    ...event,
    slots: typeof event.slots === 'number' ? event.slots : 0,
    participant_ids: Array.isArray(event.participant_ids) ? event.participant_ids : [],
    innhopps: Array.isArray(event.innhopps) ? event.innhopps : []
  }));

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'TBD';

const EventCalendarPage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>('');

  const seasonLookup = useMemo(() => {
    const map = new Map<number, Season>();
    (Array.isArray(seasons) ? seasons : []).forEach((season) => map.set(season.id, season));
    return map;
  }, [seasons]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResponse, eventResponse] = await Promise.all([listSeasons(), listEvents()]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResponse) ? seasonResponse : []);
        setEvents(normalizeEvents(eventResponse as Event[]));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load events');
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

  const isPastEvent = (event: Event) => {
    if (event.status === 'past') return true;
    const ends = event.ends_at ? new Date(event.ends_at) : null;
    const starts = event.starts_at ? new Date(event.starts_at) : null;
    if (ends) return ends.getTime() < Date.now();
    if (starts) return starts.getTime() < Date.now();
    return false;
  };

  const visibleEvents = events.filter((event) => {
    if (!showPast && isPastEvent(event)) return false;
    if (selectedSeason && event.season_id !== Number(selectedSeason)) return false;
    return true;
  });

  const groupedEvents = useMemo(() => {
    const map = new Map<number, Event[]>();
    visibleEvents.forEach((event) => {
      const list = map.get(event.season_id) || [];
      list.push(event);
      map.set(event.season_id, list);
    });

    const sortNameDesc = (a: number, b: number) => {
      const nameA = seasonLookup.get(a)?.name || `Season ${a}`;
      const nameB = seasonLookup.get(b)?.name || `Season ${b}`;
      const cmp = nameB.localeCompare(nameA);
      if (cmp !== 0) return cmp;
      return b - a;
    };

    return Array.from(map.entries())
      .sort(([a], [b]) => sortNameDesc(a, b))
      .map(([seasonId, group]) => ({
        seasonId,
        label: seasonLookup.get(seasonId)?.name || `Season ${seasonId}`,
        events: group
      }));
  }, [visibleEvents, seasonLookup]);

  useEffect(() => {
    if (!selectedSeason) return;
    const seasonId = Number(selectedSeason);
    const seasonEvents = events.filter((event) => event.season_id === seasonId);
    if (seasonEvents.length === 0) {
      setShowPast(false);
      return;
    }
    const allPast = seasonEvents.every((event) => isPastEvent(event));
    setShowPast(allPast);
  }, [events, selectedSeason]);

  return (
    <section>
      <div className="stack">
        <article className="card">
          <div className="form-grid">
            <label className="form-field">
              <span>Season</span>
              <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
                <option value="">All seasons</option>
                {[...seasons]
                  .sort((a, b) => b.name.localeCompare(a.name))
                  .map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
              </select>
            </label>
            {seasons.length === 0 && <p className="muted">No seasons yet. Create one to get started.</p>}
          </div>
          <footer className="card-footer">
            <Link className="secondary button-link" to="/seasons/new">
              Create season
            </Link>
          </footer>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Events</h3>
            </div>
            <span className="badge neutral">
              {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
            </span>
          </header>
          {loading ? (
            <p className="muted">Loading schedule…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : visibleEvents.length === 0 ? (
            <p className="muted">No events yet. Use the actions below to add one.</p>
          ) : (
            <div className="stack">
              {groupedEvents.map((group) => (
                <div key={group.seasonId} className="stack">
                  <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                    {group.label}
                  </p>
                  <div className="grid two-column">
                    {group.events.map((event) => (
                      <Link key={event.id} className="card-link" to={`/events/${event.id}`}>
                        <article className="card">
                          <header className="card-header">
                            <div>
                              <h3>{event.name}</h3>
                              <p className="muted">{event.location || 'Location TBD'}</p>
                            </div>
                            <span className={`badge status-${event.status}`}>
                              {event.status}
                            </span>
                          </header>
                          <dl className="card-details">
                            <div>
                              <dt>Starts</dt>
                              <dd>{formatDate(event.starts_at)}</dd>
                            </div>
                            <div>
                              <dt>Ends</dt>
                              <dd>{formatDate(event.ends_at)}</dd>
                            </div>
                            <div>
                              <dt>Participants</dt>
                              <dd>{event.participant_ids?.length ?? 0}</dd>
                            </div>
                            <div>
                              <dt>INNHOPPS</dt>
                              <dd>{event.innhopps?.length ?? 0}</dd>
                            </div>
                            <div>
                              <dt>Slots</dt>
                              <dd>{event.slots ?? 0}</dd>
                            </div>
                          </dl>
                        </article>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <footer className="card-footer">
            <div className="card-actions">
              <Link className="primary button-link" to="/events/new">
                Create event
              </Link>
              <button className="ghost" type="button" onClick={() => setShowPast((v) => !v)}>
                {showPast ? 'Hide past events' : 'Show past events'}
              </button>
            </div>
          </footer>
        </article>
      </div>
    </section>
  );
};

export default EventCalendarPage;
