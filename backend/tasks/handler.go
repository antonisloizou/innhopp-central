package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/auth"
	"github.com/innhopp/central/backend/comms"
	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/rbac"
	"github.com/innhopp/central/backend/realtime"
)

type Handler struct {
	db          *pgxpool.Pool
	streams     *realtime.Hub
	sender      comms.EmailSender
	frontendURL string
}

func NewHandler(db *pgxpool.Pool, streams *realtime.Hub, sender comms.EmailSender, frontendURL string) *Handler {
	h := &Handler{db: db, streams: streams, sender: sender, frontendURL: strings.TrimRight(frontendURL, "/")}
	if sender != nil {
		go h.deliveryLoop()
	}
	return h
}

func (h *Handler) Routes(e *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(e.Authorize(rbac.PermissionViewTasks)).Get("/", h.list)
	r.With(e.Authorize(rbac.PermissionManageTasks)).Post("/", h.create)
	r.With(e.Authorize(rbac.PermissionViewTasks)).Get("/assignees", h.assignees)
	r.With(e.Authorize(rbac.PermissionViewTasks)).Get("/notifications/summary", h.notificationSummary)
	r.With(e.Authorize(rbac.PermissionViewTasks)).Get("/stream", h.stream)
	r.With(e.Authorize(rbac.PermissionViewTasks)).Get("/{taskID}", h.get)
	r.With(e.Authorize(rbac.PermissionManageTasks)).Patch("/{taskID}", h.update)
	r.With(e.Authorize(rbac.PermissionManageTasks)).Post("/{taskID}/complete", h.complete)
	r.With(e.Authorize(rbac.PermissionManageTasks)).Post("/{taskID}/reopen", h.reopen)
	r.With(e.Authorize(rbac.PermissionManageTasks)).Delete("/{taskID}", h.delete)
	r.With(e.Authorize(rbac.PermissionRestoreTasks)).Post("/{taskID}/restore", h.restore)
	r.With(e.Authorize(rbac.PermissionViewTasks)).Get("/{taskID}/comments", h.comments)
	r.With(e.Authorize(rbac.PermissionCommentTasks)).Post("/{taskID}/comments", h.addComment)
	r.With(e.Authorize(rbac.PermissionViewTaskAudit)).Get("/{taskID}/audit", h.audit)
	r.With(e.Authorize(rbac.PermissionViewTasks)).Post("/{taskID}/notifications/read", h.markRead)
	return r
}

type Task struct {
	ID                    int64      `json:"id"`
	EventID               int64      `json:"event_id"`
	EventName             string     `json:"event_name"`
	Title                 string     `json:"title"`
	Description           string     `json:"description"`
	AssigneeAccountID     *int64     `json:"assignee_account_id,omitempty"`
	AssigneeName          string     `json:"assignee_name,omitempty"`
	DueOn                 *string    `json:"due_on,omitempty"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
	CompletedByName       string     `json:"completed_by_name,omitempty"`
	CreatedByName         string     `json:"created_by_name"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
	DeletedAt             *time.Time `json:"deleted_at,omitempty"`
	DeletedByName         string     `json:"deleted_by_name,omitempty"`
	DeletedReason         string     `json:"deleted_reason,omitempty"`
	CommentCount          int        `json:"comment_count"`
	HasUnreadNotification bool       `json:"has_unread_notification"`
	Overdue               bool       `json:"overdue"`
}

type Comment struct {
	ID         int64     `json:"id"`
	TaskID     int64     `json:"task_id"`
	Body       string    `json:"body"`
	AuthorName string    `json:"author_name"`
	CreatedAt  time.Time `json:"created_at"`
}

type AuditEvent struct {
	ID        int64           `json:"id"`
	Action    string          `json:"action"`
	ActorName string          `json:"actor_name"`
	Changes   json.RawMessage `json:"changes"`
	CreatedAt time.Time       `json:"created_at"`
}

func actor(r *http.Request) (int64, string) {
	c := auth.FromContext(r.Context())
	if c == nil {
		return 0, "Unknown staff"
	}
	name := strings.TrimSpace(c.FullName)
	if name == "" {
		name = c.Email
	}
	return c.AccountID, name
}

