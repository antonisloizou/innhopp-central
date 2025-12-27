import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getEventVehicle,
  updateEventVehicle,
  deleteEventVehicle,
  EventVehicle,
  CreateEventVehiclePayload
} from '../api/logistics';
import { Event, listEvents } from '../api/events';

const VehicleDetailPage = () => {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const transportId = searchParams.get('transportId');
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!vehicleId) return;
      setLoading(true);
      setMessage(null);
      try {
        const [vehicle, eventList] = await Promise.all([
          getEventVehicle(Number(vehicleId)),
          listEvents()
        ]);
        if (cancelled) return;
        setEvents(Array.isArray(eventList) ? eventList : []);
        setForm({
          event_id: String(vehicle.event_id),
          name: vehicle.name,
          driver: vehicle.driver || '',
          passenger_capacity: String(vehicle.passenger_capacity),
          notes: vehicle.notes || ''
        });
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Failed to load vehicle');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

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
      setMessage('Vehicle updated');
      setForm({
        event_id: String(payload.event_id),
        name: payload.name,
        driver: payload.driver || '',
        passenger_capacity: String(payload.passenger_capacity),
        notes: payload.notes || ''
      });
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
    <section>
      <header className="page-header">
        <div>
          <h2>Vehicle details</h2>
          <p>Edit vehicle information and assignment.</p>
        </div>
        <div className="card-actions">
          <button className="ghost danger" type="button" onClick={handleDelete}>
            Delete vehicle
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => navigate(transportId ? `/logistics/${transportId}` : '/logistics')}
          >
            {transportId ? 'Back to route' : 'Back to logistics'}
          </button>
        </div>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Event</span>
            <select
              value={form.event_id}
              onChange={(e) => setForm((prev) => ({ ...prev, event_id: e.target.value }))}
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
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Driver</span>
            <input
              type="text"
              value={form.driver}
              onChange={(e) => setForm((prev) => ({ ...prev, driver: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Passenger capacity</span>
            <input
              type="number"
              min={0}
              value={form.passenger_capacity}
              onChange={(e) => setForm((prev) => ({ ...prev, passenger_capacity: e.target.value }))}
              required
            />
          </label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
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
    </section>
  );
};

export default VehicleDetailPage;
