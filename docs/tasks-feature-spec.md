# Tasks: Feature Specification

## Status

Draft for product review. This document defines the proposed V1 and records the open decisions that should be resolved before implementation.

## Goal

Give staff one shared place to create, assign, discuss, complete, and audit event work. Every task belongs to exactly one event, may be assigned to one staff account, and remains recoverable and auditable after deletion.

## Scope

- Every task belongs to one event.
- Any authenticated non-participant-only staff member who can access Tasks can view, create, edit, reassign, complete/reopen, comment on, and soft-delete any task.
- A task can be unassigned or assigned to one staff account.
- Every task has a comment thread. Comments are chronological and identify their author and time.
- Task mutations are recorded in an append-only audit log.
- Deletion is soft deletion. Deleted tasks are hidden from the normal list but can be found later in a dedicated Deleted filter and restored.
- The event gear menu contains **Tasks** between **Route** and **Manifest**.
- The main side menu contains **Tasks**. This view shows tasks across events and supports filtering by event.
- The event-scoped and global pages render the same shared task workspace component with different initial event-filter behavior.

## Out of Scope (V1)

- Subtasks, checklists within a task, dependencies, recurring tasks, labels, priorities, attachments, mentions, reactions, or private comments.
- Multiple assignees or assignment to a team/role instead of an account.
- Due-date reminders, push notifications, or a general-purpose activity inbox.
- Participant access.
- Permanent deletion from the product UI.
- Rich-text/HTML comments. V1 comments are plain text.

## Terminology and State

- **Open**: the task is active and not completed.
- **Completed**: the task has a recorded completion actor and time.
- **Deleted**: `deleted_at` is set. This state is independent of completion; restoring a deleted completed task restores it as completed.
- **Restored**: deletion fields are cleared by an explicit restore action. The delete and restore events remain in the audit log.
- **Assignee**: the single account currently responsible for the task. It may be empty.

V1 uses a completion timestamp rather than a free-form status enum. The derived status is `open` when `completed_at IS NULL`, otherwise `completed`. This keeps the requested workflow narrow while leaving room for a later status migration.

## User Flows

### Event-scoped view

1. A staff member opens an event's gear menu and selects **Tasks**.
2. The shared Tasks workspace opens at `/events/:eventId/tasks`, locked to that event.
3. It lists active tasks for the event and offers status and assignee filters.
4. Staff can create a task; the event is supplied by the route and cannot be changed in this view.
5. Selecting a task opens its details, comments, and audit history.

### Global view

1. A staff member selects **Tasks** in the main side menu.
2. The shared Tasks workspace opens at `/tasks` and shows active tasks across all events the user can access.
3. An event filter defaults to **All events** and may be narrowed to one event.
4. Creating a task requires selecting an event. If an event filter is active, prefill that event.
5. Filtering must be represented in the URL query string so refresh/back navigation preserves it (for example, `/tasks?eventId=42&status=open`).

### Create and edit

1. Staff selects **Add task**.
2. Required: event, title, and description. Optional: assignee and due date.
3. Saving creates the task and a `created` audit event.
4. Editing records only fields whose effective value changed. Reassignment is represented explicitly in the audit log.
5. Assigning or reassigning queues an in-app notification and email for the new assignee. Do not notify a staff member who assigns the task to themselves. Unassigning does not send an email.

### Complete and reopen

1. Selecting **Mark done** records the authenticated actor and server time.
2. A completed task remains visible when the current status filter permits it and displays who completed it and when.
3. Selecting **Reopen** clears the current completion fields and records a `reopened` audit event; prior completion history remains in the audit log.

### Comments

1. Any authorized staff member opens a task and posts a non-empty plain-text comment.
2. The API derives the author from the authenticated session; the client never supplies an author ID or name.
3. Comments appear oldest first, with author and timestamp.
4. V1 comments cannot be edited or deleted. Corrections are posted as a new comment, preserving the operational record.
5. Posting a comment creates an unread in-app notification for the current assignee and queues an email to that assignee. Do not notify the author when they comment on their own assigned task.