func taskID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "taskID"), 10, 64)
	if err != nil || id < 1 {
		httpx.Error(w, http.StatusBadRequest, "invalid task id")
		return 0, false
	}
	return id, true
}

const taskSelect = `SELECT t.id,t.event_id,e.name,t.title,t.description,t.assignee_account_id,
COALESCE(t.assignee_display_name_snapshot,''),to_char(t.due_on,'YYYY-MM-DD'),t.completed_at,
COALESCE(t.completed_by_display_name_snapshot,''),t.created_by_display_name_snapshot,t.created_at,t.updated_at,
t.deleted_at,COALESCE(t.deleted_by_display_name_snapshot,''),COALESCE(t.deleted_reason,''),
(SELECT count(*) FROM task_comments c WHERE c.task_id=t.id),
EXISTS(SELECT 1 FROM task_notifications n WHERE n.task_id=t.id AND n.recipient_account_id=$1 AND n.read_at IS NULL)
,COALESCE(t.deleted_at IS NULL AND t.completed_at IS NULL AND t.due_on < CURRENT_DATE,false)
FROM tasks t JOIN events e ON e.id=t.event_id`

func scanTask(row pgx.Row) (Task, error) {
	var t Task
	var assignee sql.NullInt64
	var due sql.NullString
	var completedAt sql.NullTime
	var deletedAt sql.NullTime
	var commentCount int64
	err := row.Scan(&t.ID, &t.EventID, &t.EventName, &t.Title, &t.Description, &assignee, &t.AssigneeName, &due,
		&completedAt, &t.CompletedByName, &t.CreatedByName, &t.CreatedAt, &t.UpdatedAt, &deletedAt,
		&t.DeletedByName, &t.DeletedReason, &commentCount, &t.HasUnreadNotification, &t.Overdue)
	if err != nil {
		return t, err
	}
	if assignee.Valid {
		t.AssigneeAccountID = &assignee.Int64
	}
	if due.Valid {
		t.DueOn = &due.String
	}
	if completedAt.Valid {
		t.CompletedAt = &completedAt.Time
	}
	if deletedAt.Valid {
		t.DeletedAt = &deletedAt.Time
	}
	t.CommentCount = int(commentCount)
	return t, nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	accountID, _ := actor(r)
	args := []any{accountID}
	where := []string{}
	state := r.URL.Query().Get("state")
	switch state {
	case "deleted":
		where = append(where, "t.deleted_at IS NOT NULL")
	case "open":
		where = append(where, "t.deleted_at IS NULL", "t.completed_at IS NULL")
	case "completed":
		where = append(where, "t.deleted_at IS NULL", "t.completed_at IS NOT NULL")
	default:
		where = append(where, "t.deleted_at IS NULL")
	}
	if raw := r.URL.Query().Get("event_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id < 1 {
			httpx.Error(w, 400, "invalid event_id")
			return
		}
		args = append(args, id)
		where = append(where, fmt.Sprintf("t.event_id=$%d", len(args)))
	}
	if raw := r.URL.Query().Get("assignee_account_id"); raw != "" {
		if raw == "unassigned" {
			where = append(where, "t.assignee_account_id IS NULL")
		} else {
			id, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || id < 1 {
				httpx.Error(w, 400, "invalid assignee_account_id")
				return
			}
			args = append(args, id)
			where = append(where, fmt.Sprintf("t.assignee_account_id=$%d", len(args)))
		}
	}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf("(t.title ILIKE $%d OR t.description ILIKE $%d)", len(args), len(args)))
	}
	query := taskSelect + " WHERE " + strings.Join(where, " AND ") + ` ORDER BY (t.completed_at IS NOT NULL),t.due_on ASC NULLS LAST,t.created_at DESC`
	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		httpx.Error(w, 500, "failed to list tasks")
		return
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			httpx.Error(w, 500, "failed to parse tasks")
			return
		}
		out = append(out, t)
	}
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	accountID, _ := actor(r)
	t, err := scanTask(h.db.QueryRow(r.Context(), taskSelect+" WHERE t.id=$2", accountID, id))
	if err == pgx.ErrNoRows {
		httpx.Error(w, 404, "task not found")
		return
	}
	if err != nil {
		httpx.Error(w, 500, "failed to load task")
		return
	}
	httpx.WriteJSON(w, 200, t)
}

