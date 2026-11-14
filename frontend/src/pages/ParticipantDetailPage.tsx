import { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  assignParticipantEmailAlias,
  getParticipantProfile,
  listParticipantProfiles,
  updateParticipantProfile,
  deleteParticipantProfile
} from '../api/participants';
import ParticipantProfileForm, {
  createParticipantFormState,
  toParticipantPayload
} from '../components/ParticipantProfileForm';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';
import ParticipantEventsCard from '../components/ParticipantEventsCard';

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
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [emailSearch, setEmailSearch] = useState('');
  const [emailCandidates, setEmailCandidates] = useState<ParticipantProfile[]>([]);
  const [selectedEmailProfile, setSelectedEmailProfile] = useState<ParticipantProfile | null>(null);
  const [loadingEmailCandidates, setLoadingEmailCandidates] = useState(false);
  const [assigningEmail, setAssigningEmail] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [aliasSaved, setAliasSaved] = useState(false);
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();
  const { impersonateParticipant, user } = useAuth();
  const canManageAccountRoles = user?.roles?.includes('admin') ?? false;

  const canImpersonate =
    (user?.roles?.includes('admin') ?? false) &&
    !user?.impersonator &&
    profile?.email !== user?.email;

  const openEmailPicker = async () => {
    if (locked) return;
    setShowEmailPicker(true);
    setEmailSearch('');
    setSelectedEmailProfile(null);
    setAliasError(null);
    setLoadingEmailCandidates(true);
    try {
      const candidates = await listParticipantProfiles();
      const currentEmail = profile?.email.trim().toLowerCase();
      setEmailCandidates(
        candidates.filter(
          (candidate) =>
            candidate.id !== profile?.id && candidate.email.trim().toLowerCase() !== currentEmail
        )
      );
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Failed to load participant emails');
    } finally {
      setLoadingEmailCandidates(false);
    }
  };

  const filteredEmailCandidates = emailCandidates.filter((candidate) => {
    const search = emailSearch.trim().toLowerCase();
    return !search || candidate.full_name.toLowerCase().includes(search) || candidate.email.toLowerCase().includes(search);
  });

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
          <button
            className="primary"
            type="button"
            onClick={(event) => {
              if (locked) {
                showLockedNoticeAtEvent(event);
                return;
              }
              void openEmailPicker();
            }}
          >
            Assign other email
          </button>
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

      {aliasSaved && <p className="success-text">Profiles merged. The other email and all participant history now belong here.</p>}

      <ParticipantEventsCard
        participantId={profile.id}
        participantName={profile.full_name}
        registrationAccess="staff"
        onGoToEvent={(eventId) => navigate(`/events/${eventId}`)}
      />
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
      {showEmailPicker && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="participant-email-picker-backdrop"
              role="presentation"
              onClick={() => !assigningEmail && setShowEmailPicker(false)}
            >
              <form
                className="card participant-email-picker-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="participant-email-picker-title"
                onClick={(event) => event.stopPropagation()}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!selectedEmailProfile) return;
                  try {
                    setAssigningEmail(true);
                    setAliasError(null);
                    setAliasSaved(false);
                    const updated = await assignParticipantEmailAlias(profile.id, selectedEmailProfile.email);
                    setProfile(updated);
                    setAliasSaved(true);
                    setShowEmailPicker(false);
                  } catch (err) {
                    setAliasError(err instanceof Error ? err.message : 'Failed to assign old email');
                  } finally {
                    setAssigningEmail(false);
                  }
                }}
              >
                <div className="participant-email-picker-heading">
                  <div>
                    <h3 id="participant-email-picker-title">Assign other email</h3>
                    <p className="muted">Select a duplicate profile to merge into {profile.email}.</p>
                  </div>
                  <button className="ghost" type="button" disabled={assigningEmail} onClick={() => setShowEmailPicker(false)}>
                    Close
                  </button>
                </div>
                <label className="form-field participant-email-picker-search">
                  <span>Search by name or email</span>
                  <input
                    autoFocus
                    type="search"
                    value={emailSearch}
                    placeholder="Start typing…"
                    onChange={(event) => {
                      setEmailSearch(event.target.value);
                      setSelectedEmailProfile(null);
                    }}
                  />
                </label>
                <div className="participant-email-picker-results">
                  {loadingEmailCandidates && <p className="muted">Loading emails…</p>}
                  {!loadingEmailCandidates && filteredEmailCandidates.length === 0 && (
                    <p className="muted">No matching participant emails.</p>
                  )}
                  {filteredEmailCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      className={`participant-email-picker-option${selectedEmailProfile?.id === candidate.id ? ' selected' : ''}`}
                      type="button"
                      onClick={() => setSelectedEmailProfile(candidate)}
                    >
                      <strong>{candidate.full_name}</strong>
                      <span>{candidate.email}</span>
                    </button>
                  ))}
                </div>
                {selectedEmailProfile && (
                  <p className="muted">
                    <strong>{selectedEmailProfile.email}</strong> and its registrations, assignments, and check-in history will move to {profile.email}. The duplicate profile will be removed.
                  </p>
                )}
                {aliasError && <p className="error-text">{aliasError}</p>}
                <div className="card-actions">
                  <button className="ghost" type="button" disabled={assigningEmail} onClick={() => setShowEmailPicker(false)}>
                    Cancel
                  </button>
                  <button className="primary" type="submit" disabled={!selectedEmailProfile || assigningEmail}>
                    {assigningEmail ? 'Assigning…' : 'Assign selected email'}
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
      {lockNotice}
    </section>
  );
};

export default ParticipantDetailPage;
