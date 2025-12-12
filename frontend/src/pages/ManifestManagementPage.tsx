import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createManifest, listEvents, listManifests, Manifest } from '../api/events';

type EventLite = {
  id: number;
  name: string;
};

const ManifestManagementPage = () => {
  const [events, setEvents] = useState<EventLite[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    load_number: '',
    notes: '',
    capacity: ''
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [eventResponse, manifestResponse] = await Promise.all([listEvents(), listManifests()]);
        if (cancelled) return;
        const eventList = Array.isArray(eventResponse)
          ? eventResponse.map((e) => ({ id: e.id, name: e.name }))
          : [];
        setEvents(eventList);
        setManifests(Array.isArray(manifestResponse) ? manifestResponse : []);
        if (!selectedEventId && eventList.length > 0) {
          setSelectedEventId(String(eventList[0].id));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load manifests');
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
  }, []);

  const filteredManifests = useMemo(() => {
    const eventId = Number(selectedEventId);
    if (!eventId) {
      return [];
    }
    return manifests
      .filter((m) => m.event_id === eventId)
      .sort((a, b) => a.load_number - b.load_number);
  }, [manifests, selectedEventId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const eventId = Number(selectedEventId);
    if (!eventId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const payload = {
        event_id: eventId,
        load_number: Number(form.load_number),
        notes: form.notes.trim() || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined
      };
      const created = await createManifest(payload);
      setManifests((prev) => [...prev, created].sort((a, b) => a.load_number - b.load_number));
      setForm({ load_number: '', notes: '', capacity: '' });
      setShowForm(false);
      setMessage('Manifest added');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create manifest');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Manifest</h2>
          <p>Select an event to view and add manifests.</p>
        </div>
      </header>

      <article className="card">
        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <label className="form-field">
            <span>Event</span>
            <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
              <option value="">Select an event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <p className="muted">Loading manifests…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : !selectedEventId ? (
          <p className="muted">Choose an event to see its manifests.</p>
        ) : (
          <>
            {filteredManifests.length === 0 ? (
              <p className="muted">No manifests for this event yet.</p>
            ) : (
              <div className="stack">
                {filteredManifests.map((manifest) => (
                  <article key={manifest.id} className="card">
                    <header className="card-header">
                      <div>
                        <h3>Load {manifest.load_number}</h3>
                      </div>
                      <span className="badge neutral">Slots Available</span>
                    </header>
                    {manifest.notes && <p className="muted">Notes: {manifest.notes}</p>}
                  </article>
                ))}
              </div>
            )}
            <hr />
            {!showForm && (
              <div className="form-actions">
                <button type="button" className="ghost" onClick={() => setShowForm(true)}>
                  Add manifest
                </button>
              </div>
            )}
            {showForm && (
              <form className="form-grid" onSubmit={handleSubmit}>
                <label className="form-field">
                  <span>Load number</span>
                  <input
                    type="number"
                    min={1}
                    value={form.load_number}
                    onChange={(e) => setForm((prev) => ({ ...prev, load_number: e.target.value }))}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Capacity</span>
                  <input
                    type="number"
                    min={0}
                    value={form.capacity}
                    onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
                    placeholder="Slots available"
                  />
                </label>
                <label className="form-field">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="primary" disabled={submitting || !selectedEventId}>
                    {submitting ? 'Saving…' : 'Add manifest'}
                  </button>
                  <button type="button" className="ghost" onClick={() => setShowForm(false)} disabled={submitting}>
                    Cancel
                  </button>
                  {message && <span className="muted">{message}</span>}
                </div>
              </form>
            )}
          </>
        )}
      </article>
    </section>
  );
};

export default ManifestManagementPage;
