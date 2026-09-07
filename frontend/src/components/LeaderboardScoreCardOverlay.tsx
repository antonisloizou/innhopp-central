import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EventLeaderboardJump, getEventLeaderboardParticipant, getMyEventLeaderboardParticipant } from '../api/events';

type Props = {
  eventId: number;
  participantId?: number;
  participantName: string;
  onClose: () => void;
  onGoToEvent?: () => void;
};

const formatDistance = (distance: number) => distance.toLocaleString(undefined, { maximumFractionDigits: 2 });

const LeaderboardScoreCardOverlay = ({
  eventId,
  participantId,
  participantName,
  onClose,
  onGoToEvent
}: Props) => {
  const [jumps, setJumps] = useState<EventLeaderboardJump[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setJumps([]);

    const load = async () => {
      try {
        const response = participantId
          ? await getEventLeaderboardParticipant(eventId, participantId)
          : await getMyEventLeaderboardParticipant(eventId);
        if (!cancelled) setJumps(Array.isArray(response) ? response : []);
      } catch (err) {
        if (cancelled) return;
        if ((err as Error & { status?: number })?.status === 404) {
          setJumps([]);
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load completed jumps.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [eventId, participantId]);

  useEffect(() => {
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
  }, []);

  const scoredJumps = useMemo(() => jumps.filter((jump) => jump.distance_meters != null), [jumps]);
  const stats = useMemo(() => scoredJumps.length > 0 ? {
    best: Math.min(...scoredJumps.map((jump) => jump.distance_meters as number)),
    average: scoredJumps.reduce((sum, jump) => sum + (jump.distance_meters as number), 0) / scoredJumps.length,
    worst: Math.max(...scoredJumps.map((jump) => jump.distance_meters as number))
  } : null, [scoredJumps]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="leaderboard-detail-backdrop" role="presentation" onClick={onClose}>
      <section className="card leaderboard-detail-panel" role="dialog" aria-modal="true" aria-labelledby="leaderboard-detail-title" onClick={(event) => event.stopPropagation()}>
        <button className="overlay-close-button leaderboard-detail-close" type="button" aria-label="Close jump details" onClick={onClose}>×</button>
        <header><p className="leaderboard-eyebrow">Completed Innhopps</p><h3 id="leaderboard-detail-title">{participantName}</h3></header>
        {loading ? <p className="muted">Loading jumps…</p> : error ? <p className="error-text">{error}</p> : (
          <>
            {jumps.length === 0 ? <p className="muted">No scores recorded</p> : (
              <ol className="leaderboard-jump-list">
                {jumps.map((jump) => <li key={jump.innhopp_id}><strong>#{jump.sequence} {jump.name || 'Unnamed Innhopp'}</strong><span>{jump.distance_meters == null ? 'No score recorded' : `${formatDistance(jump.distance_meters)}m`}</span></li>)}
              </ol>
            )}
            <footer className="leaderboard-detail-stats">
              <div><span>Best</span><strong>{stats ? `${formatDistance(stats.best)}m` : '—'}</strong></div>
              <div><span>Average</span><strong>{stats ? `${formatDistance(stats.average)}m` : '—'}</strong></div>
              <div><span>Worst</span><strong>{stats ? `${formatDistance(stats.worst)}m` : '—'}</strong></div>
            </footer>
          </>
        )}
        {onGoToEvent ? <footer className="leaderboard-detail-actions"><button type="button" className="primary" onClick={onGoToEvent}>Go to Event</button></footer> : null}
      </section>
    </div>,
    document.body
  );
};

export default LeaderboardScoreCardOverlay;
