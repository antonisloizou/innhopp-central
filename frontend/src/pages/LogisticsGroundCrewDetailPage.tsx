import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import {
  deleteGroundCrew,
  getGroundCrew,
  updateGroundCrew,
  createEventVehicle,
  listEventVehicles,
  EventVehicle,
  TransportVehicle,
  UpdateGroundCrewPayload
} from '../api/logistics';
import { Event, listEvents, Accommodation, listAccommodations } from '../api/events';
import { Airfield, listAirfields } from '../api/airfields';
import { OtherLogistic, listOthers, Meal, listMeals } from '../api/logistics';
import { fromEventLocalPickerDate, parseEventLocal, toEventLocalPickerDate } from '../utils/eventDate';

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
  coordinates?: string | null;
  detailUrl?: string;
};

const hasText = (value?: string | null) => !!value && value.trim().length > 0;
const normalizeName = (val: string) => val.replace(/^#\s*\d+\s*/, '').trim().toLowerCase();

const LogisticsGroundCrewDetailPage = () => {
  const { groundCrewId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    pickup_location: '',
    destination: '',
    passenger_count: '',
    scheduled_at: '',
    notes: ''
  });
  const [saved, setSaved] = useState(false);
  const [loadedNotes, setLoadedNotes] = useState('');
  const [notesTouched, setNotesTouched] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [existingVehicles, setExistingVehicles] = useState<EventVehicle[]>([]);
  const [loadedVehicles, setLoadedVehicles] = useState<TransportVehicle[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [newVehicle, setNewVehicle] = useState<VehicleRow>({
    name: '',
    driver: '',
    passenger_capacity: '',
    notes: ''
  });
  const initialEventSet = useRef(true);
  const [pickupOptionKey, setPickupOptionKey] = useState('');
  const [destinationOptionKey, setDestinationOptionKey] = useState('');
  const saveButtonClass = `primary ${saved ? 'saved' : ''}`;
  const saveButtonLabel = submitting ? 'Saving…' : saved ? 'Saved' : 'Save';
  const markDirty = () => {
    if (saved) setSaved(false);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!groundCrewId) return;
      setLoading(true);
      setMessage(null);
      try {
        initialEventSet.current = true;
        const transport = await getGroundCrew(Number(groundCrewId));
        const [eventList, eventVehicles, airfieldList, accommodationList, otherList, mealList] = await Promise.all([
          listEvents(),
          listEventVehicles(),
          listAirfields(),
          transport.event_id ? listAccommodations(transport.event_id) : Promise.resolve([]),
          listOthers(),
          listMeals()
        ]);
        if (cancelled) return;
        setEvents(Array.isArray(eventList) ? eventList : []);
        setExistingVehicles(Array.isArray(eventVehicles) ? eventVehicles : []);
        setAirfields(Array.isArray(airfieldList) ? airfieldList : []);
        setAccommodations(Array.isArray(accommodationList) ? accommodationList : []);
        setOthers(Array.isArray(otherList) ? otherList.filter((o) => o.event_id === transport.event_id) : []);
        setMeals(Array.isArray(mealList) ? mealList.filter((m) => m.event_id === transport.event_id) : []);
        setLoadedVehicles(Array.isArray(transport.vehicles) ? transport.vehicles : []);
        const defaultScheduled = (() => {
          if (transport.scheduled_at) return transport.scheduled_at;
          const ev = eventList.find((e) => e.id === transport.event_id);
          if (ev?.starts_at) {
            const d = parseEventLocal(ev.starts_at);
            if (d) {
              d.setUTCHours(9, 0, 0, 0);
              return d.toISOString();
            }
          }
          return '';
        })();
        setForm({
          pickup_location: transport.pickup_location,
          destination: transport.destination,
          passenger_count: String(transport.passenger_count),
          scheduled_at: defaultScheduled,
          notes: transport.notes || ''
        });
        setLoadedNotes(transport.notes || '');
        setNotesTouched(false);
        setSelectedEventId(String(transport.event_id || ''));
        const vehiclesFromEventIds =
          Array.isArray(transport.vehicles) && transport.vehicles.length > 0
            ? transport.vehicles
                .map((v) => {
                  if (typeof v.event_vehicle_id === 'number') return v.event_vehicle_id;
                  if (typeof (v as any).id === 'number') return (v as any).id;
                  return undefined;
                })
                .filter((id): id is number => typeof id === 'number')
            : [];
        setSelectedVehicleIds(vehiclesFromEventIds);
        setSaved(false);
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Failed to load ground crew');
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
  }, [groundCrewId]);

  const handleAddVehicle = () => {
    markDirty();
    setShowVehicleForm(true);
    setNewVehicle({ name: '', driver: '', passenger_capacity: '', notes: '' });
  };

  const handleRemoveVehicle = (id: number) => {
    setSelectedVehicleIds((prev) => prev.filter((v) => v !== id));
    setLoadedVehicles((prev) =>
      prev.filter(
        (v, idx) => !(
          v.event_vehicle_id === id ||
          ((v as any).id && typeof (v as any).id === 'number' && (v as any).id === id) ||
          (!v.event_vehicle_id && !(v as any).id && idx === id)
        )
      )
    );
    markDirty();
  };

  useEffect(() => {
    if (initialEventSet.current) {
      initialEventSet.current = false;
      return;
    }
    setNotesTouched(false);
    setSelectedVehicleIds([]);
    setShowVehicleForm(false);
    setPickupOptionKey('');
    setDestinationOptionKey('');
    setForm((prev) => ({ ...prev, pickup_location: '', destination: '', notes: '' }));
    setSaved(false);
    // do not clear loadedVehicles so existing attached vehicles remain visible
    if (selectedEventId) {
      Promise.all([
        listAccommodations(Number(selectedEventId)),
        listOthers(),
        listMeals()
      ])
        .then(([accData, otherData, mealData]) => {
          setAccommodations(Array.isArray(accData) ? accData : []);
          setOthers(
            Array.isArray(otherData)
              ? otherData.filter((o) => o.event_id === Number(selectedEventId))
              : []
          );
          setMeals(
            Array.isArray(mealData)
              ? mealData.filter((m) => m.event_id === Number(selectedEventId))
              : []
          );
        })
        .catch(() => {
          setAccommodations([]);
          setOthers([]);
          setMeals([]);
        });
    } else {
      setAccommodations([]);
      setOthers([]);
      setMeals([]);
    }
    if (!form.scheduled_at && selectedEventId) {
      const ev = events.find((e) => e.id === Number(selectedEventId));
      if (ev?.starts_at) {
        const d = parseEventLocal(ev.starts_at);
        if (d) {
          d.setUTCHours(9, 0, 0, 0);
          setForm((prev) => ({ ...prev, scheduled_at: d.toISOString() }));
        }
      }
    }
  }, [selectedEventId]);

  const locationCoordinates = (name: string | null | undefined) => {
    const target = normalizeName(name || '');
    if (!target) return null;
    const accommodation = accommodations.find((a) => normalizeName(a.name || '') === target);
    if (accommodation?.coordinates) return accommodation.coordinates;
    const other = others.find((o) => normalizeName(o.name || '') === target);
    if (other?.coordinates) return other.coordinates;
    const af = airfields.find((a) => normalizeName(a.name || '') === target);
    if (af?.coordinates) return af.coordinates;
    return null;
  };

  const buildOptionKey = (type: LocationOption['type'], id: number | string, label: string) =>
    `${type}#${id ?? label}`;
  const normalizeLocationValue = (val: string) => val.toLowerCase().replace(/^#?\s*\d+\s*/, '').trim();

  const pickupOptions = (() => {
    const options: LocationOption[] = [];
    const event = events.find((e) => e.id === Number(selectedEventId));
    if (event?.innhopps?.length) {
      event.innhopps.forEach((inn) => {
        const label = `${inn.sequence ? `#${inn.sequence} ` : ''}${inn.name}`;
        options.push({
          label,
          valueKey: buildOptionKey('Innhopp', inn.id, label),
          type: 'Innhopp',
          coordinates: (inn as any).coordinates || null,
          detailUrl: event ? `/events/${event.id}/innhopps/${inn.id}` : undefined
        });
      });
    }
    if (event && Array.isArray(event.airfield_ids) && event.airfield_ids.length && airfields.length) {
      airfields
        .filter((af) => event.airfield_ids.includes(af.id))
        .forEach((af) => {
          options.push({
            label: af.name,
            valueKey: buildOptionKey('Airfield', af.id, af.name),
            type: 'Airfield',
            coordinates: af.coordinates || null,
            detailUrl: `/airfields/${af.id}`
          });
        });
    }
    if (accommodations.length) {
      accommodations.forEach((acc) => {
        options.push({
          label: acc.name,
          valueKey: buildOptionKey('Accommodation', acc.id, acc.name),
          type: 'Accommodation',
          coordinates: acc.coordinates || null,
          detailUrl: event ? `/events/${event.id}/accommodations/${acc.id}` : undefined
        });
      });
    }
    if (meals.length) {
      meals.forEach((meal) => {
        options.push({
          label: meal.name,
          valueKey: buildOptionKey('Meal', meal.id, meal.name),
          type: 'Meal',
          coordinates: (meal as any).coordinates || null,
          detailUrl: `/logistics/meals/${meal.id}`
        });
      });
    }
    if (others.length) {
      others.forEach((o) => {
        options.push({
          label: o.name,
          valueKey: buildOptionKey('Other', o.id, o.name),
          type: 'Other',
          coordinates: o.coordinates || null,
          detailUrl: `/logistics/others/${o.id}`
        });
      });
    }
    return options;
  })();
  const destinationOptions = pickupOptions.filter((opt) => opt.valueKey !== pickupOptionKey);

  const findOptionByKey = (key: string) => pickupOptions.find((opt) => opt.valueKey === key);
  const findOptionKeyByLabel = (label: string) =>
    pickupOptions.find((opt) => opt.label === label)?.valueKey ||
    pickupOptions.find(
      (opt) => normalizeLocationValue(opt.label) === normalizeLocationValue(label)
    )?.valueKey;
  const pickupHasCoordinates = (() => {
    const opt = findOptionByKey(pickupOptionKey);
    return !!opt && hasText(opt.coordinates);
  })();
  const destinationHasCoordinates = (() => {
    const opt = findOptionByKey(destinationOptionKey);
    return !!opt && hasText(opt.coordinates);
  })();
  const pickupCoordinates = (() => {
    const opt = findOptionByKey(pickupOptionKey);
    return opt?.coordinates?.trim();
  })();
  const destinationCoordinates = (() => {
    const opt = findOptionByKey(destinationOptionKey);
    return opt?.coordinates?.trim();
  })();
  const pickupDetailUrl = (() => {
    const opt = findOptionByKey(pickupOptionKey);
    return opt?.detailUrl;
  })();
  const destinationDetailUrl = (() => {
    const opt = findOptionByKey(destinationOptionKey);
    return opt?.detailUrl;
  })();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!groundCrewId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const payload: UpdateGroundCrewPayload = {
        pickup_location: form.pickup_location.trim(),
        destination: form.destination.trim(),
        passenger_count: Number(form.passenger_count) || 0,
        scheduled_at: form.scheduled_at ? form.scheduled_at : undefined,
        notes: form.notes.trim() || undefined,
        event_id: Number(selectedEventId)
      };
      const fallbackVehicleIds =
        selectedVehicleIds.length > 0
          ? [...selectedVehicleIds]
          : loadedVehicles
              .map((v) => v.event_vehicle_id)
              .filter((id): id is number => typeof id === 'number');
      payload.vehicle_ids = fallbackVehicleIds;
      if (showVehicleForm && newVehicle.name.trim()) {
        const created = await createEventVehicle({
          event_id: Number(selectedEventId),
          name: newVehicle.name.trim(),
          driver: newVehicle.driver.trim() || undefined,
          passenger_capacity: Number(newVehicle.passenger_capacity) || 0,
          notes: newVehicle.notes.trim() || undefined
        });
        payload.vehicle_ids = [...(payload.vehicle_ids || []), created.id];
      }
      await updateGroundCrew(Number(groundCrewId), payload);
      setMessage('Ground crew updated');
      setSaved(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update ground crew');
    } finally {
      setSubmitting(false);
    }
  };

  const transportComplete = (() => {
    const pickupCoords = locationCoordinates(form.pickup_location);
    const destCoords = locationCoordinates(form.destination);
    const passengerCount = Number(form.passenger_count);
    const hasPassengers = Number.isFinite(passengerCount) && passengerCount > 0;
    const hasVehicles =
      (Array.isArray(selectedVehicleIds) && selectedVehicleIds.length > 0) ||
      (Array.isArray(loadedVehicles) && loadedVehicles.length > 0);
    return (
      hasText(pickupCoords) &&
      hasText(destCoords) &&
      hasText(form.scheduled_at) &&
      hasPassengers &&
      hasVehicles
    );
  })();

  const handleDelete = async () => {
    if (!groundCrewId) return;
    if (!window.confirm('Are you sure you want to delete this ground crew entry?')) return;
    try {
      await deleteGroundCrew(Number(groundCrewId));
      navigate(-1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete ground crew');
    }
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
      setSaved(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create vehicle');
    }
  };

  useEffect(() => {
    if (!form.pickup_location) {
      setPickupOptionKey('');
      return;
    }
    if (!notesTouched && loadedNotes && !form.notes) {
      setForm((prev) => ({ ...prev, notes: loadedNotes }));
    }
    const direct = findOptionByKey(pickupOptionKey);
    if (direct && direct.label === form.pickup_location) return;
    const matchKey = findOptionKeyByLabel(form.pickup_location);
    if (matchKey && matchKey !== pickupOptionKey) {
      const match = findOptionByKey(matchKey);
      setPickupOptionKey(matchKey);
      if (match) setForm((prev) => ({ ...prev, pickup_location: match.label }));
    }
  }, [pickupOptions, form.pickup_location, pickupOptionKey, loadedNotes, notesTouched, form.notes]);

  useEffect(() => {
    if (!form.destination) {
      setDestinationOptionKey('');
      return;
    }
    if (!notesTouched && loadedNotes && !form.notes) {
      setForm((prev) => ({ ...prev, notes: loadedNotes }));
    }
    const direct = findOptionByKey(destinationOptionKey);
    if (direct && direct.label === form.destination) return;
    const matchKey = findOptionKeyByLabel(form.destination);
    if (matchKey && matchKey !== destinationOptionKey) {
      const match = findOptionByKey(matchKey);
      setDestinationOptionKey(matchKey);
      if (match) setForm((prev) => ({ ...prev, destination: match.label }));
    }
  }, [pickupOptions, form.destination, destinationOptionKey, loadedNotes, notesTouched, form.notes]);

  if (loading) {
    return <p className="muted">Loading ground crew…</p>;
  }

  const routeSummary =
    form.pickup_location && form.destination ? `${form.pickup_location} → ${form.destination}` : '';
  const canOpenRoute = !!(pickupCoordinates && destinationCoordinates);
  const routeLink = canOpenRoute
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        pickupCoordinates as string
      )}&destination=${encodeURIComponent(destinationCoordinates as string)}`
    : null;
  const missingPassengerCount = form.passenger_count === '' || Number.isNaN(Number(form.passenger_count));
  const missingScheduledAt = !hasText(form.scheduled_at);
  const missingVehicles = selectedVehicleIds.length === 0 && loadedVehicles.length === 0;

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

  return (
    <section>
      <header className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{routeSummary || 'Ground Crew Entry'}</h2>
            <span
              className={`badge ${transportComplete ? 'success' : 'danger'}`}
              aria-label={transportComplete ? 'Complete' : 'Missing info'}
              title={transportComplete ? 'Complete' : 'Missing info'}
              style={{ minWidth: '2.4ch', textAlign: 'center' }}
            >
              {transportComplete ? '✓' : '!'}
            </span>
          </div>
          {routeSummary && (
            <p>
              <button
                type="button"
                className="link-button"
                style={{ fontSize: '1.25em' }}
                disabled={!canOpenRoute}
                onClick={() => {
                  if (!routeLink) return;
                  window.open(routeLink, '_blank');
                }}
              >
                Open route in Maps
              </button>
            </p>
          )}
        </div>
        <div className="card-actions">
          <button
            className="ghost"
            type="button"
            onClick={() =>
              navigate('/logistics/ground-crew/new', {
                state: {
                  copyGroundCrew: {
                    event_id: selectedEventId,
                    pickup_location: form.pickup_location,
                    destination: form.destination,
                    passenger_count: form.passenger_count,
                    scheduled_at: form.scheduled_at,
                    notes: form.notes,
                    vehicle_ids: selectedVehicleIds,
                    vehicles: loadedVehicles.map((v) => ({
                      event_vehicle_id: v.event_vehicle_id,
                      name: v.name,
                      driver: v.driver,
                      passenger_capacity: v.passenger_capacity,
                      notes: v.notes
                    }))
                  }
                }
              })
            }
          >
            Make a copy
          </button>
          <button className="ghost" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
          <button className="ghost danger" type="button" onClick={handleDelete}>
            Delete route
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <article className="card">
          <div className="form-grid">
            <label className="form-field">
              <span>Event</span>
                  <div className="input-with-button">
                    <select
                      value={selectedEventId}
                      onChange={(e) => {
                        setSelectedEventId(e.target.value);
                        markDirty();
                      }}
                      required
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <option value="">Select event</option>
                      {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
                <span style={{ visibility: 'hidden' }}>Open in Maps</span>
              </div>
            </label>
            <label className={`form-field ${pickupOptionKey && !pickupHasCoordinates ? 'field-missing' : ''}`}>
              <span>Start location</span>
              <div className="input-with-button">
                <select
                  value={pickupOptionKey}
                onChange={(e) => {
                  const key = e.target.value;
                  setPickupOptionKey(key);
                  const opt = findOptionByKey(key);
                  markDirty();
                  setForm((prev) => ({ ...prev, pickup_location: opt ? opt.label : '' }));
                }}
                required
                style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">Select start location</option>
                {pickupOptions
                  .filter((opt) => opt.type === 'Innhopp' && opt.valueKey !== destinationOptionKey)
                  .length > 0 && (
                  <optgroup label="Innhopps">
                    {pickupOptions
                      .filter((opt) => opt.type === 'Innhopp' && opt.valueKey !== destinationOptionKey)
                      .map((opt) => (
                        <option key={`inn-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {pickupOptions
                  .filter((opt) => opt.type === 'Airfield' && opt.valueKey !== destinationOptionKey)
                  .length > 0 && (
                  <optgroup label="Airfields">
                    {pickupOptions
                      .filter((opt) => opt.type === 'Airfield' && opt.valueKey !== destinationOptionKey)
                      .map((opt) => (
                        <option key={`af-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {pickupOptions
                  .filter((opt) => opt.type === 'Accommodation' && opt.valueKey !== destinationOptionKey)
                  .length > 0 && (
                  <optgroup label="Accommodations">
                    {pickupOptions
                      .filter((opt) => opt.type === 'Accommodation' && opt.valueKey !== destinationOptionKey)
                      .map((opt) => (
                        <option key={`acc-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {pickupOptions.filter((opt) => opt.type === 'Meal' && opt.valueKey !== destinationOptionKey).length >
                  0 && (
                  <optgroup label="Meals">
                    {pickupOptions
                      .filter((opt) => opt.type === 'Meal' && opt.valueKey !== destinationOptionKey)
                      .map((opt) => (
                        <option key={`meal-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {pickupOptions.filter((opt) => opt.type === 'Other' && opt.valueKey !== destinationOptionKey).length >
                  0 && (
                  <optgroup label="Other">
                    {pickupOptions
                      .filter((opt) => opt.type === 'Other' && opt.valueKey !== destinationOptionKey)
                      .map((opt) => (
                        <option key={`other-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                </select>
                <button
                  type="button"
                  className="ghost"
                  disabled={!pickupCoordinates && !pickupDetailUrl}
                  onClick={() => {
                    if (pickupCoordinates) {
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickupCoordinates)}`,
                        '_blank'
                      );
                    } else if (pickupDetailUrl) {
                      navigate(pickupDetailUrl);
                    }
                  }}
                >
                  {pickupCoordinates ? 'Open in Maps' : 'Update location'}
                </button>
              </div>
            </label>
            <label className={`form-field ${destinationOptionKey && !destinationHasCoordinates ? 'field-missing' : ''}`}>
              <span>Destination</span>
              <div className="input-with-button">
                <select
                  value={destinationOptionKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setDestinationOptionKey(key);
                    const opt = findOptionByKey(key);
                    markDirty();
                    setForm((prev) => ({ ...prev, destination: opt ? opt.label : '' }));
                  }}
                  required
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">Select destination</option>
                {destinationOptions.filter((opt) => opt.type === 'Innhopp').length > 0 && (
                  <optgroup label="Innhopps">
                    {destinationOptions
                      .filter((opt) => opt.type === 'Innhopp' && opt.valueKey !== pickupOptionKey)
                      .map((opt) => (
                        <option key={`inn-d-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {destinationOptions.filter((opt) => opt.type === 'Airfield').length > 0 && (
                  <optgroup label="Airfields">
                    {destinationOptions
                      .filter((opt) => opt.type === 'Airfield' && opt.valueKey !== pickupOptionKey)
                      .map((opt) => (
                        <option key={`af-d-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {destinationOptions.filter((opt) => opt.type === 'Accommodation').length > 0 && (
                  <optgroup label="Accommodations">
                    {destinationOptions
                      .filter((opt) => opt.type === 'Accommodation' && opt.valueKey !== pickupOptionKey)
                      .map((opt) => (
                        <option key={`acc-d-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {destinationOptions.filter((opt) => opt.type === 'Meal').length > 0 && (
                  <optgroup label="Meals">
                    {destinationOptions
                      .filter((opt) => opt.type === 'Meal' && opt.valueKey !== pickupOptionKey)
                      .map((opt) => (
                        <option key={`meal-dest-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                {destinationOptions.filter((opt) => opt.type === 'Other').length > 0 && (
                  <optgroup label="Other">
                    {destinationOptions
                      .filter((opt) => opt.type === 'Other' && opt.valueKey !== pickupOptionKey)
                      .map((opt) => (
                        <option key={`other-dest-${opt.valueKey}`} value={opt.valueKey}>
                          {opt.label}
                        </option>
                      ))}
                  </optgroup>
                )}
                </select>
                <button
                  type="button"
                  className="ghost"
                  disabled={!destinationCoordinates && !destinationDetailUrl}
                  onClick={() => {
                    if (destinationCoordinates) {
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationCoordinates)}`,
                        '_blank'
                      );
                    } else if (destinationDetailUrl) {
                      navigate(destinationDetailUrl);
                    }
                  }}
                >
                  {destinationCoordinates ? 'Open in Maps' : 'Update location'}
                </button>
              </div>
            </label>
            <div className="form-field" style={{ gridColumn: '1 / -1', padding: 0 }}>
              <div
                className="form-grid"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}
              >
                <label className={`form-field ${missingPassengerCount ? 'field-missing' : ''}`} style={{ margin: 0 }}>
                  <span>Passenger count</span>
                  <input
                    type="number"
                    min={0}
                    value={form.passenger_count}
                    onChange={(e) => {
                      markDirty();
                      setForm((prev) => ({ ...prev, passenger_count: e.target.value }));
                    }}
                    required
                  />
                </label>
                <label className={`form-field ${missingScheduledAt ? 'field-missing' : ''}`} style={{ margin: 0 }}>
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
                      markDirty();
                      setForm((prev) => ({
                        ...prev,
                        scheduled_at: date ? fromEventLocalPickerDate(date) : ''
                      }));
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '0.5rem' }}>
            <button type="submit" className={saveButtonClass} disabled={submitting || saved}>
              {saveButtonLabel}
            </button>
          </div>
        </article>

        <article className="card">
          <div className={`form-field ${missingVehicles ? 'field-missing' : ''}`} style={{ gridColumn: '1 / -1' }}>
            <span>Vehicles</span>
            {(() => {
              type DisplayVehicle = {
                id: number;
                name: string;
                driver?: string;
                passenger_capacity: number;
                notes?: string;
                removable: boolean;
              };
              const items: DisplayVehicle[] =
                selectedVehicleIds.length > 0
                  ? selectedVehicleIds.reduce<DisplayVehicle[]>((acc, id) => {
                      const fromExisting = existingVehicles.find((ev) => ev.id === id);
                      if (fromExisting) {
                        acc.push({
                          id,
                          name: fromExisting.name,
                          driver: fromExisting.driver,
                          passenger_capacity: fromExisting.passenger_capacity,
                          notes: fromExisting.notes,
                          removable: true
                        });
                        return acc;
                      }
                      const fallback = loadedVehicles.find(
                        (lv) =>
                          lv.event_vehicle_id === id ||
                          ((lv as any).id && typeof (lv as any).id === 'number' && (lv as any).id === id)
                      );
                      if (fallback) {
                        acc.push({
                          id,
                          name: fallback.name,
                          driver: fallback.driver,
                          passenger_capacity: fallback.passenger_capacity,
                          notes: fallback.notes,
                          removable: true
                        });
                      }
                      return acc;
                    }, [])
                  : [];

              if (items.length === 0 && loadedVehicles.length > 0) {
                loadedVehicles.forEach((v, idx) => {
                  const removableId =
                    typeof v.event_vehicle_id === 'number'
                      ? v.event_vehicle_id
                      : (v as any).id && typeof (v as any).id === 'number'
                      ? (v as any).id
                      : idx;
                  items.push({
                    id: removableId as number,
                    name: v.name,
                    driver: v.driver,
                    passenger_capacity: v.passenger_capacity,
                    notes: v.notes,
                    removable: typeof v.event_vehicle_id === 'number' || typeof (v as any).id === 'number'
                  });
                });
              }

              if (items.length === 0) return null;

              return (
                <ul className="status-list" style={{ marginTop: '0.5rem' }}>
                  {items.map((entry, idx) => (
                    <li key={`${entry.id}-${idx}`}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          justifyContent: 'space-between',
                          width: '100%'
                        }}
                      >
                        {entry.removable ? (
                          <Link
                            to={{
                              pathname: `/logistics/vehicles/${entry.id}`,
                              search: groundCrewId ? `?groundCrewId=${groundCrewId}` : undefined
                            }}
                            className="card-link"
                            style={{ flex: 1 }}
                          >
                            <strong>{entry.name}</strong>
                            <div className="muted">
                              {entry.driver ? `Driver: ${entry.driver} • ` : ''}
                              Capacity: {entry.passenger_capacity}
                            </div>
                            {entry.notes && <div className="muted">Notes: {entry.notes}</div>}
                          </Link>
                        ) : (
                          <div style={{ flex: 1 }}>
                            <strong>{entry.name}</strong>
                            <div className="muted">
                              {entry.driver ? `Driver: ${entry.driver} • ` : ''}
                              Capacity: {entry.passenger_capacity}
                            </div>
                            {entry.notes && <div className="muted">Notes: {entry.notes}</div>}
                          </div>
                        )}
                        {entry.removable && (
                          <button type="button" className="ghost danger" onClick={() => handleRemoveVehicle(entry.id)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
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
                        markDirty();
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
                    onChange={(e) => {
                      markDirty();
                      setNewVehicle((prev) => ({ ...prev, name: e.target.value }));
                    }}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Driver</span>
                  <input
                    type="text"
                    value={newVehicle.driver}
                    onChange={(e) => {
                      markDirty();
                      setNewVehicle((prev) => ({ ...prev, driver: e.target.value }));
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Passenger capacity</span>
                  <input
                    type="number"
                    min={0}
                    value={newVehicle.passenger_capacity}
                    onChange={(e) => {
                      markDirty();
                      setNewVehicle((prev) => ({ ...prev, passenger_capacity: e.target.value }));
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={newVehicle.notes}
                    onChange={(e) => {
                      markDirty();
                      setNewVehicle((prev) => ({ ...prev, notes: e.target.value }));
                    }}
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
            <div className="form-actions" style={{ marginTop: '0.5rem' }}>
              <button type="submit" className={saveButtonClass} disabled={submitting || saved}>
                {saveButtonLabel}
              </button>
            </div>
          </div>
        </article>

        <article className="card">
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => {
                if (!notesTouched) setNotesTouched(true);
                markDirty();
                setForm((prev) => ({ ...prev, notes: e.target.value }));
              }}
              rows={3}
            />
          </label>
          <div className="form-actions" style={{ marginTop: '0.5rem' }}>
            <button type="submit" className={saveButtonClass} disabled={submitting || saved}>
              {saveButtonLabel}
            </button>
          </div>
        </article>
        {message && (
          <div className="form-actions" style={{ marginTop: '0.5rem' }}>
            <span className="muted">{message}</span>
          </div>
        )}
      </form>
    </section>
  );
};

export default LogisticsGroundCrewDetailPage;
