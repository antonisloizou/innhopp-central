import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { Event, listEvents } from '../api/events';
import { createMeal } from '../api/logistics';

const LogisticsMealCreatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const copy = (location.state as any)?.copyMeal;
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    event_id: copy?.event_id ? String(copy.event_id) : '',
    name: copy?.name || '',
    location: copy?.location || '',
    scheduled_at: copy?.scheduled_at || '',
    notes: copy?.notes || ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await listEvents();
        if (!cancelled) {
          setEvents(Array.isArray(resp) ? resp : []);
        }
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

  const closestEventDate = (current?: string) => {
    const ev = events.find((e) => e.id === Number(form.event_id));
    const start = ev?.starts_at ? new Date(ev.starts_at) : null;
    const end = ev?.ends_at ? new Date(ev.ends_at) : null;
    if (current) {
      const d = new Date(current);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const today = new Date();
    if (start && end) {
      if (today < start) return start;
      if (today > end) return end;
      return today;
    }
    if (start) return start;
    if (end) return end;
    return undefined;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.event_id || !form.name.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await createMeal({
        event_id: Number(form.event_id),
        name: form.name.trim(),
        location: form.location.trim() || undefined,
        scheduled_at: form.scheduled_at || undefined,
        notes: form.notes.trim() || undefined
      });
      setMessage('Meal created');
      navigate('/logistics/meals');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create meal');
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
          <h2>Create meal</h2>
        </div>
        <div className="card-actions">
          <button className="ghost" type="button" onClick={() => navigate('/logistics/meals')}>
            Back to meals
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
            <span>Location</span>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Scheduled at</span>
            <Flatpickr
              value={form.scheduled_at ? new Date(form.scheduled_at) : undefined}
              options={{
                enableTime: true,
                dateFormat: 'Y-m-d H:i',
                time_24hr: true,
                defaultDate: closestEventDate(form.scheduled_at)
              }}
              onChange={(dates) => {
                const d = dates[0];
                setForm((prev) => ({ ...prev, scheduled_at: d ? d.toISOString() : '' }));
              }}
            />
          </label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create meal'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default LogisticsMealCreatePage;
