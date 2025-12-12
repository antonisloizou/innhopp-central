import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateParticipantPayload, createParticipantProfile } from '../api/participants';

const ParticipantCreatePage = () => {
  const [form, setForm] = useState<CreateParticipantPayload>({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await createParticipantProfile({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        experience_level: form.experience_level?.trim() || undefined,
        emergency_contact: form.emergency_contact?.trim() || undefined
      });
      setMessage('Participant created');
      navigate('/participants');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create participant');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Create participant</h2>
          <p>Add a new participant to the Innhopp Family.</p>
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
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create participant'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default ParticipantCreatePage;
