import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Event, Season, listEvents, listSeasons } from '../api/events';
import { ParticipantProfile, listParticipantProfiles } from '../api/participants';
import { formatEventLocal, parseEventLocal } from '../utils/eventDate';

const normalizeEvents = (raw: Event[]) =>
  (Array.isArray(raw) ? raw : []).map((event) => ({
    ...event,
    slots: typeof event.slots === 'number' ? event.slots : 0,
    airfield_ids: Array.isArray(event.airfield_ids) ? event.airfield_ids : [],
    participant_ids: Array.isArray(event.participant_ids) ? event.participant_ids : [],
    innhopps: Array.isArray(event.innhopps) ? event.innhopps : []
  }));

const formatDate = (value?: string | null) =>
  value
    ? formatEventLocal(value, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'TBD';

const EventCalendarPage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);

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
        const [seasonResponse, eventResponse, participantResponse] = await Promise.all([
          listSeasons(),
          listEvents(),
          listParticipantProfiles()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResponse) ? seasonResponse : []);
        setEvents(normalizeEvents(eventResponse as Event[]));
        setParticipants(Array.isArray(participantResponse) ? participantResponse : []);
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
    const ends = parseEventLocal(event.ends_at);
    const starts = parseEventLocal(event.starts_at);
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

  const participantLookup = useMemo(() => {
    const map = new Map<number, ParticipantProfile>();
    participants.forEach((p) => map.set(p.id, p));
    return map;
  }, [participants]);

  const countNonStaff = (ids?: number[]) => {
    if (!Array.isArray(ids)) return 0;
    return ids.reduce((count, id) => {
      const roles = Array.isArray(participantLookup.get(id)?.roles)
        ? participantLookup.get(id)?.roles || []
        : [];
      return roles.includes('Staff') ? count : count + 1;
    }, 0);
  };

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

  const firstSeasonLabel = groupedEvents[0]?.label || null;

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2 style={{ margin: 0 }}>Event Calendar</h2>
        </div>
      </header>
      <div className="stack">
        <article className="card">
          <header className="card-header" style={{ alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ flex: 1, fontWeight: 800, fontSize: '1.25rem' }}>
              {firstSeasonLabel || 'Events'}
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
              {groupedEvents.map((group, idx) => (
                <div key={group.seasonId} className="stack">
                  {idx === 0 ? null : (
                    <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>{group.label}</span>
                    </p>
                  )}
                  <div className="stack">
                    {group.events.map((event) => (
                      <Link
                        key={event.id}
                        className="card-link"
                        to={`/events/${event.id}`}
                        state={{ suppressHighlight: true }}
                      >
                        <article className="card event-summary-card">
                          {(() => {
                            const nonStaffCount = countNonStaff(event.participant_ids);
                            const slotCount = event.slots ?? 0;
                            const remaining = Math.max(slotCount - nonStaffCount, 0);
                            const isFull = remaining === 0;
                            const past = isPastEvent(event);
                            return (
                              <>
                                <header className="card-header event-card-header">
                                  <div>
                                    <h3>{event.name}</h3>
                                    <p className="muted event-location">{event.location || 'Location TBD'}</p>
                                  </div>
                                  <div className="event-card-badges">
                                    <span className={`badge status-${event.status}`}>
                                      {event.status}
                                    </span>
                                    {!past && (
                                      <span className={`badge ${isFull ? 'danger' : 'success'}`}>
                                        {isFull ? 'FULL' : `${remaining} SLOTS AVAILABLE`}
                                      </span>
                                    )}
                                  </div>
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
                              <dd>{countNonStaff(event.participant_ids)}</dd>
                            </div>
                            <div>
                                  <dt>INNHOPPS</dt>
                                  <dd>{event.innhopps?.length ?? 0}</dd>
                                </div>
                                <div>
                                  <dt>Slots</dt>
                                  <dd>{slotCount}</dd>
                                </div>
                              </dl>
                              </>
                            );
                          })()}
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

        <article className="card">
          <div className="form-grid">
            <label className="form-field">
              <span>Season</span>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                style={{ width: '16.666%', minWidth: '140px' }}
              >
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
            <Link className="primary button-link" to="/seasons/new">
              Create season
            </Link>
          </footer>
        </article>
      </div>
    </section>
  );
};

export default EventCalendarPage;
