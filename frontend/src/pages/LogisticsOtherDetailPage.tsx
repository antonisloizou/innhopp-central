import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { getOther, updateOther, deleteOther, createOther } from '../api/logistics';
import { listEvents, Event } from '../api/events';
import { fromEventLocalPickerDate, toEventLocalPickerDate } from '../utils/eventDate';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';

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
  const saveButtonClass = `primary ${saved ? 'saved' : ''}`;
  const saveButtonLabel = submitting ? 'Saving…' : saved ? 'Saved' : 'Save';
  const missingCoordinates = !form.coordinates.trim();
  const missingName = !form.name.trim();
  const complete = hasText(form.name) && hasText(form.coordinates) && hasText(form.scheduled_at);
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!otherId) return;
      setLoading(true);
      setMessage(null);
      try {
        const [entry, evs] = await Promise.all([getOther(Number(otherId)), listEvents()]);
        if (cancelled) return;
        setEvents(Array.isArray(evs) ? evs : []);
        setForm({
          event_id: entry.event_id ? String(entry.event_id) : '',
          name: entry.name,
          coordinates: entry.coordinates || '',
          scheduled_at: entry.scheduled_at || '',
          description: entry.description || '',
          notes: entry.notes || ''
        });
      } catch (err) {
        if (!cancelled) setMessage(err instanceof Error ? err.message : 'Failed to load entry');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [otherId]);

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
      setMessage('Entry updated');
      setSaved(true);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
              <h2 style={{ margin: 0 }}>Other logistics</h2>
            </DetailPageLockTitle>
            <span
              className={`badge ${complete ? 'success' : 'danger'}`}
              aria-label={complete ? 'Complete' : 'Missing info'}
              title={complete ? 'Complete' : 'Missing info'}
              style={{ minWidth: '2.4ch', textAlign: 'center' }}
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
            className="ghost"
            type="button"
            onClick={() => navigate(-1)}
            style={{ fontWeight: 700, fontSize: '1.05rem' }}
          >
            Back
          </button>
        </div>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Event</span>
            <select
              value={form.event_id}
              onChange={(e) => setForm((prev) => ({ ...prev, event_id: e.target.value }))}
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
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label className={`form-field ${missingCoordinates ? 'field-missing' : ''}`}>
            <span>Coordinates</span>
            <div className="input-with-button">
              <input
                type="text"
                value={form.coordinates}
                onChange={(e) => setForm((prev) => ({ ...prev, coordinates: e.target.value }))}
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
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
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
      {lockNotice}
    </section>
  );
};

export default LogisticsOtherDetailPage;
