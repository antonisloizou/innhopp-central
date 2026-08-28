import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canUseStaffMapsActions, isParticipantOnlySession } from '../auth/access';
import { ChecklistStatusTag } from '../components/ChecklistStatusTag';
import EventGearMenu from '../components/EventGearMenu';
import ScheduleEntryPreviewOverlay from '../components/ScheduleEntryPreviewOverlay';
import { ScheduleEntry } from '../components/schedulePreviewTypes';
import { Event, getEvent, getInnhopp, listEvents } from '../api/events';
import { listAirfields } from '../api/airfields';
import { getInnhoppAircraftWarning } from '../utils/innhoppAircraftWarnings';
import { isInnhoppReady } from '../utils/innhoppReadiness';
import { parseEventLocal } from '../utils/eventDate';
import {
  ChecklistHistoryEvent,
  ChecklistInnhopp,
  ChecklistPhase,
  ChecklistRole,
  InnhoppChecklist,
  completeChecklistItem,
  completeInnhoppOperation,
  createChecklistOverride,
  getChecklist,
  getChecklistHistory,
  listChecklistInnhopps,
  proceedWithInnhopp,
  resetOperationalChecks,
  reverseChecklistItem
} from '../api/checklists';

const roleLabels: Record<ChecklistRole, string> = {
  jump_leader: 'Jump Leader',
  jump_master: 'Jump Master',
  ground_crew: 'Ground Crew',
  boat_crew: 'Boat Crew'
};

const phaseLabels: Record<ChecklistPhase, string> = {
  readiness: 'Before take-off',
  execution: 'During operation',
  closeout: 'After landing'
};

const isChecklistRole = (value: string | null): value is ChecklistRole =>
  value === 'jump_leader' || value === 'jump_master' || value === 'ground_crew' || value === 'boat_crew';

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const historyActionPrefix = (action: ChecklistHistoryEvent['action']) =>
  action === 'completed' ? '' : action === 'overridden' ? 'Override created: ' : action === 'reset' ? '' : 'Reversed: ';

const isPastEvent = (event: Event) => {
  if (event.status === 'past') return true;
  const endsAt = parseEventLocal(event.ends_at) ?? parseEventLocal(event.starts_at);
  return endsAt ? endsAt.getTime() < Date.now() : false;
};

const compareEventsByStartDateAscending = (left: Event, right: Event) =>
  (parseEventLocal(left.starts_at)?.getTime() ?? 0) - (parseEventLocal(right.starts_at)?.getTime() ?? 0);