type taskInput struct {
	EventID           int64  `json:"event_id"`
	Title             string `json:"title"`
	Description       string `json:"description"`
	AssigneeAccountID *int64 `json:"assignee_account_id"`
	DueOn             string `json:"due_on"`
}

func validateInput(in taskInput, requireEvent bool) error {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	if requireEvent && in.EventID < 1 {
		return fmt.Errorf("event is required")
	}
	if len(in.Title) < 1 || len(in.Title) > 200 {
		return fmt.Errorf("title must be between 1 and 200 characters")
	}
	if len(in.Description) < 1 || len(in.Description) > 10000 {
		return fmt.Errorf("description must be between 1 and 10000 characters")
	}
	if in.DueOn != "" {
		if _, err := time.Parse("2006-01-02", in.DueOn); err != nil {
			return fmt.Errorf("due_on must be YYYY-MM-DD")
		}
	}
	return nil
}

func (h *Handler) eligibleAssignee(ctx context.Context, id int64) (string, string, error) {
	var name, email string
	err := h.db.QueryRow(ctx, `SELECT COALESCE(NULLIF(btrim(a.full_name),''),a.email),a.email FROM accounts a WHERE a.id=$1 AND EXISTS(SELECT 1 FROM account_roles ar WHERE ar.account_id=a.id AND ar.role_name=ANY($2))`, id, staffRoles).Scan(&name, &email)
	return name, email, err
}

var staffRoles = []string{"admin", "staff", "jump_master", "jump_leader", "ground_crew", "boat_crew", "driver", "packer"}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var in taskInput
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.Error(w, 400, "invalid request payload")
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	in.DueOn = strings.TrimSpace(in.DueOn)
	if err := validateInput(in, true); err != nil {
		httpx.Error(w, 400, err.Error())
		return
	}
	var eventName string
	if err := h.db.QueryRow(r.Context(), "SELECT name FROM events WHERE id=$1", in.EventID).Scan(&eventName); err != nil {
		httpx.Error(w, 400, "event not found")
		return
	}
	var assigneeName, assigneeEmail string
	if in.AssigneeAccountID != nil {
		var err error
		assigneeName, assigneeEmail, err = h.eligibleAssignee(r.Context(), *in.AssigneeAccountID)
		if err != nil {
			httpx.Error(w, 400, "assignee is not eligible staff")
			return
		}
	}
	actorID, actorName := actor(r)
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "failed to create task")
		return
	}
	defer tx.Rollback(r.Context())
	var id int64
	err = tx.QueryRow(r.Context(), `INSERT INTO tasks(event_id,title,description,assignee_account_id,assignee_display_name_snapshot,due_on,created_by_account_id,created_by_display_name_snapshot,updated_by_account_id) VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::date,$7,$8,$7) RETURNING id`, in.EventID, in.Title, in.Description, in.AssigneeAccountID, nullable(assigneeName), in.DueOn, actorID, actorName).Scan(&id)
	if err != nil {
		httpx.Error(w, 500, "failed to create task")
		return
	}
	auditID, err := insertAudit(r.Context(), tx, id, in.EventID, "created", actorID, actorName, map[string]any{"title": in.Title})
	if err == nil && in.AssigneeAccountID != nil && *in.AssigneeAccountID != actorID {
		err = h.insertNotification(r.Context(), tx, id, auditID, *in.AssigneeAccountID, "assigned", assigneeEmail, eventName, in.Title, actorName, in.DueOn, "")
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		httpx.Error(w, 500, "failed to create task")
		return
	}
	h.publish(in.EventID, id, "created")
	h.deliverQueued()
	accountID, _ := actor(r)
	t, _ := scanTask(h.db.QueryRow(r.Context(), taskSelect+" WHERE t.id=$2", accountID, id))
	httpx.WriteJSON(w, 201, t)
}

