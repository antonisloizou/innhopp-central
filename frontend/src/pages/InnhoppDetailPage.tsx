import { FormEvent, useEffect, useMemo, useState, useCallback, useRef, DragEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Event,
  Innhopp,
  InnhoppInput,
  InnhoppImage,
  LandOwner,
  LandingArea,
  UpdateInnhoppPayload,
  createInnhopp,
  getEvent,
  getInnhopp,
  listEvents,
  updateInnhopp,
  deleteInnhopp
} from '../api/events';
import { Airfield, CreateAirfieldPayload, createAirfield, listAirfields } from '../api/airfields';
import { formatMetersWithFeet, metersToFeet } from '../utils/units';
import {
  formatEventLocalPickerDateTime,
  toEventLocalInput,
  fromEventLocalInput,
  fromEventLocalPickerDate,
  parseEventLocal,
  toEventLocalPickerDate
} from '../utils/eventDate';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';
import { googleMapsApiKey, hasConfiguredGoogleMapsApiKey } from '../config/google';
import { getBudgetAssumptions, getEventBudget } from '../api/budgets';
import { parseCoordinates } from '../utils/coordinates';

const evtCache: { current: Record<number, Event> } = { current: {} };

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

let googleMapsLoader: Promise<any> | null = null;

const loadGoogleMapsApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }
  if ((window as any).google?.maps) {
    return Promise.resolve((window as any).google.maps);
  }
  if (!hasConfiguredGoogleMapsApiKey) {
    return Promise.reject(new Error('Google Maps API key is not configured.'));
  }
  if (googleMapsLoader) return googleMapsLoader;

  googleMapsLoader = new Promise((resolve, reject) => {
    const callbackName = '__innhoppInitGoogleMapsInnhoppDetail';
    (window as any)[callbackName] = () => {
      resolve((window as any).google.maps);
      delete (window as any)[callbackName];
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&v=weekly&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      googleMapsLoader = null;
      delete (window as any)[callbackName];
      reject(new Error('Failed to load Google Maps.'));
    };
    document.head.appendChild(script);
  });

  return googleMapsLoader;
};

