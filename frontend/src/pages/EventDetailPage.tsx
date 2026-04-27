import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import {
  Event,
  EventCommercialStatus,
  Innhopp,
  EventStatus,
  InnhoppInput,
  InnhoppImage,
  Accommodation,
  LandOwner,
  LandingArea,
  Season,
  copyEvent,
  deleteEvent,
  getEvent,
  listEvents,
  listSeasons,
  updateEvent
} from '../api/events';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  createParticipantProfile,
  listParticipantProfiles
} from '../api/participants';
import { Airfield, CreateAirfieldPayload, createAirfield, listAirfields } from '../api/airfields';
import { isInnhoppReady } from '../utils/innhoppReadiness';
import { roleOptions } from '../utils/roles';
import { formatMetersWithFeet } from '../utils/units';
import {
  formatEventLocal,
  formatEventLocalDate,
  formatEventLocalDateInput,
  getEventLocalDateKey,
  getEventLocalDateKeyFromDate,
  formatEventLocalInputFromDate,
  formatEventLocalPickerDateTime,
  fromEventLocalDateInput,
  fromEventLocalInput,
  fromEventLocalPickerDate,
  parseEventLocal,
  toEventLocalInput,
  toEventLocalPickerDate
} from '../utils/eventDate';
import { listEventRegistrations, Registration } from '../api/registrations';
import { createAccommodation, listAccommodations } from '../api/events';
import {
  Transport,
  listTransports,
  GroundCrew,
  listGroundCrews,
  createGroundCrew,
  CreateGroundCrewPayload,
  createTransport,
  CreateTransportPayload,
  OtherLogistic,
  listOthers,
  createOther,
  Meal,
  listMeals
} from '../api/logistics';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';
import EventGearMenu from '../components/EventGearMenu';
import { ISO_CURRENCY_CODES } from '../constants/currencies';

const hasText = (value?: string | null) => !!value && value.trim().length > 0;

type InnhoppFormRow = {
  id?: number;
  sequence: number;
  name: string;
  coordinates?: string;
  elevation?: number;
  takeoff_airfield_id?: number;
  scheduled_at: string;
  notes: string;
  reason_for_choice?: string;
  adjust_altimeter_aad?: string;
  notam?: string;
  distance_by_air?: number;
  distance_by_road?: number;
  primary_landing_area: LandingAreaForm;
  secondary_landing_area: LandingAreaForm;
  risk_assessment?: string;
  safety_precautions?: string;
  jumprun?: string;
  hospital?: string;
  rescue_boat?: boolean;
  minimum_requirements?: string;
  land_owners: LandOwnerForm[];
  land_owner_permission?: boolean;
  image_files: InnhoppImage[];
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

type ParticipantFormState = {
  full_name: string;
  email: string;
  phone: string;
  experience_level: string;
  emergency_contact: string;
  roles: string[];
};

const statusOptions: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'planned', label: 'Planned' },
  { value: 'launched', label: 'Launched' },
  { value: 'scouted', label: 'Scouted' },
  { value: 'live', label: 'Live' },
  { value: 'past', label: 'Past' }
];

const commercialStatusOptions: { value: EventCommercialStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'registration_open', label: 'Registration open' },
  { value: 'awaiting_threshold', label: 'Awaiting threshold' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' }
];

const toInputDateTime = (value?: string | null) => toEventLocalInput(value);

const toLocalInputFromDate = (date: Date) => formatEventLocalInputFromDate(date);

const toInputDate = (iso?: string | null) => formatEventLocalDateInput(iso);

const toIsoDate = (value: string) => fromEventLocalDateInput(value);

const formatDateOnly = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatInnhoppSchedule = (value?: string | null) => {
  if (!value) return '';
  return toEventLocalInput(value).replace('T', ' ');
};

