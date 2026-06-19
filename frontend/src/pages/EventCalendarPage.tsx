import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canManageEvents } from '../auth/access';
import { Event, Season, deleteSeason, listEvents, listSeasons } from '../api/events';
import { ParticipantProfile, getMyParticipantProfile, listParticipantProfiles } from '../api/participants';
import { formatEventLocal, parseEventLocal } from '../utils/eventDate';
import { countVisibleParticipants } from '../utils/eventParticipants';

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

const formatMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric'
  }).format(date);

const formatMonthDayLabel = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(date);

const buildMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const shiftMonth = (date: Date, delta: number) =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1);

const getMonthDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const CALENDAR_CARD_STATE_KEY = 'event-calendar-card-state';

type CalendarCardState = {
  monthOverview: boolean;
  myEvents: boolean;
  eventCalendar: boolean;
};

type MonthWeek = {
  key: string;
  dates: Date[];
};

type WeekEventSegment = {
  key: string;
  event: Event;
  startColumn: number;
  endColumn: number;
  startsBeforeWeek: boolean;
  endsAfterWeek: boolean;
  lane: number;
};

const defaultCardState: CalendarCardState = {
  monthOverview: true,
  myEvents: true,
  eventCalendar: true
};

const compareEventsChronologically = (a: Event, b: Event) => {
  const startA = parseEventLocal(a.starts_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  const startB = parseEventLocal(b.starts_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (startA !== startB) return startA - startB;

  const endA = parseEventLocal(a.ends_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  const endB = parseEventLocal(b.ends_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (endA !== endB) return endA - endB;

  const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (nameCmp !== 0) return nameCmp;
  return a.id - b.id;
};

const CollapsibleCalendarCard = ({
  title,
  open,
  onToggle,
  badge,
  toolbar,
  footer,
  children
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) => (
  <article className="card">
    <header className="card-header event-calendar-card-header" onClick={onToggle}>
      <div className="event-calendar-header-main">
        <button
          className="ghost"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        <div className="event-calendar-toolbar">
          <div className="event-calendar-title-block">{title}</div>
          {toolbar}
        </div>
      </div>
      {badge}
    </header>
    {open ? children : null}
    {open && footer ? <footer className="card-footer">{footer}</footer> : null}
  </article>
);

const EventCalendarPage = () => {
  const { user, refreshSession } = useAuth();
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
  const [cardState, setCardState] = useState<CalendarCardState>(defaultCardState);
  const [currentMonth, setCurrentMonth] = useState(() => buildMonthStart(new Date()));
  const canManage = canManageEvents(user);
  const forceDocumentNavigation = !!user?.impersonator;
  const seasonMenuRef = useRef<HTMLDivElement | null>(null);
  const cardStateRestoredRef = useRef(false);

  const seasonLookup = useMemo(() => {
    const map = new Map<number, Season>();
    (Array.isArray(seasons) ? seasons : []).forEach((season) => map.set(season.id, season));
    return map;
  }, [seasons]);

  useEffect(() => {
    let cancelled = false;
    const isAuthError = (error: unknown) =>
      typeof error === 'object' && error !== null && 'status' in error &&
      ((error as { status?: number }).status === 401 || (error as { status?: number }).status === 403);

    const loadCalendarData = async () => {
      const [seasonResponse, eventResponse] = await Promise.all([listSeasons(), listEvents()]);
      if (cancelled) return;
      setSeasons(Array.isArray(seasonResponse) ? seasonResponse : []);
      setEvents(normalizeEvents(eventResponse as Event[]));
    };

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await refreshSession();
        try {
          await loadCalendarData();
        } catch (calendarError) {
          if (!isAuthError(calendarError)) {
            throw calendarError;
          }
          await refreshSession();
          await loadCalendarData();
        }

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
  }, [refreshSession]);

  useEffect(() => {
    if (cardStateRestoredRef.current) return;
    try {
      const saved = sessionStorage.getItem(CALENDAR_CARD_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setCardState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
    cardStateRestoredRef.current = true;
  }, []);

  useEffect(() => {
    if (!cardStateRestoredRef.current) return;
    try {
      sessionStorage.setItem(CALENDAR_CARD_STATE_KEY, JSON.stringify(cardState));
    } catch {
      // ignore
    }
  }, [cardState]);

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

    const sortNameAsc = (a: number, b: number) => {
      const nameA = seasonLookup.get(a)?.name || `Season ${a}`;
      const nameB = seasonLookup.get(b)?.name || `Season ${b}`;
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) return cmp;
      return a - b;
    };

    return Array.from(map.entries())
      .sort(([a], [b]) => sortNameAsc(a, b))
      .map(([seasonId, group]) => ({
        seasonId,
        label: seasonLookup.get(seasonId)?.name || `Season ${seasonId}`,
        events: [...group].sort(compareEventsChronologically)
      }));
  }, [visibleEvents, seasonLookup]);

  const groupedMyEvents = useMemo(() => {
    const map = new Map<number, Event[]>();
    myEvents.forEach((event) => {
      const list = map.get(event.season_id) || [];
      list.push(event);
      map.set(event.season_id, list);
    });

    const sortNameAsc = (a: number, b: number) => {
      const nameA = seasonLookup.get(a)?.name || `Season ${a}`;
      const nameB = seasonLookup.get(b)?.name || `Season ${b}`;
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) return cmp;
      return a - b;
    };

    return Array.from(map.entries())
      .sort(([a], [b]) => sortNameAsc(a, b))
      .map(([seasonId, group]) => ({
        seasonId,
        label: seasonLookup.get(seasonId)?.name || `Season ${seasonId}`,
        events: [...group].sort(compareEventsChronologically)
      }));
  }, [myEvents, seasonLookup]);

  const participantLookup = useMemo(() => {
    const map = new Map<number, ParticipantProfile>();
    participants.forEach((p) => map.set(p.id, p));
    return map;
  }, [participants]);

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
    const seasonEvents = events.filter((event) => event.season_id === season.id);
    const eventList = seasonEvents.length
      ? `\n\nThis will also delete these events:\n${seasonEvents.map((event) => `- ${event.name}`).join('\n')}`
      : '\n\nNo events are currently attached to this season.';
    const confirmed = window.confirm(`Delete "${season.name}"?${eventList}`);
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

  const toggleCard = (key: keyof CalendarCardState) => {
    setCardState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const monthEvents = useMemo(() => {
    const monthStart = buildMonthStart(currentMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    return visibleEvents.filter((event) => {
      const starts = parseEventLocal(event.starts_at);
      const ends = parseEventLocal(event.ends_at) ?? starts;
      if (!starts || !ends) return false;
      return starts <= monthEnd && ends >= monthStart;
    });
  }, [currentMonth, visibleEvents]);

  const monthEventMap = useMemo(() => {
    const map = new Map<string, Event[]>();
    const monthStart = buildMonthStart(currentMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    monthEvents.forEach((event) => {
      const startDate = parseEventLocal(event.starts_at);
      const endDate = parseEventLocal(event.ends_at) ?? startDate;
      if (!startDate || !endDate) return;
      const rangeStart = startDate < monthStart ? monthStart : startDate;
      const rangeEnd = endDate > monthEnd ? monthEnd : endDate;
      for (
        let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
        cursor <= rangeEnd;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        const key = getMonthDateKey(cursor);
        const list = map.get(key) || [];
        list.push(event);
        map.set(key, list);
      }
    });
    map.forEach((group, key) => {
      map.set(key, [...group].sort(compareEventsChronologically));
    });
    return map;
  }, [monthEvents]);

  const monthGridDays = useMemo(() => {
    const monthStart = buildMonthStart(currentMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    const days: { date: Date; key: string; inMonth: boolean; events: Event[] }[] = [];
    for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      const date = new Date(cursor);
      const key = getMonthDateKey(date);
      days.push({
        date,
        key,
        inMonth: date.getMonth() === monthStart.getMonth(),
        events: monthEventMap.get(key) || []
      });
    }
    return days;
  }, [currentMonth, monthEventMap]);

  const monthWeeks = useMemo<MonthWeek[]>(() => {
    const weeks: MonthWeek[] = [];
    for (let index = 0; index < monthGridDays.length; index += 7) {
      const dates = monthGridDays.slice(index, index + 7).map((day) => day.date);
      weeks.push({
        key: dates[0] ? getMonthDateKey(dates[0]) : `week-${index / 7}`,
        dates
      });
    }
    return weeks;
  }, [monthGridDays]);

  const monthWeekSegments = useMemo(() => {
    return monthWeeks.map((week) => {
      const weekStart = startOfDay(week.dates[0]);
      const weekEnd = endOfDay(week.dates[6]);
      const overlappingEvents = monthEvents
        .filter((event) => {
          const eventStart = parseEventLocal(event.starts_at);
          const eventEnd = parseEventLocal(event.ends_at) ?? eventStart;
          if (!eventStart || !eventEnd) return false;
          return eventStart <= weekEnd && eventEnd >= weekStart;
        })
        .sort(compareEventsChronologically);

      const laneEndColumns: number[] = [];
      const segments: WeekEventSegment[] = overlappingEvents.map((event) => {
        const eventStart = parseEventLocal(event.starts_at)!;
        const eventEnd = parseEventLocal(event.ends_at) ?? eventStart;
        const startColumn = Math.max(
          1,
          Math.min(
            7,
            Math.floor((startOfDay(eventStart).getTime() - weekStart.getTime()) / 86400000) + 1
          )
        );
        const endColumn = Math.max(
          startColumn,
          Math.min(
            7,
            Math.floor((startOfDay(eventEnd).getTime() - weekStart.getTime()) / 86400000) + 1
          )
        );

        let lane = 0;
        while ((laneEndColumns[lane] ?? 0) >= startColumn) lane += 1;
        laneEndColumns[lane] = endColumn;

        return {
          key: `${event.id}:${week.key}`,
          event,
          startColumn,
          endColumn,
          startsBeforeWeek: eventStart < weekStart,
          endsAfterWeek: eventEnd > weekEnd,
          lane
        };
      });

      return {
        week,
        segments,
        laneCount: laneEndColumns.length
      };
    });
  }, [monthEvents, monthWeeks]);

  const renderEventGroups = (
    groups: { seasonId: number; label: string; events: Event[] }[],
    options?: { showFirstHeading?: boolean }
  ) => (
    <div className="stack">
      {groups.map((group, idx) => (
        <div key={group.seasonId} className="stack">
          {idx === 0 && !options?.showFirstHeading ? null : (
            <p className="muted event-calendar-group-heading">
              <span className="event-calendar-group-title">{group.label}</span>
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
                    const slotCount = event.slots ?? 0;
                    const remaining = Math.max(event.remaining_slots ?? 0, 0);
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
                            <dd>{countVisibleParticipants(event.participant_ids, participantLookup)}</dd>
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
        <CollapsibleCalendarCard
          title="Monthly Overview"
          open={cardState.monthOverview}
          onToggle={() => toggleCard('monthOverview')}
          badge={
            <span className="badge neutral">
              {monthEvents.length} {monthEvents.length === 1 ? 'event' : 'events'}
            </span>
          }
          toolbar={
            <div className="event-calendar-month-nav" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="ghost event-calendar-month-button"
                aria-label="Previous month"
                onClick={() => setCurrentMonth((prev) => shiftMonth(prev, -1))}
              >
                ‹
              </button>
              <span className="event-calendar-month-label">{formatMonthLabel(currentMonth)}</span>
              <button
                type="button"
                className="ghost event-calendar-month-button"
                aria-label="Next month"
                onClick={() => setCurrentMonth((prev) => shiftMonth(prev, 1))}
              >
                ›
              </button>
            </div>
          }
        >
          <div className="event-calendar-month-grid-wrap">
            <div className="event-calendar-month-weekdays" aria-hidden="true">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                <div key={label} className="event-calendar-month-weekday">
                  {label}
                </div>
              ))}
            </div>
            <div className="event-calendar-month-weeks">
              {monthWeekSegments.map(({ week, segments, laneCount }) => (
                <div
                  key={week.key}
                  className="event-calendar-month-week"
                  style={{ ['--event-calendar-week-lanes' as string]: String(Math.max(laneCount, 1)) }}
                >
                  {week.dates.map((date) => {
                    const inMonth = date.getMonth() === currentMonth.getMonth();
                    return (
                      <div
                        key={getMonthDateKey(date)}
                        className={`event-calendar-month-cell${inMonth ? '' : ' event-calendar-month-cell--muted'}`}
                      >
                        <div className="event-calendar-month-day-number">{date.getDate()}</div>
                      </div>
                    );
                  })}
                  <div className="event-calendar-month-bars">
                    {segments.map((segment) => {
                      const participantCount = countVisibleParticipants(
                        segment.event.participant_ids,
                        participantLookup
                      );
                      return (
                        <Link
                          key={segment.key}
                          className="event-calendar-month-event event-calendar-month-event-bar"
                          to={`/events/${segment.event.id}`}
                          reloadDocument={forceDocumentNavigation}
                          state={{ suppressHighlight: true }}
                          style={{
                            gridColumn: `${segment.startColumn} / ${segment.endColumn + 1}`,
                            gridRow: `${segment.lane + 1}`
                          }}
                          title={`${segment.event.name} • ${segment.event.location || 'Location TBD'}`}
                        >
                          <span className="event-calendar-month-event-title">
                            {segment.startsBeforeWeek ? '… ' : ''}
                            {segment.event.name}
                            {segment.endsAfterWeek ? ' …' : ''}
                          </span>
                          <span className="event-calendar-month-event-meta">
                            {segment.event.location || 'Location TBD'}
                          </span>
                          <span className="event-calendar-month-event-meta">
                            {formatMonthDayLabel(parseEventLocal(segment.event.starts_at) ?? week.dates[0])}
                            {' - '}
                            {formatMonthDayLabel(
                              parseEventLocal(segment.event.ends_at) ??
                                parseEventLocal(segment.event.starts_at) ??
                                week.dates[0]
                            )}
                            {' • '}
                            {participantCount} participants
                            {' • '}
                            {segment.event.innhopps?.length ?? 0} innhopps
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleCalendarCard>

        {myEvents.length > 0 && (
          <CollapsibleCalendarCard
            title="My Events"
            open={cardState.myEvents}
            onToggle={() => toggleCard('myEvents')}
            badge={
              <span className="badge neutral">
                {myEvents.length} {myEvents.length === 1 ? 'event' : 'events'}
              </span>
            }
          >
            {renderEventGroups(groupedMyEvents, { showFirstHeading: true })}
          </CollapsibleCalendarCard>
        )}

        <CollapsibleCalendarCard
          title="Event Calendar"
          open={cardState.eventCalendar}
          onToggle={() => toggleCard('eventCalendar')}
          badge={
            <span className="badge neutral">
              {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
            </span>
          }
          toolbar={
            <div onClick={(event) => event.stopPropagation()}>
              <div ref={seasonMenuRef} className="event-calendar-season-menu-wrap">
                <button
                  type="button"
                  className="ghost event-calendar-season-trigger"
                  onClick={() => setSeasonMenuOpen((open) => !open)}
                >
                  <span>{selectedSeasonName}</span>
                  <span aria-hidden="true">{seasonMenuOpen ? '▴' : '▾'}</span>
                </button>
                {seasonMenuOpen && (
                  <div className="card event-calendar-season-menu">
                    <button
                      type="button"
                      className="ghost event-calendar-season-option"
                      onClick={() => {
                        setSelectedSeason('');
                        setSeasonMenuOpen(false);
                      }}
                    >
                      <span>All seasons</span>
                    </button>
                    {[...seasons]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((season) => (
                        <div
                          key={season.id}
                          className="event-calendar-season-row"
                        >
                          <button
                            type="button"
                            className="ghost event-calendar-season-option event-calendar-season-option-grow"
                            onClick={() => {
                              setSelectedSeason(String(season.id));
                              setSeasonMenuOpen(false);
                            }}
                          >
                            <span className="event-calendar-season-option-label">
                              {season.name}
                            </span>
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              className="ghost danger event-calendar-season-delete"
                              aria-label={`Delete ${season.name}`}
                              disabled={deletingSeasonId === season.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteSeason(season);
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
                        className="ghost event-calendar-season-option event-calendar-season-create"
                        onClick={() => {
                          setSeasonMenuOpen(false);
                          navigate('/seasons/new');
                        }}
                      >
                        Create season
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          }
          footer={
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
          }
        >
          {loading ? (
            <p className="muted">Loading schedule…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : visibleEvents.length === 0 ? (
            <p className="muted">No future events scheduled</p>
          ) : (
            renderEventGroups(groupedEvents, { showFirstHeading: !selectedSeason })
          )}
        </CollapsibleCalendarCard>

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