### Delete, find, and restore

1. **Delete task** requires confirmation and optionally accepts a short reason.
2. The task disappears from normal active views immediately.
3. Staff selects the **Deleted** status/filter to find deleted tasks; event, assignee, and search filters still apply.
4. A deleted task is read-only except for viewing comments/history and selecting **Restore**.
5. Restore returns the task to its pre-delete completion state and records a `restored` audit event.

## Proposed Task Fields

| Field | V1 rule |
|---|---|
| Event | Required; immutable after creation by default |
| Title | Required, trimmed, 1–200 characters |
| Description | Required plain text, trimmed, 1–10,000 characters |
| Assignee | Optional, one eligible staff account |
| Due date | Optional calendar date with no time or timezone semantics |
| Completion | Optional server timestamp plus completing account snapshot |
| Created/updated metadata | Server-generated |
| Deleted metadata | Nullable server timestamp, actor snapshot, and optional reason |

Moving a task between events is excluded by the proposed immutable event rule because it complicates access and audit expectations. If a task was created against the wrong event, delete it and create the correct task. This is an open product decision below.

## List and Detail UX

### Shared `TasksWorkspace` component

The page routes are thin wrappers around one component:

- `TasksPage` renders `<TasksWorkspace />` at `/tasks`.
- `EventTasksPage` renders `<TasksWorkspace eventId={eventId} eventLocked />` at `/events/:eventId/tasks`.
- Data loading, filters, task rows/cards, create/edit/detail UI, comments, audit history, responsive behavior, and mutations live in the shared component or its task-specific child components.

The event route must not duplicate list or mutation logic. Its only differences are a fixed event, event-specific heading, and `EventGearMenu currentPage="tasks"`.

### Default list behavior

- Default filter: active tasks, all completion states.
- Global view default event: All events.
- Sort: incomplete before completed, then due date ascending with no due date last, then newest created first.
- Filters: event (global only), state (`active`, `open`, `completed`, `deleted`), assignee (`any`, `unassigned`, specific staff), and text search across title and description.
- Each row/card shows title, event (global view), assignee/unassigned, due date, open/completed state, comment count, and an exclamation-mark indicator when the current user has an unread notification for that task.
- Overdue means open with `due_on < the server's current calendar date`; it is a visual indicator, not a separate stored status. Because the stored value is a date, clients must not convert it through UTC or shift it by timezone.
- Empty, loading, and recoverable error states are required.
- The mobile presentation uses cards and large actions; desktop may use a compact table/list.

### Task details

- Task fields and actions appear first.
- Comments appear as a persistent thread below or beside task fields.
- Audit history is collapsed by default and loaded on demand.
- Deleted task details show a prominent deleted banner, deletion actor/time/reason, and Restore action.
- Opening a task marks that task's notifications read for the current user after its current detail/comments have loaded. The indicator clears on that task and the side-menu indicator clears when the user has no other unread task notifications.

## Data Model

### `tasks`

- `id BIGSERIAL PRIMARY KEY`
- `event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `assignee_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`
- `assignee_display_name_snapshot TEXT` — current assignment display fallback if the account later changes
- `due_on DATE`
- `completed_at TIMESTAMPTZ`
- `completed_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`
- `completed_by_display_name_snapshot TEXT`
- `created_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`
- `created_by_display_name_snapshot TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `deleted_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`
- `deleted_by_display_name_snapshot TEXT`
- `deleted_reason TEXT`
- `deleted_at TIMESTAMPTZ`

Constraints should enforce trimmed non-empty titles/descriptions and consistent completion/deletion field groups. Index active event/status/due queries, assignee queries, and deleted-task retrieval. Use `event_id ... REFERENCES events(id) ON DELETE CASCADE`: hard-deleting an event permanently deletes its tasks, comments, audit events, notifications, and pending task-email deliveries. Soft-deleted tasks remain recoverable only while their event exists.

### `task_comments`

