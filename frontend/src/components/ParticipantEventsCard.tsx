import { useCallback, useEffect, useMemo, useState } from 'react';
import { listEvents, listSeasons } from '../api/events';
import type { Event, Season } from '../api/events';
import { formatEventLocalDate } from '../utils/eventDate';
import { useResourceStream } from '../hooks/useResourceStream';
import LeaderboardScoreCardOverlay from './LeaderboardScoreCardOverlay';

type Props = {
  participantId: number;
  participantName: string;
  useOwnScores?: boolean;
  onGoToEvent: (eventId: number) => void;
};

const compareEventsChronologically = (a: Event, b: Event) => {
  const startA = new Date(a.starts_at).getTime();
  const startB = new Date(b.starts_at).getTime();
  if (startA !== startB) return startA - startB;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

const ParticipantEventsCard = ({ participantId, participantName, useOwnScores = false, onGoToEvent }: Props) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [scoreCardEvent, setScoreCardEvent] = useState<Event | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventResponse, seasonResponse] = await Promise.all([listEvents(), listSeasons()]);
      setEvents(
        (Array.isArray(eventResponse) ? eventResponse : [])
          .filter((event) => Array.isArray(event.participant_ids) && event.participant_ids.includes(participantId))
          .sort(compareEventsChronologically)
      );
      setSeasons(Array.isArray(seasonResponse) ? seasonResponse : []);
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

  const seasonNames = useMemo(() => new Map(seasons.map((season) => [season.id, season.name])), [seasons]);

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
                role="button"
                tabIndex={0}
                onClick={() => setScoreCardEvent(event)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                    keyboardEvent.preventDefault();
                    setScoreCardEvent(event);
                  }
                }}
              >
                <header className="card-header event-card-header">
                  <div>
                    <h3>{event.name}</h3>
                    <p className="muted event-location">{event.location || 'Location TBD'}</p>
                  </div>
                  <span className={`badge status-${event.status}`}>{event.status}</span>
                </header>
                <dl className="card-details">
                  <div><dt>Season</dt><dd>{seasonNames.get(event.season_id) || `Season ${event.season_id}`}</dd></div>
                  <div><dt>Starts</dt><dd>{formatEventLocalDate(event.starts_at)}</dd></div>
                  <div><dt>Ends</dt><dd>{event.ends_at ? formatEventLocalDate(event.ends_at) : 'TBD'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ))}
      </section>
      {scoreCardEvent ? (
        <LeaderboardScoreCardOverlay
          eventId={scoreCardEvent.id}
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
