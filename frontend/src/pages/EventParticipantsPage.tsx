import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { Event, getEvent } from '../api/events';
import { ParticipantProfile, listParticipantProfiles } from '../api/participants';
import { listEventRegistrations, Registration, RegistrationStatus } from '../api/registrations';
import EventGearMenu from '../components/EventGearMenu';
import EventPageTitle from '../components/EventPageTitle';
import ParticipantList, { ParticipantListItem, ParticipantListSort, ParticipantListSortField } from '../components/ParticipantList';
import { accommodationOptions, canopyCourseOptions, dietaryRestrictionOptions, disciplineOptions, hssQualityOptions, landingAreaPreferenceOptions, medicalExpertiseOptions, otherAirSportOptions, ratingOptions, usesPackerOptions } from '../components/ParticipantProfileForm';
import { parseCitizenshipCountry } from '../utils/citizenships';
import { isProfileCompleteForRegistration } from '../utils/profileCompleteness';

const statusLabels: Record<RegistrationStatus, string> = {
  deposit_pending: 'Deposit pending',
  deposit_paid: 'Deposit paid',
  main_invoice_pending: 'Invoice pending',
  completed: 'Completed',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  expired: 'Expired'
};

const chartPalette = ['#2b8a3e', '#74c69d', '#e6b84a', '#d97706', '#0d6efd', '#7e22ce'];
const notApplicableChartColor = '#64748b';
const canopyCourseChartLabels: Record<string, string> = {
  'Attended 1 or more canopy courses': '1 or more',
  'Never attended a canopy course': 'Never',
  'Want to attend one': 'Want to',
  'N/A': 'N/A'
};
const countryFlag = (code?: string) => code
  ? String.fromCodePoint(...[...code].map((character) => 127397 + character.charCodeAt(0)))
  : '🏳️';

type ParticipantRow = ParticipantListItem & {
  registration: Registration;
  profile?: ParticipantProfile;
};

type ChartFilter = {
  title: string;
  matches: (row: ParticipantRow) => boolean;
};

type ChartDatum = { label: string; count: number };
type ParticipantScope = 'participants' | 'staff';
type RosterView = 'list' | 'stats';

export type RosterStatsSource = {
  items: Array<{
    profile: ParticipantProfile;
    eventCount: number;
    registeredAt?: string;
  }>;
  loading?: boolean;
  error?: string | null;
  /** Real registrations used for the registration summary cards. */
  registrations?: Registration[];
  onSendFiltered?: (participantIds: number[]) => void;
  /** The date used for age calculations when this is not an event roster. */
  referenceDate?: string;
};

const donutPoint = (angle: number, radius: number) => {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: 50 + radius * Math.cos(radians), y: 50 + radius * Math.sin(radians) };
};

const donutSegmentPath = (start: number, end: number) => {
  const outerStart = donutPoint(start, 45);
  const outerEnd = donutPoint(end, 45);
  const innerEnd = donutPoint(end, 29);
  const innerStart = donutPoint(start, 29);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${outerStart.x} ${outerStart.y} A 45 45 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 29 29 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
};

const InteractiveDonut = ({
  segments,
  colors,
  ariaLabel,
  onSelect,
  hoveredIndex: controlledHoveredIndex,
  onHoveredIndexChange,
  children
}: {
  segments: ChartDatum[];
  colors: string[];
  ariaLabel: string;
  onSelect: (label: string) => void;
  hoveredIndex?: number | null;
  onHoveredIndexChange?: (index: number | null) => void;
  children?: ReactNode;
}) => {
  const [uncontrolledHoveredIndex, setUncontrolledHoveredIndex] = useState<number | null>(null);
  const isHoverControlled = onHoveredIndexChange !== undefined;
  const hoveredIndex = isHoverControlled ? controlledHoveredIndex ?? null : uncontrolledHoveredIndex;
  const setHoveredIndex = (index: number | null) => {
    if (!isHoverControlled) setUncontrolledHoveredIndex(index);
    onHoveredIndexChange?.(index);
  };
  const total = segments.reduce((sum, item) => sum + item.count, 0);
  let position = 0;
  return (
    <div className="event-participants-donut" aria-label={ariaLabel}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {total ? segments.map((item, index) => {
          const start = position;
          const end = start + item.count / total * 360;
          position = end;
          if (item.count === 0) return null;
          const color = item.label === 'N/A' ? notApplicableChartColor : colors[index % colors.length];
          if (item.count === total) return <circle key={item.label} className={`event-participants-donut-slice${hoveredIndex === index ? ' is-hovered' : ''}`} cx="50" cy="50" r="37" fill="none" stroke={color} strokeWidth="16" tabIndex={0} onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)} onClick={() => onSelect(item.label)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.label); } }} />;
          return <path key={item.label} className={`event-participants-donut-slice${hoveredIndex === index ? ' is-hovered' : ''}`} d={donutSegmentPath(start, end)} fill={color} tabIndex={0} onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)} onClick={() => onSelect(item.label)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.label); } }} />;
        }) : <circle cx="50" cy="50" r="37" fill="none" stroke="var(--panel-border)" strokeWidth="16" />}
      </svg>
      {children}
    </div>
  );
};

