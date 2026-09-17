import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { copyEvent, deleteEvent, Event, getEvent } from '../api/events';
import { listParticipantProfiles, ParticipantProfile } from '../api/participants';
import {
  createEventRegistration,
  listEventRegistrations,
  Registration,
  RegistrationStatus,
  updateRegistrationChecklist
} from '../api/registrations';
import EventGearMenu from '../components/EventGearMenu';
import EventPageTitle from '../components/EventPageTitle';
import { useResourceStream } from '../hooks/useResourceStream';
import { usePreserveOverlayScroll } from '../hooks/usePreserveOverlayScroll';
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

const registrationChecklistItems = [
  { key: 'email_reg_form', label: 'Email To Fill Profile' },
  { key: 'main_invoice_amount', label: 'Main Invoice Amount', textField: true },
  { key: 'made_invoice', label: 'Made Invoice' },
  { key: 'main_email_sent', label: 'Main Email Sent' },
  { key: 'sent_invoice', label: 'Sent Invoice' },
  { key: 'received_main', label: 'Received Main' },
  { key: 'amount', label: 'Amount', textField: true },
  { key: 'paid_via', label: 'Paid Via', textField: true },
  { key: 'checked_paid_on_stripe', label: 'Checked As Paid On Stripe' },
  { key: 'added_to_whatsapp_group', label: 'Added To WhatsApp Group' }
];

type RegistrationActionsChecklistOverlayProps = {
  registration: Registration;
  onClose: () => void;
  onSaved: (registration: Registration) => void;
};

