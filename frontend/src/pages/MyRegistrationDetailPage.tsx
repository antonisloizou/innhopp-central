import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMyRegistration, Registration } from '../api/registrations';
import { formatEventLocal, formatEventLocalDate } from '../utils/eventDate';

const titleCase = (value: string) => value.split('_').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(' ');

const MyRegistrationDetailPage = () => {
  const { registrationId } = useParams();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!registrationId) return;
    setLoading(true);
    setError(null);
    try {
      setRegistration(await getMyRegistration(Number(registrationId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load registration');
    } finally {
      setLoading(false);
    }
  }, [registrationId]);

  useEffect(() => { void load(); }, [load]);

  const payments = useMemo(() => registration?.payments || [], [registration]);
  if (loading) return <p className="muted">Loading registration…</p>;
  if (error || !registration) return <p className="error-text">{error || 'Registration not found.'}</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>{registration.event_name || `Event #${registration.event_id}`}</h2>
          <p className="muted">Your registration</p>
        </div>
        <Link className="button-link ghost" to="/profile">Back to profile</Link>
      </header>

      <section className="registration-detail-header-grid">
        <article className="card registration-detail-summary-card">
          <div className="registration-detail-summary-meta"><strong>Status</strong><span>{titleCase(registration.status)}</span></div>
          <div className="registration-detail-summary-meta"><strong>Registered</strong><span>{formatEventLocal(registration.registered_at, { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
        </article>
        <article className="card registration-detail-summary-card">
          <div className="registration-detail-summary-meta"><strong>Deposit due</strong><span>{registration.deposit_due_at ? formatEventLocalDate(registration.deposit_due_at) : '—'}</span></div>
          <div className="registration-detail-summary-meta"><strong>Main invoice due</strong><span>{registration.main_invoice_due_at ? formatEventLocalDate(registration.main_invoice_due_at) : '—'}</span></div>
        </article>
      </section>

      <article className="card stack">
        <h3>Payments</h3>
        {payments.length === 0 ? <p className="muted">No payment records yet.</p> : payments.map((payment) => (
          <div key={payment.id} className="registration-payment-card">
            <div className="registration-payment-card-header">
              <strong>{titleCase(payment.kind)}</strong>
              <span className="badge neutral">{titleCase(payment.status)}</span>
            </div>
            <dl className="card-details">
              <div><dt>Amount</dt><dd>{payment.amount} {payment.currency}</dd></div>
              <div><dt>Due</dt><dd>{payment.due_at ? formatEventLocalDate(payment.due_at) : '—'}</dd></div>
              <div><dt>Paid</dt><dd>{payment.paid_at ? formatEventLocalDate(payment.paid_at) : '—'}</dd></div>
            </dl>
            {payment.status === 'pending' && payment.provider_ref ? <a className="button-link primary" href={payment.provider_ref} target="_blank" rel="noreferrer">Open payment link</a> : null}
          </div>
        ))}
      </article>
    </section>
  );
};

export default MyRegistrationDetailPage;
