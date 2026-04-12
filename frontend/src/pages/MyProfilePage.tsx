import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  getMyParticipantProfile,
  updateParticipantProfile,
  upsertMyParticipantProfile
} from '../api/participants';
import { claimPublicRegistration, listMyRegistrations, Registration } from '../api/registrations';
import ParticipantProfileForm, {
  createParticipantFormState,
  toParticipantPayload
} from '../components/ParticipantProfileForm';
import { useAuth } from '../auth/AuthProvider';
import { formatEventLocalDate } from '../utils/eventDate';

const PENDING_PUBLIC_REGISTRATION_KEY = 'innhopp-pending-public-registration';

const MyProfilePage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [form, setForm] = useState<CreateParticipantPayload>(
    createParticipantFormState(null, {
      full_name: user?.full_name || '',
      email: user?.email || ''
    })
  );
  const canManageAccountRoles = user?.roles?.includes('admin') ?? false;
  const hasAdminAccess = form.account_roles?.includes('admin') ?? false;
  const canUseManagedUpdate = canManageAccountRoles && !!profile?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claimingRegistration, setClaimingRegistration] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm((current) =>
      current.full_name || current.email
        ? current
        : createParticipantFormState(null, {
            full_name: user?.full_name || '',
            email: user?.email || ''
          })
    );
  }, [user?.email, user?.full_name]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextProfile, nextRegistrations] = await Promise.all([
          getMyParticipantProfile(),
          listMyRegistrations()
        ]);
        if (!cancelled) {
          setProfile(nextProfile);
          setRegistrations(nextRegistrations);
          setForm(createParticipantFormState(nextProfile));
          setSaved(false);
        }
      } catch (err) {
        if (!cancelled) {
          const status = (err as Error & { status?: number })?.status;
          if (status === 404) {
            setProfile(null);
            setRegistrations([]);
            setForm(
              createParticipantFormState(null, {
                full_name: user?.full_name || '',
                email: user?.email || ''
              })
            );
            setSaved(false);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load profile');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.full_name]);

  useEffect(() => {
    let cancelled = false;

    const maybeClaimPublicRegistration = async () => {
      if (!user || typeof window === 'undefined') return;
      const params = new URLSearchParams(location.search);
      if (!params.has('publicRegistration')) return;

      const slug = window.sessionStorage.getItem(PENDING_PUBLIC_REGISTRATION_KEY)?.trim();
      if (!slug) return;

      setClaimingRegistration(true);
      try {
        await claimPublicRegistration(slug);
        if (cancelled) return;
        window.sessionStorage.removeItem(PENDING_PUBLIC_REGISTRATION_KEY);
        const [nextProfile, nextRegistrations] = await Promise.all([
          getMyParticipantProfile(),
          listMyRegistrations()
        ]);
        if (cancelled) return;
        setProfile(nextProfile);
        setForm(createParticipantFormState(nextProfile));
        setRegistrations(nextRegistrations);
        window.dispatchEvent(new Event('participant-profile-updated'));
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to create registration';
        setError(message);
      } finally {
        if (!cancelled) {
          setClaimingRegistration(false);
        }
      }
    };

    void maybeClaimPublicRegistration();
    return () => {
      cancelled = true;
    };
  }, [location.search, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const payload = toParticipantPayload(form);
      const saved = canUseManagedUpdate
        ? await updateParticipantProfile(profile.id, payload)
        : await upsertMyParticipantProfile(payload);
      setProfile(saved);
      setForm(createParticipantFormState(saved));
      setSaved(true);
      window.dispatchEvent(new Event('participant-profile-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="muted">Loading profile…</p>;
  }

  const pendingDepositPayments = registrations.flatMap((registration) =>
    (registration.payments || [])
      .filter((payment) => payment.kind === 'deposit' && payment.status === 'pending')
      .map((payment) => ({ registration, payment }))
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>My profile</h2>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {claimingRegistration ? <p className="muted">Creating your registration…</p> : null}
      {pendingDepositPayments.length > 0 ? (
        <section className="card stack pending-payment-card-warning">
          <header className="card-header">
            <div>
              <h3>Pending deposits</h3>
            </div>
          </header>
          <div className="stack pending-payment-list">
            {pendingDepositPayments.map(({ registration, payment }) => (
              <article key={payment.id} className="pending-payment-item">
                <div>
                  <strong>{registration.event_name || `Event #${registration.event_id}`}</strong>
                  <p className="muted pending-payment-meta">
                    Deposit {payment.amount} {payment.currency}
                    {payment.due_at ? ` · Due ${formatEventLocalDate(payment.due_at)}` : ''}
                  </p>
                </div>
                {payment.provider_ref ? (
                  <a
                    className="button-link primary"
                    href={payment.provider_ref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open payment link
                  </a>
                ) : (
                  <span className="muted">Payment link pending</span>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <ParticipantProfileForm
        form={form}
        onChange={(next) => {
          setForm(next);
          setSaved(false);
          setError(null);
        }}
        onSubmit={handleSubmit}
        submitting={saving}
        saved={saved}
        error={error}
        roleMode={canUseManagedUpdate ? 'editable' : 'readonly'}
        showAdminRoleControl={canManageAccountRoles || hasAdminAccess}
        canEditAdminRole={canUseManagedUpdate}
        canSelfRemoveElevatedRoles={!canUseManagedUpdate}
      />
    </section>
  );
};

export default MyProfilePage;