const RegistrationActionsChecklistOverlay = ({
  registration,
  onClose,
  onSaved
}: RegistrationActionsChecklistOverlayProps) => {
  usePreserveOverlayScroll();
  const [checklist, setChecklist] = useState(registration.checklist || {});
  const [checklistText, setChecklistText] = useState(registration.checklist_text || {});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const saveChecklist = async (
    nextChecklist: Record<string, boolean>,
    nextChecklistText: Record<string, string>,
    savingItem: string
  ) => {
    if (savingKey) return;
    setChecklist(nextChecklist);
    setChecklistText(nextChecklistText);
    setSavingKey(savingItem);
    setSaveError(null);
    try {
      const updatedRegistration = await updateRegistrationChecklist(registration.id, nextChecklist, nextChecklistText);
      setChecklist(updatedRegistration.checklist || {});
      setChecklistText(updatedRegistration.checklist_text || {});
      onSaved(updatedRegistration);
    } catch (err) {
      setChecklist(registration.checklist || {});
      setChecklistText(registration.checklist_text || {});
      setSaveError(err instanceof Error ? err.message : 'Failed to save checklist item');
    } finally {
      setSavingKey(null);
    }
  };

  const toggleChecklistItem = async (key: string) => {
    const nextChecklist = { ...checklist, [key]: !checklist[key] };
    if (!nextChecklist[key]) delete nextChecklist[key];
    await saveChecklist(nextChecklist, checklistText, key);
  };

  return createPortal(
    <div className="registration-checklist-overlay" role="presentation" onClick={onClose}>
      <section
        className="card overlay-panel-with-close registration-checklist-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-actions-checklist-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="overlay-close-button overlay-close-top-left"
          type="button"
          aria-label="Close registration actions checklist"
          onClick={onClose}
        >
          ×
        </button>
        <header className="registration-checklist-overlay-header">
          <h2 id="registration-actions-checklist-title">Registration Actions Checklist</h2>
          <p className="muted">
            {registration.participant_name || `Participant #${registration.participant_id}`}
          </p>
        </header>
        <ul className="registration-checklist-items">
          {registrationChecklistItems.map((item) => (
            <li key={item.key} className={item.textField ? 'registration-checklist-item--with-text' : undefined}>
              <button
                type="button"
                className="registration-checklist-item-button"
                disabled={savingKey !== null}
                onClick={() => void toggleChecklistItem(item.key)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {checklist[item.key] ? 'check_box' : 'check_box_outline_blank'}
                </span>
                <span>{item.label}</span>
              </button>
              {item.textField ? (
                <input
                  className="registration-checklist-paid-via-input"
                  type="text"
                  value={checklistText[item.key] || ''}
                  placeholder={item.key === 'paid_via' ? 'Payment method' : 'Enter amount'}
                  aria-label={item.label}
                  disabled={savingKey !== null}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setChecklistText((current) => ({ ...current, [item.key]: nextValue }));
                    setChecklist((current) => {
                      const nextChecklist = { ...current };
                      if (nextValue.trim()) {
                        nextChecklist[item.key] = true;
                      } else {
                        delete nextChecklist[item.key];
                      }
                      return nextChecklist;
                    });
                  }}
                  onBlur={() => {
                    if ((checklistText[item.key] || '') !== (registration.checklist_text?.[item.key] || '')) {
                      void saveChecklist(checklist, checklistText, item.key);
                    }
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
        {saveError ? <p className="error-text registration-checklist-save-error">{saveError}</p> : null}
      </section>
    </div>,
    document.body
  );
};

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
  const [pendingLiveRefresh, setPendingLiveRefresh] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [depositFilter, setDepositFilter] = useState<PaymentState>('all');
  const [mainInvoiceFilter, setMainInvoiceFilter] = useState<PaymentState>('all');
  const [query, setQuery] = useState('');
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateRegistrationFormState>(createInitialFormState());
  const [checklistRegistration, setChecklistRegistration] = useState<Registration | null>(null);

  const reload = useCallback(
    async (options?: { preserveLoading?: boolean; preserveCreateForm?: boolean }) => {
      if (!eventId) return;
      const keepLoading = options?.preserveLoading;
      const preserveCreateForm = options?.preserveCreateForm;
      if (!keepLoading) {
        setLoading(true);
      }
      setError(null);
      setMessage(null);
      try {
        const [nextEvent, nextRegistrations, nextParticipants] = await Promise.all([
          getEvent(Number(eventId)),
          listEventRegistrations(Number(eventId)),
          listParticipantProfiles()
        ]);
        setEventData(nextEvent);
        setRegistrations(
          dedupeRegistrationsByParticipant(Array.isArray(nextRegistrations) ? nextRegistrations : [])
        );
        setParticipants(
          (Array.isArray(nextParticipants) ? nextParticipants : []).slice().sort((a, b) =>
            a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
          )
        );
        if (!preserveCreateForm) {
          setCreateForm(createInitialFormState(nextEvent));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load registrations');
      } finally {
        if (!keepLoading) {
          setLoading(false);
        }
      }
    },
    [eventId]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const hasPendingLocalChanges = createFormOpen || creating || copying || deleting;

  useResourceStream({
    path: eventId ? `/events/${eventId}/stream` : null,
    onMessage: () => {
      if (hasPendingLocalChanges) {
        setPendingLiveRefresh(true);
        return;
      }
      void reload({ preserveLoading: true });
    }
  });

  useEffect(() => {
    if (!pendingLiveRefresh || hasPendingLocalChanges) return;
    setPendingLiveRefresh(false);
    void reload({ preserveLoading: true });
  }, [hasPendingLocalChanges, pendingLiveRefresh, reload]);

  const handleReloadLatest = () => {
    setPendingLiveRefresh(false);
    setCreateFormOpen(false);
    setCreateForm(createInitialFormState(eventData));
    void reload({ preserveLoading: true });
  };

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

  const nonStaffRegistrations = useMemo(() => {
    const staffParticipantIDs = new Set(
      participants
        .filter((participant) => (participant.roles || []).some((role) => role.toLowerCase() === 'staff'))
        .map((participant) => participant.id)
    );
    return registrations.filter((registration) => !staffParticipantIDs.has(registration.participant_id));
  }, [participants, registrations]);

  const filteredRegistrations = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return nonStaffRegistrations.filter((registration) => {
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
  }, [depositFilter, mainInvoiceFilter, nonStaffRegistrations, query, statusFilter]);

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
    const overdueDeposits = nonStaffRegistrations.filter(
      (registration) =>
        computePaymentState(registration.deposit_paid_at, registration.deposit_due_at, registration.status) ===
        'overdue'
    ).length;
    const overdueMainInvoices = nonStaffRegistrations.filter(
      (registration) =>
        computePaymentState(registration.main_invoice_paid_at, registration.main_invoice_due_at, registration.status) ===
        'overdue'
    ).length;
    const completed = nonStaffRegistrations.filter((registration) => isCompletedStatus(registration.status)).length;
    return { overdueDeposits, overdueMainInvoices, completed };
  }, [nonStaffRegistrations]);

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
        <EventPageTitle event={eventData} section="Registrations" />
        <EventGearMenu
          eventId={eventData.id}
          currentPage="registrations"
          copying={copying}
          deleting={deleting}
          menuId="event-registrations-actions-menu"
          onPrint={() => navigate(`/events/${eventData.id}/print`)}
          onCopy={handleCopy}
          onDelete={handleDelete}
        />
      </header>
      {pendingLiveRefresh ? (
        <div className="card">
          <div className="event-live-refresh-banner">
            <p className="muted">New changes are available and will load after your current edit finishes.</p>
            <button className="button-link secondary" type="button" onClick={handleReloadLatest}>
              Reload now
            </button>
          </div>
        </div>
      ) : null}

      <section className="registration-stats-grid">
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Total</span>
          <strong>{nonStaffRegistrations.length}</strong>
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
                  <th className="registration-checklist-column">Checklist</th>
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
                      <td
                        className="registration-checklist-column"
                        onClick={(event) => {
                          event.stopPropagation();
                          setChecklistRegistration(registration);
                        }}
                      >
                        <button
                          className="registration-checklist-button"
                          type="button"
                          aria-label={`Open registration actions checklist for ${registration.participant_name || `participant ${registration.participant_id}`}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setChecklistRegistration(registration);
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">check_box</span>
                          <span>Checklist</span>
                        </button>
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

      {checklistRegistration ? (
        <RegistrationActionsChecklistOverlay
          registration={checklistRegistration}
          onClose={() => setChecklistRegistration(null)}
          onSaved={(updatedRegistration) => {
            setRegistrations((current) =>
              current.map((registration) => registration.id === updatedRegistration.id ? updatedRegistration : registration)
            );
            setChecklistRegistration(updatedRegistration);
          }}
        />
      ) : null}

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
