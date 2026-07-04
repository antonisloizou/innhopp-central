import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getEventVehicle,
  updateEventVehicle,
  deleteEventVehicle,
  EventVehicle,
  CreateEventVehiclePayload
} from '../api/logistics';
import { Event, listEvents } from '../api/events';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';
import { useResourceStream } from '../hooks/useResourceStream';

const VehicleDetailPage = () => {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const transportId = searchParams.get('transportId');
  const groundCrewId = searchParams.get('groundCrewId');
  const [form, setForm] = useState({
    event_id: '',
    name: '',
    driver: '',
    passenger_capacity: '',
    notes: ''
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingLiveRefresh, setPendingLiveRefresh] = useState(false);
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    setMessage(null);
    try {
      const [vehicle, eventList] = await Promise.all([
        getEventVehicle(Number(vehicleId)),
        listEvents()
      ]);
      setEvents(Array.isArray(eventList) ? eventList : []);
      setForm({
        event_id: String(vehicle.event_id),
        name: vehicle.name,
        driver: vehicle.driver || '',
        passenger_capacity: String(vehicle.passenger_capacity),
        notes: vehicle.notes || ''
      });
      setIsDirty(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasPendingLocalChanges = isDirty || submitting;

  useResourceStream({
    path: '/logistics/stream',
    onMessage: () => {
      if (hasPendingLocalChanges) {
        setPendingLiveRefresh(true);
        return;
      }
      void load();
    }
  });

  useEffect(() => {
    if (!pendingLiveRefresh || hasPendingLocalChanges) return;
    setPendingLiveRefresh(false);
    void load();
  }, [hasPendingLocalChanges, load, pendingLiveRefresh]);

  const handleReloadLatest = () => {
    setPendingLiveRefresh(false);
    void load();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vehicleId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const payload: EventVehicle = await updateEventVehicle(Number(vehicleId), {
        event_id: Number(form.event_id),
        name: form.name.trim(),
        driver: form.driver.trim() || undefined,
        passenger_capacity: Number(form.passenger_capacity) || 0,
        notes: form.notes.trim() || undefined
      } as CreateEventVehiclePayload);
      setForm({
        event_id: String(payload.event_id),
        name: payload.name,
        driver: payload.driver || '',
        passenger_capacity: String(payload.passenger_capacity),
        notes: payload.notes || ''
      });
      setIsDirty(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!vehicleId) return;
    if (!window.confirm('Are you sure you want to delete this vehicle?')) return;
    try {
      await deleteEventVehicle(Number(vehicleId));
      if (transportId) {
        navigate(`/logistics/${transportId}`);
      } else if (groundCrewId) {
        navigate(`/logistics/ground-crew/${groundCrewId}`);
      } else {
        navigate('/logistics');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete vehicle');
    }
  };

  if (loading) {
    return <p className="muted">Loading vehicle…</p>;
  }

  return (
    <section {...editGuardProps}>
      <header className="page-header">
        <div>
          <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
            <h2>Vehicle details</h2>
          </DetailPageLockTitle>
          <p>Edit vehicle information and assignment.</p>
        </div>
        <div className="card-actions">
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
            Delete vehicle
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() =>
              navigate(
                transportId
                  ? `/logistics/${transportId}`
                  : groundCrewId
                    ? `/logistics/ground-crew/${groundCrewId}`
                    : '/logistics'
              )
            }
          >
            {transportId ? 'Back to route' : groundCrewId ? 'Back to ground crew' : 'Back to logistics'}
          </button>
        </div>
      </header>

      {pendingLiveRefresh ? (
        <div className="card">
          <div className="event-live-refresh-banner">
            <p className="muted">New changes are available and will load after your current edits finish.</p>
            <button className="button-link secondary" type="button" onClick={handleReloadLatest}>
              Reload now
            </button>
          </div>
        </div>
      ) : null}

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Event</span>
            <select
              value={form.event_id}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, event_id: e.target.value }));
              }}
              required
            >
              <option value="">Select event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, name: e.target.value }));
              }}
              required
            />
          </label>
          <label className="form-field">
            <span>Driver</span>
            <input
              type="text"
              value={form.driver}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, driver: e.target.value }));
              }}
            />
          </label>
          <label className="form-field">
            <span>Passenger capacity</span>
            <input
              type="number"
              min={0}
              value={form.passenger_capacity}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, passenger_capacity: e.target.value }));
              }}
              required
            />
          </label>
          <label className="form-field form-field-full-span">
            <span>Notes</span>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => {
                setIsDirty(true);
                setForm((prev) => ({ ...prev, notes: e.target.value }));
              }}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save vehicle'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>
      {lockNotice}
    </section>
  );
};

export default VehicleDetailPage;
