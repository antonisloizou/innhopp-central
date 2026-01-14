import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Event, getEvent, getManifest, listEvents, listManifests, Manifest, updateEvent, updateManifest } from '../api/events';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  createParticipantProfile,
  listParticipantProfiles
} from '../api/participants';

type EventLite = {
  id: number;
  name: string;
};

const ManifestDetailPage = () => {
  const { manifestId } = useParams();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [eventData, setEventData] = useState<Event | null>(null);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [showParticipantForm, setShowParticipantForm] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [form, setForm] = useState({
    event_id: '',
    load_number: '',
    capacity: '',
    staff_slots: '',
    notes: ''
  });
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [participantForm, setParticipantForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: '',
    roles: ['Participant', 'Skydiver'] as string[]
  });
  const [staffForm, setStaffForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: '',
    roles: ['Participant', 'Skydiver', 'Staff'] as string[]
  });
  const roleOptions = ['Participant', 'Skydiver', 'Staff', 'Ground Crew', 'Jump Master', 'Jump Leader', 'Driver', 'Pilot', 'COP'] as const;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!manifestId) return;
      setLoading(true);
      setError(null);
      try {
        const manifestData = await getManifest(Number(manifestId));
        const [eventsData, participantData, eventDetails, manifestsData] = await Promise.all([
          listEvents(),
          listParticipantProfiles(),
          getEvent(manifestData.event_id),
          listManifests()
        ]);
        if (cancelled) return;
        setManifest(manifestData);
        setEvents(
          Array.isArray(eventsData)
            ? eventsData.map((evt) => ({
                id: evt.id,
                name: evt.name
              }))
            : []
        );
        setParticipants(Array.isArray(participantData) ? participantData : []);
        setEventData(eventDetails);
        setManifests(Array.isArray(manifestsData) ? manifestsData : []);
        setForm({
          event_id: String(manifestData.event_id),
          load_number: String(manifestData.load_number ?? ''),
          capacity: manifestData.capacity != null ? String(manifestData.capacity) : '',
          staff_slots: manifestData.staff_slots != null ? String(manifestData.staff_slots) : '',
          notes: manifestData.notes || ''
        });
        setParticipantIds(Array.isArray(manifestData.participant_ids) ? manifestData.participant_ids : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load manifest');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [manifestId]);

  useEffect(() => {
    let cancelled = false;
    const loadEventDetails = async () => {
      if (!form.event_id) {
        setEventData(null);
        return;
      }
      try {
        const evt = await getEvent(Number(form.event_id));
        if (!cancelled) {
          setEventData(evt);
        }
      } catch {
        // ignore
      }
    };
    loadEventDetails();
    return () => {
      cancelled = true;
    };
  }, [form.event_id]);

  const currentEventId = useMemo(() => Number(form.event_id || manifest?.event_id || 0), [form.event_id, manifest?.event_id]);
  const assignedToOtherLoads = useMemo(() => {
    if (!currentEventId) return new Set<number>();
    const currentManifestId = manifest?.id ?? Number(manifestId);
    const ids = manifests
      .filter((m) => m.event_id === currentEventId && m.id !== currentManifestId)
      .flatMap((m) => (Array.isArray(m.participant_ids) ? m.participant_ids : []));
    return new Set(ids);
  }, [currentEventId, manifests, manifest?.id, manifestId]);
  const availableParticipants = useMemo(() => {
    const allowedIds = eventData?.participant_ids ?? [];
    return participants.filter((p) => {
      const roles = Array.isArray(p.roles) ? p.roles : [];
      const isSkydiver = roles.includes('Skydiver');
      const isStaff = roles.includes('Staff');
      return allowedIds.includes(p.id) && !participantIds.includes(p.id) && isSkydiver && !isStaff && !assignedToOtherLoads.has(p.id);
    });
  }, [participants, participantIds, eventData, assignedToOtherLoads]);
  const availableStaff = useMemo(() => {
    const allowedIds = eventData?.participant_ids ?? [];
    return participants.filter((p) => {
      const roles = Array.isArray(p.roles) ? p.roles : [];
      const isSkydiver = roles.includes('Skydiver');
      const isStaff = roles.includes('Staff');
      return allowedIds.includes(p.id) && !participantIds.includes(p.id) && isSkydiver && isStaff && !assignedToOtherLoads.has(p.id);
    });
  }, [participants, participantIds, eventData, assignedToOtherLoads]);
  const staffParticipants = useMemo(
    () =>
      participantIds.filter((id) => {
        const roles = participants.find((p) => p.id === id)?.roles || [];
        return roles.includes('Staff') && roles.includes('Skydiver');
      }),
    [participantIds, participants]
  );
  const staffSlotsValue = useMemo(() => {
    const val = Number(form.staff_slots);
    return Number.isFinite(val) && val >= 0 ? val : null;
  }, [form.staff_slots]);
  const staffIsFull = staffSlotsValue != null && staffSlotsValue > 0 && staffParticipants.length >= staffSlotsValue;
  const capacityValue = useMemo(() => {
    const val = Number(form.capacity);
    return Number.isFinite(val) && val > 0 ? val : null;
  }, [form.capacity]);
  const nonStaffParticipants = useMemo(
    () =>
      participantIds.filter((id) => {
        const roles = participants.find((p) => p.id === id)?.roles || [];
        return !roles.includes('Staff');
      }),
    [participantIds, participants]
  );
  const participantLimit = useMemo(() => {
    if (capacityValue == null) return null;
    const staffVal = staffSlotsValue ?? 0;
    const limit = capacityValue - staffVal;
    return limit > 0 ? limit : null;
  }, [capacityValue, staffSlotsValue]);
  const participantsFull = participantLimit != null && nonStaffParticipants.length >= participantLimit;

  const participantLabel = (id: number) =>
    participants.find((p) => p.id === id)?.full_name || `Participant #${id}`;

  const persistManifest = async (nextParticipantIds: number[]) => {
    if (!manifestId) return null;
    const payload = {
      event_id: Number(form.event_id),
      load_number: Number(form.load_number),
      capacity: form.capacity ? Number(form.capacity) : undefined,
      staff_slots: form.staff_slots ? Number(form.staff_slots) : undefined,
      notes: form.notes.trim() || undefined,
      participant_ids: nextParticipantIds
    };
    const updated = await updateManifest(Number(manifestId), payload);
    setManifest(updated);
    setParticipantIds(Array.isArray(updated.participant_ids) ? updated.participant_ids : nextParticipantIds);
    setManifests((prev) => {
      const exists = prev.some((m) => m.id === updated.id);
      if (exists) {
        return prev.map((m) => (m.id === updated.id ? updated : m));
      }
      return [...prev, updated];
    });
    return updated;
  };

  const persistEventParticipants = async (nextParticipantIds: number[]) => {
    if (!eventData) return;
    try {
      const updated = await updateEvent(eventData.id, {
        season_id: eventData.season_id,
        name: eventData.name,
        location: eventData.location,
        slots: eventData.slots,
        status: eventData.status,
        starts_at: eventData.starts_at,
        ends_at: eventData.ends_at ?? undefined,
        airfield_ids: eventData.airfield_ids,
        participant_ids: nextParticipantIds
      });
      setEventData(updated);
    } catch {
      // ignore event update failures here
    }
  };

  const handleAssignParticipant = async () => {
    const id = Number(selectedParticipantId);
    if (!id || participantIds.includes(id)) return;
    setSaving(true);
    setMessage(null);
    const next = [...participantIds, id];
    try {
      await persistManifest(next);
      setSelectedParticipantId('');
      setMessage('Participant added to manifest');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add participant');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignStaff = async () => {
    const id = Number(selectedStaffId);
    if (!id || participantIds.includes(id)) return;
    if (staffIsFull) return;
    setSaving(true);
    setMessage(null);
    const next = [...participantIds, id];
    try {
      await persistManifest(next);
      setSelectedStaffId('');
      setMessage('Staff added to manifest');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add staff');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveParticipant = async (id: number) => {
    const next = participantIds.filter((pid) => pid !== id);
    setSaving(true);
    setMessage(null);
    try {
      await persistManifest(next);
      setMessage('Participant removed from manifest');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to remove participant');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddingParticipant(true);
    setMessage(null);
    try {
      const roles = participantForm.roles && participantForm.roles.length > 0 ? participantForm.roles : ['Participant', 'Skydiver'];
      const payload: CreateParticipantPayload = {
        full_name: participantForm.full_name.trim(),
        email: participantForm.email.trim(),
        phone: participantForm.phone.trim() || undefined,
        experience_level: participantForm.experience_level.trim() || undefined,
        emergency_contact: participantForm.emergency_contact.trim() || undefined,
        roles
      };
      const created = await createParticipantProfile(payload);
      setParticipants((prev) => [...prev, created]);
      const next = [...participantIds, created.id];
      await persistManifest(next);
      if (eventData) {
        const nextEventParticipants = Array.isArray(eventData.participant_ids)
          ? Array.from(new Set([...eventData.participant_ids, created.id]))
          : [created.id];
        await persistEventParticipants(nextEventParticipants);
      }
      setParticipantForm({
        full_name: '',
        email: '',
        phone: '',
        experience_level: '',
        emergency_contact: '',
        roles: ['Participant', 'Skydiver']
      });
      setShowParticipantForm(false);
      setMessage('Participant created and added');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create participant');
    } finally {
      setAddingParticipant(false);
    }
  };

  const handleCreateStaffParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (staffIsFull) {
      setMessage('Staff slots full');
      return;
    }
    setAddingStaff(true);
    setMessage(null);
    try {
      const roles = staffForm.roles && staffForm.roles.length > 0 ? staffForm.roles : ['Participant', 'Skydiver', 'Staff'];
      const payload: CreateParticipantPayload = {
        full_name: staffForm.full_name.trim(),
        email: staffForm.email.trim(),
        phone: staffForm.phone.trim() || undefined,
        experience_level: staffForm.experience_level.trim() || undefined,
        emergency_contact: staffForm.emergency_contact.trim() || undefined,
        roles
      };
      const created = await createParticipantProfile(payload);
      setParticipants((prev) => [...prev, created]);
      const next = [...participantIds, created.id];
      await persistManifest(next);
      if (eventData) {
        const nextEventParticipants = Array.isArray(eventData.participant_ids)
          ? Array.from(new Set([...eventData.participant_ids, created.id]))
          : [created.id];
        await persistEventParticipants(nextEventParticipants);
      }
      setStaffForm({
        full_name: '',
        email: '',
        phone: '',
        experience_level: '',
        emergency_contact: '',
        roles: ['Participant', 'Skydiver', 'Staff']
      });
      setShowStaffForm(false);
      setMessage('Staff participant created and added');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create staff participant');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await persistManifest(participantIds);
      setMessage('Manifest updated');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update manifest');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="muted">Loading manifest…</p>;
  }
  if (error) {
    return <p className="error-text">{error}</p>;
  }
  if (!manifest) {
    return <p className="error-text">Manifest not found.</p>;
  }
  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Load {manifest.load_number}</h2>
        </div>
        <button className="ghost" type="button" onClick={() => navigate(-1)}>
          Back
        </button>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Event</span>
            <select value={form.event_id} onChange={(e) => setForm((prev) => ({ ...prev, event_id: e.target.value }))} required>
              <option value="">Select an event</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name}
                </option>
              ))}
            </select>
          </label>
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
              placeholder="Optional"
            />
          </label>
          <label className="form-field">
            <span>Staff slots</span>
            <input
              type="number"
              min={0}
              value={form.staff_slots}
              onChange={(e) => setForm((prev) => ({ ...prev, staff_slots: e.target.value }))}
            />
          </label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes"
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
            <h3>Participants</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge neutral">{nonStaffParticipants.length} total</span>
            {participantsFull && <span className="badge danger">FULL</span>}
          </div>
        </header>
        {nonStaffParticipants.length === 0 ? (
          <p className="muted">No participants assigned to this load.</p>
        ) : (
          <ul className="status-list" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
            {nonStaffParticipants.map((id) => {
              const profile = participants.find((p) => p.id === id);
              return (
                <li key={id}>
                  <Link to={`/participants/${id}`} className="card-link" style={{ flex: 1 }}>
                    <strong>{participantLabel(id)}</strong>
                    <div className="muted">{profile?.email || 'No email on file'}</div>
                    <div className="muted">Experience: {profile?.experience_level || 'Not provided'}</div>
                  </Link>
                  <button type="button" className="ghost danger" onClick={() => handleRemoveParticipant(id)} disabled={saving}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!participantsFull && (
          <>
            <div className="form-grid" style={{ marginTop: '1rem' }}>
              <label className="form-field">
                <span>Select participant</span>
                <select value={selectedParticipantId} onChange={(e) => setSelectedParticipantId(e.target.value)}>
                  <option value="">Choose a participant</option>
                  {availableParticipants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.email || 'No email'})
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="button" className="primary" onClick={handleAssignParticipant} disabled={!selectedParticipantId || saving}>
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
          </>
        )}
        {!participantsFull && showParticipantForm && (
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
                onChange={(e) => setParticipantForm((prev) => ({ ...prev, experience_level: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="form-field">
              <span>Emergency contact</span>
              <input
                type="text"
                value={participantForm.emergency_contact}
                onChange={(e) => setParticipantForm((prev) => ({ ...prev, emergency_contact: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Roles</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {roleOptions.map((role) => {
                  const checked = participantForm.roles?.includes(role);
                  const disabled = role === 'Staff';
                  return (
                    <label key={role} className="badge neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => {
                          setParticipantForm((prev) => {
                            const current = new Set(prev.roles || []);
                            if (e.target.checked) {
                              current.add(role);
                            } else {
                              current.delete(role);
                            }
                            const next = Array.from(current);
                            return { ...prev, roles: next.length > 0 ? next : ['Participant', 'Skydiver'] };
                          });
                        }}
                      />
                      {role}
                    </label>
                  );
                })}
              </div>
              <p className="muted" style={{ margin: 0 }}>Staff cannot be assigned here.</p>
            </div>
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



      <article className="card">
        <header className="card-header">
          <div>
            <h3>Staff</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge neutral">{staffParticipants.length} staff</span>
            {staffIsFull && <span className="badge danger">FULL</span>}
          </div>
        </header>
        {staffParticipants.length === 0 ? (
          <p className="muted">No staff assigned to this load.</p>
        ) : (
          <ul className="status-list" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
            {staffParticipants.map((id) => {
              const profile = participants.find((p) => p.id === id);
              return (
                <li key={id}>
                  <Link to={`/participants/${id}`} className="card-link" style={{ flex: 1 }}>
                    <strong>{participantLabel(id)}</strong>
                    <div className="muted">{profile?.email || 'No email on file'}</div>
                    <div className="muted">Experience: {profile?.experience_level || 'Not provided'}</div>
                  </Link>
                  <button type="button" className="ghost danger" onClick={() => handleRemoveParticipant(id)} disabled={saving}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!staffIsFull && (
          <>
            <div className="form-grid" style={{ marginTop: '1rem' }}>
              <label className="form-field">
                <span>Select staff</span>
                <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
                  <option value="">Choose staff</option>
                  {availableStaff.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.email || 'No email'})
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="button" className="primary" onClick={handleAssignStaff} disabled={!selectedStaffId || saving}>
                  Add
                </button>
              </div>
            </div>
            {!showStaffForm && (
              <div className="form-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="ghost" onClick={() => setShowStaffForm(true)}>
                  Create new staff
                </button>
              </div>
            )}
          </>
        )}
        {!staffIsFull && showStaffForm && (
          <form className="form-grid" style={{ marginTop: '1rem' }} onSubmit={handleCreateStaffParticipant}>
            <label className="form-field">
              <span>Full name</span>
              <input
                type="text"
                value={staffForm.full_name}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, full_name: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                value={staffForm.email}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Phone</span>
              <input
                type="text"
                value={staffForm.phone}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="form-field">
              <span>Experience level</span>
              <input
                type="text"
                value={staffForm.experience_level}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, experience_level: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="form-field">
              <span>Emergency contact</span>
              <input
                type="text"
                value={staffForm.emergency_contact}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, emergency_contact: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Roles</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {roleOptions.map((role) => {
                  const checked = staffForm.roles?.includes(role);
                  const locked = role === 'Participant' || role === 'Skydiver' || role === 'Staff';
                  return (
                    <label key={role} className="badge neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={(e) => {
                          setStaffForm((prev) => {
                            const current = new Set(prev.roles || []);
                            if (e.target.checked) {
                              current.add(role);
                            } else {
                              current.delete(role);
                            }
                            const next = Array.from(current);
                            return { ...prev, roles: next.length > 0 ? next : ['Participant', 'Skydiver', 'Staff'] };
                          });
                        }}
                      />
                      {role}
                    </label>
                  );
                })}
              </div>
              <p className="muted" style={{ margin: 0 }}>Staff include Participant, Staff, and Skydiver roles by default.</p>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={addingStaff}>
                {addingStaff ? 'Adding…' : 'Add staff'}
              </button>
              <button type="button" className="ghost" onClick={() => setShowStaffForm(false)} disabled={addingStaff}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </article>
    </section>
  );
};

export default ManifestDetailPage;
