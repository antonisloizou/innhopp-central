import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canManageEvents } from '../auth/access';
import { Event, Season, deleteSeason, listEvents, listSeasons } from '../api/events';
import { ParticipantProfile, getMyParticipantProfile, listParticipantProfiles } from '../api/participants';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [myParticipantProfile, setMyParticipantProfile] = useState<ParticipantProfile | null>(null);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [deletingSeasonId, setDeletingSeasonId] = useState<number | null>(null);
  const canManage = canManageEvents(user);
  const forceDocumentNavigation = !!user?.impersonator;
  const seasonMenuRef = useRef<HTMLDivElement | null>(null);

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
        const [seasonResponse, eventResponse] = await Promise.all([
          listSeasons(),
          listEvents()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResponse) ? seasonResponse : []);
        setEvents(normalizeEvents(eventResponse as Event[]));

        try {
          const myProfileResponse = await getMyParticipantProfile();
          if (cancelled) return;
          setMyParticipantProfile(myProfileResponse);
        } catch (myProfileError) {
          const status = (myProfileError as Error & { status?: number })?.status;
          if (!cancelled && (status === 403 || status === 404)) {
            setMyParticipantProfile(null);
          } else {
            throw myProfileError;
          }
        }

        try {
          const participantResponse = await listParticipantProfiles();
          if (cancelled) return;
          setParticipants(Array.isArray(participantResponse) ? participantResponse : []);
        } catch (participantError) {
          if (
            !cancelled &&
            typeof participantError === "object" &&
            participantError !== null &&
            'status' in participantError &&
            participantError.status === 403
          ) {
            setParticipants([]);
            return;
          }
          throw participantError;
        }
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

  useEffect(() => {
    if (!seasonMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (seasonMenuRef.current?.contains(target)) return;
      setSeasonMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSeasonMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [seasonMenuOpen]);

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

  const myEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!myParticipantProfile) return false;
        return Array.isArray(event.participant_ids) && event.participant_ids.includes(myParticipantProfile.id);
      }),
    [events, myParticipantProfile]
  );

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

  const groupedMyEvents = useMemo(() => {
    const map = new Map<number, Event[]>();
    myEvents.forEach((event) => {
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
  }, [myEvents, seasonLookup]);

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

  const selectedSeasonName = selectedSeason
    ? seasons.find((season) => season.id === Number(selectedSeason))?.name || 'Unknown season'
    : 'All seasons';

  const refreshCalendarData = async () => {
    const [seasonResponse, eventResponse] = await Promise.all([listSeasons(), listEvents()]);
    setSeasons(Array.isArray(seasonResponse) ? seasonResponse : []);
    setEvents(normalizeEvents(eventResponse as Event[]));
  };

  const handleDeleteSeason = async (season: Season) => {
    const confirmed = window.confirm(`Delete "${season.name}"? This will also delete its events.`);
    if (!confirmed) return;

    try {
      setDeletingSeasonId(season.id);
      setError(null);
      await deleteSeason(season.id);
      await refreshCalendarData();
      if (selectedSeason === String(season.id)) {
        setSelectedSeason('');
      }
      setSeasonMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete season');
    } finally {
      setDeletingSeasonId(null);
    }
  };

  const renderEventGroups = (
    groups: { seasonId: number; label: string; events: Event[] }[],
    options?: { showFirstHeading?: boolean }
  ) => (
    <div className="stack">
      {groups.map((group, idx) => (
        <div key={group.seasonId} className="stack">
          {idx === 0 && !options?.showFirstHeading ? null : (
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
                reloadDocument={forceDocumentNavigation}
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
  );

  return (
    <section className="stack">
      <div className="stack">
        {myEvents.length > 0 && (
          <article className="card">
            <header className="card-header" style={{ alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1, fontWeight: 800, fontSize: '1.25rem' }}>My Events</div>
              <span className="badge neutral">
                {myEvents.length} {myEvents.length === 1 ? 'event' : 'events'}
              </span>
            </header>
            {renderEventGroups(groupedMyEvents, { showFirstHeading: true })}
          </article>
        )}

        <article className="card">
          <header className="card-header" style={{ alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>Event Calendar</div>
              <div
                ref={seasonMenuRef}
                style={{ position: 'relative', minWidth: '220px' }}
              >
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setSeasonMenuOpen((open) => !open)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--panel-input-border)',
                    background: 'var(--panel-input-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '1rem'
                  }}
                >
                  <span>{selectedSeasonName}</span>
                  <span aria-hidden="true">{seasonMenuOpen ? '▴' : '▾'}</span>
                </button>
                {seasonMenuOpen && (
                  <div
                    className="card"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 0.35rem)',
                      left: 0,
                      zIndex: 20,
                      minWidth: '280px',
                      padding: '0.35rem',
                      boxShadow: 'var(--panel-card-shadow)',
                      background: 'var(--modal-surface)',
                      border: '1px solid var(--modal-border)',
                      backdropFilter: 'blur(10px)'
                    }}
                  >
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setSelectedSeason('');
                        setSeasonMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '0.5rem'
                      }}
                    >
                      <span>All seasons</span>
                      {!selectedSeason && <span className="badge neutral">Selected</span>}
                    </button>
                    {[...seasons]
                      .sort((a, b) => b.name.localeCompare(a.name))
                      .map((season) => (
                        <div
                          key={season.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              setSelectedSeason(String(season.id));
                              setSeasonMenuOpen(false);
                            }}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              minWidth: 0,
                              padding: '0.55rem 0.65rem',
                              borderRadius: '0.5rem'
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {season.name}
                            </span>
                            {selectedSeason === String(season.id) && <span className="badge neutral">Selected</span>}
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              className="ghost danger"
                              aria-label={`Delete ${season.name}`}
                              disabled={deletingSeasonId === season.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteSeason(season);
                              }}
                              style={{
                                padding: '0.4rem 0.6rem',
                                lineHeight: 1,
                                fontSize: '1rem'
                              }}
                            >
                              {deletingSeasonId === season.id ? '…' : 'x'}
                            </button>
                          )}
                        </div>
                      ))}
                    {canManage && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setSeasonMenuOpen(false);
                          navigate('/seasons/new');
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.55rem 0.65rem',
                          borderRadius: '0.5rem',
                          fontWeight: 700
                        }}
                      >
                        Create season
                      </button>
                    )}
                  </div>
                )}
              </div>
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
            <p className="muted">No future events scheduled</p>
          ) : (
            renderEventGroups(groupedEvents, { showFirstHeading: !selectedSeason })
          )}
          <footer className="card-footer">
            <div className="card-actions">
              {canManage && (
                <Link className="primary button-link" to="/events/new">
                  Create event
                </Link>
              )}
              <button className="ghost" type="button" onClick={() => setShowPast((v) => !v)}>
                {showPast ? 'Hide past events' : 'Show past events'}
              </button>
            </div>
          </footer>
        </article>

        {seasons.length === 0 && !canManage && (
          <article className="card">
            <p className="muted">No seasons yet. Create one to get started.</p>
          </article>
        )}
      </div>
    </section>
  );
};

export default EventCalendarPage;