export default function ChecklistsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(eventId ? Number(eventId) : 0);
  const [innhopps, setInnhopps] = useState<ChecklistInnhopp[]>([]);
  const [selectedInnhoppId, setSelectedInnhoppId] = useState(() => Number(searchParams.get('innhopp')) || 0);
  const selectedRoleParam = searchParams.get('role');
  const [role, setRole] = useState<ChecklistRole>(() => isChecklistRole(selectedRoleParam) ? selectedRoleParam : 'jump_leader');
  const [checklist, setChecklist] = useState<InnhoppChecklist | null>(null);
  const [roleChecklists, setRoleChecklists] = useState<InnhoppChecklist[]>([]);
  const [history, setHistory] = useState<ChecklistHistoryEvent[]>([]);
  const [error, setError] = useState('');
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<number | null>(null);
  const [previewEntry, setPreviewEntry] = useState<ScheduleEntry | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [reverseItem, setReverseItem] = useState<{ id: number; label: string } | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const canReverse = !!user?.roles.some((item) => ['admin', 'staff', 'jump_master', 'jump_leader', 'ground_crew', 'boat_crew'].includes(item));
  const canOverride = !!user?.roles.some((item) => ['admin', 'staff', 'jump_master'].includes(item));
  const canReset = !!user?.roles.some((item) => ['admin', 'staff'].includes(item));
  const canOpenMapsActions = canUseStaffMapsActions(user);
  const participantOnly = isParticipantOnlySession(user);

  const loadInnhopps = useCallback(async () => {
    if (selectedEventId) setInnhopps(await listChecklistInnhopps(selectedEventId));
  }, [selectedEventId]);

  const loadChecklist = useCallback(async (innhoppId: number, selectedRole: ChecklistRole) => {
    const nextChecklist = await getChecklist(innhoppId, selectedRole);
    setChecklist(nextChecklist);
    setRoleChecklists(await Promise.all(nextChecklist.required_roles.map((requiredRole) => getChecklist(innhoppId, requiredRole))));
  }, []);

  const refresh = async () => {
    if (selectedInnhoppId) await loadChecklist(selectedInnhoppId, role);
    await loadInnhopps();
  };

  useEffect(() => {
    listEvents().then(setEvents).catch((loadError: Error) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    void loadInnhopps().catch((loadError: Error) => setError(loadError.message));
  }, [selectedEventId, loadInnhopps]);

  useEffect(() => {
    const innhoppId = Number(searchParams.get('innhopp')) || 0;
    const nextRole = searchParams.get('role');
    if (innhoppId !== selectedInnhoppId) setSelectedInnhoppId(innhoppId);
    if (isChecklistRole(nextRole) && nextRole !== role) setRole(nextRole);
  }, [role, searchParams, selectedInnhoppId]);

  useEffect(() => {
    if (selectedInnhoppId) void loadChecklist(selectedInnhoppId, role).catch((loadError: Error) => setError(loadError.message));
  }, [selectedInnhoppId, role, loadChecklist]);

  useEffect(() => {
    if (selectedInnhoppId && canReverse) void getChecklistHistory(selectedInnhoppId).then(setHistory).catch(() => {});
  }, [selectedInnhoppId, checklist, canReverse]);

  const perform = async (itemId: number, action: () => Promise<unknown>, onSuccess?: () => void) => {
    setPendingItemId(itemId);
    try {
      await action();
      await refresh();
      onSuccess?.();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setPendingItemId(null);
    }
  };

  const openInnhoppDetails = async () => {
    if (!selectedInnhoppId || !selectedEventId) return;
    try {
      const [innhopp, event, airfields] = await Promise.all([
        getInnhopp(selectedInnhoppId),
        getEvent(selectedEventId),
        listAirfields()
      ]);
      const takeoff = airfields.find((airfield) => airfield.id === innhopp.takeoff_airfield_id);
      const landing = airfields.find((airfield) => airfield.id === innhopp.landing_airfield_id);
      const aircraft = innhopp.aircraft_id ? event.aircraft.find((item) => item.id === innhopp.aircraft_id) : undefined;
      const landingName = landing?.name || ((innhopp.landing_airfield_id == null || innhopp.landing_airfield_id === innhopp.takeoff_airfield_id) ? takeoff?.name || null : null);
      const elevationDiff = typeof innhopp.elevation === 'number' && typeof takeoff?.elevation === 'number'
        ? innhopp.elevation - takeoff.elevation
        : null;
      setPreviewEntry({
        id: `i-${innhopp.id}`,
        hourKey: '',
        sortValue: 0,
        title: `Innhopp #${innhopp.sequence}: ${innhopp.name}`,
        type: 'Innhopp',
        to: participantOnly ? undefined : `/events/${event.id}/innhopps/${innhopp.id}`,
        ready: isInnhoppReady(innhopp),
        innhoppElevation: innhopp.elevation ?? null,
        innhoppCoordinates: innhopp.coordinates || null,
        innhoppTakeoffName: takeoff?.name || null,
        innhoppLandingName: landingName,
        innhoppAircraftName: aircraft?.name || null,
        innhoppDistanceByAir: innhopp.distance_by_air ?? null,
        innhoppAircraftSpeedKmh: aircraft?.cruising_speed_kmh ?? null,
        innhoppMinimumLoadDuration: aircraft?.minimum_load_duration ?? null,
        innhoppAircraftWarning: getInnhoppAircraftWarning(innhopp, event.aircraft),
        innhoppElevationDiff: elevationDiff,
        innhoppPrimaryName: innhopp.primary_landing_area?.name || null,
        innhoppPrimarySize: innhopp.primary_landing_area?.size || null,
        innhoppSecondaryName: innhopp.secondary_landing_area?.name || null,
        innhoppSecondarySize: innhopp.secondary_landing_area?.size || null,
        innhoppRisk: innhopp.risk_assessment || null,
        innhoppMinimumRequirements: innhopp.minimum_requirements || null,
        notes: innhopp.notes || null,
        scheduledAt: innhopp.scheduled_at
      });
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  };

  const activePhases: ChecklistPhase[] = checklist?.operational_status === 'proceeding'
    ? ['execution', 'closeout']
    : ['readiness'];
  const phaseOrder: ChecklistPhase[] = checklist?.operational_status === 'proceeding'
    ? ['execution', 'closeout', 'readiness']
    : ['readiness', 'execution', 'closeout'];
  const missingRoles = roleChecklists.filter((entry) => entry.items.some((item) => item.phase === 'readiness' && !item.completed));
  const missingItems = (entry: InnhoppChecklist) => entry.items.filter((item) => activePhases.includes(item.phase) && !item.completed);
  const highlightChecklistItem = (itemID: number) => {
    setHighlightedItemId(itemID);
    window.setTimeout(() => document.getElementById(`checklist-item-${itemID}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    window.setTimeout(() => setHighlightedItemId(null), 3000);
  };
  const focusFirstMissing = (phases: ChecklistPhase[]) => {
    const entry = roleChecklists.find((candidate) => candidate.items.some((item) => phases.includes(item.phase) && !item.completed));
    if (!entry) return false;
    setRole(entry.role);
    const item = entry.items.find((candidate) => phases.includes(candidate.phase) && !candidate.completed);
    if (item) {
      highlightChecklistItem(item.id);
    }
    return true;
  };

  const statusTag = !checklist ? null : checklist.operational_status === 'completed'
    ? <ChecklistStatusTag variant="completed" title="Innhopp completed" />
    : checklist.operational_status === 'proceeding'
      ? <ChecklistStatusTag variant="proceeding" title="Enjoy" detail="Innhopp in progress" actionLabel="Complete" onAction={() => { if (!focusFirstMissing(['closeout'])) void perform(-1, () => completeInnhoppOperation(selectedInnhoppId)); }} />
      : checklist.overridden
        ? <ChecklistStatusTag variant="overridden" title="Overridden" detail="Authorised to proceed" />
        : checklist.ready
          ? <ChecklistStatusTag variant="clear" title="Clear" detail="Pre-flight checks completed" actionLabel="Proceed" onAction={() => void perform(-1, () => proceedWithInnhopp(selectedInnhoppId))} />
          : <ChecklistStatusTag variant="blocked" title="Blocked" detail="Remove before flight" actionLabel={canOverride ? 'Override' : undefined} onAction={canOverride ? () => { const reason = window.prompt('Why may this innhopp proceed while checks are incomplete?'); if (reason) void perform(-1, () => createChecklistOverride(selectedInnhoppId, reason)); } : undefined} />;
  const statusClass = checklist?.operational_status === 'completed' ? 'completed' : checklist?.operational_status === 'proceeding' ? 'proceeding' : checklist?.overridden ? 'overridden' : checklist?.ready ? 'clear' : 'blocked';
  const statusDetail = checklist?.operational_status === 'proceeding' ? null : checklist?.operational_status === 'completed' ? 'Operation completed.' : checklist?.overridden ? `Override: ${checklist.override?.actor} · ${checklist.override?.reason}` : checklist?.ready ? 'All pre-take-off checks are complete.' : `Blocked by ${missingRoles.map((entry) => roleLabels[entry.role]).join(', ')}.`;

  return <section className="checklists-page">
    <header className="page-header">
      <h1>Operational checklists</h1>
      {selectedEventId > 0 && <EventGearMenu
        eventId={selectedEventId}
        currentPage="checklists"
        menuId="event-checklists-actions-menu"
      />}
    </header>
    {error && <p className="form-error">{error}</p>}
    <div className="card checklist-selectors">
      <label>Event<select value={selectedEventId} onChange={(event) => { const id = Number(event.target.value); setSelectedInnhoppId(0); setSearchParams({}); setSelectedEventId(id); if (id) navigate(`/events/${id}/checklists`); }}><option value={0}>Select event</option>{events.filter((event) => !isPastEvent(event)).sort(compareEventsByStartDateAscending).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
      <label>Innhopp<select value={selectedInnhoppId} onChange={(event) => { const id = Number(event.target.value); const innhopp = innhopps.find((item) => item.id === id); const nextRole = innhopp?.required_roles[0] || role; setSelectedInnhoppId(id); setRole(nextRole); setSearchParams(id ? { innhopp: String(id), role: nextRole } : {}); }}><option value={0}>Select innhopp</option>{innhopps.map((innhopp) => <option key={innhopp.id} value={innhopp.id}>#{innhopp.sequence} {innhopp.name}</option>)}</select></label>
      <label>Role<select value={role} disabled={!selectedInnhoppId} onChange={(event) => { const nextRole = event.target.value as ChecklistRole; setRole(nextRole); if (selectedInnhoppId) setSearchParams({ innhopp: String(selectedInnhoppId), role: nextRole }); }}>{checklist?.required_roles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></label>
    </div>
    {checklist && <>
      <div className={`card checklist-status ${statusClass}`}>
        {statusTag}
        {statusDetail && <span>{statusDetail}</span>}
        {canReset && <button type="button" className="ghost checklist-reset" disabled={pendingItemId !== null} onClick={() => setResetDialogOpen(true)}>Reset checks</button>}
        <button type="button" className="ghost checklist-innhopp-details" onClick={() => void openInnhoppDetails()}>Innhopp details</button>
      </div>
      <div className="checklist-role-summary">{roleChecklists.map((entry) => <button key={entry.role} className={`badge checklist-role-badge ${missingItems(entry).length ? 'danger' : 'success'}`} onClick={() => { setRole(entry.role); setSearchParams({ innhopp: String(selectedInnhoppId), role: entry.role }); }}>{roleLabels[entry.role]}: {missingItems(entry).length} missing</button>)}</div>
      {phaseOrder.map((phase) => {
        const items = checklist.items.filter((item) => item.phase === phase).sort((a, b) => Number(a.completed) - Number(b.completed));
        return items.length ? <section className="checklist-phase" key={phase}><h2>{phaseLabels[phase]}</h2>{items.map((item) => <article id={`checklist-item-${item.id}`} key={item.id} className={`card checklist-item ${item.completed ? 'completed' : 'actionable'}${highlightedItemId === item.id ? ' checklist-item--highlighted' : ''}`} onClick={() => !item.completed && void perform(item.id, () => completeChecklistItem(selectedInnhoppId, item.id, role))}><span className="checklist-mark">{item.completed ? '✓' : pendingItemId === item.id ? '…' : '○'}</span><div className="checklist-copy"><strong>{item.label}</strong>{item.detail && <p>{item.detail}</p>}{item.completed && <small>Checked by {item.checked_by}</small>}</div>{item.completed && canReverse && <button className="ghost checklist-reverse" onClick={(event) => { event.stopPropagation(); setReverseItem({ id: item.id, label: item.label }); setReverseReason(''); }}>Reverse</button>}</article>)}</section> : null;
      })}
      {canReverse && history.length > 0 && <section className="checklist-phase checklist-history"><h2>History</h2>{history.map((entry) => <p key={entry.id}><time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time> — {historyActionPrefix(entry.action)}{entry.item_label} — {entry.actor}{entry.reason ? ` (${entry.reason})` : ''}</p>)}</section>}
    </>}
    {resetDialogOpen && <div className="checklist-reset-dialog-backdrop" role="presentation" onClick={() => pendingItemId === null && setResetDialogOpen(false)}>
      <form className="card checklist-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="checklist-reset-dialog-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        void perform(-1, () => resetOperationalChecks(selectedInnhoppId, resetReason));
        setResetDialogOpen(false);
        setResetReason('');
      }}>
        <h2 id="checklist-reset-dialog-title">Reset operational checks?</h2>
        <p>Are you sure you want to reset all checks for this Innhopp?</p>
        <label>Reason<textarea value={resetReason} onChange={(event) => setResetReason(event.target.value)} rows={3} autoFocus /></label>
        <div className="checklist-reset-dialog-actions">
          <button type="button" className="ghost" disabled={pendingItemId !== null} onClick={() => { setResetDialogOpen(false); setResetReason(''); }}>Cancel</button>
          <button type="submit" disabled={pendingItemId !== null}>{pendingItemId === -1 ? 'Resetting…' : 'Reset checks'}</button>
        </div>
      </form>
    </div>}
    {reverseItem && <div className="checklist-reset-dialog-backdrop" role="presentation" onClick={() => pendingItemId === null && setReverseItem(null)}>
      <form className="card checklist-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="checklist-reverse-dialog-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        void perform(reverseItem.id, () => reverseChecklistItem(selectedInnhoppId, reverseItem.id, role, reverseReason), () => highlightChecklistItem(reverseItem.id));
        setReverseItem(null);
        setReverseReason('');
      }}>
        <h2 id="checklist-reverse-dialog-title">Reverse check?</h2>
        <p>Are you sure you want to reverse “{reverseItem.label}”?</p>
        <label>Reason<textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={3} autoFocus /></label>
        <div className="checklist-reset-dialog-actions">
          <button type="button" className="ghost" disabled={pendingItemId !== null} onClick={() => { setReverseItem(null); setReverseReason(''); }}>Cancel</button>
          <button type="submit" disabled={pendingItemId !== null}>{pendingItemId === reverseItem.id ? 'Reversing…' : 'Reverse check'}</button>
        </div>
      </form>
    </div>}
    {previewEntry && <ScheduleEntryPreviewOverlay
      entry={previewEntry}
      closing={false}
      onClose={() => setPreviewEntry(null)}
      canOpenMapsActions={canOpenMapsActions}
      typeBadgeClassNames={{
        Innhopp: 'schedule-type-badge schedule-type-badge--innhopp',
        Transport: 'schedule-type-badge schedule-type-badge--transport',
        'Ground Crew': 'schedule-type-badge schedule-type-badge--ground-crew',
        Accommodation: 'schedule-type-badge schedule-type-badge--accommodation',
        Meal: 'schedule-type-badge schedule-type-badge--meal',
        Other: 'schedule-type-badge schedule-type-badge--other'
      }}
      onNavigateToEntry={(entry) => {
        if (entry.to) {
          navigate(entry.to, {
            state: { returnTo: `/events/${selectedEventId}/checklists?innhopp=${selectedInnhoppId}&role=${role}` }
          });
        }
      }}
    />}
  </section>;
}
