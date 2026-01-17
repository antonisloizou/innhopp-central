import { FormEvent, useEffect, useState } from 'react';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { listEvents, Event, createAccommodation } from '../api/events';
import { useNavigate, useLocation } from 'react-router-dom';
import { fromEventLocalPickerDate, toEventLocalPickerDate } from '../utils/eventDate';

const LogisticsAccommodationCreatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [form, setForm] = useState(() => {
    const state = (location.state as any)?.copyAccommodation;
    return {
      event_id: state?.event_id ? String(state.event_id) : '',
      name: state?.name || '',
      capacity: state?.capacity ?? '',
      coordinates: state?.coordinates || '',
      check_in_at: state?.check_in_at || '',
      check_out_at: state?.check_out_at || '',
      booked: !!state?.booked,
      notes: state?.notes || ''
    };
  });
  const [submitting, setSubmitting] = useState(false);

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
    if (!form.event_id || !form.name.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const created = await createAccommodation(Number(form.event_id), {
        name: form.name.trim(),
        capacity: Number(form.capacity) || 0,
        coordinates: form.coordinates.trim() || undefined,
        check_in_at: form.check_in_at || undefined,
        check_out_at: form.check_out_at || undefined,
        booked: form.booked,
        notes: form.notes.trim() || undefined
      });
      setCreatedId(created.id);
      setMessage('Accommodation created');
      const isCopy = !!(location.state as any)?.copyAccommodation;
      if (isCopy) {
        if (created.id && form.event_id) {
          try {
            sessionStorage.setItem(
              `event-schedule-highlight:${form.event_id}`,
              `acc-in-${created.id}`
            );
          } catch {
            // ignore
          }
        }
        navigate(-2);
      } else {
        navigate('/logistics/accommodations', { state: { highlightAccommodationId: created.id } });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create accommodation');
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
          <h2>Create accommodation</h2>
        </div>
        <div className="card-actions">
          <button className="ghost" type="button" onClick={() => navigate('/logistics/accommodations')}>
            Back to accommodations
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
            <span>Capacity</span>
            <input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Coordinates (DMS)</span>
            <input
              type="text"
              value={form.coordinates}
              onChange={(e) => setForm((prev) => ({ ...prev, coordinates: e.target.value }))}
              placeholder={`e.g. 9°15'43\"N 74°26'08\"W`}
            />
          </label>
          <label className="form-field">
            <span>Check-in</span>
            <Flatpickr
              value={toEventLocalPickerDate(form.check_in_at)}
              options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
              onChange={(dates) => {
                const d = dates[0];
                setForm((prev) => ({
                  ...prev,
                  check_in_at: d ? fromEventLocalPickerDate(d) : ''
                }));
              }}
            />
          </label>
          <label className="form-field">
            <span>Check-out</span>
            <Flatpickr
              value={toEventLocalPickerDate(form.check_out_at)}
              options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
              onChange={(dates) => {
                const d = dates[0];
                setForm((prev) => ({
                  ...prev,
                  check_out_at: d ? fromEventLocalPickerDate(d) : ''
                }));
              }}
            />
          </label>
          <label className="form-field">
            <span>Booked</span>
            <div className="checkbox-field">
              <input
                type="checkbox"
                checked={form.booked}
                onChange={(e) => setForm((prev) => ({ ...prev, booked: e.target.checked }))}
              />
              <span>Mark as booked</span>
            </div>
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
              {submitting ? 'Creating…' : 'Create accommodation'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default LogisticsAccommodationCreatePage;
