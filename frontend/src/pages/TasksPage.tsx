import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Event as EventRecord, listEventSummaries } from '../api/events';
import {
  Task, TaskAssignee, TaskAuditEvent, TaskComment, TaskInput, addTaskComment, completeTask,
  createTask, deleteTask, getTask, listTaskAssignees, listTaskAudit, listTaskComments,
  listTasks, markTaskNotificationsRead, reopenTask, restoreTask, updateTask
} from '../api/tasks';
import EventGearMenu from '../components/EventGearMenu';
import EventPageTitle from '../components/EventPageTitle';
import { useResourceStream } from '../hooks/useResourceStream';

type FormState = { event_id: string; title: string; description: string; assignee_account_id: string; due_on: string };
const blankForm = (eventId?: number): FormState => ({ event_id: eventId ? String(eventId) : '', title: '', description: '', assignee_account_id: '', due_on: '' });
const staffRoles: Record<string, string> = { admin: 'Admin', staff: 'Staff', jump_master: 'Jump Master', jump_leader: 'Jump Leader', ground_crew: 'Ground Crew', boat_crew: 'Boat Crew', driver: 'Driver', packer: 'Packer' };
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const dateOnly = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'No due date';

const TasksPage = () => {
  const { eventId: routeEventId } = useParams();
  const lockedEventId = routeEventId ? Number(routeEventId) : undefined;
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(blankForm(lockedEventId));
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [audit, setAudit] = useState<TaskAuditEvent[] | null>(null);
  const [comment, setComment] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);

  const eventFilter = lockedEventId ? String(lockedEventId) : (params.get('eventId') || '');
  const stateFilter = params.get('state') || 'active';
  const assigneeFilter = params.get('assignee') || '';
  const search = params.get('q') || '';
  const selectedId = Number(params.get('taskId') || 0);
  const lockedEvent = events.find((event) => event.id === lockedEventId);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (key !== 'taskId') {
      next.delete('taskId');
      setSelected(null);
      setComments([]);
      setAudit(null);
      setComment('');
    }
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const loadList = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setTasks(await listTasks({ eventId: eventFilter ? Number(eventFilter) : undefined, state: stateFilter, assignee: assigneeFilter || undefined, q: search || undefined }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load tasks.'); }
    finally { setLoading(false); }
  }, [eventFilter, stateFilter, assigneeFilter, search]);

  useEffect(() => { Promise.all([listEventSummaries(), listTaskAssignees()]).then(([eventRows, staff]) => { setEvents(eventRows); setAssignees(staff); }).catch(() => setError('Failed to load task options.')); }, []);
  useEffect(() => { void loadList(); }, [loadList]);
  useResourceStream({
    path: '/tasks/stream',
    event: 'task.updated',
    onMessage: () => {
      void loadList();
      if (selectedId) {
        void Promise.all([getTask(selectedId), listTaskComments(selectedId)]).then(([task, rows]) => {
          setSelected(task);
          setComments(rows);
          setAudit(null);
        }).catch(() => undefined);
      }
      window.dispatchEvent(new Event('tasks-notifications-changed'));
    }
  });
  useEffect(() => {
    const refresh = () => void loadList();
    window.addEventListener('tasks-notifications-changed', refresh);
    return () => window.removeEventListener('tasks-notifications-changed', refresh);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) { setSelected(null); setComments([]); setAudit(null); return; }
    let cancelled = false;
    Promise.all([getTask(selectedId), listTaskComments(selectedId)]).then(async ([task, rows]) => {
      if (cancelled) return;
      setSelected(task); setComments(rows); setAudit(null);
      if (task.has_unread_notification) {
        await markTaskNotificationsRead(task.id).catch(() => undefined);
        if (!cancelled) {
          setSelected((current) => current ? { ...current, has_unread_notification: false } : current);
          setTasks((current) => current.map((item) => item.id === task.id ? { ...item, has_unread_notification: false } : item));
          window.dispatchEvent(new Event('tasks-notifications-changed'));
        }
      }
    }).catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load task.'));
    return () => { cancelled = true; };
  }, [selectedId]);

  const openTask = (taskId: number) => setFilter('taskId', String(taskId));
  const closeTask = () => setFilter('taskId', '');
  const beginCreate = () => { setEditing(null); setForm(blankForm(lockedEventId || (eventFilter ? Number(eventFilter) : undefined))); };
  const beginEdit = (task: Task) => { closeTask(); setEditing(task); setForm({ event_id: String(task.event_id), title: task.title, description: task.description, assignee_account_id: task.assignee_account_id ? String(task.assignee_account_id) : '', due_on: task.due_on || '' }); };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    const payload: TaskInput = { event_id: Number(form.event_id), title: form.title.trim(), description: form.description.trim(), assignee_account_id: form.assignee_account_id ? Number(form.assignee_account_id) : null, due_on: form.due_on || null };
    try {
      const task = editing ? await updateTask(editing.id, { ...payload, updated_at: editing.updated_at }) : await createTask(payload);
      setEditing(undefined); setSelected(task); await loadList(); openTask(task.id);
      window.dispatchEvent(new Event('tasks-notifications-changed'));
    } catch (err) {
      const apiError = err as Error & { status?: number; payload?: { current_task?: Task } };
      if (apiError.status === 409 && apiError.payload?.current_task) {
        setSelected(apiError.payload.current_task);
        setEditing(undefined);
        await loadList();
      }
      setError(err instanceof Error ? err.message : 'Failed to save task.');
    }
    finally { setSaving(false); }
  };

  const mutate = async (action: () => Promise<Task>) => {
    if (!selected) return; setDetailBusy(true); setError('');
    try { const next = await action(); setSelected(next); await loadList(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to update task.'); }
    finally { setDetailBusy(false); }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !comment.trim()) return; setDetailBusy(true);
    try { const created = await addTaskComment(selected.id, comment.trim()); setComments((rows) => [...rows, created]); setComment(''); setSelected({ ...selected, comment_count: selected.comment_count + 1 }); await loadList(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to add comment.'); }
    finally { setDetailBusy(false); }
  };

  const groupedAudit = useMemo(() => audit || [], [audit]);

  return <section className="tasks-page">
    <header className="page-header">
      {lockedEvent
        ? <EventPageTitle event={lockedEvent} section="Tasks" showSlotsBadge />
        : <h1>Tasks</h1>}
      <div className="card-actions event-schedule-actions tasks-header-actions">
        <button type="button" className="primary" onClick={beginCreate}>Add task</button>
        {lockedEventId ? <EventGearMenu eventId={lockedEventId} currentPage="tasks" menuId="event-tasks-actions-menu" /> : null}
      </div>
    </header>

    {editing !== undefined && <article className="card tasks-form-card" aria-label={editing ? 'Edit task' : 'Add task'}>
      <div className="card-header"><h2>{editing ? 'Edit task' : 'Add task'}</h2><button type="button" className="ghost" onClick={() => setEditing(undefined)}>Close</button></div>
      <form onSubmit={submitForm} className="form-grid tasks-form">
        <label className="form-field form-field-full-span"><span>Event</span><select required disabled={!!lockedEventId || !!editing} value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}><option value="">Select event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
        <label className="form-field form-field-full-span"><span>Title</span><input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="form-field form-field-full-span"><span>Description</span><textarea required maxLength={10000} rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="form-field"><span>Assignee</span><select value={form.assignee_account_id} onChange={(e) => setForm({ ...form, assignee_account_id: e.target.value })}><option value="">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.roles.map((role) => staffRoles[role] || role).join(', ')}</option>)}</select></label>
        <label className="form-field"><span>Due date</span><input type="date" value={form.due_on} onChange={(e) => setForm({ ...form, due_on: e.target.value })} /></label>
        <div className="form-actions form-field-full-span"><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save task'}</button><button type="button" className="ghost" onClick={() => setEditing(undefined)}>Cancel</button></div>
      </form>
    </article>}

    <article className="card">
      <div className="form-grid participant-onboarding-filters tasks-filters">
        {!lockedEventId && <label className="form-field"><span>Event</span><select value={eventFilter} onChange={(e) => setFilter('eventId', e.target.value)}><option value="">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>}
        <label className="form-field"><span>Status</span><select value={stateFilter} onChange={(e) => setFilter('state', e.target.value)}><option value="active">Active</option><option value="open">Open</option><option value="completed">Completed</option><option value="deleted">Deleted</option></select></label>
        <label className="form-field"><span>Assignee</span><select value={assigneeFilter} onChange={(e) => setFilter('assignee', e.target.value)}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="form-field"><span>Search</span><input value={search} onChange={(e) => setFilter('q', e.target.value)} placeholder="Title or description" /></label>
      </div>
    </article>

    {error && <p className="error-text">{error}</p>}
    {loading ? <div className="card"><p className="muted">Loading tasks…</p></div> : tasks.length === 0 ? <div className="card empty-state"><h2>No tasks found</h2><p className="muted">Adjust the filters or add the first task.</p></div> : <div className="tasks-list">
      {tasks.map((task) => {
        const overdue = task.overdue;
        return <button type="button" className={`card task-row ${task.deleted_at ? 'task-row--deleted' : ''}`} key={task.id} onClick={() => openTask(task.id)}>
          <span className="task-row-main"><span className="task-title-line"><strong>{task.title}</strong>{task.has_unread_notification && <span className="nav-user-warning" title="New task activity" aria-label="New task activity">!</span>}</span><span className="muted task-description-preview">{task.description}</span></span>
          {!lockedEventId && <span className="task-meta"><small>Event</small>{task.event_name}</span>}
          <span className="task-meta"><small>Assignee</small>{task.assignee_name || 'Unassigned'}</span>
          <span className={`task-meta ${overdue ? 'task-overdue' : ''}`}><small>Due</small>{dateOnly(task.due_on)}</span>
          <span className={`badge ${task.deleted_at ? 'danger' : task.completed_at ? 'success' : 'neutral'}`}>{task.deleted_at ? 'Deleted' : task.completed_at ? 'Done' : 'Open'}</span>
          <span className="task-comment-count" aria-label={`${task.comment_count} comments`}>◌ {task.comment_count}</span>
        </button>;
      })}
    </div>}

    {selected && <div className="modal-backdrop task-detail-backdrop" role="presentation" onMouseDown={closeTask}><article className="card task-detail" role="dialog" aria-modal="true" aria-label={selected.title} onMouseDown={(e) => e.stopPropagation()}>
      <header className="task-detail-header"><h2>{selected.title}</h2><button type="button" className="ghost" onClick={closeTask}>Close</button></header>
      {selected.deleted_at && <div className="task-deleted-banner"><strong>Deleted {dateTime(selected.deleted_at)}</strong><span> by {selected.deleted_by_name}{selected.deleted_reason ? ` · ${selected.deleted_reason}` : ''}</span></div>}
      <p className="task-detail-description">{selected.description}</p>
      <dl className="task-detail-meta"><div><dt>Assignee</dt><dd>{selected.assignee_name || 'Unassigned'}</dd></div><div><dt>Due date</dt><dd>{dateOnly(selected.due_on)}</dd></div><div><dt>Status</dt><dd>{selected.completed_at ? `Done by ${selected.completed_by_name} · ${dateTime(selected.completed_at)}` : 'Open'}</dd></div><div><dt>Created</dt><dd>{selected.created_by_name} · {dateTime(selected.created_at)}</dd></div></dl>
      <div className="card-actions task-actions">
        {!selected.deleted_at && <><button type="button" className="primary task-action-button" onClick={() => void mutate(() => selected.completed_at ? reopenTask(selected.id) : completeTask(selected.id))} disabled={detailBusy}>{selected.completed_at ? 'Reopen' : 'Mark done'}</button><button type="button" className="ghost task-action-button" onClick={() => beginEdit(selected)}>Edit</button><button type="button" className="ghost danger task-action-button" onClick={async () => { const reason = window.prompt('Optional reason for deleting this task:') ?? undefined; if (reason === undefined) return; if (!window.confirm('Delete this task? It can be restored later.')) return; setDetailBusy(true); try { await deleteTask(selected.id, reason); closeTask(); await loadList(); } finally { setDetailBusy(false); } }}>Delete</button></>}
        {selected.deleted_at && <button type="button" onClick={() => void mutate(() => restoreTask(selected.id))} disabled={detailBusy}>Restore task</button>}
      </div>

      <section className="task-comments"><h3>Comments <span className="muted">{comments.length}</span></h3>{comments.length === 0 ? <p className="muted">No comments yet.</p> : <div className="task-comment-thread">{comments.map((item) => <article key={item.id} className="task-comment"><div><strong>{item.author_name}</strong><time>{dateTime(item.created_at)}</time></div><p>{item.body}</p></article>)}</div>}
        {!selected.deleted_at && <form onSubmit={submitComment} className="task-comment-form"><label className="form-field"><span>Add comment</span><textarea rows={4} maxLength={10000} placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} /></label><div className="form-actions"><button type="submit" className="primary" disabled={detailBusy || !comment.trim()}>{detailBusy ? 'Posting…' : 'Post comment'}</button></div></form>}
      </section>
      <section className="task-audit"><div className="page-header"><h3>Audit history</h3>{audit === null ? <button type="button" className="ghost" onClick={() => void listTaskAudit(selected.id).then(setAudit).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history.'))}>Show history</button> : <button type="button" className="ghost" onClick={() => setAudit(null)}>Close history</button>}</div>{audit !== null && <div className="task-audit-list">{groupedAudit.map((item) => <div key={item.id}><strong>{item.action.replace('_', ' ')}</strong><span>{item.actor_name} · {dateTime(item.created_at)}</span></div>)}</div>}</section>
    </article></div>}
  </section>;
};

export default TasksPage;
