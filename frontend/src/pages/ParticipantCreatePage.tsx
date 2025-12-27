import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateParticipantPayload, createParticipantProfile } from '../api/participants';
import { roleOptions } from '../utils/roles';

const ParticipantCreatePage = () => {
  const [form, setForm] = useState<CreateParticipantPayload>({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: '',
    roles: ['Participant']
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
        emergency_contact: form.emergency_contact?.trim() || undefined,
        roles: form.roles && form.roles.length > 0 ? form.roles : ['Participant']
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
          <p>Add a new member to the Innhopp Family.</p>
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
          <div className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Roles</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {roleOptions.map((role) => {
                const checked = form.roles?.includes(role);
                return (
                  <label
                    key={role}
                    className="badge neutral"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setForm((prev) => {
                          const current = new Set(prev.roles || []);
                          if (e.target.checked) {
                            current.add(role);
                          } else {
                            current.delete(role);
                          }
                          const next = Array.from(current);
                          return { ...prev, roles: next.length > 0 ? next : ['Participant'] };
                        });
                      }}
                    />
                    {role}
                  </label>
                );
              })}
            </div>
          </div>
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
