import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import {
  CreateGroundCrewPayload,
  createGroundCrew,
  createEventVehicle,
  listEventVehicles,
  EventVehicle,
  OtherLogistic,
  Meal,
  listOthers,
  listMeals
} from '../api/logistics';
import { Event, listEvents, Accommodation, listAccommodations } from '../api/events';
import { Airfield, listAirfields } from '../api/airfields';
import { fromEventLocalPickerDate, toEventLocalPickerDate } from '../utils/eventDate';

type VehicleRow = {
  name: string;
  driver: string;
  passenger_capacity: string;
  notes: string;
};

type LocationOption = {
  valueKey: string;
  label: string;
  type: 'Innhopp' | 'Airfield' | 'Accommodation' | 'Other' | 'Meal';
};

const LogisticsGroundCrewCreatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const copyGroundCrew = (location.state as any)?.copyGroundCrew;
  const copyGroundCrewVehicles =
    Array.isArray(copyGroundCrew?.vehicles) && copyGroundCrew.vehicles.length
      ? copyGroundCrew.vehicles.filter(
          (v: any) =>
            v &&
            typeof v.name === 'string' &&
            typeof v.passenger_capacity !== 'undefined'
        )
      : [];
  const copyVehicleIds = Array.isArray(copyGroundCrew?.vehicle_ids)
    ? copyGroundCrew.vehicle_ids.filter((id: unknown) => typeof id === 'number')
    : [];
  const [form, setForm] = useState({
    pickup_location: copyGroundCrew?.pickup_location || '',
    destination: copyGroundCrew?.destination || '',
    passenger_count: copyGroundCrew?.passenger_count ?? '',
    scheduled_at: copyGroundCrew?.scheduled_at || ''
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [existingVehicles, setExistingVehicles] = useState<EventVehicle[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [pickupOptionKey, setPickupOptionKey] = useState('');
  const [destinationOptionKey, setDestinationOptionKey] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(copyGroundCrew?.event_id ? String(copyGroundCrew.event_id) : '');
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>(copyVehicleIds);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [newVehicle, setNewVehicle] = useState<VehicleRow>({
    name: '',
    driver: '',
    passenger_capacity: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const initialEventSet = useRef(true);
  const [pendingCopiedVehicles, setPendingCopiedVehicles] = useState(copyGroundCrewVehicles);

  useEffect(() => {
    if (!copyGroundCrew) return;
    initialEventSet.current = true;
    setSelectedEventId(copyGroundCrew.event_id ? String(copyGroundCrew.event_id) : '');
    setForm({
      pickup_location: copyGroundCrew.pickup_location || '',
      destination: copyGroundCrew.destination || '',
      passenger_count: copyGroundCrew.passenger_count ?? '',
      scheduled_at: copyGroundCrew.scheduled_at || ''
    });
    const vehicleIdsFromVehicles = copyGroundCrewVehicles
      .map((v: any) => (typeof v.event_vehicle_id === 'number' ? v.event_vehicle_id : undefined))
      .filter((id: any): id is number => typeof id === 'number');
    const nextVehicleIds = copyVehicleIds.length > 0 ? copyVehicleIds : vehicleIdsFromVehicles;
   setSelectedVehicleIds(nextVehicleIds);
   setPendingCopiedVehicles(copyGroundCrewVehicles);
 }, [copyGroundCrew]); 

  useEffect(() => {
    let cancelled = false;
    const loadEventsAndVehicles = async () => {
      try {
        const [resp, vehiclesResp, airfieldResp] = await Promise.all([
          listEvents(),
          listEventVehicles(),
          listAirfields()
        ]);
        if (cancelled) return;
        setEvents(Array.isArray(resp) ? resp : []);
        setExistingVehicles(Array.isArray(vehiclesResp) ? vehiclesResp : []);
        setAirfields(Array.isArray(airfieldResp) ? airfieldResp : []);
      } catch {
        // ignore load errors here; submit will validate
      }
    };
    loadEventsAndVehicles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialEventSet.current) {
      initialEventSet.current = false;
      return;
    }
    setSelectedVehicleIds([]);
    setShowVehicleForm(false);
    setPickupOptionKey('');
    setDestinationOptionKey('');
    setForm((prev) => ({ ...prev, pickup_location: '', destination: '' }));
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedEventId || form.scheduled_at) return;
    const ev = events.find((e) => e.id === Number(selectedEventId));
    if (ev?.starts_at) {
      const d = toEventLocalPickerDate(ev.starts_at);
      if (d) {
        d.setHours(9, 0, 0, 0);
        setForm((prev) => ({ ...prev, scheduled_at: fromEventLocalPickerDate(d) }));
      }
    }
  }, [selectedEventId, events, form.scheduled_at]);

  const handleAddVehicle = () => {
    setShowVehicleForm(true);
    setNewVehicle({ name: '', driver: '', passenger_capacity: '', notes: '' });
  };

  const handleRemoveVehicle = (id: number) => {
    setSelectedVehicleIds((prev) => prev.filter((v) => v !== id));
  };

  const handleSaveNewVehicle = async () => {
    if (!selectedEventId || !newVehicle.name.trim()) return;
    try {
      const created = await createEventVehicle({
        event_id: Number(selectedEventId),
        name: newVehicle.name.trim(),
        driver: newVehicle.driver.trim() || undefined,
        passenger_capacity: Number(newVehicle.passenger_capacity) || 0,
        notes: newVehicle.notes.trim() || undefined
      });
      setExistingVehicles((prev) => [created, ...prev]);
      setSelectedVehicleIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setNewVehicle({ name: '', driver: '', passenger_capacity: '', notes: '' });
      setShowVehicleForm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create vehicle');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const isCopy = !!copyGroundCrew;
    try {
      let vehicleIds = [...selectedVehicleIds];
      // Always hydrate vehicle ids from copied data if present
      if (selectedEventId) {
        const copiedList = pendingCopiedVehicles;
        if (copiedList.length > 0) {
          for (const v of copiedList) {
            if (v.event_vehicle_id && !vehicleIds.includes(v.event_vehicle_id)) {
              vehicleIds.push(v.event_vehicle_id as number);
              continue;
            }
            if (!v.event_vehicle_id) {
              const created = await createEventVehicle({
                event_id: Number(selectedEventId),
                name: v.name,
                driver: v.driver || '',
                passenger_capacity: Number(v.passenger_capacity) || 0,
                notes: v.notes || ''
              });
              vehicleIds.push(created.id);
            }
          }
          setSelectedVehicleIds(vehicleIds);
          setPendingCopiedVehicles([]);
        }
      }

      const payload: CreateGroundCrewPayload = {
        pickup_location: form.pickup_location.trim(),
        destination: form.destination.trim(),
        passenger_count: Number(form.passenger_count) || 0,
        scheduled_at: form.scheduled_at ? form.scheduled_at : undefined,
        event_id: Number(selectedEventId),
        vehicle_ids: [...vehicleIds]
      };
      if (showVehicleForm && newVehicle.name.trim()) {
        const created = await createEventVehicle({
          event_id: Number(selectedEventId),
          name: newVehicle.name.trim(),
          driver: newVehicle.driver.trim() || undefined,
          passenger_capacity: Number(newVehicle.passenger_capacity) || 0,
          notes: newVehicle.notes.trim() || undefined
        });
        vehicleIds.push(created.id);
        payload.vehicle_ids = [...vehicleIds];
      }
      const created = await createGroundCrew(payload);
      setMessage('Ground crew entry created');
      if (created?.id && selectedEventId) {
        try {
          sessionStorage.setItem(`event-schedule-highlight:${selectedEventId}`, `gc-${created.id}`);
        } catch {
          // ignore highlight persistence errors
        }
      }
      navigate(isCopy ? -2 : -1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create ground crew');
    } finally {
      setSubmitting(false);
    }
  };

  const routeSummary =
    form.pickup_location && form.destination
      ? `${form.pickup_location} → ${form.destination}`
      : '';

  const buildOptionKey = (type: LocationOption['type'], label: string) => `${type}::${label}`;

  const locationGroups = useMemo(() => {
    const groups: { label: string; options: LocationOption[] }[] = [];
    const seen = new Set<string>();
    const event = events.find((e) => e.id === Number(selectedEventId));

    const innhoppOptions: LocationOption[] =
      event?.innhopps?.length && Array.isArray(event.innhopps)
        ? event.innhopps.map((inn) => ({
            valueKey: buildOptionKey(
              'Innhopp',
              `${inn.sequence ? `#${inn.sequence} ` : ''}${inn.name || 'Untitled innhopp'}`.trim()
            ),
            label: `${inn.sequence ? `#${inn.sequence} ` : ''}${inn.name || 'Untitled innhopp'}`.trim(),
            type: 'Innhopp'
          }))
        : [];
    if (innhoppOptions.length) {
      innhoppOptions.forEach((o) => seen.add(o.label));
      groups.push({ label: 'Innhopps', options: innhoppOptions });
    }

    const eventAirfields =
      event && Array.isArray(event.airfield_ids)
        ? airfields.filter((af) => event.airfield_ids.includes(af.id))
        : [];
    if (eventAirfields.length) {
      eventAirfields.forEach((af) => seen.add(af.name || `Airfield #${af.id}`));
      groups.push({
        label: 'Airfields',
        options: eventAirfields.map<LocationOption>((af) => ({
          valueKey: buildOptionKey('Airfield', af.name || `Airfield #${af.id}`),
          label: af.name || `Airfield #${af.id}`,
          type: 'Airfield'
        }))
      });
    }

    if (accommodations.length) {
      accommodations.forEach((acc) => seen.add(acc.name || `Accommodation #${acc.id}`));
      groups.push({
        label: 'Accommodations',
        options: accommodations.map<LocationOption>((acc) => ({
          valueKey: buildOptionKey('Accommodation', acc.name || `Accommodation #${acc.id}`),
          label: acc.name || `Accommodation #${acc.id}`,
          type: 'Accommodation'
        }))
      });
    }

    if (others.length) {
      others.forEach((o) => seen.add(o.name || `Other #${o.id}`));
      groups.push({
        label: 'Other',
        options: others.map<LocationOption>((o) => ({
          valueKey: buildOptionKey('Other', o.name || `Other #${o.id}`),
          label: o.name || `Other #${o.id}`,
          type: 'Other'
        }))
      });
    }

    if (meals.length) {
      meals.forEach((meal) => seen.add(meal.name || `Meal #${meal.id}`));
      groups.push({
        label: 'Meals',
        options: meals.map<LocationOption>((meal) => ({
          valueKey: buildOptionKey('Meal', meal.name || `Meal #${meal.id}`),
          label: meal.name || `Meal #${meal.id}`,
          type: 'Meal'
        }))
      });
    }

    return groups;
  }, [
    accommodations,
    airfields,
    events,
    others,
    meals,
    selectedEventId,
    form.pickup_location,
    form.destination
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadAccommodationsAndOthers = async () => {
      if (!selectedEventId) {
        setAccommodations([]);
        setOthers([]);
        setMeals([]);
        return;
      }
      try {
        const [accData, otherData, mealData] = await Promise.all([
          listAccommodations(Number(selectedEventId)),
          listOthers(),
          listMeals()
        ]);
        if (cancelled) return;
        setAccommodations(Array.isArray(accData) ? accData : []);
        setOthers(Array.isArray(otherData) ? otherData.filter((o) => o.event_id === Number(selectedEventId)) : []);
        setMeals(Array.isArray(mealData) ? mealData.filter((m) => m.event_id === Number(selectedEventId)) : []);
      } catch {
        if (!cancelled) {
          setAccommodations([]);
          setOthers([]);
          setMeals([]);
        }
      }
    };
    loadAccommodationsAndOthers();
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  const normalizeLocationValue = (val: string) =>
    val.toLowerCase().replace(/^#?\s*\d+\s*/, '').trim();

  const findOptionByKey = (key: string) => {
    const all = locationGroups.flatMap((group) => group.options);
    return all.find((opt) => opt.valueKey === key);
  };

  const findOptionKeyByLabel = (label: string) => {
    const all = locationGroups.flatMap((group) => group.options);
    return (
      all.find((opt) => opt.label === label)?.valueKey ||
      all.find((opt) => normalizeLocationValue(opt.label) === normalizeLocationValue(label))?.valueKey
    );
  };

  const closestEventDate = (current?: string) => {
    const ev = events.find((e) => e.id === Number(selectedEventId));
    const start = toEventLocalPickerDate(ev?.starts_at) || null;
    const end = toEventLocalPickerDate(ev?.ends_at) || null;
    if (current) {
      const d = toEventLocalPickerDate(current);
      if (d) return d;
    }
    const today = new Date();
    if (start && end) {
      if (today < start) return start;
      if (today > end) return end;
      return today;
    }
    if (start) return start;
    if (end) return end;
    return undefined;
  };

  useEffect(() => {
    if (!form.pickup_location) {
      setPickupOptionKey('');
      return;
    }
    const direct = findOptionByKey(pickupOptionKey);
    if (direct && direct.label === form.pickup_location) return;
    const matchKey = findOptionKeyByLabel(form.pickup_location);
    if (matchKey && matchKey !== pickupOptionKey) {
      const match = findOptionByKey(matchKey);
      setPickupOptionKey(matchKey);
      if (match) {
        setForm((prev) => ({ ...prev, pickup_location: match.label }));
      }
    }
  }, [locationGroups, form.pickup_location, pickupOptionKey]);

  useEffect(() => {
    if (!form.destination) {
      setDestinationOptionKey('');
      return;
    }
    const direct = findOptionByKey(destinationOptionKey);
    if (direct && direct.label === form.destination) return;
    const matchKey = findOptionKeyByLabel(form.destination);
    if (matchKey && matchKey !== destinationOptionKey) {
      const match = findOptionByKey(matchKey);
      setDestinationOptionKey(matchKey);
      if (match) {
        setForm((prev) => ({ ...prev, destination: match.label }));
      }
    }
  }, [locationGroups, form.destination, destinationOptionKey]);

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Create ground crew entry</h2>
          {routeSummary && <p>{routeSummary}</p>}
        </div>
        <button className="ghost" type="button" onClick={() => navigate(-1)}>
          Back
        </button>
      </header>

      <form onSubmit={handleSubmit}>
        <article className="card">
          <div className="form-grid">
            <label className="form-field">
              <span>Event</span>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
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
              <span>Start location</span>
              <select
                value={pickupOptionKey}
                onChange={(e) => {
                  const key = e.target.value;
                  setPickupOptionKey(key);
                  const opt = findOptionByKey(key);
                  setForm((prev) => ({ ...prev, pickup_location: opt ? opt.label : '' }));
                }}
                required
              >
                <option value="">Select start location</option>
                {locationGroups.map(
                  (group) =>
                    group.options.length > 0 && (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((opt) => {
                          const key = opt.valueKey;
                          return (
                            <option key={`${group.label}-${key}`} value={key}>
                              {opt.label}
                            </option>
                          );
                        })}
                      </optgroup>
                    )
                )}
              </select>
            </label>
            <label className="form-field">
              <span>Destination</span>
              <select
                value={destinationOptionKey}
                onChange={(e) => {
                  const key = e.target.value;
                  setDestinationOptionKey(key);
                  const opt = findOptionByKey(key);
                  setForm((prev) => ({ ...prev, destination: opt ? opt.label : '' }));
                }}
                required
              >
                <option value="">Select destination</option>
                {locationGroups.map(
                  (group) =>
                    group.options.length > 0 && (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((opt) => {
                          const key = opt.valueKey;
                          return (
                            <option key={`${group.label}-${key}`} value={key}>
                              {opt.label}
                            </option>
                          );
                        })}
                      </optgroup>
                    )
                )}
              </select>
            </label>
            <label className="form-field">
              <span>Passenger count</span>
              <input
                type="number"
                min={0}
                value={form.passenger_count}
                onChange={(e) => setForm((prev) => ({ ...prev, passenger_count: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Scheduled at</span>
              <Flatpickr
                value={toEventLocalPickerDate(form.scheduled_at)}
                options={{
                  enableTime: true,
                  dateFormat: 'Y-m-d H:i',
                  time_24hr: true,
                  defaultDate: closestEventDate(form.scheduled_at)
                }}
                onChange={(dates) => {
                  const date = dates[0];
                  setForm((prev) => ({
                    ...prev,
                    scheduled_at: date ? fromEventLocalPickerDate(date) : ''
                  }));
                }}
              />
            </label>
          </div>
        </article>

        <article className="card">
          <div className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Vehicles</span>
            {selectedVehicleIds.length > 0 && (
              <ul className="status-list" style={{ marginTop: '0.5rem' }}>
                {selectedVehicleIds.map((id) => {
                  const v = existingVehicles.find((ev) => ev.id === id);
                  if (!v) return null;
                  return (
                    <li key={id}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          justifyContent: 'space-between',
                          width: '100%'
                        }}
                      >
                        <Link
                          to={`/logistics/vehicles/${v.id}`}
                          className="card-link"
                          style={{ flex: 1, textDecoration: 'none' }}
                        >
                          <strong>{v.name}</strong>
                          <div className="muted">
                            {v.driver ? `Driver: ${v.driver} • ` : ''}
                            Capacity: {v.passenger_capacity}
                          </div>
                          {v.notes && <div className="muted">Notes: {v.notes}</div>}
                        </Link>
                        <button type="button" className="ghost danger" onClick={() => handleRemoveVehicle(id)}>
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {existingVehicles.length > 0 && (
              <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                <label className="form-field">
                  <span>Add vehicle</span>
                  <div className="form-actions" style={{ gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value=""
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        if (!id) return;
                        if (selectedVehicleIds.includes(id)) return;
                        setSelectedVehicleIds((prev) => [...prev, id]);
                      }}
                    >
                      <option value="">Choose vehicle</option>
                      {existingVehicles
                        .filter((v) => v.event_id === Number(selectedEventId))
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} {v.driver ? `(${v.driver})` : ''} • {v.passenger_capacity} pax
                          </option>
                        ))}
                    </select>
                  </div>
                </label>
              </div>
            )}
            <div
              className="form-actions"
              style={{ marginTop: '0.5rem', justifyContent: 'flex-start', marginLeft: '-1.5rem' }}
            >
              <button type="button" className="ghost" onClick={handleAddVehicle}>
                Create new vehicle
              </button>
            </div>
            {showVehicleForm && (
              <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                <label className="form-field">
                  <span>Vehicle name</span>
                  <input
                    type="text"
                    value={newVehicle.name}
                    onChange={(e) => setNewVehicle((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Driver</span>
                  <input
                    type="text"
                    value={newVehicle.driver}
                    onChange={(e) => setNewVehicle((prev) => ({ ...prev, driver: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span>Passenger capacity</span>
                  <input
                    type="number"
                    min={0}
                    value={newVehicle.passenger_capacity}
                    onChange={(e) =>
                      setNewVehicle((prev) => ({ ...prev, passenger_capacity: e.target.value }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={newVehicle.notes}
                    onChange={(e) => setNewVehicle((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </label>
                <div className="form-actions">
                  <button type="button" className="primary" onClick={handleSaveNewVehicle}>
                    Save vehicle
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setShowVehicleForm(false);
                      setNewVehicle({ name: '', driver: '', passenger_capacity: '', notes: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </article>

        <div className="form-actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create ground crew'}
          </button>
          {message && <span className="muted">{message}</span>}
        </div>
      </form>
    </section>
  );
};

export default LogisticsGroundCrewCreatePage;
