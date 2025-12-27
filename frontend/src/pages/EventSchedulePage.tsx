import { useEffect, useMemo, useState, useRef, useCallback, DragEvent } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Accommodation,
  Event,
  deleteEvent,
  getEvent,
  listAccommodations,
  getAccommodation,
  updateAccommodation
} from '../api/events';
import {
  Transport,
  listTransports,
  OtherLogistic,
  listOthers,
  Meal,
  listMeals,
  updateTransport,
  getTransport,
  updateOther,
  getOther,
  updateMeal,
  getMeal
} from '../api/logistics';
import { ParticipantProfile, listParticipantProfiles } from '../api/participants';
import { isInnhoppReady } from '../utils/innhoppReadiness';
import { updateInnhopp, getInnhopp, Innhopp } from '../api/events';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';

type EntryType = 'Innhopp' | 'Transport' | 'Accommodation' | 'Other' | 'Meal';
type DayBucket = {
  date: Date;
  label: string;
  key: string;
  innhopps: Event['innhopps'];
  transports: Transport[];
  accommodations: Accommodation[];
  others: OtherLogistic[];
  meals: Meal[];
};

const hasText = (value?: string | null) => !!value && value.trim().length > 0;

type ScheduleEntry = {
  id: string;
  hourKey: string;
  sortValue: number;
  title: string;
  subtitle?: string;
  type: EntryType;
  passengers?: number;
  ready?: boolean;
  booked?: boolean;
  missingCoordinates?: boolean;
  otherComplete?: boolean;
  mealComplete?: boolean;
  to?: string;
  scheduledAt?: string | null;
};
type Entry = ScheduleEntry;

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const parseTimeParts = (iso?: string | null) => {
  if (!iso) return null;
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return { hour: Number(match[1]), minute: Number(match[2]) };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { hour: d.getHours(), minute: d.getMinutes() };
};

const formatTimeLabel = (iso?: string | null) => {
  const parts = parseTimeParts(iso);
  if (!parts) return 'Unscheduled';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
};

const extractDateKey = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDays = (event: Event): Date[] => {
  const days: Date[] = [];
  const start = event.starts_at ? new Date(event.starts_at) : null;
  const end = event.ends_at ? new Date(event.ends_at) : null;
  if (!start) return days;
  const cursor = new Date(start);
  const last = end && !Number.isNaN(end.getTime()) ? end : start;
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const cleanLocation = (val: string) => val.replace(/^#\s*\d+\s*/, '').trim();

const minutesSinceMidnight = (iso?: string | null) => {
  const parts = parseTimeParts(iso);
  if (!parts) return Number.POSITIVE_INFINITY;
  return parts.hour * 60 + parts.minute;
};

const buildDayIso = (day: Date, minutes: number) => {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0, 0));
  d.setUTCMinutes(minutes);
  return d.toISOString();
};

