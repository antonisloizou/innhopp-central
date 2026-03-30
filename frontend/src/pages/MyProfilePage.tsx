import { FormEvent, useEffect, useState } from 'react';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  getMyParticipantProfile,
  updateParticipantProfile,
  upsertMyParticipantProfile
} from '../api/participants';
import ParticipantProfileForm, {
  createParticipantFormState,
  toParticipantPayload
} from '../components/ParticipantProfileForm';
import { useAuth } from '../auth/AuthProvider';

const MyProfilePage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
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
        const nextProfile = await getMyParticipantProfile();
        if (!cancelled) {
          setProfile(nextProfile);
          setForm(createParticipantFormState(nextProfile));
          setSaved(false);
        }
      } catch (err) {
        if (!cancelled) {
          const status = (err as Error & { status?: number })?.status;
          if (status === 404) {
            setProfile(null);
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

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>My profile</h2>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
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
