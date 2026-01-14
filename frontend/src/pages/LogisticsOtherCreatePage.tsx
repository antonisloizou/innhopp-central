import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { listEvents, Event } from '../api/events';
import { createOther } from '../api/logistics';

const LogisticsOtherCreatePage = () => {
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await listEvents();
        if (cancelled) return;
        setEvents(Array.isArray(resp) ? resp : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim() || !form.event_id) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await createOther({
        name: form.name.trim(),
        coordinates: form.coordinates.trim() || undefined,
        scheduled_at: form.scheduled_at || undefined,
        description: form.description.trim() || undefined,
        notes: form.notes.trim() || undefined,
        event_id: Number(form.event_id)
      });
      navigate('/logistics/others');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>Create other logistics entry</h2>
        </div>
        <div className="card-actions">
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
          <label className="form-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Coordinates</span>
            <input
              type="text"
              value={form.coordinates}
              onChange={(e) => setForm((prev) => ({ ...prev, coordinates: e.target.value }))}
              placeholder="DMS coordinates (optional)"
            />
          </label>
          <label className="form-field">
            <span>Scheduled at</span>
            <Flatpickr
              value={form.scheduled_at ? new Date(form.scheduled_at) : undefined}
              options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
              onChange={(dates) => {
                const d = dates[0];
                setForm((prev) => ({ ...prev, scheduled_at: d ? d.toISOString() : '' }));
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
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create entry'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default LogisticsOtherCreatePage;