const EventSchedulePage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; dayKey: string } | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragHoverIndex, setDragHoverIndex] = useState<number | null>(null);
  const [savingDrag, setSavingDrag] = useState(false);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const dragGhostTimeRef = useRef<HTMLElement | null>(null);
  const dragShimRef = useRef<HTMLElement | null>(null);
  const [timePicker, setTimePicker] = useState<{
    entry: ScheduleEntry;
    day: DayBucket;
    anchor: HTMLElement | null;
  } | null>(null);
  const timePickerRef = useRef<Flatpickr | null>(null);
  const [pendingPickerDate, setPendingPickerDate] = useState<Date | null>(null);
  const pickerPortalRef = useRef<HTMLDivElement | null>(null);
  const buildDragGhost = (rowNode: HTMLElement, timeLabel?: string | null, startX?: number, startY?: number) => {
    const rect = rowNode.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.left = `${(startX ?? 0) + 12}px`;
    ghost.style.top = `${(startY ?? 0) + 12}px`;
    ghost.style.padding = '0.35rem 0.5rem';
    ghost.style.border = '2px dashed #3b82f6';
    ghost.style.borderRadius = '14px';
    ghost.style.background = '#fff';
    ghost.style.boxShadow = '0 10px 25px rgba(0,0,0,0.12)';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.width = `${rect.width}px`;
    ghost.style.boxSizing = 'border-box';

    const cloned = rowNode.cloneNode(true) as HTMLElement;
    cloned.style.pointerEvents = 'none';
    cloned.style.width = '100%';
    const timeEl = cloned.querySelector('[data-ghost-time="time"]') as HTMLElement | null;
    if (timeEl) {
      timeEl.textContent = timeLabel && timeLabel !== 'Unscheduled' ? timeLabel : '';
    }
    ghost.appendChild(cloned);

    dragGhostRef.current = ghost;
    dragGhostTimeRef.current = timeEl;
    document.body.appendChild(ghost);
    return ghost;
  };

  const updateDragGhost = (label?: string | null, pos?: { x: number; y: number }) => {
    const span = dragGhostTimeRef.current;
    const ghost = dragGhostRef.current;
    if (!ghost) return;
    if (span) {
      span.textContent = label && label !== 'Unscheduled' ? label : '';
    }
    if (pos) {
      ghost.style.left = `${pos.x + 12}px`;
      ghost.style.top = `${pos.y + 12}px`;
    }
  };

  const clearDragGhost = () => {
    if (dragGhostRef.current) {
      document.body.removeChild(dragGhostRef.current);
      dragGhostRef.current = null;
      dragGhostTimeRef.current = null;
    }
    if (dragShimRef.current) {
      dragShimRef.current.remove();
      dragShimRef.current = null;
    }
  };
  const [typeFilters, setTypeFilters] = useState<Record<EntryType, boolean>>({
    Innhopp: true,
    Transport: true,
    Accommodation: true,
    Other: true,
    Meal: true
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      try {
        const [evt, transportList, accList, participantList, otherList, mealList] = await Promise.all([
          getEvent(Number(eventId)),
          listTransports(),
          listAccommodations(Number(eventId)),
          listParticipantProfiles(),
          listOthers(),
          listMeals()
        ]);
        if (cancelled) return;
        setEventData(evt);
        setTransports(Array.isArray(transportList) ? transportList.filter((t) => t.event_id === Number(eventId)) : []);
        setAccommodations(Array.isArray(accList) ? accList : []);
        setParticipants(Array.isArray(participantList) ? participantList : []);
        setOthers(Array.isArray(otherList) ? otherList.filter((o) => o.event_id === Number(eventId)) : []);
        setMeals(Array.isArray(mealList) ? mealList.filter((m) => m.event_id === Number(eventId)) : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load schedule');
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
  const reload = useCallback(
    async (options?: { preserveLoading?: boolean }) => {
    if (!eventId) return;
      const keepLoading = options?.preserveLoading;
      if (!keepLoading) {
        setLoading(true);
      }
    setMessage(null);
    try {
      const [evt, transportList, accList, participantList, otherList, mealList] = await Promise.all([
        getEvent(Number(eventId)),
        listTransports(),
        listAccommodations(Number(eventId)),
        listParticipantProfiles(),
        listOthers(),
        listMeals()
      ]);
      setEventData(evt);
      setTransports(Array.isArray(transportList) ? transportList.filter((t) => t.event_id === Number(eventId)) : []);
      setAccommodations(Array.isArray(accList) ? accList : []);
      setParticipants(Array.isArray(participantList) ? participantList : []);
      setOthers(Array.isArray(otherList) ? otherList.filter((o) => o.event_id === Number(eventId)) : []);
      setMeals(Array.isArray(mealList) ? mealList.filter((m) => m.event_id === Number(eventId)) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
        if (!keepLoading) {
          setLoading(false);
        }
    }
    },
    [eventId]
  );

  const dayBuckets: DayBucket[] = useMemo(() => {
    if (!eventData) return [];
    const days = buildDays(eventData);
    const innhopps = Array.isArray(eventData.innhopps) ? eventData.innhopps : [];

    const keys = new Set<string>();
    days.forEach((d) => keys.add(extractDateKey(d.toISOString())));
    transports.forEach((t) => {
      const key = extractDateKey(t.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    meals.forEach((m) => {
      const key = extractDateKey(m.scheduled_at || undefined);
      if (key) keys.add(key);
    });
    accommodations.forEach((a) => {
      const inKey = extractDateKey(a.check_in_at || undefined);
      const outKey = extractDateKey(a.check_out_at || undefined);
      if (inKey) keys.add(inKey);
      if (outKey) keys.add(outKey);
    });
    others.forEach((o) => {
      const key = extractDateKey(o.scheduled_at || undefined);
      if (key) keys.add(key);
    });

    const bucketDates = Array.from(keys)
      .filter(Boolean)
      .sort()
      .map((key) => {
        const [y, m, d] = key.split('-').map(Number);
        return { key, date: new Date(Date.UTC(y, m - 1, d)) };
      });

    const buckets = bucketDates.map(({ key, date }) => {
      const innhoppItems = innhopps.filter((i) => extractDateKey(i.scheduled_at || undefined) === key);
      const transportItems = transports.filter((t) => extractDateKey(t.scheduled_at || undefined) === key);
      const accommodationItems = accommodations.filter(
        (a) =>
          extractDateKey(a.check_in_at || undefined) === key || extractDateKey(a.check_out_at || undefined) === key
      );
      const otherItems = others.filter((o) => extractDateKey(o.scheduled_at || undefined) === key);
      const mealItems = meals.filter((m) => extractDateKey(m.scheduled_at || undefined) === key);
      return {
        date,
        label: key === 'unscheduled' ? 'Unscheduled' : formatDayLabel(date),
        key,
        innhopps: innhoppItems,
        transports: transportItems,
        accommodations: accommodationItems,
        others: otherItems,
        meals: mealItems
      };
    });

    const unscheduledTransports = transports.filter((t) => !t.scheduled_at || extractDateKey(t.scheduled_at) === '');
    const unscheduledOthers = others.filter((o) => !o.scheduled_at || extractDateKey(o.scheduled_at) === '');
    const unscheduledMeals = meals.filter((m) => !m.scheduled_at || extractDateKey(m.scheduled_at) === '');
    if ((unscheduledTransports.length > 0 || unscheduledOthers.length > 0 || unscheduledMeals.length > 0) && !keys.has('unscheduled')) {
      buckets.push({
        date: new Date(),
        label: 'Unscheduled',
        key: 'unscheduled',
        innhopps: [],
        transports: unscheduledTransports,
        accommodations: [],
        others: unscheduledOthers,
        meals: unscheduledMeals
      });
    }

    return buckets;
  }, [eventData, transports, accommodations, others, meals]);

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

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const expandedDaysRef = useRef(expandedDays);
  const scheduleStateRestored = useRef(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const skipScrollRef = useRef(false);
  const scrollPositionRef = useRef<number | null>(null);

  useEffect(() => {
    expandedDaysRef.current = expandedDays;
  }, [expandedDays]);

  useEffect(() => {
    if (!eventId || !scheduleStateRestored.current) return;
    const key = `event-schedule-state:${eventId}`;
    try {
      const existing = sessionStorage.getItem(key);
      let parsed: any = {};
      if (existing) {
        try {
          parsed = JSON.parse(existing) || {};
        } catch {
          parsed = {};
        }
      }
      sessionStorage.setItem(
        key,
        JSON.stringify({
          ...parsed,
          expandedDays: expandedDaysRef.current
        })
      );
    } catch {
      // ignore
    }
  }, [eventId, expandedDays]);

  useEffect(() => {
    if (dragHoverIndex !== null) return;
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightId, dragHoverIndex]);

  useEffect(() => {
    if (!eventId || scheduleStateRestored.current) return;
    const key = `event-schedule-state:${eventId}`;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.expandedDays) {
          setExpandedDays((prev) => ({ ...prev, ...parsed.expandedDays }));
        }
        if (typeof parsed?.scrollY === 'number') {
          setTimeout(() => window.scrollTo(0, parsed.scrollY), 0);
        }
      } catch {
        // ignore
      }
    }
    const savedHighlight = sessionStorage.getItem(`event-schedule-highlight:${eventId}`);
    if (savedHighlight) {
      setHighlightId(savedHighlight);
      sessionStorage.removeItem(`event-schedule-highlight:${eventId}`);
    }
    const navHighlight = (location.state as any)?.highlightId;
    if (navHighlight) {
      setHighlightId(navHighlight);
    }
    scheduleStateRestored.current = true;
  }, [eventId, location.state]);

  useEffect(() => {
    if (!eventId) return;
    const key = `event-schedule-state:${eventId}`;
    return () => {
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({ expandedDays: expandedDaysRef.current, scrollY: window.scrollY })
        );
      } catch {
        // ignore
      }
    };
  }, [eventId]);

  useEffect(() => {
    if (dayBuckets.length === 0) return;
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    if (highlightId) {
      setTimeout(() => {
        const el = document.getElementById(`entry-${highlightId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }
    if (eventData?.status !== 'live') return;
    const today = new Date();
    const target = dayBuckets.reduce((closest, current) => {
      const diff = Math.abs(current.date.getTime() - today.getTime());
      if (!closest) return { key: current.key, diff };
      return diff < closest.diff ? { key: current.key, diff } : closest;
    }, null as { key: string; diff: number } | null);
    if (target?.key) {
      const el = document.getElementById(`event-day-${target.key}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [dayBuckets, eventData?.status, highlightId]);

  const typeBadgeStyles: Record<EntryType, { backgroundColor: string; color: string }> = {
    Innhopp: { backgroundColor: '#2b8a3e', color: '#fff' },
    Transport: { backgroundColor: '#e6b84a', color: '#fff' },
    Accommodation: { backgroundColor: '#0d6efd', color: '#fff' },
    Meal: { backgroundColor: '#d97706', color: '#fff' },
    Other: { backgroundColor: '#7e22ce', color: '#fff' }
  };
  const computeProposedMinutes = (
    targetIndex: number,
    ordered: Entry[],
    dayKey: string,
    draggingId?: string | null
  ) => {
    if (dayKey === 'unscheduled') return null;
    const base = draggingId ? ordered.filter((e) => e.id !== draggingId) : ordered.slice();
    if (base.length === 0) return 8 * 60;
    const clampedIndex = Math.max(0, Math.min(targetIndex, base.length));
    const prev = base[clampedIndex - 1];
    const next = base[clampedIndex];
    const prevMinutes = prev && prev.sortValue !== Number.POSITIVE_INFINITY ? prev.sortValue : null;
    const nextMinutes = next && next.sortValue !== Number.POSITIVE_INFINITY ? next.sortValue : null;
    let minutes = 9 * 60;
    if (prevMinutes !== null && nextMinutes !== null) {
      minutes = Math.floor((prevMinutes + nextMinutes) / 2);
    } else if (prevMinutes !== null) {
      minutes = prevMinutes + 15;
    } else if (nextMinutes !== null) {
      minutes = Math.max(nextMinutes - 15, 0);
    }
    return minutes;
  };
  const typeFilterOrder: EntryType[] = ['Innhopp', 'Transport', 'Accommodation', 'Meal', 'Other'];

  const buildPickerDate = (entry?: ScheduleEntry | null, day?: DayBucket) => {
    const base = entry?.scheduledAt ? new Date(entry.scheduledAt) : day ? new Date(day.date) : new Date();
    const parts = parseTimeParts(entry?.scheduledAt || undefined);
    if (parts) {
      base.setHours(parts.hour, parts.minute, 0, 0);
    } else {
      base.setHours(new Date().getHours(), new Date().getMinutes(), 0, 0);
    }
    return base;
  };

  const buildIsoFromPickerDate = (date: Date) => {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), 0, 0)).toISOString();
  };

  const applyLocalUpdate = useCallback(
    (entry: ScheduleEntry, newIso?: string | null) => {
      if (entry.type === 'Innhopp') {
        setEventData((prev) =>
          prev
            ? {
                ...prev,
                innhopps: Array.isArray(prev.innhopps)
                  ? prev.innhopps.map((i) => (i.id === Number(entry.id.split('-').pop()) ? { ...i, scheduled_at: newIso || null } : i))
                  : prev.innhopps
              }
            : prev
        );
      } else if (entry.type === 'Transport') {
        setTransports((prev) =>
          Array.isArray(prev)
            ? prev.map((t) => (t.id === Number(entry.id.split('-').pop()) ? { ...t, scheduled_at: newIso || null } : t))
            : prev
        );
      } else if (entry.type === 'Other') {
        setOthers((prev) =>
          Array.isArray(prev)
            ? prev.map((o) => (o.id === Number(entry.id.split('-').pop()) ? { ...o, scheduled_at: newIso || null } : o))
            : prev
        );
      } else if (entry.type === 'Meal') {
        setMeals((prev) =>
          Array.isArray(prev)
            ? prev.map((m) => (m.id === Number(entry.id.split('-').pop()) ? { ...m, scheduled_at: newIso || null } : m))
            : prev
        );
      } else if (entry.type === 'Accommodation') {
        const idNum = Number(entry.id.split('-').pop());
        setAccommodations((prev) =>
          Array.isArray(prev)
            ? prev.map((a) => {
                if (a.id !== idNum) return a;
                if (entry.id.startsWith('acc-in-')) {
                  return { ...a, check_in_at: newIso || null };
                }
                if (entry.id.startsWith('acc-out-')) {
                  return { ...a, check_out_at: newIso || null };
                }
                return { ...a, check_in_at: newIso || null };
              })
            : prev
        );
      }
    },
    []
  );

  useEffect(() => {
    const instance = timePickerRef.current?.flatpickr;
    if (!instance) return;
    if (timePicker) {
      instance.setDate(buildPickerDate(timePicker.entry, timePicker.day), false);
      setPendingPickerDate(instance.selectedDates?.[0] ?? null);
      if (timePicker.anchor) {
        instance.set('positionElement', timePicker.anchor);
      }
      instance.open();
    } else {
      instance.close();
      setPendingPickerDate(null);
    }
  }, [timePicker]);

  // Update expanded map when buckets change
  useEffect(() => {
    if (dayBuckets.length === 0) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setExpandedDays((prev) => {
      const next = { ...prev };
      dayBuckets.forEach((day) => {
        if (typeof next[day.key] === 'boolean') return;
        const isPast = day.date < today;
        next[day.key] = !isPast;
      });
      return next;
    });
  }, [dayBuckets]);

  const updateScheduledAt = useCallback(
    async (entry: { id: string; type: EntryType }, newIso?: string | null) => {
      try {
        setSavingDrag(true);
        const numericId = Number(entry.id.split('-').pop());
        if (entry.type === 'Innhopp') {
          const full = await getInnhopp(numericId);
          const payload = {
            sequence: full.sequence,
            name: full.name,
            coordinates: full.coordinates || undefined,
            elevation: full.elevation ?? undefined,
            takeoff_airfield_id: full.takeoff_airfield_id ?? undefined,
            scheduled_at: newIso || undefined,
            notes: full.notes || undefined,
            reason_for_choice: full.reason_for_choice || undefined,
            adjust_altimeter_aad: full.adjust_altimeter_aad || undefined,
            notam: full.notam || undefined,
            distance_by_air: full.distance_by_air ?? undefined,
            distance_by_road: full.distance_by_road ?? undefined,
            primary_landing_area: full.primary_landing_area,
            secondary_landing_area: full.secondary_landing_area,
            risk_assessment: full.risk_assessment || undefined,
            safety_precautions: full.safety_precautions || undefined,
            jumprun: full.jumprun || undefined,
            hospital: full.hospital || undefined,
            rescue_boat: full.rescue_boat ?? undefined,
            minimum_requirements: full.minimum_requirements || undefined,
            land_owners: full.land_owners || [],
            land_owner_permission: full.land_owner_permission ?? undefined
          };
          await updateInnhopp(numericId, payload);
        } else if (entry.type === 'Transport') {
          const full = await getTransport(numericId);
          await updateTransport(numericId, {
            pickup_location: full.pickup_location,
            destination: full.destination,
            passenger_count: full.passenger_count,
            scheduled_at: newIso || undefined,
            event_id: Number(full.event_id),
            vehicle_ids: Array.isArray((full as any).vehicles)
              ? (full as any).vehicles
                  .map((v: any) => v.event_vehicle_id || v.id)
                  .filter((id: any) => typeof id === 'number')
              : []
          });
        } else if (entry.type === 'Other') {
          const full = await getOther(numericId);
          await updateOther(numericId, {
            name: full.name,
            coordinates: full.coordinates || undefined,
            scheduled_at: newIso || undefined,
            description: full.description || undefined,
            notes: full.notes || undefined,
            event_id: Number(full.event_id)
          });
        } else if (entry.type === 'Meal') {
          const full = await getMeal(numericId);
          await updateMeal(numericId, {
            name: full.name,
            location: full.location || undefined,
            scheduled_at: newIso || undefined,
            notes: full.notes || undefined,
            event_id: Number(full.event_id)
          });
        } else if (entry.type === 'Accommodation' && eventId) {
          const full = await getAccommodation(Number(eventId), numericId);
          const payload = {
            name: full.name,
            capacity: full.capacity,
            coordinates: full.coordinates || undefined,
            booked: full.booked ?? undefined,
            notes: full.notes || undefined,
            check_in_at: full.check_in_at || undefined,
            check_out_at: full.check_out_at || undefined
          };
          if (entry.id.startsWith('acc-in-')) {
            payload.check_in_at = newIso || undefined;
          } else if (entry.id.startsWith('acc-out-')) {
            payload.check_out_at = newIso || undefined;
          } else {
            payload.check_in_at = newIso || undefined;
          }
          await updateAccommodation(Number(eventId), numericId, payload);
        }
      } finally {
        setSavingDrag(false);
      }
    },
    [eventId]
  );

  const getCurrentPickerDate = useCallback(() => {
    const instance = timePickerRef.current?.flatpickr;
    const selected = instance?.selectedDates?.[0] || pendingPickerDate;
    const base =
      selected && !Number.isNaN(selected.getTime())
        ? new Date(selected.getTime())
        : timePicker?.entry.scheduledAt && !Number.isNaN(new Date(timePicker.entry.scheduledAt).getTime())
        ? new Date(timePicker.entry.scheduledAt)
        : timePicker?.day
        ? new Date(timePicker.day.date)
        : new Date();

    if (instance) {
      const hourVal = (instance as any).hourElement?.value;
      const minuteVal = (instance as any).minuteElement?.value;
      const hourNum = hourVal !== undefined ? Number(hourVal) : NaN;
      const minuteNum = minuteVal !== undefined ? Number(minuteVal) : NaN;
      if (!Number.isNaN(hourNum) && !Number.isNaN(minuteNum)) {
        base.setHours(hourNum, minuteNum, 0, 0);
      }
    }

    const value = instance?.input?.value?.trim();
    if (instance && value) {
      const parsed = instance.parseDate(value, 'Y-m-d H:i') || new Date(value);
      if (!Number.isNaN(parsed?.getTime())) return parsed;
    }
    return base;
  }, [pendingPickerDate, timePicker]);

  const handleTimeChange = useCallback(async () => {
    if (!timePicker) return;
    const inst = timePickerRef.current?.flatpickr;
    if (inst?.input) {
      const parsed = inst.parseDate(inst.input.value, 'Y-m-d H:i');
      if (parsed && !Number.isNaN(parsed.getTime())) {
        inst.setDate(parsed, false, 'Y-m-d H:i');
      }
      inst.input.blur();
    }
    const chosen = getCurrentPickerDate();
    if (!chosen) return;
    const newIso = buildIsoFromPickerDate(chosen);
    const newDayKey = extractDateKey(newIso);
    const changedDay = newDayKey && newDayKey !== timePicker.day.key;
    skipScrollRef.current = true;
    scrollPositionRef.current = changedDay ? null : window.scrollY;
    try {
      await updateScheduledAt(timePicker.entry, newIso);
      applyLocalUpdate(timePicker.entry, newIso);
      setHighlightId(timePicker.entry.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setTimePicker(null);
      setPendingPickerDate(null);
      if (changedDay && newDayKey) {
        setTimeout(() => {
          const el = document.getElementById(`event-day-${newDayKey}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      } else if (scrollPositionRef.current !== null) {
        window.scrollTo({ top: scrollPositionRef.current });
        scrollPositionRef.current = null;
      }
    }
  }, [applyLocalUpdate, getCurrentPickerDate, pendingPickerDate, timePicker, updateScheduledAt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!timePicker) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        setTimePicker(null);
        setPendingPickerDate(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [timePicker]);

  if (loading) return <p className="muted">Loading schedule…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!eventData) return <p className="error-text">Event not found.</p>;

  const totalSlots = eventData.slots ?? 0;
  const nonStaffCount = Array.isArray(eventData.participant_ids)
    ? eventData.participant_ids.reduce((acc, id) => {
        const profile = participants.find((p) => p.id === id);
        const roles = Array.isArray(profile?.roles) ? profile?.roles : [];
        const isStaff = roles.includes('Staff');
        return isStaff ? acc : acc + 1;
      }, 0)
    : 0;
  const remaining = Math.max(totalSlots - nonStaffCount, 0);
  const isFull = totalSlots > 0 && remaining === 0;
  const actionButtonStyle = {
    fontSize: '1.05rem',
    fontWeight: 700,
    lineHeight: '1.2',
    fontFamily: 'inherit'
  };

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{eventData.name}</h2>
            <span className={`badge status-${eventData.status}`}>{eventData.status}</span>
            <span className={`badge ${isFull ? 'danger' : 'success'}`}>
              {isFull ? 'FULL' : `${remaining} SLOTS AVAILABLE`}
            </span>
          </div>
          <p className="event-location">{eventData.location || 'Location TBD'}</p>
        </div>
        <div className="card-actions">
          <button
            className="ghost"
            type="button"
            style={actionButtonStyle}
            onClick={() => navigate(`/events/${eventData.id}/details`)}
          >
            View details
          </button>
          <button
            className="ghost"
            type="button"
            style={actionButtonStyle}
            onClick={() => navigate(`/manifests?eventId=${eventData.id}`)}
          >
            View manifest
          </button>
          <button
            className="ghost danger"
            type="button"
            style={actionButtonStyle}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete event'}
          </button>
          <button className="ghost" type="button" style={actionButtonStyle} onClick={() => navigate('/events')}>
            Back to events
          </button>
        </div>
      </header>
      {message && <p className="error-text">{message}</p>}
      <article className="card" style={{ marginBottom: '0.75rem' }}>
        <dl
          className="card-details"
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            columnGap: '2rem',
            rowGap: '1rem',
            textAlign: 'center'
          }}
        >
          <div>
            <dt>Starts</dt>
            <dd>
              {eventData.starts_at
                ? new Date(eventData.starts_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })
                : 'TBD'}
            </dd>
          </div>
          <div>
            <dt>Ends</dt>
            <dd>
              {eventData.ends_at
                ? new Date(eventData.ends_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })
                : 'TBD'}
            </dd>
          </div>
          <div>
            <dt>Participants</dt>
            <dd>{nonStaffCount}</dd>
          </div>
          <div>
            <dt>Innhopps</dt>
            <dd>{eventData.innhopps?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Slots</dt>
            <dd>{totalSlots || 'Not set'}</dd>
          </div>
        </dl>
        <div
          style={{
            padding: '2rem 0 0.3rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
          }}
        >
          <strong>Show:</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {typeFilterOrder.map((type) => {
              const selected = typeFilters[type];
              const base = typeBadgeStyles[type];
              const inverted = selected
                ? base
                : {
                    backgroundColor: '#fff',
                    color: base.backgroundColor,
                    border: `2px solid ${base.backgroundColor}`
                  };
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
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer'
                  }}
                  aria-pressed={selected}
                  onDragLeave={(e) => {
                    if (!dragging) return;
                    const current = e.currentTarget;
                    const related = e.relatedTarget as Node | null;
                    if (related && current.contains(related)) return;
                    setDragHoverIndex(null);
                  }}
                >
                  <span className="badge" style={inverted}>
                    {type.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </article>
      {dayBuckets.length === 0 ? (
        <p className="muted">No schedule yet.</p>
      ) : (
        dayBuckets.map((day) => (
          <article
            key={day.key}
            id={`event-day-${day.key}`}
            className="card"
            style={
              dragOverDay === day.key && dragging
                ? { border: '2px solid #3b82f6', boxShadow: '0 0 0 2px rgba(59,130,246,0.15)' }
                : undefined
            }
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              setDragOverDay(day.key);
              setDragHoverIndex(null);
            }}
            onDrop={(e) => {
              if (!dragging) return;
              e.preventDefault();
              setDragHoverIndex(null);
            }}
            onDragLeave={(e) => {
              if (!dragging) return;
              const current = e.currentTarget;
              const related = e.relatedTarget as Node | null;
              if (related && current.contains(related)) return;
              setDragOverDay((prev) => (prev === day.key ? null : prev));
              setDragHoverIndex(null);
              updateDragGhost(null);
            }}
          >
            <header
                className="card-header"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
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
                  onClick={(e) => {
                  e.stopPropagation();
                  setExpandedDays((prev) => ({
                    ...prev,
                    [day.key]: !(prev[day.key] ?? true)
                  }));
                }}
              >
                {expandedDays[day.key] === false ? '▸' : '▾'}
              </button>
              <h3 style={{ margin: 0, flex: 1, textAlign: 'left' }}>
                {day.label}
              </h3>
            </header>
            {expandedDays[day.key] === false ? null : (() => {
              const entries: ScheduleEntry[] = [];
              day.innhopps.forEach((i) => {
                entries.push({
                  id: `i-${i.id}`,
                  hourKey: formatTimeLabel(i.scheduled_at),
                  sortValue: (() => {
                    const parts = parseTimeParts(i.scheduled_at);
                    return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
                  })(),
                  title: `Innhopp #${i.sequence}: ${i.name}`,
                  subtitle: '',
                  type: 'Innhopp',
                  to: `/events/${eventData.id}/innhopps/${i.id}`,
                  ready: isInnhoppReady(i),
                  missingCoordinates: !hasText(i.coordinates),
                  scheduledAt: i.scheduled_at
                });
              });
              day.transports.forEach((t) => {
                entries.push({
                  id: `t-${t.id}`,
                  hourKey: formatTimeLabel(t.scheduled_at),
                  sortValue: (() => {
                    const parts = parseTimeParts(t.scheduled_at);
                    return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
                  })(),
                  title: `${cleanLocation(t.pickup_location)} → ${cleanLocation(t.destination)}`,
                  subtitle: '',
                  type: 'Transport',
                  to: `/logistics/${t.id}`,
                  scheduledAt: t.scheduled_at || undefined
                });
              });
              day.others.forEach((o) => {
                entries.push({
                  id: `o-${o.id}`,
                  hourKey: formatTimeLabel(o.scheduled_at || undefined),
                  sortValue: (() => {
                    const parts = parseTimeParts(o.scheduled_at || undefined);
                    return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
                  })(),
                  title: o.name || 'Other logistics',
                  subtitle: '',
                  type: 'Other',
                  to: `/logistics/others/${o.id}`,
                  missingCoordinates: !hasText(o.coordinates),
                  otherComplete: hasText(o.name) && hasText(o.coordinates) && hasText(o.scheduled_at),
                  scheduledAt: o.scheduled_at || undefined
                });
              });
              day.meals.forEach((m) => {
                entries.push({
                  id: `meal-${m.id}`,
                  hourKey: formatTimeLabel(m.scheduled_at || undefined),
                  sortValue: (() => {
                    const parts = parseTimeParts(m.scheduled_at || undefined);
                    return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
                  })(),
                  title: m.name,
                  subtitle: '',
                  type: 'Meal',
                  to: `/logistics/meals/${m.id}`,
                  mealComplete: hasText(m.name) && hasText(m.location) && hasText(m.scheduled_at),
                  scheduledAt: m.scheduled_at || undefined
                });
              });
              day.accommodations.forEach((a) => {
                if (a.check_in_at && extractDateKey(a.check_in_at) === day.key) {
                  entries.push({
                    id: `acc-in-${a.id}`,
                    hourKey: formatTimeLabel(a.check_in_at),
                    sortValue: (() => {
                      const parts = parseTimeParts(a.check_in_at);
                      return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
                    })(),
                    title: `Check-in: ${a.name}`,
                    subtitle: '',
                    type: 'Accommodation',
                    booked: !!a.booked,
                    to: `/events/${eventId}/accommodations/${a.id}`,
                    missingCoordinates: !hasText(a.coordinates),
                    scheduledAt: a.check_in_at
                  });
                }
                if (a.check_out_at && extractDateKey(a.check_out_at) === day.key) {
                  entries.push({
                    id: `acc-out-${a.id}`,
                    hourKey: formatTimeLabel(a.check_out_at),
                    sortValue: (() => {
                      const parts = parseTimeParts(a.check_out_at);
                      return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
                    })(),
                    title: `Check-out: ${a.name}`,
                    subtitle: '',
                    type: 'Accommodation',
                    booked: !!a.booked,
                    to: `/events/${eventId}/accommodations/${a.id}`,
                    missingCoordinates: !hasText(a.coordinates),
                    scheduledAt: a.check_out_at
                  });
                }
                if (!a.check_in_at && !a.check_out_at) {
                  entries.push({
                    id: `acc-${a.id}`,
                    hourKey: 'Unscheduled',
                    sortValue: Number.POSITIVE_INFINITY,
                    title: `${a.name}`,
                    subtitle: '',
                    type: 'Accommodation',
                    booked: !!a.booked,
                    to: `/events/${eventId}/accommodations/${a.id}`,
                    missingCoordinates: !hasText(a.coordinates),
                    scheduledAt: null
                  });
                }
              });

              const filteredEntries = entries.filter((e) => typeFilters[e.type]);
              const orderedEntries = filteredEntries.sort((a, b) => {
                if (a.sortValue === b.sortValue) return a.title.localeCompare(b.title);
                return a.sortValue - b.sortValue;
              });

              const handleDrop = async (targetIndex: number) => {
                if (!dragging) return;
                const movingIndex = orderedEntries.findIndex((e) => e.id === dragging.id);
                const deriveType = (id: string): EntryType | null => {
                  if (id.startsWith('i-')) return 'Innhopp';
                  if (id.startsWith('t-')) return 'Transport';
                  if (id.startsWith('acc-')) return 'Accommodation';
                  if (id.startsWith('o-')) return 'Other';
                  if (id.startsWith('meal-')) return 'Meal';
                  return null;
                };

                // If the entry is being moved into this day from another day (not present in orderedEntries)
                if (movingIndex === -1) {
                  const movingType = deriveType(dragging.id);
                  if (!movingType) return;
                  const proposed = computeProposedMinutes(targetIndex, orderedEntries, day.key, dragging?.id);
                  const newIso = proposed != null ? buildDayIso(day.date, proposed) : undefined;

                  try {
                    await updateScheduledAt({ id: dragging.id, type: movingType }, newIso);
                    await reload({ preserveLoading: true });
                    setHighlightId(dragging.id);
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : 'Failed to update schedule');
                  } finally {
                    setDragging(null);
                    setDragOverDay(null);
                    clearDragGhost();
                  }
                  return;
                }

                const movingEntry = orderedEntries[movingIndex];
                const reordered = orderedEntries.filter((e) => e.id !== dragging.id);
                const clampedIndex = Math.max(0, Math.min(targetIndex, reordered.length));
                reordered.splice(clampedIndex, 0, movingEntry);

                const proposed = computeProposedMinutes(clampedIndex, reordered, day.key, dragging?.id);
                const newIso = proposed != null ? buildDayIso(day.date, proposed) : undefined;

                try {
                  await updateScheduledAt(movingEntry, newIso);
                  await reload({ preserveLoading: true });
                  setHighlightId(movingEntry.id);
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Failed to update schedule');
                } finally {
                  setDragging(null);
                  setDragOverDay(null);
                  clearDragGhost();
                }
              };

              const renderEntry = (entry: Entry, index: number) => {
                const badgeStyle = typeBadgeStyles[entry.type];
                const missingCoords = !!entry.missingCoordinates;
                const compactBadgeStyle = { minWidth: '2.4ch', textAlign: 'center', display: 'inline-block' as const };
                let statusBadge: JSX.Element | null = null;
                if (entry.type === 'Accommodation') {
                  statusBadge =
                    entry.booked && !missingCoords ? (
                      <span className="badge success" style={compactBadgeStyle}>
                        ✓
                      </span>
                    ) : (
                      <span className="badge danger" style={compactBadgeStyle}>
                        !
                      </span>
                    );
                } else if (entry.type === 'Innhopp') {
                  statusBadge = entry.ready ? (
                    <span className="badge success" style={compactBadgeStyle}>
                      ✓
                    </span>
                  ) : (
                    <span className="badge danger" style={compactBadgeStyle}>
                      !
                    </span>
                  );
                } else if (entry.type === 'Meal') {
                  statusBadge = entry.mealComplete ? (
                    <span className="badge success" style={compactBadgeStyle}>
                      ✓
                    </span>
                  ) : (
                    <span className="badge danger" style={compactBadgeStyle}>
                      !
                    </span>
                  );
                } else if (entry.type === 'Other') {
                  statusBadge = entry.otherComplete ? (
                    <span className="badge success" style={compactBadgeStyle}>
                      ✓
                    </span>
                  ) : (
                    <span className="badge danger" style={compactBadgeStyle}>
                      !
                    </span>
                  );
                } else if (missingCoords) {
                  statusBadge = (
                    <span className="badge danger" style={compactBadgeStyle} title="Coordinates missing" aria-label="Coordinates missing">
                      !
                    </span>
                  );
                }
                const content = (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <strong>{entry.title}</strong>
                      <div
                        style={{
                          marginLeft: 'auto',
                          display: 'grid',
                          gridTemplateColumns: 'minmax(56px, 80px) minmax(110px, 150px)',
                          alignItems: 'center',
                          justifyItems: 'center',
                          columnGap: '0.5rem'
                        }}
                      >
                        {statusBadge || <span style={{ visibility: 'hidden', ...compactBadgeStyle }}>!</span>}
                        <span
                          className="badge"
                          style={{ ...badgeStyle, borderLeft: '1px solid #d7dfe7', paddingLeft: '0.65rem' }}
                          aria-label={entry.type}
                        >
                          {entry.type}
                        </span>
                      </div>
                    </div>
                    {entry.subtitle && <div className="muted">{entry.subtitle}</div>}
                  </div>
                );
                const commonProps = {
                  draggable: entry.type !== 'Accommodation',
                  onDragStart: (e: DragEvent) => {
                    setDragging({ id: entry.id, dayKey: day.key });
                    const hint = entry.hourKey !== 'Unscheduled' ? entry.hourKey : null;
                    const rowEl = (e.currentTarget as HTMLElement).closest('li') as HTMLElement;
                    const ghost = rowEl
                      ? buildDragGhost(rowEl, hint, e.clientX, e.clientY)
                      : buildDragGhost(e.currentTarget as HTMLElement, hint, e.clientX, e.clientY);
                    if (e.dataTransfer) {
                      try {
                        e.dataTransfer.clearData();
                      } catch {
                        // ignore
                      }
                      e.dataTransfer.setData('text/plain', entry.id);
                      e.dataTransfer.setData('text/uri-list', '');
                      const shim = document.createElement('div');
                      shim.style.width = '1px';
                      shim.style.height = '1px';
                      shim.style.opacity = '0';
                      shim.style.position = 'fixed';
                      shim.style.left = '-10px';
                      shim.style.top = '-10px';
                      document.body.appendChild(shim);
                      dragShimRef.current = shim;
                      e.dataTransfer.setDragImage(shim, 0, 0);
                    }
                  },
                  onDragOver: (e: DragEvent) => {
                    if (!dragging) return;
                    e.preventDefault();
                    if (dragHoverIndex !== index) {
                      setDragHoverIndex(index);
                    }
                    const proposed = computeProposedMinutes(index, orderedEntries, day.key, dragging?.id);
                    const newTime =
                      proposed != null && proposed !== Number.POSITIVE_INFINITY
                        ? formatTimeLabel(buildDayIso(day.date, proposed))
                        : null;
                    updateDragGhost(newTime, { x: e.clientX, y: e.clientY });
                  },
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    handleDrop(index);
                  },
                  onDragEnd: () => {
                    setDragging(null);
                    setDragOverDay(null);
                    setDragHoverIndex(null);
                    clearDragGhost();
                  },
                  id: `entry-${entry.id}`,
                  style: {
                    display: 'block',
                    width: '100%',
                    flex: 1,
                    padding: '0.25rem 0.4rem',
                    margin: '-0.25rem -0.4rem',
                    ...(entry.id === highlightId
                      ? {
                          boxShadow: '0 0 0 2px #3b82f6',
                          borderRadius: '8px'
                        }
                      : undefined)
                  }
                };
                return entry.to ? (
                  <Link
                    key={entry.id}
                    to={entry.to}
                    className="card-link"
                    {...commonProps}
                    onClick={() => {
                      if (eventData?.id) {
                        try {
                          sessionStorage.setItem(`event-schedule-highlight:${eventData.id}`, entry.id);
                        } catch {
                          // ignore
                        }
                      }
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={entry.id}
                    id={`entry-${entry.id}`}
                    style={{
                      display: 'block',
                      width: '100%',
                      flex: 1,
                      padding: '0.25rem 0.4rem',
                      margin: '-0.25rem -0.4rem',
                      ...(entry.id === highlightId
                        ? {
                            boxShadow: '0 0 0 2px #3b82f6',
                            borderRadius: '8px'
                          }
                        : undefined)
                    }}
                  >
                    {content}
                  </div>
                );
              };

              return orderedEntries.length === 0 ? (
                <p
                  className="muted"
                  style={{ padding: '0.5rem 0' }}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    setDragOverDay(day.key);
                    setDragHoverIndex(0);
                    const proposed = computeProposedMinutes(0, orderedEntries, day.key, dragging?.id);
                    const newTime =
                      proposed != null && proposed !== Number.POSITIVE_INFINITY
                        ? formatTimeLabel(buildDayIso(day.date, proposed))
                        : null;
                    updateDragGhost(newTime, { x: e.clientX, y: e.clientY });
                  }}
                  onDrop={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    handleDrop(0);
                  }}
                >
                  Nothing scheduled.
                </p>
              ) : (
                <ul className="status-list" style={{ margin: 0 }}>
                  {orderedEntries.map((item, idx) => (
                    <li
                      key={item.id}
                      style={{ padding: '0.35rem 0', borderBottom: '1px solid #e1e7ee', width: '100%' }}
                      onDragOver={(e) => {
                        if (!dragging) return;
                        e.preventDefault();
                        if (dragHoverIndex !== idx) {
                          setDragHoverIndex(idx);
                        }
                        const proposed = computeProposedMinutes(idx, orderedEntries, day.key, dragging?.id);
                        const newTime =
                          proposed != null && proposed !== Number.POSITIVE_INFINITY
                            ? formatTimeLabel(buildDayIso(day.date, proposed))
                            : null;
                        updateDragGhost(newTime, { x: e.clientX, y: e.clientY });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(idx);
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '5.5rem 1fr', gap: '0.5rem', alignItems: 'center', width: '100%' }}>
                        <div
                          style={{ fontWeight: 600 }}
                          className={`muted schedule-time ${
                            timePicker && timePicker.entry.id === item.id ? 'schedule-time-active' : ''
                          }`}
                          data-ghost-time="time"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTimePicker({ entry: item, day, anchor: e.currentTarget });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setTimePicker({ entry: item, day, anchor: e.currentTarget });
                            }
                          }}
                          title="Edit time"
                        >
                          {item.hourKey}
                        </div>
                        <div style={{ width: '100%' }}>{renderEntry(item, idx)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </article>
        ))
      )}
      {timePicker ? (
        <div
          ref={pickerPortalRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.08)'
          }}
          onClick={() => {
            setTimePicker(null);
            setPendingPickerDate(null);
          }}
        >
          {(() => {
            const rect = timePicker.anchor?.getBoundingClientRect();
            const pad = 12;
            const estWidth = 340;
            const estHeight = 360;
            const viewW = typeof window !== 'undefined' ? window.innerWidth : estWidth;
            const viewH = typeof window !== 'undefined' ? window.innerHeight : estHeight;
            const viewportLeft = pad;
            const viewportRight = viewW - pad;
            const viewportTop = pad;
            const viewportBottom = viewH - pad;

            const baseLeft = rect ? rect.right + 12 : viewportLeft;
            const spaceAbove = rect ? rect.top - viewportTop : estHeight;
            const spaceBelow = rect ? viewportBottom - rect.bottom : estHeight;
            const preferAbove = spaceAbove >= estHeight || spaceAbove > spaceBelow;
            const baseTop = rect
              ? preferAbove
                ? rect.top - estHeight - 12
                : rect.bottom + 12
              : viewportTop + 24;
            const left = Math.min(Math.max(baseLeft, viewportLeft), viewportRight - estWidth);
            const top = Math.min(Math.max(baseTop, viewportTop), viewportBottom - estHeight);
            return (
              <div
                style={{
                  position: 'fixed',
                  top,
                  left,
                  background: '#fff',
                  border: '1px solid #d7dfe7',
                  borderRadius: '10px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                  padding: '0.85rem',
                  display: 'inline-flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  minWidth: '280px',
                  maxWidth: '90vw'
                }}
                onClick={(e) => e.stopPropagation()}
                className="schedule-time-picker"
              >
                <Flatpickr
                  ref={timePickerRef}
                  options={{
                    enableTime: true,
                    time_24hr: true,
                    dateFormat: 'Y-m-d H:i',
                    allowInput: true,
                    enableMobile: true,
                    inline: true,
                    clickOpens: false,
                    closeOnSelect: false
                  }}
                  onChange={(dates) => setPendingPickerDate(dates[0] ?? null)}
                  onValueUpdate={(dates) => setPendingPickerDate(dates[0] ?? null)}
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => handleTimeChange()}
                    style={{ padding: '0.35rem 0.9rem' }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setTimePicker(null);
                      setPendingPickerDate(null);
                    }}
                    style={{ padding: '0.35rem 0.9rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}
    </section>
  );
};

export default EventSchedulePage;