const formatDurationMinutes = (minutes?: number | null) => {
  if (!Number.isFinite(minutes) || (minutes as number) <= 0) return 'Unavailable';
  const total = Math.round(minutes as number);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
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
const isActionableTravelEstimateIssue = (reason: string) =>
  reason.includes('Google Maps API key is not configured') ||
  reason.includes('Failed to load Google Maps') ||
  reason.includes('Could not calculate a driving route') ||
  reason.includes('Failed to calculate driving route') ||
  reason.includes('Route duration could not be calculated.');

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

const formatLandOwnersForPayload = (owners: LandOwnerForm[]): LandOwner[] =>
  compactLandOwners(owners).map((owner) => ({
    name: owner.name.trim(),
    telephone: owner.telephone.trim(),
    email: owner.email.trim()
  }));

type InnhoppFormState = Omit<InnhoppInput, 'land_owners' | 'primary_landing_area' | 'secondary_landing_area'> & {
  land_owners: LandOwnerForm[];
  primary_landing_area: LandingAreaForm;
  secondary_landing_area: LandingAreaForm;
  rescue_boat?: boolean | null;
  land_owner_permission?: boolean | null;
  image_files: InnhoppImage[];
};

const InnhoppDetailPage = () => {
  const { eventId, innhoppId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isCreateMode = !innhoppId || innhoppId === 'new';
  const [eventData, setEventData] = useState<Event | null>(null);
  const [innhopp, setInnhopp] = useState<Innhopp | null>(null);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [takeoffSelectValue, setTakeoffSelectValue] = useState<string>('');
  const [landingSelectValue, setLandingSelectValue] = useState<string>('');
  const [sameLandingAsTakeoff, setSameLandingAsTakeoff] = useState(true);
  const initialFormState: InnhoppFormState = {
    name: '',
    sequence: 1,
    coordinates: '',
    scheduled_at: '',
    notes: '',
    takeoff_airfield_id: undefined,
    landing_airfield_id: undefined,
    elevation: undefined,
    reason_for_choice: '',
    adjust_altimeter_aad: '',
    notam: '',
    distance_by_air: undefined,
    distance_by_road: undefined,
    landing_distance_by_air: undefined,
    landing_distance_by_road: undefined,
    primary_landing_area: emptyLandingArea(),
    secondary_landing_area: emptyLandingArea(),
    risk_assessment: '',
    safety_precautions: '',
    jumprun: '',
    hospital: '',
    rescue_boat: undefined,
    minimum_requirements: '',
    land_owners: [],
    land_owner_permission: undefined,
    image_files: []
  };
  const [form, setForm] = useState<InnhoppFormState>(initialFormState);
  const [draftAirfield, setDraftAirfield] = useState<CreateAirfieldPayload>({
    name: '',
    elevation: 0,
    coordinates: '',
    description: ''
  });
  const [showNewAirfieldFormFor, setShowNewAirfieldFormFor] = useState<'takeoff' | 'landing' | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [lastSavedSignature, setLastSavedSignature] = useState('');
  const [imagesDirty, setImagesDirty] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [drivingDurationMinutes, setDrivingDurationMinutes] = useState<number | null>(null);
  const [roadRouteLoading, setRoadRouteLoading] = useState(false);
  const [roadRouteError, setRoadRouteError] = useState<string | null>(null);
  const [landingDrivingDurationMinutes, setLandingDrivingDurationMinutes] = useState<number | null>(null);
  const [landingRoadRouteLoading, setLandingRoadRouteLoading] = useState(false);
  const [landingRoadRouteError, setLandingRoadRouteError] = useState<string | null>(null);
  const [budgetAircraftSpeedKmh, setBudgetAircraftSpeedKmh] = useState<number | null>(null);
  const [budgetFlightEstimateReason, setBudgetFlightEstimateReason] = useState<string | null>(null);
  const routeRequestRef = useRef(0);
  const lastFlyingUnavailableReasonRef = useRef<string | null>(null);
  const lastLandingFlyingUnavailableReasonRef = useRef<string | null>(null);
  const lastDrivingUnavailableReasonRef = useRef<string | null>(null);
  const lastLandingDrivingUnavailableReasonRef = useRef<string | null>(null);
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();
  const flyingDurationMinutes = useMemo(() => {
    if (!hasNumber(form.distance_by_air) || (form.distance_by_air as number) <= 0) return null;
    if (!hasNumber(budgetAircraftSpeedKmh) || (budgetAircraftSpeedKmh as number) <= 0) return null;
    return Math.round(((form.distance_by_air as number) / (budgetAircraftSpeedKmh as number)) * 60);
  }, [form.distance_by_air, budgetAircraftSpeedKmh]);
  const landingFlyingDurationMinutes = useMemo(() => {
    if (!hasNumber(form.landing_distance_by_air) || (form.landing_distance_by_air as number) <= 0) return null;
    if (!hasNumber(budgetAircraftSpeedKmh) || (budgetAircraftSpeedKmh as number) <= 0) return null;
    return Math.round(((form.landing_distance_by_air as number) / (budgetAircraftSpeedKmh as number)) * 60);
  }, [form.landing_distance_by_air, budgetAircraftSpeedKmh]);

  const extractImageFiles = (dt?: DataTransfer | null): File[] => {
    if (!dt) return [];
    const fromItems = Array.from(dt.items || [])
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .filter((file): file is File => !!file && file.type.startsWith('image/'));
    const fromFiles = Array.from(dt.files || []).filter((file) => file.type.startsWith('image/'));
    return fromItems.length ? fromItems : fromFiles;
  };
  const saveButtonClass = 'primary';
  const saveButtonLabel = saving ? 'Saving…' : 'Save';
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
  const groupedTakeoffAirfields = useMemo(() => {
    const groups = new Map<string, { label: string; options: { key: string; value: number; label: string }[] }>();
    airfields.forEach((airfield) => {
      const relatedEvents = allEvents.filter(
        (evt) => Array.isArray(evt.airfield_ids) && evt.airfield_ids.includes(airfield.id)
      );
      const locations = relatedEvents.length
        ? relatedEvents.map((evt) => evt.location || 'Location TBD')
        : ['Unassigned location'];
      locations.forEach((locationLabel, index) => {
        const label = locationLabel || 'Location TBD';
        if (!groups.has(label)) {
          groups.set(label, { label, options: [] });
        }
        groups.get(label)!.options.push({
          key: `${airfield.id}-${index}-${label}`,
          value: airfield.id,
          label: `${airfield.name}${airfield.elevation != null ? ` (${airfield.elevation} m)` : ''}`
        });
      });
    });
    return Array.from(groups.values());
  }, [airfields, allEvents]);

  const galleryImages = useMemo(
    () =>
      (form.image_files || [])
        .filter((img) => img?.data)
        .map((img, idx) => ({
          key: `${img.data.slice(0, 24)}-${idx}`,
          name: img.name || `Image ${idx + 1}`,
          mime: img.mime_type || 'image/*',
          data: img.data,
          src: `data:${img.mime_type || 'image/*'};base64,${img.data}`
        })),
    [form.image_files]
  );

  const toInputDateTime = (iso?: string | null) => {
    if (!iso) return '';
    return fromEventLocalInput(iso.trim());
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
      landing_airfield_id: !sameLandingAsTakeoff && !hasNumber(form.landing_airfield_id),
      distance_by_air: !hasNumber(form.distance_by_air),
      distance_by_road: !hasNumber(form.distance_by_road),
      landing_distance_by_air:
        !sameLandingAsTakeoff && !hasNumber(form.landing_distance_by_air),
      landing_distance_by_road:
        !sameLandingAsTakeoff && !hasNumber(form.landing_distance_by_road),
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
    [form, sameLandingAsTakeoff]
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
        setLandingSelectValue('');
        setSameLandingAsTakeoff(true);
        setImagesDirty(false);
      }
      setLoading(true);
      setError(null);
      try {
        if (!isCreateMode && innhoppId) {
          const target = await getInnhopp(Number(innhoppId));
          if (cancelled) return;
          setInnhopp(target);
          const defaultStart = target.scheduled_at
            ? ''
            : (() => {
                if (target.event_id && evtCache.current?.[target.event_id]) {
                  const e = evtCache.current[target.event_id];
                  if (e.starts_at) {
                    const d = parseEventLocal(e.starts_at);
                    if (!d) return '';
                    d.setUTCHours(9, 0, 0, 0);
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
            landing_airfield_id: target.landing_airfield_id || undefined,
            reason_for_choice: target.reason_for_choice || '',
            adjust_altimeter_aad: target.adjust_altimeter_aad || '',
            notam: target.notam || '',
            distance_by_air: target.distance_by_air ?? undefined,
            distance_by_road: target.distance_by_road ?? undefined,
            landing_distance_by_air: target.landing_distance_by_air ?? undefined,
            landing_distance_by_road: target.landing_distance_by_road ?? undefined,
            primary_landing_area: toLandingAreaForm(target.primary_landing_area),
            secondary_landing_area: toLandingAreaForm(target.secondary_landing_area),
            risk_assessment: target.risk_assessment || '',
            safety_precautions: target.safety_precautions || '',
            jumprun: target.jumprun || '',
            hospital: target.hospital || '',
            rescue_boat: target.rescue_boat ?? undefined,
            minimum_requirements: target.minimum_requirements || '',
            land_owners: toLandOwnerForms(target.land_owners),
            land_owner_permission: target.land_owner_permission ?? undefined,
            image_files: target.image_files || []
          });
          setImagesDirty(false);
          setTakeoffSelectValue(target.takeoff_airfield_id ? String(target.takeoff_airfield_id) : '');
          setLandingSelectValue(target.landing_airfield_id ? String(target.landing_airfield_id) : '');
          setSameLandingAsTakeoff(
            !target.landing_airfield_id ||
              target.landing_airfield_id === target.takeoff_airfield_id
          );
          // fetch event for context
          if (target.event_id) {
            try {
              const evt = await getEvent(target.event_id);
              if (!cancelled) {
                setEventData(evt);
                evtCache.current = { ...evtCache.current, [target.event_id]: evt };
                if (!target.scheduled_at && evt.starts_at) {
                  const d = parseEventLocal(evt.starts_at);
                  if (d) {
                    d.setUTCHours(9, 0, 0, 0);
                    setForm((prev) => ({ ...prev, scheduled_at: d.toISOString() }));
                  }
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
                  const d = parseEventLocal(evt.starts_at);
                  if (d) {
                    d.setUTCHours(9, 0, 0, 0);
                    setForm((prev) => ({ ...prev, scheduled_at: d.toISOString() }));
                  }
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
              landing_airfield_id: copy.landing_airfield_id || undefined,
              reason_for_choice: copy.reason_for_choice || '',
              adjust_altimeter_aad: copy.adjust_altimeter_aad || '',
              notam: copy.notam || '',
              distance_by_air: copy.distance_by_air ?? undefined,
              distance_by_road: copy.distance_by_road ?? undefined,
              landing_distance_by_air: copy.landing_distance_by_air ?? undefined,
              landing_distance_by_road: copy.landing_distance_by_road ?? undefined,
              primary_landing_area: toLandingAreaForm(copy.primary_landing_area),
              secondary_landing_area: toLandingAreaForm(copy.secondary_landing_area),
              risk_assessment: copy.risk_assessment || '',
              safety_precautions: copy.safety_precautions || '',
              jumprun: copy.jumprun || '',
              hospital: copy.hospital || '',
              rescue_boat: copy.rescue_boat ?? undefined,
              minimum_requirements: copy.minimum_requirements || '',
              land_owners: toLandOwnerForms(copy.land_owners),
              land_owner_permission: copy.land_owner_permission ?? undefined,
              image_files: copy.image_files || []
            });
            setImagesDirty(false);
            setTakeoffSelectValue(copy.takeoff_airfield_id ? String(copy.takeoff_airfield_id) : '');
            setLandingSelectValue(copy.landing_airfield_id ? String(copy.landing_airfield_id) : '');
            setSameLandingAsTakeoff(
              !copy.landing_airfield_id || copy.landing_airfield_id === copy.takeoff_airfield_id
            );
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
    const loadBudgetSpeed = async () => {
      if (!eventId) return;
      setBudgetAircraftSpeedKmh(null);
      setBudgetFlightEstimateReason('No budget linked to this event.');
      try {
        const budget = await getEventBudget(Number(eventId));
        const assumptions = await getBudgetAssumptions(budget.id);
        if (cancelled) return;
        const speed = assumptions?.values?.aircraft_cruising_speed_kmh;
        if (typeof speed === 'number' && Number.isFinite(speed) && speed > 0) {
          setBudgetAircraftSpeedKmh(speed);
          setBudgetFlightEstimateReason(null);
          return;
        }
        setBudgetAircraftSpeedKmh(null);
        setBudgetFlightEstimateReason('Aircraft cruising speed is not set in the associated budget.');
      } catch (err) {
        if (cancelled) return;
        const status = (err as Error & { status?: number })?.status;
        if (status === 404) {
          setBudgetAircraftSpeedKmh(null);
          setBudgetFlightEstimateReason('No budget linked to this event.');
          return;
        }
        setBudgetAircraftSpeedKmh(null);
        setBudgetFlightEstimateReason('Could not load budget assumptions.');
      }
    };
    loadBudgetSpeed();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    const loadAirfieldContext = async () => {
      try {
        const [airfieldData, eventData] = await Promise.all([listAirfields(), listEvents()]);
        if (!cancelled) {
          setAirfields(Array.isArray(airfieldData) ? airfieldData : []);
          setAllEvents(Array.isArray(eventData) ? eventData : []);
        }
      } catch {
        // ignore load errors
      }
    };
    loadAirfieldContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildPayload = (override?: Partial<InnhoppFormState>): UpdateInnhoppPayload => {
    const state = { ...form, ...override };
    return {
      sequence: state.sequence,
      name: state.name.trim(),
      coordinates: state.coordinates?.trim() || '',
      scheduled_at: state.scheduled_at ? toEventLocalInput(state.scheduled_at) : '',
      notes: state.notes?.trim() || '',
      elevation: state.elevation,
      takeoff_airfield_id: state.takeoff_airfield_id,
      landing_airfield_id: sameLandingAsTakeoff
        ? state.takeoff_airfield_id
        : state.landing_airfield_id,
      reason_for_choice: state.reason_for_choice?.trim() || '',
      adjust_altimeter_aad: state.adjust_altimeter_aad?.trim() || '',
      notam: state.notam?.trim() || '',
      distance_by_air: state.distance_by_air,
      distance_by_road: state.distance_by_road,
      landing_distance_by_air: sameLandingAsTakeoff
        ? state.distance_by_air
        : state.landing_distance_by_air,
      landing_distance_by_road: sameLandingAsTakeoff
        ? state.distance_by_road
        : state.landing_distance_by_road,
      primary_landing_area: toLandingAreaPayload(state.primary_landing_area),
      secondary_landing_area: toLandingAreaPayload(state.secondary_landing_area),
      risk_assessment: state.risk_assessment?.trim() || '',
      safety_precautions: state.safety_precautions?.trim() || '',
      jumprun: state.jumprun?.trim() || '',
      hospital: state.hospital?.trim() || '',
      rescue_boat: state.rescue_boat ?? undefined,
      minimum_requirements: state.minimum_requirements?.trim() || '',
      land_owners: formatLandOwnersForPayload(state.land_owners || []),
      land_owner_permission: state.land_owner_permission ?? undefined
    };
  };

  const buildImagePayload = (images: InnhoppImage[]): InnhoppImage[] =>
    images.map((img) => ({
      name: img.name?.trim() || undefined,
      mime_type: img.mime_type?.trim() || undefined,
      data: img.data
    }));

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

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read file'));
          return;
        }
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const handleFilesSelected = async (fileList: FileList | File[] | null) => {
    if (!fileList || (fileList as FileList | File[]).length === 0) return;
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    try {
      const payloads: InnhoppImage[] = [];
      for (const file of files) {
        const data = await readFileAsBase64(file);
        payloads.push({
          name: file.name,
          mime_type: file.type || undefined,
          data
        });
      }
      const existing = form.image_files || [];
      const merged = [...existing];
      payloads.forEach((img) => {
        if (merged.some((m) => m.data === img.data)) return;
        merged.push(img);
      });
      const newItems = merged.length - existing.length;
      if (newItems > 0) {
        setActiveImageIndex(existing.length);
      }
      setForm((prev) => ({ ...prev, image_files: merged }));
      setImagesDirty(true);
      if (innhopp) {
        await autoSaveImages(merged);
      }
    } catch (err) {
      // ignore file read errors for now
    }
  };

  const handleRemoveImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      image_files: (prev.image_files || []).filter((_, idx) => idx !== index)
    }));
    setImagesDirty(true);
    if (lightboxIndex !== null && lightboxIndex === index) {
      setLightboxIndex(null);
    } else if (lightboxIndex !== null && index < lightboxIndex) {
      setLightboxIndex((prev) => (prev != null ? prev - 1 : null));
    }
    if (index === activeImageIndex && galleryImages.length > 1) {
      setActiveImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
    } else if (index < activeImageIndex) {
      setActiveImageIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: ReactClipboardEvent<HTMLDivElement>) => {
    const images = extractImageFiles(e.clipboardData);
    if (!images.length) return;
    e.preventDefault();
    handleFilesSelected(images);
  };

  useEffect(() => {
    const innhoppCoords = parseCoordinates(form.coordinates);
    const takeoff = airfields.find((a) => a.id === form.takeoff_airfield_id);
    const takeoffCoords = parseCoordinates(takeoff?.coordinates);
    if (!innhoppCoords || !takeoffCoords) {
      return;
    }
    const km = haversineKm(innhoppCoords, takeoffCoords);
    const rounded = Math.ceil(km);
    setForm((prev) => {
      if (prev.distance_by_air === rounded) return prev;
      return { ...prev, distance_by_air: rounded };
    });
  }, [form.coordinates, form.takeoff_airfield_id, airfields]);

  useEffect(() => {
    if (flyingDurationMinutes !== null) {
      lastFlyingUnavailableReasonRef.current = null;
      return;
    }
    let reason = 'Unknown reason.';
    if (!hasNumber(form.distance_by_air) || (form.distance_by_air as number) <= 0) {
      reason = 'distance_by_air is missing or zero.';
    } else if (!hasNumber(budgetAircraftSpeedKmh) || (budgetAircraftSpeedKmh as number) <= 0) {
      reason = budgetFlightEstimateReason || 'Aircraft cruising speed is unavailable.';
    }
    if (lastFlyingUnavailableReasonRef.current === reason) return;
    lastFlyingUnavailableReasonRef.current = reason;
    if (!isActionableTravelEstimateIssue(reason)) return;
    console.warn(`[InnhoppDetail] Flying time estimate unavailable: ${reason}`);
  }, [flyingDurationMinutes, form.distance_by_air, budgetAircraftSpeedKmh, budgetFlightEstimateReason]);

  useEffect(() => {
    let cancelled = false;
    if (sameLandingAsTakeoff) {
      setLandingDrivingDurationMinutes(drivingDurationMinutes);
      setLandingRoadRouteLoading(false);
      setLandingRoadRouteError(null);
      setForm((prev) => ({
        ...prev,
        landing_distance_by_road: prev.distance_by_road
      }));
      return;
    }
    const innhoppCoords = parseCoordinates(form.coordinates);
    const landing = airfields.find((a) => a.id === form.landing_airfield_id);
    const landingCoords = parseCoordinates(landing?.coordinates);
    if (!innhoppCoords || !landingCoords) {
      setLandingDrivingDurationMinutes(null);
      setLandingRoadRouteError(null);
      setLandingRoadRouteLoading(false);
      return;
    }
    if (!hasConfiguredGoogleMapsApiKey) {
      setLandingDrivingDurationMinutes(null);
      setLandingRoadRouteLoading(false);
      setLandingRoadRouteError('Google Maps API key is not configured.');
      return;
    }

    const requestId = routeRequestRef.current + 1;
    routeRequestRef.current = requestId;
    setLandingRoadRouteLoading(true);
    setLandingRoadRouteError(null);

    loadGoogleMapsApi()
      .then(async (maps) => {
        if (cancelled || routeRequestRef.current !== requestId) return;
        const { Route } = await maps.importLibrary('routes');
        return Route.computeRoutes({
          origin: { lat: landingCoords.lat, lng: landingCoords.lng },
          destination: { lat: innhoppCoords.lat, lng: innhoppCoords.lng },
          travelMode: maps.TravelMode.DRIVING,
          fields: ['legs']
        });
      })
      .then((result: any) => {
        if (!result || cancelled || routeRequestRef.current !== requestId) return;
        const leg = result.routes?.[0]?.legs?.[0];
        const distanceMeters = leg?.distanceMeters;
        const durationMillis = leg?.durationMillis;
        if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationMillis)) {
          throw new Error('Could not calculate a driving route.');
        }
        const roadKm = Math.ceil(distanceMeters / 1000);
        const durationMin = Math.round(durationMillis / 60000);
        setForm((prev) => {
          if (prev.landing_distance_by_road === roadKm) return prev;
          return { ...prev, landing_distance_by_road: roadKm };
        });
        setLandingDrivingDurationMinutes(durationMin);
      })
      .catch((err) => {
        if (cancelled || routeRequestRef.current !== requestId) return;
        setLandingDrivingDurationMinutes(null);
        setLandingRoadRouteError(err instanceof Error ? err.message : 'Failed to calculate driving route.');
      })
      .finally(() => {
        if (cancelled || routeRequestRef.current !== requestId) return;
        setLandingRoadRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sameLandingAsTakeoff, drivingDurationMinutes, form.coordinates, form.landing_airfield_id, airfields]);

  useEffect(() => {
    if (sameLandingAsTakeoff) {
      setForm((prev) => ({
        ...prev,
        landing_airfield_id: prev.takeoff_airfield_id,
        landing_distance_by_air: prev.distance_by_air
      }));
      return;
    }
    const innhoppCoords = parseCoordinates(form.coordinates);
    const landing = airfields.find((a) => a.id === form.landing_airfield_id);
    const landingCoords = parseCoordinates(landing?.coordinates);
    if (!innhoppCoords || !landingCoords) return;
    const km = haversineKm(innhoppCoords, landingCoords);
    const rounded = Math.ceil(km);
    setForm((prev) => {
      if (prev.landing_distance_by_air === rounded) return prev;
      return { ...prev, landing_distance_by_air: rounded };
    });
  }, [sameLandingAsTakeoff, form.coordinates, form.landing_airfield_id, airfields]);

  useEffect(() => {
    if (sameLandingAsTakeoff) {
      lastLandingFlyingUnavailableReasonRef.current = null;
      return;
    }
    if (landingFlyingDurationMinutes !== null) {
      lastLandingFlyingUnavailableReasonRef.current = null;
      return;
    }
    let reason = 'Unknown reason.';
    if (!hasNumber(form.landing_distance_by_air) || (form.landing_distance_by_air as number) <= 0) {
      reason = 'landing_distance_by_air is missing or zero.';
    } else if (!hasNumber(budgetAircraftSpeedKmh) || (budgetAircraftSpeedKmh as number) <= 0) {
      reason = budgetFlightEstimateReason || 'Aircraft cruising speed is unavailable.';
    }
    if (lastLandingFlyingUnavailableReasonRef.current === reason) return;
    lastLandingFlyingUnavailableReasonRef.current = reason;
    if (!isActionableTravelEstimateIssue(reason)) return;
    console.warn(`[InnhoppDetail] Landing flying time estimate unavailable: ${reason}`);
  }, [
    sameLandingAsTakeoff,
    landingFlyingDurationMinutes,
    form.landing_distance_by_air,
    budgetAircraftSpeedKmh,
    budgetFlightEstimateReason
  ]);

  useEffect(() => {
    let cancelled = false;
    const innhoppCoords = parseCoordinates(form.coordinates);
    const takeoff = airfields.find((a) => a.id === form.takeoff_airfield_id);
    const takeoffCoords = parseCoordinates(takeoff?.coordinates);
    if (!innhoppCoords || !takeoffCoords) {
      setDrivingDurationMinutes(null);
      setRoadRouteError(null);
      setRoadRouteLoading(false);
      return;
    }
    if (!hasConfiguredGoogleMapsApiKey) {
      setDrivingDurationMinutes(null);
      setRoadRouteLoading(false);
      setRoadRouteError('Google Maps API key is not configured.');
      return;
    }

    const requestId = routeRequestRef.current + 1;
    routeRequestRef.current = requestId;
    setRoadRouteLoading(true);
    setRoadRouteError(null);

    loadGoogleMapsApi()
      .then(async (maps) => {
        if (cancelled || routeRequestRef.current !== requestId) return;
        const { Route } = await maps.importLibrary('routes');
        return Route.computeRoutes({
          origin: { lat: takeoffCoords.lat, lng: takeoffCoords.lng },
          destination: { lat: innhoppCoords.lat, lng: innhoppCoords.lng },
          travelMode: maps.TravelMode.DRIVING,
          fields: ['legs']
        });
      })
      .then((result: any) => {
        if (!result || cancelled || routeRequestRef.current !== requestId) return;
        const leg = result.routes?.[0]?.legs?.[0];
        const distanceMeters = leg?.distanceMeters;
        const durationMillis = leg?.durationMillis;
        if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationMillis)) {
          throw new Error('Could not calculate a driving route.');
        }
        const roadKm = Math.ceil(distanceMeters / 1000);
        const durationMin = Math.round(durationMillis / 60000);
        setForm((prev) => {
          if (prev.distance_by_road === roadKm) return prev;
          return { ...prev, distance_by_road: roadKm };
        });
        setDrivingDurationMinutes(durationMin);
      })
      .catch((err) => {
        if (cancelled || routeRequestRef.current !== requestId) return;
        setDrivingDurationMinutes(null);
        setRoadRouteError(err instanceof Error ? err.message : 'Failed to calculate driving route.');
      })
      .finally(() => {
        if (cancelled || routeRequestRef.current !== requestId) return;
        setRoadRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.coordinates, form.takeoff_airfield_id, airfields]);

  useEffect(() => {
    if (roadRouteLoading) return;
    if (drivingDurationMinutes !== null) {
      lastDrivingUnavailableReasonRef.current = null;
      return;
    }
    const innhoppCoords = parseCoordinates(form.coordinates);
    const takeoff = airfields.find((a) => a.id === form.takeoff_airfield_id);
    const takeoffCoords = parseCoordinates(takeoff?.coordinates);
    const reason =
      roadRouteError ||
      (!innhoppCoords
        ? 'Innhopp coordinates are missing or invalid.'
        : !takeoffCoords
          ? 'Takeoff airfield coordinates are missing or invalid.'
          : !hasConfiguredGoogleMapsApiKey
            ? 'Google Maps API key is not configured.'
            : 'Route duration could not be calculated.');
    if (lastDrivingUnavailableReasonRef.current === reason) return;
    lastDrivingUnavailableReasonRef.current = reason;
    if (!isActionableTravelEstimateIssue(reason)) return;
    console.warn(`[InnhoppDetail] Driving time estimate unavailable: ${reason}`);
  }, [
    roadRouteLoading,
    drivingDurationMinutes,
    roadRouteError,
    form.coordinates,
    form.takeoff_airfield_id,
    airfields
  ]);

  useEffect(() => {
    if (sameLandingAsTakeoff) {
      lastLandingDrivingUnavailableReasonRef.current = null;
      return;
    }
    if (landingRoadRouteLoading) return;
    if (landingDrivingDurationMinutes !== null) {
      lastLandingDrivingUnavailableReasonRef.current = null;
      return;
    }
    const innhoppCoords = parseCoordinates(form.coordinates);
    const landing = airfields.find((a) => a.id === form.landing_airfield_id);
    const landingCoords = parseCoordinates(landing?.coordinates);
    const reason =
      landingRoadRouteError ||
      (!innhoppCoords
        ? 'Innhopp coordinates are missing or invalid.'
        : !landingCoords
          ? 'Landing airfield coordinates are missing or invalid.'
          : !hasConfiguredGoogleMapsApiKey
            ? 'Google Maps API key is not configured.'
            : 'Route duration could not be calculated.');
    if (lastLandingDrivingUnavailableReasonRef.current === reason) return;
    lastLandingDrivingUnavailableReasonRef.current = reason;
    if (!isActionableTravelEstimateIssue(reason)) return;
    console.warn(`[InnhoppDetail] Landing driving time estimate unavailable: ${reason}`);
  }, [
    sameLandingAsTakeoff,
    landingRoadRouteLoading,
    landingDrivingDurationMinutes,
    landingRoadRouteError,
    form.coordinates,
    form.landing_airfield_id,
    airfields
  ]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventId) return;
    setSaving(true);
    setMessage(null);
    setSaved(false);
    try {
      const payload = buildPayload();
      if (isCreateMode || imagesDirty) {
        payload.image_files = buildImagePayload(form.image_files || []);
      }
      if (isCreateMode || !innhopp) {
        const created = await createInnhopp(Number(eventId), payload);
        setInnhopp(created);
        navigate(`/events/${eventId}/innhopps/${created.id}`, { replace: true, state: {} });
      } else {
        const updated = await updateInnhopp(innhopp.id, payload);
        setInnhopp(updated);
      }
      if (isCreateMode || imagesDirty) {
        setImagesDirty(false);
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

  const autoSaveImages = async (nextImages: InnhoppImage[]) => {
    if (!eventId) return;
    if (!innhopp) {
      setMessage('Save the innhopp first to persist images.');
      return;
    }
    setSaving(true);
    setMessage(null);
    setSaved(false);
    try {
      const payload = buildPayload();
      payload.image_files = buildImagePayload(nextImages);
      const updated = await updateInnhopp(innhopp.id, payload);
      setInnhopp(updated);
      setForm((prev) => ({ ...prev, image_files: updated.image_files || nextImages }));
      setSaved(true);
      setImagesDirty(false);
      setLastSavedSignature(buildSignature({ ...form, image_files: nextImages }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save images');
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

  const handleCreateAirfield = async () => {
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
      const target = showNewAirfieldFormFor || 'takeoff';
      if (target === 'takeoff') {
        setForm((prev) => ({
          ...prev,
          takeoff_airfield_id: created.id,
          landing_airfield_id: sameLandingAsTakeoff ? created.id : prev.landing_airfield_id
        }));
        setTakeoffSelectValue(String(created.id));
        if (sameLandingAsTakeoff) {
          setLandingSelectValue(String(created.id));
        }
      } else {
        setForm((prev) => ({ ...prev, landing_airfield_id: created.id }));
        setLandingSelectValue(String(created.id));
      }
      setShowNewAirfieldFormFor(null);
      setDraftAirfield({ name: '', elevation: 0, coordinates: '', description: '' });
      if (!innhopp) {
      } else {
        const payload =
          target === 'takeoff'
            ? buildPayload({ takeoff_airfield_id: created.id })
            : buildPayload({ landing_airfield_id: created.id });
        const updated = await updateInnhopp(innhopp.id, payload);
        setInnhopp(updated);
        setForm((prev) => ({
          ...prev,
          takeoff_airfield_id: updated.takeoff_airfield_id || created.id,
          landing_airfield_id: updated.landing_airfield_id || prev.landing_airfield_id
        }));
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

  useEffect(() => {
    if (!actionMenuOpen) return;
    const handlePointer = (event: globalThis.MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!actionMenuRef.current || !target) return;
      if (!actionMenuRef.current.contains(target)) {
        setActionMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [actionMenuOpen]);

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      const images = extractImageFiles(e.clipboardData);
      if (!images.length) return;
      e.preventDefault();
      handleFilesSelected(images);
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, []);

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
    <section {...editGuardProps}>
      <header className="page-header">
        <div>
          <div className="innhopp-detail-header-row">
            <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
              <h2 className="innhopp-detail-title">
                {eventData.name} — {isCreateMode ? 'New innhopp' : `#${innhopp?.sequence} ${innhopp?.name}`}
              </h2>
            </DetailPageLockTitle>
            {!isCreateMode && (
              <span className={`badge ${ready ? 'success' : 'danger'} innhopp-detail-ready-badge`}>
                {ready ? 'OP READY' : '!'}
              </span>
            )}
          </div>
        </div>
        <div className="event-schedule-actions" ref={actionMenuRef}>
          <button
            className="ghost event-schedule-gear"
            type="button"
            aria-label={actionMenuOpen ? 'Close actions menu' : 'Open actions menu'}
            aria-expanded={actionMenuOpen}
            aria-controls="innhopp-detail-actions-menu"
            onClick={() => setActionMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.06.73 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.22 1.12-.52 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              />
            </svg>
          </button>
          {actionMenuOpen && (
            <div className="event-schedule-menu" id="innhopp-detail-actions-menu" role="menu">
              {!isCreateMode && (
                <button
                  className="event-schedule-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    setActionMenuOpen(false);
                    if (locked) {
                      showLockedNoticeAtEvent(event);
                      return;
                    }
                    navigate(`/events/${eventId}/innhopps/new`, {
                      state: { copyInnhopp: innhopp }
                    });
                  }}
                >
                  Make a copy
                </button>
              )}
              {!isCreateMode && (
                <button
                  className="event-schedule-menu-item danger"
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    setActionMenuOpen(false);
                    if (locked) {
                      showLockedNoticeAtEvent(event);
                      return;
                    }
                    handleDelete();
                  }}
                  disabled={saving || deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete innhopp'}
                </button>
              )}
              <button
                className="event-schedule-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenuOpen(false);
                  navigate(-1);
                }}
              >
                Back
              </button>
            </div>
          )}
        </div>
      </header>

      <form className="stack" onSubmit={handleSave}>
        <article className="card">
          <div className="form-grid">
            <div
              className="form-grid innhopp-detail-sequence-grid form-field-full-span"
            >
              <label
                className={`form-field innhopp-detail-sequence-field ${missingRequired.sequence ? 'field-missing' : ''}`}
              >
                <span>Sequence</span>
                <input
                  type="number"
                  min={1}
                  value={form.sequence}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm((prev) => ({ ...prev, sequence: Number(e.target.value) }))}
                  className="innhopp-detail-min-width-reset"
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
            </div>
            <label className="form-field">
              <span>Reason for choice</span>
              <input
                type="text"
                value={form.reason_for_choice || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, reason_for_choice: e.target.value }))}
                placeholder="Why this innhopp location was selected"
              />
            </label>
            <div
              className={`form-grid innhopp-location-grid form-field-full-span${
                form.coordinates?.trim() ? ' innhopp-location-grid--with-preview' : ''
              }`}
            >
              <div
                className={`form-grid innhopp-location-fields${
                  form.coordinates?.trim() ? ' innhopp-location-fields--with-preview' : ''
                }`}
              >
                <label className={`form-field ${missingRequired.coordinates ? 'field-missing' : ''}`}>
                  <span>Coordinates (DMS)</span>
                  <div className="input-with-button innhopp-detail-input-with-button">
                    <input
                      type="text"
                      value={form.coordinates || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, coordinates: e.target.value }))}
                      pattern={`^[0-9]{1,3}°[0-9]{1,2}'[0-9]{1,2}(?:\\.\\d+)?\"[NS]\\s[0-9]{1,3}°[0-9]{1,2}'[0-9]{1,2}(?:\\.\\d+)?\"[EW]$`}
                      title={`Use DMS format like 11°14'30.0\"N 73°42'59.7\"W`}
                      className="innhopp-detail-compact-input"
                    />
                    {form.coordinates?.trim() ? (
                      <button
                        type="button"
                        className="ghost innhopp-detail-map-link"
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
                    ) : null}
                  </div>
                </label>
                <div
                  className="form-grid innhopp-metric-grid innhopp-detail-auto-grid"
                >
                <label className={`form-field ${missingRequired.elevation ? 'field-missing' : ''}`}>
                  <span>Elevation (m)</span>
                  <div className="innhopp-detail-input-value-row">
                    <input
                      type="number"
                      min={0}
                      value={form.elevation ?? ''}
                      className="innhopp-detail-compact-input"
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
                    <span className="muted innhopp-detail-value-hint">
                      {form.elevation !== undefined && form.elevation !== null && !Number.isNaN(form.elevation)
                        ? `${metersToFeet(form.elevation)} ft`
                        : '— ft'}
                    </span>
                  </div>
                </label>
                </div>
                <div
                  className="form-grid innhopp-metric-grid innhopp-detail-auto-grid"
                >
                  <label className={`form-field ${missingRequired.scheduled_at ? 'field-missing' : ''}`}>
                    <span>Scheduled at</span>
                    <div className="innhopp-detail-compact-input-wrap">
                      <Flatpickr
                        value={toEventLocalPickerDate(form.scheduled_at || undefined)}
                        options={{
                          enableTime: true,
                          time_24hr: true,
                          altInput: true,
                          altInputClass: 'full-width-alt',
                          altFormat: 'Y-m-d H:i',
                          dateFormat: 'Y-m-d H:i',
                          formatDate: (date) => formatEventLocalPickerDateTime(date)
                        }}
                        className="innhopp-detail-full-width-input"
                        onChange={(dates) => {
                          const picked = dates[0];
                          setForm((prev) => ({
                            ...prev,
                            scheduled_at: picked ? fromEventLocalPickerDate(picked) : ''
                          }));
                        }}
                        placeholder="Select date & time"
                      />
                    </div>
                  </label>
                </div>
              </div>
              {form.coordinates?.trim() ? (
                <div className="form-field innhopp-location-preview innhopp-location-preview--with-map">
                  <span className="muted innhopp-detail-section-label">
                    Location preview
                  </span>
                  <div className="innhopp-detail-map-frame">
                    <iframe
                      title="Innhopp location preview"
                      src={`https://www.google.com/maps?q=${encodeURIComponent(form.coordinates.trim())}&t=k&z=15&output=embed`}
                      loading="lazy"
                      className="innhopp-detail-map-embed"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        <div className="form-actions innhopp-detail-save-actions">
          <button type="submit" className={saveButtonClass} disabled={saving}>
            {saveButtonLabel}
          </button>
        </div>
      </article>

        <article className="card">
          <div className="form-field form-field-full-span innhopp-detail-gallery-title">
            <span>Image gallery</span>
          </div>
          <div
            className={`form-grid innhopp-detail-gallery-grid${dragOver ? ' innhopp-detail-gallery-grid--drag-over' : ''}`}
            tabIndex={0}
            id="innhopp-gallery-card"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
          >
            {galleryImages.length ? (
              <div className="innhopp-detail-gallery-center">
                <div className="innhopp-detail-gallery-stack">
                <div className="innhopp-detail-gallery-carousel">
                  {galleryImages.length > 4 ? (
                    <button
                      type="button"
                      className="ghost innhopp-detail-gallery-arrow"
                      aria-label="Previous image"
                      disabled={galleryImages.length <= 1}
                      onClick={() =>
                        setActiveImageIndex((prev) =>
                          galleryImages.length ? (prev - 1 + galleryImages.length) % galleryImages.length : 0
                        )
                      }
                    >
                      ‹
                    </button>
                  ) : (
                    <div className="innhopp-detail-gallery-arrow-spacer" />
                  )}
                  <div
                    className="innhopp-detail-gallery-strip"
                  >
                    {galleryImages
                      .slice(activeImageIndex, activeImageIndex + 4)
                      .concat(
                        activeImageIndex + 4 > galleryImages.length
                          ? galleryImages.slice(0, activeImageIndex + 4 - galleryImages.length)
                          : []
                      )
                      .slice(0, Math.min(4, galleryImages.length))
                      .map((img, idx) => {
                        const absoluteIndex = (activeImageIndex + idx) % galleryImages.length;
                        return (
                          <figure
                            key={`${img.key}-${idx}`}
                            className="innhopp-detail-gallery-item"
                            onClick={() => setLightboxIndex(absoluteIndex)}
                          >
                            <button
                              type="button"
                              aria-label="Remove image"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveImage(absoluteIndex);
                              }}
                              className="innhopp-detail-gallery-remove"
                            >
                              ×
                            </button>
                            <div className="innhopp-detail-gallery-image-frame">
                              <img
                                src={img.src}
                                alt={`Image ${absoluteIndex + 1}`}
                                className="innhopp-detail-gallery-image"
                              />
                            </div>
                          </figure>
                        );
                      })}
                  </div>
                  {galleryImages.length > 4 ? (
                    <button
                      type="button"
                      className="ghost innhopp-detail-gallery-arrow"
                      aria-label="Next image"
                      disabled={galleryImages.length <= 1}
                      onClick={() =>
                        setActiveImageIndex((prev) =>
                          galleryImages.length ? (prev + 1) % galleryImages.length : 0
                        )
                      }
                    >
                      ›
                    </button>
                  ) : (
                    <div className="innhopp-detail-gallery-arrow-spacer" />
                  )}
                </div>
                {galleryImages.length > 4 ? (
                  <div className="innhopp-detail-gallery-dots">
                    {galleryImages.map((img, idx) => (
                      <button
                        key={img.key}
                        type="button"
                        aria-label={`Go to image ${idx + 1}`}
                        onClick={() => setActiveImageIndex(idx)}
                        className={`innhopp-detail-gallery-dot${
                          idx === activeImageIndex ? ' innhopp-detail-gallery-dot--active' : ''
                        }`}
                      />
                    ))}
                  </div>
                ) : null}
                </div>
              </div>
            ) : (
              <p className="muted innhopp-detail-empty-gallery">
                No images uploaded yet.
              </p>
            )}
            <div
              className={`form-actions upload-pane form-field-full-span innhopp-detail-upload-pane${
                dragOver ? ' innhopp-detail-upload-pane--drag-over' : ''
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="innhopp-detail-hidden-input"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <div className="innhopp-detail-upload-copy">
                <button
                  type="button"
                  className="ghost browse-button innhopp-detail-browse-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse your device
                </button>
                <span className="muted innhopp-detail-upload-hint">
                  or drag & drop / paste images into this box
                </span>
              </div>
              <span className="muted innhopp-detail-upload-count">
                {galleryImages.length} uploaded
              </span>
            </div>
            {lightboxIndex !== null &&
              galleryImages[lightboxIndex] &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  role="dialog"
                  aria-modal="true"
                  className="innhopp-detail-lightbox-backdrop"
                  onClick={() => setLightboxIndex(null)}
                >
                  <div className="innhopp-detail-lightbox-panel" onClick={(e) => e.stopPropagation()}>
                    <img
                      src={galleryImages[lightboxIndex].src}
                      alt={galleryImages[lightboxIndex].name}
                      className="innhopp-detail-lightbox-image"
                    />
                    <div
                      className={`innhopp-detail-lightbox-nav innhopp-detail-lightbox-nav--prev${
                        galleryImages.length > 1 ? '' : ' innhopp-detail-lightbox-nav--hidden'
                      }`}
                    >
                      <button
                        type="button"
                        className="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex((prev) =>
                            prev === null ? prev : (prev - 1 + galleryImages.length) % galleryImages.length
                          );
                        }}
                      >
                        ‹
                      </button>
                    </div>
                    <div
                      className={`innhopp-detail-lightbox-nav innhopp-detail-lightbox-nav--next${
                        galleryImages.length > 1 ? '' : ' innhopp-detail-lightbox-nav--hidden'
                      }`}
                    >
                      <button
                        type="button"
                        className="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex((prev) =>
                            prev === null ? prev : (prev + 1) % galleryImages.length
                          );
                        }}
                      >
                        ›
                      </button>
                    </div>
                    <button
                      type="button"
                      className="ghost danger innhopp-detail-lightbox-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex(null);
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>,
                document.body
              )}
          </div>
          <div className="form-actions innhopp-detail-save-actions">
            <button type="submit" className={saveButtonClass} disabled={saving}>
              {saveButtonLabel}
            </button>
          </div>
        </article>

        <article className="card">
          <div className="form-grid">
            <label className={`form-field ${missingRequired.takeoff_airfield_id ? 'field-missing' : ''}`}>
              <span>Takeoff airfield</span>
              <select
                value={takeoffSelectValue || (showNewAirfieldFormFor === 'takeoff' ? '__new__' : '')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__new__') {
                    setShowNewAirfieldFormFor('takeoff');
                    setTakeoffSelectValue('__new__');
                    setForm((prev) => ({ ...prev, takeoff_airfield_id: undefined }));
                    return;
                  }
                  setShowNewAirfieldFormFor(null);
                  setTakeoffSelectValue(val);
                  setForm((prev) => {
                    const takeoff = val ? Number(val) : undefined;
                    return {
                      ...prev,
                      takeoff_airfield_id: takeoff,
                      landing_airfield_id: sameLandingAsTakeoff ? takeoff : prev.landing_airfield_id
                    };
                  });
                  if (sameLandingAsTakeoff) {
                    setLandingSelectValue(val);
                  }
                }}
              >
                <option value="">Select airfield</option>
                <option value="__new__">Create new airfield…</option>
                {groupedTakeoffAirfields.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.key} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {showNewAirfieldFormFor === 'takeoff' && (
              <div
                className="form-grid form-field-full-span innhopp-detail-airfield-create-grid"
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
                  <input
                    type="text"
                    value={draftAirfield.coordinates}
                    onChange={(e) =>
                      setDraftAirfield((prev) => ({
                        ...prev,
                        coordinates: e.target.value
                      }))
                    }
                    className="innhopp-detail-full-width-input innhopp-detail-min-width-reset"
                    required
                  />
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
                <div className="form-actions form-field-full-span">
                  <button type="button" className="ghost" onClick={handleCreateAirfield} disabled={saving}>
                    {saving ? 'Creating…' : 'Create & attach'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setShowNewAirfieldFormFor(null);
                      setTakeoffSelectValue(form.takeoff_airfield_id ? String(form.takeoff_airfield_id) : '');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {elevationDifference !== null ? (
              <div
                className="form-grid form-field-full-span innhopp-detail-auto-grid"
              >
                <label className="form-field">
                  <span>Elevation difference</span>
                  <input type="text" readOnly value={`${elevationDifference} m`} />
                </label>
                <label className="form-field">
                  <span>Adjust altimeter / AAD</span>
                  <input
                    type="text"
                    value={form.adjust_altimeter_aad || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, adjust_altimeter_aad: e.target.value }))}
                    placeholder="Adjustment guidance"
                  />
                </label>
              </div>
            ) : (
              <label className="form-field">
                <span>Adjust altimeter / AAD</span>
                <input
                  type="text"
                  value={form.adjust_altimeter_aad || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, adjust_altimeter_aad: e.target.value }))}
                  placeholder="Adjustment guidance"
                />
              </label>
            )}
            <label className="form-field">
              <span>NOTAM</span>
              <input
                type="text"
                value={form.notam || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, notam: e.target.value }))}
                placeholder="NOTAM reference or notes"
              />
            </label>
            <div
              className="form-grid form-field-full-span innhopp-detail-distance-grid"
            >
              <label className={`form-field form-field-full-span ${missingRequired.distance_by_air ? 'field-missing' : ''}`}>
                <span>Distance by air (km)</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  className="innhopp-detail-compact-input"
                  value={form.distance_by_air ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    distance_by_air: e.target.value ? Number(e.target.value) : undefined
                  }))
                }
              />
                <span className="muted">
                  <span className="field-label">Flying time estimate:</span>{' '}
                  <span className="innhopp-detail-estimate-value">
                    {flyingDurationMinutes !== null
                      ? `${formatDurationMinutes(flyingDurationMinutes)} (${Math.round(
                          budgetAircraftSpeedKmh as number
                        )} km/h)`
                      : `Unavailable${budgetFlightEstimateReason ? ` (${budgetFlightEstimateReason})` : ''}`}
                  </span>
                </span>
            </label>
              <label className={`form-field form-field-full-span ${missingRequired.distance_by_road ? 'field-missing' : ''}`}>
                <span>Distance by road (km)</span>
                <div className="innhopp-detail-input-with-button">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    className="innhopp-detail-compact-input"
                    value={form.distance_by_road ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        distance_by_road: e.target.value ? Number(e.target.value) : undefined
                      }))
                    }
                  />
                  {form.coordinates?.trim() &&
                  airfields.find((a) => a.id === form.takeoff_airfield_id)?.coordinates?.trim() ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        const innCoords = form.coordinates?.trim();
                        const takeoffCoords = airfields.find((a) => a.id === form.takeoff_airfield_id)?.coordinates?.trim();
                        if (!innCoords || !takeoffCoords) return;
                        window.open(
                          `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                            takeoffCoords
                          )}&destination=${encodeURIComponent(innCoords)}&travelmode=driving`,
                          '_blank'
                        );
                      }}
                    >
                      Open route in Maps
                    </button>
                  ) : null}
                </div>
                {roadRouteLoading ? (
                  <span className="muted">
                    <span className="field-label">Driving time estimate:</span>{' '}
                    <span className="innhopp-detail-estimate-value">calculating…</span>
                  </span>
                ) : null}
                {!roadRouteLoading && roadRouteError ? (
                  <span className="muted">
                    <span className="field-label">Driving time estimate:</span>{' '}
                    <span className="innhopp-detail-estimate-value">unavailable</span>
                  </span>
                ) : null}
                {!roadRouteLoading && !roadRouteError && drivingDurationMinutes !== null ? (
                  <span className="muted">
                    <span className="field-label">Driving time estimate:</span>{' '}
                    <span className="innhopp-detail-estimate-value">
                      {formatDurationMinutes(drivingDurationMinutes)}
                    </span>
                  </span>
                ) : null}
              </label>
            </div>
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
            <div className="form-field form-field-full-span">
              <span>Landing airfield</span>
            </div>
            <label className="form-field form-field-full-span innhopp-detail-checkbox-field">
              <span className="innhopp-detail-checkbox-row">
                <input
                  type="checkbox"
                  checked={sameLandingAsTakeoff}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSameLandingAsTakeoff(checked);
                    if (checked) {
                      setForm((prev) => ({
                        ...prev,
                        landing_airfield_id: prev.takeoff_airfield_id,
                        landing_distance_by_air: prev.distance_by_air,
                        landing_distance_by_road: prev.distance_by_road
                      }));
                      setLandingSelectValue(takeoffSelectValue);
                    }
                  }}
                />{' '}
                <span className="innhopp-detail-checkbox-label">Same as take off</span>
              </span>
            </label>
            {!sameLandingAsTakeoff ? (
              <>
                <label className={`form-field ${missingRequired.landing_airfield_id ? 'field-missing' : ''}`}>
                  <span>Landing airfield</span>
                  <select
                    value={landingSelectValue || (showNewAirfieldFormFor === 'landing' ? '__new__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__new__') {
                        setShowNewAirfieldFormFor('landing');
                        setLandingSelectValue('__new__');
                        setForm((prev) => ({ ...prev, landing_airfield_id: undefined }));
                        return;
                      }
                      setShowNewAirfieldFormFor(null);
                      setLandingSelectValue(val);
                      setForm((prev) => ({ ...prev, landing_airfield_id: val ? Number(val) : undefined }));
                    }}
                  >
                    <option value="">Select airfield</option>
                    <option value="__new__">Create new airfield…</option>
                    {groupedTakeoffAirfields.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={`landing-${option.key}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {showNewAirfieldFormFor === 'landing' && (
                  <div className="form-grid form-field-full-span innhopp-detail-airfield-create-grid">
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
                        onChange={(e) => setDraftAirfield((prev) => ({ ...prev, elevation: Number(e.target.value) }))}
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Coordinates</span>
                      <input
                        type="text"
                        value={draftAirfield.coordinates}
                        onChange={(e) => setDraftAirfield((prev) => ({ ...prev, coordinates: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="form-field">
                      <span>Description</span>
                      <input
                        type="text"
                        value={draftAirfield.description || ''}
                        onChange={(e) => setDraftAirfield((prev) => ({ ...prev, description: e.target.value }))}
                      />
                    </label>
                    <div className="form-actions form-field-full-span">
                      <button type="button" className="ghost" onClick={handleCreateAirfield} disabled={saving}>
                        {saving ? 'Creating…' : 'Create & attach'}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setShowNewAirfieldFormFor(null);
                          setLandingSelectValue(form.landing_airfield_id ? String(form.landing_airfield_id) : '');
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <div className="form-grid form-field-full-span innhopp-detail-distance-grid">
                  <label className={`form-field form-field-full-span ${missingRequired.landing_distance_by_air ? 'field-missing' : ''}`}>
                    <span>Landing distance by air (km)</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className="innhopp-detail-compact-input"
                      value={form.landing_distance_by_air ?? ''}
                      readOnly
                    />
                    <span className="muted">
                      <span className="field-label">Flying time estimate:</span>{' '}
                      <span className="innhopp-detail-estimate-value">
                        {landingFlyingDurationMinutes !== null
                          ? `${formatDurationMinutes(landingFlyingDurationMinutes)} (${Math.round(
                              budgetAircraftSpeedKmh as number
                            )} km/h)`
                          : `Unavailable${budgetFlightEstimateReason ? ` (${budgetFlightEstimateReason})` : ''}`}
                      </span>
                    </span>
                  </label>
                  <label className={`form-field form-field-full-span ${missingRequired.landing_distance_by_road ? 'field-missing' : ''}`}>
                    <span>Landing distance by road (km)</span>
                    <div className="innhopp-detail-input-with-button">
                      <input
                        type="number"
                        min={0}
                        step="1"
                        className="innhopp-detail-compact-input"
                        value={form.landing_distance_by_road ?? ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            landing_distance_by_road: e.target.value ? Number(e.target.value) : undefined
                          }))
                        }
                      />
                      {form.coordinates?.trim() &&
                      airfields.find((a) => a.id === form.landing_airfield_id)?.coordinates?.trim() ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const innCoords = form.coordinates?.trim();
                            const landingCoords = airfields.find((a) => a.id === form.landing_airfield_id)?.coordinates?.trim();
                            if (!innCoords || !landingCoords) return;
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                                landingCoords
                              )}&destination=${encodeURIComponent(innCoords)}&travelmode=driving`,
                              '_blank'
                            );
                          }}
                        >
                          Open route in Maps
                        </button>
                      ) : null}
                    </div>
                    {landingRoadRouteLoading ? (
                      <span className="muted">
                        <span className="field-label">Driving time estimate:</span>{' '}
                        <span className="innhopp-detail-estimate-value">calculating…</span>
                      </span>
                    ) : null}
                    {!landingRoadRouteLoading && landingRoadRouteError ? (
                      <span className="muted">
                        <span className="field-label">Driving time estimate:</span>{' '}
                        <span className="innhopp-detail-estimate-value">unavailable</span>
                      </span>
                    ) : null}
                    {!landingRoadRouteLoading &&
                    !landingRoadRouteError &&
                    landingDrivingDurationMinutes !== null ? (
                      <span className="muted">
                        <span className="field-label">Driving time estimate:</span>{' '}
                        <span className="innhopp-detail-estimate-value">
                          {formatDurationMinutes(landingDrivingDurationMinutes)}
                        </span>
                      </span>
                    ) : null}
                  </label>
                </div>
              </>
            ) : null}
          </div>
          <div className="form-actions innhopp-detail-save-actions">
            <button type="submit" className={saveButtonClass} disabled={saving}>
              {saveButtonLabel}
            </button>
          </div>
        </article>

        <article className="card">
          <div className="form-grid innhopp-landing-grid innhopp-detail-auto-grid">
            <div className="form-field form-field-full-span">
              <span>Primary landing area</span>
            </div>
            <label
              className={`form-field form-field-full-span ${missingRequired.primary_name ? 'field-missing' : ''}`}
            >
              <span>Name</span>
              <input
                type="text"
                value={form.primary_landing_area.name}
                onChange={(e) => handleLandingAreaChange('primary', 'name', e.target.value)}
              />
            </label>
            <div
              className="form-grid innhopp-landing-pair form-field-full-span innhopp-detail-landing-pair"
            >
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
            </div>
            <label className={`form-field form-field-full-span ${missingRequired.primary_description ? 'field-missing' : ''}`}>
              <span>Description</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.primary_landing_area.description}
                onChange={(e) => handleLandingAreaChange('primary', 'description', e.target.value)}
                placeholder="Surface, Obstacles, etc"
              />
            </label>
            <div className="form-field form-field-full-span">
              <span>Secondary landing area</span>
            </div>
            <label className="form-field form-field-full-span">
              <span>Name</span>
              <input
                type="text"
                value={form.secondary_landing_area.name}
                onChange={(e) => handleLandingAreaChange('secondary', 'name', e.target.value)}
              />
            </label>
            <div
              className="form-grid innhopp-landing-pair form-field-full-span innhopp-detail-landing-pair"
            >
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
            </div>
            <label className="form-field form-field-full-span">
              <span>Description</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.secondary_landing_area.description}
                onChange={(e) => handleLandingAreaChange('secondary', 'description', e.target.value)}
                placeholder="Surface, Obstacles, etc"
              />
            </label>
            <label className={`form-field form-field-full-span ${missingRequired.risk_assessment ? 'field-missing' : ''}`}>
              <span>Risk assessment</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.risk_assessment || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, risk_assessment: e.target.value }))}
                placeholder="Key risks and mitigations"
              />
            </label>
            <label className={`form-field form-field-full-span ${missingRequired.safety_precautions ? 'field-missing' : ''}`}>
              <span>Safety precautions</span>
              <textarea
                data-autosize
                onInput={handleTextareaInput}
                value={form.safety_precautions || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, safety_precautions: e.target.value }))}
                placeholder="Briefings and other measures"
              />
            </label>
            <label className={`form-field form-field-full-span ${missingRequired.minimum_requirements ? 'field-missing' : ''}`}>
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
          <div className="form-actions innhopp-detail-save-actions">
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
            <div className="form-field form-field-full-span">
              <span>Land owners</span>
              {(form.land_owners || []).length === 0 && <p className="muted">No land owners added yet.</p>}
              {(form.land_owners || []).map((owner, index) => (
                <div
                  key={index}
                  className="form-grid innhopp-detail-auto-grid innhopp-detail-owner-grid"
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
                  <div className="form-actions form-field-full-span">
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
          <div className="form-actions innhopp-detail-save-actions">
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
            </div>
          </div>
        </article>
      </form>
      {lockNotice}
    </section>
  );
};

export default InnhoppDetailPage;
