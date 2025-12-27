import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { Meal, deleteMeal, getMeal, updateMeal } from '../api/logistics';
import { Event, listEvents } from '../api/events';

const LogisticsMealDetailPage = () => {
  const { mealId } = useParams();
  const navigate = useNavigate();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState({
    event_id: '',
    name: '',
    location: '',
    scheduled_at: '',
    notes: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!mealId) return;
      setLoading(true);
      setError(null);
      try {
        const [mealResp, eventsResp] = await Promise.all([getMeal(Number(mealId)), listEvents()]);
        if (cancelled) return;
        setMeal(mealResp);
        setEvents(Array.isArray(eventsResp) ? eventsResp : []);
        setForm({
          event_id: mealResp.event_id ? String(mealResp.event_id) : '',
          name: mealResp.name,
          location: mealResp.location || '',
          scheduled_at: mealResp.scheduled_at || '',
          notes: mealResp.notes || ''
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load meal');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [mealId]);

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!meal || !form.event_id) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateMeal(meal.id, {
        event_id: Number(form.event_id),
        name: form.name.trim(),
        location: form.location.trim() || undefined,
        scheduled_at: form.scheduled_at || undefined,
        notes: form.notes.trim() || undefined
      });
      setMeal(updated);
      setMessage('Meal updated');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save meal');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!meal || deleting) return;
    if (!window.confirm('Delete this meal?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteMeal(meal.id);
      navigate('/logistics/meals');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete meal');
      setDeleting(false);
    }
  };

  if (loading) return <p className="muted">Loading meal…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!meal) return <p className="error-text">Meal not found.</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>{meal.name}</h2>
          {meal.location && <p className="muted">{meal.location}</p>}
        </div>
        <div className="card-actions">
          <button
            className="ghost"
            type="button"
            onClick={() =>
              navigate('/logistics/meals/new', {
                state: { copyMeal: { ...meal, event_id: meal.event_id } }
              })
            }
          >
            Make a copy
          </button>
          <button className="ghost" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
          <button className="ghost danger" type="button" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSave}>
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
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default LogisticsMealDetailPage;
