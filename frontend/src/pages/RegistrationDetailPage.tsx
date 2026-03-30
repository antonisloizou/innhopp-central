import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { formatEventLocal, fromEventLocalInput, toEventLocalInput } from '../utils/eventDate';

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
  due_at: toEventLocalInput(payment?.due_at),
  paid_at: toEventLocalInput(payment?.paid_at),
  provider: payment?.provider || '',
  provider_ref: payment?.provider_ref || '',
  notes: payment?.notes || ''
});

const badgeClassForRegistrationStatus = (status: string) => {
  if (status === 'fully_paid' || status === 'confirmed' || status === 'deposit_paid') return 'badge success';
  if (status === 'cancelled' || status === 'expired') return 'badge danger';
  return 'badge neutral';
};

const paymentBadgeClass = (status: string) => {
  if (status === 'paid' || status === 'waived') return 'badge success';
  if (status === 'failed' || status === 'refunded') return 'badge danger';
  return 'badge neutral';
};

const RegistrationDetailPage = () => {
  const { registrationId } = useParams();
  const navigate = useNavigate();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [savingPaymentId, setSavingPaymentId] = useState<number | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistrationStatus>('deposit_pending');
  const [source, setSource] = useState('');
  const [depositDueAt, setDepositDueAt] = useState('');
  const [balanceDueAt, setBalanceDueAt] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [newPayment, setNewPayment] = useState<PaymentDraft>(toPaymentDraft());
  const [paymentDrafts, setPaymentDrafts] = useState<Record<number, PaymentDraft>>({});

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
    setDepositDueAt(toEventLocalInput(registration.deposit_due_at));
    setBalanceDueAt(toEventLocalInput(registration.balance_due_at));
    setInternalNotes(registration.internal_notes || '');
    setTags((registration.tags || []).join(', '));
    const nextDrafts: Record<number, PaymentDraft> = {};
    (registration.payments || []).forEach((payment) => {
      nextDrafts[payment.id] = toPaymentDraft(payment);
    });
    setPaymentDrafts(nextDrafts);
  }, [registration]);

  const sortedPayments = useMemo(
    () => [...(registration?.payments || [])].sort((a, b) => a.id - b.id),
    [registration?.payments]
  );

  const handleSaveMeta = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registrationId) return;
    setSavingMeta(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateRegistration(Number(registrationId), {
        source: source.trim(),
        deposit_due_at: fromEventLocalInput(depositDueAt),
        balance_due_at: fromEventLocalInput(balanceDueAt),
        tags: tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        internal_notes: internalNotes
      });
      setRegistration(updated);
      setMessage('Registration updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update registration');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleStatusSave = async () => {
    if (!registrationId) return;
    setSavingStatus(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateRegistrationStatus(Number(registrationId), { status });
      setRegistration(updated);
      setMessage('Status updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSavePayment = async (paymentId: number) => {
    if (!registrationId) return;
    const draft = paymentDrafts[paymentId];
    if (!draft) return;
    setSavingPaymentId(paymentId);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateRegistrationPayment(paymentId, {
        kind: draft.kind as RegistrationPaymentPayload['kind'],
        amount: draft.amount,
        currency: draft.currency,
        status: draft.status as RegistrationPaymentPayload['status'],
        due_at: fromEventLocalInput(draft.due_at),
        paid_at: fromEventLocalInput(draft.paid_at),
        provider: draft.provider,
        provider_ref: draft.provider_ref,
        notes: draft.notes
      });
      setRegistration(updated);
      setMessage('Payment updated');
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
    setMessage(null);
    try {
      const updated = await createRegistrationPayment(Number(registrationId), {
        kind: newPayment.kind as RegistrationPaymentPayload['kind'],
        amount: newPayment.amount,
        currency: newPayment.currency,
        status: newPayment.status as RegistrationPaymentPayload['status'],
        due_at: fromEventLocalInput(newPayment.due_at),
        paid_at: fromEventLocalInput(newPayment.paid_at),
        provider: newPayment.provider,
        provider_ref: newPayment.provider_ref,
        notes: newPayment.notes
      });
      setRegistration(updated);
      setNewPayment(toPaymentDraft());
      setMessage('Payment created');
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
    setMessage(null);
    try {
      const updated = await createRegistrationActivity(Number(registrationId), {
        type: 'note',
        summary: note.trim()
      });
      setRegistration(updated);
      setNote('');
      setMessage('Note added');
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
        <div>
          <h2>{registration.participant_name || `Participant #${registration.participant_id}`}</h2>
          <p className="muted">
            {registration.event_name || `Event #${registration.event_id}`} · {registration.participant_email || 'No email'}
          </p>
        </div>
        <div className="card-actions">
          <Link className="ghost button-link" to={`/events/${registration.event_id}/registrations`}>
            Back to registrations
          </Link>
          <Link className="ghost button-link" to={`/participants/${registration.participant_id}`}>
            Participant
          </Link>
          <button className="ghost" type="button" onClick={() => navigate(`/events/${registration.event_id}/details`)}>
            Event
          </button>
        </div>
      </header>

      <section className="registration-detail-header-grid">
        <article className="card registration-detail-summary-card">
          <span className={badgeClassForRegistrationStatus(registration.status)}>
            {registration.status.replace(/_/g, ' ')}
          </span>
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
                ? formatEventLocal(registration.deposit_due_at, { dateStyle: 'medium', timeStyle: 'short' })
                : '—'}
            </span>
          </div>
          <div className="registration-detail-summary-meta">
            <strong>Balance due</strong>
            <span>
              {registration.balance_due_at
                ? formatEventLocal(registration.balance_due_at, { dateStyle: 'medium', timeStyle: 'short' })
                : '—'}
            </span>
          </div>
        </article>
      </section>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <article className="card stack">
        <div className="page-header">
          <div>
            <h3>Registration</h3>
          </div>
          <div className="registration-status-controls">
            <label className="form-field registration-status-field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as RegistrationStatus)}>
                {registrationStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" type="button" onClick={() => void handleStatusSave()} disabled={savingStatus}>
              {savingStatus ? 'Saving…' : 'Save status'}
            </button>
          </div>
        </div>

        <form className="stack" onSubmit={handleSaveMeta}>
          <div className="form-grid registration-meta-grid">
            <label className="form-field">
              <span>Source</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Deposit due</span>
              <input type="datetime-local" value={depositDueAt} onChange={(e) => setDepositDueAt(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Balance due</span>
              <input type="datetime-local" value={balanceDueAt} onChange={(e) => setBalanceDueAt(e.target.value)} />
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
                    <option value="balance">Balance</option>
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
                    type="datetime-local"
                    value={draft.due_at}
                    onChange={(e) =>
                      setPaymentDrafts((prev) => ({ ...prev, [payment.id]: { ...draft, due_at: e.target.value } }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Paid at</span>
                  <input
                    type="datetime-local"
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
                <option value="balance">Balance</option>
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
                type="datetime-local"
                value={newPayment.due_at}
                onChange={(e) => setNewPayment((prev) => ({ ...prev, due_at: e.target.value }))}
              />
            </label>
            <label className="form-field">
              <span>Paid at</span>
              <input
                type="datetime-local"
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
