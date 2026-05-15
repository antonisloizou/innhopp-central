import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Accommodation, Event, copyEvent, deleteEvent, getEvent, listAccommodations } from '../api/events';
import { Airfield, listAirfields } from '../api/airfields';
import { GroundCrew, listGroundCrews, listMeals, listOthers, listTransports, Meal, OtherLogistic, Transport } from '../api/logistics';
import { getBudgetAssumptions, getEventBudget } from '../api/budgets';
import { useAuth } from '../auth/AuthProvider';
import { canUseStaffMapsActions, isParticipantOnlySession } from '../auth/access';
import { googleMapsApiKey, hasConfiguredGoogleMapsApiKey } from '../config/google';
import { formatEventLocal, getEventLocalDateKey, getEventLocalTimeParts, parseEventLocal } from '../utils/eventDate';
import { parseCoordinates } from '../utils/coordinates';
import { isInnhoppReady } from '../utils/innhoppReadiness';
import EventGearMenu from '../components/EventGearMenu';
import ScheduleEntryPreviewOverlay from '../components/ScheduleEntryPreviewOverlay';
import { EntryType, ScheduleEntry } from '../components/schedulePreviewTypes';

type DayBucket = {
  date: Date;
  key: string;
  label: string;
  innhopps: Event['innhopps'];
  transports: Transport[];
  groundCrews: GroundCrew[];
  accommodations: Accommodation[];
  others: OtherLogistic[];
  meals: Meal[];
};

type RoutePlannerEntry = ScheduleEntry & {
  routePoints: RouteStop[];
  disabled: boolean;
};

type StopVisualType = 'innhopp' | 'accommodation' | 'meal' | 'other' | 'generic';

type RouteStop = {
  id: string;
  entryId: string;
  label: string;
  coordinates: string;
  visualType: StopVisualType;
};

const OVERLAY_EXIT_MS = 180;

const hasText = (value?: string | null) => !!value && value.trim().length > 0;

