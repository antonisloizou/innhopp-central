import { FormEvent, useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Event,
  Innhopp,
  InnhoppInput,
  LandOwner,
  LandingArea,
  UpdateInnhoppPayload,
  createInnhopp,
  getEvent,
  getInnhopp,
  updateInnhopp,
  deleteInnhopp
} from '../api/events';
import { Airfield, CreateAirfieldPayload, createAirfield, listAirfields } from '../api/airfields';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';

const formatUTC = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours() - date.getTimezoneOffset() / 60
  )}:${pad(date.getUTCMinutes())}`;
};

const toPickerDate = (iso?: string) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
};

const fromPickerDateToISO = (date: Date) => {
  const utcTime = date.getTime() - date.getTimezoneOffset() * 60000;
  return new Date(utcTime).toISOString();
};

const evtCache: { current: Record<number, Event> } = { current: {} };

const dmsRegex = /(\d{1,3})°(\d{1,2})'(\d{1,2}(?:\.\d+)?)"?([NSEW])/i;

const parseSingleDMS = (value: string): number | null => {
  const match = value.trim().match(dmsRegex);
  if (!match) return null;
  const [, degStr, minStr, secStr, hemiRaw] = match;
  const deg = Number(degStr);
  const min = Number(minStr);
  const sec = Number(secStr);
  const hemi = hemiRaw.toUpperCase();
  if (Number.isNaN(deg) || Number.isNaN(min) || Number.isNaN(sec)) return null;
  const decimal = deg + min / 60 + sec / 3600;
  if (hemi === 'S' || hemi === 'W') {
    return -decimal;
  }
  return decimal;
};

const parseCoordinatePair = (raw?: string | null): { lat: number; lon: number } | null => {
  if (!raw) return null;
  const global = new RegExp(dmsRegex.source, 'ig');
  const matches = Array.from(raw.matchAll(global));
  if (matches.length < 2) return null;
  const first = parseSingleDMS(matches[0][0]);
  const second = parseSingleDMS(matches[1][0]);
  if (first == null || second == null) return null;
  // Determine which is lat vs lon by hemisphere
  const firstHemi = matches[0][4].toUpperCase();
  const secondHemi = matches[1][4].toUpperCase();
  if ((firstHemi === 'N' || firstHemi === 'S') && (secondHemi === 'E' || secondHemi === 'W')) {
    return { lat: first, lon: second };
  }
  if ((firstHemi === 'E' || firstHemi === 'W') && (secondHemi === 'N' || secondHemi === 'S')) {
    return { lat: second, lon: first };
  }
  return { lat: first, lon: second };
};

const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

type LandingAreaForm = {
  name: string;
  description: string;
  size: string;
  obstacles: string;
};

type LandOwnerForm = {
  name: string;
  telephone: string;
  email: string;
};

const emptyLandingArea = (): LandingAreaForm => ({
  name: '',
  description: '',
  size: '',
  obstacles: ''
});

const hasText = (value?: string | null) => !!value && value.trim().length > 0;
const hasNumber = (value?: number | null) => value !== null && value !== undefined && Number.isFinite(value);
const hasBoolean = (value?: boolean | null) => value !== null && value !== undefined;

const toLandingAreaForm = (area?: LandingArea | null): LandingAreaForm => ({
  name: area?.name || '',
  description: area?.description || '',
  size: area?.size || '',
  obstacles: area?.obstacles || ''
});

const toLandOwnerForms = (owners?: LandOwner[] | null): LandOwnerForm[] =>
  Array.isArray(owners)
    ? owners.map((owner) => ({
        name: owner.name || '',
        telephone: owner.telephone || '',
        email: owner.email || ''
      }))
    : [];

const compactLandOwners = (owners: LandOwnerForm[]) =>
  owners.filter((owner) => {
    const name = owner.name?.trim();
    const telephone = owner.telephone?.trim();
    const email = owner.email?.trim();
    return !!(name || telephone || email);
  });

const toLandingAreaPayload = (area: LandingAreaForm): LandingArea => ({
  name: area.name.trim(),
  description: area.description.trim(),
  size: area.size.trim(),
  obstacles: area.obstacles.trim()
});

type InnhoppFormState = Omit<InnhoppInput, 'land_owners' | 'primary_landing_area' | 'secondary_landing_area'> & {
  land_owners: LandOwnerForm[];
  primary_landing_area: LandingAreaForm;
  secondary_landing_area: LandingAreaForm;
  rescue_boat?: boolean | null;
  land_owner_permission?: boolean | null;
};

const InnhoppDetailPage = () => {
  const { eventId, innhoppId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isCreateMode = !innhoppId || innhoppId === 'new';
  const [eventData, setEventData] = useState<Event | null>(null);
  const [innhopp, setInnhopp] = useState<Innhopp | null>(null);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [takeoffSelectValue, setTakeoffSelectValue] = useState<string>('');
  const initialFormState: InnhoppFormState = {
    name: '',
    sequence: 1,
    coordinates: '',
    scheduled_at: '',
    notes: '',
    takeoff_airfield_id: undefined,
    elevation: undefined,
    reason_for_choice: '',
    adjust_altimeter_aad: '',
    notam: '',
    distance_by_air: undefined,
    distance_by_road: undefined,
    primary_landing_area: emptyLandingArea(),
    secondary_landing_area: emptyLandingArea(),
    risk_assessment: '',
    safety_precautions: '',
    jumprun: '',
    hospital: '',
    rescue_boat: undefined,
    minimum_requirements: '',
    land_owners: [],
    land_owner_permission: undefined
  };
  const [form, setForm] = useState<InnhoppFormState>(initialFormState);
  const [draftAirfield, setDraftAirfield] = useState<CreateAirfieldPayload>({
    name: '',
    elevation: 0,
    coordinates: '',
    description: ''
  });
  const [showNewAirfieldForm, setShowNewAirfieldForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [lastSavedSignature, setLastSavedSignature] = useState('');
  const saveButtonClass = `primary ${saved ? 'saved' : ''}`;
  const saveButtonLabel = saving ? 'Saving…' : saved ? 'Saved' : 'Save';
  const buildSignature = useCallback(
    (formState: typeof form) => JSON.stringify(formState),
    [form]
  );
  const currentSignature = useMemo(() => buildSignature(form), [buildSignature, form]);
  const [deleting, setDeleting] = useState(false);
  const elevationDifference = useMemo(() => {
    if (form.elevation == null) return null;
    const takeoffElevation = airfields.find((a) => a.id === form.takeoff_airfield_id)?.elevation;
    if (takeoffElevation == null) return null;
    return takeoffElevation - form.elevation;
  }, [form.elevation, form.takeoff_airfield_id, airfields]);

  const toInputDateTime = (iso?: string | null) => {
    if (!iso) return '';
    const trimmed = iso.trim();
    return new Date(trimmed).toISOString();
  };

  const resizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleTextareaInput = (event: FormEvent<HTMLTextAreaElement>) => {
    resizeTextarea(event.currentTarget);
  };

  const missingRequired = useMemo(
    () => ({
      sequence: !(form.sequence && form.sequence > 0),
      name: !hasText(form.name),
      coordinates: !hasText(form.coordinates),
      elevation: !hasNumber(form.elevation),
      scheduled_at: !hasText(form.scheduled_at),
      takeoff_airfield_id: !hasNumber(form.takeoff_airfield_id),
      distance_by_air: !hasNumber(form.distance_by_air),
      distance_by_road: !hasNumber(form.distance_by_road),
      jumprun: !hasText(form.jumprun),
      primary_name: !hasText(form.primary_landing_area.name),
      primary_description: !hasText(form.primary_landing_area.description),
      primary_size: !hasText(form.primary_landing_area.size),
      primary_obstacles: !hasText(form.primary_landing_area.obstacles),
      risk_assessment: !hasText(form.risk_assessment),
      safety_precautions: !hasText(form.safety_precautions),
      minimum_requirements: !hasText(form.minimum_requirements),
      hospital: !hasText(form.hospital),
      rescue_boat: !hasBoolean(form.rescue_boat)
    }),
    [form]
  );
  const ready = useMemo(() => Object.values(missingRequired).every((v) => !v), [missingRequired]);

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-autosize]');
    nodes.forEach((node) => resizeTextarea(node));
  }, [form]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) return;
      if (isCreateMode) {
        setInnhopp(null);
        setForm(initialFormState);
        setTakeoffSelectValue('');
      }
      setLoading(true);
      setError(null);
      try {
        if (!isCreateMode && innhoppId) {
          const target = await getInnhopp(Number(innhoppId));
          if (cancelled) return;
          setInnhopp(target);
          const defaultStart = target.scheduled_at
            ? null
            : (() => {
                if (target.event_id && evtCache.current?.[target.event_id]) {
                  const e = evtCache.current[target.event_id];
                  if (e.starts_at) {
                    const d = new Date(e.starts_at);
                    d.setHours(9, 0, 0, 0);
                    return d.toISOString();
                  }
                }
                return '';
              })();
          setForm({
            name: target.name,
            sequence: target.sequence,
            coordinates: target.coordinates || '',
            elevation: target.elevation ?? undefined,
            scheduled_at: toInputDateTime(target.scheduled_at) || defaultStart,
            notes: target.notes || '',
            takeoff_airfield_id: target.takeoff_airfield_id || undefined,
            reason_for_choice: target.reason_for_choice || '',
            adjust_altimeter_aad: target.adjust_altimeter_aad || '',
            notam: target.notam || '',
            distance_by_air: target.distance_by_air ?? undefined,
            distance_by_road: target.distance_by_road ?? undefined,
            primary_landing_area: toLandingAreaForm(target.primary_landing_area),
            secondary_landing_area: toLandingAreaForm(target.secondary_landing_area),
            risk_assessment: target.risk_assessment || '',
            safety_precautions: target.safety_precautions || '',
            jumprun: target.jumprun || '',
            hospital: target.hospital || '',
            rescue_boat: target.rescue_boat ?? undefined,
            minimum_requirements: target.minimum_requirements || '',
            land_owners: toLandOwnerForms(target.land_owners),
            land_owner_permission: target.land_owner_permission ?? undefined
          });
          setTakeoffSelectValue(target.takeoff_airfield_id ? String(target.takeoff_airfield_id) : '');
          // fetch event for context
          if (target.event_id) {
            try {
              const evt = await getEvent(target.event_id);
              if (!cancelled) {
                setEventData(evt);
                evtCache.current = { ...evtCache.current, [target.event_id]: evt };
                if (!target.scheduled_at && evt.starts_at) {
                  const d = new Date(evt.starts_at);
                  d.setHours(9, 0, 0, 0);
                  setForm((prev) => ({ ...prev, scheduled_at: d.toISOString() }));
                }
              }
            } catch {
              // ignore
            }
        }
        } else {
          // create mode: fetch event for defaults and optionally copy data
          const copy = (location.state as any)?.copyInnhopp as Innhopp | undefined;
          if (eventId) {
            try {
              const evt = await getEvent(Number(eventId));
              if (!cancelled) {
                setEventData(evt);
                evtCache.current = { ...evtCache.current, [evt.id]: evt };
                if (!copy?.scheduled_at && evt.starts_at) {
                  const d = new Date(evt.starts_at);
                  d.setHours(9, 0, 0, 0);
                  setForm((prev) => ({ ...prev, scheduled_at: d.toISOString() }));
                }
              }
            } catch {
              // ignore event load errors in create mode
            }
          }
          if (copy && !cancelled) {
            setForm({
              name: copy.name,
              sequence: copy.sequence,
              coordinates: copy.coordinates || '',
              elevation: copy.elevation ?? undefined,
              scheduled_at: toInputDateTime(copy.scheduled_at),
              notes: copy.notes || '',
              takeoff_airfield_id: copy.takeoff_airfield_id || undefined,
              reason_for_choice: copy.reason_for_choice || '',
              adjust_altimeter_aad: copy.adjust_altimeter_aad || '',
              notam: copy.notam || '',
              distance_by_air: copy.distance_by_air ?? undefined,
              distance_by_road: copy.distance_by_road ?? undefined,
              primary_landing_area: toLandingAreaForm(copy.primary_landing_area),
              secondary_landing_area: toLandingAreaForm(copy.secondary_landing_area),
              risk_assessment: copy.risk_assessment || '',
              safety_precautions: copy.safety_precautions || '',
              jumprun: copy.jumprun || '',
              hospital: copy.hospital || '',
              rescue_boat: copy.rescue_boat ?? undefined,
              minimum_requirements: copy.minimum_requirements || '',
              land_owners: toLandOwnerForms(copy.land_owners),
              land_owner_permission: copy.land_owner_permission ?? undefined
            });
            setTakeoffSelectValue(copy.takeoff_airfield_id ? String(copy.takeoff_airfield_id) : '');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load innhopp');
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
  }, [eventId, innhoppId, isCreateMode]);

  useEffect(() => {
    let cancelled = false;
    const loadAirfields = async () => {
      try {
        const data = await listAirfields();
        if (!cancelled) {
          setAirfields(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore load errors
      }
    };
    loadAirfields();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildPayload = (override?: Partial<InnhoppFormState>): UpdateInnhoppPayload => {
    const state = { ...form, ...override };
    const owners = compactLandOwners(state.land_owners || []);
    return {
      sequence: state.sequence,
      name: state.name.trim(),
      coordinates: state.coordinates?.trim(),
      scheduled_at: state.scheduled_at?.trim() || undefined,
      notes: state.notes?.trim() || '',
      elevation: state.elevation,
      takeoff_airfield_id: state.takeoff_airfield_id,
      reason_for_choice: state.reason_for_choice?.trim(),
      adjust_altimeter_aad: state.adjust_altimeter_aad?.trim(),
      notam: state.notam?.trim(),
      distance_by_air: state.distance_by_air,
      distance_by_road: state.distance_by_road,
      primary_landing_area: toLandingAreaPayload(state.primary_landing_area),
      secondary_landing_area: toLandingAreaPayload(state.secondary_landing_area),
      risk_assessment: state.risk_assessment?.trim(),
      safety_precautions: state.safety_precautions?.trim(),
      jumprun: state.jumprun?.trim(),
      hospital: state.hospital?.trim(),
      rescue_boat: state.rescue_boat ?? undefined,
      minimum_requirements: state.minimum_requirements?.trim(),
      land_owners: owners.map((owner) => ({
        name: owner.name.trim(),
        telephone: owner.telephone.trim(),
        email: owner.email.trim()
      })),
      land_owner_permission: state.land_owner_permission ?? undefined
    };
  };

  const handleLandingAreaChange = (
    targetArea: 'primary' | 'secondary',
    field: keyof LandingAreaForm,
    value: string
  ) => {
    setForm((prev) => {
      const nextArea =
        targetArea === 'primary'
          ? { ...prev.primary_landing_area, [field]: value }
          : { ...prev.secondary_landing_area, [field]: value };
      return targetArea === 'primary'
        ? { ...prev, primary_landing_area: nextArea }
        : { ...prev, secondary_landing_area: nextArea };
    });
  };

  const handleOwnerChange = (index: number, field: keyof LandOwnerForm, value: string) => {
    setForm((prev) => {
      const owners = [...(prev.land_owners || [])];
      owners[index] = { ...owners[index], [field]: value };
      return { ...prev, land_owners: owners };
    });
  };

  const handleAddOwner = () => {
    setForm((prev) => ({
      ...prev,
      land_owners: [...(prev.land_owners || []), { name: '', telephone: '', email: '' }]
    }));
  };

  const handleRemoveOwner = (index: number) => {
    setForm((prev) => ({
      ...prev,
      land_owners: (prev.land_owners || []).filter((_, idx) => idx !== index)
    }));
  };

  useEffect(() => {
    const innhoppCoords = parseCoordinatePair(form.coordinates);
    const takeoff = airfields.find((a) => a.id === form.takeoff_airfield_id);
    const takeoffCoords = parseCoordinatePair(takeoff?.coordinates);
    if (!innhoppCoords || !takeoffCoords) {
      return;
    }
    const km = haversineKm(innhoppCoords, takeoffCoords);
    const rounded = Math.round(km * 10) / 10;
    setForm((prev) => {
      if (prev.distance_by_air === rounded) return prev;
      return { ...prev, distance_by_air: rounded };
    });
  }, [form.coordinates, form.takeoff_airfield_id, airfields]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventId) return;
    setSaving(true);
    setMessage(null);
    setSaved(false);
    try {
      const payload = buildPayload();
      if (isCreateMode || !innhopp) {
        const created = await createInnhopp(Number(eventId), payload);
        setInnhopp(created);
        setMessage('Innhopp created');
        navigate(`/events/${eventId}/innhopps/${created.id}`, { replace: true, state: {} });
      } else {
        const updated = await updateInnhopp(innhopp.id, payload);
        setInnhopp(updated);
        setMessage('Innhopp updated');
      }
      setSaved(true);
      setLastSavedSignature(currentSignature);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save innhopp');
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!innhopp || !eventData || deleting) return;
    const confirmed = window.confirm('Are you sure you want to delete this innhopp? This cannot be undone.');
    if (!confirmed) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteInnhopp(innhopp.id);
      navigate(`/events/${eventData.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete innhopp');
      setDeleting(false);
    }
  };

  const handleCreateAirfield = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const created = await createAirfield({
        name: draftAirfield.name.trim(),
        elevation: Number(draftAirfield.elevation) || 0,
        coordinates: draftAirfield.coordinates.trim(),
        description: draftAirfield.description?.trim() || undefined
      });
      setAirfields((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, takeoff_airfield_id: created.id }));
      setTakeoffSelectValue(String(created.id));
      setShowNewAirfieldForm(false);
      setDraftAirfield({ name: '', elevation: 0, coordinates: '', description: '' });
      if (!innhopp) {
        setMessage('Airfield created and assigned as takeoff');
      } else {
        const payload = buildPayload({ takeoff_airfield_id: created.id });
        const updated = await updateInnhopp(innhopp.id, payload);
        setInnhopp(updated);
        setForm((prev) => ({ ...prev, takeoff_airfield_id: updated.takeoff_airfield_id || created.id }));
        setMessage('Airfield created, attached, and innhopp saved');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create airfield');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (saved && currentSignature !== lastSavedSignature) {
      setSaved(false);
    }
  }, [currentSignature, lastSavedSignature, saved]);

  if (loading) {
    return <p className="muted">Loading innhopp…</p>;
  }
  if (error) {
    return <p className="error-text">{error}</p>;
  }
  if (!eventData || (!innhopp && !isCreateMode)) {
    return <p className="error-text">Innhopp not found.</p>;
  }
  return (
    <section>
      <header className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>
              {eventData.name} — {isCreateMode ? 'New innhopp' : `#${innhopp?.sequence} ${innhopp?.name}`}
            </h2>
            {!isCreateMode && (
              <span className={`badge ${ready ? 'success' : 'danger'}`}>{ready ? 'OP READY' : 'MISSING INFO'}</span>
            )}
          </div>
        </div>
        <div className="card-actions">
          {!isCreateMode && (
            <button
              className="ghost"
              type="button"
              onClick={() =>
                navigate(`/events/${eventId}/innhopps/new`, {
                  state: { copyInnhopp: innhopp }
                })
              }
            >
              Make a copy
            </button>
          )}
          {!isCreateMode && (
            <button
              className="ghost danger"
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? 'Deleting…' : 'Delete innhopp'}
            </button>
          )}
          <button className="ghost" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </header>

      <form className="stack" onSubmit={handleSave}>
        <article className="card">
          <div className="form-grid">
            <label className={`form-field ${missingRequired.sequence ? 'field-missing' : ''}`}>
              <span>Sequence</span>
              <input
                type="number"
                min={1}
                value={form.sequence}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm((prev) => ({ ...prev, sequence: Number(e.target.value) }))}
              />
            </label>
            <label className={`form-field ${missingRequired.name ? 'field-missing' : ''}`}>
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Reason for choice</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.reason_for_choice || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, reason_for_choice: e.target.value }))}
                placeholder="Why this innhopp location was selected"
              />
            </label>
            <label className={`form-field ${missingRequired.coordinates ? 'field-missing' : ''}`}>
              <span>Coordinates (DMS)</span>
              <div className="input-with-button">
                <input
                  type="text"
                  value={form.coordinates || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, coordinates: e.target.value }))}
                  pattern={`^[0-9]{1,3}°[0-9]{1,2}'[0-9]{1,2}(?:\\.\\d+)?\"[NS]\\s[0-9]{1,3}°[0-9]{1,2}'[0-9]{1,2}(?:\\.\\d+)?\"[EW]$`}
                  title={`Use DMS format like 11°14'30.0\"N 73°42'59.7\"W`}
                  style={{ minWidth: '24ch' }}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={!form.coordinates?.trim()}
                  onClick={() => {
                    const coords = form.coordinates?.trim();
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
            <label className={`form-field ${missingRequired.elevation ? 'field-missing' : ''}`}>
              <span>Elevation (m)</span>
              <input
                type="number"
                min={0}
                value={form.elevation ?? ''}
                onFocus={(e) => {
                  const target = e.target as HTMLInputElement;
                  requestAnimationFrame(() => target.select());
                }}
                onClick={(e) => {
                  const target = e.target as HTMLInputElement;
                  requestAnimationFrame(() => target.select());
                }}
                onChange={(e) => setForm((prev) => ({ ...prev, elevation: Number(e.target.value) }))}
              />
            </label>
            <label className={`form-field ${missingRequired.scheduled_at ? 'field-missing' : ''}`}>
              <span>Scheduled at</span>
              <Flatpickr
                value={toPickerDate(form.scheduled_at || undefined)}
                options={{
                  enableTime: true,
                  time_24hr: true,
                  altInput: true,
                  altFormat: 'Y-m-d H:i',
                  dateFormat: 'Z',
                  formatDate: (date) => formatUTC(date),
                  parseDate: (datestr) => (datestr ? new Date(datestr) : null)
                }}
                onChange={(dates) => {
                  const picked = dates[0];
                  setForm((prev) => ({
                    ...prev,
                    scheduled_at: picked ? fromPickerDateToISO(picked) : ''
                  }));
                }}
                placeholder="Select date & time"
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="submit" className={saveButtonClass} disabled={saving || saved}>
              {saveButtonLabel}
            </button>
          </div>
        </article>

        <article className="card">
          <div className="form-grid">
            <label className={`form-field ${missingRequired.takeoff_airfield_id ? 'field-missing' : ''}`}>
              <span>Takeoff airfield</span>
              <select
                value={takeoffSelectValue || (showNewAirfieldForm ? '__new__' : '')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__new__') {
                    setShowNewAirfieldForm(true);
                    setTakeoffSelectValue('__new__');
                    setForm((prev) => ({ ...prev, takeoff_airfield_id: undefined }));
                    return;
                  }
                  setShowNewAirfieldForm(false);
                  setTakeoffSelectValue(val);
                  setForm((prev) => ({ ...prev, takeoff_airfield_id: val ? Number(val) : undefined }));
                }}
              >
                <option value="">Select airfield</option>
                <option value="__new__">Create new airfield…</option>
                {airfields.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.elevation ? `(${a.elevation} m)` : ''}
                  </option>
                ))}
              </select>
            </label>
            {showNewAirfieldForm && (
              <div
                className="form-grid"
                style={{
                  gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                  gridColumn: '1 / -1',
                  border: '1px dashed #c6d1dd',
                  padding: '1rem',
                  borderRadius: '10px',
                  marginTop: '0.5rem'
                }}
              >
                <label className="form-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={draftAirfield.name}
                    onChange={(e) => setDraftAirfield((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Elevation (m)</span>
                  <input
                    type="number"
                    min={0}
                    value={draftAirfield.elevation}
                    onFocus={(e) => {
                      const target = e.target as HTMLInputElement;
                      requestAnimationFrame(() => target.select());
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLInputElement;
                      requestAnimationFrame(() => target.select());
                    }}
                    onChange={(e) =>
                      setDraftAirfield((prev) => ({
                        ...prev,
                        elevation: Number(e.target.value)
                      }))
                    }
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Coordinates</span>
                  <div className="input-with-button">
                    <input
                      type="text"
                      value={draftAirfield.coordinates}
                      onChange={(e) =>
                        setDraftAirfield((prev) => ({
                          ...prev,
                          coordinates: e.target.value
                        }))
                      }
                      style={{ minWidth: '22ch' }}
                      required
                    />
                    <button
                      type="button"
                      className="ghost"
                      disabled={!draftAirfield.coordinates.trim()}
                      onClick={() => {
                        const coords = draftAirfield.coordinates.trim();
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
                  <span>Description</span>
                  <input
                    type="text"
                    value={draftAirfield.description || ''}
                    onChange={(e) =>
                      setDraftAirfield((prev) => ({
                        ...prev,
                        description: e.target.value
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button type="button" className="ghost" onClick={handleCreateAirfield} disabled={saving}>
                    {saving ? 'Creating…' : 'Create & attach'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setShowNewAirfieldForm(false);
                      setTakeoffSelectValue(form.takeoff_airfield_id ? String(form.takeoff_airfield_id) : '');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {elevationDifference !== null && (
              <label className="form-field">
                <span>Elevation difference</span>
                <input type="text" readOnly value={`${elevationDifference} m`} />
              </label>
            )}
            <label className="form-field">
              <span>Adjust altimeter / AAD</span>
              <input
                type="text"
                value={form.adjust_altimeter_aad || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, adjust_altimeter_aad: e.target.value }))}
                placeholder="Adjustment guidance"
              />
            </label>
            <label className="form-field">
              <span>NOTAM</span>
              <input
                type="text"
                value={form.notam || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, notam: e.target.value }))}
                placeholder="NOTAM reference or notes"
              />
            </label>
            <label className={`form-field ${missingRequired.distance_by_air ? 'field-missing' : ''}`}>
              <span>Distance by air (km)</span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.distance_by_air ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    distance_by_air: e.target.value ? Number(e.target.value) : undefined
                  }))
                }
                placeholder="Optional"
              />
            </label>
            <label className={`form-field ${missingRequired.distance_by_road ? 'field-missing' : ''}`}>
              <span>Distance by road (km)</span>
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.distance_by_road ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    distance_by_road: e.target.value ? Number(e.target.value) : undefined
                  }))
                }
              />
            </label>
            <label className={`form-field ${missingRequired.jumprun ? 'field-missing' : ''}`}>
              <span>Jumprun</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.jumprun || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, jumprun: e.target.value }))}
                placeholder="Heading, offset, wind notes"
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="submit" className={saveButtonClass} disabled={saving}>
              {saveButtonLabel}
            </button>
          </div>
        </article>

        <article className="card">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Primary landing area</span>
            </div>
            <label
              className={`form-field ${missingRequired.primary_name ? 'field-missing' : ''}`}
              style={{ gridColumn: '1 / -1' }}
            >
              <span>Name</span>
              <input
                type="text"
                value={form.primary_landing_area.name}
                onChange={(e) => handleLandingAreaChange('primary', 'name', e.target.value)}
              />
            </label>
            <label className={`form-field ${missingRequired.primary_size ? 'field-missing' : ''}`}>
              <span>Size and surface</span>
              <input
                type="text"
                value={form.primary_landing_area.size}
                onChange={(e) => handleLandingAreaChange('primary', 'size', e.target.value)}
                placeholder="Dimensions and surface"
              />
            </label>
            <label className={`form-field ${missingRequired.primary_obstacles ? 'field-missing' : ''}`}>
              <span>Obstacles</span>
              <input
                type="text"
                value={form.primary_landing_area.obstacles}
                onChange={(e) => handleLandingAreaChange('primary', 'obstacles', e.target.value)}
                placeholder="Powerlines, trees, terrain"
              />
            </label>
            <label className={`form-field ${missingRequired.primary_description ? 'field-missing' : ''}`} style={{ gridColumn: '1 / -1' }}>
              <span>Description</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.primary_landing_area.description}
                onChange={(e) => handleLandingAreaChange('primary', 'description', e.target.value)}
                placeholder="Surface, Obstacles, etc"
              />
            </label>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Secondary landing area</span>
            </div>
            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Name</span>
              <input
                type="text"
                value={form.secondary_landing_area.name}
                onChange={(e) => handleLandingAreaChange('secondary', 'name', e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Size and surface</span>
              <input
                type="text"
                value={form.secondary_landing_area.size}
                onChange={(e) => handleLandingAreaChange('secondary', 'size', e.target.value)}
                placeholder="Dimensions and surface"
              />
            </label>
            <label className="form-field">
              <span>Obstacles</span>
              <input
                type="text"
                value={form.secondary_landing_area.obstacles}
                onChange={(e) => handleLandingAreaChange('secondary', 'obstacles', e.target.value)}
                placeholder="Powerlines, trees, terrain"
              />
            </label>
            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Description</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.secondary_landing_area.description}
                onChange={(e) => handleLandingAreaChange('secondary', 'description', e.target.value)}
                placeholder="Surface, Obstacles, etc"
              />
            </label>
            <label className={`form-field ${missingRequired.risk_assessment ? 'field-missing' : ''}`} style={{ gridColumn: '1 / -1' }}>
              <span>Risk assessment</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.risk_assessment || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, risk_assessment: e.target.value }))}
                placeholder="Key risks and mitigations"
              />
            </label>
            <label className={`form-field ${missingRequired.safety_precautions ? 'field-missing' : ''}`} style={{ gridColumn: '1 / -1' }}>
              <span>Safety precautions</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.safety_precautions || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, safety_precautions: e.target.value }))}
                placeholder="Briefings and other measures"
              />
            </label>
            <label className={`form-field ${missingRequired.minimum_requirements ? 'field-missing' : ''}`} style={{ gridColumn: '1 / -1' }}>
              <span>Minimum requirements</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.minimum_requirements || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, minimum_requirements: e.target.value }))}
                placeholder="Experience level required"
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="submit" className={saveButtonClass} disabled={saving}>
              {saveButtonLabel}
            </button>
          </div>
        </article>

        <article className="card">
          <div className="form-grid">
            <label className={`form-field ${missingRequired.hospital ? 'field-missing' : ''}`}>
              <span>Hospital</span>
              <input
                type="text"
                value={form.hospital || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, hospital: e.target.value }))}
                placeholder="Nearest hospital / ETA"
              />
            </label>
            <label className={`form-field ${missingRequired.rescue_boat ? 'field-missing' : ''}`}>
              <span>Rescue boat</span>
              <select
                value={form.rescue_boat == null ? '' : form.rescue_boat ? 'yes' : 'no'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    rescue_boat: e.target.value === '' ? undefined : e.target.value === 'yes'
                  }))
                }
              >
                <option value="">Unknown</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label className="form-field">
              <span>Land owner permission</span>
              <select
                value={form.land_owner_permission == null ? '' : form.land_owner_permission ? 'yes' : 'no'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    land_owner_permission: e.target.value === '' ? undefined : e.target.value === 'yes'
                  }))
                }
              >
                <option value="">Unknown</option>
                <option value="yes">Granted</option>
                <option value="no">Pending / No</option>
              </select>
            </label>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Land owners</span>
              {(form.land_owners || []).length === 0 && <p className="muted">No land owners added yet.</p>}
              {(form.land_owners || []).map((owner, index) => (
                <div
                  key={index}
                  className="form-grid"
                  style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginBottom: '0.75rem' }}
                >
                  <label className="form-field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={owner.name}
                      onChange={(e) => handleOwnerChange(index, 'name', e.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Telephone</span>
                    <input
                      type="text"
                      value={owner.telephone}
                      onChange={(e) => handleOwnerChange(index, 'telephone', e.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={owner.email}
                      onChange={(e) => handleOwnerChange(index, 'email', e.target.value)}
                    />
                  </label>
                  <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                    <button type="button" className="ghost danger" onClick={() => handleRemoveOwner(index)}>
                      Remove owner
                    </button>
                  </div>
                </div>
              ))}
              <div className="form-actions">
                <button type="button" className="ghost" onClick={handleAddOwner}>
                  Add land owner
                </button>
              </div>
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="submit" className={saveButtonClass} disabled={saving}>
              {saveButtonLabel}
            </button>
          </div>
        </article>

        <article className="card">
          <div className="form-grid">
            <label className="form-field notes-field">
              <span>Notes</span>
              <input
                type="text"
                value={form.notes || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Exit altitude, landing brief…"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className={saveButtonClass} disabled={saving}>
                {saveButtonLabel}
              </button>
              {message && <span className="muted">{message}</span>}
            </div>
          </div>
        </article>
      </form>
      <p className="muted" style={{ marginTop: '0.5rem' }}>
        Fields highlighted in red are required for the Innhopp to be "OP READY". Fill them to clear the "MISSING INFO" status.
      </p>
    </section>
  );
};

export default InnhoppDetailPage;
