import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { isParticipantOnlySession } from '../auth/access';
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
import { hasConfiguredGoogleMapsApiKey, googleMapsApiKey } from '../config/google';
import { parseCoordinates } from '../utils/coordinates';
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

type StopVisualType = 'innhopp' | 'accommodation' | 'meal' | 'other';

type RouteStop = {
  id: string;
  label: string;
  coordinates: string;
  visualType: StopVisualType;
};

type NormalizedRouteStop = RouteStop & {
  lat: number;
  lng: number;
  staticCoordinate: string;
};

type PrintSectionKey = 'route' | 'weekOverview' | 'schedule';
type PrintOptions = Record<PrintSectionKey, boolean>;

const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  route: true,
  weekOverview: true,
  schedule: true
};

const createDefaultPrintOptions = (): PrintOptions => ({
  ...DEFAULT_PRINT_OPTIONS
});

const hasText = (value?: string | null) => !!value && value.trim().length > 0;
const cleanLocation = (val: string) => val.replace(/^#\s*\d+\s*/, '').trim();

const markerColorByType: Record<StopVisualType, string> = {
  innhopp: '0x2b8a3e',
  accommodation: '0x0d6efd',
  meal: '0xd97706',
  other: '0x7e22ce'
};

const iconNameByType: Record<StopVisualType, string> = {
  innhopp: 'paragliding',
  accommodation: 'bed',
  meal: 'restaurant',
  other: 'monitor_heart'
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

const dedupeConsecutiveStops = (points: RouteStop[]) => {
  const deduped: RouteStop[] = [];
  points.forEach((point) => {
    const trimmed = point.coordinates.trim();
    if (!trimmed || !parseCoordinates(trimmed)) return;
    if (deduped[deduped.length - 1]?.coordinates !== trimmed) {
      deduped.push({ ...point, coordinates: trimmed });
    }
  });
  return deduped;
};

const normalizeRouteStops = (points: RouteStop[]): NormalizedRouteStop[] =>
  dedupeConsecutiveStops(points)
    .map((point) => {
      const parsed = parseCoordinates(point.coordinates);
      if (!parsed) return null;
      return {
        ...point,
        lat: parsed.lat,
        lng: parsed.lng,
        staticCoordinate: `${parsed.lat.toFixed(6)},${parsed.lng.toFixed(6)}`
      };
    })
    .filter((point): point is NormalizedRouteStop => !!point);

const toRouteStops = (entry: ScheduleEntry): RouteStop[] => {
  const coordinates = entry.coordinates?.trim();
  if (!coordinates) return [];

  switch (entry.type) {
    case 'Innhopp':
      return [{ id: entry.id, label: entry.title, coordinates, visualType: 'innhopp' }];
    case 'Accommodation':
      return [{ id: entry.id, label: entry.title, coordinates, visualType: 'accommodation' }];
    case 'Meal':
      return [{ id: entry.id, label: entry.title, coordinates, visualType: 'meal' }];
    case 'Other':
      return [{ id: entry.id, label: entry.title, coordinates, visualType: 'other' }];
    default:
      return [];
  }
};

const buildStaticRouteMapUrl = (points: RouteStop[]) => {
  if (!hasConfiguredGoogleMapsApiKey) return null;
  const normalized = normalizeRouteStops(points);
  if (normalized.length === 0) return null;

  const params = new URLSearchParams({
    key: googleMapsApiKey,
    size: '640x640',
    scale: '2',
    maptype: 'roadmap',
    format: 'png'
  });

  params.append('visible', normalized.map((point) => point.staticCoordinate).join('|'));
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
};

const fetchImageAsDataUrl = async (url: string) => {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Failed to load route map image (${response.status})`);
  }

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to encode route map image.'));
    };
    reader.onerror = () => reject(new Error('Failed to read route map image.'));
    reader.readAsDataURL(blob);
  });
};

const buildInlineRouteSvgMarkup = (points: RouteStop[]) => {
  const parsedStops = normalizeRouteStops(points);

  if (parsedStops.length === 0) return null;

  const width = 1200;
  const height = 880;
  const padding = 88;
  const lats = parsedStops.map((stop) => stop.lat);
  const lngs = parsedStops.map((stop) => stop.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  const projectedStops = parsedStops.map((stop) => ({
    ...stop,
    x: padding + ((stop.lng - minLng) / lngRange) * (width - padding * 2),
    y: height - padding - ((stop.lat - minLat) / latRange) * (height - padding * 2)
  }));

  const polylinePoints = projectedStops.map((stop) => `${stop.x.toFixed(2)},${stop.y.toFixed(2)}`).join(' ');

  const markerMarkup = projectedStops
    .map(
      (stop, index) => `
        <g>
          <circle cx="${stop.x.toFixed(2)}" cy="${stop.y.toFixed(2)}" r="16" fill="#${markerColorByType[stop.visualType].slice(2)}" stroke="#ffffff" stroke-width="4" />
          <text x="${stop.x.toFixed(2)}" y="${(stop.y + 5).toFixed(2)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${index + 1}</text>
        </g>
      `
    )
    .join('');

  return `
    <svg class="print-route-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Route map preview for the selected event stops" xmlns="http://www.w3.org/2000/svg">
      <polyline points="${polylinePoints}" fill="none" stroke="#4fa3ff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${polylinePoints}" fill="none" stroke="#1d4ed8" stroke-opacity="0.18" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
      ${markerMarkup}
    </svg>
  `;
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
  const { user } = useAuth();
  const participantOnly = isParticipantOnlySession(user);
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
  const [printOptions, setPrintOptions] = useState<PrintOptions>(() => createDefaultPrintOptions());

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
  const nonStaffCount = eventData ? countVisibleParticipants(eventData.participant_ids, participantLookup) : 0;
  const printSectionCount = Object.values(printOptions).filter(Boolean).length;
  const printableRouteStops = useMemo(
    () =>
      dayBuckets.flatMap((day) =>
        buildOrderedEntriesForDay(day).flatMap((entry) => toRouteStops(entry))
      ),
    [buildOrderedEntriesForDay, dayBuckets]
  );
  const printableRouteMapUrl = useMemo(() => buildStaticRouteMapUrl(printableRouteStops), [printableRouteStops]);
  const printableRouteSvgMarkup = useMemo(() => buildInlineRouteSvgMarkup(printableRouteStops), [printableRouteStops]);
  const printableOverviewDays = useMemo(
    () =>
      dayBuckets
        .filter((day) => day.key !== 'unscheduled')
        .map((day) => {
          const entries = buildOrderedEntriesForDay(day).filter(
            (entry) => entry.type !== 'Transport' && entry.type !== 'Ground Crew'
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
    (options: PrintOptions, routeMapImageSrc?: string | null) => {
      if (!eventData) return '';

      const hasOverview = options.weekOverview;
      const hasRoute = options.route;
      const hasSchedule = options.schedule;
      const overviewNeedsPageBreak = hasOverview && (hasRoute || hasSchedule);
      const scheduleNeedsPageBreak = hasOverview || hasRoute;

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
          <span class="print-overview-item-title">${escapeHtml(entry.title)}</span>
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
              printableRouteMapUrl || printableRouteSvgMarkup
                ? `
                    <figure class="print-route-map-frame">
                      ${
                        routeMapImageSrc
                          ? `<img src="${routeMapImageSrc}" alt="Route map preview for the selected event stops" class="print-route-map-image" />`
                          : ''
                      }
                      <div class="print-route-map-overlay${routeMapImageSrc ? '' : ' print-route-map-overlay--standalone'}">
                        ${printableRouteSvgMarkup || ''}
                      </div>
                    </figure>
                  `
                : '<div class="print-route-empty">No route stops with valid coordinates are available.</div>'
            }
          </section>
        `
        : '';

      const scheduleSection = hasSchedule
        ? `
          <section class="print-section${scheduleNeedsPageBreak ? ' print-section--new-page' : ''}">
            ${
              dayBuckets.length === 0
                ? '<p class="empty-state">No schedule yet.</p>'
                : dayBuckets
                    .map((day) => {
                      const entries = buildOrderedEntriesForDay(day);
                      const dayHeader = `
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
                          <tr>
                            <th colspan="3" class="print-schedule-placeholder-cell" aria-hidden="true">
                              <div class="print-schedule-day-heading print-schedule-day-heading--placeholder">${escapeHtml(day.label)}</div>
                              <div class="print-day-divider print-day-divider--placeholder"></div>
                            </th>
                          </tr>
                        </thead>
                      `;
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
                          <article class="print-day-block print-day-block--schedule">
                            <table class="print-schedule-table">
                              ${dayHeader}
                              <tbody>
                                ${dayOpeningRow}
                                <tr>
                                  <td colspan="3" class="print-schedule-empty-cell">
                                    <p class="empty-state">Nothing scheduled.</p>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </article>
                        `;
                      }
                      return `
                        <article class="print-day-block print-day-block--schedule">
                          <table class="print-schedule-table">
                            ${dayHeader}
                            <tbody>
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
                            </tbody>
                          </table>
                        </article>
                      `;
                    })
                    .join('')
            }
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
    </main>
  </body>