func nullable(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func insertAudit(ctx context.Context, tx pgx.Tx, taskID, eventID int64, action string, actorID int64, actorName string, changes any) (int64, error) {
	b, _ := json.Marshal(changes)
	var id int64
	err := tx.QueryRow(ctx, `INSERT INTO task_audit_events(task_id,event_id,action,actor_account_id,actor_display_name_snapshot,changes) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`, taskID, eventID, action, actorID, actorName, string(b)).Scan(&id)
	return id, err
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	var raw map[string]json.RawMessage
	if err := httpx.DecodeJSON(r, &raw); err != nil {
		httpx.Error(w, 400, "invalid request payload")
		return
	}
	var expectedUpdatedAt time.Time
	updatedRaw, found := raw["updated_at"]
	if !found || json.Unmarshal(updatedRaw, &expectedUpdatedAt) != nil || expectedUpdatedAt.IsZero() {
		httpx.Error(w, http.StatusBadRequest, "updated_at is required")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "failed to update task")
		return
	}
	defer tx.Rollback(r.Context())
	var eventID int64
	var title, desc, due, oldAssigneeName string
	var assignee sql.NullInt64
	var deleted *time.Time
	var currentUpdatedAt time.Time
	err = tx.QueryRow(r.Context(), `SELECT event_id,title,description,COALESCE(to_char(due_on,'YYYY-MM-DD'),''),assignee_account_id,COALESCE(assignee_display_name_snapshot,''),deleted_at,updated_at FROM tasks WHERE id=$1 FOR UPDATE`, id).Scan(&eventID, &title, &desc, &due, &assignee, &oldAssigneeName, &deleted, &currentUpdatedAt)
	if err == pgx.ErrNoRows {
		httpx.Error(w, 404, "task not found")
		return
	}
	if err != nil {
		httpx.Error(w, 500, "failed to update task")
		return
	}
	if deleted != nil {
		httpx.Error(w, 409, "deleted tasks are read-only")
		return
	}
	if !versionsMatch(currentUpdatedAt, expectedUpdatedAt) {
		_ = tx.Rollback(r.Context())
		accountID, _ := actor(r)
		current, loadErr := scanTask(h.db.QueryRow(r.Context(), taskSelect+" WHERE t.id=$2", accountID, id))
		if loadErr != nil {
			httpx.Error(w, http.StatusConflict, "task changed since it was opened")
			return
		}
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": "task changed since it was opened", "current_task": current})
		return
	}
	changes := map[string]any{}
	newTitle, newDesc, newDue := title, desc, due
	var newAssignee *int64
	if assignee.Valid {
		x := assignee.Int64
		newAssignee = &x
	}
	newAssigneeName := oldAssigneeName
	var notifyEmail string
	if v, found := raw["title"]; found {
		if json.Unmarshal(v, &newTitle) != nil {
			httpx.Error(w, 400, "invalid title")
			return
		}
		newTitle = strings.TrimSpace(newTitle)
		if newTitle != title {
			changes["title"] = map[string]any{"old": title, "new": newTitle}
		}
	}
	if v, found := raw["description"]; found {
		if json.Unmarshal(v, &newDesc) != nil {
			httpx.Error(w, 400, "invalid description")
			return
		}
		newDesc = strings.TrimSpace(newDesc)
		if newDesc != desc {
			changes["description"] = map[string]any{"old": desc, "new": newDesc}
		}
	}
	if v, found := raw["due_on"]; found {
		if string(v) == "null" {
			newDue = ""
		} else if json.Unmarshal(v, &newDue) != nil {
			httpx.Error(w, 400, "invalid due_on")
			return
		}
		newDue = strings.TrimSpace(newDue)
		if newDue != due {
			changes["due_on"] = map[string]any{"old": due, "new": newDue}
		}
	}
	assignmentChanged := false
	if v, found := raw["assignee_account_id"]; found {
		var candidate *int64
		if string(v) != "null" {
			var x int64
			if json.Unmarshal(v, &x) != nil || x < 1 {
				httpx.Error(w, 400, "invalid assignee_account_id")
				return
			}
			candidate = &x
		}
		old := int64(0)
		if newAssignee != nil {
			old = *newAssignee
		}
		next := int64(0)
		if candidate != nil {
			next = *candidate
		}
		if old != next {
			assignmentChanged = true
			newAssignee = candidate
			if candidate != nil {
				newAssigneeName, notifyEmail, err = h.eligibleAssignee(r.Context(), *candidate)
				if err != nil {
					httpx.Error(w, 400, "assignee is not eligible staff")
					return
				}
			} else {
				newAssigneeName = ""
			}
			changes["assignee"] = map[string]any{"old_id": old, "old_name": oldAssigneeName, "new_id": next, "new_name": newAssigneeName}
		}
	}
	if err := validateInput(taskInput{Title: newTitle, Description: newDesc, DueOn: newDue}, false); err != nil {
		httpx.Error(w, 400, err.Error())
		return
	}
	if len(changes) == 0 {
		tx.Rollback(r.Context())
		h.get(w, r)
		return
	}
	actorID, actorName := actor(r)
	_, err = tx.Exec(r.Context(), `UPDATE tasks SET title=$1,description=$2,due_on=NULLIF($3,'')::date,assignee_account_id=$4,assignee_display_name_snapshot=$5,updated_by_account_id=$6,updated_at=NOW() WHERE id=$7`, newTitle, newDesc, newDue, newAssignee, nullable(newAssigneeName), actorID, id)
	if err != nil {
		httpx.Error(w, 500, "failed to update task")
		return
	}
	action := "edited"
	if assignmentChanged {
		if newAssignee == nil {
			action = "unassigned"
		} else {
			action = "assigned"
		}
	}
	auditID, err := insertAudit(r.Context(), tx, id, eventID, action, actorID, actorName, changes)
	if err == nil && assignmentChanged && newAssignee != nil && *newAssignee != actorID {
		var eventName string
		_ = tx.QueryRow(r.Context(), "SELECT name FROM events WHERE id=$1", eventID).Scan(&eventName)
		err = h.insertNotification(r.Context(), tx, id, auditID, *newAssignee, "assigned", notifyEmail, eventName, newTitle, actorName, newDue, "")
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		httpx.Error(w, 500, "failed to update task")
		return
	}
	h.publish(eventID, id, action)
	h.deliverQueued()
	h.get(w, r)
}