const formatDateTime24h = (value?: string | null) => {
  if (!value) return '';
  return formatEventLocal(value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const badgeClassForRegistrationStatus = (status?: string | null) => {
  if (status === 'completed' || status === 'fully_paid') {
    return 'badge registration-status-badge registration-status-badge-completed';
  }
  if (status === 'deposit_paid') return 'badge registration-status-badge registration-status-badge-deposit-paid';
  if (status === 'deposit_pending' || status === 'main_invoice_pending') {
    return 'badge registration-status-badge registration-status-badge-pending';
  }
  if (status === 'cancelled' || status === 'expired') return 'badge danger';
  return 'badge neutral';
};

const badgeClassForPaymentState = (state: 'paid' | 'pending' | 'overdue' | 'none') => {
  if (state === 'paid') return 'badge success';
  if (state === 'overdue') return 'badge danger';
  return 'badge neutral';
};

const computePaymentState = (
  paidAt?: string | null,
  dueAt?: string | null,
  registrationStatus?: string | null
): 'paid' | 'pending' | 'overdue' | 'none' => {
  if (paidAt) return 'paid';
  if (!dueAt) return 'none';
  if (registrationStatus === 'cancelled') return 'none';
  return getEventLocalDateKey(dueAt) < getEventLocalDateKeyFromDate(new Date()) ? 'overdue' : 'pending';
};

const emptyLandingArea = (): LandingAreaForm => ({
  name: '',
  description: '',
  size: '',
  obstacles: ''
});

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

const toLandingAreaPayload = (area?: LandingAreaForm | null): LandingArea => ({
  name: area?.name?.trim() || '',
  description: area?.description?.trim() || '',
  size: area?.size?.trim() || '',
  obstacles: area?.obstacles?.trim() || ''
});

const formatLandOwnersForPayload = (owners: LandOwnerForm[]): LandOwner[] =>
  compactLandOwners(owners).map((owner) => ({
    name: owner.name.trim(),
    telephone: owner.telephone.trim(),
    email: owner.email.trim()
  }));

const normalizeInnhopps = (event: Event): InnhoppFormRow[] => {
  const defaultStart = parseEventLocal(event.starts_at);
  if (defaultStart) defaultStart.setUTCHours(9, 0, 0, 0);
  const defaultScheduled = defaultStart ? toLocalInputFromDate(defaultStart) : '';
  return (Array.isArray(event.innhopps) ? event.innhopps : []).map((i, idx) => ({
    id: i.id,
    sequence: i.sequence ?? idx + 1,
    name: i.name || '',
    coordinates: i.coordinates || '',
    elevation: i.elevation ?? undefined,
    takeoff_airfield_id: i.takeoff_airfield_id || undefined,
    scheduled_at: toInputDateTime(i.scheduled_at) || defaultScheduled,
    notes: i.notes || '',
    reason_for_choice: i.reason_for_choice || '',
    adjust_altimeter_aad: i.adjust_altimeter_aad || '',
    notam: i.notam || '',
    distance_by_air: i.distance_by_air ?? undefined,
    distance_by_road: i.distance_by_road ?? undefined,
    primary_landing_area: toLandingAreaForm(i.primary_landing_area),
    secondary_landing_area: toLandingAreaForm(i.secondary_landing_area),
    risk_assessment: i.risk_assessment || '',
    safety_precautions: i.safety_precautions || '',
    jumprun: i.jumprun || '',
    hospital: i.hospital || '',
    rescue_boat: i.rescue_boat ?? undefined,
    minimum_requirements: i.minimum_requirements || '',
    land_owners: toLandOwnerForms(i.land_owners),
    land_owner_permission: i.land_owner_permission ?? undefined,
    image_files: Array.isArray(i.image_files) ? i.image_files.filter((img) => !!img?.data) : []
  }));
};

const EventDetailPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const copyInnhoppHandled = useRef(false);
  const [eventData, setEventData] = useState<Event | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [airfieldIds, setAirfieldIds] = useState<number[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedAirfieldId, setSelectedAirfieldId] = useState<string>('');
  const [eventForm, setEventForm] = useState({
    season_id: '',
    name: '',
    location: '',
    slots: '',
    status: 'draft' as EventStatus,
    starts_at: '',
    ends_at: '',
    public_registration_slug: '',
    public_registration_enabled: false,
    registration_open_at: '',
    main_invoice_deadline: '',
    deposit_amount: '',
    main_invoice_amount: '',
    currency: 'EUR',
    minimum_deposit_count: '',
    commercial_status: 'draft' as EventCommercialStatus
  });
  const [participantForm, setParticipantForm] = useState<ParticipantFormState>({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: '',
    roles: ['Participant', 'Skydiver']
  });
  const [staffForm, setStaffForm] = useState<ParticipantFormState>({
    full_name: '',
    email: '',
    phone: '',
    experience_level: '',
    emergency_contact: '',
    roles: ['Participant', 'Staff']
  });
  const [showParticipantForm, setShowParticipantForm] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [addingAirfield, setAddingAirfield] = useState(false);
  const [showAirfieldForm, setShowAirfieldForm] = useState(false);
  const [takeoffDrafts, setTakeoffDrafts] = useState<Record<number, CreateAirfieldPayload>>({});
  const [takeoffFormVisible, setTakeoffFormVisible] = useState<Record<number, boolean>>({});
  const [takeoffFormMode, setTakeoffFormMode] = useState<Record<number, 'new' | 'existing'>>({});
  const [innhopps, setInnhopps] = useState<InnhoppFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSavedSignature, setLastSavedSignature] = useState('');
  const saveButtonClass = 'primary';
  const saveButtonLabel = saving ? 'Saving…' : 'Save';
  const buildSignature = useCallback(
    (
      formState: typeof eventForm,
      participantsState: number[],
      airfieldsState: number[],
      innhoppState: InnhoppFormRow[]
    ) => {
      const participantsSorted = [...participantsState].sort((a, b) => a - b);
      const airfieldsSorted = [...airfieldsState].sort((a, b) => a - b);
      return JSON.stringify({
        form: formState,
        participants: participantsSorted,
        airfields: airfieldsSorted,
        innhopps: innhoppState
      });
    },
    []
  );
const currentSignature = useMemo(
  () => buildSignature(eventForm, participantIds, airfieldIds, innhopps),
  [buildSignature, eventForm, participantIds, airfieldIds, innhopps]
);
  const publicRegistrationUrl = useMemo(() => {
    const slug = eventForm.public_registration_slug.trim().toLowerCase();
    if (!slug || typeof window === 'undefined') return '';
    return `${window.location.origin}/register/${slug}`;
  }, [eventForm.public_registration_slug]);
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);
  const totalRegistrationAmount = useMemo(() => {
    const deposit = Number(eventForm.deposit_amount || 0);
    const mainInvoice = Number(eventForm.main_invoice_amount || 0);
    const total = (Number.isFinite(deposit) ? deposit : 0) + (Number.isFinite(mainInvoice) ? mainInvoice : 0);
    return total.toFixed(2);
  }, [eventForm.deposit_amount, eventForm.main_invoice_amount]);
  const normalizedRegistrationCurrency = useMemo(() => {
    const currency = eventForm.currency.trim().toUpperCase();
    return currency || 'EUR';
  }, [eventForm.currency]);
  const registrationCurrencyOptions = useMemo(() => {
    if (ISO_CURRENCY_CODES.includes(normalizedRegistrationCurrency as (typeof ISO_CURRENCY_CODES)[number])) {
      return ISO_CURRENCY_CODES;
    }
    return [normalizedRegistrationCurrency, ...ISO_CURRENCY_CODES];
  }, [normalizedRegistrationCurrency]);
  const registrationsByParticipantId = useMemo(() => {
    const next = new Map<number, Registration>();
    registrations.forEach((registration) => {
      next.set(registration.participant_id, registration);
    });
    return next;
  }, [registrations]);
  type AccommodationItem = {
    id?: number;
    name: string;
    capacity?: number;
    coordinates?: string | null;
    booked?: boolean | null;
    check_in_at?: string | null;
    check_out_at?: string | null;
    notes?: string | null;
    created_at?: string;
  };
  const [airfieldForm, setAirfieldForm] = useState({
    name: '',
    elevation: '',
    coordinates: '',
    description: ''
  });
  const [accommodations, setAccommodations] = useState<AccommodationItem[]>([]);
  const accommodationDefaults: AccommodationItem = {
    name: '',
    capacity: undefined,
    coordinates: null,
    booked: null,
    check_in_at: null,
    check_out_at: null,
    notes: null,
    created_at: ''
  };
  const [showAccommodationForm, setShowAccommodationForm] = useState(false);
  const [accommodationForm, setAccommodationForm] = useState({
    name: '',
    capacity: '',
    coordinates: '',
    booked: false,
    check_in_at: '',
    check_out_at: '',
    notes: ''
});
const [transports, setTransports] = useState<Transport[]>([]);
  const [groundCrews, setGroundCrews] = useState<GroundCrew[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [showTransportForm, setShowTransportForm] = useState(false);
const [transportForm, setTransportForm] = useState({
    pickup_location: '',
    destination: '',
    passenger_count: '',
    scheduled_at: ''
  });
  const [showGroundCrewForm, setShowGroundCrewForm] = useState(false);
  const [groundCrewForm, setGroundCrewForm] = useState({
    pickup_location: '',
    destination: '',
    passenger_count: '',
    scheduled_at: ''
  });
  const [showOtherForm, setShowOtherForm] = useState(false);
  const [otherForm, setOtherForm] = useState({
    name: '',
    coordinates: '',
    scheduled_at: '',
    description: '',
    notes: ''
});
const missingAirfieldCoords = !hasText(airfieldForm.coordinates);
const missingAccommodationCoords = !hasText(accommodationForm.coordinates);
const missingOtherCoords = !hasText(otherForm.coordinates);
  const { locked, toggleLocked, editGuardProps, lockNotice, showLockedNoticeAtEvent } = useDetailPageLock();
  const sortedAccommodations = useMemo(() => {
    const list = Array.isArray(accommodations) ? [...accommodations] : [];
    const timeValue = (acc: AccommodationItem) => {
      const iso = acc.check_in_at || acc.check_out_at || acc.created_at || '';
      const parsed = parseEventLocal(iso);
      const t = parsed ? parsed.getTime() : Number.POSITIVE_INFINITY;
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    return list.sort((a, b) => {
      const diff = timeValue(a) - timeValue(b);
      if (diff !== 0) return diff;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [accommodations]);
  const sortedMeals = useMemo(() => {
    const list = Array.isArray(meals) ? [...meals] : [];
    return list.sort((a, b) => {
      const aTime = parseEventLocal(a.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bTime = parseEventLocal(b.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [meals]);
  const buildLocationOptionValue = useCallback(
    (type: 'Innhopp' | 'Airfield' | 'Accommodation' | 'Other', id: number | string) => `${type}::${id}`,
    []
  );
  const transportLocationGroups = useMemo(() => {
    const groups: { label: string; options: { value: string; label: string; coordinates?: string | null }[] }[] = [];
    const innhoppOptions =
      Array.isArray(eventData?.innhopps) && eventData?.innhopps.length
        ? eventData?.innhopps.map((i) => ({
            value: buildLocationOptionValue('Innhopp', i.id),
            label: `${i.sequence ? `#${i.sequence} ` : ''}${i.name || 'Untitled innhopp'}`.trim(),
            coordinates: i.coordinates || null
          }))
        : [];
    if (innhoppOptions.length) {
      groups.push({ label: 'Innhopps', options: innhoppOptions });
    }

    const eventAirfields = Array.isArray(eventData?.airfield_ids)
      ? airfields.filter((a) => eventData?.airfield_ids.includes(a.id))
      : [];
    if (eventAirfields.length) {
      groups.push({
        label: 'Airfields',
        options: eventAirfields.map((a) => ({
          value: buildLocationOptionValue('Airfield', a.id),
          label: a.name || `Airfield #${a.id}`,
          coordinates: a.coordinates || null
        }))
      });
    }

    if (accommodations.length) {
      groups.push({
        label: 'Accommodations',
        options: accommodations.map((acc) => ({
          value: buildLocationOptionValue('Accommodation', acc.id || acc.name || ''),
          label: acc.name || `Accommodation #${acc.id}`,
          coordinates: acc.coordinates || null
        }))
      });
    }

    if (others.length) {
      groups.push({
        label: 'Other',
        options: others.map((o) => ({
          value: buildLocationOptionValue('Other', o.id),
          label: o.name || `Other #${o.id}`,
          coordinates: o.coordinates || null
        }))
      });
    }

    return groups;
  }, [accommodations, airfields, buildLocationOptionValue, eventData?.airfield_ids, eventData?.innhopps, others]);
  const locationCoordinates = useCallback(
    (name: string | null | undefined) => {
      if (!name) return null;
      for (const group of transportLocationGroups) {
        const match = group.options.find((option) => option.label === name);
        if (match?.coordinates) return match.coordinates;
      }
      return null;
    },
    [transportLocationGroups]
  );
  const findTransportLocationValue = useCallback(
    (label: string) =>
      transportLocationGroups
        .flatMap((group) => group.options)
        .find((option) => option.label === label)?.value || '',
    [transportLocationGroups]
  );
  type SectionKey =
    | 'details'
    | 'registration'
    | 'innhopps'
    | 'airfields'
    | 'participants'
    | 'staff'
    | 'accommodations'
    | 'transports'
    | 'groundCrews'
    | 'meals'
    | 'others';
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    details: true,
    registration: false,
    innhopps: false,
    airfields: false,
    participants: false,
    staff: false,
    accommodations: false,
    transports: false,
    groundCrews: false,
    meals: false,
    others: false
  });
  const openSectionsRef = useRef(openSections);
  const restoredSections = useRef(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const saveDetailState = useCallback(() => {
    if (!eventId) return;
    try {
      sessionStorage.setItem(
        `event-detail-state:${eventId}`,
        JSON.stringify({ openSections: openSectionsRef.current, scrollY: window.scrollY })
      );
    } catch {
      // ignore storage issues
    }
  }, [eventId]);

  useEffect(() => {
    openSectionsRef.current = openSections;
  }, [openSections]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightId]);

  useEffect(() => {
    if (!eventId || restoredSections.current) return;
    const key = `event-detail-state:${eventId}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.openSections) {
          setOpenSections((prev) => ({ ...prev, ...parsed.openSections }));
        }
        if (typeof parsed?.scrollY === 'number') {
          setTimeout(() => window.scrollTo(0, parsed.scrollY), 0);
        }
      } catch {
        // ignore bad data
      }
    }
    const savedHighlight = sessionStorage.getItem(`event-detail-highlight:${eventId}`);
    if (savedHighlight) {
      setHighlightId(savedHighlight);
      sessionStorage.removeItem(`event-detail-highlight:${eventId}`);
    }
    restoredSections.current = true;
    return () => {
      saveDetailState();
    };
  }, [eventId, saveDetailState]);

  useEffect(() => {
    if (!highlightId) return;
    let attempts = 0;
    const interval = setInterval(() => {
      const el = document.getElementById(highlightId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(interval);
      } else if (attempts > 10) {
        clearInterval(interval);
      }
      attempts += 1;
    }, 120);
    return () => clearInterval(interval);
  }, [highlightId, innhopps, airfieldIds, participantIds, accommodations, transports, groundCrews, others]);

  useEffect(() => {
    const copy = (location.state as any)?.copyInnhopp as Innhopp | undefined;
    if (!copy || copyInnhoppHandled.current) return;
    setInnhopps((prev) => [
      ...prev,
      {
        id: undefined,
        sequence: (prev.length || 0) + 1,
        name: copy.name || '',
        coordinates: copy.coordinates || '',
        elevation: copy.elevation ?? undefined,
        takeoff_airfield_id: copy.takeoff_airfield_id || undefined,
        scheduled_at: copy.scheduled_at || '',
        notes: copy.notes || '',
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
        land_owner_permission: copy.land_owner_permission ?? undefined,
        image_files: Array.isArray(copy.image_files) ? copy.image_files.filter((img) => !!img?.data) : []
      }
    ]);
    copyInnhoppHandled.current = true;
  }, [location.state, copyInnhoppHandled]);

  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));

  const handleCreateTransportInline = async () => {
    if (!eventId) return;
    if (!transportForm.pickup_location.trim() || !transportForm.destination.trim()) return;
    try {
      const created = await createTransport({
        pickup_location: transportForm.pickup_location.trim(),
        destination: transportForm.destination.trim(),
        passenger_count: Number(transportForm.passenger_count) || 0,
        scheduled_at: transportForm.scheduled_at || undefined,
        event_id: Number(eventId),
        vehicle_ids: []
      } as CreateTransportPayload);
      setTransports((prev) => [created, ...prev]);
      setTransportForm({
        pickup_location: '',
        destination: '',
        passenger_count: '',
        scheduled_at: ''
      });
      setShowTransportForm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create transport');
    }
  };

  const handleCreateGroundCrewInline = async () => {
    if (!eventId) return;
    if (!groundCrewForm.pickup_location.trim() || !groundCrewForm.destination.trim()) return;
    try {
      const created = await createGroundCrew({
        pickup_location: groundCrewForm.pickup_location.trim(),
        destination: groundCrewForm.destination.trim(),
        passenger_count: Number(groundCrewForm.passenger_count) || 0,
        scheduled_at: groundCrewForm.scheduled_at || undefined,
        event_id: Number(eventId),
        vehicle_ids: []
      } as CreateGroundCrewPayload);
      setGroundCrews((prev) => [created, ...prev]);
      setGroundCrewForm({
        pickup_location: '',
        destination: '',
        passenger_count: '',
        scheduled_at: ''
      });
      setShowGroundCrewForm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create ground crew');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadEvents = async () => {
      try {
        const resp = await listEvents();
        if (!cancelled && Array.isArray(resp)) {
          setAllEvents(resp);
        }
      } catch {
        // ignore event list errors for dropdown grouping
      }
    };
    loadEvents();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateOtherInline = async () => {
    if (!eventId) return;
    if (!otherForm.name.trim() || !otherForm.coordinates.trim()) return;
    try {
      const created = await createOther({
        name: otherForm.name.trim(),
        coordinates: otherForm.coordinates.trim(),
        scheduled_at: otherForm.scheduled_at || undefined,
        description: otherForm.description.trim() || undefined,
        notes: otherForm.notes.trim() || undefined,
        event_id: Number(eventId)
      });
      setOthers((prev) => [created, ...prev]);
      setOtherForm({
        name: '',
        coordinates: '',
        scheduled_at: '',
        description: '',
        notes: ''
      });
      setShowOtherForm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create entry');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      try {
        const [event, eventRegistrations] = await Promise.all([
          getEvent(Number(eventId)),
          listEventRegistrations(Number(eventId))
        ]);
        if (cancelled) return;
        setEventData(event);
        setRegistrations(Array.isArray(eventRegistrations) ? eventRegistrations : []);
        setInnhopps(normalizeInnhopps(event));
        setParticipantIds(Array.isArray(event.participant_ids) ? event.participant_ids : []);
        setAirfieldIds(Array.isArray(event.airfield_ids) ? event.airfield_ids : []);
        setEventForm({
          season_id: String(event.season_id),
          name: event.name,
          location: event.location || '',
          slots: event.slots ? String(event.slots) : '',
          status: event.status,
          starts_at: toInputDate(event.starts_at),
          ends_at: toInputDate(event.ends_at),
          public_registration_slug: event.public_registration_slug || '',
          public_registration_enabled: !!event.public_registration_enabled,
          registration_open_at: toInputDateTime(event.registration_open_at),
          main_invoice_deadline: toInputDateTime(event.main_invoice_deadline),
          deposit_amount:
            typeof event.deposit_amount === 'number' ? String(event.deposit_amount) : '',
          main_invoice_amount:
            typeof event.main_invoice_amount === 'number' ? String(event.main_invoice_amount) : '',
          currency: event.currency || 'EUR',
          minimum_deposit_count:
            typeof event.minimum_deposit_count === 'number' && event.minimum_deposit_count > 0
              ? String(event.minimum_deposit_count)
              : '',
          commercial_status: event.commercial_status || 'draft'
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
    const loadAccommodations = async () => {
      if (!eventId) return;
      try {
        const data = await listAccommodations(Number(eventId));
        if (!cancelled) {
          setAccommodations(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setAccommodations([]);
      }
    };
    loadAccommodations();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    const loadTransportsAndOthers = async () => {
      if (!eventId) return;
      try {
        const [transportData, groundCrewData, otherData, mealData] = await Promise.all([listTransports(), listGroundCrews(), listOthers(), listMeals()]);
        if (cancelled) return;
        setTransports(
          Array.isArray(transportData)
            ? transportData.filter((t) => t.event_id === Number(eventId))
            : []
        );
        setGroundCrews(
          Array.isArray(groundCrewData)
            ? groundCrewData.filter((g) => g.event_id === Number(eventId))
            : []
        );
        setOthers(
          Array.isArray(otherData) ? otherData.filter((o) => o.event_id === Number(eventId)) : []
        );
        setMeals(Array.isArray(mealData) ? mealData.filter((m) => m.event_id === Number(eventId)) : []);
      } catch {
        if (!cancelled) {
          setTransports([]);
          setGroundCrews([]);
          setOthers([]);
          setMeals([]);
        }
      }
    };
    loadTransportsAndOthers();
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

  useEffect(() => {
    let cancelled = false;
    const loadAirfields = async () => {
      try {
        const data = await listAirfields();
        if (!cancelled) {
          setAirfields(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore airfield load errors for now
      }
    };
    loadAirfields();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // ensure existing takeoff airfields show their details in the shared form
    setTakeoffFormVisible((prev) => {
      const next = { ...prev };
      innhopps.forEach((row, index) => {
        if (row.takeoff_airfield_id) {
          next[index] = true;
        }
      });
      return next;
    });
    setTakeoffFormMode((prev) => {
      const next = { ...prev };
      innhopps.forEach((row, index) => {
        if (row.takeoff_airfield_id) {
          next[index] = 'existing';
          const selected = airfields.find((a) => a.id === row.takeoff_airfield_id);
          if (selected) {
            setTakeoffDrafts((drafts) => ({
              ...drafts,
              [index]: {
                name: selected.name,
                elevation: selected.elevation,
                coordinates: selected.coordinates,
                description: selected.description || ''
              }
            }));
          }
        }
      });
      return next;
    });
  }, [innhopps, airfields]);

  const participantLabel = (id: number) =>
    participants.find((p) => p.id === id)?.full_name || `Participant #${id}`;

  const renderRegistrationSummary = (participantId: number) => {
    const registration = registrationsByParticipantId.get(participantId);
    if (!registration) {
      return <div className="muted">No registration record yet.</div>;
    }
    const depositState = computePaymentState(
      registration.deposit_paid_at,
      registration.deposit_due_at,
      registration.status
    );
    const mainInvoiceState = computePaymentState(
      registration.main_invoice_paid_at,
      registration.main_invoice_due_at,
      registration.status
    );
    return (
      <>
        <div className="event-detail-role-badges event-detail-registration-badges">
          <span className={badgeClassForRegistrationStatus(registration.status)}>
            {registration.status.replace(/_/g, ' ')}
          </span>
          <span className={badgeClassForPaymentState(depositState)}>Deposit {depositState}</span>
          <span className={badgeClassForPaymentState(mainInvoiceState)}>Main Invoice {mainInvoiceState}</span>
        </div>
        <div className="event-detail-registration-meta">
          <span>Registered {formatDateTime24h(registration.registered_at) || 'Unknown'}</span>
          {registration.deposit_due_at && <span>Deposit due {formatEventLocalDate(registration.deposit_due_at)}</span>}
          {registration.main_invoice_due_at && <span>Main Invoice due {formatEventLocalDate(registration.main_invoice_due_at)}</span>}
        </div>
        <Link
          to={`/registrations/${registration.id}`}
          className="event-detail-registration-link"
          onClick={saveDetailState}
        >
          Open registration
        </Link>
      </>
    );
  };

  const availableParticipants = participants
    .filter((p) => {
      const roles = Array.isArray(p.roles) ? p.roles : [];
      const isStaff = roles.includes('Staff');
      return !participantIds.includes(p.id) && !isStaff;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }));
  const availableAirfields = airfields.filter((a) => !airfieldIds.includes(a.id));
  const groupedTakeoffAirfields = useMemo(() => {
    const groups = new Map<string, { label: string; options: { key: string; value: number; label: string }[] }>();
    airfields.forEach((af) => {
      const relatedEvents = allEvents.filter((ev) => Array.isArray(ev.airfield_ids) && ev.airfield_ids.includes(af.id));
      const locations = relatedEvents.length
        ? relatedEvents.map((ev) => ev.location || 'Location TBD')
        : ['Unassigned location'];
      locations.forEach((loc, idx) => {
        const label = loc || 'Location TBD';
        if (!groups.has(label)) {
          groups.set(label, { label, options: [] });
        }
        groups.get(label)!.options.push({
          key: `${af.id}-${idx}-${label}`,
          value: af.id,
          label: `${af.name}${af.elevation != null ? ` (${af.elevation} m)` : ''}`
        });
      });
    });
    return Array.from(groups.values());
  }, [airfields, allEvents]);

  useEffect(() => {
    if (saved && currentSignature !== lastSavedSignature) {
      setSaved(false);
    }
  }, [currentSignature, lastSavedSignature, saved]);

  const persistEvent = async (
    nextParticipantIds: number[],
    nextAirfieldIds: number[],
    nextInnhopps?: InnhoppFormRow[]
  ) => {
    if (!eventData) return;
    setSaving(true);
    setMessage(null);
    setSaved(false);
    try {
      const payload = {
        season_id: Number(eventForm.season_id || eventData.season_id),
        name: eventForm.name.trim() || eventData.name,
        location: eventForm.location.trim() || undefined,
        slots: eventForm.slots ? Number(eventForm.slots) : eventData.slots || 0,
        status: eventForm.status,
        starts_at: toIsoDate(eventForm.starts_at) || eventData.starts_at,
        ends_at: eventForm.ends_at ? toIsoDate(eventForm.ends_at) : undefined,
        public_registration_slug: eventForm.public_registration_slug.trim().toLowerCase() || undefined,
        public_registration_enabled: eventForm.public_registration_enabled,
        registration_open_at: eventForm.registration_open_at
          ? fromEventLocalInput(eventForm.registration_open_at)
          : undefined,
        main_invoice_deadline: eventForm.main_invoice_deadline
          ? fromEventLocalInput(eventForm.main_invoice_deadline)
          : undefined,
        deposit_amount:
          eventForm.deposit_amount !== '' ? Number(eventForm.deposit_amount) : undefined,
        main_invoice_amount:
          eventForm.main_invoice_amount !== '' ? Number(eventForm.main_invoice_amount) : undefined,
        currency: eventForm.currency.trim().toUpperCase() || 'EUR',
        minimum_deposit_count:
          eventForm.minimum_deposit_count !== '' ? Number(eventForm.minimum_deposit_count) : 0,
        commercial_status: eventForm.commercial_status,
        airfield_ids: nextAirfieldIds,
        participant_ids: nextParticipantIds,
        innhopps: (nextInnhopps ?? innhopps)
          .filter((row) => row.name.trim() !== '')
          .map<InnhoppInput>((row, idx) => ({
            sequence: row.sequence || idx + 1,
            name: row.name.trim(),
            coordinates: row.coordinates?.trim(),
            elevation: row.elevation,
            takeoff_airfield_id: row.takeoff_airfield_id,
            scheduled_at: row.scheduled_at ? toEventLocalInput(row.scheduled_at) : '',
            notes: row.notes,
            reason_for_choice: row.reason_for_choice?.trim(),
            adjust_altimeter_aad: row.adjust_altimeter_aad?.trim(),
            notam: row.notam?.trim(),
            distance_by_air: row.distance_by_air,
            distance_by_road: row.distance_by_road,
            primary_landing_area: toLandingAreaPayload(row.primary_landing_area),
            secondary_landing_area: toLandingAreaPayload(row.secondary_landing_area),
            risk_assessment: row.risk_assessment?.trim(),
            safety_precautions: row.safety_precautions?.trim(),
            jumprun: row.jumprun?.trim(),
            hospital: row.hospital?.trim(),
            rescue_boat: row.rescue_boat,
            minimum_requirements: row.minimum_requirements?.trim(),
            land_owners: formatLandOwnersForPayload(row.land_owners || []),
            land_owner_permission: row.land_owner_permission,
            image_files: (row.image_files || []).map((img) => ({
              name: img.name?.trim() || undefined,
              mime_type: img.mime_type?.trim() || undefined,
              data: img.data
            }))
          }))
      };
      const updated = await updateEvent(eventData.id, payload);
      const nextRegistrations = await listEventRegistrations(eventData.id);
      const normalizedInnhopps = normalizeInnhopps(updated);
      const normalizedParticipants = Array.isArray(updated.participant_ids) ? updated.participant_ids : [];
      const normalizedAirfields = Array.isArray(updated.airfield_ids) ? updated.airfield_ids : [];
      setEventData(updated);
      setRegistrations(Array.isArray(nextRegistrations) ? nextRegistrations : []);
      setParticipantIds(normalizedParticipants);
      setAirfieldIds(normalizedAirfields);
      setInnhopps(normalizedInnhopps);
      setLastSavedSignature(buildSignature(eventForm, normalizedParticipants, normalizedAirfields, normalizedInnhopps));
      setSaved(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update event');
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    await persistEvent(participantIds, airfieldIds, innhopps);
  };

  const handleSaveRegistrationSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventData) return;
    setSaving(true);
    setMessage(null);
    setSaved(false);
    try {
      const updated = await updateEvent(eventData.id, {
        season_id: Number(eventForm.season_id || eventData.season_id),
        name: eventForm.name.trim() || eventData.name,
        location: eventForm.location.trim() || undefined,
        slots: eventForm.slots ? Number(eventForm.slots) : eventData.slots || 0,
        status: eventForm.status,
        starts_at: toIsoDate(eventForm.starts_at) || eventData.starts_at,
        ends_at: eventForm.ends_at ? toIsoDate(eventForm.ends_at) : undefined,
        public_registration_slug: eventForm.public_registration_slug.trim().toLowerCase() || undefined,
        public_registration_enabled: eventForm.public_registration_enabled,
        registration_open_at: eventForm.registration_open_at
          ? fromEventLocalInput(eventForm.registration_open_at)
          : undefined,
        main_invoice_deadline: eventForm.main_invoice_deadline
          ? fromEventLocalInput(eventForm.main_invoice_deadline)
          : undefined,
        deposit_amount:
          eventForm.deposit_amount !== '' ? Number(eventForm.deposit_amount) : undefined,
        main_invoice_amount:
          eventForm.main_invoice_amount !== '' ? Number(eventForm.main_invoice_amount) : undefined,
        currency: eventForm.currency.trim().toUpperCase() || 'EUR',
        minimum_deposit_count:
          eventForm.minimum_deposit_count !== '' ? Number(eventForm.minimum_deposit_count) : 0,
        commercial_status: eventForm.commercial_status
      });
      const nextRegistrations = await listEventRegistrations(eventData.id);
      setEventData(updated);
      setRegistrations(Array.isArray(nextRegistrations) ? nextRegistrations : []);
      setLastSavedSignature(buildSignature(eventForm, participantIds, airfieldIds, innhopps));
      setSaved(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update registration settings');
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTakeoffAirfieldChange = (index: number, value: string) => {
    if (value === '__new__') {
      setTakeoffFormVisible((prev) => ({ ...prev, [index]: true }));
      setTakeoffFormMode((prev) => ({ ...prev, [index]: 'new' }));
      setInnhopps((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], takeoff_airfield_id: undefined };
        return next;
      });
      setTakeoffDrafts((prev) => ({
        ...prev,
        [index]: prev[index] || { name: '', elevation: 0, coordinates: '', description: '' }
      }));
      return;
    }
    if (value === '') {
      setInnhopps((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], takeoff_airfield_id: undefined };
        return next;
      });
      setTakeoffFormVisible((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      setTakeoffFormMode((prev) => {
        const next = { ...prev };
        delete next[index];
        return next as Record<number, 'new' | 'existing'>;
      });
      return;
    }
    const id = Number(value);
    setInnhopps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], takeoff_airfield_id: id || undefined };
      return next;
    });
    setTakeoffFormVisible((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setTakeoffFormMode((prev) => {
      const next = { ...prev };
      delete next[index];
      return next as Record<number, 'new' | 'existing'>;
    });
    const selected = airfields.find((a) => a.id === id);
    if (selected) {
      setTakeoffDrafts((prev) => ({
        ...prev,
        [index]: {
          name: selected.name,
          elevation: selected.elevation,
          coordinates: selected.coordinates,
          description: selected.description || ''
        }
      }));
    }
  };

  const handleCreateTakeoffAirfield = async (index: number) => {
    const draft = takeoffDrafts[index];
    if (!draft) return;
    setAddingAirfield(true);
    setMessage(null);
    try {
      const payload: CreateAirfieldPayload = {
        name: draft.name.trim(),
        elevation: Number(draft.elevation) || 0,
        coordinates: draft.coordinates.trim(),
        description: draft.description?.trim() || undefined
      };
      const created = await createAirfield(payload);
      const nextAirfields = [...airfields, created];
      setAirfields(nextAirfields);
      const updatedAirfieldIds = airfieldIds.includes(created.id) ? airfieldIds : [...airfieldIds, created.id];
      setAirfieldIds(updatedAirfieldIds);
      setInnhopps((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], takeoff_airfield_id: created.id };
        return next;
      });
      const nextInnhopps = innhopps.map((row, idx) =>
        idx === index ? { ...row, takeoff_airfield_id: created.id } : row
      );
      setTakeoffDrafts((prev) => ({
        ...prev,
        [index]: {
          name: created.name,
          elevation: created.elevation,
          coordinates: created.coordinates,
          description: created.description || ''
        }
      }));
      setTakeoffFormMode((prev) => ({ ...prev, [index]: 'existing' }));
      await persistEvent(participantIds, updatedAirfieldIds, nextInnhopps);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add airfield');
    } finally {
      setAddingAirfield(false);
    }
  };

  const handleAssignParticipant = async () => {
    const id = Number(selectedParticipantId);
    if (!id || participantIds.includes(id) || !eventData) return;
    const next = [...participantIds, id];
    setParticipantIds(next);
    setSelectedParticipantId('');
    await persistEvent(next, airfieldIds);
  };

  const staffParticipants = useMemo(() => {
    const staffProfiles = participantIds
      .map((id) => participants.find((p) => p.id === id))
      .filter((p): p is ParticipantProfile => !!p && Array.isArray(p.roles) && p.roles.includes('Staff'));
    return staffProfiles.sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }));
  }, [participantIds, participants]);

  const availableStaff = useMemo(() => {
    return participants.filter((p) => {
      if (participantIds.includes(p.id)) return false;
      const roles = Array.isArray(p.roles) ? p.roles : [];
      return roles.includes('Staff');
    });
  }, [participants, participantIds]);

  const handleAssignStaff = async () => {
    const id = Number(selectedStaffId);
    if (!id || participantIds.includes(id) || !eventData) return;
    const next = [...participantIds, id];
    setParticipantIds(next);
    setSelectedStaffId('');
    await persistEvent(next, airfieldIds);
  };

  const handleCreateStaffParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddingStaff(true);
    setMessage(null);
    try {
      const roles = staffForm.roles && staffForm.roles.length > 0 ? staffForm.roles : ['Participant', 'Staff'];
      const payload: CreateParticipantPayload = {
        full_name: staffForm.full_name.trim(),
        email: staffForm.email.trim(),
        phone: staffForm.phone.trim() || undefined,
        experience_level: staffForm.experience_level.trim() || undefined,
        emergency_contact: staffForm.emergency_contact.trim() || undefined,
        roles
      };
      const created = await createParticipantProfile(payload);
      const nextParticipantIds = [...participantIds, created.id];
      setParticipants((prev) => [...prev, created]);
      setParticipantIds(nextParticipantIds);
      await persistEvent(nextParticipantIds, airfieldIds);
      setStaffForm({
        full_name: '',
        email: '',
        phone: '',
        experience_level: '',
        emergency_contact: '',
        roles: ['Participant', 'Staff']
      });
      setShowStaffForm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add staff participant');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleRemoveParticipant = async (id: number) => {
    const next = participantIds.filter((pid) => pid !== id);
    setParticipantIds(next);
    await persistEvent(next, airfieldIds);
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
      setParticipantIds((prev) => [...prev, created.id]);
      setParticipantForm({
        full_name: '',
        email: '',
        phone: '',
        experience_level: '',
        emergency_contact: '',
        roles: ['Participant', 'Skydiver']
      });
      setShowParticipantForm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add participant');
    } finally {
      setAddingParticipant(false);
    }
  };

  const handleAddRow = () => {
    const defaultStart =
      eventForm.starts_at && eventForm.starts_at.length >= 10
        ? parseEventLocal(`${eventForm.starts_at}T09:00`)
        : null;
    if (defaultStart) {
      defaultStart.setUTCHours(9, 0, 0, 0);
    }
    setInnhopps((prev) => [
      ...prev,
      {
        sequence: prev.length + 1,
        name: '',
        coordinates: '',
        scheduled_at: defaultStart ? toLocalInputFromDate(defaultStart) : '',
        notes: '',
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
        land_owner_permission: undefined,
        image_files: []
      }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setInnhopps((prev) => prev.filter((_, i) => i !== index).map((row, idx) => ({ ...row, sequence: idx + 1 })));
    setTakeoffDrafts((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setTakeoffFormVisible((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setTakeoffFormMode((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleChange = (index: number, key: 'sequence' | 'name' | 'scheduled_at' | 'notes', value: string) => {
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
    await persistEvent(participantIds, airfieldIds);
  };

  const handleAssignAirfield = async () => {
    const id = Number(selectedAirfieldId);
    if (!id || airfieldIds.includes(id) || !eventData) return;
    const next = [...airfieldIds, id];
    setAirfieldIds(next);
    setSelectedAirfieldId('');
    await persistEvent(participantIds, next);
  };

  const handleRemoveAirfield = async (id: number) => {
    const next = airfieldIds.filter((aid) => aid !== id);
    setAirfieldIds(next);
    await persistEvent(participantIds, next);
  };

  const handleCreateAirfield = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setAddingAirfield(true);
    setMessage(null);
    try {
      const payload: CreateAirfieldPayload = {
        name: airfieldForm.name.trim(),
        elevation: Number(airfieldForm.elevation) || 0,
        coordinates: airfieldForm.coordinates.trim(),
        description: airfieldForm.description.trim() || undefined
      };
      const created = await createAirfield(payload);
      setAirfields((prev) => [...prev, created]);
      setAirfieldIds((prev) => [...prev, created.id]);
      setAirfieldForm({ name: '', elevation: '', coordinates: '', description: '' });
      setShowAirfieldForm(false);
      await persistEvent(participantIds, airfieldIds.includes(created.id) ? airfieldIds : [...airfieldIds, created.id]);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add airfield');
    } finally {
      setAddingAirfield(false);
    }
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

  const pastEvent = eventData.status === 'past';

  const handleDelete = async () => {
    if (!eventData || deleting) return;
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteEvent(eventData.id);
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete event');
      setDeleting(false);
    }
  };

  const handleCopy = async () => {
    if (!eventData || copying) return;
    setCopying(true);
    setMessage(null);
    try {
      const cloned = await copyEvent(eventData.id);
      navigate(`/events/${cloned.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to copy event');
    } finally {
      setCopying(false);
    }
  };

  return (
    <section {...editGuardProps}>
      <header className="page-header">
        <div className="event-schedule-headline-text">
          <div className="event-header-top">
            <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
              <h2 className="event-detail-title">{eventData.name}: Details</h2>
            </DetailPageLockTitle>
          </div>
          <p className="event-location">{eventData.location || 'Location TBD'}</p>
          <div className="event-detail-header-badges">
            <span className={`badge status-${eventData.status}`}>{eventData.status}</span>
            {!pastEvent &&
              (() => {
                const remaining = Math.max(eventData.remaining_slots ?? 0, 0);
                const isFull = remaining === 0;
                return (
                  <span className={`badge ${isFull ? 'danger' : 'success'}`}>
                    {isFull ? 'FULL' : `${remaining} SLOTS AVAILABLE`}
                  </span>
                );
              })()}
          </div>
        </div>
        <EventGearMenu
          eventId={eventData.id}
          currentPage="details"
          copying={copying}
          deleting={deleting}
          menuId="event-detail-actions-menu"
          onCopy={(event) => {
            if (locked) {
              showLockedNoticeAtEvent(event);
              return;
            }
            handleCopy();
          }}
          onDelete={(event) => {
            if (locked) {
              showLockedNoticeAtEvent(event);
              return;
            }
            handleDelete();
          }}
        />
      </header>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('details')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('details');
              }}
            >
              {openSections.details ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Event details</h3>
          </div>
        </header>
        {openSections.details && (
          <form className="form-grid" onSubmit={handleSave}>
            <div className="event-detail-details-grid form-field-full-span">
              <label className="form-field event-detail-details-col-1-3">
                <span>Name</span>
                <input
                  type="text"
                  value={eventForm.name}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-3-4" />
              <label className="form-field event-detail-details-col-4-5">
                <span>Season</span>
                <select
                  className="event-detail-season-select"
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
              <div aria-hidden="true" className="event-detail-details-col-5-7" />

              <label className="form-field event-detail-details-col-1-3">
                <span>Location</span>
                <input
                  type="text"
                  value={eventForm.location}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="The overall location the event takes place"
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-3-4" />
              <label className="form-field event-detail-details-col-4-5">
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
              <label
                className="form-field event-detail-details-slots"
              >
                <span>Slots</span>
                <input
                  type="number"
                  min={0}
                  value={eventForm.slots}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, slots: e.target.value }))}
                  placeholder="Total slots"
                  className="event-detail-slots-input"
              />
            </label>
              <div aria-hidden="true" className="event-detail-details-col-6-7" />

              <label className="form-field event-detail-details-col-1-3">
                <span>Starts on</span>
                <Flatpickr
                  value={toEventLocalPickerDate(eventForm.starts_at)}
                  options={{
                    dateFormat: 'Y-m-d',
                    altInput: true,
                    altFormat: 'M j, Y',
                    allowInput: true
                  }}
                  onChange={(dates) => {
                    const date = dates[0];
                    setEventForm((prev) => ({ ...prev, starts_at: date ? formatDateOnly(date) : '' }));
                  }}
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-3-4" />
              <label className="form-field event-detail-details-col-4-6">
                <span>Ends on</span>
                <Flatpickr
                  value={toEventLocalPickerDate(eventForm.ends_at)}
                  options={{
                    dateFormat: 'Y-m-d',
                    altInput: true,
                    altFormat: 'M j, Y',
                    allowInput: true
                  }}
                  onChange={(dates) => {
                    const date = dates[0];
                    setEventForm((prev) => ({ ...prev, ends_at: date ? formatDateOnly(date) : '' }));
                  }}
                />
              </label>
              <div aria-hidden="true" className="event-detail-details-col-6-7" />
            </div>
            <div className="form-actions">
              <button type="submit" className={saveButtonClass} disabled={saving}>
                {saveButtonLabel}
              </button>
              {message && <span className="muted">{message}</span>}
            </div>
        </form>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('registration')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('registration');
              }}
            >
              {openSections.registration ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Registration settings</h3>
          </div>
        </header>
        {openSections.registration && (
          <form className="form-grid" onSubmit={handleSaveRegistrationSettings}>
            <div className="registration-settings-grid">
              <div className="registration-settings-row">
                <label className="form-field registration-settings-field">
                  <span>Status</span>
                  <select
                    value={eventForm.commercial_status}
                    onChange={(e) =>
                      setEventForm((prev) => ({
                        ...prev,
                        commercial_status: e.target.value as EventCommercialStatus
                      }))
                    }
                  >
                    {commercialStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field registration-settings-field">
                  <span>Registration opens</span>
                  <input
                    type="datetime-local"
                    value={eventForm.registration_open_at}
                    onChange={(e) =>
                      setEventForm((prev) => ({ ...prev, registration_open_at: e.target.value }))
                    }
                  />
                </label>

                <label className="form-field registration-settings-field">
                  <span>Minimum registrations</span>
                  <input
                    type="number"
                    min={0}
                    value={eventForm.minimum_deposit_count}
                    onChange={(e) =>
                      setEventForm((prev) => ({ ...prev, minimum_deposit_count: e.target.value }))
                    }
                    placeholder="0"
                  />
                </label>
              </div>

              <div className="registration-settings-row">
                <label className="form-field registration-settings-field">
                  <span>Deposit</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={eventForm.deposit_amount}
                    onChange={(e) =>
                      setEventForm((prev) => ({ ...prev, deposit_amount: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </label>

                <label className="form-field registration-settings-field">
                  <span>Main Invoice</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={eventForm.main_invoice_amount}
                    onChange={(e) =>
                      setEventForm((prev) => ({ ...prev, main_invoice_amount: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </label>

                <label className="form-field registration-settings-field">
                  <span>Currency</span>
                  <select
                    value={normalizedRegistrationCurrency}
                    onChange={(e) =>
                      setEventForm((prev) => ({ ...prev, currency: e.target.value }))
                    }
                  >
                    {registrationCurrencyOptions.map((currencyCode) => (
                      <option key={currencyCode} value={currencyCode}>
                        {currencyCode}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-field registration-settings-field">
                  <span>Main Invoice deadline</span>
                  <input
                    type="datetime-local"
                    value={eventForm.main_invoice_deadline}
                    onChange={(e) =>
                      setEventForm((prev) => ({ ...prev, main_invoice_deadline: e.target.value }))
                    }
                  />
                </label>

                <label className="form-field registration-settings-field registration-total-field">
                  <span>Total amount</span>
                  <div className="registration-total-amount">
                    {totalRegistrationAmount} {normalizedRegistrationCurrency}
                  </div>
                </label>
              </div>

              <label className="form-field registration-settings-field registration-checkbox-field">
                <span className="registration-checkbox-row">
                  <input
                    type="checkbox"
                    checked={eventForm.public_registration_enabled}
                    onChange={(e) =>
                      setEventForm((prev) => ({
                        ...prev,
                        public_registration_enabled: e.target.checked
                      }))
                    }
                  />
                  <span className="registration-checkbox-label">Enable public registration</span>
                </span>
              </label>

              {eventForm.public_registration_enabled && (
                <div className="registration-settings-row registration-settings-row--link">
                  <label className="form-field registration-settings-field registration-slug-field">
                    <span>Slug</span>
                    <input
                      type="text"
                      value={eventForm.public_registration_slug}
                      onChange={(e) =>
                        setEventForm((prev) => ({ ...prev, public_registration_slug: e.target.value }))
                      }
                      placeholder="event-name-2026"
                    />
                  </label>

                  <div className="form-field registration-settings-field registration-link-preview">
                    <span>Link</span>
                    <div className="registration-link-preview-row">
                      <div className="muted registration-link-preview-text">
                        {publicRegistrationUrl || 'Set a registration slug to generate the public link'}
                      </div>
                      <div className="registration-link-actions">
                        <button
                          type="button"
                          className="ghost registration-link-action-button"
                          disabled={!publicRegistrationUrl}
                          aria-label="Open public registration page"
                          title="Open link"
                          onClick={() => {
                            if (!publicRegistrationUrl) return;
                            window.open(publicRegistrationUrl, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M14 5.75h4.25V10M18 6l-8.5 8.5M10.75 5H8.6C7.16 5 6 6.16 6 7.6v7.8C6 16.84 7.16 18 8.6 18h7.8c1.44 0 2.6-1.16 2.6-2.6v-2.15"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="ghost registration-link-action-button"
                          disabled={!publicRegistrationUrl}
                          aria-label={copiedPublicLink ? 'Public link copied' : 'Copy public link'}
                          title={copiedPublicLink ? 'Copied' : 'Copy link'}
                          onClick={async () => {
                            if (!publicRegistrationUrl || !navigator.clipboard) return;
                            try {
                              await navigator.clipboard.writeText(publicRegistrationUrl);
                              setCopiedPublicLink(true);
                              window.setTimeout(() => setCopiedPublicLink(false), 1600);
                            } catch {
                              setCopiedPublicLink(false);
                            }
                          }}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M9 9V5.75A1.75 1.75 0 0 1 10.75 4h7.5A1.75 1.75 0 0 1 20 5.75v7.5A1.75 1.75 0 0 1 18.25 15H15"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <rect
                              x="4"
                              y="9"
                              width="11"
                              height="11"
                              rx="1.75"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className={saveButtonClass} disabled={saving}>
                {saveButtonLabel}
              </button>
              {message && <span className="muted">{message}</span>}
            </div>
          </form>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('innhopps')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('innhopps');
              }}
            >
              {openSections.innhopps ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Innhopps</h3>
          </div>
          <span className="badge neutral">{innhopps.length} INNHOPPS</span>
        </header>
        {openSections.innhopps && (innhopps.length === 0 ? (
          <p className="muted">No innhopps yet.</p>
        ) : (
          <ul className="status-list event-detail-scroll-list">
            {innhopps
              .filter((row) => row.id)
              .map((row) => {
                const takeoff = row.takeoff_airfield_id
                  ? airfields.find((a) => a.id === row.takeoff_airfield_id)
                  : undefined;
                const ready = isInnhoppReady(row);
                return (
                  <li
                    key={row.id}
                    id={`innhopp-${row.id}`}
                    className={`event-detail-list-item${highlightId === `innhopp-${row.id}` ? ' event-detail-list-item--highlighted' : ''}`}
                  >
                    <Link
                      to={`/events/${eventData.id}/innhopps/${row.id}`}
                      className="card-link event-detail-list-link"
                      onClick={() => {
                        if (eventId) {
                          try {
                            sessionStorage.setItem(`event-detail-highlight:${eventId}`, `innhopp-${row.id}`);
                          } catch {
                            // ignore
                          }
                        }
                        saveDetailState();
                      }}
                    >
                      <div className="event-detail-list-summary-row">
                        <strong>
                          #{row.sequence} — {row.name}
                        </strong>
                        <span className={`badge ${ready ? 'success' : 'danger'}`}>{ready ? 'OP READY' : 'MISSING INFO'}</span>
                      </div>
                      {formatInnhoppSchedule(row.scheduled_at) && (
                        <div className="muted">{formatInnhoppSchedule(row.scheduled_at)}</div>
                      )}
                      {row.elevation !== undefined && row.elevation !== null && (
                        <div className="muted">Elevation: {formatMetersWithFeet(row.elevation)}</div>
                      )}
                      <div className="muted">
                        Takeoff: {takeoff ? takeoff.name : row.takeoff_airfield_id ? `Airfield #${row.takeoff_airfield_id}` : 'Not set'}
                      </div>
                      {row.notes && <div className="muted">{row.notes}</div>}
                    </Link>
                  </li>
                );
            })}
          </ul>
        ))}
        {openSections.innhopps && (
          <>
        <div className="event-detail-spacer" />
        <form className="form-grid" onSubmit={handleSave}>
          {innhopps
            .filter((row) => !row.id)
            .map((row, index) => {
              const draftIndex = innhopps.findIndex((r) => r === row);
              return (
                <div key={index} className="innhopp-row">
                  <label className="form-field">
                    <span>Sequence</span>
                    <input
                      type="number"
                      min={1}
                      value={row.sequence}
                      onChange={(e) => handleChange(draftIndex, 'sequence', e.target.value)}
                      className="event-detail-sequence-input"
                    />
                  </label>
                  <label className="form-field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => handleChange(draftIndex, 'name', e.target.value)}
                      placeholder="Describe the innhopp"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Scheduled at</span>
                  <Flatpickr
                    value={toEventLocalPickerDate(row.scheduled_at)}
                    options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
                    onChange={(dates) => {
                      const date = dates[0];
                      handleChange(draftIndex, 'scheduled_at', date ? formatEventLocalPickerDateTime(date) : '');
                    }}
                  />
                  </label>
                  <label className="form-field">
                    <span>Takeoff airfield</span>
                    <select
                      value={row.takeoff_airfield_id ?? ''}
                      onChange={(e) => handleTakeoffAirfieldChange(draftIndex, e.target.value)}
                    >
                      <option value="">Select airfield</option>
                      <option value="__new__">Create new airfield…</option>
                      {groupedTakeoffAirfields.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((opt) => (
                            <option key={opt.key} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="form-field notes-field">
                    <span>Notes</span>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => handleChange(draftIndex, 'notes', e.target.value)}
                      placeholder="Exit altitude, landing brief…"
                    />
                  </label>
                  {takeoffFormVisible[draftIndex] && (
                    <div
                      className="form-grid form-field-full-span event-detail-inline-airfield-grid"
                    >
                      {(() => {
                        const mode = takeoffFormMode[draftIndex];
                        const selected =
                          row.takeoff_airfield_id != null
                            ? airfields.find((a) => a.id === row.takeoff_airfield_id)
                            : undefined;
                        const draft = takeoffDrafts[draftIndex] || {
                          name: selected?.name || '',
                          elevation: selected?.elevation || 0,
                          coordinates: selected?.coordinates || '',
                          description: selected?.description || ''
                        };
                        const readOnly = mode === 'existing' && !!selected;
                        const missingCoords = !hasText(draft.coordinates);
                        return (
                          <>
                            <label className="form-field">
                              <span>Name</span>
                              <input
                                type="text"
                                value={draft.name}
                                disabled={readOnly}
                                onChange={(e) =>
                                  setTakeoffDrafts((prev) => ({
                                    ...prev,
                                    [draftIndex]: { ...draft, name: e.target.value }
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className="form-field">
                              <span>Elevation (m)</span>
                              <input
                                type="number"
                                min={0}
                                value={draft.elevation}
                                disabled={readOnly}
                                onChange={(e) =>
                                  setTakeoffDrafts((prev) => ({
                                    ...prev,
                                    [draftIndex]: { ...draft, elevation: Number(e.target.value) }
                                  }))
                                }
                                required
                              />
                            </label>
                            <label className={`form-field ${missingCoords ? 'field-missing' : ''}`}>
                              <span>Coordinates</span>
                              <div className="input-with-button">
                                <input
                                  type="text"
                                  value={draft.coordinates}
                                  disabled={readOnly}
                                  onChange={(e) =>
                                    setTakeoffDrafts((prev) => ({
                                      ...prev,
                                      [draftIndex]: { ...draft, coordinates: e.target.value }
                                    }))
                                  }
                                  required
                                />
                                <button
                                  type="button"
                                  className="ghost"
                                  disabled={!draft.coordinates.trim()}
                                  onClick={() => {
                                    const coords = draft.coordinates.trim();
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
                                value={draft.description || ''}
                                disabled={readOnly}
                                onChange={(e) =>
                                  setTakeoffDrafts((prev) => ({
                                    ...prev,
                                    [draftIndex]: { ...draft, description: e.target.value }
                                  }))
                                }
                                placeholder="Optional"
                              />
                            </label>
                            <div className="form-actions form-field-full-span">
                              {mode === 'new' && (
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => handleCreateTakeoffAirfield(draftIndex)}
                                  disabled={addingAirfield}
                                >
                                  {addingAirfield ? 'Adding…' : 'Create & attach'}
                                </button>
                              )}
                              {mode === 'existing' && selected && (
                                <span className="muted">Viewing details of {selected.name}</span>
                              )}
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => setTakeoffFormVisible((prev) => ({ ...prev, [draftIndex]: false }))}
                                disabled={addingAirfield}
                              >
                                Close
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <div className="innhopp-actions" />
                  <button type="button" className="ghost danger" onClick={() => handleRemoveRow(draftIndex)}>
                    Remove
                  </button>
                </div>
              );
            })}
          <div className="form-actions event-detail-action-wrap event-detail-top-margin">
            <button type="button" className="primary" onClick={handleAddRow} disabled={saving}>
              Create new Innhopp
            </button>
            <button type="submit" className={saveButtonClass} disabled={saving}>
              {saveButtonLabel}
            </button>
            {message && <span className="muted">{message}</span>}
          </div>
        </form>
          </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('airfields')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('airfields');
              }}
            >
              {openSections.airfields ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Airfields</h3>
          </div>
          <span className="badge neutral">{airfieldIds.length} AIRFIELDS</span>
        </header>
        {openSections.airfields && (airfieldIds.length === 0 ? (
          <p className="muted">No airfields linked yet.</p>
        ) : (
          <ul className="status-list event-detail-scroll-list">
            {airfieldIds.map((id) => {
              const airfield = airfields.find((a) => a.id === id);
              return (
                <li
                  key={id}
                  id={`airfield-${id}`}
                  className={`event-detail-list-item${highlightId === `airfield-${id}` ? ' event-detail-list-item--highlighted' : ''}`}
                >
                  <Link
                    to={`/airfields/${id}`}
                    className="card-link event-detail-list-link"
                    onClick={() => {
                      if (eventId) {
                        try {
                          sessionStorage.setItem(`event-detail-highlight:${eventId}`, `airfield-${id}`);
                        } catch {
                          // ignore
                        }
                      }
                      saveDetailState();
                    }}
                  >
                    <strong>{airfield?.name || `Airfield #${id}`}</strong>
                    {airfield?.coordinates && <div className="muted">Coords: {airfield.coordinates}</div>}
                  <div className="muted">
                    Elevation: {airfield?.elevation !== undefined ? formatMetersWithFeet(airfield.elevation) : 'Unknown'}
                    {airfield?.description ? ` • ${airfield.description}` : ''}
                  </div>
                  </Link>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => handleRemoveAirfield(id)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
        {openSections.airfields && (
          <>
        <div className="form-grid event-detail-top-margin">
          <label className="form-field">
            <span>Select airfield</span>
            <select
              value={selectedAirfieldId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedAirfieldId(val);
                if (val === '__new__') {
                  setShowAirfieldForm(true);
                  setSelectedAirfieldId('');
                }
              }}
            >
              <option value="">Choose an airfield</option>
              <option value="__new__">Create new airfield…</option>
              {groupedTakeoffAirfields.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options
                    .filter((opt) => availableAirfields.some((af) => af.id === opt.value))
                    .map((opt) => (
                      <option key={opt.key} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="form-actions event-detail-inline-actions">
            <button
              type="button"
              className="primary"
              onClick={handleAssignAirfield}
              disabled={!selectedAirfieldId}
            >
              Add
            </button>
            <button type="button" className={saveButtonClass} onClick={handleSaveAll} disabled={saving}>
              {saveButtonLabel}
            </button>
          </div>
        </div>
        {showAirfieldForm && (
          <form className="form-grid event-detail-top-margin" onSubmit={handleCreateAirfield}>
            <label className="form-field">
              <span>Name</span>
              <input
                type="text"
                value={airfieldForm.name}
                onChange={(e) => setAirfieldForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>Elevation (m)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={airfieldForm.elevation}
                onChange={(e) => setAirfieldForm((prev) => ({ ...prev, elevation: e.target.value }))}
                required
              />
            </label>
            <label className={`form-field ${missingAirfieldCoords ? 'field-missing' : ''}`}>
              <span>Coordinates (DMS)</span>
              <div className="input-with-button">
                <input
                  type="text"
                  value={airfieldForm.coordinates}
                  onChange={(e) => setAirfieldForm((prev) => ({ ...prev, coordinates: e.target.value }))}
                  pattern={`^[0-9]{1,3}°[0-9]{1,2}'[0-9]{1,2}(?:\\.\\d+)?\"[NS]\\s[0-9]{1,3}°[0-9]{1,2}'[0-9]{1,2}(?:\\.\\d+)?\"[EW]$`}
                  title={`Use DMS format like 11°14'30.0\"N 73°42'59.7\"W`}
                  required
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={!airfieldForm.coordinates.trim()}
                  onClick={() => {
                    const coords = airfieldForm.coordinates.trim();
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
                value={airfieldForm.description}
                onChange={(e) =>
                  setAirfieldForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Optional notes"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="ghost" disabled={addingAirfield}>
                {addingAirfield ? 'Adding…' : 'Create & attach'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowAirfieldForm(false)}
                disabled={addingAirfield}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
          </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('participants')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('participants');
              }}
            >
              {openSections.participants ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Participants</h3>
          </div>
          <span className="badge neutral">
            {
              participantIds.filter((id) => {
                const roles = participants.find((p) => p.id === id)?.roles || [];
                return !roles.includes('Staff');
              }).length
            }{' '}
            Participants
          </span>
        </header>
        {openSections.participants &&
          (participantIds.filter((id) => {
            const roles = participants.find((p) => p.id === id)?.roles || [];
            return !roles.includes('Staff');
          }).length === 0 ? (
            <p className="muted">No participants yet.</p>
          ) : (
            <ul className="status-list event-detail-scroll-list">
              {participantIds
                .map((id) => participants.find((p) => p.id === id))
                .filter(
                  (profile): profile is ParticipantProfile =>
                    !!profile && !(Array.isArray(profile.roles) && profile.roles.includes('Staff'))
                )
                .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }))
                .map((profile) => {
                  const id = profile.id;
                  const roles = Array.isArray(profile.roles) ? profile.roles : [];
                  const hasJumpLeader = roles.includes('Jump Leader');
                  const hasJumpMaster = roles.includes('Jump Master');
                  const extraRoles = roles.filter((role) => {
                    if (role === 'Participant' || role === 'Staff') return false;
                    if (hasJumpLeader && (role === 'Jump Master' || role === 'Skydiver')) return false;
                    if (hasJumpMaster && role === 'Skydiver') return false;
                    return true;
                  });
                  return (
                    <li
                      key={id}
                      id={`participant-${id}`}
                      className={`event-detail-list-item${highlightId === `participant-${id}` ? ' event-detail-list-item--highlighted' : ''}`}
                    >
                      <Link
                        to={`/participants/${id}`}
                        state={{ fromEventId: eventId, highlightId: `participant-${id}` }}
                        className="card-link event-detail-list-link"
                        onClick={() => {
                          if (eventId) {
                            try {
                              sessionStorage.setItem(
                                `event-detail-highlight:${eventId}`,
                                `participant-${id}`
                              );
                            } catch {
                              // ignore
                            }
                          }
                          saveDetailState();
                        }}
                      >
                        <strong>{participantLabel(id)}</strong>
                        <div className="muted">{profile.email || 'No email on file'}</div>
                        <div className="muted">
                          Experience: {profile.experience_level || 'Not provided'}
                        </div>
                        {renderRegistrationSummary(id)}
                        {extraRoles.length > 0 && (
                          <div className="event-detail-role-badges">
                            {extraRoles.map((role) => (
                              <span key={role} className="badge neutral">
                                {role}
                              </span>
                            ))}
                          </div>
                        )}
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
          ))}
        {openSections.participants && (
          <>
            <div className="form-grid event-detail-top-margin">
              <label className="form-field">
                <span>Select participant</span>
                <select
                  value={selectedParticipantId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      setShowParticipantForm(true);
                      setSelectedParticipantId('');
                    } else {
                      setSelectedParticipantId(val);
                    }
                  }}
                >
                  <option value="">Choose a participant</option>
                  <option value="__new__">Create new participant…</option>
                  {availableParticipants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.email || 'No email'})
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions event-detail-compact-actions">
                <button type="button" className="primary" onClick={handleAssignParticipant} disabled={!selectedParticipantId}>
                  Add
                </button>
                <button type="button" className={saveButtonClass} onClick={handleSaveAll} disabled={saving}>
                  {saveButtonLabel}
                </button>
              </div>
            </div>
            {showParticipantForm && (
              <form className="form-grid event-detail-top-margin" onSubmit={handleCreateParticipant}>
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
                <div className="form-field form-field-full-span">
                  <span>Roles</span>
                  <div className="event-detail-role-options">
                    {roleOptions.map((role) => {
                      const checked = participantForm.roles?.includes(role);
                      const disabled = role === 'Staff';
                      return (
                        <label key={role} className="badge neutral event-detail-role-option">
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
                  <p className="muted event-detail-zero-margin">Staff cannot be assigned here.</p>
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
          </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('staff')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('staff');
              }}
            >
              {openSections.staff ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Staff</h3>
          </div>
          <span className="badge neutral">{staffParticipants.length} staff</span>
        </header>
        {openSections.staff && (staffParticipants.length === 0 ? (
          <p className="muted">No staff yet.</p>
        ) : (
          <ul className="status-list event-detail-scroll-list">
            {staffParticipants.map((profile) => {
              const id = profile.id;
              const roles = Array.isArray(profile.roles) ? profile.roles : [];
              const hasJumpLeader = roles.includes('Jump Leader');
              const hasJumpMaster = roles.includes('Jump Master');
              const extraRoles = roles.filter((role) => {
                if (role === 'Participant' || role === 'Staff') return false;
                if (hasJumpLeader && (role === 'Jump Master' || role === 'Skydiver')) return false;
                if (hasJumpMaster && role === 'Skydiver') return false;
                return true;
              });
              return (
                <li
                  key={id}
                  id={`staff-${id}`}
                  className={`event-detail-list-item${highlightId === `staff-${id}` ? ' event-detail-list-item--highlighted' : ''}`}
                >
                  <Link
                    to={`/participants/${id}`}
                    className="card-link event-detail-list-link"
                    onClick={() => {
                      if (eventId) {
                        try {
                          sessionStorage.setItem(`event-detail-highlight:${eventId}`, `staff-${id}`);
                        } catch {
                          // ignore
                        }
                      }
                      saveDetailState();
                    }}
                    state={{ fromEventId: eventId, highlightId: `staff-${id}` }}
                  >
                    <strong>{profile.full_name || participantLabel(id)}</strong>
                    <div className="muted">{profile.email || 'No email on file'}</div>
                    <div className="muted">Experience: {profile.experience_level || 'Not provided'}</div>
                    {renderRegistrationSummary(id)}
                    {extraRoles.length > 0 && (
                      <div className="event-detail-role-badges">
                        {extraRoles.map((role) => (
                          <span key={role} className="badge neutral">
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => handleRemoveParticipant(id)}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
        {openSections.staff && (
          <>
        <div className="form-grid event-detail-top-margin">
          <label className="form-field">
            <span>Select staff</span>
            <select
              value={selectedStaffId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__new__') {
                  setShowStaffForm(true);
                  setSelectedStaffId('');
                } else {
                  setSelectedStaffId(val);
                }
              }}
            >
              <option value="">Choose staff</option>
              <option value="__new__">Create new staff…</option>
              {availableStaff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.email || 'No email'})
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions event-detail-compact-actions">
            <button
              type="button"
              className="primary"
              onClick={handleAssignStaff}
              disabled={!selectedStaffId}
            >
              Add
            </button>
            <button
              type="button"
              className={saveButtonClass}
              onClick={handleSaveAll}
              disabled={saving}
            >
              {saveButtonLabel}
            </button>
          </div>
        </div>
        {showStaffForm && (
          <form className="form-grid event-detail-top-margin" onSubmit={handleCreateStaffParticipant}>
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
                onChange={(e) =>
                  setStaffForm((prev) => ({ ...prev, emergency_contact: e.target.value }))
                }
                placeholder="Optional"
              />
            </label>
            <div className="form-field form-field-full-span">
              <span>Roles</span>
              <div className="event-detail-role-options">
            {roleOptions.map((role) => {
              const checked = staffForm.roles?.includes(role);
              const locked = role === 'Participant' || role === 'Staff';
              return (
                <label key={role} className="badge neutral event-detail-role-option">
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
                        return { ...prev, roles: next.length > 0 ? next : ['Participant', 'Staff'] };
                      });
                    }}
                  />
                  {role}
                </label>
                  );
                })}
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary" disabled={addingStaff}>
                {addingStaff ? 'Adding…' : 'Add staff'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowStaffForm(false)}
                disabled={addingStaff}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
          </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('accommodations')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('accommodations');
              }}
            >
              {openSections.accommodations ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Accommodation</h3>
          </div>
          <span className="badge neutral">
            {accommodations.length} ACCOMMODATIONS
          </span>
        </header>
        {openSections.accommodations && (
          <>
            {accommodations.length > 0 ? (
              <ul className="status-list event-detail-scroll-list">
                {sortedAccommodations.map((acc, idx) => (
                  <li
                    key={acc.id || idx}
                    id={`accommodation-${acc.id}`}
                    className={`event-detail-list-item${highlightId === `accommodation-${acc.id}` ? ' event-detail-list-item--highlighted' : ''}`}
                  >
                    <Link
                      to={`/events/${eventId}/accommodations/${acc.id}`}
                      state={{ fromEventId: eventId, highlightId: `accommodation-${acc.id}` }}
                      className="card-link event-detail-logistics-link"
                      onClick={() => {
                        if (eventId) {
                          try {
                            sessionStorage.setItem(
                              `event-detail-highlight:${eventId}`,
                              `accommodation-${acc.id}`
                            );
                          } catch {
                            // ignore
                          }
                        }
                        saveDetailState();
                      }}
                    >
                      <div className="event-detail-logistics-header-row">
                        <strong>{acc.name || 'Accommodation'}</strong>
                        <span
                          className={`badge ${acc.booked && hasText(acc.coordinates) ? 'success' : 'danger'} event-detail-status-badge-shrink`}
                          aria-label={acc.booked ? 'Booked' : 'Not booked'}
                        >
                          {acc.booked && hasText(acc.coordinates) ? '✓' : 'NOT BOOKED'}
                        </span>
                    </div>
                    <div className="muted event-detail-logistics-meta-top">
                      {acc.capacity ? `Capacity: ${acc.capacity}` : 'Capacity: n/a'}
                    </div>
                    {(acc.check_in_at || acc.check_out_at) && (
                      <div className="muted event-detail-logistics-meta">
                        {acc.check_in_at ? `${formatDateTime24h(acc.check_in_at)}` : ''}
                        {acc.check_in_at && acc.check_out_at ? ' — ' : ''}
                        {acc.check_out_at ? `${formatDateTime24h(acc.check_out_at)}` : ''}
                      </div>
                    )}
                    {acc.notes ? (
                      <div className="muted event-detail-logistics-meta">
                        {acc.notes}
                      </div>
                    ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No accommodation linked yet.</p>
            )}
            <div className="form-actions event-detail-form-toggle-actions">
              <button type="button" className="ghost" onClick={() => setShowAccommodationForm((prev) => !prev)}>
                {showAccommodationForm ? 'Cancel' : 'Create new accommodation'}
              </button>
            </div>
            {showAccommodationForm && (
              <div className="form-grid event-detail-form-toggle-grid">
                <label className="form-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={accommodationForm.name}
                    onChange={(e) => setAccommodationForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Capacity</span>
                  <input
                    type="number"
                    min={0}
                    value={accommodationForm.capacity}
                    onChange={(e) =>
                      setAccommodationForm((prev) => ({ ...prev, capacity: e.target.value }))
                    }
                  />
                </label>
                <label className={`form-field ${missingAccommodationCoords ? 'field-missing' : ''}`}>
                  <span>Coordinates (DMS)</span>
                  <div className="input-with-button">
                    <input
                      type="text"
                      value={accommodationForm.coordinates}
                      onChange={(e) =>
                        setAccommodationForm((prev) => ({ ...prev, coordinates: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="ghost"
                      disabled={!accommodationForm.coordinates.trim()}
                      onClick={() => {
                        const coords = accommodationForm.coordinates.trim();
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
                  <span>Check-in</span>
                  <Flatpickr
                    value={toEventLocalPickerDate(accommodationForm.check_in_at)}
                    options={{ enableTime: true, dateFormat: 'Y-m-d H:i' }}
                    onChange={(dates) => {
                      const date = dates[0];
                      setAccommodationForm((prev) => ({
                        ...prev,
                        check_in_at: date ? fromEventLocalPickerDate(date) : ''
                      }));
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Check-out</span>
                  <Flatpickr
                    value={toEventLocalPickerDate(accommodationForm.check_out_at)}
                    options={{ enableTime: true, dateFormat: 'Y-m-d H:i' }}
                    onChange={(dates) => {
                      const date = dates[0];
                      setAccommodationForm((prev) => ({
                        ...prev,
                        check_out_at: date ? fromEventLocalPickerDate(date) : ''
                      }));
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Booked</span>
                  <div className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={accommodationForm.booked}
                      onChange={(e) => setAccommodationForm((prev) => ({ ...prev, booked: e.target.checked }))}
                    />
                    <span>Mark as booked</span>
                  </div>
                </label>
                <label className="form-field form-field-full-span">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={accommodationForm.notes}
                    onChange={(e) => setAccommodationForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      if (!accommodationForm.name.trim()) return;
                      (async () => {
                        try {
                          const created = await createAccommodation(Number(eventId), {
                            name: accommodationForm.name.trim(),
                            capacity: Number(accommodationForm.capacity) || 0,
                            coordinates: accommodationForm.coordinates.trim() || undefined,
                            booked: accommodationForm.booked,
                            check_in_at: accommodationForm.check_in_at || undefined,
                            check_out_at: accommodationForm.check_out_at || undefined,
                            notes: accommodationForm.notes.trim() || undefined
                          });
                          setAccommodations((prev) => [created, ...prev]);
                          setAccommodationForm({
                            name: '',
                            capacity: '',
                            coordinates: '',
                            booked: false,
                            check_in_at: '',
                            check_out_at: '',
                            notes: ''
                          });
                          setShowAccommodationForm(false);
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : 'Failed to create accommodation');
                        }
                      })();
                    }}
                  >
                    Save accommodation
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setShowAccommodationForm(false);
                      setAccommodationForm({
                        name: '',
                        capacity: '',
                        coordinates: '',
                        booked: false,
                        check_in_at: '',
                        check_out_at: '',
                        notes: ''
                      });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="form-actions event-detail-save-actions">
              <button type="button" className={saveButtonClass} onClick={handleSaveAll} disabled={saving}>
                {saveButtonLabel}
              </button>
            </div>
          </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('transports')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('transports');
              }}
            >
              {openSections.transports ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Transport</h3>
          </div>
          <span className="badge neutral">{transports.length} ROUTES</span>
        </header>
        {openSections.transports && (
          <>
            {transports.length > 0 ? (
              <ul className="status-list event-detail-scroll-list">
                {transports
                  .slice()
                  .sort((a, b) => {
                    const aTime = parseEventLocal(a.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
                    const bTime = parseEventLocal(b.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
                    return aTime - bTime;
                  })
                  .map((t) => {
                    const pickupCoords = locationCoordinates(t.pickup_location);
                    const destCoords = locationCoordinates(t.destination);
                    const hasPassengers = Number.isFinite(t.passenger_count) && t.passenger_count >= 0;
                    const hasVehicles = Array.isArray((t as any).vehicles) && (t as any).vehicles.length > 0;
                    const transportComplete =
                      hasText(t.pickup_location) &&
                      hasText(t.destination) &&
                      hasText(t.scheduled_at) &&
                      hasPassengers &&
                      hasVehicles &&
                      hasText(pickupCoords) &&
                      hasText(destCoords);
                    return (
                    <li
                      key={t.id}
                      id={`transport-${t.id}`}
                      className={`event-detail-list-item${highlightId === `transport-${t.id}` ? ' event-detail-list-item--highlighted' : ''}`}
                    >
                    <Link
                      to={`/logistics/${t.id}`}
                      state={{ fromEventId: eventId, highlightId: `transport-${t.id}` }}
                      className="card-link event-detail-logistics-link"
                      onClick={() => {
                        if (eventId) {
                          try {
                            sessionStorage.setItem(
                              `event-detail-highlight:${eventId}`,
                              `transport-${t.id}`
                            );
                          } catch {
                            // ignore
                          }
                        }
                        saveDetailState();
                      }}
                    >
                      <div className="event-detail-logistics-header-row">
                        <strong className="event-detail-block-strong">
                          {t.pickup_location} → {t.destination}
                        </strong>
                        <div className="event-detail-status-row">
                          <span className={`badge ${transportComplete ? 'success' : 'danger'} event-detail-ready-indicator`}>
                            {transportComplete ? '✓' : '!'}
                          </span>
                          <span className="badge neutral">
                            {t.passenger_count} PAX
                          </span>
                        </div>
                      </div>
                      <div className="muted event-detail-inline-muted-list">
                        {t.scheduled_at ? `${formatDateTime24h(t.scheduled_at)}` : 'Unscheduled'}
                      </div>
                      {Array.isArray((t as any).vehicles) && (t as any).vehicles.length > 0 ? (
                        <div className="muted event-detail-vehicle-list">
                          {(t as any).vehicles.map((v: any, idx: number) => (
                            <div key={idx} className="event-detail-vehicle-row">
                              <strong>{v.name}</strong>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </Link>
                  </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="muted">No transport routes yet.</p>
            )}
            <div className="form-actions event-detail-form-toggle-actions">
              <button type="button" className="ghost" onClick={() => setShowTransportForm((prev) => !prev)}>
                {showTransportForm ? 'Cancel' : 'Create new transport route'}
              </button>
            </div>
            {showTransportForm && (
              <div className="form-grid event-detail-form-toggle-grid">
                <label className="form-field">
                  <span>Pickup location</span>
                  <select
                    value={findTransportLocationValue(transportForm.pickup_location)}
                    onChange={(e) => {
                      const selected = transportLocationGroups
                        .flatMap((group) => group.options)
                        .find((opt) => opt.value === e.target.value);
                      setTransportForm((prev) => ({
                        ...prev,
                        pickup_location: selected?.label || ''
                      }));
                    }}
                    required
                  >
                    <option value="">Select pickup</option>
                    {transportLocationGroups.map(
                      (group) =>
                        group.options.length > 0 && (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={`${group.label}-${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                    )}
                  </select>
                </label>
                <label className="form-field">
                  <span>Destination</span>
                  <select
                    value={findTransportLocationValue(transportForm.destination)}
                    onChange={(e) => {
                      const selected = transportLocationGroups
                        .flatMap((group) => group.options)
                        .find((opt) => opt.value === e.target.value);
                      setTransportForm((prev) => ({
                        ...prev,
                        destination: selected?.label || ''
                      }));
                    }}
                    required
                  >
                    <option value="">Select destination</option>
                    {transportLocationGroups.map(
                      (group) =>
                        group.options.length > 0 && (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={`${group.label}-${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
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
                    value={transportForm.passenger_count}
                    onChange={(e) => setTransportForm((prev) => ({ ...prev, passenger_count: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span>Scheduled at</span>
                  <Flatpickr
                    value={toEventLocalPickerDate(transportForm.scheduled_at)}
                    options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
                    onChange={(dates) => {
                      const d = dates[0];
                      setTransportForm((prev) => ({
                        ...prev,
                        scheduled_at: d ? fromEventLocalPickerDate(d) : ''
                      }));
                    }}
                  />
                </label>
                <div className="form-actions">
              <button type="button" className="primary" onClick={handleCreateTransportInline}>
                Save transport
              </button>
              <button type="button" className="ghost" onClick={() => setShowTransportForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="form-actions event-detail-save-actions">
          <button type="button" className={saveButtonClass} onClick={handleSaveAll} disabled={saving}>
            {saveButtonLabel}
          </button>
        </div>
      </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('groundCrews')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('groundCrews');
              }}
            >
              {openSections.groundCrews ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Ground Crew</h3>
          </div>
          <span className="badge neutral">{groundCrews.length} ENTRIES</span>
        </header>
        {openSections.groundCrews && (
          <>
            {groundCrews.length > 0 ? (
              <ul className="status-list event-detail-scroll-list">
                {groundCrews
                  .slice()
                  .sort((a, b) => {
                    const aTime = parseEventLocal(a.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
                    const bTime = parseEventLocal(b.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
                    return aTime - bTime;
                  })
                  .map((g) => {
                    const pickupCoords = locationCoordinates(g.pickup_location);
                    const destCoords = locationCoordinates(g.destination);
                    const hasPassengers = Number.isFinite(g.passenger_count) && g.passenger_count >= 0;
                    const hasVehicles = Array.isArray((g as any).vehicles) && (g as any).vehicles.length > 0;
                    const groundCrewComplete =
                      hasText(g.pickup_location) &&
                      hasText(g.destination) &&
                      hasText(g.scheduled_at) &&
                      hasPassengers &&
                      hasVehicles &&
                      hasText(pickupCoords) &&
                      hasText(destCoords);
                    return (
                      <li
                        key={g.id}
                        id={`ground-crew-${g.id}`}
                        className={`event-detail-list-item${highlightId === `ground-crew-${g.id}` ? ' event-detail-list-item--highlighted' : ''}`}
                      >
                        <Link
                          to={`/logistics/ground-crew/${g.id}`}
                          state={{ fromEventId: eventId, highlightId: `ground-crew-${g.id}` }}
                          className="card-link event-detail-logistics-link"
                          onClick={() => {
                            if (eventId) {
                              try {
                                sessionStorage.setItem(
                                  `event-detail-highlight:${eventId}`,
                                  `ground-crew-${g.id}`
                                );
                              } catch {
                                // ignore
                              }
                            }
                            saveDetailState();
                          }}
                        >
                          <div className="event-detail-logistics-header-row">
                            <strong className="event-detail-block-strong">
                              {g.pickup_location} → {g.destination}
                            </strong>
                            <div className="event-detail-status-row">
                              <span className={`badge ${groundCrewComplete ? 'success' : 'danger'} event-detail-ready-indicator`}>
                                {groundCrewComplete ? '✓' : '!'}
                              </span>
                            </div>
                          </div>
                          <div className="muted event-detail-inline-muted-list">
                            {g.scheduled_at ? `${formatDateTime24h(g.scheduled_at)}` : 'Unscheduled'}
                          </div>
                          {Array.isArray((g as any).vehicles) && (g as any).vehicles.length > 0 ? (
                            <div className="muted event-detail-vehicle-list">
                              {(g as any).vehicles.map((v: any, idx: number) => (
                                <div key={idx} className="event-detail-vehicle-row">
                                  <strong>{v.name}</strong>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="muted">No ground crew entries yet.</p>
            )}
            <div className="form-actions event-detail-form-toggle-actions">
              <button type="button" className="ghost" onClick={() => setShowGroundCrewForm((prev) => !prev)}>
                {showGroundCrewForm ? 'Cancel' : 'Create new ground crew entry'}
              </button>
            </div>
            {showGroundCrewForm && (
              <div className="form-grid event-detail-form-toggle-grid">
                <label className="form-field">
                  <span>Start location</span>
                  <select
                    value={findTransportLocationValue(groundCrewForm.pickup_location)}
                    onChange={(e) => {
                      const selected = transportLocationGroups
                        .flatMap((group) => group.options)
                        .find((opt) => opt.value === e.target.value);
                      setGroundCrewForm((prev) => ({
                        ...prev,
                        pickup_location: selected?.label || ''
                      }));
                    }}
                    required
                  >
                    <option value="">Select start location</option>
                    {transportLocationGroups.map(
                      (group) =>
                        group.options.length > 0 && (
                          <optgroup key={`gc-start-${group.label}`} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={`gc-start-${group.label}-${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                    )}
                  </select>
                </label>
                <label className="form-field">
                  <span>Destination</span>
                  <select
                    value={findTransportLocationValue(groundCrewForm.destination)}
                    onChange={(e) => {
                      const selected = transportLocationGroups
                        .flatMap((group) => group.options)
                        .find((opt) => opt.value === e.target.value);
                      setGroundCrewForm((prev) => ({
                        ...prev,
                        destination: selected?.label || ''
                      }));
                    }}
                    required
                  >
                    <option value="">Select destination</option>
                    {transportLocationGroups.map(
                      (group) =>
                        group.options.length > 0 && (
                          <optgroup key={`gc-dest-${group.label}`} label={group.label}>
                            {group.options.map((opt) => (
                              <option key={`gc-dest-${group.label}-${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                    )}
                  </select>
                </label>
                <label className="form-field">
                  <span>Crew count</span>
                  <input
                    type="number"
                    min={0}
                    value={groundCrewForm.passenger_count}
                    onChange={(e) => setGroundCrewForm((prev) => ({ ...prev, passenger_count: e.target.value }))}
                  />
                </label>
                <label className="form-field">
                  <span>Scheduled at</span>
                  <Flatpickr
                    value={toEventLocalPickerDate(groundCrewForm.scheduled_at)}
                    options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
                    onChange={(dates) => {
                      const d = dates[0];
                      setGroundCrewForm((prev) => ({
                        ...prev,
                        scheduled_at: d ? fromEventLocalPickerDate(d) : ''
                      }));
                    }}
                  />
                </label>
                <div className="form-actions">
                  <button type="button" className="primary" onClick={handleCreateGroundCrewInline}>
                    Save ground crew
                  </button>
                  <button type="button" className="ghost" onClick={() => setShowGroundCrewForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="form-actions event-detail-save-actions">
              <button type="button" className={saveButtonClass} onClick={handleSaveAll} disabled={saving}>
                {saveButtonLabel}
              </button>
            </div>
          </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('meals')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('meals');
              }}
            >
              {openSections.meals ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Meals</h3>
          </div>
          <span className="badge neutral">{meals.length} MEALS</span>
        </header>
        {openSections.meals && (
          <>
            {meals.length > 0 ? (
              <ul className="status-list event-detail-scroll-list">
                {sortedMeals.map((m) => {
                  const mealComplete = hasText(m.name) && hasText(m.location) && hasText(m.scheduled_at);
                  return (
                        <li
                          key={m.id}
                          id={`meal-${m.id}`}
                          className={`event-detail-list-item${highlightId === `meal-${m.id}` ? ' event-detail-list-item--highlighted' : ''}`}
                        >
                      <Link
                        to={`/logistics/meals/${m.id}`}
                        state={{ fromEventId: eventId, highlightId: `meal-${m.id}` }}
                        className="card-link event-detail-simple-logistics-link"
                        onClick={() => {
                          if (eventId) {
                            try {
                              sessionStorage.setItem(`event-detail-highlight:${eventId}`, `meal-${m.id}`);
                            } catch {
                              // ignore
                            }
                          }
                          saveDetailState();
                        }}
                      >
                        <div className="event-detail-meal-header">
                          <strong className="event-detail-flex-1">{m.name}</strong>
                          <span
                            className={`badge ${mealComplete ? 'success' : 'danger'} event-detail-ready-indicator`}
                          >
                            {mealComplete ? '✓' : '!'}
                          </span>
                        </div>
                        <div className="muted event-detail-inline-muted-list">
                          {m.location ? m.location : 'Location required'}
                          {m.scheduled_at ? `• ${formatDateTime24h(m.scheduled_at)}` : ''}
                        </div>
                        {m.notes ? <div className="muted">{m.notes}</div> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No meals yet.</p>
            )}
          </>
        )}
      </article>

      <article className="card">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('others')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('others');
              }}
            >
              {openSections.others ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Other logistics</h3>
          </div>
          <span className="badge neutral">{others.length} ENTRIES</span>
        </header>
        {openSections.others && (
          <>
            {others.length > 0 ? (
              <ul className="status-list event-detail-scroll-list">
                {others
                  .slice()
                  .sort((a, b) => {
                    const aTime = parseEventLocal(a.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
                    const bTime = parseEventLocal(b.scheduled_at)?.getTime() ?? Number.POSITIVE_INFINITY;
                    return aTime - bTime;
                  })
                  .map((o) => {
                    const otherComplete = hasText(o.name) && hasText(o.coordinates) && hasText(o.scheduled_at);
                    return (
                    <li
                      key={o.id}
                      id={`other-${o.id}`}
                      className={`event-detail-list-item${highlightId === `other-${o.id}` ? ' event-detail-list-item--highlighted' : ''}`}
                    >
                    <Link
                      to={`/logistics/others/${o.id}`}
                      state={{ fromEventId: eventId, highlightId: `other-${o.id}` }}
                      className="card-link event-detail-simple-logistics-link"
                      onClick={() => {
                        if (eventId) {
                          try {
                            sessionStorage.setItem(`event-detail-highlight:${eventId}`, `other-${o.id}`);
                          } catch {
                            // ignore
                          }
                        }
                        saveDetailState();
                      }}
                    >
                      <div className="event-detail-other-header">
                        <strong>{o.name}</strong>
                        <span
                          className={`badge ${otherComplete ? 'success' : 'danger'} event-detail-ready-indicator event-detail-auto-margin-left`}
                        >
                          {otherComplete ? '✓' : '!'}
                        </span>
                      </div>
                      <div className="muted event-detail-inline-muted-list">
                        {o.scheduled_at ? formatDateTime24h(o.scheduled_at) : 'Unscheduled'}
                      </div>
                      {o.notes && <div className="muted">Notes: {o.notes}</div>}
                    </Link>
                  </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="muted">No other logistics yet.</p>
            )}
            <div className="form-actions event-detail-form-toggle-actions">
              <button type="button" className="ghost" onClick={() => setShowOtherForm((prev) => !prev)}>
                {showOtherForm ? 'Cancel' : 'Create new entry'}
              </button>
            </div>
            {showOtherForm && (
              <div className="form-grid event-detail-form-toggle-grid">
                <label className="form-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={otherForm.name}
                    onChange={(e) => setOtherForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label className={`form-field ${missingOtherCoords ? 'field-missing' : ''}`}>
                  <span>Coordinates</span>
                  <div className="input-with-button">
                    <input
                      type="text"
                      value={otherForm.coordinates}
                      onChange={(e) =>
                        setOtherForm((prev) => ({ ...prev, coordinates: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="ghost"
                      disabled={!otherForm.coordinates.trim()}
                      onClick={() => {
                        const coords = otherForm.coordinates.trim();
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
                  <span>Scheduled at</span>
                  <Flatpickr
                    value={toEventLocalPickerDate(otherForm.scheduled_at)}
                    options={{ enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true }}
                    onChange={(dates) => {
                      const d = dates[0];
                      setOtherForm((prev) => ({
                        ...prev,
                        scheduled_at: d ? fromEventLocalPickerDate(d) : ''
                      }));
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Description</span>
                  <textarea
                    value={otherForm.description}
                    onChange={(e) => setOtherForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </label>
                <label className="form-field form-field-full-span">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={otherForm.notes}
                    onChange={(e) => setOtherForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </label>
                <div className="form-actions">
                  <button type="button" className="primary" onClick={handleCreateOtherInline}>
                    Save entry
                  </button>
                  <button type="button" className="ghost" onClick={() => setShowOtherForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="form-actions event-detail-save-actions">
              <button type="button" className={saveButtonClass} onClick={handleSaveAll} disabled={saving}>
                {saveButtonLabel}
              </button>
            </div>
          </>
        )}
      </article>
      {lockNotice}
    </section>
  );
};

export default EventDetailPage;