</html>`;
    },
    [buildOrderedEntriesForDay, dayBuckets, eventData, nonStaffCount, printableOverviewDays, printableRouteMapUrl, printableRouteStops, printableRouteSvgMarkup, totalSlots]
  );

  const handleCreatePdf = useCallback(() => {
    if (!eventData || printSectionCount === 0 || printing || typeof document === 'undefined') return;

    setMessage(null);
    setPrinting(true);

    void (async () => {
      let routeMapImageSrc: string | null = null;
      if (printOptions.route && printableRouteMapUrl) {
        try {
          routeMapImageSrc = await fetchImageAsDataUrl(printableRouteMapUrl);
        } catch {
          routeMapImageSrc = null;
        }
      }

      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const cleanup = () => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        setPrinting(false);
      };

      const printWindow = iframe.contentWindow;
      const printDocument = iframe.contentDocument;
      if (!printWindow || !printDocument) {
        cleanup();
        setMessage('Failed to create print preview');
        return;
      }

      let cleaned = false;
      const safeCleanup = () => {
        if (cleaned) return;
        cleaned = true;
        window.removeEventListener('focus', handleWindowFocus);
        cleanup();
      };

      const handleWindowFocus = () => {
        window.setTimeout(safeCleanup, 150);
      };

      printWindow.onafterprint = () => {
        safeCleanup();
      };

      try {
        printDocument.open();
        printDocument.write(buildPrintDocument(printOptions, routeMapImageSrc));
        printDocument.close();
      } catch (err) {
        safeCleanup();
        setMessage(err instanceof Error ? err.message : 'Failed to render print document');
        return;
      }

      window.setTimeout(() => {
        try {
          void Promise.race([
            waitForPrintAssets(printDocument),
            new Promise<void>((resolve) => window.setTimeout(resolve, 3000))
          ]).then(() => {
            window.addEventListener('focus', handleWindowFocus, { once: true });
            printWindow.focus();
            printWindow.print();
            setPrinting(false);
          });
        } catch (err) {
          safeCleanup();
          setMessage(err instanceof Error ? err.message : 'Failed to open print dialog');
          return;
        }
        window.setTimeout(safeCleanup, 60_000);
      }, 120);
    })();
  }, [buildPrintDocument, eventData, printOptions, printSectionCount, printableRouteMapUrl, printing]);

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

      <article className="card event-print-panel">
        <div className="event-print-panel-header">
          <div>
            <p className="event-print-panel-kicker">Printable Event Pack</p>
          </div>
        </div>
        <div className="event-print-panel-options">
          {([
            ['weekOverview', 'Event Overview'],
            ['route', 'Route'],
            ['schedule', 'Schedule']
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
        </div>
        <div className="event-print-panel-actions">
          <button
            type="button"
            className="button-link primary"
            onClick={handleCreatePdf}
            disabled={printSectionCount === 0 || printing}
          >
            {printing ? 'Preparing…' : 'Create PDF'}
          </button>
        </div>
      </article>
    </section>
  );
};

export default EventPrintPage;
