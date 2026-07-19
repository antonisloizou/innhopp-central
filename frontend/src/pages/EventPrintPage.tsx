import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canManageEvents, isParticipantOnlySession } from '../auth/access';
import logo from '../assets/logo.webp';
import materialSymbolsOutlinedTtf from '../assets/fonts/MaterialSymbolsOutlined.ttf';
import printDocumentCss from './EventPrintDocument.css?raw';
import {
  Accommodation,
  copyEvent,
  deleteEvent,
  Event,
  getEvent,
  listAccommodations
} from '../api/events';
import { listAirfields, Airfield } from '../api/airfields';
import {
  GroundCrew,
  listGroundCrews,
  listMeals,
  listOthers,
  listTransports,
  Meal,
  OtherLogistic,
  Transport
} from '../api/logistics';
import { listParticipantProfiles, ParticipantProfile } from '../api/participants';
import EventGearMenu from '../components/EventGearMenu';
import EventPageTitle from '../components/EventPageTitle';
import { EntryType, ScheduleEntry } from '../components/schedulePreviewTypes';
import { googleMapsApiKey, hasConfiguredGoogleMapsApiKey } from '../config/google';
import {
  formatEventLocal,
  getEventLocalDateKey,
  getEventLocalTimeParts,
  parseEventLocal
} from '../utils/eventDate';
import { countVisibleParticipants } from '../utils/eventParticipants';
import { computeDisplayFlightTimeMinutes } from '../utils/innhoppFlightTime';
import { getInnhoppAircraftWarning } from '../utils/innhoppAircraftWarnings';
import { isInnhoppReady } from '../utils/innhoppReadiness';
import { RouteStop, StopVisualType, buildScheduleEntryRouteStops, normalizeRouteStops } from '../utils/routeStops';
import { createEventOverviewPdfUrl, fitEventOverviewPages } from '../utils/eventOverviewPdf';
import { getLongestCommonPrefix, mergeOverviewInnhoppEntries, truncateEventOverviewTitle } from '../utils/eventOverviewInnhopps';

type DayBucket = {
  date: Date;
  label: string;
  key: string;
  innhopps: Event['innhopps'];
  transports: Transport[];
  groundCrews: GroundCrew[];
  accommodations: Accommodation[];
  others: OtherLogistic[];
  meals: Meal[];
};

type PrintSectionKey = 'route' | 'weekOverview' | 'schedule' | 'pilotBrief';
type PrintOptions = Record<PrintSectionKey, boolean>;
type SchedulePrintOptions = {
  newPagePerDay: boolean;
};

const typeFilterOrder: EntryType[] = ['Innhopp', 'Transport', 'Ground Crew', 'Accommodation', 'Meal', 'Other'];

const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  route: true,
  weekOverview: true,
  schedule: true,
  pilotBrief: false
};

const createDefaultPrintOptions = (): PrintOptions => ({
  ...DEFAULT_PRINT_OPTIONS
});

const createDefaultSchedulePrintOptions = (): SchedulePrintOptions => ({
  newPagePerDay: true
});

const createDefaultTypeFilters = (): Record<EntryType, boolean> => ({
  Innhopp: true,
  Transport: true,
  'Ground Crew': true,
  Accommodation: true,
  Other: true,
  Meal: true
});

const hasText = (value?: string | null) => !!value && value.trim().length > 0;
const cleanLocation = (val: string) => val.replace(/^#\s*\d+\s*/, '').trim();

const iconNameByType: Record<StopVisualType, string> = {
  innhopp: 'paragliding',
  accommodation: 'bed',
  meal: 'restaurant',
  other: 'monitor_heart',
  generic: 'location_on'
};

const markerColorByType: Record<StopVisualType, string> = {
  innhopp: '#2b8a3e',
  accommodation: '#0d6efd',
  meal: '#d97706',
  other: '#7e22ce',
  generic: '#64748b'
};

let googleMapsLoader: Promise<any> | null = null;

const waitForGoogleMapsConstructor = (targetWindow: Window = window) =>
  new Promise<any>((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const check = () => {
      const maps = (targetWindow as any).google?.maps;
      if (typeof maps?.Map === 'function') {
        resolve(maps);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('Google Maps did not finish loading.'));
        return;
      }
      targetWindow.setTimeout(check, 25);
    };
    check();
  });

const loadGoogleMapsApi = (targetWindow: Window = window, targetDocument: Document = document) => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }
  if ((targetWindow as any).google?.maps?.Map) {
    return Promise.resolve((targetWindow as any).google.maps);
  }
  if (!hasConfiguredGoogleMapsApiKey) {
    return Promise.reject(new Error('Google Maps API key is not configured.'));
  }
  if (targetWindow === window && googleMapsLoader) return googleMapsLoader;

  const loader = new Promise((resolve, reject) => {
    const callbackName = '__innhoppInitGoogleMapsPrintPreview';
    (targetWindow as any)[callbackName] = () => {
      void waitForGoogleMapsConstructor(targetWindow).then(resolve, reject);
      delete (targetWindow as any)[callbackName];
    };

    if ((targetWindow as any).google?.maps) {
      void waitForGoogleMapsConstructor(targetWindow).then(resolve, reject);
      return;
    }

    const script = targetDocument.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&v=weekly&libraries=marker&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      if (targetWindow === window) {
        googleMapsLoader = null;
      }
      delete (targetWindow as any)[callbackName];
      reject(new Error('Failed to load Google Maps.'));
    };
    targetDocument.head.appendChild(script);
  });

  if (targetWindow === window) {
    googleMapsLoader = loader;
  }

  return loader;
};

const formatDurationMinutes = (minutes?: number | null) => {
  if (!Number.isFinite(minutes) || (minutes as number) <= 0) return 'Unavailable';
  const total = minutes as number;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
};

const formatVehiclesLabel = (vehicles?: { name: string; driver?: string; passenger_capacity: number }[]) =>
  !Array.isArray(vehicles) || vehicles.length === 0
    ? 'No vehicles'
    : vehicles.map((vehicle, index) => (hasText(vehicle.name) ? vehicle.name : `Vehicle ${index + 1}`)).join(', ');

const formatDayLabel = (date: Date) =>
  formatEventLocal(date.toISOString(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const parseTimeParts = (iso?: string | null) => getEventLocalTimeParts(iso);

const formatTimeLabel = (iso?: string | null) => {
  if (!iso) return 'Unscheduled';
  const parts = getEventLocalTimeParts(iso);
  if (!parts) return 'Unscheduled';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
};

const extractDateKey = (iso?: string | null) => getEventLocalDateKey(iso);

const buildDays = (event: Event): Date[] => {
  const days: Date[] = [];
  const start = parseEventLocal(event.starts_at);
  const end = parseEventLocal(event.ends_at);
  if (!start) return days;
  const cursor = new Date(start);
  const last = end && !Number.isNaN(end.getTime()) ? end : start;
  while (cursor.getTime() <= last.getTime()) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const extractPrintContentHtml = (documentHtml: string) => {
  const match = documentHtml.match(/<main class="print-content">([\s\S]*)<\/main>/);
  return match ? match[1] : '';
};

const waitForPrintAssets = async (doc: Document) => {
  const images = Array.from(doc.images);
  if (images.length === 0) return;

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }

          const finalize = () => {
            image.removeEventListener('load', finalize);
            image.removeEventListener('error', finalize);
            resolve();
          };

          image.addEventListener('load', finalize, { once: true });
          image.addEventListener('error', finalize, { once: true });
        })
    )
  );
};

const waitForMapTiles = async (mapElement: HTMLElement, timeoutMs = 4000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const tileImages = Array.from(mapElement.querySelectorAll('img'));
    if (tileImages.length > 0) {
      const allLoaded = tileImages.every((image) => image.complete && image.naturalWidth > 0);
      if (allLoaded) {
        return;
      }
    }

    await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
  }
};

