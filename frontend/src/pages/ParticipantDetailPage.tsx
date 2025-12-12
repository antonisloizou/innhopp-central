import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  getParticipantProfile,
  updateParticipantProfile
} from '../api/participants';

const ParticipantDetailPage = () => {
  const { participantId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [form, setForm] = useState<CreateParticipantPayload>({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: ''
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        setForm({
          full_name: data.full_name,
          email: data.email,
          phone: data.phone || '',
          experience_level: data.experience_level || '',
          emergency_contact: data.emergency_contact || ''
        });
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
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateParticipantProfile(Number(participantId), {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        experience_level: form.experience_level?.trim() || undefined,
        emergency_contact: form.emergency_contact?.trim() || undefined
      });
      setProfile(updated);
      setMessage('Participant updated');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update participant');
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
    <section>
      <header className="page-header">
        <div>
          <h2>{profile.full_name}</h2>
          <p className="muted">{profile.email}</p>
        </div>
        <button className="ghost" type="button" onClick={() => navigate('/participants')}>
          Back to participants
        </button>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
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
              placeholder="Optional"
            />
          </label>
          <label className="form-field">
            <span>Experience level</span>
            <input
              type="text"
              value={form.experience_level}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, experience_level: e.target.value }))
              }
              placeholder="Optional"
            />
          </label>
          <label className="form-field">
            <span>Emergency contact</span>
            <input
              type="text"
              value={form.emergency_contact}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, emergency_contact: e.target.value }))
              }
              placeholder="Optional"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save participant'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default ParticipantDetailPage;
