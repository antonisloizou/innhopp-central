import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreateEventPayload,
  EventCommercialStatus,
  EventStatus,
  Season,
  createEvent,
  listSeasons
} from '../api/events';
import { fromEventLocalDateInput, fromEventLocalInput } from '../utils/eventDate';

const statusOptions: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'planned', label: 'Planned' },
  { value: 'scouted', label: 'Scouted' },
  { value: 'launched', label: 'Launched' },
  { value: 'live', label: 'Live' },
  { value: 'past', label: 'Past' }
];

const commercialStatusOptions: { value: EventCommercialStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'registration_open', label: 'Registration open' },
  { value: 'awaiting_threshold', label: 'Awaiting threshold' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' }
];

const toIsoDate = (value: string) => fromEventLocalDateInput(value);
const toIsoDateTime = (value: string) => fromEventLocalInput(value);

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
    ends_at: '',
    public_registration_slug: '',
    public_registration_enabled: false,
    registration_open_at: '',
    main_invoice_deadline: '',
    deposit_amount: '',
    main_invoice_amount: '',
    currency: 'EUR',
    minimum_deposit_count: '',
    commercial_status: 'draft' as EventCommercialStatus
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
        starts_at: toIsoDate(form.starts_at),
        public_registration_enabled: form.public_registration_enabled,
        commercial_status: form.commercial_status,
        currency: form.currency.trim() || 'EUR'
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
      if (form.public_registration_slug.trim()) {
        payload.public_registration_slug = form.public_registration_slug.trim().toLowerCase();
      }
      if (form.registration_open_at) {
        payload.registration_open_at = toIsoDateTime(form.registration_open_at);
      }
      if (form.main_invoice_deadline) {
        payload.main_invoice_deadline = toIsoDateTime(form.main_invoice_deadline);
      }
      if (form.deposit_amount) {
        payload.deposit_amount = Number(form.deposit_amount);
      }
      if (form.main_invoice_amount) {
        payload.main_invoice_amount = Number(form.main_invoice_amount);
      }
      if (form.minimum_deposit_count) {
        payload.minimum_deposit_count = Number(form.minimum_deposit_count);
      }
      await createEvent(payload);
      setForm({
        season_id: '',
        name: '',
        location: '',
        slots: '',
        status: 'draft',
        starts_at: '',
        ends_at: '',
        public_registration_slug: '',
        public_registration_enabled: false,
        registration_open_at: '',
        main_invoice_deadline: '',
        deposit_amount: '',
        main_invoice_amount: '',
        currency: 'EUR',
        minimum_deposit_count: '',
        commercial_status: 'draft'
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
          <p>Attach a new event to a season with timing, status, and registration settings.</p>
        </div>
        <button className="ghost" type="button" onClick={() => navigate('/events')}>
          Back to events
        </button>
      </header>

      {loading ? (
        <article className="card">
          <p className="muted">Loading seasons…</p>
        </article>
      ) : error ? (
        <article className="card">
          <p className="error-text">{error}</p>
        </article>
      ) : seasons.length === 0 ? (
        <article className="card">
          <p className="muted">Create a season first before scheduling events.</p>
        </article>
      ) : (
        <form className="form-grid" onSubmit={handleSubmit}>
          <article className="card">
            <header className="card-header event-detail-section-header">
              <div className="event-detail-section-header-main">
                <h3 className="event-detail-section-title">Event details</h3>
              </div>
            </header>
            <div className="event-detail-details-grid form-field-full-span">
              <label className="form-field event-detail-details-col-1-3">
                <span>Event name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter a name for the event"
                  required
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-3-4" />
              <label className="form-field event-detail-details-col-4-5">
                <span>Season</span>
                <select
                  className="event-detail-season-select"
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
              <div aria-hidden="true" className="event-detail-details-col-5-7" />

              <label className="form-field event-detail-details-col-1-3">
                <span>Location</span>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="The overall location the event takes place"
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-3-4" />
              <label className="form-field event-detail-details-col-4-5">
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
              <label className="form-field event-detail-details-slots">
                <span>Slots</span>
                <input
                  type="number"
                  min="0"
                  value={form.slots}
                  onChange={(e) => setForm((prev) => ({ ...prev, slots: e.target.value }))}
                  placeholder="Total participant slots"
                  className="event-detail-slots-input"
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-6-7" />

              <label className="form-field event-detail-details-col-1-3">
                <span>Starts on</span>
                <input
                  type="date"
                  value={form.starts_at}
                  onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
                  required
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-3-4" />
              <label className="form-field event-detail-details-col-4-6">
                <span>Ends on</span>
                <input
                  type="date"
                  value={form.ends_at}
                  onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-6-7" />
            </div>
          </article>

          <article className="card">
            <header className="card-header event-detail-section-header">
              <div className="event-detail-section-header-main">
                <h3 className="event-detail-section-title">Registration settings</h3>
              </div>
            </header>
            <div className="registration-settings-grid">
              <label className="form-field registration-settings-field">
                <span>Commercial status</span>
                <select
                  value={form.commercial_status}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, commercial_status: e.target.value as EventCommercialStatus }))
                  }
                >
                  {commercialStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field registration-settings-field">
                <span>Registration opens</span>
                <input
                  type="datetime-local"
                  value={form.registration_open_at}
                  onChange={(e) => setForm((prev) => ({ ...prev, registration_open_at: e.target.value }))}
                />
              </label>

              <label className="form-field registration-settings-field">
                <span>Registration slug</span>
                <input
                  type="text"
                  value={form.public_registration_slug}
                  onChange={(e) => setForm((prev) => ({ ...prev, public_registration_slug: e.target.value }))}
                  placeholder="event-name-2026"
                />
              </label>

              <label className="form-field registration-settings-field">
                <span>Minimum registrations</span>
                <input
                  type="number"
                  min="0"
                  value={form.minimum_deposit_count}
                  onChange={(e) => setForm((prev) => ({ ...prev, minimum_deposit_count: e.target.value }))}
                  placeholder="0"
                />
              </label>

              <label className="form-field registration-settings-field">
                <span>Deposit amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.deposit_amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, deposit_amount: e.target.value }))}
                  placeholder="0.00"
                />
              </label>

              <label className="form-field registration-settings-field">
                <span>Main Invoice amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.main_invoice_amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, main_invoice_amount: e.target.value }))}
                  placeholder="0.00"
                />
              </label>

              <label className="form-field registration-settings-field">
                <span>Main Invoice deadline</span>
                <input
                  type="datetime-local"
                  value={form.main_invoice_deadline}
                  onChange={(e) => setForm((prev) => ({ ...prev, main_invoice_deadline: e.target.value }))}
                />
              </label>

              <label className="form-field registration-settings-field">
                <span>Currency</span>
                <input
                  type="text"
                  maxLength={8}
                  value={form.currency}
                  onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                  placeholder="EUR"
                />
              </label>

              <label className="form-field event-create-registration-toggle">
                <input
                  type="checkbox"
                  checked={form.public_registration_enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, public_registration_enabled: e.target.checked }))}
                />
                <span>Enable public registration</span>
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create event'}
              </button>
              {message && <span className="muted">{message}</span>}
            </div>
          </article>
        </form>
      )}
    </section>
  );
};

export default EventCreatePage;