const cleanLocation = (value: string) => value.replace(/^#\s*\d+\s*/, '').trim();

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

const formatTimeLabel = (iso?: string | null) => {
  if (!iso) return 'Unscheduled';
  const parts = getEventLocalTimeParts(iso);
  if (!parts) return 'Unscheduled';
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
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

const formatDayLabel = (date: Date) =>
  formatEventLocal(date.toISOString(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const buildDateFromKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const dedupeConsecutiveStops = (points: RouteStop[]) => {
  const deduped: RouteStop[] = [];
  points.forEach((point) => {
    const trimmed = point.coordinates.trim();
    if (!trimmed) return;
    if (deduped[deduped.length - 1]?.coordinates !== trimmed) {
      deduped.push({ ...point, coordinates: trimmed });
    }
  });
  return deduped;
};

const buildMapsUrl = (points: RouteStop[]) => {
  const ordered = dedupeConsecutiveStops(points).map((point) => point.coordinates);
  if (ordered.length === 0) return null;
  if (ordered.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ordered[0])}`;
  }
  const origin = ordered[0];
  const destination = ordered[ordered.length - 1];
  const waypoints = ordered.slice(1, -1);
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving'
  });
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
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
    const callbackName = '__innhoppInitGoogleMapsRoutePreview';
    (window as any)[callbackName] = () => {
      resolve((window as any).google.maps);
      delete (window as any)[callbackName];
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&v=weekly&libraries=marker&loading=async&callback=${callbackName}`;
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

const markerColorByType: Record<StopVisualType, string> = {
  innhopp: '#2b8a3e',
  accommodation: '#0d6efd',
  meal: '#d97706',
  other: '#7e22ce',
  generic: '#64748b'
};

const iconNameByType: Record<StopVisualType, string> = {
  innhopp: 'paragliding',
  accommodation: 'bed',
  meal: 'restaurant',
  other: 'monitor_heart',
  generic: 'location_on'
};

type RouteMapOverlay = 'hybrid' | 'roadmap';

const renderPreviewIcon = (type: StopVisualType) => <span className="material-symbols-outlined">{iconNameByType[type]}</span>;

const buildAdvancedMarkerContent = (type: StopVisualType) => {
  const wrapper = document.createElement('div');
  wrapper.className = `event-route-preview-marker event-route-preview-marker--${type}`;
  wrapper.style.backgroundColor = markerColorByType[type];

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined event-route-preview-marker-icon';
  icon.textContent = iconNameByType[type];
  wrapper.appendChild(icon);

  return wrapper;
};

const EventRoutePlannerPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const participantOnly = isParticipantOnlySession(user);
  const canOpenMapsActions = canUseStaffMapsActions(user);
  const [eventData, setEventData] = useState<Event | null>(null);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [groundCrews, setGroundCrews] = useState<GroundCrew[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [loading, setLoading] = useState(true);
  const [budgetAircraftSpeedKmh, setBudgetAircraftSpeedKmh] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionInitializedRef = useRef(false);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapMarkersRef = useRef<any[]>([]);
  const mapPolylineRef = useRef<any | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [mapOverlay, setMapOverlay] = useState<RouteMapOverlay>('hybrid');
  const mapOverlayRef = useRef<RouteMapOverlay>('hybrid');
  const [previewEntry, setPreviewEntry] = useState<RoutePlannerEntry | null>(null);
  const [renderedPreviewEntry, setRenderedPreviewEntry] = useState<RoutePlannerEntry | null>(null);
  const [previewClosing, setPreviewClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadBudgetSpeed = async () => {
      if (!eventId) return;
      setBudgetAircraftSpeedKmh(null);
      try {
        const budget = await getEventBudget(Number(eventId));
        const assumptions = await getBudgetAssumptions(budget.id);
        if (cancelled) return;
        const speed = assumptions?.values?.aircraft_cruising_speed_kmh;
        if (typeof speed === 'number' && Number.isFinite(speed) && speed > 0) {
          setBudgetAircraftSpeedKmh(speed);
        } else {
          setBudgetAircraftSpeedKmh(null);
        }
      } catch {
        if (!cancelled) setBudgetAircraftSpeedKmh(null);
      }
    };
    void loadBudgetSpeed();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const resolveLocationStop = useCallback(
    (name: string | null | undefined) => {
      if (!name) return null;
      const innLabel = (i: Event['innhopps'][number]) =>
        `${i.sequence ? `#${i.sequence} ` : ''}${i.name || 'Untitled innhopp'}`.trim();
      const inn = eventData?.innhopps?.find((i) => innLabel(i) === name);
      if (inn?.coordinates) {
        return {
          coordinates: inn.coordinates,
          label: name,
          visualType: 'innhopp' as const
        };
      }
      const acc = accommodations.find((a) => a.name === name);
      if (acc?.coordinates) {
        return {
          coordinates: acc.coordinates,
          label: name,
          visualType: 'accommodation' as const
        };
      }
      const other = others.find((o) => o.name === name);
      if (other?.coordinates) {
        return {
          coordinates: other.coordinates,
          label: name,
          visualType: 'other' as const
        };
      }
      const airfield = airfields.find((a) => a.name === name);
      if (airfield?.coordinates) {
        return {
          coordinates: airfield.coordinates,
          label: name,
          visualType: 'generic' as const
        };
      }
      return null;
    },
    [accommodations, airfields, eventData?.innhopps, others]
  );

  useEffect(() => {
    selectionInitializedRef.current = false;
    setSelectedIds(new Set());
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      try {
        const [evt, transportList, groundCrewList, accommodationList, otherList, mealList, airfieldList] = await Promise.all([
          getEvent(Number(eventId)),
          listTransports(),
          listGroundCrews(),
          listAccommodations(Number(eventId)),
          listOthers(),
          listMeals(),
          listAirfields()
        ]);
        if (cancelled) return;
        setEventData(evt);
        setTransports(Array.isArray(transportList) ? transportList.filter((item) => item.event_id === Number(eventId)) : []);
        setGroundCrews(Array.isArray(groundCrewList) ? groundCrewList.filter((item) => item.event_id === Number(eventId)) : []);
        setAccommodations(Array.isArray(accommodationList) ? accommodationList : []);
        setOthers(Array.isArray(otherList) ? otherList.filter((item) => item.event_id === Number(eventId)) : []);
        setMeals(Array.isArray(mealList) ? mealList.filter((item) => item.event_id === Number(eventId)) : []);
        setAirfields(Array.isArray(airfieldList) ? airfieldList : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load route planner');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const visibleGroundCrews = participantOnly ? [] : groundCrews;

  const dayBuckets = useMemo(() => {
    if (!eventData) return [] as DayBucket[];
    const days = buildDays(eventData);
    const keys = new Set<string>();
    eventData.innhopps?.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    transports.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    visibleGroundCrews.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    accommodations.forEach((item) => {
      const checkInKey = extractDateKey(item.check_in_at || undefined);
      const checkOutKey = extractDateKey(item.check_out_at || undefined);
      if (checkInKey) keys.add(checkInKey);
      if (checkOutKey) keys.add(checkOutKey);
    });
    others.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    meals.forEach((item) => {
      const key = extractDateKey(item.scheduled_at || undefined);
      if (key) keys.add(key);
    });

    days.forEach((date) => keys.add(extractDateKey(date.toISOString())));

    const datedBuckets = [...keys]
      .filter((key) => key && key !== 'unscheduled')
      .map((key) => {
        const date = days.find((candidate) => extractDateKey(candidate.toISOString()) === key) || buildDateFromKey(key);
        return {
          date,
          key,
          label: formatDayLabel(date),
          innhopps: (eventData.innhopps || []).filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
          transports: transports.filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
          groundCrews: visibleGroundCrews.filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
          accommodations: accommodations.filter(
            (item) => extractDateKey(item.check_in_at || undefined) === key || extractDateKey(item.check_out_at || undefined) === key
          ),
          others: others.filter((item) => extractDateKey(item.scheduled_at || undefined) === key),
          meals: meals.filter((item) => extractDateKey(item.scheduled_at || undefined) === key)
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const unscheduledAccommodations = accommodations.filter((item) => !item.check_in_at && !item.check_out_at);
    const unscheduledTransports = transports.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');
    const unscheduledGroundCrews = visibleGroundCrews.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');
    const unscheduledOthers = others.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');
    const unscheduledMeals = meals.filter((item) => !item.scheduled_at || extractDateKey(item.scheduled_at) === '');

    if (
      unscheduledAccommodations.length > 0 ||
      unscheduledTransports.length > 0 ||
      unscheduledGroundCrews.length > 0 ||
      unscheduledOthers.length > 0 ||
      unscheduledMeals.length > 0
    ) {
      datedBuckets.push({
        date: days[days.length - 1] || new Date(),
        key: 'unscheduled',
        label: 'Unscheduled',
        innhopps: [],
        transports: unscheduledTransports,
        groundCrews: unscheduledGroundCrews,
        accommodations: unscheduledAccommodations,
        others: unscheduledOthers,
        meals: unscheduledMeals
      });
    }

    return datedBuckets;
  }, [accommodations, eventData, meals, others, transports, visibleGroundCrews]);

  useEffect(() => {
    if (dayBuckets.length === 0) return;
    setExpandedDays((prev) => {
      const next = { ...prev };
      dayBuckets.forEach((day) => {
        if (typeof next[day.key] !== 'boolean') {
          next[day.key] = true;
        }
      });
      return next;
    });
  }, [dayBuckets]);

  const typeBadgeClassNames: Record<EntryType, string> = {
    Innhopp: 'schedule-type-badge schedule-type-badge--innhopp',
    Transport: 'schedule-type-badge schedule-type-badge--transport',
    'Ground Crew': 'schedule-type-badge schedule-type-badge--ground-crew',
    Accommodation: 'schedule-type-badge schedule-type-badge--accommodation',
    Meal: 'schedule-type-badge schedule-type-badge--meal',
    Other: 'schedule-type-badge schedule-type-badge--other'
  };

  const buildEntriesForDay = useCallback(
    (day: DayBucket) => {
      const entries: RoutePlannerEntry[] = [];

      day.innhopps.forEach((item) => {
        const takeoff = airfields.find((af) => af.id === item.takeoff_airfield_id);
        const landing = airfields.find((af) => af.id === item.landing_airfield_id);
        const landingName =
          landing?.name ||
          ((item.landing_airfield_id == null || item.landing_airfield_id === item.takeoff_airfield_id) ? takeoff?.name || null : null);
        const elevationDiff =
          typeof item.elevation === 'number' && typeof takeoff?.elevation === 'number' ? item.elevation - takeoff.elevation : null;
        const routePoints = hasText(item.coordinates)
          ? [
              {
                id: `i-${item.id}`,
                entryId: `i-${item.id}`,
                label: item.name,
                coordinates: item.coordinates!.trim(),
                visualType: 'innhopp' as const
              }
            ]
          : [];
        entries.push({
          id: `i-${item.id}`,
          title: `Innhopp #${item.sequence}: ${item.name}`,
          subtitle: '',
          type: 'Innhopp',
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = getEventLocalTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          to: participantOnly ? undefined : eventData ? `/events/${eventData.id}/innhopps/${item.id}` : undefined,
          ready: isInnhoppReady(item),
          missingCoordinates: !hasText(item.coordinates),
          description: item.reason_for_choice || item.primary_landing_area?.description || null,
          scheduledAt: item.scheduled_at || undefined,
          notes: item.notes || null,
          coordinates: item.coordinates || null,
          innhoppReason: item.reason_for_choice || null,
          innhoppElevation: item.elevation ?? null,
          innhoppCoordinates: item.coordinates || null,
          innhoppTakeoffName: takeoff?.name || null,
          innhoppLandingName: landingName,
          innhoppDistanceByAir: item.distance_by_air ?? null,
          innhoppElevationDiff: elevationDiff,
          innhoppPrimaryName: item.primary_landing_area?.name || null,
          innhoppPrimarySize: item.primary_landing_area?.size || null,
          innhoppSecondaryName: item.secondary_landing_area?.name || null,
          innhoppSecondarySize: item.secondary_landing_area?.size || null,
          innhoppRisk: item.risk_assessment || null,
          innhoppMinimumRequirements: item.minimum_requirements || null,
          innhoppRescueBoat: item.rescue_boat ?? null,
          innhoppLandOwnerPermission: item.land_owner_permission ?? null,
          routePoints,
          disabled: routePoints.length === 0
        });
      });

      day.transports.forEach((item) => {
        const routeDurationLabel = formatDurationMinutes(item.duration_minutes);
        const routeVehiclesLabel = formatVehiclesLabel(item.vehicles);
        entries.push({
          id: `t-${item.id}`,
          title: `${cleanLocation(item.pickup_location)} → ${cleanLocation(item.destination)}`,
          subtitle: `${routeDurationLabel} • ${routeVehiclesLabel}`,
          type: 'Transport',
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = getEventLocalTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          routePoints: [],
          disabled: true
        });
      });

      day.groundCrews.forEach((item) => {
        const routeDurationLabel = formatDurationMinutes(item.duration_minutes);
        const routeVehiclesLabel = formatVehiclesLabel(item.vehicles);
        entries.push({
          id: `gc-${item.id}`,
          title: `${cleanLocation(item.pickup_location)} → ${cleanLocation(item.destination)}`,
          subtitle: `${routeDurationLabel} • ${routeVehiclesLabel}`,
          type: 'Ground Crew',
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = getEventLocalTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          routePoints: [],
          disabled: true
        });
      });

      day.others.forEach((item) => {
        const routePoints = hasText(item.coordinates)
          ? [
              {
                id: `o-${item.id}`,
                entryId: `o-${item.id}`,
                label: item.name || 'Other logistics',
                coordinates: item.coordinates!.trim(),
                visualType: 'other' as const
              }
            ]
          : [];
        entries.push({
          id: `o-${item.id}`,
          title: item.name || 'Other logistics',
          subtitle: item.description || '',
          type: 'Other',
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = getEventLocalTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          scheduledAt: item.scheduled_at || undefined,
          notes: item.notes || null,
          coordinates: item.coordinates || null,
          routePoints,
          disabled: routePoints.length === 0
        });
      });

      day.meals.forEach((item) => {
        const mealStop = resolveLocationStop(item.location);
        entries.push({
          id: `meal-${item.id}`,
          title: item.name,
          subtitle: item.location || '',
          type: 'Meal',
          hourKey: formatTimeLabel(item.scheduled_at),
          sortValue: (() => {
            const parts = getEventLocalTimeParts(item.scheduled_at);
            return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
          })(),
          scheduledAt: item.scheduled_at || undefined,
          notes: item.notes || null,
          location: item.location || null,
          routePoints: mealStop
            ? [
                {
                  id: `meal-${item.id}`,
                  entryId: `meal-${item.id}`,
                  label: item.name,
                  coordinates: mealStop.coordinates.trim(),
                  visualType: 'meal'
                }
              ]
            : [],
          disabled: !mealStop
        });
      });

      day.accommodations.forEach((item) => {
        const buildAccommodationRoutePoints = (entryId: string) =>
          hasText(item.coordinates)
            ? [
                {
                  id: `${entryId}-point`,
                  entryId,
                  label: item.name,
                  coordinates: item.coordinates!.trim(),
                  visualType: 'accommodation' as const
                }
              ]
            : [];
        if (item.check_in_at && extractDateKey(item.check_in_at) === day.key) {
          const entryId = `acc-in-${item.id}`;
          const routePoints = buildAccommodationRoutePoints(entryId);
          entries.push({
            id: entryId,
            title: `Check-in: ${item.name}`,
            subtitle: '',
            type: 'Accommodation',
            hourKey: formatTimeLabel(item.check_in_at),
            sortValue: (() => {
              const parts = getEventLocalTimeParts(item.check_in_at);
              return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
            })(),
            scheduledAt: item.check_in_at || undefined,
            notes: item.notes || null,
            booked: !!item.booked,
            coordinates: item.coordinates || null,
            routePoints,
            disabled: routePoints.length === 0
          });
        }
        if (item.check_out_at && extractDateKey(item.check_out_at) === day.key) {
          const entryId = `acc-out-${item.id}`;
          const routePoints = buildAccommodationRoutePoints(entryId);
          entries.push({
            id: entryId,
            title: `Check-out: ${item.name}`,
            subtitle: '',
            type: 'Accommodation',
            hourKey: formatTimeLabel(item.check_out_at),
            sortValue: (() => {
              const parts = getEventLocalTimeParts(item.check_out_at);
              return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
            })(),
            scheduledAt: item.check_out_at || undefined,
            notes: item.notes || null,
            booked: !!item.booked,
            coordinates: item.coordinates || null,
            routePoints,
            disabled: routePoints.length === 0
          });
        }
        if (!item.check_in_at && !item.check_out_at) {
          const entryId = `acc-${item.id}`;
          const routePoints = buildAccommodationRoutePoints(entryId);
          entries.push({
            id: entryId,
            title: item.name,
            subtitle: '',
            type: 'Accommodation',
            hourKey: 'Unscheduled',
            sortValue: Number.POSITIVE_INFINITY,
            scheduledAt: null,
            notes: item.notes || null,
            booked: !!item.booked,
            coordinates: item.coordinates || null,
            routePoints,
            disabled: routePoints.length === 0
          });
        }
      });

      return entries.sort((a, b) => {
        if (a.sortValue === b.sortValue) return a.title.localeCompare(b.title);
        return a.sortValue - b.sortValue;
      });
    },
    [airfields, eventData, participantOnly, resolveLocationStop]
  );

  const entriesByDay = useMemo(
    () =>
      dayBuckets.map((day) => ({
        day,
        entries: buildEntriesForDay(day)
      })),
    [buildEntriesForDay, dayBuckets]
  );

  const allEntries = useMemo(() => entriesByDay.flatMap((item) => item.entries), [entriesByDay]);
  const entryById = useMemo(() => {
    const next = new Map<string, RoutePlannerEntry>();
    allEntries.forEach((entry) => next.set(entry.id, entry));
    return next;
  }, [allEntries]);
  const routableEntries = useMemo(() => allEntries.filter((entry) => !entry.disabled), [allEntries]);

  useEffect(() => {
    if (selectionInitializedRef.current || routableEntries.length === 0) return;
    setSelectedIds(new Set(routableEntries.map((entry) => entry.id)));
    selectionInitializedRef.current = true;
  }, [routableEntries]);

  const selectedPoints = useMemo(() => {
    const ordered = allEntries.filter((entry) => selectedIds.has(entry.id) && !entry.disabled);
    return ordered.flatMap((entry) => entry.routePoints);
  }, [allEntries, selectedIds]);

  const mapsUrl = useMemo(() => buildMapsUrl(selectedPoints), [selectedPoints]);

  const selectedEntryCount = useMemo(
    () => routableEntries.filter((entry) => selectedIds.has(entry.id)).length,
    [routableEntries, selectedIds]
  );

  const previewStops = useMemo(() => {
    const deduped = dedupeConsecutiveStops(selectedPoints);
    return deduped
      .map((stop, index) => {
        const parsed = parseCoordinates(stop.coordinates);
        if (!parsed) return null;
        return {
          ...stop,
          index,
          ...parsed
        };
      })
      .filter((stop): stop is RouteStop & { index: number; lat: number; lng: number } => !!stop);
  }, [selectedPoints]);

  const previewGeometry = useMemo(() => {
    if (previewStops.length === 0) return [];
    const padding = 26;
    const width = 720;
    const height = 320;
    const lats = previewStops.map((stop) => stop.lat);
    const lngs = previewStops.map((stop) => stop.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 0.01;
    const lngRange = maxLng - minLng || 0.01;
    return previewStops.map((stop) => ({
      ...stop,
      x: padding + ((stop.lng - minLng) / lngRange) * (width - padding * 2),
      y: height - padding - ((stop.lat - minLat) / latRange) * (height - padding * 2)
    }));
  }, [previewStops]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setPreviewFullscreen(document.fullscreenElement === previewCanvasRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    mapOverlayRef.current = mapOverlay;
    mapInstanceRef.current?.setMapTypeId(mapOverlay);
  }, [mapOverlay]);

  useEffect(() => {
    if (previewEntry) {
      setRenderedPreviewEntry(previewEntry);
      setPreviewClosing(false);
      return;
    }
    if (!renderedPreviewEntry) return;
    setPreviewClosing(true);
    const timer = window.setTimeout(() => {
      setRenderedPreviewEntry(null);
      setPreviewClosing(false);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [previewEntry, renderedPreviewEntry]);

  const closePreview = useCallback(() => {
    setPreviewEntry(null);
  }, []);

  useEffect(() => {
    if (previewGeometry.length === 0) {
      setMapError(null);
      mapMarkersRef.current.forEach((marker) => {
        if ('setMap' in marker && typeof marker.setMap === 'function') {
          marker.setMap(null);
          return;
        }
        marker.map = null;
      });
      mapMarkersRef.current = [];
      mapPolylineRef.current?.setMap?.(null);
      mapPolylineRef.current = null;
      mapInstanceRef.current = null;
      mapContainerRef.current = null;
      return;
    }

    if (!hasConfiguredGoogleMapsApiKey) {
      setMapError('Set VITE_GOOGLE_MAPS_API_KEY to render the route preview on a Google map.');
      return;
    }

    if (!mapRef.current) return;

    let cancelled = false;
    setMapError(null);

    void loadGoogleMapsApi()
      .then((maps) => {
        if (cancelled || !mapRef.current) return;

        if (!mapInstanceRef.current || mapContainerRef.current !== mapRef.current) {
          mapInstanceRef.current = new maps.Map(mapRef.current, {
            mapId: 'DEMO_MAP_ID',
            mapTypeId: mapOverlayRef.current,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'cooperative',
            clickableIcons: false
          });
          mapContainerRef.current = mapRef.current;
        }

        const map = mapInstanceRef.current;
        mapMarkersRef.current.forEach((marker) => {
          if ('setMap' in marker && typeof marker.setMap === 'function') {
            marker.setMap(null);
            return;
          }
          marker.map = null;
        });
        mapMarkersRef.current = [];
        mapPolylineRef.current?.setMap?.(null);
        mapPolylineRef.current = null;

        const bounds = new maps.LatLngBounds();
        const path = previewGeometry.map((stop) => ({ lat: stop.lat, lng: stop.lng }));

        mapPolylineRef.current = new maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#4fa3ff',
          strokeOpacity: 0.95,
          strokeWeight: 4,
          map
        });

        mapMarkersRef.current = previewGeometry.map((stop) => {
          bounds.extend({ lat: stop.lat, lng: stop.lng });
          const handleMarkerClick = () => {
            const entry = entryById.get(stop.entryId);
            if (entry) setPreviewEntry(entry);
          };
          if (maps.marker?.AdvancedMarkerElement) {
            const advancedMarker = new maps.marker.AdvancedMarkerElement({
              position: { lat: stop.lat, lng: stop.lng },
              map,
              title: stop.label,
              gmpClickable: true,
              content: buildAdvancedMarkerContent(stop.visualType)
            });
            advancedMarker.addListener?.('click', handleMarkerClick);
            return advancedMarker;
          }
          const marker = new maps.Marker({
            position: { lat: stop.lat, lng: stop.lng },
            map,
            title: stop.label,
            label: {
              text: iconNameByType[stop.visualType].slice(0, 1).toUpperCase(),
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: '700'
            },
            icon: {
              path: maps.SymbolPath.CIRCLE,
              fillColor: markerColorByType[stop.visualType],
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 16
            }
          });
          marker.addListener('click', handleMarkerClick);
          return marker;
        });

        if (previewGeometry.length === 1) {
          map.setCenter({ lat: previewGeometry[0].lat, lng: previewGeometry[0].lng });
          map.setZoom(12);
        } else {
          map.fitBounds(bounds, 56);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : 'Failed to load Google Maps preview.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entryById, previewGeometry]);

  const toggleEntry = (entry: RoutePlannerEntry) => {
    if (entry.disabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
      }
      return next;
    });
  };

  const toggleDayEntries = (entries: RoutePlannerEntry[], checked: boolean) => {
    const routableDayEntries = entries.filter((entry) => !entry.disabled);
    if (routableDayEntries.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      routableDayEntries.forEach((entry) => {
        if (checked) {
          next.add(entry.id);
        } else {
          next.delete(entry.id);
        }
      });
      return next;
    });
  };

  const togglePreviewFullscreen = async () => {
    const node = previewCanvasRef.current;
    if (!node || typeof document === 'undefined') return;
    if (document.fullscreenElement === node) {
      await document.exitFullscreen();
      return;
    }
    await node.requestFullscreen();
  };

  const handleDelete = async () => {
    if (!eventData || deleting) return;
    if (!window.confirm('Delete this event?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteEvent(eventData.id);
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
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

  if (loading) return <p className="muted">Loading route planner…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!eventData) return <p className="error-text">Event not found.</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div className="event-schedule-headline-text">
          <div className="event-header-top">
            <h2 className="event-detail-title">{eventData.name}: Route</h2>
          </div>
          <p className="event-location">{eventData.location || 'Location TBD'}</p>
          <div className="event-detail-header-badges">
            <span className={`badge status-${eventData.status}`}>{eventData.status}</span>
          </div>
        </div>
        <EventGearMenu
          eventId={eventData.id}
          currentPage="route"
          copying={copying}
          deleting={deleting}
          menuId="event-route-planner-actions-menu"
          onCopy={handleCopy}
          onDelete={handleDelete}
        />
      </header>

      {message ? <p className="error-text">{message}</p> : null}

      <article className="card event-schedule-summary-card">
        <div className="event-route-planner-summary-grid">
          <dl className="card-details event-schedule-stats event-schedule-stats-grid">
            <div>
              <dt>Total Items</dt>
              <dd>{allEntries.length}</dd>
            </div>
            <div>
              <dt>Selected</dt>
              <dd>{selectedEntryCount}</dd>
            </div>
            <div>
              <dt>Without Coordinates</dt>
              <dd>{allEntries.length - routableEntries.length}</dd>
            </div>
          </dl>
        </div>
      </article>

      <article className="card event-route-preview-card">
          <div className="event-route-preview-header">
            <div>
              <h3 className="event-route-preview-title">Route Preview</h3>
              <p className="muted event-route-preview-subtitle">
                {previewStops.length > 0 ? `${previewStops.length} plotted stops` : 'Select stops with coordinates to preview the route'}
              </p>
            </div>
          <div className="event-route-preview-legend">
            <span className="event-route-preview-legend-item"><span className="event-route-preview-icon event-route-preview-icon--innhopp">{renderPreviewIcon('innhopp')}</span><span>Innhopp</span></span>
            <span className="event-route-preview-legend-item"><span className="event-route-preview-icon event-route-preview-icon--accommodation">{renderPreviewIcon('accommodation')}</span><span>Hotel</span></span>
            <span className="event-route-preview-legend-item"><span className="event-route-preview-icon event-route-preview-icon--meal">{renderPreviewIcon('meal')}</span><span>Meal</span></span>
            <span className="event-route-preview-legend-item"><span className="event-route-preview-icon event-route-preview-icon--other">{renderPreviewIcon('other')}</span><span>Other</span></span>
          </div>
        </div>
        {previewGeometry.length === 0 ? (
          <div className="event-route-preview-empty muted">No preview stops available yet.</div>
        ) : (
          <>
            <div className="event-route-preview-layout">
              <div
                ref={previewCanvasRef}
                className={`event-route-preview-canvas${previewFullscreen ? ' event-route-preview-canvas--fullscreen' : ''}`}
              >
                <div className="event-route-preview-map-controls">
                  <button
                    type="button"
                    className="ghost event-route-preview-overlay-button"
                    onClick={() => setMapOverlay((current) => (current === 'hybrid' ? 'roadmap' : 'hybrid'))}
                    aria-label={`Switch to ${mapOverlay === 'hybrid' ? 'road map' : 'satellite'} overlay`}
                  >
                    <span className="event-route-preview-button-label">
                      <span>{mapOverlay === 'hybrid' ? 'Road Map' : 'Satellite'}</span>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {mapOverlay === 'hybrid' ? 'map' : 'satellite'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ghost event-route-preview-fullscreen-button"
                    onClick={() => void togglePreviewFullscreen()}
                    aria-label={previewFullscreen ? 'Exit fullscreen preview' : 'Open fullscreen preview'}
                  >
                    <span className="event-route-preview-button-label">
                      <span>{previewFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M9 5H5v4M15 5h4v4M19 15v4h-4M5 15v4h4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                </div>
                {mapError ? (
                  <div className="event-route-preview-map-error muted">{mapError}</div>
                ) : (
                  <div ref={mapRef} className="event-route-preview-map" aria-label="Selected route preview on Google Maps" />
                )}
              </div>
            </div>
            <div className="event-route-preview-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setSelectedIds(new Set(routableEntries.map((entry) => entry.id)))}
                disabled={routableEntries.length === 0}
              >
                Select all
              </button>
              <button type="button" className="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>
                Clear
              </button>
              <button
                type="button"
                className="ghost"
                disabled={!mapsUrl}
                onClick={() => {
                  if (!mapsUrl) return;
                  window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                <span className="event-route-planner-button-label">
                  <span>Google Maps</span>
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
                </span>
              </button>
            </div>
          </>
        )}
      </article>

      {entriesByDay.length === 0 ? (
        <p className="muted">No schedule yet.</p>
      ) : (
        entriesByDay.map(({ day, entries }) => {
          const routableDayEntries = entries.filter((entry) => !entry.disabled);
          const selectedDayEntryCount = routableDayEntries.filter((entry) => selectedIds.has(entry.id)).length;
          const dayChecked = routableDayEntries.length > 0 && selectedDayEntryCount === routableDayEntries.length;
          const dayIndeterminate = selectedDayEntryCount > 0 && selectedDayEntryCount < routableDayEntries.length;

          return (
            <article key={day.key} className="card event-schedule-day-card">
              <header
                className="card-header event-schedule-day-header event-route-planner-day-header"
                onClick={() =>
                  setExpandedDays((prev) => ({
                    ...prev,
                    [day.key]: !(prev[day.key] ?? true)
                  }))
                }
              >
                <button
                  className="ghost"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedDays((prev) => ({
                      ...prev,
                      [day.key]: !(prev[day.key] ?? true)
                    }));
                  }}
                >
                  {expandedDays[day.key] === false ? '▸' : '▾'}
                </button>
                <input
                  className="event-route-planner-day-checkbox"
                  type="checkbox"
                  checked={dayChecked}
                  disabled={routableDayEntries.length === 0}
                  ref={(node) => {
                    if (node) node.indeterminate = dayIndeterminate;
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => toggleDayEntries(entries, event.target.checked)}
                  aria-label={`Include all route entries for ${day.label}`}
                />
                <h3 className="event-schedule-day-title event-route-planner-day-title">{day.label}</h3>
              </header>
              {expandedDays[day.key] === false ? null : entries.length === 0 ? (
                <p className="muted event-schedule-empty-day">Nothing scheduled.</p>
              ) : (
                <ul className="status-list schedule-list event-schedule-list">
                  {entries.map((entry) => {
                    const checked = selectedIds.has(entry.id);
                    return (
                      <li key={entry.id} className={`event-schedule-row${entry.disabled ? ' event-route-planner-row--disabled' : ''}`}>
                        <label
                          className={`schedule-entry event-schedule-entry-shell event-route-planner-entry-shell${
                            entry.disabled ? ' event-route-planner-entry-shell--disabled' : ''
                          }`}
                        >
                          <div className="muted schedule-time">{entry.hourKey}</div>
                          <div className="event-route-planner-checkbox-cell">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={entry.disabled}
                              onChange={() => toggleEntry(entry)}
                              aria-label={`Include ${entry.title} in route`}
                            />
                          </div>
                          <div className="schedule-entry-content">
                            <div className="schedule-entry-body">
                              <div className="schedule-entry-header">
                                <strong className="schedule-entry-title">{entry.title}</strong>
                                <div className="schedule-entry-badges">
                                  <span className={`badge ${typeBadgeClassNames[entry.type]}`} aria-label={entry.type}>
                                    {entry.type}
                                  </span>
                                </div>
                              </div>
                              {entry.subtitle ? <div className="muted event-schedule-wrap-text">{entry.subtitle}</div> : null}
                              {!entry.disabled && entry.routePoints.length > 1 ? (
                                <div className="muted event-route-planner-missing-note">
                                  {entry.routePoints.length} route points will be included
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })
      )}
      {renderedPreviewEntry ? (
        <ScheduleEntryPreviewOverlay
          entry={renderedPreviewEntry}
          closing={previewClosing}
          onClose={closePreview}
          canOpenMapsActions={canOpenMapsActions}
          budgetAircraftSpeedKmh={budgetAircraftSpeedKmh}
          typeBadgeClassNames={typeBadgeClassNames}
        />
      ) : null}
    </section>
  );
};

export default EventRoutePlannerPage;