func versionsMatch(current, expected time.Time) bool {
	return !current.IsZero() && !expected.IsZero() && current.Equal(expected)
}

func (h *Handler) stateChange(w http.ResponseWriter, r *http.Request, complete bool) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "failed to update task")
		return
	}
	defer tx.Rollback(r.Context())
	var eventID int64
	var completed *time.Time
	var deleted *time.Time
	err = tx.QueryRow(r.Context(), "SELECT event_id,completed_at,deleted_at FROM tasks WHERE id=$1 FOR UPDATE", id).Scan(&eventID, &completed, &deleted)
	if err == pgx.ErrNoRows {
		httpx.Error(w, 404, "task not found")
		return
	}
	if err != nil {
		httpx.Error(w, 500, "failed to update task")
		return
	}
	if deleted != nil {
		httpx.Error(w, 409, "deleted tasks are read-only")
		return
	}
	if (complete && completed != nil) || (!complete && completed == nil) {
		tx.Rollback(r.Context())
		h.get(w, r)
		return
	}
	actorID, actorName := actor(r)
	action := "completed"
	if complete {
		_, err = tx.Exec(r.Context(), "UPDATE tasks SET completed_at=NOW(),completed_by_account_id=$1,completed_by_display_name_snapshot=$2,updated_by_account_id=$1,updated_at=NOW() WHERE id=$3", actorID, actorName, id)
	} else {
		action = "reopened"
		_, err = tx.Exec(r.Context(), "UPDATE tasks SET completed_at=NULL,completed_by_account_id=NULL,completed_by_display_name_snapshot=NULL,updated_by_account_id=$1,updated_at=NOW() WHERE id=$2", actorID, id)
	}
	if err == nil {
		_, err = insertAudit(r.Context(), tx, id, eventID, action, actorID, actorName, map[string]any{})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		httpx.Error(w, 500, "failed to update task")
		return
	}
	h.publish(eventID, id, action)
	h.get(w, r)
}
func (h *Handler) complete(w http.ResponseWriter, r *http.Request) { h.stateChange(w, r, true) }
func (h *Handler) reopen(w http.ResponseWriter, r *http.Request)   { h.stateChange(w, r, false) }

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	var p struct {
		Reason string `json:"reason"`
	}
	if r.Body != nil && r.ContentLength != 0 {
		_ = httpx.DecodeJSON(r, &p)
	}
	p.Reason = strings.TrimSpace(p.Reason)
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "failed to delete task")
		return
	}
	defer tx.Rollback(r.Context())
	var eventID int64
	var deleted *time.Time
	err = tx.QueryRow(r.Context(), "SELECT event_id,deleted_at FROM tasks WHERE id=$1 FOR UPDATE", id).Scan(&eventID, &deleted)
	if err == pgx.ErrNoRows {
		httpx.Error(w, 404, "task not found")
		return
	}
	if deleted != nil {
		tx.Rollback(r.Context())
		w.WriteHeader(204)
		return
	}
	actorID, actorName := actor(r)
	_, err = tx.Exec(r.Context(), "UPDATE tasks SET deleted_at=NOW(),deleted_by_account_id=$1,deleted_by_display_name_snapshot=$2,deleted_reason=$3,updated_by_account_id=$1,updated_at=NOW() WHERE id=$4", actorID, actorName, nullable(p.Reason), id)
	if err == nil {
		_, err = insertAudit(r.Context(), tx, id, eventID, "deleted", actorID, actorName, map[string]any{"reason": p.Reason})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		httpx.Error(w, 500, "failed to delete task")
		return
	}
	h.publish(eventID, id, "deleted")
	w.WriteHeader(204)
}
func (h *Handler) restore(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "failed to restore task")
		return
	}
	defer tx.Rollback(r.Context())
	var eventID int64
	var deleted *time.Time
	err = tx.QueryRow(r.Context(), "SELECT event_id,deleted_at FROM tasks WHERE id=$1 FOR UPDATE", id).Scan(&eventID, &deleted)
	if err == pgx.ErrNoRows {
		httpx.Error(w, 404, "task not found")
		return
	}
	if deleted == nil {
		tx.Rollback(r.Context())
		h.get(w, r)
		return
	}
	actorID, actorName := actor(r)
	_, err = tx.Exec(r.Context(), "UPDATE tasks SET deleted_at=NULL,deleted_by_account_id=NULL,deleted_by_display_name_snapshot=NULL,deleted_reason=NULL,updated_by_account_id=$1,updated_at=NOW() WHERE id=$2", actorID, id)
	if err == nil {
		_, err = insertAudit(r.Context(), tx, id, eventID, "restored", actorID, actorName, map[string]any{})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		httpx.Error(w, 500, "failed to restore task")
		return
	}
	h.publish(eventID, id, "restored")
	h.get(w, r)
}

