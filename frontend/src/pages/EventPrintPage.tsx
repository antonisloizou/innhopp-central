import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { isParticipantOnlySession } from '../auth/access';
import logo from '../assets/logo.webp';
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

type PrintSectionKey = 'route' | 'weekOverview' | 'schedule';
type PrintOptions = Record<PrintSectionKey, boolean>;

const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  route: false,
  weekOverview: false,
  schedule: false
};

const hasText = (value?: string | null) => !!value && value.trim().length > 0;
const cleanLocation = (val: string) => val.replace(/^#\s*\d+\s*/, '').trim();

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
  const [printOptions, setPrintOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);

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
          missingCoordinates: !hasText(item.coordinates),
          notes: item.notes || null,
          otherComplete: hasText(item.name) && hasText(item.coordinates) && hasText(item.scheduled_at),
          scheduledAt: item.scheduled_at || undefined
        });
      });

      day.meals.forEach((item) => {
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
  const printableRouteDays = useMemo(
    () =>
      dayBuckets
        .map((day) => ({
          ...day,
          entries: buildOrderedEntriesForDay(day).filter(
            (entry) => entry.type === 'Innhopp' || entry.type === 'Transport' || entry.type === 'Ground Crew'
          )
        }))
        .filter((day) => day.entries.length > 0),
    [buildOrderedEntriesForDay, dayBuckets]
  );

  const buildPrintDocument = useCallback(
    (options: PrintOptions) => {
      if (!eventData) return '';

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

      const weekOverviewSection = options.weekOverview
        ? `
          <section class="print-section">
            <div class="print-section-kicker">Week Overview</div>
            <h2>${escapeHtml(eventData.name)}</h2>
            <p class="print-location">${escapeHtml(eventData.location || 'Location TBD')}</p>
            <div class="print-overview-badges">
              ${eventData.status ? `<span class="print-badge status-neutral">${escapeHtml(eventData.status)}</span>` : ''}
              <span class="print-badge status-neutral">${escapeHtml(totalSlots > 0 ? `${totalSlots} slots` : 'Slots not set')}</span>
            </div>
            <dl class="print-overview-grid">
              <div><dt>Starts</dt><dd>${escapeHtml(
                eventData.starts_at
                  ? formatEventLocal(eventData.starts_at, { month: 'short', day: 'numeric', year: 'numeric' }) || 'TBD'
                  : 'TBD'
              )}</dd></div>
              <div><dt>Ends</dt><dd>${escapeHtml(
                eventData.ends_at
                  ? formatEventLocal(eventData.ends_at, { month: 'short', day: 'numeric', year: 'numeric' }) || 'TBD'
                  : 'TBD'
              )}</dd></div>
              <div><dt>Participants</dt><dd>${escapeHtml(String(nonStaffCount))}</dd></div>
              <div><dt>Innhopps</dt><dd>${escapeHtml(String(eventData.innhopps?.length ?? 0))}</dd></div>
            </dl>
          </section>
        `
        : '';

      const routeSection = options.route
        ? `
          <section class="print-section">
            <div class="print-section-kicker">Route</div>
            <h2>Route Snapshot</h2>
            ${
              printableRouteDays.length === 0
                ? '<p class="empty-state">No route items scheduled.</p>'
                : printableRouteDays
                    .map(
                      (day) => `
                        <article class="print-day-block">
                          <h3>${escapeHtml(day.label)}</h3>
                          <ul class="print-entry-list">
                            ${day.entries.map(renderEntry).join('')}
                          </ul>
                        </article>
                      `
                    )
                    .join('')
            }
          </section>
        `
        : '';

      const scheduleSection = options.schedule
        ? `
          <section class="print-section">
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
      :root {
        color-scheme: light;
        --text: #0f172a;
        --muted: #475569;
        --border: #d7dee8;
        --success: #166534;
        --success-bg: #dcfce7;
        --danger: #991b1b;
        --danger-bg: #fee2e2;
        --neutral: #1d4ed8;
        --neutral-bg: #dbeafe;
        --innhopp: #2b8a3e;
        --transport: #e6b84a;
        --ground-crew: #f6dea0;
        --accommodation: #0d6efd;
        --meal: #d97706;
        --other: #7e22ce;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: var(--text); font-family: Inter, Arial, sans-serif; }
      body { padding: 0; }
      .print-section { margin-top: 10mm; page-break-inside: avoid; }
      .print-section:first-child { margin-top: 0; }
      .print-section-kicker { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
      .print-section h2 { margin: 0 0 12px; font-size: 22px; }
      .print-location { margin: 0 0 12px; color: var(--muted); }
      .print-overview-badges, .print-entry-badges { display: flex; flex-wrap: wrap; gap: 8px; }
      .print-overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 16px 0 0; }
      .print-overview-grid dt { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 4px; }
      .print-overview-grid dd { margin: 0; font-size: 18px; font-weight: 700; }
      .print-day-block { margin-top: 18px; padding-top: 18px; break-before: page; page-break-before: always; }
      .print-day-block:first-of-type { break-before: auto; page-break-before: auto; }
      .print-day-block h3 { margin: 0; font-size: 20px; }
      .print-day-block--schedule {
        margin-top: 0;
        padding-top: 0;
      }
      .print-day-block--schedule:first-of-type {
        padding-top: 0;
      }
      .print-schedule-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .print-schedule-table col.print-schedule-col-time {
        width: 84px;
      }
      .print-schedule-table col.print-schedule-col-main {
        width: auto;
      }
      .print-schedule-table col.print-schedule-col-badges {
        width: 230px;
      }
      .print-schedule-table thead {
        display: table-header-group;
      }
      .print-schedule-table tbody {
        display: table-row-group;
      }
      .print-schedule-header-cell {
        padding: 0 0 14px;
      }
      .print-schedule-placeholder-cell {
        padding: 0;
      }
      .print-schedule-header {
        display: grid;
        grid-template-columns: 42mm minmax(0, 1fr) 42mm;
        align-items: center;
        gap: 4mm;
      }
      .print-schedule-header-logo {
        display: block;
        justify-self: start;
        max-width: 40mm;
        height: 13mm;
        width: auto;
        object-fit: contain;
      }
      .print-schedule-header-title {
        margin: 0;
        font-size: 28px;
        line-height: 1.2;
        font-weight: 700;
        text-align: center;
      }
      .print-schedule-header-spacer {
        width: 40mm;
        height: 1px;
        justify-self: end;
      }
      .print-schedule-day-heading {
        font-size: 20px;
        font-weight: 700;
        text-align: left;
      }
      .print-schedule-day-heading--placeholder {
        visibility: hidden;
        margin-top: 0;
      }
      .print-day-divider {
        margin: 12px 0 0;
        border-top: 1px solid var(--border);
      }
      .print-day-divider--placeholder {
        visibility: hidden;
      }
      .print-schedule-row {
        border-top: 1px solid var(--border);
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-schedule-day-row {
        border: 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-schedule-day-cell {
        padding: 0 0 0;
      }
      .print-schedule-time-cell,
      .print-schedule-main-cell,
      .print-schedule-badges-cell {
        vertical-align: top;
        padding: 9px 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-schedule-time-cell {
        padding-right: 14px;
        font-weight: 700;
        font-size: 15px;
      }
      .print-schedule-main-cell {
        padding-right: 14px;
      }
      .print-schedule-badges-cell {
        text-align: right;
      }
      .print-schedule-empty-cell {
        padding: 18px 0 0;
      }
      .print-schedule-day-row + .print-schedule-row {
        border-top: 0;
      }
      .print-entry-time { font-weight: 700; font-size: 15px; }
      .print-entry-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .print-entry-title { font-size: 18px; font-weight: 700; line-height: 1.25; }
      .print-entry-subtitle { margin-top: 2px; color: var(--muted); font-size: 14px; line-height: 1.35; }
      .print-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 0.35rem 0.75rem; font-size: 0.75rem; font-weight: 600; line-height: 1; border: 1px solid transparent; text-transform: uppercase; text-align: center; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-type-badge { padding: 0.4rem 0.95rem; }
      .print-badge.status-success, .print-badge.status-danger { min-width: 28px; padding-left: 8px; padding-right: 8px; }
      .status-success { color: var(--success); background: var(--success-bg); }
      .status-danger { color: var(--danger); background: var(--danger-bg); }
      .status-neutral { color: var(--neutral); background: var(--neutral-bg); }
      .type-innhopp, .type-transport, .type-ground-crew, .type-accommodation, .type-meal, .type-other {
        color: #fff;
        text-shadow: -1px -1px 0 rgba(0, 0, 0, 0.45), 1px -1px 0 rgba(0, 0, 0, 0.45), -1px 1px 0 rgba(0, 0, 0, 0.45), 1px 1px 0 rgba(0, 0, 0, 0.45);
      }
      .type-innhopp { background: var(--innhopp); }
      .type-transport { background: var(--transport); }
      .type-ground-crew { background: var(--ground-crew); }
      .type-accommodation { background: var(--accommodation); }
      .type-meal { background: var(--meal); }
      .type-other { background: var(--other); }
      .empty-state { margin: 0; color: var(--muted); }
      @page { size: A4; margin: 22mm 15mm 18mm 15mm; }
      @media print {
        body { padding: 0; }
        .print-section { break-inside: avoid; }
        .print-day-block { break-inside: avoid; }
        .print-schedule-row,
        .print-schedule-day-row,
        .print-schedule-time-cell,
        .print-schedule-main-cell,
        .print-schedule-badges-cell {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
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
    [buildOrderedEntriesForDay, dayBuckets, eventData, nonStaffCount, printableRouteDays, totalSlots]
  );

  const handleCreatePdf = useCallback(() => {
    if (!eventData || printSectionCount === 0 || printing || typeof document === 'undefined') return;

    setMessage(null);
    setPrinting(true);

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
      printDocument.write(buildPrintDocument(printOptions));
      printDocument.close();
    } catch (err) {
      safeCleanup();
      setMessage(err instanceof Error ? err.message : 'Failed to render print document');
      return;
    }

    window.setTimeout(() => {
      try {
        window.addEventListener('focus', handleWindowFocus, { once: true });
        printWindow.focus();
        printWindow.print();
        setPrinting(false);
      } catch (err) {
        safeCleanup();
        setMessage(err instanceof Error ? err.message : 'Failed to open print dialog');
        return;
      }
      window.setTimeout(safeCleanup, 60_000);
    }, 120);
  }, [buildPrintDocument, eventData, printOptions, printSectionCount, printing]);

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
            <h3 className="event-print-panel-title">Choose what goes into the PDF</h3>
            <p className="muted event-print-panel-copy">
              The browser print dialog will open so you can save the document as PDF.
            </p>
          </div>
        </div>
        <div className="event-print-panel-options">
          {([
            ['route', 'Route'],
            ['weekOverview', 'Week Overview'],
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
