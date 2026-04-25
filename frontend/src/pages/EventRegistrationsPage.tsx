import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { copyEvent, deleteEvent, Event, getEvent } from '../api/events';
import { listParticipantProfiles, ParticipantProfile } from '../api/participants';
import { createEventRegistration, listEventRegistrations, Registration, RegistrationStatus } from '../api/registrations';
import EventGearMenu from '../components/EventGearMenu';
import {
  formatEventLocalDateInputFromDate,
  formatEventLocal,
  formatEventLocalDateInput,
  fromEventLocalDateInput,
  getEventLocalDateKey,
  getEventLocalDateKeyFromDate
} from '../utils/eventDate';

type PaymentState = 'all' | 'pending' | 'paid' | 'overdue' | 'none';
type CreateRegistrationFormState = {
  participant_id: string;
  status: RegistrationStatus;
  source: string;
  deposit_due_at: string;
  main_invoice_due_at: string;
  tags: string;
  internal_notes: string;
};

const registrationStatusOptions: RegistrationStatus[] = [
  'deposit_pending',
  'deposit_paid',
  'main_invoice_pending',
  'completed',
  'waitlisted',
  'cancelled',
  'expired'
];

const buildDefaultDepositDueAt = (event?: Event | null) => {
  const now = new Date();
  const dueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const eventStartsAt = event?.starts_at ? new Date(event.starts_at) : null;
  let nextDueAt = dueAt;
  if (eventStartsAt && !Number.isNaN(eventStartsAt.getTime()) && eventStartsAt.getTime() < nextDueAt.getTime()) {
    nextDueAt = eventStartsAt;
  }
  return formatEventLocalDateInputFromDate(nextDueAt);
};

const createInitialFormState = (event?: Event | null): CreateRegistrationFormState => ({
  participant_id: '',
  status: 'deposit_pending',
  source: 'staff_manual',
  deposit_due_at: buildDefaultDepositDueAt(event),
  main_invoice_due_at: formatEventLocalDateInput(event?.main_invoice_deadline),
  tags: '',
  internal_notes: ''
});

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const isCompletedStatus = (status: string) => status === 'completed' || status === 'fully_paid';

const badgeClassForRegistrationStatus = (status: string) => {
  if (isCompletedStatus(status)) {
    return 'badge registration-status-badge registration-status-badge-completed';
  }
  if (status === 'deposit_paid') return 'badge registration-status-badge registration-status-badge-deposit-paid';
  if (status === 'deposit_pending' || status === 'main_invoice_pending') {
    return 'badge registration-status-badge registration-status-badge-pending';
  }
  if (status === 'cancelled' || status === 'expired') return 'badge danger';
  return 'badge neutral';
};

const computePaymentState = (
  paidAt?: string | null,
  dueAt?: string | null,
  status?: string
): Exclude<PaymentState, 'all'> => {
  if (paidAt) return 'paid';
  if (!dueAt) return 'none';
  if (status === 'cancelled') return 'none';
  return getEventLocalDateKey(dueAt) < getEventLocalDateKeyFromDate(new Date()) ? 'overdue' : 'pending';
};