func (h *Handler) comments(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT id,task_id,body,author_display_name_snapshot,created_at FROM task_comments WHERE task_id=$1 ORDER BY created_at,id`, id)
	if err != nil {
		httpx.Error(w, 500, "failed to load comments")
		return
	}
	defer rows.Close()
	out := []Comment{}
	for rows.Next() {
		var c Comment
		if rows.Scan(&c.ID, &c.TaskID, &c.Body, &c.AuthorName, &c.CreatedAt) != nil {
			httpx.Error(w, 500, "failed to parse comments")
			return
		}
		out = append(out, c)
	}
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) addComment(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	var p struct {
		Body string `json:"body"`
	}
	if httpx.DecodeJSON(r, &p) != nil {
		httpx.Error(w, 400, "invalid request payload")
		return
	}
	p.Body = strings.TrimSpace(p.Body)
	if len(p.Body) < 1 || len(p.Body) > 10000 {
		httpx.Error(w, 400, "comment must be between 1 and 10000 characters")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "failed to add comment")
		return
	}
	defer tx.Rollback(r.Context())
	var eventID int64
	var eventName, title, due string
	var assignee sql.NullInt64
	var deleted *time.Time
	err = tx.QueryRow(r.Context(), `SELECT t.event_id,e.name,t.title,COALESCE(to_char(t.due_on,'YYYY-MM-DD'),''),t.assignee_account_id,t.deleted_at FROM tasks t JOIN events e ON e.id=t.event_id WHERE t.id=$1 FOR UPDATE`, id).Scan(&eventID, &eventName, &title, &due, &assignee, &deleted)
	if err == pgx.ErrNoRows {
		httpx.Error(w, 404, "task not found")
		return
	}
	if deleted != nil {
		httpx.Error(w, 409, "deleted tasks are read-only")
		return
	}
	actorID, actorName := actor(r)
	var c Comment
	err = tx.QueryRow(r.Context(), `INSERT INTO task_comments(task_id,body,author_account_id,author_display_name_snapshot) VALUES($1,$2,$3,$4) RETURNING id,task_id,body,author_display_name_snapshot,created_at`, id, p.Body, actorID, actorName).Scan(&c.ID, &c.TaskID, &c.Body, &c.AuthorName, &c.CreatedAt)
	if err != nil {
		httpx.Error(w, 500, "failed to add comment")
		return
	}
	auditID, err := insertAudit(r.Context(), tx, id, eventID, "commented", actorID, actorName, map[string]any{"comment_id": c.ID})
	if err == nil && assignee.Valid && assignee.Int64 != actorID {
		_, email, e := h.eligibleAssignee(r.Context(), assignee.Int64)
		if e == nil {
			err = h.insertNotification(r.Context(), tx, id, auditID, assignee.Int64, "commented", email, eventName, title, actorName, due, p.Body)
		}
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		httpx.Error(w, 500, "failed to add comment")
		return
	}
	h.publish(eventID, id, "commented")
	h.deliverQueued()
	httpx.WriteJSON(w, 201, c)
}

func (h *Handler) audit(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT id,action,actor_display_name_snapshot,changes,created_at FROM task_audit_events WHERE task_id=$1 ORDER BY created_at DESC,id DESC`, id)
	if err != nil {
		httpx.Error(w, 500, "failed to load audit history")
		return
	}
	defer rows.Close()
	out := []AuditEvent{}
	for rows.Next() {
		var x AuditEvent
		if rows.Scan(&x.ID, &x.Action, &x.ActorName, &x.Changes, &x.CreatedAt) != nil {
			httpx.Error(w, 500, "failed to parse audit history")
			return
		}
		out = append(out, x)
	}
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) assignees(w http.ResponseWriter, r *http.Request) {
	q := "%" + strings.TrimSpace(r.URL.Query().Get("q")) + "%"
	rows, err := h.db.Query(r.Context(), `SELECT a.id,COALESCE(NULLIF(btrim(a.full_name),''),a.email),array_agg(ar.role_name ORDER BY ar.role_name) FROM accounts a JOIN account_roles ar ON ar.account_id=a.id WHERE ar.role_name=ANY($1) AND (COALESCE(a.full_name,'') ILIKE $2 OR a.email ILIKE $2) GROUP BY a.id,a.full_name,a.email ORDER BY 2`, staffRoles, q)
	if err != nil {
		httpx.Error(w, 500, "failed to load staff")
		return
	}
	defer rows.Close()
	type item struct {
		ID    int64    `json:"id"`
		Name  string   `json:"name"`
		Roles []string `json:"roles"`
	}
	out := []item{}
	for rows.Next() {
		var x item
		if rows.Scan(&x.ID, &x.Name, &x.Roles) != nil {
			httpx.Error(w, 500, "failed to parse staff")
			return
		}
		out = append(out, x)
	}
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) notificationSummary(w http.ResponseWriter, r *http.Request) {
	accountID, _ := actor(r)
	rows, err := h.db.Query(r.Context(), `SELECT DISTINCT task_id FROM task_notifications WHERE recipient_account_id=$1 AND read_at IS NULL ORDER BY task_id`, accountID)
	if err != nil {
		httpx.Error(w, 500, "failed to load notifications")
		return
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		_ = rows.Scan(&id)
		ids = append(ids, id)
	}
	httpx.WriteJSON(w, 200, map[string]any{"unread_count": len(ids), "task_ids": ids})
}
func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	accountID, _ := actor(r)
	_, err := h.db.Exec(r.Context(), `UPDATE task_notifications SET read_at=NOW() WHERE task_id=$1 AND recipient_account_id=$2 AND read_at IS NULL`, id, accountID)
	if err != nil {
		httpx.Error(w, 500, "failed to mark notifications read")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) stream(w http.ResponseWriter, r *http.Request) {
	h.streams.ServeHTTP(w, r, realtime.Topic("tasks", 0))
}

