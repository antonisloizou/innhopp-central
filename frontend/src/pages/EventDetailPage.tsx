import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Event, EventStatus, InnhoppInput, Season, getEvent, listSeasons, updateEvent } from '../api/events';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  createParticipantProfile,
  listParticipantProfiles
} from '../api/participants';

type InnhoppFormRow = {
  id?: number;
  sequence: number;
  name: string;
  scheduled_at: string;
  notes: string;
};

type ParticipantFormState = {
  full_name: string;
  email: string;
  phone: string;
  experience_level: string;
  emergency_contact: string;
};

const statusOptions: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'planned', label: 'Planned' },
  { value: 'launched', label: 'Launched' },
  { value: 'scouted', label: 'Scouted' },
  { value: 'live', label: 'Live' },
  { value: 'past', label: 'Past' }
];

const toInputDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 16) : '';

const toInputDate = (iso?: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : '';

const toIsoDate = (value: string) => (value ? new Date(`${value}T00:00:00Z`).toISOString() : '');

const normalizeInnhopps = (event: Event): InnhoppFormRow[] =>
  (Array.isArray(event.innhopps) ? event.innhopps : []).map((i, idx) => ({
    id: i.id,
    sequence: i.sequence ?? idx + 1,
    name: i.name || '',
    scheduled_at: toInputDateTime(i.scheduled_at),
    notes: i.notes || ''
  }));

const EventDetailPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [eventForm, setEventForm] = useState({
    season_id: '',
    name: '',
    location: '',
    slots: '',
    status: 'draft' as EventStatus,
    starts_at: '',
    ends_at: ''
  });
  const [participantForm, setParticipantForm] = useState<ParticipantFormState>({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: ''
  });
  const [showParticipantForm, setShowParticipantForm] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [innhopps, setInnhopps] = useState<InnhoppFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      try {
        const event = await getEvent(Number(eventId));
        if (cancelled) return;
        setEventData(event);
        setInnhopps(normalizeInnhopps(event));
        setParticipantIds(Array.isArray(event.participant_ids) ? event.participant_ids : []);
        setEventForm({
          season_id: String(event.season_id),
          name: event.name,
          location: event.location || '',
          slots: event.slots ? String(event.slots) : '',
          status: event.status,
          starts_at: toInputDate(event.starts_at),
          ends_at: toInputDate(event.ends_at)
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load event');
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
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    const loadSeasons = async () => {
      try {
        const data = await listSeasons();
        if (!cancelled) {
          setSeasons(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        // season list is best-effort for editing
      }
    };
    loadSeasons();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadParticipants = async () => {
      try {
        const data = await listParticipantProfiles();
        if (!cancelled) {
          setParticipants(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore participant load errors for now
      }
    };
    loadParticipants();
    return () => {
      cancelled = true;
    };
  }, []);

  const participantLabel = (id: number) =>
    participants.find((p) => p.id === id)?.full_name || `Participant #${id}`;

  const availableParticipants = participants.filter((p) => !participantIds.includes(p.id));

  const persistEvent = async (nextParticipantIds: number[]) => {
    if (!eventData) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        season_id: Number(eventForm.season_id || eventData.season_id),
        name: eventForm.name.trim() || eventData.name,
        location: eventForm.location.trim() || undefined,
        slots: eventForm.slots ? Number(eventForm.slots) : eventData.slots || 0,
        status: eventForm.status,
        starts_at: toIsoDate(eventForm.starts_at) || eventData.starts_at,
        ends_at: eventForm.ends_at ? toIsoDate(eventForm.ends_at) : undefined,
        participant_ids: nextParticipantIds,
        innhopps: innhopps
          .filter((row) => row.name.trim() !== '')
          .map<InnhoppInput>((row, idx) => ({
            sequence: row.sequence || idx + 1,
            name: row.name.trim(),
            scheduled_at: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : '',
            notes: row.notes
          }))
      };
      const updated = await updateEvent(eventData.id, payload);
      setEventData(updated);
      setParticipantIds(Array.isArray(updated.participant_ids) ? updated.participant_ids : []);
      setInnhopps(normalizeInnhopps(updated));
      setMessage('Event updated');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update event');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignParticipant = async () => {
    const id = Number(selectedParticipantId);
    if (!id || participantIds.includes(id) || !eventData) return;
    const next = [...participantIds, id];
    setParticipantIds(next);
    setSelectedParticipantId('');
    await persistEvent(next);
  };

  const handleRemoveParticipant = async (id: number) => {
    const next = participantIds.filter((pid) => pid !== id);
    setParticipantIds(next);
    await persistEvent(next);
  };

  const handleCreateParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddingParticipant(true);
    setMessage(null);
    try {
      const payload: CreateParticipantPayload = {
        full_name: participantForm.full_name.trim(),
        email: participantForm.email.trim(),
        phone: participantForm.phone.trim() || undefined,
        experience_level: participantForm.experience_level.trim() || undefined,
        emergency_contact: participantForm.emergency_contact.trim() || undefined
      };
      const created = await createParticipantProfile(payload);
      setParticipants((prev) => [...prev, created]);
      setParticipantIds((prev) => [...prev, created.id]);
      setParticipantForm({
        full_name: '',
        email: '',
        phone: '',
        experience_level: '',
        emergency_contact: ''
      });
      setShowParticipantForm(false);
      setMessage('Participant added. Save to persist with event.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add participant');
    } finally {
      setAddingParticipant(false);
    }
  };

  const handleAddRow = () => {
    setInnhopps((prev) => [
      ...prev,
      {
        sequence: prev.length + 1,
        name: '',
        scheduled_at: '',
        notes: ''
      }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setInnhopps((prev) => prev.filter((_, i) => i !== index).map((row, idx) => ({ ...row, sequence: idx + 1 })));
  };

  const handleChange = (index: number, key: keyof InnhoppFormRow, value: string) => {
    setInnhopps((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [key]: key === 'sequence' ? Number(value) || index + 1 : value
      };
      return next;
    });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await persistEvent(participantIds);
  };

  if (loading) {
    return <p className="muted">Loading event…</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!eventData) {
    return <p className="error-text">Event not found.</p>;
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>{eventData.name}</h2>
          <p className="muted">{eventData.location || 'Location TBD'}</p>
        </div>
        <div className="card-actions">
          <span className={`badge status-${eventData.status}`}>{eventData.status}</span>
          <button className="ghost" type="button" onClick={() => navigate('/events')}>
            Back to events
          </button>
        </div>
      </header>

      <article className="card">
        <header className="card-header">
          <div>
            <h3>Event details</h3>
          </div>
        </header>
        <form className="form-grid" onSubmit={handleSave}>
          <label className="form-field">
            <span>Season</span>
            <select
              value={eventForm.season_id}
              onChange={(e) => setEventForm((prev) => ({ ...prev, season_id: e.target.value }))}
              required
            >
              <option value="">Select season</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Name</span>
            <input
              type="text"
              value={eventForm.name}
              onChange={(e) => setEventForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Location</span>
            <input
              type="text"
              value={eventForm.location}
              onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="The overall location the event takes place"
            />
          </label>
          <label className="form-field">
            <span>Status</span>
            <select
              value={eventForm.status}
              onChange={(e) => setEventForm((prev) => ({ ...prev, status: e.target.value as EventStatus }))}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Slots</span>
            <input
              type="number"
              min={0}
              value={eventForm.slots}
              onChange={(e) => setEventForm((prev) => ({ ...prev, slots: e.target.value }))}
              placeholder="Total slots"
            />
          </label>
          <label className="form-field">
            <span>Starts on</span>
            <input
              type="date"
              value={eventForm.starts_at}
              onChange={(e) => setEventForm((prev) => ({ ...prev, starts_at: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Ends on</span>
            <input
              type="date"
              value={eventForm.ends_at}
              onChange={(e) => setEventForm((prev) => ({ ...prev, ends_at: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>

      <article className="card">
        <header className="card-header">
          <div>
            <h3>Innhopps</h3>
          </div>
          <span className="badge neutral">{innhopps.length} INNHOPPS</span>
        </header>
        <form className="form-grid" onSubmit={handleSave}>
          {innhopps.length === 0 && <p className="muted">No innhopps yet.</p>}
          {innhopps.map((row, index) => (
            <div key={index} className="innhopp-row">
              <label className="form-field">
                <span>Sequence</span>
                <input
                  type="number"
                  min={1}
                  value={row.sequence}
                  onChange={(e) => handleChange(index, 'sequence', e.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Name</span>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => handleChange(index, 'name', e.target.value)}
                  placeholder="Describe the innhopp"
                  required
                />
              </label>
              <label className="form-field">
                <span>Scheduled at</span>
                <input
                  type="datetime-local"
                  value={row.scheduled_at}
                  onChange={(e) => handleChange(index, 'scheduled_at', e.target.value)}
                />
              </label>
              <label className="form-field notes-field">
                <span>Notes</span>
                <input
                  type="text"
                  value={row.notes}
                  onChange={(e) => handleChange(index, 'notes', e.target.value)}
                  placeholder="Exit altitude, landing brief…"
                />
              </label>
              <button type="button" className="ghost danger" onClick={() => handleRemoveRow(index)}>
                Remove
              </button>
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={handleAddRow}>
              Add innhopp
            </button>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
      </article>

      <article className="card">
        <header className="card-header">
          <div>
            <h3>Participants</h3>
          </div>
          <span className="badge neutral">{participantIds.length} total</span>
        </header>
        {participantIds.length === 0 ? (
          <p className="muted">No participants yet.</p>
        ) : (
          <ul className="status-list">
            {participantIds.map((id) => {
              const profile = participants.find((p) => p.id === id);
              return (
                <li key={id}>
                  <Link to={`/participants/${id}`} className="card-link" style={{ flex: 1 }}>
                    <strong>{participantLabel(id)}</strong>
                    <div className="muted">{profile?.email || 'No email on file'}</div>
                    <div className="muted">
                      Experience: {profile?.experience_level || 'Not provided'}
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => handleRemoveParticipant(id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <label className="form-field">
            <span>Select participant</span>
            <select
              value={selectedParticipantId}
              onChange={(e) => setSelectedParticipantId(e.target.value)}
            >
              <option value="">Choose a participant</option>
              {availableParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.email || 'No email'})
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="button" className="primary" onClick={handleAssignParticipant} disabled={!selectedParticipantId}>
              Add
            </button>
          </div>
        </div>
        {!showParticipantForm && (
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="ghost" onClick={() => setShowParticipantForm(true)}>
              Create new participant
            </button>
          </div>
        )}
        {showParticipantForm && (
          <form className="form-grid" style={{ marginTop: '1rem' }} onSubmit={handleCreateParticipant}>
            <label className="form-field">
              <span>Full name</span>
              <input
                type="text"
                value={participantForm.full_name}
                onChange={(e) => setParticipantForm((prev) => ({ ...prev, full_name: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                value={participantForm.email}
                onChange={(e) => setParticipantForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Phone</span>
              <input
                type="text"
                value={participantForm.phone}
                onChange={(e) => setParticipantForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="form-field">
              <span>Experience level</span>
              <input
                type="text"
                value={participantForm.experience_level}
                onChange={(e) =>
                  setParticipantForm((prev) => ({ ...prev, experience_level: e.target.value }))
                }
                placeholder="Optional"
              />
            </label>
            <label className="form-field">
              <span>Emergency contact</span>
              <input
                type="text"
                value={participantForm.emergency_contact}
                onChange={(e) =>
                  setParticipantForm((prev) => ({ ...prev, emergency_contact: e.target.value }))
                }
                placeholder="Optional"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={addingParticipant}>
                {addingParticipant ? 'Adding…' : 'Add participant'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowParticipantForm(false)}
                disabled={addingParticipant}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </article>
    </section>
  );
};

export default EventDetailPage;
