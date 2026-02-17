import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Airfield,
  CreateAirfieldPayload,
  deleteAirfield,
  getAirfield,
  updateAirfield
} from '../api/airfields';
import { metersToFeet } from '../utils/units';
import { formatMetersWithFeet } from '../utils/units';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';

const AirfieldDetailPage = () => {
  const { airfieldId } = useParams();
  const navigate = useNavigate();
  const [airfield, setAirfield] = useState<Airfield | null>(null);
  const [form, setForm] = useState<CreateAirfieldPayload>({
    name: '',
    elevation: 0,
    coordinates: '',
    description: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missingName = !form.name.trim();
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!airfieldId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getAirfield(Number(airfieldId));
        if (cancelled) return;
        setAirfield(data);
        setForm({
          name: data.name,
          elevation: data.elevation,
          coordinates: data.coordinates,
          description: data.description || ''
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load airfield');
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
  }, [airfieldId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!airfieldId) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload: CreateAirfieldPayload = {
        name: form.name.trim(),
        elevation: Number(form.elevation) || 0,
        coordinates: form.coordinates.trim(),
        description: form.description?.trim() || undefined
      };
      const updated = await updateAirfield(Number(airfieldId), payload);
      setAirfield(updated);
      setForm({
        name: updated.name,
        elevation: updated.elevation,
        coordinates: updated.coordinates,
        description: updated.description || ''
      });
      setMessage('Airfield updated');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update airfield');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!airfieldId || deleting) return;
    if (!window.confirm('Are you sure you want to delete this airfield?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteAirfield(Number(airfieldId));
      navigate(-1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete airfield');
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="muted">Loading airfield…</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!airfield) {
    return <p className="error-text">Airfield not found.</p>;
  }

  const elevationFeet = Number.isFinite(form.elevation) ? metersToFeet(form.elevation) : null;

  return (
    <section {...editGuardProps}>
      <header className="page-header">
        <div>
          <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
            <h2>{airfield.name}</h2>
          </DetailPageLockTitle>
        </div>
        <div className="card-actions">
          <button
            className="ghost"
            type="button"
            onClick={(event) => {
              if (locked) {
                showLockedNoticeAtEvent(event);
                return;
              }
              navigate('/airfields/new', {
                state: {
                  copyAirfield: {
                    name: airfield.name,
                    elevation: airfield.elevation,
                    coordinates: airfield.coordinates,
                    description: airfield.description
                  }
                }
              });
            }}
          >
            Make a copy
          </button>
          <button className="ghost" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
          <button
            className="ghost danger"
            type="button"
            onClick={(event) => {
              if (locked) {
                showLockedNoticeAtEvent(event);
                return;
              }
              handleDelete();
            }}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete airfield'}
          </button>
        </div>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className={`form-field ${missingName ? 'field-missing' : ''}`}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min={0}
                step={1}
                value={form.elevation}
                onChange={(e) => setForm((prev) => ({ ...prev, elevation: Number(e.target.value) }))}
                required
              />
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                {elevationFeet !== null ? `${elevationFeet} ft` : '— ft'}
              </span>
            </div>
          </label>
          <label className="form-field">
            <span>Coordinates</span>
            <div className="input-with-button">
              <input
                type="text"
                value={form.coordinates}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    coordinates: e.target.value
                  }))
                }
                placeholder="Lat, Long"
                required
                style={{ minWidth: '22ch' }}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (!form.coordinates.trim()) return;
                  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.coordinates)}`, '_blank');
                }}
              >
                Open in Maps
              </button>
            </div>
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
      {lockNotice}
    </section>
  );
};

export default AirfieldDetailPage;