func (h *Handler) insertNotification(ctx context.Context, tx pgx.Tx, taskID, auditID, recipientID int64, kind, email, eventName, title, actorName, due, comment string) error {
	var notificationID int64
	err := tx.QueryRow(ctx, `INSERT INTO task_notifications(task_id,recipient_account_id,kind,source_audit_event_id) VALUES($1,$2,$3,$4) ON CONFLICT(recipient_account_id,source_audit_event_id) DO UPDATE SET kind=EXCLUDED.kind RETURNING id`, taskID, recipientID, kind, auditID).Scan(&notificationID)
	if err != nil {
		return err
	}
	subject := "Task assigned: " + title
	intro := actorName + " assigned this task to you."
	if kind == "commented" {
		subject = "New task comment: " + title
		intro = actorName + " added a comment to your task."
	}
	link := h.frontendURL + "/tasks?taskId=" + strconv.FormatInt(taskID, 10)
	if h.frontendURL == "" {
		link = "/tasks?taskId=" + strconv.FormatInt(taskID, 10)
	}
	body := intro + "\n\nEvent: " + eventName + "\nTask: " + title
	if due != "" {
		body += "\nDue: " + due
	}
	if comment != "" {
		excerpt := comment
		if len([]rune(excerpt)) > 500 {
			excerpt = string([]rune(excerpt)[:500]) + "…"
		}
		body += "\n\nComment:\n" + excerpt
	}
	body += "\n\nOpen task: " + link
	_, err = tx.Exec(ctx, `INSERT INTO task_email_deliveries(task_notification_id,recipient_email,subject,body) VALUES($1,$2,$3,$4) ON CONFLICT(task_notification_id) DO NOTHING`, notificationID, email, subject, body)
	return err
}

