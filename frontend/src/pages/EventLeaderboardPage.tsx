import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Event, EventLeaderboardEntry, getEvent, getEventLeaderboard } from '../api/events';
import EventGearMenu from '../components/EventGearMenu';
import EventPageTitle from '../components/EventPageTitle';

type LeaderboardScope = 'all' | 'participants';
type ScoreMode = 'best' | 'average' | 'total';

type LeaderboardEntry = {
  id: number;
  name: string;
  isStaff: boolean;
  distance: number;
  bestDistance: number;
  averageDistance: number;
  totalDistance: number;
  recordedScores: number;
  rank: number;
};

const podiumClass = (rank: number) => {
  if (rank === 1) return 'leaderboard-podium-card leaderboard-podium-card--gold';
  if (rank === 2) return 'leaderboard-podium-card leaderboard-podium-card--silver';
  return 'leaderboard-podium-card leaderboard-podium-card--bronze';
};

const rankEntries = (entries: Omit<LeaderboardEntry, 'rank'>[]): LeaderboardEntry[] =>
  entries.reduce<LeaderboardEntry[]>((ranked, entry, index) => {
    const previous = ranked[index - 1];
    ranked.push({
      ...entry,
      rank: previous ? (entry.distance === previous.distance ? previous.rank : previous.rank + 1) : 1
    });
    return ranked;
  }, []);

const scoreForMode = (entry: Pick<LeaderboardEntry, 'bestDistance' | 'averageDistance' | 'totalDistance'>, mode: ScoreMode) => {
  if (mode === 'average') return entry.averageDistance;
  if (mode === 'total') return entry.totalDistance;
  return entry.bestDistance;
};

const scoreModeLabel: Record<ScoreMode, string> = { best: 'Best', average: 'Average', total: 'Total' };
const formatDistance = (distance: number) => distance.toLocaleString(undefined, { maximumFractionDigits: 2 });
const formatScore = (entry: Pick<LeaderboardEntry, 'distance' | 'recordedScores'>, mode: ScoreMode) =>
  `${formatDistance(entry.distance)}m${mode === 'best' ? '' : ` (${entry.recordedScores} jump${entry.recordedScores === 1 ? '' : 's'})`}`;

const EventLeaderboardPage = () => {
  const { eventId: rawEventId } = useParams();
  const navigate = useNavigate();
  const eventId = Number(rawEventId);
  const [event, setEvent] = useState<Event | null>(null);
  const [scores, setScores] = useState<EventLeaderboardEntry[]>([]);
  const [scope, setScope] = useState<LeaderboardScope>('all');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('average');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(eventId) || eventId <= 0) {
      setError('Invalid event.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [eventData, leaderboardData] = await Promise.all([
          getEvent(eventId),
          getEventLeaderboard(eventId)
        ]);
        if (cancelled) return;
        setEvent(eventData);
        setScores(Array.isArray(leaderboardData) ? leaderboardData : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load leaderboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [eventId]);

  const allEntries = useMemo(() => {
    if (!event) return [];
    return scores
      .filter((score) => Number.isFinite(score.best_distance_meters) && score.best_distance_meters >= 0)
      .map((score) => ({
        id: score.participant_id,
        name: score.participant_name || `Participant #${score.participant_id}`,
        isStaff: Boolean(score.roles?.includes('Staff')),
        distance: score.best_distance_meters,
        bestDistance: score.best_distance_meters,
        averageDistance: score.average_distance_meters,
        totalDistance: score.total_distance_meters,
        recordedScores: score.recorded_scores,
        rank: 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ rank: _rank, ...entry }) => entry);
  }, [event, scores]);

  const entries = useMemo(
    () => rankEntries(
      (scope === 'all' ? allEntries : allEntries.filter((entry) => !entry.isStaff))
        .map((entry) => ({ ...entry, distance: scoreForMode(entry, scoreMode) }))
        .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    ),
    [allEntries, scope, scoreMode]
  );
  const topEntries = entries.slice(0, 3);
  const leadingDistance = entries[0]?.distance ?? 0;

  if (loading) return <p className="muted">Loading leaderboard…</p>;
  if (error || !event) return <p className="error-text">{error || 'Event not found.'}</p>;

  return (
    <section className="leaderboard-page">
      <header className="page-header">
        <EventPageTitle event={event} section="Leaderboard" />
        <EventGearMenu eventId={event.id} currentPage="leaderboard" menuId="event-leaderboard-actions-menu" />
      </header>

      <div className="leaderboard-controls">
        <div className="leaderboard-scope" role="tablist" aria-label="Leaderboard audience">
          <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
            All <span>{allEntries.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={scope === 'participants'} className={scope === 'participants' ? 'active' : ''} onClick={() => setScope('participants')}>
            Participants <span>{allEntries.filter((entry) => !entry.isStaff).length}</span>
          </button>
        </div>
        <div className="leaderboard-scope leaderboard-score-mode" role="tablist" aria-label="Scoring method">
          {(['best', 'average', 'total'] as ScoreMode[]).map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={scoreMode === mode} className={scoreMode === mode ? 'active' : ''} onClick={() => setScoreMode(mode)}>
              {scoreModeLabel[mode]}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <article className="card leaderboard-empty"><span aria-hidden="true">✦</span><h3>The board is ready</h3><p className="muted">Record a target distance in an Innhopp roster check-in to start the rankings.</p></article>
      ) : (
        <>
          <section className="leaderboard-podium" aria-label="Top three">
            {topEntries.map((entry) => (
              <article className={podiumClass(entry.rank)} key={entry.id}>
                <span className="leaderboard-medal" aria-hidden="true">{entry.rank === 1 ? '♛' : entry.rank === 2 ? '◆' : '●'}</span>
                <p>#{entry.rank}</p>
                <h3>{entry.name}</h3>
                <strong>{formatScore(entry, scoreMode)}</strong><span>{scoreMode.toLowerCase()} distance</span>
              </article>
            ))}
          </section>

          <section className="leaderboard-list card" aria-label="Full leaderboard">
            <header><div><p className="leaderboard-eyebrow">Full standings</p><h3>{scope === 'all' ? 'Everyone' : 'Participants'}</h3></div><span className="leaderboard-leader-note">{scoreModeLabel[scoreMode]}: {formatDistance(leadingDistance)}m from target</span></header>
            <ol>
              {entries.map((entry) => (
                <li key={entry.id} className={entry.rank <= 3 ? `leaderboard-row leaderboard-row--top-${entry.rank}` : 'leaderboard-row'}>
                  <span className="leaderboard-rank">{entry.rank}</span>
                  <span className="leaderboard-avatar" aria-hidden="true">{entry.name.charAt(0).toUpperCase()}</span>
                  <span className="leaderboard-person"><strong>{entry.name}</strong>{entry.isStaff ? <small>Staff</small> : <small>Participant</small>}</span>
                  <span className="leaderboard-loads"><strong>{formatScore(entry, scoreMode)}</strong><span>{entry.recordedScores} recorded score{entry.recordedScores === 1 ? '' : 's'}</span></span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
      <button className="ghost leaderboard-back" type="button" onClick={() => navigate(`/events/${event.id}`)}>Back to event</button>
    </section>
  );
};

export default EventLeaderboardPage;
