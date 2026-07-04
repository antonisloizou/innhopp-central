import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { getOther, updateOther, deleteOther, createOther } from '../api/logistics';
import { listEvents, Event } from '../api/events';
import { fromEventLocalPickerDate, toEventLocalPickerDate } from '../utils/eventDate';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';
import DetailCostCard from '../components/DetailCostCard';
import { useResourceStream } from '../hooks/useResourceStream';

const hasText = (value?: string | null) => !!value && value.trim().length > 0;

const LogisticsOtherDetailPage = () => {
  const { otherId } = useParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState({
    event_id: '',
    name: '',
    coordinates: '',
    scheduled_at: '',
    description: '',
    notes: ''
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingLiveRefresh, setPendingLiveRefresh] = useState(false);
  const saveButtonClass = 'primary';
  const saveButtonLabel = submitting ? 'Saving…' : 'Save';
  const missingCoordinates = !form.coordinates.trim();
  const missingName = !form.name.trim();
  const complete = hasText(form.name) && hasText(form.coordinates) && hasText(form.scheduled_at);
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();

  const load = useCallback(async () => {
    if (!otherId) return;
    setLoading(true);
    setMessage(null);
    try {
      const [entry, evs] = await Promise.all([getOther(Number(otherId)), listEvents()]);
      setEvents(Array.isArray(evs) ? evs : []);
      setForm({
        event_id: entry.event_id ? String(entry.event_id) : '',
        name: entry.name,
        coordinates: entry.coordinates || '',
        scheduled_at: entry.scheduled_at || '',
        description: entry.description || '',
        notes: entry.notes || ''
      });
      setSaved(false);
      setIsDirty(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load entry');
    } finally {
      setLoading(false);
    }
  }, [otherId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasPendingLocalChanges = isDirty || submitting || copying;

  useResourceStream({
    path: '/logistics/stream',
    onMessage: () => {
      if (hasPendingLocalChanges) {
        setPendingLiveRefresh(true);
        return;
      }
      void load();
    }
  });

  useEffect(() => {
    if (!pendingLiveRefresh || hasPendingLocalChanges) return;
    setPendingLiveRefresh(false);
    void load();
  }, [hasPendingLocalChanges, load, pendingLiveRefresh]);

  const handleReloadLatest = () => {
    setPendingLiveRefresh(false);
    void load();
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    coordinates: form.coordinates.trim() || undefined,
    scheduled_at: form.scheduled_at || undefined,
    description: form.description.trim() || undefined,
    notes: form.notes.trim() || undefined,
    event_id: Number(form.event_id)
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!otherId || !form.event_id) return;
    setSubmitting(true);
    setMessage(null);
    setSaved(false);
    try {
      await updateOther(Number(otherId), buildPayload());
      setSaved(true);
      setIsDirty(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update entry');
      setSaved(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!form.event_id) {
      setMessage('Select an event before copying.');
      return;
    }
    setCopying(true);
    setMessage(null);
    try {
      const payload = buildPayload();
      const created = await createOther({
        ...payload,
        name: payload.name ? `${payload.name} (copy)` : 'Other (copy)'
      });
      navigate(`/logistics/others/${created.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to copy entry');
    } finally {
      setCopying(false);
    }
  };

  const handleDelete = async () => {
    if (!otherId || !form.event_id) return;
    if (!window.confirm('Delete this entry?')) return;
    try {
      await deleteOther(Number(otherId));
      navigate(-1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete entry');
    }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section className="stack" {...editGuardProps}>
      <header className="page-header">
        <div>
          <div className="logistics-detail-title-row">
            <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
              <h2 className="logistics-detail-title">Other logistics</h2>
            </DetailPageLockTitle>
            <span
              className={`badge ${complete ? 'success' : 'danger'} logistics-detail-status-badge`}
              aria-label={complete ? 'Complete' : 'Missing info'}
              title={complete ? 'Complete' : 'Missing info'}
            >
              {complete ? '✓' : '!'}
            </span>
          </div>
        </div>
        <div className="card-actions">
          <button
            className="ghost"
            type="button"
            onClick={(event) => {
              if (locked) {
                showLockedNoticeAtEvent(event);
                return;
              }
              handleCopy();
            }}
            disabled={copying || submitting}
          >
            {copying ? 'Copying…' : 'Make a copy'}
          </button>
          <button
            className="ghost danger"
            type="button"
            onClick={(event) => {
              if (locked) {
                showLockedNoticeAtEvent(event);
                return;
              }
              handleDelete();
            }}
          >
            Delete
          </button>
          <button
            className="ghost logistics-list-back-link"
            type="button"
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        </div>
      </header>

      {pendingLiveRefresh ? (
        <div className="card">
          <div className="event-live-refresh-banner">
            <p className="muted">New changes are available and will load after your current edits finish.</p>
            <button className="button-link secondary" type="button" onClick={handleReloadLatest}>
              Reload now
            </button>
          </div>
        </div>
      ) : null}

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Event</span>
            <select
              value={form.event_id}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, event_id: e.target.value }));
              }}
              required
            >
              <option value="">Select event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`form-field ${missingName ? 'field-missing' : ''}`}>
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, name: e.target.value }));
              }}
              required
            />
          </label>
          <label className={`form-field ${missingCoordinates ? 'field-missing' : ''}`}>
            <span>Coordinates</span>
            <div className="input-with-button">
              <input
                type="text"
                value={form.coordinates}
                onChange={(e) => {
                  setIsDirty(true);
                  setForm((prev) => ({ ...prev, coordinates: e.target.value }));
                }}
              />
              <button
                type="button"
                className="ghost"
                disabled={!form.coordinates.trim()}
                onClick={() => {
                  const coords = form.coordinates.trim();
                  if (!coords) return;
                  window.open(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`,
                    '_blank'
                  );
                }}
              >
                Open in Maps
              </button>
            </div>
          </label>
          <label className="form-field">
            <span>Scheduled at</span>
            <Flatpickr
              value={toEventLocalPickerDate(form.scheduled_at)}
              options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
              onChange={(dates) => {
                const d = dates[0];
                setIsDirty(true);
                setForm((prev) => ({
                  ...prev,
                  scheduled_at: d ? fromEventLocalPickerDate(d) : ''
                }));
              }}
            />
          </label>
          <label className="form-field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, description: e.target.value }));
              }}
            />
          </label>
          <label className="form-field form-field-full-span">
            <span>Notes</span>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, notes: e.target.value }));
              }}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className={saveButtonClass} disabled={submitting}>
              {saveButtonLabel}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
      {form.event_id && otherId ? (
        <DetailCostCard
          eventId={Number(form.event_id)}
          scheduleType="other"
          scheduleId={Number(otherId)}
          defaultName={form.name || 'Other logistics'}
        />
      ) : null}
      {lockNotice}
    </section>
  );
};

export default LogisticsOtherDetailPage;
