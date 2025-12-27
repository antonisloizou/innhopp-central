import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateAirfieldPayload, createAirfield } from '../api/airfields';

const AirfieldCreatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const copy = (location.state as any)?.copyAirfield;
  const [form, setForm] = useState<CreateAirfieldPayload>({
    name: copy?.name || '',
    elevation: copy?.elevation ?? 0,
    coordinates: copy?.coordinates || '',
    description: copy?.description || ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: CreateAirfieldPayload = {
        name: form.name.trim(),
        elevation: Number(form.elevation) || 0,
        coordinates: form.coordinates.trim(),
        description: form.description?.trim() || undefined
      };
      await createAirfield(payload);
      setMessage('Airfield created');
      navigate(-1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create airfield');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Create airfield</h2>
        </div>
        <div className="card-actions">
          <button className="ghost" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Elevation (m)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={form.elevation}
              onChange={(e) => setForm((prev) => ({ ...prev, elevation: Number(e.target.value) }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Coordinates</span>
            <input
              type="text"
              value={form.coordinates}
              onChange={(e) => setForm((prev) => ({ ...prev, coordinates: e.target.value }))}
              placeholder="Lat, Long"
              required
            />
          </label>
          <label className="form-field">
            <span>Description</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional notes"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save airfield'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
    </section>
  );
};

export default AirfieldCreatePage;
