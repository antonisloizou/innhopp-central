import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { copyEvent, createManifest, deleteEvent, Event, listEvents, listManifests, Manifest } from '../api/events';
import { ParticipantProfile, listParticipantProfiles } from '../api/participants';

const ManifestManagementPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialEventId = searchParams.get('eventId') ?? '';
  const [events, setEvents] = useState<Event[]>([]);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<ParticipantProfile[]>([]);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
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
        const eventList = Array.isArray(eventResponse) ? eventResponse : [];
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

  useEffect(() => {
    if (!actionMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!actionMenuRef.current || !target) return;
      if (!actionMenuRef.current.contains(target)) {
        setActionMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [actionMenuOpen]);

  const handleDelete = async () => {
    if (!selectedEvent) return;
    if (!window.confirm('Delete this event?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteEvent(selectedEvent.id);
      setSearchParams({});
      setSelectedEventId('');
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedEvent || copying) return;
    setCopying(true);
    setMessage(null);
    try {
      const cloned = await copyEvent(selectedEvent.id);
      navigate(`/events/${cloned.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to copy event');
    } finally {
      setCopying(false);
    }
  };

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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create manifest');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <div className="event-schedule-headline-text">
          <div className="event-header-top">
            <h2 className="event-detail-title">
              {selectedEvent ? `${selectedEvent.name}: Manifest` : 'Manifest'}
            </h2>
          </div>
          {selectedEvent ? <p className="event-location">{selectedEvent.location || 'Location TBD'}</p> : null}
          {selectedEvent ? (
            <div className="event-detail-header-badges">
              <span className={`badge status-${selectedEvent.status}`}>{selectedEvent.status}</span>
            </div>
          ) : null}
        </div>
        {selectedEvent ? (
          <div className="event-schedule-actions" ref={actionMenuRef}>
            <button
              className="ghost event-schedule-gear"
              type="button"
              aria-label={actionMenuOpen ? 'Close actions menu' : 'Open actions menu'}
              aria-expanded={actionMenuOpen}
              aria-controls="event-manifest-actions-menu"
              onClick={() => setActionMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.06.73 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.22 1.12-.52 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
              </svg>
            </button>
            {actionMenuOpen && (
              <div className="event-schedule-menu" id="event-manifest-actions-menu" role="menu">
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/events/${selectedEvent.id}/details`); }}>Details</button>
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/events/${selectedEvent.id}`); }}>Schedule</button>
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/events/${selectedEvent.id}/registrations`); }}>Registrations</button>
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/events/${selectedEvent.id}/comms`); }}>Communications</button>
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); handleCopy(); }} disabled={copying}>{copying ? 'Copying…' : 'Copy'}</button>
                <button className="event-schedule-menu-item danger" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); handleDelete(); }} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate('/events'); }}>Back</button>
              </div>
            )}
          </div>
        ) : null}
      </header>

      <article className="card">
        <div className="form-grid manifest-management-filter-grid">
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
                      className="card-link manifest-management-card-link"
                    >
                      <article className="card">
                        <header className="card-header">
                          <div>
                            <h3>Load {manifest.load_number}</h3>
                            <p className="muted manifest-management-meta">
                              Capacity: {manifest.capacity ?? 'Not set'} • Participants: {nonStaff} • Staff: {staffCount}
                            </p>
                            {manifest.notes && <p className="muted manifest-management-notes">Notes: {manifest.notes}</p>}
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
