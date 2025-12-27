import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Event, Season, listEvents, listSeasons } from '../api/events';
import { ParticipantProfile, listParticipantProfiles } from '../api/participants';
import { roleOptions } from '../utils/roles';

type ParticipantCard = {
  id: number;
  full_name: string;
  email?: string;
  phone?: string;
  experience_level?: string;
  emergency_contact?: string;
  eventCount: number;
};

const sortSeasonsDesc = (seasons: Season[]) =>
  [...seasons].sort((a, b) => b.name.localeCompare(a.name));

const ParticipantOnboardingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>(() => searchParams.get('season') || '');
  const [selectedEvent, setSelectedEvent] = useState<string>(() => searchParams.get('event') || '');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    const rolesParam = searchParams.get('roles');
    return rolesParam ? rolesParam.split(',').filter(Boolean) : [];
  });
  const [nameQuery, setNameQuery] = useState<string>(() => searchParams.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightName = (name: string) => {
    if (!nameQuery.trim()) return name;
    const query = nameQuery.trim();
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'ig');
    return name.split(regex).map((part, idx) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={idx}>{part}</mark>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedSeason) next.set('season', selectedSeason);
    if (selectedEvent) next.set('event', selectedEvent);
    if (selectedRoles.length) next.set('roles', selectedRoles.join(','));
    if (nameQuery) next.set('q', nameQuery);
    setSearchParams(next, { replace: true });
  }, [selectedSeason, selectedEvent, selectedRoles, nameQuery, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResp, eventResp, participantResp] = await Promise.all([
          listSeasons(),
          listEvents(),
          listParticipantProfiles()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setParticipants(Array.isArray(participantResp) ? participantResp : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load participants');
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

  const participantLookup = useMemo(() => {
    const map = new Map<number, ParticipantProfile>();
    participants.forEach((p) => map.set(p.id, p));
    return map;
  }, [participants]);

  const participantEventsMap = useMemo(() => {
    const map = new Map<number, Event[]>();
    events.forEach((event) => {
      (Array.isArray(event.participant_ids) ? event.participant_ids : []).forEach((id) => {
        const list = map.get(id) || [];
        list.push(event);
        map.set(id, list);
      });
    });
    return map;
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    const seasonId = Number(selectedSeason);
    return events.filter((event) => event.season_id === seasonId);
  }, [events, selectedSeason]);

  const filteredParticipants: ParticipantCard[] = useMemo(() => {
    const matchesSelectedRoles = (profile?: ParticipantProfile | null) => {
      const requiredRoles = selectedRoles.filter((role) => role !== 'Participant');
      if (!requiredRoles.length) return true;
      const roles = Array.isArray(profile?.roles) ? profile?.roles : [];
      return requiredRoles.every((role) => roles.includes(role));
    };
    const matchesName = (profile?: ParticipantProfile | null) => {
      if (!nameQuery.trim()) return true;
      const fullName = profile?.full_name || '';
      return fullName.toLowerCase().includes(nameQuery.trim().toLowerCase());
    };

    const addParticipant = (id: number, acc: ParticipantCard[], seen: Set<number>) => {
      if (seen.has(id)) return;
      seen.add(id);
      const profile = participantLookup.get(id);
      if (!matchesSelectedRoles(profile)) return;
      if (!matchesName(profile)) return;
      const eventCount = participantEventsMap.get(id)?.length || 0;
      acc.push({
        id,
        full_name: profile?.full_name || `Participant #${id}`,
        email: profile?.email,
        phone: profile?.phone,
        experience_level: profile?.experience_level,
        emergency_contact: profile?.emergency_contact,
        eventCount
      });
    };

    const seen = new Set<number>();
    const result: ParticipantCard[] = [];

    if (selectedEvent) {
      const event = events.find((evt) => evt.id === Number(selectedEvent));
      if (!event) return [];
      (Array.isArray(event.participant_ids) ? event.participant_ids : []).forEach((id) =>
        addParticipant(id, result, seen)
      );
      return result;
    }

    if (selectedSeason) {
      filteredEvents.forEach((evt) => {
        (Array.isArray(evt.participant_ids) ? evt.participant_ids : []).forEach((id) =>
          addParticipant(id, result, seen)
        );
      });
      return result;
    }

    participants.forEach((p) => addParticipant(p.id, result, seen));
    return result;
  }, [
    selectedEvent,
    selectedSeason,
    selectedRoles,
    nameQuery,
    events,
    filteredEvents,
    participants,
    participantLookup,
    participantEventsMap
  ]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedSeason) params.set('season', selectedSeason);
    if (selectedEvent) params.set('event', selectedEvent);
    if (selectedRoles.length) params.set('roles', selectedRoles.join(','));
    if (nameQuery) params.set('q', nameQuery);
    const serialized = params.toString();
    return serialized ? `?${serialized}` : '';
  }, [selectedSeason, selectedEvent, selectedRoles, nameQuery]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Participants</h2>
        </div>
        <Link className="primary button-link" to="/participants/new">
          Add participant
        </Link>
      </header>

      <div className="stack">
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
                {sortSeasonsDesc(seasons).map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Event</span>
              <select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>
                <option value="">All events</option>
                {filteredEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Name</span>
              <input
                type="text"
                placeholder="Search by name"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
              />
            </label>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Roles</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {roleOptions
                  .filter((role) => role !== 'Participant')
                  .map((role) => {
                  const checked = selectedRoles.includes(role);
                  return (
                    <label
                      key={role}
                      className="badge neutral"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedRoles((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(role);
                            } else {
                              next.delete(role);
                            }
                            return Array.from(next);
                          });
                        }}
                      />
                      {role}
                    </label>
                  );
                })}
                {selectedRoles.length > 0 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setSelectedRoles([])}
                    style={{ padding: '0.2rem 0.6rem' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
          {selectedSeason && filteredEvents.length === 0 && (
            <p className="muted">No events for this season.</p>
          )}
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <h3>Participants</h3>
            </div>
            <span className="badge neutral">
              {filteredParticipants.length} {filteredParticipants.length === 1 ? 'participant' : 'participants'}
            </span>
          </header>
          {loading ? (
            <p className="muted">Loading participants…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : filteredParticipants.length === 0 ? (
            <p className="muted">No participants match the selected filters.</p>
          ) : (
            <ul className="status-list">
              {filteredParticipants.map((p) => (
                <li key={p.id}>
                  <Link
                    to={{ pathname: `/participants/${p.id}`, search: queryString }}
                    className="card-link"
                    style={{ flex: 1 }}
                  >
                    <strong>{highlightName(p.full_name)}</strong>
                    <div className="muted">{p.email || 'No email on file'}</div>
                    <div className="muted">
                      Experience: {p.experience_level || 'Not provided'}
                    </div>
                  </Link>
                  <span className="badge neutral">
                    {p.eventCount} {p.eventCount === 1 ? 'event' : 'events'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
};

export default ParticipantOnboardingPage;
