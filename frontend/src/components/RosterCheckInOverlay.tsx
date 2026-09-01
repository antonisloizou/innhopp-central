import { useState } from 'react';
import { createPortal } from 'react-dom';
import { RosterCheckIn, deleteRosterCheckIn, updateRosterCheckInEntry } from '../api/rosterCheckIns';

type Props = {
  checkIn: RosterCheckIn;
  title: string;
  onClose: () => void;
  onUpdated: (checkIn: RosterCheckIn | null) => void;
};

const RosterCheckInOverlay = ({ checkIn: initialCheckIn, title, onClose, onUpdated }: Props) => {
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [savingPerson, setSavingPerson] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInnhopp = checkIn.schedule_item_type === 'innhopp';

  const save = async (participantId: number, payload: { is_present?: boolean; distance_from_target_meters?: number }) => {
    setSavingPerson(participantId);
    setError(null);
    try {
      const updated = await updateRosterCheckInEntry(checkIn.id, participantId, payload);
      setCheckIn(updated);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save check-in');
    } finally {
      setSavingPerson(null);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this roster check-in? Recreating it after fixing the event roster will carry over entries for people who remain on the roster.')) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteRosterCheckIn(checkIn.id);
      onUpdated(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete check-in');
    } finally {
      setDeleting(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="event-schedule-preview-backdrop" onClick={onClose} role="presentation">
      <section className="card overlay-panel-with-close roster-check-in-overlay" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="overlay-close-button overlay-close-top-left" aria-label="Close roster check-in" onClick={onClose}>×</button>
        <div className="card-header">
          <div>
            <h3>Roster check-in</h3>
            <p className="muted">{title}</p>
          </div>
          <strong>{checkIn.checked_in_count}/{checkIn.expected_count} checked in</strong>
        </div>
        {isInnhopp && checkIn.average_distance_meters != null ? <p className="muted">Average distance: {Math.round(checkIn.average_distance_meters)} m</p> : null}
        {error ? <p className="error-message">{error}</p> : null}
        <div className="roster-check-in-list">
          {checkIn.entries.map((entry) => (
            <div className="roster-check-in-row" key={entry.participant_id}>
              <label>
                <input
                  type="checkbox"
                  checked={entry.is_present}
                  disabled={savingPerson === entry.participant_id}
                  onChange={(event) => void save(entry.participant_id, { is_present: event.target.checked })}
                />
                <span>{entry.participant_name}</span>
              </label>
              {isInnhopp ? (
                <label className="roster-check-in-distance">
                  <span>Score</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    defaultValue={entry.distance_from_target_meters ?? ''}
                    disabled={savingPerson === entry.participant_id}
                    placeholder="0"
                    onBlur={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) return;
                      const value = Number(raw);
                      if (Number.isFinite(value) && value >= 0 && (value !== entry.distance_from_target_meters || !entry.is_present)) {
                        void save(entry.participant_id, { distance_from_target_meters: value, is_present: true });
                      }
                    }}
                  />
                  <span>m</span>
                </label>
              ) : null}
            </div>
          ))}
        </div>
        <div className="roster-check-in-actions">
          <button type="button" className="ghost danger" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete roster check-in'}</button>
        </div>
      </section>
    </div>,
    document.body
  );
};

export default RosterCheckInOverlay;
