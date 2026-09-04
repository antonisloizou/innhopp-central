import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { Event, EventLeaderboardEntry, EventLeaderboardJump, getEvent, getEventLeaderboard, getEventLeaderboardParticipant } from '../api/events';
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

const podiumClass = (position: number) => {
  if (position === 0) return 'leaderboard-podium-card leaderboard-podium-card--gold';
  if (position === 1) return 'leaderboard-podium-card leaderboard-podium-card--silver';
  return 'leaderboard-podium-card leaderboard-podium-card--bronze';
};

const rankEntries = (entries: Omit<LeaderboardEntry, 'rank'>[], breakTiesByJumps: boolean): LeaderboardEntry[] =>
  entries.reduce<LeaderboardEntry[]>((ranked, entry, index) => {
    const previous = ranked[index - 1];
    ranked.push({
      ...entry,
      rank: previous && entry.distance === previous.distance && (!breakTiesByJumps || entry.recordedScores === previous.recordedScores)
        ? previous.rank
        : previous
          ? previous.rank + 1
          : 1
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
const formatScore = (entry: Pick<LeaderboardEntry, 'distance' | 'recordedScores'>) =>
  `${formatDistance(entry.distance)}m (${entry.recordedScores} jump${entry.recordedScores === 1 ? '' : 's'})`;

const EventLeaderboardPage = () => {
  const { eventId: rawEventId } = useParams();
  const navigate = useNavigate();
  const eventId = Number(rawEventId);
  const [event, setEvent] = useState<Event | null>(null);
  const [scores, setScores] = useState<EventLeaderboardEntry[]>([]);
  const [scope, setScope] = useState<LeaderboardScope>('participants');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('best');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);
  const [selectedJumps, setSelectedJumps] = useState<EventLeaderboardJump[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedEntry) return;
    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const scrollContainers = Array.from(document.querySelectorAll<HTMLElement>('.app-shell, .app-body, .app-content'));
    const previousContainerOverflows = scrollContainers.map((element) => element.style.overflow);
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    scrollContainers.forEach((element) => { element.style.overflow = 'hidden'; });
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      scrollContainers.forEach((element, index) => { element.style.overflow = previousContainerOverflows[index]; });
      window.scrollTo(0, scrollY);
    };
  }, [selectedEntry]);

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
        .sort((a, b) => a.distance - b.distance || (scoreMode === 'best' ? 0 : b.recordedScores - a.recordedScores) || a.name.localeCompare(b.name)),
      scoreMode !== 'best'
    ),
    [allEntries, scope, scoreMode]
  );
  const topEntries = entries.slice(0, 3);
  const leaders = entries.filter((entry) => entry.rank === 1);
  const hasLargeFirstPlaceTie = leaders.length >= 3;
  const selectedScoredJumps = selectedJumps.filter((jump) => jump.distance_meters != null);
  const selectedStats = selectedScoredJumps.length > 0 ? {
    best: Math.min(...selectedScoredJumps.map((jump) => jump.distance_meters as number)),
    average: selectedScoredJumps.reduce((sum, jump) => sum + (jump.distance_meters as number), 0) / selectedScoredJumps.length,
    worst: Math.max(...selectedScoredJumps.map((jump) => jump.distance_meters as number))
  } : null;

  const openDetails = async (entry: LeaderboardEntry) => {
    setSelectedEntry(entry);
    setSelectedJumps([]);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const jumps = await getEventLeaderboardParticipant(eventId, entry.id);
      setSelectedJumps(Array.isArray(jumps) ? jumps : []);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load completed jumps.');
    } finally {
      setDetailLoading(false);
    }
  };

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
        <label className="leaderboard-mobile-select">
          <select value={scope} onChange={(event) => setScope(event.target.value as LeaderboardScope)} aria-label="Leaderboard audience">
            <option value="all">All ({allEntries.length})</option>
            <option value="participants">Participants ({allEntries.filter((entry) => !entry.isStaff).length})</option>
          </select>
        </label>
        <div className="leaderboard-scope leaderboard-score-mode" role="tablist" aria-label="Scoring method">
          {(['best', 'average', 'total'] as ScoreMode[]).map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={scoreMode === mode} className={scoreMode === mode ? 'active' : ''} onClick={() => setScoreMode(mode)}>
              {scoreModeLabel[mode]}
            </button>
          ))}
        </div>
        <label className="leaderboard-mobile-select leaderboard-mobile-score-select">
          <select value={scoreMode} onChange={(event) => setScoreMode(event.target.value as ScoreMode)} aria-label="Scoring method">
            {(['best', 'average', 'total'] as ScoreMode[]).map((mode) => <option key={mode} value={mode}>{scoreModeLabel[mode]}</option>)}
          </select>
        </label>
      </div>

      {entries.length === 0 ? (
        <article className="card leaderboard-empty"><span aria-hidden="true">✦</span><h3>The board is ready</h3><p className="muted">Record a target distance in an Innhopp roster check-in to start the rankings.</p></article>
      ) : (
        <>
          <section className="leaderboard-podium" aria-label="Top three">
            {hasLargeFirstPlaceTie ? (
              <article className="leaderboard-podium-card leaderboard-podium-card--gold leaderboard-podium-card--shared">
                <span className="leaderboard-score-label">{scoreModeLabel[scoreMode]} distance</span>
                <p className="leaderboard-podium-rank" aria-label="Shared first place"><span className="leaderboard-medal" aria-hidden="true">♛</span></p>
                <ul aria-label="Joint first-place leaders">
                  {leaders.map((entry) => <li key={entry.id}>{entry.name} <small>({entry.recordedScores} jump{entry.recordedScores === 1 ? '' : 's'})</small></li>)}
                </ul>
                <strong>{scoreMode === 'best' ? `${formatDistance(leaders[0].distance)}m` : formatScore(leaders[0])}</strong>
              </article>
            ) : topEntries.map((entry, position) => (
              <article className={podiumClass(position)} key={entry.id}>
                <span className="leaderboard-score-label">{scoreModeLabel[scoreMode]} distance</span>
                <p className="leaderboard-podium-rank" aria-label={`Rank ${entry.rank}`}><span className="leaderboard-medal" aria-hidden="true">{position === 0 ? '♛' : position === 1 ? '◆' : '●'}</span></p>
                <h3>{entry.name}</h3>
                <strong>{formatScore(entry)}</strong>
              </article>
            ))}
          </section>

          <section className="leaderboard-list card" aria-label="Full leaderboard">
            <header><div><p className="leaderboard-eyebrow">Full standings</p><h3>{scope === 'all' ? 'Everyone' : 'Participants'}</h3></div></header>
            <ol>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className={entry.rank <= 3 ? `leaderboard-row leaderboard-row--top-${entry.rank}` : 'leaderboard-row'} onClick={() => void openDetails(entry)} aria-label={`View ${entry.name}'s completed jumps`}>
                    <span className="leaderboard-rank">{entry.rank}</span>
                    <span className="leaderboard-avatar" aria-hidden="true">{entry.name.charAt(0).toUpperCase()}</span>
                    <span className="leaderboard-person"><strong>{entry.name}</strong>{entry.isStaff ? <small>Staff</small> : <small>Participant</small>}</span>
                    <span className="leaderboard-loads"><strong>{formatScore(entry)}</strong><span>{entry.recordedScores} recorded score{entry.recordedScores === 1 ? '' : 's'}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
      <button className="ghost leaderboard-back" type="button" onClick={() => navigate(`/events/${event.id}`)}>Back to event</button>
      {selectedEntry && typeof document !== 'undefined' ? createPortal(
        <div className="leaderboard-detail-backdrop" role="presentation" onClick={() => setSelectedEntry(null)}>
          <section className="card leaderboard-detail-panel" role="dialog" aria-modal="true" aria-labelledby="leaderboard-detail-title" onClick={(click) => click.stopPropagation()}>
            <button className="overlay-close-button leaderboard-detail-close" type="button" aria-label="Close jump details" onClick={() => setSelectedEntry(null)}>×</button>
            <header><p className="leaderboard-eyebrow">Completed Innhopps</p><h3 id="leaderboard-detail-title">{selectedEntry.name}</h3></header>
            {detailLoading ? <p className="muted">Loading jumps…</p> : detailError ? <p className="error-text">{detailError}</p> : (
              <>
                <ol className="leaderboard-jump-list">
                  {selectedJumps.map((jump) => <li key={jump.innhopp_id}><strong>#{jump.sequence} {jump.name || 'Unnamed Innhopp'}</strong><span>{jump.distance_meters == null ? 'No score recorded' : `${formatDistance(jump.distance_meters)}m`}</span></li>)}
                </ol>
                <footer className="leaderboard-detail-stats">
                  <div><span>Best</span><strong>{selectedStats ? `${formatDistance(selectedStats.best)}m` : '—'}</strong></div>
                  <div><span>Average</span><strong>{selectedStats ? `${formatDistance(selectedStats.average)}m` : '—'}</strong></div>
                  <div><span>Worst</span><strong>{selectedStats ? `${formatDistance(selectedStats.worst)}m` : '—'}</strong></div>
                </footer>
              </>
            )}
          </section>
        </div>
        , document.body
      ) : null}
    </section>
  );
};

export default EventLeaderboardPage;