const dedupeRegistrationsByParticipant = (items: Registration[]) => {
  const latestByParticipant = new Map<number, Registration>();
  items.forEach((registration) => {
    const current = latestByParticipant.get(registration.participant_id);
    if (!current) {
      latestByParticipant.set(registration.participant_id, registration);
      return;
    }
    const currentRegisteredAt = new Date(current.registered_at).getTime();
    const nextRegisteredAt = new Date(registration.registered_at).getTime();
    if (
      nextRegisteredAt > currentRegisteredAt ||
      (nextRegisteredAt === currentRegisteredAt && registration.id > current.id)
    ) {
      latestByParticipant.set(registration.participant_id, registration);
    }
  });
  return [...latestByParticipant.values()].sort(
    (a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime() || b.id - a.id
  );
};

const EventRegistrationsPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [depositFilter, setDepositFilter] = useState<PaymentState>('all');
  const [mainInvoiceFilter, setMainInvoiceFilter] = useState<PaymentState>('all');
  const [query, setQuery] = useState('');
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateRegistrationFormState>(createInitialFormState());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const [nextEvent, nextRegistrations, nextParticipants] = await Promise.all([
          getEvent(Number(eventId)),
          listEventRegistrations(Number(eventId)),
          listParticipantProfiles()
        ]);
        if (cancelled) return;
        setEventData(nextEvent);
        setRegistrations(
          dedupeRegistrationsByParticipant(Array.isArray(nextRegistrations) ? nextRegistrations : [])
        );
        setParticipants(
          (Array.isArray(nextParticipants) ? nextParticipants : []).slice().sort((a, b) =>
            a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
          )
        );
        setCreateForm(createInitialFormState(nextEvent));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load registrations');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const handleDelete = async () => {
    if (!eventId) return;
    if (!window.confirm('Delete this event?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteEvent(Number(eventId));
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async () => {
    if (!eventId || copying) return;
    setCopying(true);
    setMessage(null);
    try {
      const cloned = await copyEvent(Number(eventId));
      navigate(`/events/${cloned.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to copy event');
    } finally {
      setCopying(false);
    }
  };

  const filteredRegistrations = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return registrations.filter((registration) => {
      const depositState = computePaymentState(
        registration.deposit_paid_at,
        registration.deposit_due_at,
        registration.status
      );
      const mainInvoiceState = computePaymentState(
        registration.main_invoice_paid_at,
        registration.main_invoice_due_at,
        registration.status
      );
      if (statusFilter !== 'all' && registration.status !== statusFilter) return false;
      if (depositFilter !== 'all' && depositState !== depositFilter) return false;
      if (mainInvoiceFilter !== 'all' && mainInvoiceState !== mainInvoiceFilter) return false;
      if (!normalizedQuery) return true;
      return [
        registration.participant_name,
        registration.participant_email,
        registration.source,
        registration.internal_notes
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [depositFilter, mainInvoiceFilter, query, registrations, statusFilter]);

  const registeredParticipantIds = useMemo(
    () => new Set(registrations.map((registration) => registration.participant_id)),
    [registrations]
  );

  const availableParticipants = useMemo(
    () =>
      participants.filter((participant) => {
        const roles = Array.isArray(participant.roles) ? participant.roles : [];
        return !registeredParticipantIds.has(participant.id) && !roles.includes('Staff');
      }),
    [participants, registeredParticipantIds]
  );

  const stats = useMemo(() => {
    const overdueDeposits = registrations.filter(
      (registration) =>
        computePaymentState(registration.deposit_paid_at, registration.deposit_due_at, registration.status) ===
        'overdue'
    ).length;
    const overdueMainInvoices = registrations.filter(
      (registration) =>
        computePaymentState(registration.main_invoice_paid_at, registration.main_invoice_due_at, registration.status) ===
        'overdue'
    ).length;
    const completed = registrations.filter((registration) => isCompletedStatus(registration.status)).length;
    return { overdueDeposits, overdueMainInvoices, completed };
  }, [registrations]);

  const handleCreateRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventId) return;
    const participantID = Number(createForm.participant_id);
    if (!participantID) {
      setError('Select a participant');
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createEventRegistration(Number(eventId), {
        participant_id: participantID,
        status: createForm.status,
        source: createForm.source.trim(),
        deposit_due_at: createForm.deposit_due_at,
        main_invoice_due_at: createForm.main_invoice_due_at,
        tags: createForm.tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        internal_notes: createForm.internal_notes
      });
      setRegistrations((prev) => dedupeRegistrationsByParticipant([created, ...prev]));
      setCreateForm(createInitialFormState(eventData));
      setCreateFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create registration');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="muted">Loading registrations…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!eventData) return <p className="error-text">Event not found.</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div className="event-schedule-headline-text">
          <div className="event-header-top">
            <h2 className="event-detail-title">{eventData.name}: Registrations</h2>
          </div>
          <p className="event-location">{eventData.location || 'Location TBD'}</p>
          <div className="event-detail-header-badges">
            <span className={`badge status-${eventData.status}`}>{eventData.status}</span>
          </div>
        </div>
        <EventGearMenu
          eventId={eventData.id}
          currentPage="registrations"
          copying={copying}
          deleting={deleting}
          menuId="event-registrations-actions-menu"
          onCopy={handleCopy}
          onDelete={handleDelete}
        />
      </header>

      <section className="registration-stats-grid">
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Total</span>
          <strong>{registrations.length}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Deposit overdue</span>
          <strong>{stats.overdueDeposits}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Main Invoice overdue</span>
          <strong>{stats.overdueMainInvoices}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Completed</span>
          <strong>{stats.completed}</strong>
        </article>
      </section>

      <article className="card stack">
        <div className="form-grid registration-filter-grid">
          <label className="form-field">
            <span>Search</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, source…" />
          </label>
          <label className="form-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="deposit_pending">Deposit pending</option>
              <option value="deposit_paid">Deposit paid</option>
              <option value="main_invoice_pending">Main Invoice pending</option>
              <option value="completed">Completed</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="form-field">
            <span>Deposit</span>
            <select value={depositFilter} onChange={(e) => setDepositFilter(e.target.value as PaymentState)}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="form-field">
            <span>Main Invoice</span>
            <select value={mainInvoiceFilter} onChange={(e) => setMainInvoiceFilter(e.target.value as PaymentState)}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>

        {filteredRegistrations.length === 0 ? (
          <p className="muted">No registrations match the current filters.</p>
        ) : (
          <div className="registration-table-wrap">
            <table className="table registration-list-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Status</th>
                  <th>Deposit</th>
                  <th>Main Invoice</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.map((registration) => {
                  const depositState = computePaymentState(
                    registration.deposit_paid_at,
                    registration.deposit_due_at,
                    registration.status
                  );
                  const mainInvoiceState = computePaymentState(
                    registration.main_invoice_paid_at,
                    registration.main_invoice_due_at,
                    registration.status
                  );
                  return (
                    <tr
                      key={registration.id}
                      className="registration-table-row"
                      onClick={() => navigate(`/registrations/${registration.id}`)}
                    >
                      <td>
                        <div className="registration-table-primary">
                          <strong>{registration.participant_name || `Participant #${registration.participant_id}`}</strong>
                          <span className="muted">{registration.participant_email || 'No email'}</span>
                        </div>
                      </td>
                      <td>
                        <span className={badgeClassForRegistrationStatus(registration.status)}>
                          {registration.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            depositState === 'paid'
                              ? 'success'
                              : depositState === 'overdue'
                                ? 'danger'
                                : 'neutral'
                          }`}
                        >
                          {depositState}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            mainInvoiceState === 'paid'
                              ? 'success'
                              : mainInvoiceState === 'overdue'
                                ? 'danger'
                                : 'neutral'
                          }`}
                        >
                          {mainInvoiceState}
                        </span>
                      </td>
                      <td>{formatEventLocal(registration.registered_at, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="card stack">
        <div className="page-header">
          <div>
            <h3>Manual registration</h3>
            <p className="muted">Add an existing participant to this event without using the public signup link.</p>
          </div>
          <div className="card-actions">
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setCreateFormOpen((open) => !open);
                setError(null);
                setMessage(null);
              }}
            >
              {createFormOpen ? 'Close' : 'Add registration'}
            </button>
          </div>
        </div>

        {message && <p className="error-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}

        {createFormOpen ? (
          availableParticipants.length === 0 ? (
            <p className="muted">All current participants already have registrations for this event.</p>
          ) : (
            <form className="stack" onSubmit={handleCreateRegistration}>
              <div className="form-grid registration-create-grid">
                <label className="form-field registration-create-span">
                  <span>Participant</span>
                  <select
                    value={createForm.participant_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, participant_id: e.target.value }))}
                    required
                  >
                    <option value="">Select participant</option>
                    {availableParticipants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.full_name} · {participant.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Status</span>
                  <select
                    value={createForm.status}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, status: e.target.value as RegistrationStatus }))
                    }
                  >
                    {registrationStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Source</span>
                  <input
                    value={createForm.source}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, source: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span>Deposit due</span>
                  <input
                    type="date"
                    value={createForm.deposit_due_at}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, deposit_due_at: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span>Main Invoice due</span>
                  <input
                    type="date"
                    value={createForm.main_invoice_due_at}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, main_invoice_due_at: e.target.value }))}
                  />
                </label>
                <label className="form-field registration-create-span">
                  <span>Tags</span>
                  <input
                    value={createForm.tags}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, tags: e.target.value }))}
                    placeholder="vip, returning, family"
                  />
                </label>
                <label className="form-field registration-create-span">
                  <span>Internal notes</span>
                  <textarea
                    value={createForm.internal_notes}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, internal_notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className="detail-actions">
                <button className="primary" type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create registration'}
                </button>
              </div>
            </form>
          )
        ) : null}
      </article>
    </section>
  );
};

export default EventRegistrationsPage;
