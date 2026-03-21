import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  getParticipantProfile,
  updateParticipantProfile,
  deleteParticipantProfile
} from '../api/participants';
import ParticipantProfileForm, {
  createParticipantFormState,
  toParticipantPayload
} from '../components/ParticipantProfileForm';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';

const ParticipantDetailPage = () => {
  const { participantId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backToParticipants = location.search ? `/participants${location.search}` : '/participants';
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [form, setForm] = useState<CreateParticipantPayload>(createParticipantFormState());
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();
  const { impersonateParticipant, user } = useAuth();
  const canManageAccountRoles = user?.roles?.includes('admin') ?? false;

  const canImpersonate =
    (user?.roles?.includes('admin') ?? false) &&
    !user?.impersonator &&
    profile?.email !== user?.email;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!participantId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getParticipantProfile(Number(participantId));
        if (cancelled) return;
        setProfile(data);
        setForm(createParticipantFormState(data));
        setSaved(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load participant');
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
  }, [participantId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!participantId) return;
    const roles = form.roles && form.roles.length > 0 ? form.roles : ['Participant'];
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateParticipantProfile(Number(participantId), {
        ...toParticipantPayload(form),
        roles
      });
      setProfile(updated);
      setForm(createParticipantFormState(updated));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update participant');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="muted">Loading participant…</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!profile) {
    return <p className="error-text">Participant not found.</p>;
  }

  return (
    <section {...editGuardProps}>
      <header className="page-header">
        <div>
          <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
            <h2>{profile.full_name}</h2>
          </DetailPageLockTitle>
          <p className="muted">{profile.email}</p>
        </div>
        <div className="card-actions">
          {canImpersonate && (
            <button
              className="primary"
              type="button"
              disabled={impersonating}
              onClick={async () => {
                if (!profile) return;
                try {
                  setImpersonating(true);
                  setError(null);
                  await impersonateParticipant(profile.id);
                  window.location.replace('/profile');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to impersonate participant');
                  setImpersonating(false);
                }
              }}
            >
              {impersonating ? 'Impersonating…' : 'Impersonate'}
            </button>
          )}
          <button
            className="ghost"
            type="button"
            onClick={() => {
              const fromEventId = (location.state as any)?.fromEventId;
              const highlightId = (location.state as any)?.highlightId;
              if (fromEventId && highlightId) {
                try {
                  sessionStorage.setItem(`event-detail-highlight:${fromEventId}`, highlightId);
                } catch {
                  // ignore storage issues
                }
              }
              navigate(-1);
            }}
          >
            Back
          </button>
          <button
            className="ghost danger"
            type="button"
            disabled={deleting}
            onClick={async (event) => {
              if (locked) {
                showLockedNoticeAtEvent(event);
                return;
              }
              if (!participantId) return;
              if (!window.confirm('Delete this participant? This cannot be undone.')) return;
              try {
                setDeleting(true);
                await deleteParticipantProfile(Number(participantId));
                navigate(-1);
              } catch (err) {
                const status = (err as any)?.status;
                if (status === 404) {
                  navigate(-1);
                  return;
                }
                setError(err instanceof Error ? err.message : 'Failed to delete participant');
                setDeleting(false);
              }
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </header>

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
        roleMode="editable"
        showAdminRoleControl={canManageAccountRoles}
        canEditAdminRole={canManageAccountRoles}
      />
      {lockNotice}
    </section>
  );
};

export default ParticipantDetailPage;
