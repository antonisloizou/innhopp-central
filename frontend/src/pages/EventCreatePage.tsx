import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateEventPayload, EventStatus, Season, createEvent, listSeasons } from '../api/events';
import { fromEventLocalDateInput } from '../utils/eventDate';

const statusOptions: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'planned', label: 'Planned' },
  { value: 'scouted', label: 'Scouted' },
  { value: 'launched', label: 'Launched' },
  { value: 'live', label: 'Live' },
  { value: 'past', label: 'Past' }
];

const toIsoDate = (value: string) => fromEventLocalDateInput(value);

const EventCreatePage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    season_id: '',
    name: '',
    location: '',
    slots: '',
    status: 'draft' as EventStatus,
    starts_at: '',
    ends_at: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const seasonResponse = await listSeasons();
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResponse) ? seasonResponse : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load seasons');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const payload: CreateEventPayload = {
        season_id: Number(form.season_id),
        name: form.name.trim(),
        status: form.status,
        starts_at: toIsoDate(form.starts_at)
      };
      if (form.location.trim()) {
        payload.location = form.location.trim();
      }
      if (form.ends_at) {
        payload.ends_at = toIsoDate(form.ends_at);
      }
      if (form.slots) {
        payload.slots = Number(form.slots);
      }
      await createEvent(payload);
      setMessage('Event created');
      setForm({
        season_id: '',
        name: '',
        location: '',
        slots: '',
        status: 'draft',
        starts_at: '',
        ends_at: ''
      });
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Create event</h2>
          <p>Attach a new event to a season with timing and status.</p>
        </div>
        <button className="ghost" type="button" onClick={() => navigate('/events')}>
          Back to events
        </button>
      </header>

      <article className="card">
        <header className="card-header">
          <div>
            <h3>Event details</h3>
            <p>Define the schedule and context.</p>
          </div>
        </header>
        {loading ? (
          <p className="muted">Loading seasons…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : seasons.length === 0 ? (
          <p className="muted">Create a season first before scheduling events.</p>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Season</span>
              <select
                required
                value={form.season_id}
                onChange={(e) => setForm((prev) => ({ ...prev, season_id: e.target.value }))}
              >
                <option value="">Select season</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Event name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Enter a name for the event"
                required
              />
            </label>
            <label className="form-field">
              <span>Location</span>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="The overall location the event takes place"
              />
            </label>
            <label className="form-field">
              <span>Slots</span>
              <input
                type="number"
                min="0"
                value={form.slots}
                onChange={(e) => setForm((prev) => ({ ...prev, slots: e.target.value }))}
                placeholder="Total participant slots"
              />
            </label>
            <label className="form-field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as EventStatus }))}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Starts on</span>
              <input
                type="date"
                value={form.starts_at}
                onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Ends on</span>
              <input
                type="date"
                value={form.ends_at}
                onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create event'}
              </button>
              {message && <span className="muted">{message}</span>}
            </div>
          </form>
        )}
      </article>
    </section>
  );
};

export default EventCreatePage;
