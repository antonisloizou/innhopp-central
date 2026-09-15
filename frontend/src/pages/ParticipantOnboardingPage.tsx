import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Event, Season, listEvents, listSeasons } from '../api/events';
import { ParticipantProfile, listParticipantProfiles } from '../api/participants';
import { useAuth } from '../auth/AuthProvider';
import { formatEventLocalDate, parseEventLocal } from '../utils/eventDate';
import { incompleteProfileWarning, isProfileCompleteForRegistration } from '../utils/profileCompleteness';
import { roleOptions } from '../utils/roles';

type ParticipantCard = {
  id: number;
  full_name: string;
  email?: string;
  phone?: string;
  jump_count?: number;
  years_in_sport?: number;
  emergency_contact?: string;
  eventCount: number;
  registeredAt: string;
  isStaff: boolean;
  profileIncomplete: boolean;
};

type ParticipantSortField = 'name' | 'registrationDate' | 'eventCount';
type ParticipantSort = { field: ParticipantSortField; direction: 'asc' | 'desc' };

const isNewsletterSubscriberOnly = (profile: ParticipantProfile, eventCount: number) => {
  const normalize = (value: string) => value.trim().toLowerCase();
  const hasAdditionalText = [
    profile.phone,
    profile.notes,
    profile.emergency_contact,
    profile.emergency_contact_name,
    profile.emergency_contact_phone,
    profile.whatsapp,
    profile.instagram,
    profile.citizenship,
    profile.date_of_birth,
    profile.main_canopy,
    profile.wingload,
    profile.license,
    profile.canopy_course,
    profile.landing_area_preference,
    profile.tshirt_size,
    profile.tshirt_gender,
    profile.medical_conditions
  ].some((value) => Boolean(value?.trim()));
  const hasAdditionalValues =
    profile.jumper ||
    typeof profile.years_in_sport === 'number' ||
    typeof profile.jump_count === 'number' ||
    typeof profile.recent_jump_count === 'number' ||
    profile.ratings.length > 0 ||
    profile.disciplines.length > 0 ||
    profile.other_air_sports.length > 0 ||
    profile.dietary_restrictions.length > 0 ||
    profile.medical_expertise.length > 0 ||
    profile.hss_qualities.length > 0 ||
    profile.roles.some((role) => role !== 'Participant') ||
    profile.account_roles.length > 0;

  return eventCount === 0 &&
    normalize(profile.full_name) === normalize(profile.email) &&
    !hasAdditionalText &&
    !hasAdditionalValues;
};

const sortSeasonsDesc = (seasons: Season[]) =>
  [...seasons].sort((a, b) => b.name.localeCompare(a.name));

const sortParticipantsByName = (participants: ParticipantCard[]) =>
  [...participants].sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }));

const sortEventsByStartDateAscending = (events: Event[]) =>
  [...events].sort(
    (left, right) =>
      (parseEventLocal(left.starts_at)?.getTime() ?? 0) -
      (parseEventLocal(right.starts_at)?.getTime() ?? 0)
  );

