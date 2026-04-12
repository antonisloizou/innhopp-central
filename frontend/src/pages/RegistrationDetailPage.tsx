import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createRegistrationActivity,
  createRegistrationPayment,
  getRegistration,
  Registration,
  RegistrationPayment,
  RegistrationPaymentPayload,
  RegistrationStatus,
  updateRegistration,
  updateRegistrationPayment,
  updateRegistrationStatus
} from '../api/registrations';
import {
  formatEventLocal,
  formatEventLocalDate,
  formatEventLocalDateInput
} from '../utils/eventDate';

const registrationStatusOptions: RegistrationStatus[] = [
  'deposit_pending',
  'deposit_paid',
  'main_invoice_pending',
  'completed',
  'waitlisted',
  'cancelled',
  'expired'
];

type PaymentDraft = {
  kind: string;
  amount: string;
  currency: string;
  status: string;
  due_at: string;
  paid_at: string;
  provider: string;
  provider_ref: string;
  notes: string;
};

const toPaymentDraft = (payment?: RegistrationPayment | null): PaymentDraft => ({
  kind: payment?.kind || 'deposit',
  amount: payment?.amount || '0',
  currency: payment?.currency || 'EUR',
  status: payment?.status || 'pending',
  due_at: formatEventLocalDateInput(payment?.due_at),
  paid_at: formatEventLocalDateInput(payment?.paid_at),
  provider: payment?.provider || '',
  provider_ref: payment?.provider_ref || '',
  notes: payment?.notes || ''
});

const badgeClassForRegistrationStatus = (status: string) => {
  if (status === 'completed' || status === 'fully_paid') {
    return 'badge registration-status-badge registration-status-badge-completed';
  }
  if (status === 'deposit_paid') return 'badge registration-status-badge registration-status-badge-deposit-paid';
  if (status === 'deposit_pending' || status === 'main_invoice_pending') {
    return 'badge registration-status-badge registration-status-badge-pending';
  }
  if (status === 'cancelled' || status === 'expired') return 'badge danger';
  return 'badge neutral';
};

const paymentBadgeClass = (status: string) => {
  if (status === 'paid') return 'badge success';
  if (status === 'waived') return 'badge payment-status-badge-waived';
  if (status === 'failed' || status === 'refunded') return 'badge danger';
  return 'badge neutral';
};

const formatTitleCase = (value: string) =>
  value
    .split('_')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');

