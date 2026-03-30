import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createPublicRegistration,
  getPublicRegistrationEvent,
  PublicRegistrationEvent,
  PublicRegistrationPayload,
  Registration
} from '../api/registrations';
import { formatEventLocal } from '../utils/eventDate';

type PublicRegistrationFormState = {
  full_name: string;
  email: string;
  phone: string;
  experience_level: string;
  emergency_contact: string;
  whatsapp: string;
  instagram: string;
  citizenship: string;
  date_of_birth: string;
  jumper: boolean;
  years_in_sport: string;
  jump_count: string;
  recent_jump_count: string;
  license: string;
};

const initialFormState: PublicRegistrationFormState = {
  full_name: '',
  email: '',
  phone: '',
  experience_level: '',
  emergency_contact: '',
  whatsapp: '',
  instagram: '',
  citizenship: '',
  date_of_birth: '',
  jumper: true,
  years_in_sport: '',
  jump_count: '',
  recent_jump_count: '',
  license: ''
};

const parseOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatMoney = (amount?: string | null, currency?: string | null) => {
  const numeric = Number(amount ?? '');
  if (!Number.isFinite(numeric)) return '';
  return `${numeric.toFixed(2)} ${(currency || 'EUR').trim().toUpperCase() || 'EUR'}`;
};

const PublicEventRegistrationPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicRegistrationEvent | null>(null);
  const [form, setForm] = useState<PublicRegistrationFormState>(initialFormState);
  const [submittedRegistration, setSubmittedRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!slug) {
        setError('Registration link is missing');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const nextEvent = await getPublicRegistrationEvent(slug);
        if (cancelled) return;
        setEvent(nextEvent);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load registration page');
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
  }, [slug]);

  const totalAmount = useMemo(() => {
    if (!event) return '';
    const deposit = Number(event.deposit_amount ?? '');
    const balance = Number(event.balance_amount ?? '');
    if (!Number.isFinite(deposit) && !Number.isFinite(balance)) return '';
    const total = (Number.isFinite(deposit) ? deposit : 0) + (Number.isFinite(balance) ? balance : 0);
    return `${total.toFixed(2)} ${(event.currency || 'EUR').trim().toUpperCase() || 'EUR'}`;
  }, [event]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!slug) {
      setError('Registration link is missing');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: PublicRegistrationPayload = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        experience_level: form.experience_level.trim(),
        emergency_contact: form.emergency_contact.trim(),
        whatsapp: form.whatsapp.trim(),
        instagram: form.instagram.trim(),
        citizenship: form.citizenship.trim(),
        date_of_birth: form.date_of_birth,
        jumper: form.jumper,
        years_in_sport: parseOptionalNumber(form.years_in_sport),
        jump_count: parseOptionalNumber(form.jump_count),
        recent_jump_count: parseOptionalNumber(form.recent_jump_count),
        license: form.license.trim()
      };
      const created = await createPublicRegistration(slug, payload);
      setSubmittedRegistration(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit registration');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="public-registration-page">
        <section className="card public-registration-card">
          <p>Loading registration page…</p>
        </section>
      </main>
    );
  }

  if (error && !event && !submittedRegistration) {
    return (
      <main className="public-registration-page">
        <section className="card public-registration-card stack">
          <h1>Registration unavailable</h1>
          <p>{error}</p>
          <Link className="button-link" to="/login">
            Staff login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="public-registration-page">
      <section className="card public-registration-card stack">
        {event && (
          <>
            <header className="stack">
              <span className="public-registration-eyebrow">Innhopp Central</span>
              <div>
                <h1>{event.name}</h1>
                <p className="public-registration-subtitle">
                  {event.location ? `${event.location} · ` : ''}
                  {formatEventLocal(event.starts_at, { dateStyle: 'full', timeStyle: 'short' })}
                </p>
              </div>
            </header>

            <div className="public-registration-summary-grid">
              <article className="public-registration-summary-item">
                <span>Deposit</span>
                <strong>{formatMoney(event.deposit_amount, event.currency) || 'TBD'}</strong>
              </article>
              <article className="public-registration-summary-item">
                <span>Balance</span>
                <strong>{formatMoney(event.balance_amount, event.currency) || 'TBD'}</strong>
              </article>
              <article className="public-registration-summary-item">
                <span>Total</span>
                <strong>{totalAmount || 'TBD'}</strong>
              </article>
              <article className="public-registration-summary-item">
                <span>Balance deadline</span>
                <strong>
                  {event.balance_deadline
                    ? formatEventLocal(event.balance_deadline, { dateStyle: 'medium', timeStyle: 'short' })
                    : 'TBD'}
                </strong>
              </article>
            </div>

            {!event.registration_available && !submittedRegistration && (
              <p className="form-error">{event.registration_unavailable_reason || 'Registration is currently unavailable'}</p>
            )}
          </>
        )}

        {submittedRegistration ? (
          <section className="stack">
            <h2>Registration received</h2>
            <p>
              Thanks, {submittedRegistration.participant_name || form.full_name}. Your registration is now in
              <strong> {submittedRegistration.status.replace(/_/g, ' ')}</strong>.
            </p>
            <p>
              We’ve created your event registration and payment placeholders. The team can now follow up on deposit
              and balance deadlines from inside Innhopp Central.
            </p>
          </section>
        ) : (
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-grid public-registration-form-grid">
              <label className="form-field">
                <span>Full name</span>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  required
                />
              </label>

              <label className="form-field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </label>

              <label className="form-field">
                <span>Phone</span>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Emergency contact</span>
                <input
                  type="text"
                  value={form.emergency_contact}
                  onChange={(e) => setForm((prev) => ({ ...prev, emergency_contact: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Experience level</span>
                <input
                  type="text"
                  value={form.experience_level}
                  onChange={(e) => setForm((prev) => ({ ...prev, experience_level: e.target.value }))}
                  placeholder="Beginner, intermediate, advanced…"
                />
              </label>

              <label className="form-field">
                <span>WhatsApp</span>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Instagram</span>
                <input
                  type="text"
                  value={form.instagram}
                  onChange={(e) => setForm((prev) => ({ ...prev, instagram: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Citizenship</span>
                <input
                  type="text"
                  value={form.citizenship}
                  onChange={(e) => setForm((prev) => ({ ...prev, citizenship: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Date of birth</span>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Years in sport</span>
                <input
                  type="number"
                  min={0}
                  value={form.years_in_sport}
                  onChange={(e) => setForm((prev) => ({ ...prev, years_in_sport: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Jump count</span>
                <input
                  type="number"
                  min={0}
                  value={form.jump_count}
                  onChange={(e) => setForm((prev) => ({ ...prev, jump_count: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Recent jump count</span>
                <input
                  type="number"
                  min={0}
                  value={form.recent_jump_count}
                  onChange={(e) => setForm((prev) => ({ ...prev, recent_jump_count: e.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>License</span>
                <input
                  type="text"
                  value={form.license}
                  onChange={(e) => setForm((prev) => ({ ...prev, license: e.target.value }))}
                />
              </label>

              <label className="form-field public-registration-checkbox-field">
                <span className="registration-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.jumper}
                    onChange={(e) => setForm((prev) => ({ ...prev, jumper: e.target.checked }))}
                  />
                  <span className="registration-checkbox-label">I am registering as a jumper</span>
                </span>
              </label>
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="detail-actions">
              <button type="submit" className="primary" disabled={!event?.registration_available || submitting}>
                {submitting ? 'Submitting…' : 'Submit registration'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
};

export default PublicEventRegistrationPage;