func (h *Handler) deliverQueued() {
	if h.sender == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		rows, err := h.db.Query(ctx, `UPDATE task_email_deliveries SET status='sending',attempt_count=attempt_count+1 WHERE id IN (SELECT id FROM task_email_deliveries WHERE status IN ('queued','failed') AND attempt_count<5 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING id,recipient_email,subject,body`)
		if err != nil {
			return
		}
		type delivery struct {
			id                int64
			to, subject, body string
		}
		items := []delivery{}
		for rows.Next() {
			var d delivery
			if rows.Scan(&d.id, &d.to, &d.subject, &d.body) == nil {
				items = append(items, d)
			}
		}
		rows.Close()
		for _, d := range items {
			htmlBody := "<div style=\"font-family:Arial,sans-serif;white-space:pre-wrap\">" + strings.ReplaceAll(html.EscapeString(d.body), "\n", "<br>") + "</div>"
			result, e := h.sender.Send(ctx, comms.EmailMessage{To: d.to, Subject: d.subject, PlainText: d.body, HTML: htmlBody})
			if e != nil {
				_, _ = h.db.Exec(ctx, `UPDATE task_email_deliveries SET status='failed',last_error=$1 WHERE id=$2`, e.Error(), d.id)
			} else {
				_, _ = h.db.Exec(ctx, `UPDATE task_email_deliveries SET status='sent',provider_message_id=$1,sent_at=NOW(),last_error=NULL WHERE id=$2`, result.MessageID, d.id)
			}
		}
	}()
}

func (h *Handler) deliveryLoop() {
	h.deliverQueued()
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.deliverQueued()
	}
}

func (h *Handler) publish(eventID, taskID int64, reason string) {
	if h.streams == nil {
		return
	}
	payload := realtime.RelatedUpdatePayload("event", eventID, reason, "task", taskID)
	h.streams.Publish(realtime.Topic("event", eventID), "task.updated", payload)
	h.streams.Publish(realtime.Topic("tasks", 0), "task.updated", payload)
}