- `id BIGSERIAL PRIMARY KEY`
- `task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT`
- `body TEXT NOT NULL`
- `author_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`
- `author_display_name_snapshot TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Enforce a trimmed non-empty body and a V1 maximum of 10,000 characters. Comments remain available when a task is soft-deleted.

### `task_audit_events`

- `id BIGSERIAL PRIMARY KEY`
- `task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT`
- `event_id INTEGER NOT NULL` — denormalized owning event at the time of the change
- `action TEXT NOT NULL` — `created`, `edited`, `assigned`, `unassigned`, `completed`, `reopened`, `deleted`, `restored`, `commented`
- `actor_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`
- `actor_display_name_snapshot TEXT NOT NULL`
- `changes JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

`changes` contains only audit-safe values necessary to explain the mutation. For field edits, use `{field: {old: ..., new: ...}}`. For assignment/completion, store account IDs plus display-name snapshots. For comments, store `comment_id`, not the full comment body, avoiding duplicated text and future inconsistency.

All mutation and corresponding audit inserts must occur in one database transaction. The audit table is append-only through the application API.

### `task_notifications`

- `id BIGSERIAL PRIMARY KEY`
- `task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE`
- `recipient_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE`
- `kind TEXT NOT NULL` — `assigned` or `commented`
- `source_audit_event_id BIGINT NOT NULL REFERENCES task_audit_events(id) ON DELETE CASCADE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `read_at TIMESTAMPTZ`

Create one notification for the current recipient per assignment or comment event. Enforce uniqueness on `(recipient_account_id, source_audit_event_id)` so retries cannot duplicate it. Do not create a notification when actor and recipient are the same account. Reassignment does not clear older notifications; those remain historical, while the new assignee receives a new assignment notification.

### `task_email_deliveries`

- `id BIGSERIAL PRIMARY KEY`
- `task_notification_id BIGINT NOT NULL UNIQUE REFERENCES task_notifications(id) ON DELETE CASCADE`
- `recipient_email TEXT NOT NULL`
- `subject TEXT NOT NULL`
- `body TEXT NOT NULL`
- `status TEXT NOT NULL` — `queued`, `sending`, `sent`, or `failed`
- `attempt_count INTEGER NOT NULL DEFAULT 0`
- `provider_message_id TEXT`
- `last_error TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `sent_at TIMESTAMPTZ`

Insert the notification and queued delivery in the same transaction as the task mutation. Send after commit through the existing `comms.EmailSender`; task assignment/comment success must not depend on SMTP availability. A retryable background delivery loop processes queued/failed rows with bounded retries. Store the rendered recipient, subject, and body so retries send the same message.

## Staff Eligibility and Identity

Add a task-specific staff lookup endpoint. An eligible assignee is an account having at least one non-participant operational role: `admin`, `staff`, `jump_master`, `jump_leader`, `ground_crew`, `boat_crew`, `driver`, or `packer`.

Assignment is platform-wide: V1 allows any eligible platform staff account on any event. Display name uses `accounts.full_name`, falling back to email. The API returns only the account ID, display name, and relevant roles; it must not expose identity-provider subjects.

An account becomes ineligible as soon as it has none of the staff roles above. Removing a person's staff role is the supported inactive-staff process. Existing tasks remain assigned to that account and retain its name snapshot, but the account no longer appears in the assignment picker and cannot access Tasks. Reassign those tasks manually; do not silently unassign them.

## Authorization

Add explicit permissions rather than reusing event-management permissions:

- `tasks:view`
- `tasks:manage`
- `tasks:comment`
- `tasks:view_audit`
- `tasks:restore`

Per the requested behavior, map all operational staff roles (`admin`, `staff`, `jump_master`, `jump_leader`, `ground_crew`, `boat_crew`, `driver`, `packer`) to all five permissions. Do not grant them to participant-only users.

Every endpoint must verify permission server-side. The browser's route guard and hidden buttons are usability measures, not authorization.

## API

Mount a `tasks` handler at `/api/tasks`.

- `GET /api/tasks?event_id=&state=&assignee_account_id=&q=`
  - Returns the complete matching task collection without pagination.
  - `state` is one of `active`, `open`, `completed`, `deleted`; default `active`.
  - Deleted tasks are returned only for `state=deleted`.
