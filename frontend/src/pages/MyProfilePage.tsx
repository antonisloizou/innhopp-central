import { useEffect, useState } from 'react';
import { getMyParticipantProfile, ParticipantProfile } from '../api/participants';
import { useAuth } from '../auth/AuthProvider';

const formatAccountRole = (role: string) =>
  role
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const MyProfilePage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextProfile = await getMyParticipantProfile();
        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch (err) {
        if (!cancelled) {
          const status = (err as Error & { status?: number })?.status;
          if (status === 404) {
            setProfile(null);
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
  }, []);

  if (loading) {
    return <p className="muted">Loading profile…</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>My profile</h2>
          <p className="muted">Your account details and participant profile.</p>
        </div>
      </header>

      <article className="card">
        <div className="form-grid">
          <div className="form-field">
            <span>Account name</span>
            <strong>{user?.full_name || 'Not available'}</strong>
          </div>
          <div className="form-field">
            <span>Account email</span>
            <strong>{user?.email || 'Not available'}</strong>
          </div>
          <div className="form-field">
            <span>Roles</span>
            <strong>{user?.roles?.length ? user.roles.map(formatAccountRole).join(', ') : 'No roles assigned'}</strong>
          </div>
        </div>
      </article>

      <article className="card">
        <header className="page-header">
          <div>
            <h3>Participant profile</h3>
            <p className="muted">Matched automatically by your login email.</p>
          </div>
        </header>

        {profile ? (
          <div className="form-grid">
            <div className="form-field">
              <span>Full name</span>
              <strong>{profile.full_name}</strong>
            </div>
            <div className="form-field">
              <span>Email</span>
              <strong>{profile.email}</strong>
            </div>
            <div className="form-field">
              <span>Phone</span>
              <strong>{profile.phone || 'Not provided'}</strong>
            </div>
            <div className="form-field">
              <span>Experience level</span>
              <strong>{profile.experience_level || 'Not provided'}</strong>
            </div>
            <div className="form-field">
              <span>Emergency contact</span>
              <strong>{profile.emergency_contact || 'Not provided'}</strong>
            </div>
            <div className="form-field">
              <span>Participant roles</span>
              <strong>{profile.roles.length ? profile.roles.join(', ') : 'Participant'}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">
            No participant profile is linked to <strong>{user?.email || 'your account'}</strong> yet.
          </p>
        )}
      </article>
    </section>
  );
};

export default MyProfilePage;
