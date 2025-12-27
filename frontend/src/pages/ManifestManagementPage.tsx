import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createManifest, listEvents, listManifests, Manifest } from '../api/events';
import { ParticipantProfile, listParticipantProfiles } from '../api/participants';

type EventLite = {
  id: number;
  name: string;
};

const ManifestManagementPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialEventId = searchParams.get('eventId') ?? '';
  const [events, setEvents] = useState<EventLite[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<ParticipantProfile[]>([]);
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
        const [eventResponse, manifestResponse, participantResponse] = await Promise.all([
          listEvents(),
          listManifests(),
          listParticipantProfiles()
        ]);
        if (cancelled) return;
        const eventList = Array.isArray(eventResponse)
          ? eventResponse.map((e) => ({ id: e.id, name: e.name }))
          : [];
        setEvents(eventList);
        setManifests(Array.isArray(manifestResponse) ? manifestResponse : []);
        setParticipantProfiles(Array.isArray(participantResponse) ? participantResponse : []);
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

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === Number(selectedEventId)),
    [events, selectedEventId]
  );

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
        </div>
        {selectedEventId && (
          <button type="button" className="ghost" onClick={() => navigate(`/events/${selectedEventId}`)}>
            Back to event{selectedEvent ? `: ${selectedEvent.name}` : ''}
          </button>
        )}
      </header>

      <article className="card">
        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <label className="form-field">
            <span>Event</span>
            <select
              value={selectedEventId}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedEventId(next);
                if (next) {
                  setSearchParams({ eventId: next });
                } else {
                  setSearchParams({});
                }
              }}
            >
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
                {filteredManifests.map((manifest) => {
                  const ids = Array.isArray(manifest.participant_ids) ? manifest.participant_ids : [];
                  const staffCount = ids.reduce((acc, id) => {
                    const profile = participantProfiles.find((p) => p.id === id);
                    const roles = profile?.roles || [];
                    return roles.includes('Staff') ? acc + 1 : acc;
                  }, 0);
                  const nonStaff = ids.length - staffCount;
                  const isFull = manifest.capacity != null && manifest.capacity > 0 ? ids.length >= manifest.capacity : false;
                  return (
                    <Link
                      key={manifest.id}
                      to={`/manifests/${manifest.id}?eventId=${selectedEventId}`}
                      className="card-link"
                      style={{ textDecoration: 'none' }}
                    >
                      <article className="card">
                        <header className="card-header">
                          <div>
                            <h3>Load {manifest.load_number}</h3>
                            <p className="muted" style={{ marginBottom: 0 }}>
                              Capacity: {manifest.capacity ?? 'Not set'} • Participants: {nonStaff} • Staff: {staffCount}
                            </p>
                            {manifest.notes && <p className="muted" style={{ margin: 0 }}>Notes: {manifest.notes}</p>}
                          </div>
                          {isFull ? <span className="badge danger">FULL</span> : <span className="badge success">Slots Available</span>}
                        </header>
                      </article>
                    </Link>
                  );
                })}
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