const ParticipantOnboardingPage = () => {
  const { impersonateNewUser, user } = useAuth();
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
  const [emailQuery, setEmailQuery] = useState<string>(() => searchParams.get('email') || '');
  const [eventCountQuery, setEventCountQuery] = useState<string>(() => searchParams.get('event_count') || '');
  const [profileCompletedOnly, setProfileCompletedOnly] = useState(() => searchParams.get('profile_completed') === 'true');
  const [excludeNewsletterSubscribersOnly, setExcludeNewsletterSubscribersOnly] = useState(
    () => searchParams.get('exclude_newsletter_subscribers_only') !== 'false'
  );
  const [sectionSorts, setSectionSorts] = useState<Record<'participants' | 'staff', ParticipantSort>>({
    participants: { field: 'name', direction: 'asc' },
    staff: { field: 'name', direction: 'asc' }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonatingNewUser, setImpersonatingNewUser] = useState(false);
  const [openSections, setOpenSections] = useState({ participants: true, staff: true });

  const canImpersonateNewUser =
    (user?.roles?.includes('admin') ?? false) &&
    !user?.impersonator;

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
    if (emailQuery) next.set('email', emailQuery);
    if (eventCountQuery) next.set('event_count', eventCountQuery);
    if (profileCompletedOnly) next.set('profile_completed', 'true');
    if (!excludeNewsletterSubscribersOnly) next.set('exclude_newsletter_subscribers_only', 'false');
    setSearchParams(next, { replace: true });
  }, [selectedSeason, selectedEvent, selectedRoles, nameQuery, emailQuery, eventCountQuery, profileCompletedOnly, excludeNewsletterSubscribersOnly, setSearchParams]);

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
    const matchesEmail = (profile?: ParticipantProfile | null) => {
      if (!emailQuery.trim()) return true;
      const email = profile?.email || '';
      return email.toLowerCase().includes(emailQuery.trim().toLowerCase());
    };
    const matchesEventCount = (eventCount: number) => {
      if (!eventCountQuery.trim()) return true;
      const count = Number(eventCountQuery);
      return Number.isInteger(count) && count >= 0 && eventCount === count;
    };

    const addParticipant = (id: number, acc: ParticipantCard[], seen: Set<number>) => {
      if (seen.has(id)) return;
      seen.add(id);
      const profile = participantLookup.get(id);
      if (!matchesSelectedRoles(profile)) return;
      if (!matchesName(profile)) return;
      if (!matchesEmail(profile)) return;
      if (profileCompletedOnly && (!profile || !isProfileCompleteForRegistration(profile))) return;
      const eventCount = participantEventsMap.get(id)?.length || 0;
      if (!matchesEventCount(eventCount)) return;
      if (excludeNewsletterSubscribersOnly && profile && isNewsletterSubscriberOnly(profile, eventCount)) return;
      acc.push({
        id,
        full_name: profile?.full_name || `Participant #${id}`,
        email: profile?.email,
        phone: profile?.phone,
        jump_count: profile?.jump_count,
        years_in_sport: profile?.years_in_sport,
        emergency_contact: profile?.emergency_contact,
        eventCount,
        registeredAt: profile?.created_at || '',
        isStaff: Array.isArray(profile?.roles) && profile.roles.includes('Staff'),
        profileIncomplete: !profile || !isProfileCompleteForRegistration(profile)
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
      return sortParticipantsByName(result);
    }

    if (selectedSeason) {
      filteredEvents.forEach((evt) => {
        (Array.isArray(evt.participant_ids) ? evt.participant_ids : []).forEach((id) =>
          addParticipant(id, result, seen)
        );
      });
      return sortParticipantsByName(result);
    }

    participants.forEach((p) => addParticipant(p.id, result, seen));
    return sortParticipantsByName(result);
  }, [
    selectedEvent,
    selectedSeason,
    selectedRoles,
    nameQuery,
    emailQuery,
    eventCountQuery,
    profileCompletedOnly,
    excludeNewsletterSubscribersOnly,
    events,
    filteredEvents,
    participants,
    participantLookup,
    participantEventsMap
  ]);

  const participantCards = useMemo(
    () =>
      filteredParticipants
        .filter((participant) => !participant.isStaff)
        .sort((a, b) => {
          const sort = sectionSorts.participants;
          const difference = sort.field === 'name'
            ? a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
            : sort.field === 'eventCount'
              ? a.eventCount - b.eventCount
            : new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime();
          return sort.direction === 'asc' ? difference : -difference;
        }),
    [filteredParticipants, sectionSorts.participants]
  );

  const staffCards = useMemo(
    () =>
      filteredParticipants
        .filter((participant) => participant.isStaff)
        .sort((a, b) => {
          const sort = sectionSorts.staff;
          const difference = sort.field === 'name'
            ? a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
            : sort.field === 'eventCount'
              ? a.eventCount - b.eventCount
            : new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime();
          return sort.direction === 'asc' ? difference : -difference;
        }),
    [filteredParticipants, sectionSorts.staff]
  );

  const toggleSection = (section: keyof typeof openSections) =>
    setOpenSections((previous) => ({ ...previous, [section]: !previous[section] }));

  const sortBy = (section: 'participants' | 'staff', field: ParticipantSortField) => {
    setSectionSorts((previous) => {
      const current = previous[section];
      return {
        ...previous,
        [section]: {
          field,
          direction: current.field === field ? (current.direction === 'asc' ? 'desc' : 'asc') : (field === 'name' ? 'asc' : 'desc')
        }
      };
    });
  };

  const SortIcon = ({ section, field }: { section: 'participants' | 'staff'; field: ParticipantSortField }) => (
    <span className="participant-onboarding-sort-icon" aria-hidden="true">
      <span
        className={`material-symbols-outlined ${sectionSorts[section].field === field && sectionSorts[section].direction === 'asc' ? 'is-active' : ''}`}
      >
        keyboard_arrow_up
      </span>
      <span
        className={`material-symbols-outlined ${sectionSorts[section].field === field && sectionSorts[section].direction === 'desc' ? 'is-active' : ''}`}
      >
        keyboard_arrow_down
      </span>
    </span>
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedSeason) params.set('season', selectedSeason);
    if (selectedEvent) params.set('event', selectedEvent);
    if (selectedRoles.length) params.set('roles', selectedRoles.join(','));
    if (nameQuery) params.set('q', nameQuery);
    if (emailQuery) params.set('email', emailQuery);
    if (eventCountQuery) params.set('event_count', eventCountQuery);
    if (profileCompletedOnly) params.set('profile_completed', 'true');
    if (!excludeNewsletterSubscribersOnly) params.set('exclude_newsletter_subscribers_only', 'false');
    const serialized = params.toString();
    return serialized ? `?${serialized}` : '';
  }, [selectedSeason, selectedEvent, selectedRoles, nameQuery, emailQuery, eventCountQuery, profileCompletedOnly, excludeNewsletterSubscribersOnly]);

  return (
    <section className="stack">
      <header className="page-header participant-onboarding-header">
        <div>
          <h2>The Innhopp Family</h2>
        </div>
        <div className="participant-onboarding-actions">
          {canImpersonateNewUser && (
            <button
              className="primary"
              type="button"
              disabled={impersonatingNewUser}
              onClick={async () => {
                try {
                  setImpersonatingNewUser(true);
                  setError(null);
                  await impersonateNewUser();
                  window.location.replace('/profile');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to impersonate a new user');
                  setImpersonatingNewUser(false);
                }
              }}
            >
              {impersonatingNewUser ? 'Impersonating…' : 'Impersonate New User'}
            </button>
          )}
          <Link
            className="primary button-link"
            to="/participants/new"
          >
            Add participant
          </Link>
        </div>
      </header>

      <article className="card">
        <div className="form-grid participant-onboarding-filters">
          <label className="form-field">
            <span>Season</span>
            <select
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setSelectedEvent('');
              }}
              className="participant-onboarding-season-select"
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
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="participant-onboarding-event-select"
            >
              <option value="">All events</option>
              {sortEventsByStartDateAscending(filteredEvents).map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Name</span>
            <input
              type="text"
              placeholder="Search by name"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Email</span>
            <input
              type="text"
              placeholder="Search by email"
              value={emailQuery}
              onChange={(e) => setEmailQuery(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Number of events registered</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Any"
              value={eventCountQuery}
              onChange={(e) => setEventCountQuery(e.target.value)}
            />
          </label>
          <label className="form-field participant-onboarding-profile-completed-field">
            <span>Profile completed</span>
            <input
              type="checkbox"
              className="participant-onboarding-completed-checkbox"
              checked={profileCompletedOnly}
              onChange={(e) => setProfileCompletedOnly(e.target.checked)}
            />
          </label>
          <div className="form-field participant-onboarding-roles-field">
            <span>Roles</span>
            <div className="participant-onboarding-roles-list">
              {roleOptions
                .filter((role) => role !== 'Participant')
                .map((role) => {
                const checked = selectedRoles.includes(role);
                return (
                  <label key={role} className="badge neutral participant-onboarding-role-badge">
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
                  className="ghost participant-onboarding-clear-button"
                  onClick={() => setSelectedRoles([])}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <label className="participant-onboarding-newsletter-filter">
            <span>Hide Only Newsletter Subscribers</span>
            <input
              type="checkbox"
              className="participant-onboarding-completed-checkbox"
              checked={excludeNewsletterSubscribersOnly}
              onChange={(e) => setExcludeNewsletterSubscribersOnly(e.target.checked)}
            />
          </label>
        </div>
        {selectedSeason && filteredEvents.length === 0 && (
          <p className="muted">No events for this season.</p>
        )}
      </article>

      <div className="participant-onboarding-results">
        {([
          { key: 'participants' as const, title: 'Participants', singular: 'participant', people: participantCards },
          { key: 'staff' as const, title: 'Staff', singular: 'staff', people: staffCards }
        ]).map(({ key, title, singular, people }) => (
          <article key={key} className="card">
            <header
              className="card-header event-detail-section-header"
              onClick={() => toggleSection(key)}
            >
              <div className="event-detail-section-header-main">
                <button
                  className="ghost"
                  type="button"
                  aria-label={`${openSections[key] ? 'Collapse' : 'Expand'} ${title}`}
                  aria-expanded={openSections[key]}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSection(key);
                  }}
                >
                  {openSections[key] ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">{title}</h3>
              </div>
              <span className="badge neutral participant-onboarding-event-count">
                {people.length} {people.length === 1 ? singular : title.toLowerCase()}
              </span>
            </header>
            {openSections[key] && (
              <>
                <div className="participant-onboarding-table-header">
                  <button
                    className="ghost participant-onboarding-sort-button"
                    type="button"
                    onClick={() => sortBy(key, 'name')}
                    aria-label={`Sort by name${sectionSorts[key].field === 'name' ? `, currently ${sectionSorts[key].direction === 'asc' ? 'A to Z' : 'Z to A'}` : ''}`}
                  >
                    Name <SortIcon section={key} field="name" />
                  </button>
                  <button
                    className="ghost participant-onboarding-sort-button"
                    type="button"
                    onClick={() => sortBy(key, 'registrationDate')}
                    aria-label={`Sort by registration date${sectionSorts[key].field === 'registrationDate' ? `, currently ${sectionSorts[key].direction === 'asc' ? 'oldest first' : 'newest first'}` : ''}`}
                  >
                    Registration date <SortIcon section={key} field="registrationDate" />
                  </button>
                  <button
                    className="ghost participant-onboarding-sort-button participant-onboarding-events-sort-button"
                    type="button"
                    onClick={() => sortBy(key, 'eventCount')}
                    aria-label={`Sort by number of events${sectionSorts[key].field === 'eventCount' ? `, currently ${sectionSorts[key].direction === 'asc' ? 'fewest first' : 'most first'}` : ''}`}
                  >
                    Events <SortIcon section={key} field="eventCount" />
                  </button>
                </div>
                {loading ? (
                  <p className="muted">Loading {title.toLowerCase()}…</p>
                ) : error ? (
                  <p className="error-text">{error}</p>
                ) : people.length === 0 ? (
                  <p className="muted">No {title.toLowerCase()} match the selected filters.</p>
                ) : (
                  <ul className="status-list">
                {people.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={{ pathname: `/participants/${p.id}`, search: queryString }}
                      className="card-link participant-onboarding-card-link"
                    >
                      <strong>
                        {highlightName(p.full_name)}
                        {p.profileIncomplete && (
                          <span
                            className="nav-user-warning participant-onboarding-profile-warning"
                            title={incompleteProfileWarning}
                            aria-label={incompleteProfileWarning}
                          >
                            !
                          </span>
                        )}
                      </strong>
                      <div className="muted">{p.email || 'No email on file'}</div>
                      <div className="muted">
                        Jumps: {typeof p.jump_count === 'number' ? p.jump_count : '-'} · Years in sport:{' '}
                        {typeof p.years_in_sport === 'number' ? p.years_in_sport : '-'}
                      </div>
                    </Link>
                    <time className="muted participant-onboarding-registration-date" dateTime={p.registeredAt}>
                      {p.registeredAt ? formatEventLocalDate(p.registeredAt) : 'Unknown'}
                    </time>
                    <span className="badge neutral participant-onboarding-event-count">
                      {p.eventCount} {p.eventCount === 1 ? 'event' : 'events'}
                    </span>
                  </li>
                ))}
                  </ul>
                )}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};

export default ParticipantOnboardingPage;