- `POST /api/tasks`
  - Body: `event_id`, `title`, `description`, optional `assignee_account_id`, `due_on` (`YYYY-MM-DD`).
- `GET /api/tasks/{taskID}`
  - Returns full task state, including deleted state when authorized.
- `PATCH /api/tasks/{taskID}`
  - Edits title, description, assignee, or due date. Event is not editable in V1.
- `POST /api/tasks/{taskID}/complete`
  - Idempotently completes an active task from authenticated actor/server time.
- `POST /api/tasks/{taskID}/reopen`
  - Idempotently reopens an active task.
- `DELETE /api/tasks/{taskID}`
  - Optional body `{ "reason": "..." }`; soft-deletes only.
- `POST /api/tasks/{taskID}/restore`
  - Restores a deleted task.
- `GET /api/tasks/{taskID}/comments`
  - Returns comments oldest first.
- `POST /api/tasks/{taskID}/comments`
  - Body: `{ "body": "..." }`.
- `GET /api/tasks/{taskID}/audit`
  - Returns newest events first.
- `GET /api/tasks/assignees?q=`
  - Returns eligible staff accounts for the assignment picker.
- `GET /api/tasks/notifications/summary`
  - Returns the authenticated account's unread total and unread task IDs for side-menu/task indicators.
- `POST /api/tasks/{taskID}/notifications/read`
  - Idempotently marks all of the authenticated account's notifications for this task read.
- `GET /api/tasks/stream`
  - Authenticated SSE stream for task mutations and notification refresh.

Task lists, comments, and audit history are intentionally unbounded. List responses include `comment_count`, display-name snapshots, server-calculated overdue state, and the current user's unread state to avoid per-row requests.

Concurrency should use an `updated_at` precondition (or an explicit version field). A stale edit returns `409 Conflict` with current task data rather than silently overwriting another staff member's recent edit.

## Realtime Behavior

The backend already has a realtime hub. Publish task invalidation events after committed create, edit, assignment, completion, reopen, comment, delete, and restore mutations. The shared workspace and navigation subscribe to `/api/tasks/stream` and refetch affected list/detail and unread-summary data. The acting user's UI also updates immediately from successful mutation responses.

## Navigation Changes

- Add `tasks` to `EventGearMenuPage`.
- Insert `{ key: 'tasks', label: 'Tasks', path: eventId => /events/${eventId}/tasks }` immediately after Route and before Manifest.
- Add `{ to: '/tasks', label: 'Tasks' }` to the staff side menu, proposed immediately after Events and before Operational Checks.
- When the authenticated staff member has one or more unread task notifications, render the existing `nav-user-warning` exclamation-mark treatment beside the Tasks label. Do not show a numeric badge in V1.
- Add staff-only routes `/tasks` and `/events/:eventId/tasks` with the same operational staff role coverage as the Tasks permissions.

## Validation and Error Rules

- Derive every actor/author from the authenticated session.
- Validate that the event exists before create and is accessible to the caller.
- Validate assignee eligibility on create and edit; never trust a display name from the client.
- Reject mutations other than restore on deleted tasks with `409 Conflict`.
- Complete/reopen/delete/restore are idempotent for their already-achieved state; do not create duplicate audit events for no-op retries.
- Normalize whitespace around title; preserve internal line breaks in description/comments.
- Parse and return `due_on` as an ISO calendar date (`YYYY-MM-DD`) without timestamp conversion.
- Render all user text as text, never unsanitized HTML.
- Use server timestamps as canonical. API timestamps are ISO 8601 UTC.

## Testing Plan

### Backend

