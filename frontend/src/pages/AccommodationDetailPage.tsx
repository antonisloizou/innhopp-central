import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import {
  Accommodation,
  getAccommodation,
  updateAccommodation,
  deleteAccommodation
} from '../api/events';
import { fromEventLocalPickerDate, toEventLocalPickerDate } from '../utils/eventDate';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';

const AccommodationDetailPage = () => {
  const { eventId, accommodationId } = useParams();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: '',
    capacity: '',
    coordinates: '',
    booked: false,
    check_in_at: '',
    check_out_at: '',
    notes: ''
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const saveButtonClass = `primary ${saved ? 'saved' : ''}`;
  const saveButtonLabel = submitting ? 'Saving…' : saved ? 'Saved' : 'Save';
  const missingCoordinates = !form.coordinates.trim();
  const missingName = !form.name.trim();
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId || !accommodationId) return;
      setLoading(true);
      setMessage(null);
      try {
        const acc = await getAccommodation(Number(eventId), Number(accommodationId));
        if (cancelled) return;
        setForm({
          name: acc.name,
          capacity: String(acc.capacity),
          coordinates: acc.coordinates || '',
          booked: !!acc.booked,
          check_in_at: acc.check_in_at || '',
          check_out_at: acc.check_out_at || '',
          notes: acc.notes || ''
        });
        setSaved(false);
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Failed to load accommodation');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, accommodationId]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!eventId || !accommodationId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await updateAccommodation(Number(eventId), Number(accommodationId), {
        name: form.name.trim(),
        capacity: Number(form.capacity) || 0,
        coordinates: form.coordinates.trim() || undefined,
        booked: form.booked,
        check_in_at: form.check_in_at || undefined,
        check_out_at: form.check_out_at || undefined,
        notes: form.notes.trim() || undefined
      });
      setSaved(true);
      setMessage('Accommodation updated');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update accommodation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId || !accommodationId) return;
    if (!window.confirm('Delete this accommodation?')) return;
    try {
      await deleteAccommodation(Number(eventId), Number(accommodationId));
      navigate(-1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete accommodation');
    }
  };

  if (loading) return <p className="muted">Loading accommodation…</p>;

  const markDirty = () => {
    if (saved) setSaved(false);
  };

  return (
    <section className="stack" {...editGuardProps}>
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
            <h2 style={{ margin: 0 }}>Accommodation</h2>
          </DetailPageLockTitle>
          <span className={`badge ${form.booked && !missingCoordinates ? 'success' : 'danger'}`}>
            {form.booked && !missingCoordinates ? '✓' : 'NOT BOOKED'}
          </span>
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
              navigate('/logistics/accommodations/new', {
                state: {
                  copyAccommodation: {
                    event_id: eventId,
                    name: form.name,
                    capacity: form.capacity,
                    coordinates: form.coordinates,
                    check_in_at: form.check_in_at,
                    check_out_at: form.check_out_at,
                    booked: form.booked,
                    notes: form.notes
                  }
                }
              });
            }}
          >
            Make a copy
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
          >
            Delete
          </button>
          <button className="ghost" type="button" onClick={() => navigate(-1)}>
            Back
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
              onChange={(e) => {
                markDirty();
                setForm((prev) => ({ ...prev, name: e.target.value }));
              }}
              required
            />
          </label>
          <label className="form-field">
            <span>Capacity</span>
            <input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(e) => {
                markDirty();
                setForm((prev) => ({ ...prev, capacity: e.target.value }));
              }}
            />
          </label>
          <label className={`form-field ${missingCoordinates ? 'field-missing' : ''}`}>
            <span>Coordinates (DMS)</span>
            <div className="input-with-button">
              <input
                type="text"
                value={form.coordinates}
                onChange={(e) => {
                  markDirty();
                  setForm((prev) => ({ ...prev, coordinates: e.target.value }));
                }}
              />
              <button
                type="button"
                className="ghost"
                disabled={!form.coordinates.trim()}
                onClick={() => {
                  const coords = form.coordinates.trim();
                  if (!coords) return;
                  window.open(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`,
                    '_blank'
                  );
                }}
              >
                Open in Maps
              </button>
            </div>
          </label>
          <label className="form-field">
            <span>Booked</span>
            <div className="checkbox-field">
              <input
                type="checkbox"
                checked={form.booked}
              onChange={(e) => {
                markDirty();
                setForm((prev) => ({ ...prev, booked: e.target.checked }));
              }}
            />
            <span>Mark as booked</span>
          </div>
        </label>
          <label className="form-field">
            <span>Check-in</span>
            <Flatpickr
              value={toEventLocalPickerDate(form.check_in_at)}
              options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
              onChange={(dates) => {
                const d = dates[0];
                markDirty();
                setForm((prev) => ({
                  ...prev,
                  check_in_at: d ? fromEventLocalPickerDate(d) : ''
                }));
              }}
            />
          </label>
          <label className="form-field">
            <span>Check-out</span>
            <Flatpickr
              value={toEventLocalPickerDate(form.check_out_at)}
              options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
              onChange={(dates) => {
                const d = dates[0];
                markDirty();
                setForm((prev) => ({
                  ...prev,
                  check_out_at: d ? fromEventLocalPickerDate(d) : ''
                }));
              }}
            />
          </label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => {
                markDirty();
                setForm((prev) => ({ ...prev, notes: e.target.value }));
              }}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className={saveButtonClass} disabled={submitting || saved}>
              {saveButtonLabel}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
      {lockNotice}
    </section>
  );
};

export default AccommodationDetailPage;