const InteractiveDonutWithLegend = ({
  segments,
  colors,
  ariaLabel,
  onSelect
}: {
  segments: ChartDatum[];
  colors: string[];
  ariaLabel: string;
  onSelect: (label: string) => void;
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="event-participants-type-pie-layout">
      <InteractiveDonut
        segments={segments}
        colors={colors}
        ariaLabel={ariaLabel}
        onSelect={onSelect}
        hoveredIndex={hoveredIndex}
        onHoveredIndexChange={setHoveredIndex}
      />
      <ul className="event-participants-type-legend">
        {segments.map((item, index) => (
          <li key={item.label}>
            <button
              type="button"
              className={hoveredIndex === index ? 'is-hovered' : ''}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
              onClick={() => onSelect(item.label)}
              aria-label={`Show ${item.label} participants`}
            >
              <i style={{ background: item.label === 'N/A' ? notApplicableChartColor : colors[index % colors.length] }} />
              <span className="registration-stat-label">{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const activeStatuses = new Set<RegistrationStatus>(['deposit_pending', 'deposit_paid', 'main_invoice_pending', 'completed']);

const isSkydiver = (profile?: ParticipantProfile) => Boolean(profile?.roles.includes('Skydiver'));

const isStaff = (profile?: ParticipantProfile) => {
  const hasRole = (roles: string[] | undefined, role: string) =>
    roles?.some((value) => value.trim().toLowerCase() === role) ?? false;

  return hasRole(profile?.roles, 'staff') || hasRole(profile?.account_roles, 'staff') || hasRole(profile?.account_roles, 'admin');
};

const sortParticipantRows = (items: ParticipantRow[], sort: ParticipantListSort) => [...items].sort((left, right) => {
  const result = sort.field === 'name'
    ? left.full_name.localeCompare(right.full_name, undefined, { sensitivity: 'base' })
    : sort.field === 'registrationDate'
      ? new Date(left.registeredAt).getTime() - new Date(right.registeredAt).getTime()
      : left.eventCount - right.eventCount;
  return sort.direction === 'asc' ? result : -result;
});

const statusBadgeClass = (status: RegistrationStatus) => {
  if (status === 'completed') return 'badge success';
  if (status === 'cancelled' || status === 'expired') return 'badge danger';
  return 'badge neutral';
};

export const ParticipantRosterStats = ({ source }: { source?: RosterStatsSource }) => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [profiles, setProfiles] = useState<ParticipantProfile[]>([]);
  const [loading, setLoading] = useState(!source);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RegistrationStatus>('all');
  const [sort, setSort] = useState<ParticipantListSort>({ field: 'name', direction: 'asc' });
  const [listOpen, setListOpen] = useState(true);
  const [skydivingOpen, setSkydivingOpen] = useState(true);
  const [generalInfoOpen, setGeneralInfoOpen] = useState(true);
  const [mealsAccommodationOpen, setMealsAccommodationOpen] = useState(true);
  const [hssQualitiesOpen, setHssQualitiesOpen] = useState(true);
  const [participantScope, setParticipantScope] = useState<ParticipantScope>('participants');
  const [rosterView, setRosterView] = useState<RosterView>('stats');
  const [chartFilter, setChartFilter] = useState<ChartFilter | null>(null);
  const [chartFilterSort, setChartFilterSort] = useState<ParticipantListSort>({ field: 'name', direction: 'asc' });
  const [chartFilterListOpen, setChartFilterListOpen] = useState(true);
  const overlayScrollYRef = useRef<number | null>(null);

  useEffect(() => {
    if (source || !eventId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [event, nextRegistrations, nextProfiles] = await Promise.all([
          getEvent(Number(eventId)),
          listEventRegistrations(Number(eventId)),
          listParticipantProfiles()
        ]);
        if (cancelled) return;
        setEventData(event);
        setRegistrations(Array.isArray(nextRegistrations) ? nextRegistrations : []);
        setProfiles(Array.isArray(nextProfiles) ? nextProfiles : []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load event participants.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [eventId, source]);

  useEffect(() => {
    if (!chartFilter) return;
    const scrollY = window.scrollY;
    overlayScrollYRef.current = scrollY;
    const { style } = document.body;
    const previousStyles = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow
    };

    document.body.classList.add('event-participants-overlay-open');
    // Fix the body in place instead of simply hiding overflow. The latter can
    // reset the document's scroll position on mobile browsers.
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('event-participants-overlay-open');
      style.position = previousStyles.position;
      style.top = previousStyles.top;
      style.left = previousStyles.left;
      style.right = previousStyles.right;
      style.width = previousStyles.width;
      style.overflow = previousStyles.overflow;
      window.scrollTo(0, overlayScrollYRef.current ?? scrollY);
      overlayScrollYRef.current = null;
    };
  }, [chartFilter]);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const allRows = useMemo<ParticipantRow[]>(() => source ? source.items.map(({ profile, eventCount, registeredAt }) => {
    const registration: Registration = {
      id: -profile.id,
      event_id: 0,
      participant_id: profile.id,
      participant_name: profile.full_name,
      participant_email: profile.email,
      status: 'completed',
      registered_at: registeredAt || profile.created_at || '',
      tags: [],
      created_at: registeredAt || profile.created_at || '',
      updated_at: registeredAt || profile.created_at || ''
    };
    return {
      id: profile.id,
      full_name: profile.full_name || `Participant #${profile.id}`,
      email: profile.email,
      jump_count: profile.jump_count,
      years_in_sport: profile.years_in_sport,
      eventCount,
      registeredAt: registration.registered_at,
      profileIncomplete: !isProfileCompleteForRegistration(profile),
      registration,
      profile
    };
  }) : registrations.map((registration) => {
    const profile = profileById.get(registration.participant_id);
    return {
      id: registration.participant_id,
      full_name: profile?.full_name || registration.participant_name || `Participant #${registration.participant_id}`,
      email: profile?.email || registration.participant_email,
      jump_count: profile?.jump_count,
      years_in_sport: profile?.years_in_sport,
      eventCount: 1,
      registeredAt: registration.registered_at,
      profileIncomplete: !profile || !isProfileCompleteForRegistration(profile),
      registration,
      profile
    };
  }), [registrations, profileById, source]);

  const rows = useMemo(
    () => allRows.filter((row) => participantScope === 'staff' ? isStaff(row.profile) : !isStaff(row.profile)),
    [allRows, participantScope]
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<RegistrationStatus, number>();
    rows.forEach((row) => counts.set(row.registration.status, (counts.get(row.registration.status) || 0) + 1));
    return (Object.keys(statusLabels) as RegistrationStatus[]).map((status) => ({ status, label: statusLabels[status], count: counts.get(status) || 0 }));
  }, [rows]);

  const participantTypeCounts = useMemo(() => {
    const activeRows = rows.filter((row) => activeStatuses.has(row.registration.status));
    const skydivers = activeRows.filter((row) => row.profile?.roles.includes('Skydiver')).length;
    return [
      { label: 'Skydivers', count: skydivers },
      { label: 'Non-jumpers', count: activeRows.length - skydivers }
    ];
  }, [rows]);

  const jumpCountBuckets = useMemo(() => {
    const buckets = [
      { label: '<50', min: 0, max: 49, count: 0 },
      { label: '50–99', min: 50, max: 99, count: 0 },
      { label: '100–199', min: 100, max: 199, count: 0 },
      { label: '200–499', min: 200, max: 499, count: 0 },
      { label: '500–999', min: 500, max: 999, count: 0 },
      { label: '1,000+', min: 1000, max: Infinity, count: 0 },
      { label: 'N/A', min: 0, max: -1, count: 0 }
    ];
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const jumpCount = row.profile?.jump_count;
      if (typeof jumpCount !== 'number') {
        buckets[6].count += 1;
        return;
      }
      const bucket = buckets.find((item) => jumpCount >= item.min && jumpCount <= item.max);
      if (bucket) bucket.count += 1;
      else buckets[6].count += 1;
    });
    return buckets;
  }, [rows]);

  const recentJumpBuckets = useMemo(() => {
    const buckets = [
      { label: '0', min: 0, max: 0, count: 0 },
      { label: '1–9', min: 1, max: 9, count: 0 },
      { label: '10–19', min: 10, max: 19, count: 0 },
      { label: '20–49', min: 20, max: 49, count: 0 },
      { label: '50–99', min: 50, max: 99, count: 0 },
      { label: '100+', min: 100, max: Infinity, count: 0 },
      { label: 'N/A', min: 0, max: -1, count: 0 }
    ];
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const jumpCount = row.profile?.recent_jump_count;
      if (typeof jumpCount !== 'number') {
        buckets[6].count += 1;
        return;
      }
      const bucket = buckets.find((item) => jumpCount >= item.min && jumpCount <= item.max);
      if (bucket) bucket.count += 1;
      else buckets[6].count += 1;
    });
    return buckets;
  }, [rows]);

  const yearsInSportBuckets = useMemo(() => {
    const buckets = [
      { label: '<1', min: 0, max: 0, count: 0 },
      { label: '1–3', min: 1, max: 3, count: 0 },
      { label: '4–9', min: 4, max: 9, count: 0 },
      { label: '10–15', min: 10, max: 15, count: 0 },
      { label: '16–29', min: 16, max: 29, count: 0 },
      { label: '30+', min: 30, max: Infinity, count: 0 },
      { label: 'N/A', min: 0, max: -1, count: 0 }
    ];
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const yearsInSport = row.profile?.years_in_sport;
      if (typeof yearsInSport !== 'number') {
        buckets[6].count += 1;
        return;
      }
      const bucket = buckets.find((item) => yearsInSport >= item.min && yearsInSport <= item.max);
      if (bucket) bucket.count += 1;
      else buckets[6].count += 1;
    });
    return buckets;
  }, [rows]);

  const wingloadBuckets = useMemo(() => {
    const buckets = [
      { label: '≤1.0', min: 0, max: 1, count: 0 },
      { label: '1.01–1.2', min: 1.01, max: 1.2, count: 0 },
      { label: '1.21–1.5', min: 1.21, max: 1.5, count: 0 },
      { label: '1.51–2.0', min: 1.51, max: 2, count: 0 },
      { label: '2.01–2.5', min: 2.01, max: 2.5, count: 0 },
      { label: '2.51 +', min: 2.51, max: Infinity, count: 0 },
      { label: 'N/A', min: 0, max: -1, count: 0 }
    ];
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const profile = row.profile;
      const isSkydiver = Boolean(profile?.roles.includes('Skydiver'));
      const wingload = Number.parseFloat(profile?.wingload?.replace(',', '.') || '');
      if (!isSkydiver) return;
      if (!Number.isFinite(wingload)) {
        buckets[6].count += 1;
        return;
      }
      const bucket = buckets.find((item) => wingload >= item.min && wingload <= item.max);
      if (bucket) bucket.count += 1;
      else buckets[6].count += 1;
    });
    return buckets;
  }, [rows]);

  const licenseCounts = useMemo(() => {
    const counts = new Map(['Non-jumper', 'A', 'B', 'C', 'D', 'N/A'].map((label) => [label, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const profile = row.profile;
      const license = profile?.license?.trim().toUpperCase();
      const isSkydiver = Boolean(profile?.roles.includes('Skydiver'));
      if (!isSkydiver) {
        counts.set('Non-jumper', (counts.get('Non-jumper') || 0) + 1);
        return;
      }
      const label = license && ['A', 'B', 'C', 'D'].includes(license) ? license : 'N/A';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()].map(([label, count]) => ({ label, count }));
  }, [rows]);

  const disciplineCounts = useMemo(() => {
    const counts = new Map<string, number>([...disciplineOptions, 'N/A'].map((discipline) => [discipline, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const profile = row.profile;
      const isSkydiver = Boolean(profile?.roles.includes('Skydiver'));
      if (!isSkydiver) return;
      const disciplines = (profile?.disciplines || []).map((discipline) => discipline.trim()).filter(Boolean);
      if (disciplines.length === 0) counts.set('N/A', (counts.get('N/A') || 0) + 1);
      disciplines.forEach((discipline) => {
        const label = discipline.trim();
        if (label) counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    const customDisciplines = [...counts.keys()]
      .filter((discipline) => !disciplineOptions.includes(discipline as typeof disciplineOptions[number]))
      .filter((discipline) => discipline !== 'N/A')
      .sort((left, right) => left.localeCompare(right));
    return [...disciplineOptions, ...customDisciplines, 'N/A'].map((label) => ({ label, count: counts.get(label) || 0 }));
  }, [rows]);

  const ratingCounts = useMemo(() => {
    const counts = new Map<string, number>(ratingOptions.map((rating) => [rating, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const profile = row.profile;
      const isSkydiver = Boolean(profile?.roles.includes('Skydiver'));
      if (!isSkydiver) return;
      profile?.ratings.forEach((rating) => {
        const label = rating.trim();
        if (label) counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    return ratingOptions.map((label) => ({ label, count: counts.get(label) || 0 }));
  }, [rows]);

  const packerCounts = useMemo(() => {
    const counts = new Map([...usesPackerOptions, 'N/A'].map((label) => [label, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const profile = row.profile;
      const isSkydiver = Boolean(profile?.roles.includes('Skydiver'));
      if (!isSkydiver) return;
      const packerPreference = profile?.uses_packer?.trim();
      const label = packerPreference && usesPackerOptions.includes(packerPreference as typeof usesPackerOptions[number]) ? packerPreference : 'N/A';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...usesPackerOptions, 'N/A'].map((label) => ({ label, count: counts.get(label) || 0 }));
  }, [rows]);

  const canopyCourseCounts = useMemo(() => {
    const counts = new Map([...canopyCourseOptions, 'N/A'].map((label) => [label, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const profile = row.profile;
      const isSkydiver = Boolean(profile?.roles.includes('Skydiver'));
      if (!isSkydiver) return;
      const course = profile?.canopy_course?.trim();
      const label = course && canopyCourseOptions.includes(course as typeof canopyCourseOptions[number]) ? course : 'N/A';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...canopyCourseOptions, 'N/A'].map((label) => ({ label: canopyCourseChartLabels[label], count: counts.get(label) || 0 }));
  }, [rows]);

  const otherAirSportCounts = useMemo(() => {
    const counts = new Map<string, number>(otherAirSportOptions.map((sport) => [sport, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      row.profile?.other_air_sports.forEach((sport) => {
        const label = sport.trim();
        if (label) counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    const customSports = [...counts.keys()]
      .filter((sport) => !otherAirSportOptions.includes(sport as typeof otherAirSportOptions[number]))
      .sort((left, right) => left.localeCompare(right));
    return [...otherAirSportOptions, ...customSports].map((label) => ({ label, count: counts.get(label) || 0 }));
  }, [rows]);

  const landingAreaPreferenceCounts = useMemo(() => {
    const counts = new Map([...landingAreaPreferenceOptions, 'N/A'].map((label) => [label, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      if (!isSkydiver(row.profile)) return;
      const preference = row.profile?.landing_area_preference?.trim();
      const label = preference && landingAreaPreferenceOptions.includes(preference as typeof landingAreaPreferenceOptions[number]) ? preference : 'N/A';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...landingAreaPreferenceOptions, 'N/A'].map((label) => ({ label, count: counts.get(label) || 0 }));
  }, [rows]);

  const citizenshipCounts = useMemo(() => {
    const counts = new Map<string, { label: string; flag: string; count: number }>();
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const country = parseCitizenshipCountry(row.profile?.citizenship);
      const { code, key } = country;
      const current = counts.get(key) || {
        label: country.name,
        flag: countryFlag(code),
        count: 0
      };
      current.count += 1;
      counts.set(key, current);
    });
    return [...counts.entries()]
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [rows]);

  const ageBuckets = useMemo(() => {
    const buckets = [
      { label: '18–25', min: 18, max: 25, count: 0 },
      { label: '25–40', min: 26, max: 40, count: 0 },
      { label: '40–60', min: 41, max: 60, count: 0 },
      { label: '60+', min: 61, max: Infinity, count: 0 },
      { label: 'N/A', min: 0, max: -1, count: 0 }
    ];
    const referenceDate = new Date(source?.referenceDate || eventData?.starts_at || Date.now());
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const birthday = row.profile?.date_of_birth ? new Date(row.profile.date_of_birth) : null;
      if (!birthday || Number.isNaN(birthday.getTime())) {
        buckets[4].count += 1;
        return;
      }
      let age = referenceDate.getUTCFullYear() - birthday.getUTCFullYear();
      const monthDifference = referenceDate.getUTCMonth() - birthday.getUTCMonth();
      if (monthDifference < 0 || (monthDifference === 0 && referenceDate.getUTCDate() < birthday.getUTCDate())) age -= 1;
      const bucket = buckets.find((item) => age >= item.min && age <= item.max);
      if (bucket) bucket.count += 1;
      else buckets[4].count += 1;
    });
    return buckets;
  }, [eventData?.starts_at, rows, source?.referenceDate]);

  const medicalExpertiseCounts = useMemo(() => {
    const counts = new Map(['None', ...medicalExpertiseOptions].map((label) => [label, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const expertise = row.profile?.medical_expertise || [];
      if (expertise.length === 0) {
        counts.set('None', (counts.get('None') || 0) + 1);
        return;
      }
      medicalExpertiseOptions.forEach((option) => {
        if (expertise.includes(option)) counts.set(option, (counts.get(option) || 0) + 1);
      });
    });
    return [
      { label: 'None', count: counts.get('None') || 0 },
      { label: 'Doctor', count: counts.get('Doctor') || 0 },
      { label: 'Paramedic', count: counts.get('Paramedic') || 0 },
      { label: 'First aid', count: counts.get('First aid certified') || 0 }
    ];
  }, [rows]);

  const accommodationCounts = useMemo(() => {
    const counts = new Map([...accommodationOptions, 'N/A'].map((label) => [label, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const accommodation = row.profile?.accommodation?.trim();
      const label = accommodation && accommodationOptions.includes(accommodation as typeof accommodationOptions[number]) ? accommodation : 'N/A';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [
      { label: 'Shared', value: accommodationOptions[0], count: counts.get(accommodationOptions[0]) || 0 },
      { label: 'Single', value: accommodationOptions[1], count: counts.get(accommodationOptions[1]) || 0 },
      { label: 'N/A', value: 'N/A', count: counts.get('N/A') || 0 }
    ];
  }, [rows]);

  const dietaryRestrictionCounts = useMemo(() => {
    const counts = new Map([...dietaryRestrictionOptions, 'N/A'].map((label) => [label, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const restrictions = row.profile?.dietary_restrictions || [];
      let hasRecordedRestriction = false;
      dietaryRestrictionOptions.forEach((option) => {
        if (restrictions.includes(option)) {
          counts.set(option, (counts.get(option) || 0) + 1);
          hasRecordedRestriction = true;
        }
      });
      if (!hasRecordedRestriction) counts.set('N/A', (counts.get('N/A') || 0) + 1);
    });
    return [...dietaryRestrictionOptions, 'N/A'].map((label) => ({ label, count: counts.get(label) || 0 }));
  }, [rows]);

  const hssQualityCounts = useMemo(() => {
    const counts = new Map<string, number>(hssQualityOptions.map((quality) => [quality, 0]));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      row.profile?.hss_qualities.forEach((quality) => {
        if (counts.has(quality)) counts.set(quality, (counts.get(quality) || 0) + 1);
      });
    });
    return hssQualityOptions.map((label) => ({ label, count: counts.get(label) || 0 }));
  }, [rows]);

  const hssCheckedCountBuckets = useMemo(() => {
    const buckets = Array.from({ length: 8 }, (_, index) => ({ label: String(index + 1), count: 0 }));
    rows.filter((row) => activeStatuses.has(row.registration.status)).forEach((row) => {
      const count = row.profile?.hss_qualities.length || 0;
      if (count >= 1 && count <= 8) buckets[count - 1].count += 1;
    });
    return buckets;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortParticipantRows(rows
      .filter((row) => statusFilter === 'all' || row.registration.status === statusFilter)
      .filter((row) => !normalizedQuery || `${row.full_name} ${row.email || ''}`.toLowerCase().includes(normalizedQuery)), sort);
  }, [query, rows, sort, statusFilter]);

  const chartFilterRows = useMemo(
    () => chartFilter ? sortParticipantRows(rows.filter(chartFilter.matches), chartFilterSort) : [],
    [chartFilter, chartFilterSort, rows]
  );

  const activeTotal = rows.filter((row) => activeStatuses.has(row.registration.status)).length;
  const depositPaidTotal = rows.filter((row) => (
    row.registration.status === 'deposit_paid' ||
    row.registration.status === 'main_invoice_pending' ||
    row.registration.status === 'completed'
  )).length;
  const completedTotal = statusCounts.find((item) => item.status === 'completed')?.count || 0;
  const cancelledTotal = statusCounts.find((item) => item.status === 'cancelled')?.count || 0;
  const profilesCompleteTotal = rows.filter((row) => activeStatuses.has(row.registration.status) && row.profile && isProfileCompleteForRegistration(row.profile)).length;
  const summaryRegistrations = source?.registrations ?? registrations;
  const summaryActiveTotal = summaryRegistrations.filter((registration) => activeStatuses.has(registration.status)).length;
  const summaryDepositPaidTotal = summaryRegistrations.filter((registration) => (
    registration.status === 'deposit_paid' ||
    registration.status === 'main_invoice_pending' ||
    registration.status === 'completed'
  )).length;
  const summaryCompletedTotal = summaryRegistrations.filter((registration) => registration.status === 'completed').length;
  const summaryCancelledTotal = summaryRegistrations.filter((registration) => registration.status === 'cancelled').length;
  const sortBy = (field: ParticipantListSortField) => setSort((current) => ({
    field,
    direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc'
  }));
  const sortChartFilterBy = (field: ParticipantListSortField) => setChartFilterSort((current) => ({
    field,
    direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc'
  }));
  const openChartFilter = (title: string, matches: ChartFilter['matches']) => {
    setChartFilter({ title, matches });
    setChartFilterListOpen(true);
  };
  const sendChartFilterMessage = () => {
    if (source) {
      source.onSendFiltered?.(chartFilterRows.map((row) => row.id));
      return;
    }
    if (!eventData || chartFilterRows.length === 0) return;
    const includedRegistrationIds = chartFilterRows
      .filter((row) => !isStaff(row.profile))
      .map((row) => row.registration.id);
    const includedSet = new Set(includedRegistrationIds);
    navigate(`/events/${eventData.id}/comms`, {
      state: {
        includedRegistrationIds,
        excludedRegistrationIds: registrations.filter((registration) => !includedSet.has(registration.id)).map((registration) => registration.id)
      }
    });
  };
  const canSendChartFilterMessage = chartFilterRows.length > 0;

  const isSharedStats = Boolean(source);
  const sourceLoading = source?.loading ?? loading;
  const sourceError = source?.error ?? error;
  if (sourceLoading) return <p className="muted">Loading participants…</p>;
  if (sourceError) return <p className="error-text">{sourceError}</p>;
  if (!source && !eventData) return <p className="muted">Event not found.</p>;

  const maxJumpBucketCount = Math.max(...jumpCountBuckets.map((item) => item.count), 1);
  const maxRecentJumpBucketCount = Math.max(...recentJumpBuckets.map((item) => item.count), 1);
  const maxYearsInSportBucketCount = Math.max(...yearsInSportBuckets.map((item) => item.count), 1);
  const maxWingloadBucketCount = Math.max(...wingloadBuckets.map((item) => item.count), 1);
  const maxLicenseCount = Math.max(...licenseCounts.map((item) => item.count), 1);
  const maxDisciplineCount = Math.max(...disciplineCounts.map((item) => item.count), 1);
  const maxRatingCount = Math.max(...ratingCounts.map((item) => item.count), 1);
  const packerTotal = packerCounts.reduce((sum, item) => sum + item.count, 0);
  const maxCanopyCourseCount = Math.max(...canopyCourseCounts.map((item) => item.count), 1);
  const maxOtherAirSportCount = Math.max(...otherAirSportCounts.map((item) => item.count), 1);
  const landingAreaPreferenceTotal = landingAreaPreferenceCounts.reduce((sum, item) => sum + item.count, 0);
  const maxAgeBucketCount = Math.max(...ageBuckets.map((item) => item.count), 1);
  const medicalExpertiseTotal = medicalExpertiseCounts.reduce((sum, item) => sum + item.count, 0);
  const accommodationTotal = accommodationCounts.reduce((sum, item) => sum + item.count, 0);
  const maxDietaryRestrictionCount = Math.max(...dietaryRestrictionCounts.map((item) => item.count), 1);
  const maxHssQualityCount = Math.max(...hssQualityCounts.map((item) => item.count), 1);
  const maxHssCheckedCount = Math.max(...hssCheckedCountBuckets.map((item) => item.count), 1);
  const profileCompletionCounts: ChartDatum[] = [
    { label: 'Profiles complete', count: profilesCompleteTotal },
    { label: 'Profiles incomplete', count: activeTotal - profilesCompleteTotal }
  ];
  const renderChartBars = (
    items: ChartDatum[],
    maximum: number,
    onSelect: (label: string) => void,
    colorForIndex?: (index: number) => string
  ) => <div className="event-participants-bars">{items.map((item, index) => (
    <button className={`event-participants-chart-filter${item.label === 'N/A' ? ' is-not-applicable' : ''}`} type="button" key={item.label} onClick={() => onSelect(item.label)}>
      <span className="registration-stat-label">{item.label}</span>
      <div><i style={{ width: `${item.count / maximum * 100}%`, background: item.label === 'N/A' ? notApplicableChartColor : colorForIndex?.(index) }} /></div>
      <strong>{item.count}</strong>
    </button>
  ))}</div>;
  return (
    <section className="stack event-participants-page">
      {!isSharedStats ? <header className="page-header">
        <EventPageTitle event={eventData!} section="Roster" showSlotsBadge />
        <EventGearMenu eventId={eventData!.id} currentPage="participants" menuId="event-participants-actions-menu" />
      </header> : null}

      <div className={!isSharedStats ? 'event-participants-controls' : undefined}>
        {!isSharedStats ? <div className="event-participants-scope" role="tablist" aria-label="Roster view">
          <button type="button" role="tab" aria-selected={rosterView === 'list'} className={rosterView === 'list' ? 'active' : ''} onClick={() => setRosterView('list')}>List</button>
          <button type="button" role="tab" aria-selected={rosterView === 'stats'} className={rosterView === 'stats' ? 'active' : ''} onClick={() => setRosterView('stats')}>Statistics</button>
        </div> : null}
        <div className="event-participants-scope" role="tablist" aria-label="Participant audience">
          <button type="button" role="tab" aria-selected={participantScope === 'participants'} className={participantScope === 'participants' ? 'active' : ''} onClick={() => setParticipantScope('participants')}>
            Participants <span>{allRows.filter((row) => !isStaff(row.profile)).length}</span>
          </button>
          <button type="button" role="tab" aria-selected={participantScope === 'staff'} className={participantScope === 'staff' ? 'active' : ''} onClick={() => setParticipantScope('staff')}>
            Staff <span>{allRows.filter((row) => isStaff(row.profile)).length}</span>
          </button>
        </div>
      </div>

      {(isSharedStats || rosterView === 'stats') && <>
      <div className="event-participants-summary" aria-label="Participant summary">
        <article className="card event-participants-summary-card">
          <div className="event-participants-total-card event-participants-primary-card"><span className="registration-stat-label">Registrations</span><button className="event-participants-summary-total" type="button" onClick={() => openChartFilter('Active registrations', (row) => activeStatuses.has(row.registration.status))} aria-label={`Show ${summaryActiveTotal} active registrations`}><strong>{summaryActiveTotal}</strong></button></div>
          <div className="event-participants-status-summary">
            <div className="event-participants-total-card"><span className="registration-stat-label">Deposit</span><button className="event-participants-summary-total" type="button" onClick={() => openChartFilter('Deposit paid', (row) => row.registration.status === 'deposit_paid' || row.registration.status === 'main_invoice_pending' || row.registration.status === 'completed')} aria-label={`Show ${summaryDepositPaidTotal} registrations with deposit paid`}><strong>{summaryDepositPaidTotal}</strong></button></div>
            <div className="event-participants-total-card"><span className="registration-stat-label">Full</span><button className="event-participants-summary-total" type="button" onClick={() => openChartFilter('Completed registrations', (row) => row.registration.status === 'completed')} aria-label={`Show ${summaryCompletedTotal} completed registrations`}><strong>{summaryCompletedTotal}</strong></button></div>
            <div className="event-participants-total-card"><span className="registration-stat-label">Canceled</span><button className="event-participants-summary-total" type="button" onClick={() => openChartFilter('Canceled registrations', (row) => row.registration.status === 'cancelled')} aria-label={`Show ${summaryCancelledTotal} canceled registrations`}><strong>{summaryCancelledTotal}</strong></button></div>
          </div>
        </article>
        <article className="card event-participants-total-card event-participants-profile-completion-card">
          <span className="registration-stat-label">Profiles complete</span>
          <InteractiveDonut
            segments={profileCompletionCounts}
            colors={['#2563eb', 'rgba(148, 163, 184, 0.25)']}
            ariaLabel={`${profilesCompleteTotal} of ${activeTotal} active registrations have complete profiles`}
            onSelect={(label) => openChartFilter(label, (row) => activeStatuses.has(row.registration.status) && (label === 'Profiles complete' ? Boolean(row.profile && isProfileCompleteForRegistration(row.profile)) : !row.profile || !isProfileCompleteForRegistration(row.profile)))}
          >
            <strong>{profilesCompleteTotal}/{activeTotal}</strong>
          </InteractiveDonut>
        </article>
        <article className="card event-participants-chart-card event-participants-type-chart-card">
          <InteractiveDonutWithLegend segments={participantTypeCounts} colors={['#2b8a3e', '#d97706']} ariaLabel={`${participantTypeCounts[0].count} skydivers and ${participantTypeCounts[1].count} non-jumpers`} onSelect={(label) => openChartFilter(label, (row) => activeStatuses.has(row.registration.status) && (label === 'Skydivers' ? isSkydiver(row.profile) : !isSkydiver(row.profile)))} />
        </article>
      </div>

      <article className="card event-participants-skydiving-card">
        <header className="card-header event-detail-section-header" onClick={() => setSkydivingOpen((open) => !open)}>
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              aria-label={`${skydivingOpen ? 'Collapse' : 'Expand'} Skydiving`}
              aria-expanded={skydivingOpen}
              aria-controls="event-participants-skydiving-charts"
              onClick={(event) => {
                event.stopPropagation();
                setSkydivingOpen((open) => !open);
              }}
            >
              {skydivingOpen ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Skydiving</h3>
          </div>
        </header>
        {skydivingOpen ? <div id="event-participants-skydiving-charts" className="event-participants-charts">
        <article className="card event-participants-chart-card event-participants-license-card event-participants-distribution-card">
          <h3 className="registration-stat-label">License</h3>
          {renderChartBars(licenseCounts, maxLicenseCount, (label) => openChartFilter(`License: ${label}`, (row) => {
            if (!activeStatuses.has(row.registration.status)) return false;
            if (label === 'Non-jumper') return !isSkydiver(row.profile);
            if (!isSkydiver(row.profile)) return false;
            const license = row.profile?.license?.trim().toUpperCase();
            return label === 'N/A' ? !license || !['A', 'B', 'C', 'D'].includes(license) : license === label;
          }), (index) => chartPalette[index])}
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Wingload</h3>
          {renderChartBars(wingloadBuckets, maxWingloadBucketCount, (label) => openChartFilter(`Wingload: ${label}`, (row) => {
            const bucket = wingloadBuckets.find((item) => item.label === label);
            const wingload = Number.parseFloat(row.profile?.wingload?.replace(',', '.') || '');
            if (!bucket || !activeStatuses.has(row.registration.status) || !isSkydiver(row.profile)) return false;
            if (label === 'N/A') return !Number.isFinite(wingload) || !wingloadBuckets.slice(0, -1).some((item) => wingload >= item.min && wingload <= item.max);
            return Number.isFinite(wingload) && wingload >= bucket.min && wingload <= bucket.max;
          }))}
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Number of jumps</h3>
          {renderChartBars(jumpCountBuckets, maxJumpBucketCount, (label) => openChartFilter(`Number of jumps: ${label}`, (row) => {
            const bucket = jumpCountBuckets.find((item) => item.label === label);
            const jumpCount = row.profile?.jump_count;
            if (!bucket || !activeStatuses.has(row.registration.status)) return false;
            if (label === 'N/A') return typeof jumpCount !== 'number' || !jumpCountBuckets.slice(0, -1).some((item) => jumpCount >= item.min && jumpCount <= item.max);
            return typeof jumpCount === 'number' && jumpCount >= bucket.min && jumpCount <= bucket.max;
          }))}
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Jumps last 3 months</h3>
          {renderChartBars(recentJumpBuckets, maxRecentJumpBucketCount, (label) => openChartFilter(`Jumps last 3 months: ${label}`, (row) => {
            const bucket = recentJumpBuckets.find((item) => item.label === label);
            const jumpCount = row.profile?.recent_jump_count;
            if (!bucket || !activeStatuses.has(row.registration.status)) return false;
            if (label === 'N/A') return typeof jumpCount !== 'number' || !recentJumpBuckets.slice(0, -1).some((item) => jumpCount >= item.min && jumpCount <= item.max);
            return typeof jumpCount === 'number' && jumpCount >= bucket.min && jumpCount <= bucket.max;
          }))}
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Years in the sport</h3>
          {renderChartBars(yearsInSportBuckets, maxYearsInSportBucketCount, (label) => openChartFilter(`Years in the sport: ${label}`, (row) => {
            const bucket = yearsInSportBuckets.find((item) => item.label === label);
            const years = row.profile?.years_in_sport;
            if (!bucket || !activeStatuses.has(row.registration.status)) return false;
            if (label === 'N/A') return typeof years !== 'number' || !yearsInSportBuckets.slice(0, -1).some((item) => years >= item.min && years <= item.max);
            return typeof years === 'number' && years >= bucket.min && years <= bucket.max;
          }))}
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Disciplines</h3>
          {renderChartBars(disciplineCounts, maxDisciplineCount, (label) => openChartFilter(`Discipline: ${label}`, (row) => {
            if (!activeStatuses.has(row.registration.status) || !isSkydiver(row.profile)) return false;
            const disciplines = (row.profile?.disciplines || []).map((discipline) => discipline.trim()).filter(Boolean);
            return label === 'N/A' ? disciplines.length === 0 : disciplines.includes(label);
          }), (index) => chartPalette[index % chartPalette.length])}
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Ratings</h3>
          {renderChartBars(ratingCounts, maxRatingCount, (label) => openChartFilter(`Rating: ${label}`, (row) => activeStatuses.has(row.registration.status) && isSkydiver(row.profile) && row.profile?.ratings.includes(label) === true), (index) => chartPalette[index % chartPalette.length])}
        </article>
        <article className="card event-participants-chart-card event-participants-choice-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Landing area preference</h3>
          <InteractiveDonutWithLegend segments={landingAreaPreferenceCounts} colors={chartPalette} ariaLabel={`${landingAreaPreferenceTotal} skydivers by landing area preference`} onSelect={(label) => openChartFilter(`Landing area preference: ${label}`, (row) => {
              if (!activeStatuses.has(row.registration.status) || !isSkydiver(row.profile)) return false;
              const preference = row.profile?.landing_area_preference?.trim();
              return label === 'N/A' ? !preference || !landingAreaPreferenceOptions.includes(preference as typeof landingAreaPreferenceOptions[number]) : preference === label;
            })} />
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Canopy course</h3>
          {renderChartBars(canopyCourseCounts, maxCanopyCourseCount, (label) => openChartFilter(`Canopy course: ${label}`, (row) => {
            if (!activeStatuses.has(row.registration.status) || !isSkydiver(row.profile)) return false;
            const course = row.profile?.canopy_course?.trim();
            const matchingOption = canopyCourseOptions.find((option) => canopyCourseChartLabels[option] === label);
            return label === 'N/A' ? !course || !canopyCourseOptions.includes(course as typeof canopyCourseOptions[number]) : course === matchingOption;
          }))}
        </article>
        <article className="card event-participants-chart-card event-participants-choice-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Packer</h3>
          <InteractiveDonutWithLegend segments={packerCounts} colors={chartPalette} ariaLabel={`${packerTotal} skydivers by packer preference`} onSelect={(label) => openChartFilter(`Packer: ${label}`, (row) => {
              if (!activeStatuses.has(row.registration.status) || !isSkydiver(row.profile)) return false;
              const preference = row.profile?.uses_packer?.trim();
              return label === 'N/A' ? !preference || !usesPackerOptions.includes(preference as typeof usesPackerOptions[number]) : preference === label;
            })} />
        </article>
        <article className="card event-participants-chart-card event-participants-distribution-card">
          <h3 className="registration-stat-label">Other air sports</h3>
          {renderChartBars(otherAirSportCounts, maxOtherAirSportCount, (label) => openChartFilter(`Other air sport: ${label}`, (row) => activeStatuses.has(row.registration.status) && row.profile?.other_air_sports.includes(label) === true))}
        </article>
        </div> : null}
      </article>

      <article className="card event-participants-general-info-card">
        <header className="card-header event-detail-section-header" onClick={() => setGeneralInfoOpen((open) => !open)}>
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              aria-label={`${generalInfoOpen ? 'Collapse' : 'Expand'} General Info`}
              aria-expanded={generalInfoOpen}
              aria-controls="event-participants-general-info-charts"
              onClick={(event) => {
                event.stopPropagation();
                setGeneralInfoOpen((open) => !open);
              }}
            >
              {generalInfoOpen ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">General Info</h3>
          </div>
        </header>
        {generalInfoOpen ? <div id="event-participants-general-info-charts" className="event-participants-charts">
          <article className="card event-participants-chart-card event-participants-citizenship-card">
            <span className="registration-stat-label">Countries</span>
            <strong className="event-participants-citizenship-total">{citizenshipCounts.filter((item) => item.key !== 'n/a').length}</strong>
            <div className={`event-participants-citizenship-list country-count-${Math.min(citizenshipCounts.length, 6)}${citizenshipCounts.length > 6 ? ' is-country-list' : ''}`}>
              {citizenshipCounts.map((item) => (
                <button key={item.key} type="button" onClick={() => openChartFilter(`Citizenship: ${item.label}`, (row) => {
                  return activeStatuses.has(row.registration.status) && parseCitizenshipCountry(row.profile?.citizenship).key === item.key;
                })}>
                  <span className="event-participants-country-flag" aria-hidden="true">{item.flag}</span>
                  <span className="registration-stat-label">{item.label} ({item.count})</span>
                </button>
              ))}
            </div>
          </article>
          <article className="card event-participants-chart-card event-participants-distribution-card">
            <h3 className="registration-stat-label">Age</h3>
            {renderChartBars(ageBuckets, maxAgeBucketCount, (label) => openChartFilter(`Age: ${label}`, (row) => {
              const bucket = ageBuckets.find((item) => item.label === label);
              const birthday = row.profile?.date_of_birth ? new Date(row.profile.date_of_birth) : null;
              if (!bucket || !activeStatuses.has(row.registration.status)) return false;
              if (!birthday || Number.isNaN(birthday.getTime())) return label === 'N/A';
              const referenceDate = new Date(source?.referenceDate || eventData?.starts_at || Date.now());
              let age = referenceDate.getUTCFullYear() - birthday.getUTCFullYear();
              const monthDifference = referenceDate.getUTCMonth() - birthday.getUTCMonth();
              if (monthDifference < 0 || (monthDifference === 0 && referenceDate.getUTCDate() < birthday.getUTCDate())) age -= 1;
              if (label === 'N/A') return !ageBuckets.some((item) => item.label !== 'N/A' && age >= item.min && age <= item.max);
              return age >= bucket.min && age <= bucket.max;
            }))}
          </article>
          <article className="card event-participants-chart-card event-participants-choice-card event-participants-distribution-card">
            <h3 className="registration-stat-label">Medical expertise</h3>
            <InteractiveDonutWithLegend segments={medicalExpertiseCounts} colors={chartPalette} ariaLabel={`${medicalExpertiseTotal} medical expertise records`} onSelect={(label) => openChartFilter(`Medical expertise: ${label}`, (row) => {
                if (!activeStatuses.has(row.registration.status)) return false;
                const expertise = row.profile?.medical_expertise || [];
                if (label === 'None') return expertise.length === 0;
                return expertise.includes(label === 'First aid' ? 'First aid certified' : label);
              })} />
          </article>
        </div> : null}
      </article>

      <article className="card event-participants-meals-accommodation-card">
        <header className="card-header event-detail-section-header" onClick={() => setMealsAccommodationOpen((open) => !open)}>
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              aria-label={`${mealsAccommodationOpen ? 'Collapse' : 'Expand'} Meals and accommodation`}
              aria-expanded={mealsAccommodationOpen}
              aria-controls="event-participants-meals-accommodation-charts"
              onClick={(event) => {
                event.stopPropagation();
                setMealsAccommodationOpen((open) => !open);
              }}
            >
              {mealsAccommodationOpen ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Meals &amp; Accommodation</h3>
          </div>
        </header>
        {mealsAccommodationOpen ? <div id="event-participants-meals-accommodation-charts" className="event-participants-charts">
          <article className="card event-participants-chart-card event-participants-choice-card event-participants-distribution-card">
            <h3 className="registration-stat-label">Accommodation</h3>
            <InteractiveDonutWithLegend segments={accommodationCounts} colors={chartPalette} ariaLabel={`${accommodationTotal} participants by accommodation`} onSelect={(label) => openChartFilter(`Accommodation: ${label}`, (row) => {
                if (!activeStatuses.has(row.registration.status)) return false;
                const accommodation = row.profile?.accommodation?.trim();
                const selected = accommodationCounts.find((item) => item.label === label);
                return label === 'N/A' ? !accommodation || !accommodationOptions.includes(accommodation as typeof accommodationOptions[number]) : accommodation === selected?.value;
              })} />
          </article>
          <article className="card event-participants-chart-card event-participants-distribution-card event-participants-dietary-card">
            <h3 className="registration-stat-label">Dietary restrictions</h3>
            {renderChartBars(dietaryRestrictionCounts, maxDietaryRestrictionCount, (label) => openChartFilter(`Dietary restriction: ${label}`, (row) => {
              if (!activeStatuses.has(row.registration.status)) return false;
              const restrictions = row.profile?.dietary_restrictions || [];
              return label === 'N/A'
                ? !dietaryRestrictionOptions.some((option) => restrictions.includes(option))
                : restrictions.includes(label);
            }))}
          </article>
        </div> : null}
      </article>

      <article className="card event-participants-hss-card">
        <header className="card-header event-detail-section-header" onClick={() => setHssQualitiesOpen((open) => !open)}>
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              aria-label={`${hssQualitiesOpen ? 'Collapse' : 'Expand'} High Sensation Seeker Qualities`}
              aria-expanded={hssQualitiesOpen}
              aria-controls="event-participants-hss-charts"
              onClick={(event) => {
                event.stopPropagation();
                setHssQualitiesOpen((open) => !open);
              }}
            >
              {hssQualitiesOpen ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">High Sensation Seeker Qualities</h3>
          </div>
        </header>
        {hssQualitiesOpen ? <div id="event-participants-hss-charts" className="event-participants-charts event-participants-hss-charts">
          <article className="card event-participants-chart-card event-participants-distribution-card event-participants-hss-options-card">
            <h3 className="registration-stat-label">Qualities</h3>
            {renderChartBars(hssQualityCounts, maxHssQualityCount, (label) => openChartFilter(`High Sensation Seeker: ${label}`, (row) => activeStatuses.has(row.registration.status) && row.profile?.hss_qualities.includes(label) === true))}
          </article>
          <article className="card event-participants-chart-card event-participants-distribution-card event-participants-hss-count-card">
            <h3 className="registration-stat-label">Number of checked qualities</h3>
            {renderChartBars(hssCheckedCountBuckets, maxHssCheckedCount, (label) => openChartFilter(`${label} checked qualities`, (row) => activeStatuses.has(row.registration.status) && (row.profile?.hss_qualities.length || 0) === Number(label)))}
          </article>
        </div> : null}
      </article>
      </>}

      {(isSharedStats || rosterView === 'list') &&
      <ParticipantList
        title={isSharedStats ? 'Matching participants' : 'Registered participants'}
        singular="participant"
        people={visibleRows}
        open={listOpen}
        onToggle={() => setListOpen((open) => !open)}
        sort={sort}
        onSort={sortBy}
        participantLink={(participant) => `/participants/${participant.id}`}
        renderName={(name) => name}
        countLabel={isSharedStats ? `${activeTotal} matching participants` : `${activeTotal} active registrations`}
        toolbar={(
          <div className="form-grid event-participants-filters participant-list-toolbar">
            <label className="form-field"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" /></label>
            {!isSharedStats ? <label className="form-field"><span>Registration status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | RegistrationStatus)}><option value="all">All statuses</option>{statusCounts.filter((item) => item.count > 0).map((item) => <option key={item.status} value={item.status}>{item.label}</option>)}</select></label> : null}
          </div>
        )}
        thirdColumnLabel="Status"
        thirdColumnSortable={false}
        renderThirdColumn={(participant) => <span className={statusBadgeClass((participant as ParticipantRow).registration.status)}>{statusLabels[(participant as ParticipantRow).registration.status]}</span>}
      />}
      {chartFilter && typeof document !== 'undefined' ? createPortal(
        <div className="event-participants-filter-overlay" role="presentation" onClick={() => setChartFilter(null)}>
          <section className="event-participants-filter-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="event-participants-filter-overlay-title" onClick={(event) => event.stopPropagation()}>
            <header className="event-participants-filter-overlay-header">
              <h2 id="event-participants-filter-overlay-title">{chartFilter.title}</h2>
              <button className="overlay-close-button" type="button" aria-label="Close filtered participants" onClick={() => setChartFilter(null)}>×</button>
            </header>
            <ParticipantList
              title="Matching participants"
              singular="participant"
              people={chartFilterRows}
              open={chartFilterListOpen}
              onToggle={() => setChartFilterListOpen((open) => !open)}
              sort={chartFilterSort}
              onSort={sortChartFilterBy}
              participantLink={(participant) => `/participants/${participant.id}`}
              countLabel={`${chartFilterRows.length} matching participants`}
              headerAction={!isSharedStats || source?.onSendFiltered ? <button className="primary" type="button" disabled={!canSendChartFilterMessage} onClick={(event) => { event.stopPropagation(); sendChartFilterMessage(); }}>Send Email</button> : null}
              thirdColumnLabel="Status"
              thirdColumnSortable={false}
              renderThirdColumn={(participant) => <span className={statusBadgeClass((participant as ParticipantRow).registration.status)}>{statusLabels[(participant as ParticipantRow).registration.status]}</span>}
            />
          </section>
        </div>, document.body
      ) : null}
    </section>
  );
};

const EventParticipantsPage = () => <ParticipantRosterStats />;

export default EventParticipantsPage;