- Permission matrix covers every operational role and rejects participant-only sessions.
- Create/edit/reassign/complete/reopen/comment/delete/restore happy paths.
- Every real mutation creates exactly one correct audit event in the same transaction.
- No-op/idempotent retry creates no duplicate audit event.
- Deleted tasks are excluded from active queries and included only in deleted queries.
- Restore preserves pre-delete completion state and comments.
- Invalid event, ineligible assignee, stale update, empty/oversized text, and deleted-task mutation cases.
- Assignee name and all actor/author fields are server-derived snapshots.
- Assignment and comment notifications are created for the current assignee, suppress self-notifications, and are deduplicated on retry.
- Removing all staff roles excludes an account from future assignment choices without corrupting existing task history.
- Email delivery failure does not roll back assignment or comment creation, and queued delivery can be retried.
- Pagination/filter combinations, including global event filtering.

### Frontend

- Both routes render the shared workspace and event route locks the filter.
- Event filter/query state persists through refresh and browser navigation.
- All task mutations update list/detail state and expose useful errors.
- Comment posting and audit lazy-loading.
- Side-menu and per-task exclamation marks reflect unread notification state and clear after opening the relevant task.
- Deleted filter, deleted read-only state, and restore flow.
- Mobile layout and keyboard-accessible dialogs/actions.
- Event gear order is Route, Tasks, Manifest; global Tasks entry is visible only to staff users.

## Acceptance Criteria

- Staff can create a task tied to an event with a title, description, optional assignee, and optional due date.
- Staff can assign or reassign the task to one eligible staff account, or leave it unassigned.
- Any authorized staff member can edit, complete, reopen, comment on, soft-delete, and restore any task.
- Every staff member with Tasks access can read and add to every task's comment thread.
- Normal lists never include deleted tasks.
- Deleted tasks can be found using the Deleted filter, opened with their comments/history intact, and restored.
- Audit history identifies the actor and time for create, field edits, assignment changes, completion/reopen, comments, deletion, and restoration, with meaningful before/after values.
- The event gear menu shows Tasks between Route and Manifest and opens only that event's tasks.
- The main side menu Tasks page shows cross-event tasks and can be filtered by event.
- Both views use the same shared Tasks workspace and mutation code.
- Participant-only users cannot access Tasks routes or APIs.
- Concurrent edits do not silently overwrite each other.
- Assigning/reassigning a task creates an in-app notification and queues an email for the new assignee, except for self-assignment.
- Adding a comment creates an in-app notification and queues an email for the current assignee, except when the assignee authored the comment.
- Unread notifications display the established exclamation-mark icon beside the Tasks side-menu entry and the affected task.
- Opening the task marks that user's notifications for it read.
- Removing a user's staff roles prevents new assignments and Tasks access; existing assignments/history remain intact.
- Hard-deleting an event also permanently deletes all of its tasks and associated task history.

## Product Holes Requiring Confirmation

The main data-retention, assignment, due-date, restoration, and notification questions are now resolved. These lower-impact choices remain:

1. **Event reassignment:** should an existing task be movable to another event? V1 currently keeps its event immutable.
2. **Comments:** should authors be able to edit/delete their own comments? V1 currently makes comments append-only for audit clarity.
3. **Delete reason:** should it be mandatory, optional (currently proposed), or omitted?
4. **Audit visibility:** should every staff role see the complete audit log? The proposed permission matrix says yes because all roles can mutate all tasks.
5. **Global list scope:** should it show tasks for past/cancelled events by default? Current behavior is all accessible events with explicit event filtering.
6. **Email content:** the proposed emails include event name, task title, assignment/comment actor, due date when present, a short comment excerpt for comment notifications, and a direct task link. Confirm whether comment text should be included in email or link-only for privacy.

## Recommended Decisions for V1

To keep implementation coherent, accept the defaults in this spec unless product requirements differ:

- One optional assignee; all platform operational staff are eligible.
- Title, required description, optional date-only due date, and immutable event.
- Two completion states: open/completed.
- Append-only plain-text comments.
- Optional delete reason; deleted tasks are searchable and restorable.
- Full audit visibility to all authorized staff.
- In-app exclamation-mark and email notifications for assignment/reassignment and comments, sent to the current assignee with self-notifications suppressed.
- No completion notifications, due-date reminders, attachments, priorities, or labels in V1.
- Event hard deletion cascades through all task data and history.
