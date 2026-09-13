import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventLeaderboardParticipant, getMyEventLeaderboardParticipant, listEvents } from '../api/events';
import { listEventRegistrations, type Registration } from '../api/registrations';
import type { Event } from '../api/events';
import { formatEventLocalDate } from '../utils/eventDate';
import { useResourceStream } from '../hooks/useResourceStream';
import LeaderboardScoreCardOverlay from './LeaderboardScoreCardOverlay';

type Props = {
  participantId: number;
  participantName: string;
  useOwnScores?: boolean;
  registrations?: Registration[];
  registrationAccess?: 'own' | 'staff';
  onGoToEvent: (eventId: number) => void;
};

const compareEventsChronologically = (a: Event, b: Event) => {
  const startA = new Date(a.starts_at).getTime();
  const startB = new Date(b.starts_at).getTime();
  if (startA !== startB) return startA - startB;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

const ParticipantEventsCard = ({
  participantId,
  participantName,
  useOwnScores = false,
  registrations = [],
  registrationAccess = 'own',
  onGoToEvent
}: Props) => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [scoredEventIds, setScoredEventIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [scoreCardEvent, setScoreCardEvent] = useState<Event | null>(null);
  const [openingRegistrationEventId, setOpeningRegistrationEventId] = useState<number | null>(null);
  const [registrationError, setRegistrationError] = useState<{ eventId: number; message: string } | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const eventResponse = await listEvents();
      const participantEvents =
        (Array.isArray(eventResponse) ? eventResponse : [])
          .filter((event) => Array.isArray(event.participant_ids) && event.participant_ids.includes(participantId))
          .sort(compareEventsChronologically);
      setEvents(participantEvents);
      const scoreAvailability = await Promise.all(
        participantEvents.map(async (event) => {
          try {
            const jumps = useOwnScores
              ? await getMyEventLeaderboardParticipant(event.id)
              : await getEventLeaderboardParticipant(event.id, participantId);
            return [event.id, jumps.some((jump) => jump.distance_meters != null)] as const;
          } catch {
            return [event.id, false] as const;
          }
        })
      );
      setScoredEventIds(new Set(scoreAvailability.filter(([, hasScore]) => hasScore).map(([eventId]) => eventId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useResourceStream({
    path: '/events/stream',
    onMessage: () => { void loadEvents(); }
  });

  const openRegistration = async (event: Event) => {
    setOpeningRegistrationEventId(event.id);
    setRegistrationError(null);
    try {
      const registration = registrationAccess === 'staff'
        ? (await listEventRegistrations(event.id)).find((item) => item.participant_id === participantId)
        : registrations.find((item) => item.event_id === event.id && item.participant_id === participantId);
      if (!registration) {
        setRegistrationError({ eventId: event.id, message: 'No registration was found for this participant.' });
        return;
      }
      navigate(registrationAccess === 'staff' ? `/registrations/${registration.id}` : `/my-registrations/${registration.id}`);
    } catch (err) {
      setRegistrationError({
        eventId: event.id,
        message: err instanceof Error ? err.message : 'Failed to open registration.'
      });
    } finally {
      setOpeningRegistrationEventId(null);
    }
  };

  return (
    <>
      <section className="card stack my-profile-events-card">
        <header className="card-header participant-profile-card-header" onClick={() => setOpen((value) => !value)}>
          <div className="event-calendar-header-main">
            <button
              className="ghost"
              type="button"
              aria-expanded={open}
              aria-label="Toggle Events"
              onClick={(event) => {
                event.stopPropagation();
                setOpen((value) => !value);
              }}
            >
              {open ? '▾' : '▸'}
            </button>
            <h3 className="participant-profile-card-title">Events</h3>
          </div>
          <span className="badge neutral">{events.length} {events.length === 1 ? 'event' : 'events'}</span>
        </header>
        {open && (loading ? <p className="muted">Loading events…</p> : error ? <p className="error-text">{error}</p> : events.length === 0 ? (
          <p className="muted">No events scheduled yet.</p>
        ) : (
          <div className="stack">
            {events.map((event) => (
              <article
                key={event.id}
                className="card event-summary-card my-profile-event-card"
              >
                <div>
                  <header className="card-header event-card-header">
                    <div>
                      <div className="my-profile-event-title">
                        <h3>{event.name}</h3>
                        <span className={`badge status-${event.status}`}>{event.status}</span>
                      </div>
                      <p className="muted event-location">{event.location || 'Location TBD'}</p>
                    </div>
                  </header>
                  <dl className="card-details">
                    <div><dt>Starts</dt><dd>{formatEventLocalDate(event.starts_at)}</dd></div>
                    <div><dt>Ends</dt><dd>{event.ends_at ? formatEventLocalDate(event.ends_at) : 'TBD'}</dd></div>
                    <div><dt>Innhopps</dt><dd>{Array.isArray(event.innhopps) ? event.innhopps.length : 0}</dd></div>
                  </dl>
                </div>
                <div className="card-actions my-profile-event-actions">
                  <button className="ghost my-profile-event-schedule-action" type="button" onClick={() => onGoToEvent(event.id)}>
                    Event Schedule
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    disabled={openingRegistrationEventId === event.id}
                    onClick={() => void openRegistration(event)}
                  >
                    {openingRegistrationEventId === event.id ? 'Opening…' : 'Registration'}
                  </button>
                  {scoredEventIds.has(event.id) ? (
                    <button className="ghost" type="button" onClick={() => setScoreCardEvent(event)}>
                      Score Card
                    </button>
                  ) : null}
                  {registrationError?.eventId === event.id ? (
                    <p className="error-text">{registrationError.message}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ))}
      </section>
      {scoreCardEvent ? (
        <LeaderboardScoreCardOverlay
          eventId={scoreCardEvent.id}
          eventName={scoreCardEvent.name}
          participantId={useOwnScores ? undefined : participantId}
          participantName={participantName}
          onClose={() => setScoreCardEvent(null)}
          onGoToEvent={() => {
            setScoreCardEvent(null);
            onGoToEvent(scoreCardEvent.id);
          }}
        />
      ) : null}
    </>
  );
};

export default ParticipantEventsCard;