const OVERVIEW_TIME_BANDS = [
  { key: '06-12', label: '06-12', start: 6 * 60, end: 12 * 60 },
  { key: '12-16', label: '12-16', start: 12 * 60, end: 16 * 60 },
  { key: '16-22', label: '16-22', start: 16 * 60, end: 22 * 60 }
] as const;

const getScheduleStatusMeta = (
  entry: ScheduleEntry
): { label: string; variant: 'success' | 'danger' } | null => {
  if (entry.type === 'Accommodation') {
    return entry.booked && !entry.missingCoordinates
      ? { label: '✓', variant: 'success' }
      : { label: '!', variant: 'danger' };
  }
  if (entry.type === 'Innhopp') {
    return entry.ready ? { label: '✓', variant: 'success' } : { label: '!', variant: 'danger' };
  }
  if (entry.type === 'Meal') {
    return entry.mealComplete ? { label: '✓', variant: 'success' } : { label: '!', variant: 'danger' };
  }
  if (entry.type === 'Other') {
    return entry.otherComplete ? { label: '✓', variant: 'success' } : { label: '!', variant: 'danger' };
  }
  if (entry.type === 'Transport' || entry.type === 'Ground Crew') {
    return entry.transportComplete ? { label: '✓', variant: 'success' } : { label: '!', variant: 'danger' };
  }
  return entry.missingCoordinates ? { label: '!', variant: 'danger' } : null;
};

const EventPrintPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const eventOverviewPdf = useMemo(
    () => new URLSearchParams(location.search).get('pdf') === 'event-overview',
    [location.search]
  );
  const { user } = useAuth();
  const participantOnly = isParticipantOnlySession(user);
  const canPrintPilotBrief = canManageEvents(user);
  const [eventData, setEventData] = useState<Event | null>(null);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [groundCrews, setGroundCrews] = useState<GroundCrew[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [debugPreviewOpen, setDebugPreviewOpen] = useState(false);
  const [routeMapReady, setRouteMapReady] = useState(false);
  const [routeMapError, setRouteMapError] = useState<string | null>(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [generatingEventOverviewPdf, setGeneratingEventOverviewPdf] = useState(false);
  const [printOptions, setPrintOptions] = useState<PrintOptions>(() =>
    eventOverviewPdf ? { route: false, weekOverview: true, schedule: false, pilotBrief: false } : createDefaultPrintOptions()
  );
  const [schedulePrintOptions, setSchedulePrintOptions] = useState<SchedulePrintOptions>(() =>
    createDefaultSchedulePrintOptions()
  );
  const [typeFilters, setTypeFilters] = useState<Record<EntryType, boolean>>(() => createDefaultTypeFilters());
  const [pilotBriefAircraftIDs, setPilotBriefAircraftIDs] = useState<number[]>([]);
  const [pilotBriefIncludeAirfields, setPilotBriefIncludeAirfields] = useState(false);
  const printPreviewHostRef = useRef<HTMLDivElement | null>(null);
  const documentTitleBeforePrintRef = useRef<string | null>(null);
  const eventOverviewPdfStartedRef = useRef(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapPolylineRef = useRef<any>(null);
  const mapMarkersRef = useRef<any[]>([]);
  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const participantPromise = participantOnly ? Promise.resolve([]) : listParticipantProfiles();
      const [evt, transportList, groundCrewList, accList, participantList, otherList, mealList, airfieldList] = await Promise.all([
        getEvent(Number(eventId)),
        listTransports(),
        listGroundCrews(),
        listAccommodations(Number(eventId)),
        participantPromise,
        listOthers(),
        listMeals(),
        listAirfields()
      ]);
      setEventData(evt);
      setTransports(Array.isArray(transportList) ? transportList.filter((item) => item.event_id === Number(eventId)) : []);
      setGroundCrews(Array.isArray(groundCrewList) ? groundCrewList.filter((item) => item.event_id === Number(eventId)) : []);
      setAccommodations(Array.isArray(accList) ? accList : []);
      setParticipants(Array.isArray(participantList) ? participantList : []);
      setOthers(Array.isArray(otherList) ? otherList.filter((item) => item.event_id === Number(eventId)) : []);
      setMeals(Array.isArray(mealList) ? mealList.filter((item) => item.event_id === Number(eventId)) : []);
      setAirfields(Array.isArray(airfieldList) ? airfieldList : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load print page');
    } finally {
      setLoading(false);
    }
  }, [eventId, participantOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPrintOptions(createDefaultPrintOptions());
    setSchedulePrintOptions(createDefaultSchedulePrintOptions());
    setTypeFilters(createDefaultTypeFilters());
    setPilotBriefAircraftIDs([]);
    setPilotBriefIncludeAirfields(false);
  }, [eventId]);

  const handleDelete = async () => {
    if (!eventId) return;
    if (!window.confirm('Delete this event?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteEvent(Number(eventId));
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async () => {
    if (!eventId || copying) return;
    setCopying(true);
    setMessage(null);
    try {
      const cloned = await copyEvent(Number(eventId));
      navigate(`/events/${cloned.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to copy event');
    } finally {
      setCopying(false);
    }
  };

  const visibleGroundCrews = participantOnly ? [] : groundCrews;
  const visibleTypeFilterOrder = participantOnly
    ? typeFilterOrder.filter((type) => type !== 'Ground Crew')
    : typeFilterOrder;
  const typeBadgeClassNames: Record<EntryType, string> = {
    Innhopp: 'schedule-type-badge schedule-type-badge--innhopp',
    Transport: 'schedule-type-badge schedule-type-badge--transport',
    'Ground Crew': 'schedule-type-badge schedule-type-badge--ground-crew',
    Accommodation: 'schedule-type-badge schedule-type-badge--accommodation',
    Meal: 'schedule-type-badge schedule-type-badge--meal',
    Other: 'schedule-type-badge schedule-type-badge--other'
  };
  const aircraftByID = useMemo(() => {
    const entries = (eventData?.aircraft || []).map((aircraft) => [aircraft.id, aircraft] as const);
    return new Map(entries);
  }, [eventData?.aircraft]);

  const locationCoordinates = useCallback(
    (name: string | null | undefined) => {
      if (!name) return null;
      const innLabel = (sequence: number, innhoppName: string) => `${sequence ? `#${sequence} ` : ''}${innhoppName || 'Untitled innhopp'}`.trim();
      const inn = eventData?.innhopps?.find((item) => innLabel(item.sequence, item.name) === name);
      if (inn?.coordinates) return inn.coordinates;
      const acc = accommodations.find((item) => item.name === name);
      if (acc?.coordinates) return acc.coordinates;
      const other = others.find((item) => item.name === name);
      if (other?.coordinates) return other.coordinates;
      const airfield = airfields.find((item) => item.name === name);
      if (airfield?.coordinates) return airfield.coordinates;
      return null;
    },
    [accommodations, airfields, eventData?.innhopps, others]
  );

  const dayBuckets: DayBucket[] = useMemo(() => {
    if (!eventData) return [];
    const days = buildDays(eventData);
    const innhopps = Array.isArray(eventData.innhopps) ? eventData.innhopps : [];
    const keys = new Set<string>();

    days.forEach((day) => keys.add(extractDateKey(day.toISOString())));
    transports.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    visibleGroundCrews.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    meals.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    accommodations.forEach((item) => {
      const inKey = extractDateKey(item.check_in_at || undefined);
      const outKey = extractDateKey(item.check_out_at || undefined);
      if (inKey) keys.add(inKey);
      if (outKey) keys.add(outKey);
    });
    others.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });

    const bucketDates = Array.from(keys)
      .filter(Boolean)
      .sort()
      .map((key) => {
        const [year, month, day] = key.split('-').map(Number);
        return { key, date: new Date(Date.UTC(year, month - 1, day)) };
      });

    const buckets = bucketDates.map(({ key, date }) => ({
      date,
      label: key === 'unscheduled' ? 'Unscheduled' : formatDayLabel(date),
      key,
      innhopps: innhopps.filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
      transports: transports.filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
      groundCrews: visibleGroundCrews.filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
      accommodations: accommodations.filter(
        (item) =>
          extractDateKey(item.check_in_at || undefined) === key || extractDateKey(item.check_out_at || undefined) === key
      ),
      others: others.filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
      meals: meals.filter((item) => extractDateKey(item.scheduled_at || undefined) === key)
    }));

    const unscheduledTransports = transports.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');
    const unscheduledGroundCrews = visibleGroundCrews.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');
    const unscheduledOthers = others.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');
    const unscheduledMeals = meals.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');

    if (
      (unscheduledTransports.length > 0 ||
        unscheduledGroundCrews.length > 0 ||
        unscheduledOthers.length > 0 ||
        unscheduledMeals.length > 0) &&
      !keys.has('unscheduled')
    ) {
      buckets.push({
        date: new Date(),
        label: 'Unscheduled',
        key: 'unscheduled',
        innhopps: [],
        transports: unscheduledTransports,
        groundCrews: unscheduledGroundCrews,
        accommodations: [],
        others: unscheduledOthers,
        meals: unscheduledMeals
      });
    }

    return buckets;
  }, [accommodations, eventData, meals, others, transports, visibleGroundCrews]);

  const buildOrderedEntriesForDay = useCallback(
    (day: DayBucket): ScheduleEntry[] => {
      const entries: ScheduleEntry[] = [];

      day.innhopps.forEach((item) => {
        const takeoff = airfields.find((airfield) => airfield.id === item.takeoff_airfield_id);
        const landing = airfields.find((airfield) => airfield.id === item.landing_airfield_id);
        const aircraft = item.aircraft_id ? aircraftByID.get(item.aircraft_id) || null : null;
        const aircraftWarning = getInnhoppAircraftWarning(item, eventData?.aircraft || []);
        const flightTimeMinutes = computeDisplayFlightTimeMinutes(
          item.distance_by_air,
          aircraft?.cruising_speed_kmh ?? null,
          aircraft?.minimum_load_duration ?? null
        );
        const flightDurationLabel = flightTimeMinutes != null ? formatDurationMinutes(flightTimeMinutes) : 'Unavailable';
        const landingName =
          landing?.name ||
          (item.landing_airfield_id == null || item.landing_airfield_id === item.takeoff_airfield_id ? takeoff?.name || null : null);

        entries.push({
          id: `i-${item.id}`,
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = parseTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          title: `Innhopp #${item.sequence}: ${item.name}`,
          subtitle: '',
          type: 'Innhopp',
          innhoppSequence: item.sequence,
          innhoppName: item.name,
          ready: isInnhoppReady(item),
          coordinates: item.coordinates || null,
          missingCoordinates: !hasText(item.coordinates),
          notes: item.notes || undefined,
          innhoppAircraftWarning: aircraftWarning,
          routeDurationLabel: flightDurationLabel,
          scheduledAt: item.scheduled_at
        });
      });

      day.transports.forEach((item) => {
        const pickupCoords = locationCoordinates(item.pickup_location);
        const destinationCoords = locationCoordinates(item.destination);
        const hasPassengers = Number.isFinite(item.passenger_count) && item.passenger_count >= 0;
        const hasVehicles = Array.isArray(item.vehicles) && item.vehicles.length > 0;
        const complete =
          hasText(item.pickup_location) &&
          hasText(item.destination) &&
          hasText(item.scheduled_at) &&
          hasPassengers &&
          hasVehicles &&
          hasText(pickupCoords) &&
          hasText(destinationCoords);
        const vehicles = Array.isArray(item.vehicles)
          ? item.vehicles.map((vehicle) => ({
              name: vehicle.name,
              driver: vehicle.driver || '',
              passenger_capacity: vehicle.passenger_capacity
            }))
          : [];
        const routeDurationLabel = formatDurationMinutes(item.duration_minutes);
        const routeVehiclesLabel = formatVehiclesLabel(vehicles);

        entries.push({
          id: `t-${item.id}`,
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = parseTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          title: `${cleanLocation(item.pickup_location)} → ${cleanLocation(item.destination)}`,
          subtitle: `${routeDurationLabel} • ${routeVehiclesLabel}`,
          type: 'Transport',
          transportComplete: complete,
          missingCoordinates: !pickupCoords || !destinationCoords,
          routeDurationLabel,
          routeVehiclesLabel,
          notes: item.notes || null,
          vehicles,
          scheduledAt: item.scheduled_at || undefined
        });
      });

      day.groundCrews.forEach((item) => {
        const pickupCoords = locationCoordinates(item.pickup_location);
        const destinationCoords = locationCoordinates(item.destination);
        const hasPassengers = Number.isFinite(item.passenger_count) && item.passenger_count >= 0;
        const hasVehicles = Array.isArray(item.vehicles) && item.vehicles.length > 0;
        const complete =
          hasText(item.pickup_location) &&
          hasText(item.destination) &&
          hasText(item.scheduled_at) &&
          hasPassengers &&
          hasVehicles &&
          hasText(pickupCoords) &&
          hasText(destinationCoords);
        const vehicles = Array.isArray(item.vehicles)
          ? item.vehicles.map((vehicle) => ({
              name: vehicle.name,
              driver: vehicle.driver || '',
              passenger_capacity: vehicle.passenger_capacity
            }))
          : [];
        const routeDurationLabel = formatDurationMinutes(item.duration_minutes);
        const routeVehiclesLabel = formatVehiclesLabel(vehicles);

        entries.push({
          id: `gc-${item.id}`,
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = parseTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          title: `${cleanLocation(item.pickup_location)} → ${cleanLocation(item.destination)}`,
          subtitle: `${routeDurationLabel} • ${routeVehiclesLabel}`,
          type: 'Ground Crew',
          transportComplete: complete,
          missingCoordinates: !pickupCoords || !destinationCoords,
          routeDurationLabel,
          routeVehiclesLabel,
          notes: item.notes || null,
          vehicles,
          scheduledAt: item.scheduled_at || undefined
        });
      });

      day.others.forEach((item) => {
        entries.push({
          id: `o-${item.id}`,
          hourKey: formatTimeLabel(item.scheduled_at || undefined),
          sortValue: (() => {
            const parts = parseTimeParts(item.scheduled_at || undefined);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          title: item.name || 'Other logistics',
          subtitle: '',
          type: 'Other',
          coordinates: item.coordinates || null,
          missingCoordinates: !hasText(item.coordinates),
          notes: item.notes || null,
          otherComplete: hasText(item.name) && hasText(item.coordinates) && hasText(item.scheduled_at),
          scheduledAt: item.scheduled_at || undefined
        });
      });

      day.meals.forEach((item) => {
        const mealCoordinates = locationCoordinates(item.location);
        entries.push({
          id: `meal-${item.id}`,
          hourKey: formatTimeLabel(item.scheduled_at || undefined),
          sortValue: (() => {
            const parts = parseTimeParts(item.scheduled_at || undefined);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          title: item.name,
          subtitle: '',
          type: 'Meal',
          coordinates: mealCoordinates,
          mealComplete: hasText(item.name) && hasText(item.location) && hasText(item.scheduled_at),
          location: item.location || null,
          notes: item.notes || null,
          scheduledAt: item.scheduled_at || undefined
        });
      });

      day.accommodations.forEach((item) => {
        if (item.check_in_at && extractDateKey(item.check_in_at) === day.key) {
          entries.push({
            id: `acc-in-${item.id}`,
            hourKey: formatTimeLabel(item.check_in_at),
            sortValue: (() => {
              const parts = parseTimeParts(item.check_in_at);
              return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
            })(),
            title: `Check-in: ${item.name}`,
            subtitle: '',
            type: 'Accommodation',
            booked: !!item.booked,
            coordinates: item.coordinates || null,
            missingCoordinates: !hasText(item.coordinates),
            notes: item.notes || null,
            scheduledAt: item.check_in_at
          });
        }
        if (item.check_out_at && extractDateKey(item.check_out_at) === day.key) {
          entries.push({
            id: `acc-out-${item.id}`,
            hourKey: formatTimeLabel(item.check_out_at),
            sortValue: (() => {
              const parts = parseTimeParts(item.check_out_at);
              return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
            })(),
            title: `Check-out: ${item.name}`,
            subtitle: '',
            type: 'Accommodation',
            booked: !!item.booked,
            coordinates: item.coordinates || null,
            missingCoordinates: !hasText(item.coordinates),
            notes: item.notes || null,
            scheduledAt: item.check_out_at
          });
        }
        if (!item.check_in_at && !item.check_out_at) {
          entries.push({
            id: `acc-${item.id}`,
            hourKey: 'Unscheduled',
            sortValue: Number.POSITIVE_INFINITY,
            title: item.name,
            subtitle: '',
            type: 'Accommodation',
            booked: !!item.booked,
            coordinates: item.coordinates || null,
            missingCoordinates: !hasText(item.coordinates),
            scheduledAt: null
          });
        }
      });

      return entries.sort((a, b) => {
        if (a.sortValue === b.sortValue) return a.title.localeCompare(b.title);
        return a.sortValue - b.sortValue;
      });
    },
    [accommodations, aircraftByID, airfields, eventData?.aircraft, locationCoordinates]
  );

  const totalSlots = eventData?.slots ?? 0;
  const participantLookup = useMemo(() => new Map(participants.map((participant) => [participant.id, participant])), [participants]);
  const nonStaffCount = eventData
    ? countVisibleParticipants(eventData.participant_ids, participantLookup, eventData.participant_count)
    : 0;
  const printSectionCount = Object.entries(printOptions).filter(
    ([key, selected]) => selected && (key !== 'pilotBrief' || canPrintPilotBrief)
  ).length;
  const selectedPilotBriefAircraft = useMemo(
    () =>
      (eventData?.aircraft || []).filter((aircraft) =>
        pilotBriefAircraftIDs.includes(aircraft.id)
      ),
    [eventData?.aircraft, pilotBriefAircraftIDs]
  );
  const printDocumentTitle = useMemo(() => {
    if (!eventData) return 'Innhopp Central';
    const sections = [
      printOptions.weekOverview ? 'Event Overview' : null,
      printOptions.route ? 'Route' : null,
      printOptions.schedule ? 'Schedule' : null,
      canPrintPilotBrief && printOptions.pilotBrief && selectedPilotBriefAircraft.length > 0 ? 'Pilot Brief' : null
    ].filter((section): section is string => Boolean(section));
    return sections.length > 0 ? `${eventData.name} - ${sections.join(', ')}` : eventData.name;
  }, [canPrintPilotBrief, eventData, printOptions, selectedPilotBriefAircraft.length]);
  const printableRouteStops = useMemo(
    () =>
      dayBuckets.flatMap((day) =>
        buildOrderedEntriesForDay(day).flatMap((entry) => buildScheduleEntryRouteStops(entry))
      ),
    [buildOrderedEntriesForDay, dayBuckets]
  );
  const printableRouteGeometry = useMemo(
    () =>
      normalizeRouteStops(printableRouteStops).map((stop) => ({
        ...stop,
        color: markerColorByType[stop.visualType]
      })),
    [printableRouteStops]
  );

  const printableOverviewDays = useMemo(
    () =>
      dayBuckets
        .filter((day) => day.key !== 'unscheduled')
        .map((day) => {
          const entries = mergeOverviewInnhoppEntries(
            buildOrderedEntriesForDay(day).filter((entry) => entry.type !== 'Transport' && entry.type !== 'Ground Crew')
          );
          const bandMap = new Map<string, ScheduleEntry[]>();
          OVERVIEW_TIME_BANDS.forEach((band) => bandMap.set(band.key, []));

          entries.forEach((entry) => {
            if (entry.type === 'Accommodation') return;
            const parts = parseTimeParts(entry.scheduledAt ?? undefined);
            if (!parts) return;
            const minutes = parts.hour * 60 + parts.minute;
            const normalized = minutes < 6 * 60 ? minutes + 24 * 60 : minutes;
            const band = OVERVIEW_TIME_BANDS.find(
              (candidate) => 'start' in candidate && 'end' in candidate && normalized >= candidate.start && normalized < candidate.end
            );
            if (band) {
              bandMap.get(band.key)?.push(entry);
            }
          });

          const unscheduledEntries = entries.filter((entry) => !parseTimeParts(entry.scheduledAt ?? undefined));
          const nightAccommodationName =
            accommodations.find((item) => {
              const checkInKey = extractDateKey(item.check_in_at || undefined);
              const checkOutKey = extractDateKey(item.check_out_at || undefined);

              if (checkInKey && checkOutKey) {
                return day.key >= checkInKey && day.key < checkOutKey;
              }
              if (checkInKey) {
                return day.key === checkInKey;
              }
              if (checkOutKey) {
                return day.key === checkOutKey;
              }
              return false;
            })?.name || null;

          return {
            ...day,
            shortLabel: formatEventLocal(day.date.toISOString(), { weekday: 'short', day: 'numeric' }) || day.label,
            bands: OVERVIEW_TIME_BANDS.map((band) => ({
              ...band,
              entries: bandMap.get(band.key) || []
            })),
            unscheduledEntries,
            nightAccommodationName
          };
        }),
    [accommodations, buildOrderedEntriesForDay, dayBuckets]
  );

  const buildPrintDocument = useCallback(
    (options: PrintOptions, routeMapMarkup?: string) => {
      if (!eventData) return '';

      const hasOverview = options.weekOverview;
      const hasRoute = options.route;
      const hasSchedule = options.schedule;
      const hasPilotBrief = canPrintPilotBrief && options.pilotBrief && selectedPilotBriefAircraft.length > 0;
      const pilotBriefColumnCount = pilotBriefIncludeAirfields ? 6 : 4;
      const overviewNeedsPageBreak = hasOverview && (hasRoute || hasSchedule);
      const scheduleNeedsPageBreak = hasOverview || hasRoute;
      const pilotBriefNeedsPageBreak = hasPilotBrief && (hasOverview || hasRoute || hasSchedule);
      const scheduleTypeFilterSet = new Set(
        visibleTypeFilterOrder.filter((type) => typeFilters[type])
      );

      const renderMetaLine = (entry: ScheduleEntry) => {
        const base = entry.routeDurationLabel && (entry.routeVehiclesLabel || entry.type === 'Innhopp')
          ? [
            entry.routeDurationLabel,
            entry.routeVehiclesLabel,
            entry.type === 'Innhopp' ? entry.innhoppAircraftWarning : null
          ]
          : [entry.subtitle, entry.type === 'Innhopp' ? entry.innhoppAircraftWarning : null];
        return [...base, entry.notes]
          .filter((part): part is string => Boolean(part))
          .join(' • ');
      };

      const renderEntry = (entry: ScheduleEntry) => {
        const status = getScheduleStatusMeta(entry);
        const typeClass = `type-${entry.type.toLowerCase().replace(/\s+/g, '-')}`;
        const metaLine = renderMetaLine(entry);
        return `
          <li class="print-entry">
            <div class="print-entry-time">${escapeHtml(entry.hourKey || 'Unscheduled')}</div>
            <div class="print-entry-main">
              <div class="print-entry-header">
                <div class="print-entry-title">${escapeHtml(entry.title)}</div>
                <div class="print-entry-badges">
                  ${status ? `<span class="print-badge status-${status.variant}">${escapeHtml(status.label)}</span>` : ''}
                  <span class="print-badge print-type-badge ${typeClass}">${escapeHtml(entry.type.toUpperCase())}</span>
                </div>
              </div>
              ${metaLine ? `<div class="print-entry-subtitle">${escapeHtml(metaLine)}</div>` : ''}
            </div>
          </li>
        `;
      };

      const renderOverviewEntry = (entry: ScheduleEntry) => {
        const typeClass = `type-${entry.type.toLowerCase().replace(/\s+/g, '-')}`;
        return `
        <div class="print-overview-item ${typeClass}">
          <span class="print-overview-item-title">${escapeHtml(truncateEventOverviewTitle(entry.title))}</span>
        </div>
      `;
      };

      const mergedNightCells = (() => {
        const cells: string[] = [];
        let index = 0;

        while (index < printableOverviewDays.length) {
          const name = printableOverviewDays[index].nightAccommodationName;
          let span = 1;
          while (index + span < printableOverviewDays.length && printableOverviewDays[index + span].nightAccommodationName === name) {
            span += 1;
          }
          cells.push(`
            <td${span > 1 ? ` colspan="${span}"` : ''} class="print-overview-night-cell">
              ${name ? `<div class="print-overview-night-title">${escapeHtml(name)}</div>` : '<div class="print-overview-empty">-</div>'}
            </td>
          `);
          index += span;
        }

        return cells.join('');
      })();

      const weekOverviewSection = hasOverview
        ? `
          <section class="print-overview-page${overviewNeedsPageBreak ? ' print-overview-page--page-break' : ''}">
            <div class="print-overview-page-content">
              <header class="print-overview-hero">
              <div class="print-schedule-header">
                <img src="${logo}" alt="The Innhopp Project logo" class="print-schedule-header-logo" />
                <h1 class="print-schedule-header-title">${escapeHtml(eventData.name)}</h1>
                <div class="print-schedule-header-spacer" aria-hidden="true"></div>
              </div>
              <div class="print-overview-meta">
                <div class="print-overview-hero-main">
                  <p class="print-overview-dates">${escapeHtml(
                    eventData.starts_at
                      ? formatEventLocal(eventData.starts_at, { month: 'short', day: 'numeric', year: 'numeric' }) || 'TBD'
                      : 'TBD'
                  )} - ${escapeHtml(
                    eventData.ends_at
                      ? formatEventLocal(eventData.ends_at, { month: 'short', day: 'numeric', year: 'numeric' }) || 'TBD'
                      : 'TBD'
                  )}</p>
                  <div class="print-overview-badges">
                    ${
                      eventData.status
                        ? `<span class="print-badge print-overview-summary-badge status-${escapeHtml(eventData.status)}">${escapeHtml(
                            eventData.status
                          )}</span>`
                        : ''
                    }
                    <span class="print-badge print-overview-summary-badge print-overview-summary-badge--slots">${escapeHtml(
                      totalSlots > 0 ? `${totalSlots} slots` : 'Slots not set'
                    )}</span>
                    <span class="print-badge print-overview-summary-badge print-overview-summary-badge--participants">${escapeHtml(
                      `${nonStaffCount} participants`
                    )}</span>
                    <span class="print-badge print-overview-summary-badge print-overview-summary-badge--innhopps">${escapeHtml(
                      `${eventData.innhopps?.length ?? 0} innhopps`
                    )}</span>
                  </div>
                  <p class="print-location">${escapeHtml(eventData.location || 'Location TBD')}</p>
                </div>
              </div>
              </header>
              <div class="print-overview-board-wrap">
              <table class="print-overview-board">
                <thead>
                  <tr>
                    <th class="print-overview-axis">Time</th>
                    ${printableOverviewDays
                      .map(
                        (day) => `
                          <th>
                            <div class="print-overview-day-name">${escapeHtml(day.shortLabel)}</div>
                            <div class="print-overview-day-date">${escapeHtml(
                              formatEventLocal(day.date.toISOString(), { month: 'short' }) || ''
                            )}</div>
                          </th>
                        `
                      )
                      .join('')}
                  </tr>
                </thead>
                <tbody>
                  ${OVERVIEW_TIME_BANDS.map(
                    (band) => `
                      <tr>
                        <th class="print-overview-axis">${escapeHtml(band.label)}</th>
                        ${printableOverviewDays
                          .map((day) => {
                            const entries = day.bands.find((candidate) => candidate.key === band.key)?.entries || [];
                            return `
                              <td>
                                ${
                                  entries.length > 0
                                    ? entries.map(renderOverviewEntry).join('')
                                    : '<div class="print-overview-empty">-</div>'
                                }
                              </td>
                            `;
                          })
                          .join('')}
                      </tr>
                    `
                  ).join('')}
                  <tr>
                    <th class="print-overview-axis">Night</th>
                    ${mergedNightCells}
                  </tr>
                </tbody>
              </table>
              </div>
              ${
              printableOverviewDays.some((day) => day.unscheduledEntries.length > 0)
                ? `
                    <section class="print-overview-notes">
                      <div class="print-overview-notes-label">Unscheduled</div>
                      <div class="print-overview-notes-list">
                        ${printableOverviewDays
                          .flatMap((day) =>
                            day.unscheduledEntries.map(
                              (entry) => `<span class="print-overview-note">${escapeHtml(`${day.shortLabel}: ${entry.title}`)}</span>`
                            )
                          )
                          .join('')}
                      </div>
                    </section>
                  `
                : ''
              }
            </div>
          </section>
        `
        : '';

      const routeSection = hasRoute
        ? `
          <section class="print-section print-route-page${hasOverview ? ' print-section--new-page' : ''}">
            <header class="print-route-header">
              <div class="print-schedule-header">
                <img src="${logo}" alt="The Innhopp Project logo" class="print-schedule-header-logo" />
                <h1 class="print-schedule-header-title">${escapeHtml(eventData.name)}</h1>
                <div class="print-schedule-header-spacer" aria-hidden="true"></div>
              </div>
            </header>
            <div class="print-route-legend">
              <span class="print-route-legend-item"><span class="print-route-legend-icon print-route-legend-icon--innhopp"><span class="material-symbols-outlined">${iconNameByType.innhopp}</span></span>Innhopp</span>
              <span class="print-route-legend-item"><span class="print-route-legend-icon print-route-legend-icon--accommodation"><span class="material-symbols-outlined">${iconNameByType.accommodation}</span></span>Hotel</span>
              <span class="print-route-legend-item"><span class="print-route-legend-icon print-route-legend-icon--meal"><span class="material-symbols-outlined">${iconNameByType.meal}</span></span>Meal</span>
              <span class="print-route-legend-item"><span class="print-route-legend-icon print-route-legend-icon--other"><span class="material-symbols-outlined">${iconNameByType.other}</span></span>Other</span>
            </div>
            ${
              routeMapMarkup
                ? `
                    <figure class="print-route-map-frame">
                      ${routeMapMarkup}
                    </figure>
                  `
                : '<div class="print-route-empty">No route stops with valid coordinates are available.</div>'
            }
          </section>
        `
        : '';

      const scheduleDocumentHeader = `
        <colgroup>
          <col class="print-schedule-col-time" />
          <col class="print-schedule-col-main" />
          <col class="print-schedule-col-badges" />
        </colgroup>
        <thead>
          <tr>
            <th colspan="3" class="print-schedule-header-cell">
              <div class="print-schedule-header">
                <img src="${logo}" alt="The Innhopp Project logo" class="print-schedule-header-logo" />
                <h1 class="print-schedule-header-title">${escapeHtml(eventData.name)}</h1>
                <div class="print-schedule-header-spacer" aria-hidden="true"></div>
              </div>
            </th>
          </tr>
        </thead>
      `;
      const renderScheduleDayRows = (day: DayBucket) => {
        const entries = buildOrderedEntriesForDay(day).filter((entry) => scheduleTypeFilterSet.has(entry.type));
        const dayOpeningRow = `
          <tr class="print-schedule-day-row">
            <td colspan="3" class="print-schedule-day-cell">
              <div class="print-schedule-day-heading">${escapeHtml(day.label)}</div>
              <div class="print-day-divider"></div>
            </td>
          </tr>
        `;

        if (entries.length === 0) {
          return `
            ${dayOpeningRow}
            <tr>
              <td colspan="3" class="print-schedule-empty-cell">
                <p class="empty-state">Nothing scheduled.</p>
              </td>
            </tr>
          `;
        }

        return `
          ${dayOpeningRow}
          ${entries
            .map((entry) => {
              const status = getScheduleStatusMeta(entry);
              const typeClass = `type-${entry.type.toLowerCase().replace(/\s+/g, '-')}`;
              const metaLine = renderMetaLine(entry);
              return `
                <tr class="print-schedule-row">
                  <td class="print-schedule-time-cell">${escapeHtml(entry.hourKey || 'Unscheduled')}</td>
                  <td class="print-schedule-main-cell">
                    <div class="print-entry-title">${escapeHtml(entry.title)}</div>
                    ${metaLine ? `<div class="print-entry-subtitle">${escapeHtml(metaLine)}</div>` : ''}
                  </td>
                  <td class="print-schedule-badges-cell">
                    <div class="print-entry-badges">
                      ${status ? `<span class="print-badge status-${status.variant}">${escapeHtml(status.label)}</span>` : ''}
                      <span class="print-badge print-type-badge ${typeClass}">${escapeHtml(entry.type.toUpperCase())}</span>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        `;
      };

      const scheduleSection = hasSchedule
        ? `
          <section class="print-section${scheduleNeedsPageBreak ? ' print-section--new-page' : ''}">
            ${
              dayBuckets.length === 0
                ? '<p class="empty-state">No schedule yet.</p>'
                : schedulePrintOptions.newPagePerDay
                  ? dayBuckets
                      .map((day) => {
                        const dayPlaceholderHeader = `
                          <tr>
                            <th colspan="3" class="print-schedule-placeholder-cell" aria-hidden="true">
                              <div class="print-schedule-day-heading print-schedule-day-heading--placeholder">${escapeHtml(day.label)}</div>
                              <div class="print-day-divider print-day-divider--placeholder"></div>
                            </th>
                          </tr>
                        `;
                        return `
                          <article class="print-day-block print-day-block--schedule print-day-block--page-break">
                            <table class="print-schedule-table">
                              ${scheduleDocumentHeader.replace('</thead>', `${dayPlaceholderHeader}</thead>`)}
                              <tbody>
                                ${renderScheduleDayRows(day)}
                              </tbody>
                            </table>
                          </article>
                        `;
                      })
                      .join('')
                  : `
                      <article class="print-day-block print-day-block--schedule">
                        <table class="print-schedule-table">
                          ${scheduleDocumentHeader}
                          <tbody>
                            ${dayBuckets.map((day) => renderScheduleDayRows(day)).join('')}
                          </tbody>
                        </table>
                      </article>
                    `
            }
          </section>
        `
        : '';

      const pilotBriefSection = hasPilotBrief
        ? `
          <section class="print-pilot-brief-section${pilotBriefNeedsPageBreak ? ' print-section--new-page' : ''}">
            ${selectedPilotBriefAircraft
              .map((aircraft, aircraftIndex) => {
                const innhopps = (eventData.innhopps || [])
                  .filter((innhopp) => innhopp.aircraft_id === aircraft.id)
                  .sort((a, b) => {
                    const aDate = a.scheduled_at || '9999-12-31T23:59:59Z';
                    const bDate = b.scheduled_at || '9999-12-31T23:59:59Z';
                    if (aDate !== bDate) return aDate.localeCompare(bDate);
                    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
                    return a.name.localeCompare(b.name);
                  });
                const mergedInnhopps = Array.from(
                  innhopps.reduce((groups, innhopp) => {
                    const coordinates = innhopp.coordinates?.trim() || '';
                    const airfieldKey = pilotBriefIncludeAirfields
                      ? `\u0000${innhopp.takeoff_airfield_id ?? ''}\u0000${innhopp.landing_airfield_id ?? ''}`
                      : '';
                    const groupKey = `${innhopp.sequence}\u0000${coordinates}${airfieldKey}`;
                    const group = groups.get(groupKey) || [];
                    group.push(innhopp);
                    groups.set(groupKey, group);
                    return groups;
                  }, new Map<string, typeof innhopps>()).values()
                );
                const renderMergedValues = (values: Array<string | null | undefined>) =>
                  [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
                    .map((value) => escapeHtml(value))
                    .join('<br />') || '—';
                const renderAirfield = (airfieldID?: number | null) => {
                  const airfield = airfields.find((item) => item.id === airfieldID);
                  if (!airfield) return '—';
                  return [airfield.name, airfield.coordinates]
                    .filter((value): value is string => Boolean(value?.trim()))
                    .map((value) => escapeHtml(value.trim()))
                    .join('<br />') || '—';
                };
                return `
                  <article class="print-pilot-brief-page${aircraftIndex > 0 ? ' print-pilot-brief-page--page-break' : ''}${pilotBriefIncludeAirfields ? ' print-pilot-brief-page--airfields' : ''}">
                    <header class="print-pilot-brief-header">
                      <div class="print-schedule-header">
                        <img src="${logo}" alt="The Innhopp Project logo" class="print-schedule-header-logo" />
                        <h1 class="print-schedule-header-title">${escapeHtml(eventData.name)}</h1>
                        <div class="print-schedule-header-spacer" aria-hidden="true"></div>
                      </div>
                      <div>
                        <div class="print-section-kicker">Pilot Brief</div>
                        <h2>${escapeHtml(aircraft.name)}</h2>
                      </div>
                    </header>
                    <table class="print-pilot-brief-table${pilotBriefIncludeAirfields ? ' print-pilot-brief-table--airfields' : ''}">
                      <thead>
                        <tr>
                          <th>Scheduled At</th>
                          <th>Name</th>
                          ${pilotBriefIncludeAirfields ? '<th>Takeoff</th><th>Drop</th><th>Landing</th>' : '<th>Coordinates</th>'}
                          <th>Jumprun</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${
                          mergedInnhopps.length > 0
                            ? mergedInnhopps
                                .map(
                                  (group) => {
                                    const first = group[0];
                                    const name = group.length > 1
                                      ? getLongestCommonPrefix(group.map((innhopp) => innhopp.name || 'Untitled innhopp'))
                                      : first.name || 'Untitled innhopp';
                                    const displayName = `Innhopp ${first.sequence || '—'}${name ? `: ${name}` : ''}`;
                                    return `
                                    <tr>
                                      <td>${escapeHtml(formatEventLocal(first.scheduled_at, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hourCycle: 'h23'
                                      }) || '—')}</td>
                                      <td>${escapeHtml(truncateEventOverviewTitle(displayName))}</td>
                                      ${pilotBriefIncludeAirfields
                                        ? `<td>${renderAirfield(first.takeoff_airfield_id)}</td><td>${escapeHtml(first.coordinates?.trim() || '—')}</td><td>${renderAirfield(first.landing_airfield_id)}</td>`
                                        : `<td>${escapeHtml(first.coordinates?.trim() || '—')}</td>`}
                                      <td>${renderMergedValues(group.map((innhopp) => innhopp.jumprun))}</td>
                                    </tr>
                                  `;
                                  }
                                )
                                .join('')
                            : `<tr><td colspan="${pilotBriefColumnCount}" class="print-pilot-brief-empty">No innhopps assigned to this aircraft.</td></tr>`
                        }
                      </tbody>
                    </table>
                  </article>
                `;
              })
              .join('')}
          </section>
        `
        : '';

      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(eventData.name)} Print</title>
    <style>
      @font-face {
        font-family: 'Material Symbols Outlined';
        font-style: normal;
        font-weight: 400;
        src: url('${materialSymbolsOutlinedTtf}') format('truetype');
      }
    </style>
    <style>${printDocumentCss}</style>
  </head>
  <body>
    <main class="print-content">
      ${weekOverviewSection}
      ${routeSection}
      ${scheduleSection}
      ${pilotBriefSection}
    </main>
  </body>
</html>`;
    },
    [
      buildOrderedEntriesForDay,
      airfields,
      dayBuckets,
      eventData,
      nonStaffCount,
      printableOverviewDays,
      canPrintPilotBrief,
      pilotBriefIncludeAirfields,
      selectedPilotBriefAircraft,
      schedulePrintOptions.newPagePerDay,
      totalSlots,
      typeFilters,
      visibleTypeFilterOrder
    ]
  );

  const printPreviewHtml = useMemo(
    () =>
      extractPrintContentHtml(
        buildPrintDocument(
          printOptions,
          printOptions.route
            ? '<div id="print-route-google-map" class="print-route-map-google" aria-label="Route map preview for the selected event stops"></div>'
            : undefined
        )
      ),
    [buildPrintDocument, printOptions]
  );

  const eventOverviewPdfHtml = useMemo(
    () => extractPrintContentHtml(buildPrintDocument({ route: false, weekOverview: true, schedule: false, pilotBrief: false })),
    [buildPrintDocument]
  );

  const fitRouteMap = useCallback(
    (maps: any, map: any) => {
      if (printableRouteGeometry.length === 0) return;
      if (printableRouteGeometry.length === 1) {
        map.setCenter({ lat: printableRouteGeometry[0].lat, lng: printableRouteGeometry[0].lng });
        map.setZoom(12);
        return;
      }
      const bounds = new maps.LatLngBounds();
      printableRouteGeometry.forEach((stop) => bounds.extend({ lat: stop.lat, lng: stop.lng }));
      map.fitBounds(bounds, 56);
    },
    [printableRouteGeometry]
  );

  useEffect(() => {
    if (!printPreviewOpen || !printOptions.route) {
      setRouteMapReady(false);
      setRouteMapError(null);
      return;
    }
    if (printableRouteGeometry.length === 0) {
      setRouteMapReady(false);
      setRouteMapError('No route stops with valid coordinates are available.');
      return;
    }
    if (!hasConfiguredGoogleMapsApiKey) {
      setRouteMapReady(false);
      setRouteMapError('Google Maps API key is not configured.');
      return;
    }

    const mapElement = document.getElementById('print-route-google-map') as HTMLDivElement | null;
    if (!mapElement) {
      setRouteMapReady(false);
      setRouteMapError(null);
      return;
    }

    let cancelled = false;
    setRouteMapReady(false);
    setRouteMapError(null);

    void loadGoogleMapsApi()
      .then((maps) => {
        if (cancelled) return;

        if (!mapInstanceRef.current || mapContainerRef.current !== mapElement) {
          mapInstanceRef.current = new maps.Map(mapElement, {
            mapId: 'DEMO_MAP_ID',
            mapTypeId: 'hybrid',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'none',
            clickableIcons: false
          });
          mapContainerRef.current = mapElement;
        }

        const map = mapInstanceRef.current;
        mapMarkersRef.current.forEach((marker) => marker.setMap?.(null));
        mapMarkersRef.current = [];
        mapPolylineRef.current?.setMap?.(null);
        mapPolylineRef.current = null;

        mapPolylineRef.current = new maps.Polyline({
          path: printableRouteGeometry.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
          geodesic: true,
          strokeColor: '#4fa3ff',
          strokeOpacity: 0.95,
          strokeWeight: 4,
          map
        });

        mapMarkersRef.current = printableRouteGeometry.map(
          (stop, index) =>
            new maps.Marker({
              position: { lat: stop.lat, lng: stop.lng },
              map,
              title: `${index + 1}. ${stop.label}`,
              label: {
                text: String(index + 1),
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '12px'
              },
              icon: {
                path: maps.SymbolPath.CIRCLE,
                fillColor: stop.color,
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: 18
              }
            })
        );

        fitRouteMap(maps, map);
        window.setTimeout(() => {
          if (cancelled) return;
          maps.event?.trigger?.(map, 'resize');
          fitRouteMap(maps, map);
          maps.event?.addListenerOnce?.(map, 'tilesloaded', () => {
            if (!cancelled) setRouteMapReady(true);
          });
          window.setTimeout(() => {
            if (!cancelled) setRouteMapReady(true);
          }, 1800);
        }, 150);
      })
      .catch((err) => {
        if (!cancelled) {
          setRouteMapReady(false);
          setRouteMapError(err instanceof Error ? err.message : 'Failed to load Google Maps preview.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fitRouteMap, printOptions.route, printPreviewOpen, printableRouteGeometry]);

  useEffect(() => {
    const handleAfterPrint = () => {
      if (documentTitleBeforePrintRef.current !== null) {
        document.title = documentTitleBeforePrintRef.current;
        documentTitleBeforePrintRef.current = null;
      }
      if (!debugPreviewOpen) {
        setPrintPreviewOpen(false);
      }
      setPrinting(false);
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [debugPreviewOpen]);

  useEffect(() => {
    document.body.classList.toggle('event-print-preview-active', printPreviewOpen);
    return () => {
      document.body.classList.remove('event-print-preview-active');
    };
  }, [printPreviewOpen]);

  useEffect(() => {
    if (!debugPreviewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setDebugPreviewOpen(false);
      setPrintPreviewOpen(false);
      setPrinting(false);
      setMessage(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [debugPreviewOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const host = document.createElement('div');
    host.className = 'event-print-preview-host';
    document.body.prepend(host);
    printPreviewHostRef.current = host;

    return () => {
      if (host.parentNode) {
        host.parentNode.removeChild(host);
      }
      if (printPreviewHostRef.current === host) {
        printPreviewHostRef.current = null;
      }
    };
  }, []);

  const validatePrintRequest = useCallback(() => {
    if (!eventData || printSectionCount === 0 || printing || typeof document === 'undefined') return false;
    if (printOptions.route && printableRouteStops.length === 0) {
      setMessage('No route stops with valid coordinates are available.');
      return false;
    }
    if (printOptions.route && !hasConfiguredGoogleMapsApiKey) {
      setMessage('Google Maps API key is not configured.');
      return false;
    }
    return true;
  }, [eventData, printOptions.route, printSectionCount, printableRouteStops.length, printing]);

  const handleOpenPrintPreview = useCallback(() => {
    if (!validatePrintRequest()) return;

    setMessage(null);
    setPrinting(false);
    setDebugPreviewOpen(true);
    setPrintPreviewOpen(true);
  }, [validatePrintRequest]);

  const handleCreatePdf = useCallback(() => {
    if (!validatePrintRequest()) return;

    if (documentTitleBeforePrintRef.current === null) {
      documentTitleBeforePrintRef.current = document.title;
    }
    document.title = printDocumentTitle;
    setMessage(null);
    setPrinting(true);
    setDebugPreviewOpen(false);
    setPrintPreviewOpen(true);
  }, [printDocumentTitle, validatePrintRequest]);

  useEffect(() => {
    if (!eventOverviewPdf || !eventData || eventOverviewPdfStartedRef.current) return;
    eventOverviewPdfStartedRef.current = true;
    setGeneratingEventOverviewPdf(true);

    void createEventOverviewPdfUrl({
      html: eventOverviewPdfHtml,
      css: printDocumentCss,
      filename: `${eventData.name} - Event Overview.pdf`
    })
      .then((pdfUrl) => {
        window.location.replace(pdfUrl);
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : 'Failed to generate Event Overview PDF');
        setGeneratingEventOverviewPdf(false);
      });
  }, [eventData, eventOverviewPdf, eventOverviewPdfHtml]);

  useEffect(() => {
    if (!printing || !printPreviewOpen) return;
    if (printOptions.route && routeMapError) {
      setMessage(routeMapError);
      setPrinting(false);
      if (documentTitleBeforePrintRef.current !== null) {
        document.title = documentTitleBeforePrintRef.current;
        documentTitleBeforePrintRef.current = null;
      }
      return;
    }
    if (printOptions.route && !routeMapReady) return;

    if (debugPreviewOpen) {
      setMessage('Print preview is open. Printing is skipped while preview mode is enabled.');
      setPrinting(false);
      return;
    }

    const run = async () => {
      await waitForPrintAssets(document);
      fitEventOverviewPages(document);
      if (printOptions.route) {
        const mapElement = document.getElementById('print-route-google-map') as HTMLDivElement | null;
        if (mapElement) {
          await waitForMapTiles(mapElement);
        }
      }
      window.setTimeout(() => {
        window.print();
      }, 150);
    };

    void run().catch((err) => {
      setPrinting(false);
      setMessage(err instanceof Error ? err.message : 'Failed to open print dialog');
      if (documentTitleBeforePrintRef.current !== null) {
        document.title = documentTitleBeforePrintRef.current;
        documentTitleBeforePrintRef.current = null;
      }
    });
  }, [debugPreviewOpen, printOptions.route, printPreviewOpen, printing, routeMapError, routeMapReady]);

  if (loading) return <p className="muted">Loading print page…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!eventData) return <p className="error-text">Event not found.</p>;

  return (
    <section className="stack event-print-page">
      <header className="page-header">
        <EventPageTitle event={eventData} section="Print" showSlotsBadge />
        <EventGearMenu
          eventId={eventData.id}
          currentPage="print"
          copying={copying}
          deleting={deleting}
          menuId="event-print-actions-menu"
          onCopy={() => void handleCopy()}
          onDelete={() => void handleDelete()}
        />
      </header>

      {message ? <p className="error-text">{message}</p> : null}
      {generatingEventOverviewPdf ? <p className="muted">Generating Event Overview PDF…</p> : null}

      {printPreviewOpen && printPreviewHostRef.current
        ? createPortal(
            <section
              className={`event-print-preview-overlay${debugPreviewOpen ? ' event-print-preview-overlay--debug' : ''}`}
              aria-hidden={!debugPreviewOpen}
            >
              <div className="event-print-preview-shell">
                <style>{`
                  @font-face {
                    font-family: 'Material Symbols Outlined';
                    font-style: normal;
                    font-weight: 400;
                    src: url('${materialSymbolsOutlinedTtf}') format('truetype');
                  }
                `}</style>
                <style>{printDocumentCss}</style>
                <div className="event-print-preview-root" dangerouslySetInnerHTML={{ __html: printPreviewHtml }} />
              </div>
            </section>,
            printPreviewHostRef.current
          )
        : null}

      <article className="card event-print-panel">
        <div className="event-print-panel-header">
          <div>
            <p className="event-print-panel-kicker">Printable Event Pack</p>
          </div>
        </div>
        <div className="event-print-panel-options">
          {([
            ['weekOverview', 'Event Overview'],
            ['route', 'Route']
          ] as Array<[PrintSectionKey, string]>).map(([key, label]) => (
            <label key={key} className="event-print-option">
              <input
                type="checkbox"
                checked={printOptions[key]}
                onChange={(event) =>
                  setPrintOptions((prev) => ({
                    ...prev,
                    [key]: event.target.checked
                  }))
                }
                disabled={printing}
              />
              <span>{label}</span>
            </label>
          ))}
          <div className="event-print-option-group">
            <label className="event-print-option">
              <input
                type="checkbox"
                checked={printOptions.schedule}
                onChange={(event) =>
                  setPrintOptions((prev) => ({
                    ...prev,
                    schedule: event.target.checked
                  }))
                }
                disabled={printing}
              />
              <span>Schedule</span>
            </label>
            {printOptions.schedule ? (
              <>
                <label className="event-print-option event-print-option--sub">
                  <input
                    type="checkbox"
                    checked={schedulePrintOptions.newPagePerDay}
                    onChange={(event) =>
                      setSchedulePrintOptions((prev) => ({
                        ...prev,
                        newPagePerDay: event.target.checked
                      }))
                    }
                    disabled={printing}
                  />
                  <span>New page for every day</span>
                </label>
                <div className="event-schedule-filters">
                  <strong>Include:</strong>
                  <div className="event-schedule-filter-list">
                    {visibleTypeFilterOrder.map((type) => {
                      const selected = typeFilters[type];
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            setTypeFilters((prev) => ({
                              ...prev,
                              [type]: !prev[type]
                            }))
                          }
                          className="event-schedule-filter-button"
                          aria-pressed={selected}
                          disabled={printing}
                        >
                          <span
                            className={`badge ${typeBadgeClassNames[type]} ${selected ? '' : 'schedule-type-badge--inactive'}`.trim()}
                          >
                            {type.toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          {canPrintPilotBrief ? (
            <div className="event-print-option-group">
              <label className="event-print-option">
                <input
                  type="checkbox"
                  checked={printOptions.pilotBrief}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setPrintOptions((prev) => ({ ...prev, pilotBrief: checked }));
                    if (checked && pilotBriefAircraftIDs.length === 0) {
                      setPilotBriefAircraftIDs((eventData.aircraft || []).map((aircraft) => aircraft.id));
                    }
                  }}
                  disabled={printing}
                />
                <span>Pilot Brief</span>
              </label>
              {printOptions.pilotBrief ? (
                <div className="event-print-pilot-brief-aircraft">
                  <label className="event-print-option event-print-option--sub">
                    <input
                      type="checkbox"
                      checked={pilotBriefIncludeAirfields}
                      onChange={(event) => setPilotBriefIncludeAirfields(event.target.checked)}
                      disabled={printing}
                    />
                    <span>Include airfields</span>
                  </label>
                  {(eventData.aircraft || []).map((aircraft) => (
                    <label key={aircraft.id} className="event-print-option event-print-option--sub">
                      <input
                        type="checkbox"
                        checked={pilotBriefAircraftIDs.includes(aircraft.id)}
                        onChange={(event) =>
                          setPilotBriefAircraftIDs((prev) =>
                            event.target.checked
                              ? [...prev, aircraft.id]
                              : prev.filter((id) => id !== aircraft.id)
                          )
                        }
                        disabled={printing}
                      />
                      <span>{aircraft.name}</span>
                    </label>
                  ))}
                  {eventData.aircraft.length === 0 ? <p className="muted">No aircraft are attached to this event.</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="event-print-panel-actions">
          <button
            type="button"
            className="button-link primary"
            onClick={handleOpenPrintPreview}
            disabled={printSectionCount === 0 || printing}
          >
            Print Preview
          </button>
          <button
            type="button"
            className="button-link primary"
            onClick={handleCreatePdf}
            disabled={printSectionCount === 0 || printing}
          >
            {printing ? 'Preparing…' : 'Create PDF'}
          </button>
          {debugPreviewOpen ? (
            <button
              type="button"
              className="button-link secondary"
              onClick={() => {
                setDebugPreviewOpen(false);
                setPrintPreviewOpen(false);
                setPrinting(false);
                setMessage(null);
              }}
            >
              Close Debug Preview
            </button>
          ) : null}
        </div>
      </article>
    </section>
  );
};

export default EventPrintPage;