const RegistrationDetailPage = () => {
  const { registrationId } = useParams();
  const navigate = useNavigate();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [savingPaymentId, setSavingPaymentId] = useState<number | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistrationStatus>('deposit_pending');
  const [source, setSource] = useState('');
  const [depositDueAt, setDepositDueAt] = useState('');
  const [mainInvoiceDueAt, setMainInvoiceDueAt] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [newPayment, setNewPayment] = useState<PaymentDraft>(toPaymentDraft());
  const [paymentDrafts, setPaymentDrafts] = useState<Record<number, PaymentDraft>>({});
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!registrationId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getRegistration(Number(registrationId));
        if (cancelled) return;
        setRegistration(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load registration');
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
  }, [registrationId]);

  useEffect(() => {
    if (!registration) return;
    setStatus(registration.status);
    setSource(registration.source || '');
    setDepositDueAt(formatEventLocalDateInput(registration.deposit_due_at));
    setMainInvoiceDueAt(formatEventLocalDateInput(registration.main_invoice_due_at));
    setInternalNotes(registration.internal_notes || '');
    setTags((registration.tags || []).join(', '));
    const nextDrafts: Record<number, PaymentDraft> = {};
    (registration.payments || []).forEach((payment) => {
      nextDrafts[payment.id] = toPaymentDraft(payment);
    });
    setPaymentDrafts(nextDrafts);
  }, [registration]);

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

  const sortedPayments = useMemo(
    () => [...(registration?.payments || [])].sort((a, b) => a.id - b.id),
    [registration?.payments]
  );

  const handleSaveMeta = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registrationId) return;
    setSavingMeta(true);
    setError(null);
    try {
      let updated = await updateRegistration(Number(registrationId), {
        source: source.trim(),
        deposit_due_at: depositDueAt,
        main_invoice_due_at: mainInvoiceDueAt,
        tags: tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        internal_notes: internalNotes
      });
      if (updated.status !== status) {
        updated = await updateRegistrationStatus(Number(registrationId), { status });
      }
      setRegistration(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update registration');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSavePayment = async (paymentId: number) => {
    if (!registrationId) return;
    const draft = paymentDrafts[paymentId];
    if (!draft) return;
    setSavingPaymentId(paymentId);
    setError(null);
    try {
      const updated = await updateRegistrationPayment(paymentId, {
        kind: draft.kind as RegistrationPaymentPayload['kind'],
        amount: draft.amount,
        currency: draft.currency,
        status: draft.status as RegistrationPaymentPayload['status'],
        due_at: draft.due_at,
        paid_at: draft.paid_at,
        provider: draft.provider,
        provider_ref: draft.provider_ref,
        notes: draft.notes
      });
      setRegistration(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment');
    } finally {
      setSavingPaymentId(null);
    }
  };

  const handleCreatePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registrationId) return;
    setCreatingPayment(true);
    setError(null);
    try {
      const updated = await createRegistrationPayment(Number(registrationId), {
        kind: newPayment.kind as RegistrationPaymentPayload['kind'],
        amount: newPayment.amount,
        currency: newPayment.currency,
        status: newPayment.status as RegistrationPaymentPayload['status'],
        due_at: newPayment.due_at,
        paid_at: newPayment.paid_at,
        provider: newPayment.provider,
        provider_ref: newPayment.provider_ref,
        notes: newPayment.notes
      });
      setRegistration(updated);
      setNewPayment(toPaymentDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create payment');
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registrationId || !note.trim()) return;
    setSavingNote(true);
    setError(null);
    try {
      const updated = await createRegistrationActivity(Number(registrationId), {
        type: 'note',
        summary: note.trim()
      });
      setRegistration(updated);
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <p className="muted">Loading registration…</p>;
  if (error && !registration) return <p className="error-text">{error}</p>;
  if (!registration) return <p className="error-text">Registration not found.</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div className="event-schedule-headline-text">
          <div className="event-header-top">
            <h2 className="event-detail-title">{registration.participant_name || `Participant #${registration.participant_id}`}</h2>
          </div>
          <p className="event-location">
            {registration.event_name || `Event #${registration.event_id}`} · {registration.participant_email || 'No email'}
          </p>
          <div className="event-detail-header-badges">
            <span className={badgeClassForRegistrationStatus(registration.status)}>{formatTitleCase(registration.status)}</span>
          </div>
        </div>
        <div className="event-schedule-actions" ref={actionMenuRef}>
          <button
            className="ghost event-schedule-gear"
            type="button"
            aria-label={actionMenuOpen ? 'Close actions menu' : 'Open actions menu'}
            aria-expanded={actionMenuOpen}
            aria-controls="registration-detail-actions-menu"
            onClick={() => setActionMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.06.73 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.22 1.12-.52 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              />
            </svg>
          </button>
          {actionMenuOpen && (
            <div className="event-schedule-menu registration-detail-actions-menu" id="registration-detail-actions-menu" role="menu">
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(`/participants/${registration.participant_id}`);
                }}
              >
                Participant Profile
              </button>
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(`/events/${registration.event_id}/registrations`);
                }}
              >
                Event Registrations
              </button>
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(`/events/${registration.event_id}/details`);
                }}
              >
                Event Details
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="registration-detail-header-grid">
        <article className="card registration-detail-summary-card">
          <div className="registration-detail-summary-meta">
            <strong>Registered</strong>
            <span>{formatEventLocal(registration.registered_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          <div className="registration-detail-summary-meta">
            <strong>Source</strong>
            <span>{registration.source || '—'}</span>
          </div>
        </article>

        <article className="card registration-detail-summary-card">
          <div className="registration-detail-summary-meta">
            <strong>Deposit due</strong>
            <span>
              {registration.deposit_due_at
                ? formatEventLocalDate(registration.deposit_due_at)
                : '—'}
            </span>
          </div>
          <div className="registration-detail-summary-meta">
            <strong>Main Invoice due</strong>
            <span>
              {registration.main_invoice_due_at
                ? formatEventLocalDate(registration.main_invoice_due_at)
                : '—'}
            </span>
          </div>
        </article>
      </section>

      {error && <p className="error-text">{error}</p>}

      <article className="card stack">
        <div className="registration-section-header">
          <div>
            <h3>Registration</h3>
          </div>
        </div>

        <form className="stack" onSubmit={handleSaveMeta}>
          <div className="form-grid registration-meta-grid">
            <div className="registration-meta-top-row">
              <label className="form-field registration-status-field">
                <span>Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as RegistrationStatus)}>
                  {registrationStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatTitleCase(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Source</span>
                <input value={source} onChange={(e) => setSource(e.target.value)} />
              </label>
            </div>
            <label className="form-field">
              <span>Deposit due</span>
              <input type="date" value={depositDueAt} onChange={(e) => setDepositDueAt(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Main Invoice due</span>
              <input
                type="date"
                value={mainInvoiceDueAt}
                onChange={(e) => setMainInvoiceDueAt(e.target.value)}
              />
            </label>
            <label className="form-field registration-meta-span">
              <span>Tags</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, returning, family" />
            </label>
            <label className="form-field registration-meta-span">
              <span>Internal notes</span>
              <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
            </label>
          </div>
          <div className="detail-actions">
            <button className="primary" type="submit" disabled={savingMeta}>
              {savingMeta ? 'Saving…' : 'Save registration'}
            </button>
          </div>
        </form>
      </article>

      <article className="card stack">
        <h3>Payments</h3>
        {sortedPayments.length === 0 ? <p className="muted">No payment records yet.</p> : null}
        {sortedPayments.map((payment) => {
          const draft = paymentDrafts[payment.id] || toPaymentDraft(payment);
          return (
            <section key={payment.id} className="registration-payment-card">
              <div className="registration-payment-card-header">
                <div className="registration-payment-card-title">
                  <strong>{payment.kind}</strong>
                  <span className={paymentBadgeClass(payment.status)}>{payment.status}</span>
                </div>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => void handleSavePayment(payment.id)}
                  disabled={savingPaymentId === payment.id}
                >
                  {savingPaymentId === payment.id ? 'Saving…' : 'Save payment'}
                </button>
              </div>
              <div className="form-grid registration-payment-grid">
                <label className="form-field">
                  <span>Kind</span>
                  <select
                    value={draft.kind}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, kind: e.target.value } }))
                    }
                  >
                    <option value="deposit">Deposit</option>
                    <option value="main_invoice">Main Invoice</option>
                    <option value="refund">Refund</option>
                    <option value="manual_adjustment">Manual adjustment</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Amount</span>
                  <input
                    value={draft.amount}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, amount: e.target.value } }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Currency</span>
                  <input
                    value={draft.currency}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, currency: e.target.value } }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Status</span>
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, status: e.target.value } }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="failed">Failed</option>
                    <option value="waived">Waived</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Due at</span>
                  <input
                    type="date"
                    value={draft.due_at}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, due_at: e.target.value } }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Paid at</span>
                  <input
                    type="date"
                    value={draft.paid_at}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, paid_at: e.target.value } }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Provider</span>
                  <input
                    value={draft.provider}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, provider: e.target.value } }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Reference</span>
                  <input
                    value={draft.provider_ref}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, provider_ref: e.target.value } }))
                    }
                  />
                </label>
                <label className="form-field registration-payment-notes">
                  <span>Notes</span>
                  <textarea
                    value={draft.notes}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, notes: e.target.value } }))
                    }
                  />
                </label>
              </div>
            </section>
          );
        })}

        <form className="stack" onSubmit={handleCreatePayment}>
          <h4>Add payment</h4>
          <div className="form-grid registration-payment-grid">
            <label className="form-field">
              <span>Kind</span>
              <select value={newPayment.kind} onChange={(e) => setNewPayment((prev) => ({ ...prev, kind: e.target.value }))}>
                <option value="deposit">Deposit</option>
                <option value="main_invoice">Main Invoice</option>
                <option value="refund">Refund</option>
                <option value="manual_adjustment">Manual adjustment</option>
              </select>
            </label>
            <label className="form-field">
              <span>Amount</span>
              <input value={newPayment.amount} onChange={(e) => setNewPayment((prev) => ({ ...prev, amount: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>Currency</span>
              <input value={newPayment.currency} onChange={(e) => setNewPayment((prev) => ({ ...prev, currency: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>Status</span>
              <select value={newPayment.status} onChange={(e) => setNewPayment((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="waived">Waived</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
            <label className="form-field">
              <span>Due at</span>
              <input
                type="date"
                value={newPayment.due_at}
                onChange={(e) => setNewPayment((prev) => ({ ...prev, due_at: e.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Paid at</span>
              <input
                type="date"
                value={newPayment.paid_at}
                onChange={(e) => setNewPayment((prev) => ({ ...prev, paid_at: e.target.value }))}
              />
            </label>
          </div>
          <div className="detail-actions">
            <button className="primary" type="submit" disabled={creatingPayment}>
              {creatingPayment ? 'Creating…' : 'Add payment'}
            </button>
          </div>
        </form>
      </article>

      <article className="card stack">
        <h3>Activity</h3>
        <form className="stack" onSubmit={handleAddNote}>
          <label className="form-field">
            <span>Add note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="detail-actions">
            <button className="primary" type="submit" disabled={savingNote || !note.trim()}>
              {savingNote ? 'Saving…' : 'Add note'}
            </button>
          </div>
        </form>

        <div className="registration-activity-list">
          {(registration.activities || []).map((activity) => (
            <article key={activity.id} className="registration-activity-item">
              <div className="registration-activity-item-header">
                <strong>{activity.type.replace(/_/g, ' ')}</strong>
                <span className="muted">
                  {formatEventLocal(activity.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              <p>{activity.summary}</p>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
};

export default RegistrationDetailPage;
