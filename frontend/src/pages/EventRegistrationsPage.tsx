import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Event, getEvent } from '../api/events';
import { listParticipantProfiles, ParticipantProfile } from '../api/participants';
import { createEventRegistration, listEventRegistrations, Registration, RegistrationStatus } from '../api/registrations';
import { formatEventLocal, fromEventLocalInput, toEventLocalInput } from '../utils/eventDate';

type PaymentState = 'all' | 'pending' | 'paid' | 'overdue' | 'none';
type CreateRegistrationFormState = {
  participant_id: string;
  status: RegistrationStatus;
  source: string;
  deposit_due_at: string;
  balance_due_at: string;
  tags: string;
  internal_notes: string;
};

const registrationStatusOptions: RegistrationStatus[] = [
  'applied',
  'deposit_pending',
  'deposit_paid',
  'confirmed',
  'balance_pending',
  'fully_paid',
  'waitlisted',
  'cancelled',
  'expired'
];

const buildDefaultDepositDueAt = (event?: Event | null) => {
  const now = new Date();
  const dueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const eventStartsAt = event?.starts_at ? new Date(event.starts_at) : null;
  const balanceDeadline = event?.balance_deadline ? new Date(event.balance_deadline) : null;
  let nextDueAt = dueAt;
  if (balanceDeadline && !Number.isNaN(balanceDeadline.getTime()) && balanceDeadline.getTime() < nextDueAt.getTime()) {
    nextDueAt = balanceDeadline;
  }
  if (eventStartsAt && !Number.isNaN(eventStartsAt.getTime()) && eventStartsAt.getTime() < nextDueAt.getTime()) {
    nextDueAt = eventStartsAt;
  }
  return toEventLocalInput(nextDueAt.toISOString());
};

const createInitialFormState = (event?: Event | null): CreateRegistrationFormState => ({
  participant_id: '',
  status: 'deposit_pending',
  source: 'staff_manual',
  deposit_due_at: buildDefaultDepositDueAt(event),
  balance_due_at: toEventLocalInput(event?.balance_deadline),
  tags: '',
  internal_notes: ''
});

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const badgeClassForRegistrationStatus = (status: string) => {
  if (status === 'fully_paid' || status === 'confirmed' || status === 'deposit_paid') return 'badge success';
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
  if (status === 'cancelled' || status === 'expired') return 'none';
  return new Date(dueAt).getTime() < Date.now() ? 'overdue' : 'pending';
};

const EventRegistrationsPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [depositFilter, setDepositFilter] = useState<PaymentState>('all');
  const [balanceFilter, setBalanceFilter] = useState<PaymentState>('all');
  const [query, setQuery] = useState('');
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateRegistrationFormState>(createInitialFormState());
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

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
        setRegistrations(Array.isArray(nextRegistrations) ? nextRegistrations : []);
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

  useEffect(() => {
    if (!actionMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!actionMenuRef.current || !target) return;
      if (!actionMenuRef.current.contains(target)) {
        setActionMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [actionMenuOpen]);

  const filteredRegistrations = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return registrations.filter((registration) => {
      const depositState = computePaymentState(
        registration.deposit_paid_at,
        registration.deposit_due_at,
        registration.status
      );
      const balanceState = computePaymentState(
        registration.balance_paid_at,
        registration.balance_due_at,
        registration.status
      );
      if (statusFilter !== 'all' && registration.status !== statusFilter) return false;
      if (depositFilter !== 'all' && depositState !== depositFilter) return false;
      if (balanceFilter !== 'all' && balanceState !== balanceFilter) return false;
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
  }, [balanceFilter, depositFilter, query, registrations, statusFilter]);

  const registeredParticipantIds = useMemo(
    () => new Set(registrations.map((registration) => registration.participant_id)),
    [registrations]
  );

  const availableParticipants = useMemo(
    () => participants.filter((participant) => !registeredParticipantIds.has(participant.id)),
    [participants, registeredParticipantIds]
  );

  const stats = useMemo(() => {
    const overdueDeposits = registrations.filter(
      (registration) =>
        computePaymentState(registration.deposit_paid_at, registration.deposit_due_at, registration.status) ===
        'overdue'
    ).length;
    const overdueBalances = registrations.filter(
      (registration) =>
        computePaymentState(registration.balance_paid_at, registration.balance_due_at, registration.status) ===
        'overdue'
    ).length;
    const fullyPaid = registrations.filter((registration) => registration.status === 'fully_paid').length;
    return { overdueDeposits, overdueBalances, fullyPaid };
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
        deposit_due_at: fromEventLocalInput(createForm.deposit_due_at),
        balance_due_at: fromEventLocalInput(createForm.balance_due_at),
        tags: createForm.tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        internal_notes: createForm.internal_notes
      });
      setRegistrations((prev) => [created, ...prev]);
      setCreateForm(createInitialFormState(eventData));
      setCreateFormOpen(false);
      setMessage('Registration created');
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
        <div>
          <h2>{eventData.name} registrations</h2>
          <p className="muted">
            {eventData.location ? `${eventData.location} · ` : ''}
            {formatEventLocal(eventData.starts_at, { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className="event-schedule-actions" ref={actionMenuRef}>
          <button
            className="ghost event-schedule-gear"
            type="button"
            aria-label={actionMenuOpen ? 'Close actions menu' : 'Open actions menu'}
            aria-expanded={actionMenuOpen}
            aria-controls="event-registrations-actions-menu"
            onClick={() => setActionMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.06.73 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.22 1.12-.52 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              />
            </svg>
          </button>
          {actionMenuOpen && (
            <div className="event-schedule-menu" id="event-registrations-actions-menu" role="menu">
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(`/events/${eventData.id}/details`);
                }}
              >
                Details
              </button>
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(`/events/${eventData.id}`);
                }}
              >
                Schedule
              </button>
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(`/manifests?eventId=${eventData.id}`);
                }}
              >
                Manifest
              </button>
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(`/events/${eventData.id}/comms`);
                }}
              >
                Communication
              </button>
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate('/events');
                }}
              >
                Back
              </button>
            </div>
          )}
        </div>
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
          <span className="registration-stat-label">Balance overdue</span>
          <strong>{stats.overdueBalances}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Fully paid</span>
          <strong>{stats.fullyPaid}</strong>
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
              <option value="applied">Applied</option>
              <option value="deposit_pending">Deposit pending</option>
              <option value="deposit_paid">Deposit paid</option>
              <option value="confirmed">Confirmed</option>
              <option value="balance_pending">Balance pending</option>
              <option value="fully_paid">Fully paid</option>
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
            <span>Balance</span>
            <select value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value as PaymentState)}>
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
            <table className="table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Status</th>
                  <th>Deposit</th>
                  <th>Balance</th>
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
                  const balanceState = computePaymentState(
                    registration.balance_paid_at,
                    registration.balance_due_at,
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
                            balanceState === 'paid'
                              ? 'success'
                              : balanceState === 'overdue'
                                ? 'danger'
                                : 'neutral'
                          }`}
                        >
                          {balanceState}
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

        {message && <p className="success-text">{message}</p>}
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
                    type="datetime-local"
                    value={createForm.deposit_due_at}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, deposit_due_at: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span>Balance due</span>
                  <input
                    type="datetime-local"
                    value={createForm.balance_due_at}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, balance_due_at: e.target.value }))}
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
