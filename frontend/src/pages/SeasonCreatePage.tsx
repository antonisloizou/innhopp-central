import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateSeasonPayload, createSeason } from '../api/events';

const SeasonCreatePage = () => {
  const [form, setForm] = useState<CreateSeasonPayload>({
    name: '',
    starts_on: '',
    ends_on: ''
  });
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const payload: CreateSeasonPayload = {
        name: form.name.trim(),
        starts_on: form.starts_on
      };
      if (form.ends_on) {
        payload.ends_on = form.ends_on;
      }
      await createSeason(payload);
      setMessage('Season created');
      setForm({ name: '', starts_on: '', ends_on: '' });
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create season');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Create season</h2>
          <p>Define the operational window for upcoming innhopp activity.</p>
        </div>
        <button className="ghost" type="button" onClick={() => navigate('/events')}>
          Back to events
        </button>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Enter a name for this season"
              required
            />
          </label>
          <label className="form-field">
            <span>Starts on</span>
            <input
              type="date"
              value={form.starts_on}
              onChange={(e) => setForm((prev) => ({ ...prev, starts_on: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Ends on</span>
            <input
              type="date"
              value={form.ends_on}
              onChange={(e) => setForm((prev) => ({ ...prev, ends_on: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create season'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default SeasonCreatePage;
