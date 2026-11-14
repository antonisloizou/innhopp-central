package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/auth"
)

func TestTaskLifecycleAndStaleEditIntegration(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL not set; skipping task integration test")
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse database config: %v", err)
	}
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	db, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatalf("connect database: %v", err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	ensureTaskTestSchema(t, ctx, db)

	suffix := strconv.FormatInt(time.Now().UnixNano(), 10)
	var seasonID, eventID, accountID int64
	if err := db.QueryRow(ctx, `INSERT INTO seasons(name,starts_on) VALUES($1,CURRENT_DATE) RETURNING id`, "Tasks test "+suffix).Scan(&seasonID); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(context.Background(), `DELETE FROM seasons WHERE id=$1`, seasonID)
	if err := db.QueryRow(ctx, `INSERT INTO events(season_id,name,starts_at) VALUES($1,$2,NOW()) RETURNING id`, seasonID, "Tasks event "+suffix).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `INSERT INTO accounts(subject,email,full_name) VALUES($1,$2,'Task Tester') RETURNING id`, "task-test-"+suffix, "task-test-"+suffix+"@example.test").Scan(&accountID); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(context.Background(), `DELETE FROM accounts WHERE id=$1`, accountID)

	sessions, err := auth.NewSessionManager("task-integration-test-secret", false)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(db, nil, nil, "")
	router := chi.NewRouter()
	router.Use(sessions.Middleware)
	router.Post("/tasks", h.create)
	router.Patch("/tasks/{taskID}", h.update)
	router.Get("/tasks/{taskID}", h.get)
	router.Get("/tasks/{taskID}/audit", h.audit)

	authCookie := func() *http.Cookie {
		rec := httptest.NewRecorder()
		_, issueErr := sessions.Issue(rec, &auth.Claims{AccountID: accountID, Email: "task-test@example.test", FullName: "Task Tester", Roles: []string{"staff"}})
		if issueErr != nil {
			t.Fatal(issueErr)
		}
		return rec.Result().Cookies()[0]
	}()
	do := func(method, target, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(authCookie)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	createdRec := do(http.MethodPost, "/tasks", fmt.Sprintf(`{"event_id":%d,"title":"Integration task","description":"Exercise the lifecycle","due_on":"2000-01-01"}`, eventID))
	if createdRec.Code != http.StatusCreated {
		t.Fatalf("create: status=%d body=%s", createdRec.Code, createdRec.Body.String())
	}
	var created Task
	if err := json.NewDecoder(createdRec.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if !created.Overdue {
		t.Fatal("past open task should be server-calculated as overdue")
	}
	if _, err := db.Exec(ctx, `UPDATE tasks SET due_on=NULL WHERE id=$1`, created.ID); err != nil {
		t.Fatal(err)
	}
	withoutDueDate := do(http.MethodGet, "/tasks/"+strconv.FormatInt(created.ID, 10), "")
	if withoutDueDate.Code != http.StatusOK {
		t.Fatalf("get task without due date: status=%d body=%s", withoutDueDate.Code, withoutDueDate.Body.String())
	}
	var taskWithoutDueDate Task
	if err := json.NewDecoder(withoutDueDate.Body).Decode(&taskWithoutDueDate); err != nil {
		t.Fatal(err)
	}
	if taskWithoutDueDate.Overdue {
		t.Fatal("task without a due date must not be overdue")
	}

	firstEdit := do(http.MethodPatch, "/tasks/"+strconv.FormatInt(created.ID, 10), fmt.Sprintf(`{"title":"First edit","updated_at":%q}`, created.UpdatedAt.Format(time.RFC3339Nano)))
	if firstEdit.Code != http.StatusOK {
		t.Fatalf("first edit: status=%d body=%s", firstEdit.Code, firstEdit.Body.String())
	}
	staleEdit := do(http.MethodPatch, "/tasks/"+strconv.FormatInt(created.ID, 10), fmt.Sprintf(`{"title":"Stale edit","updated_at":%q}`, created.UpdatedAt.Format(time.RFC3339Nano)))
	if staleEdit.Code != http.StatusConflict {
		t.Fatalf("stale edit: got %d want 409 body=%s", staleEdit.Code, staleEdit.Body.String())
	}
	var conflict struct {
		Current Task `json:"current_task"`
	}
	if err := json.NewDecoder(staleEdit.Body).Decode(&conflict); err != nil {
		t.Fatal(err)
	}
	if conflict.Current.Title != "First edit" {
		t.Fatalf("conflict current task title=%q", conflict.Current.Title)
	}

	if _, err := db.Exec(ctx, `INSERT INTO task_audit_events(task_id,event_id,action,actor_account_id,actor_display_name_snapshot,changes) SELECT $1,$2,'edited',$3,'Task Tester','{}'::jsonb FROM generate_series(1,501)`, created.ID, eventID, accountID); err != nil {
		t.Fatal(err)
	}
	auditRec := do(http.MethodGet, "/tasks/"+strconv.FormatInt(created.ID, 10)+"/audit", "")
	if auditRec.Code != http.StatusOK {
		t.Fatalf("audit: %d %s", auditRec.Code, auditRec.Body.String())
	}
	var history []AuditEvent
	if err := json.NewDecoder(auditRec.Body).Decode(&history); err != nil {
		t.Fatal(err)
	}
	if len(history) < 503 {
		t.Fatalf("audit history was truncated: got %d entries", len(history))
	}
}

func ensureTaskTestSchema(t *testing.T, ctx context.Context, db *pgxpool.Pool) {
	t.Helper()
	statements := []string{
		`CREATE TABLE IF NOT EXISTS seasons(id SERIAL PRIMARY KEY,name TEXT NOT NULL,starts_on DATE NOT NULL,ends_on DATE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
		`CREATE TABLE IF NOT EXISTS events(id SERIAL PRIMARY KEY,season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,name TEXT NOT NULL,location TEXT,slots INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'draft',starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
		`CREATE TABLE IF NOT EXISTS accounts(id SERIAL PRIMARY KEY,subject TEXT NOT NULL UNIQUE,email TEXT NOT NULL,full_name TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
		`CREATE TABLE IF NOT EXISTS tasks(id BIGSERIAL PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL,assignee_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,assignee_display_name_snapshot TEXT,due_on DATE,completed_at TIMESTAMPTZ,completed_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,completed_by_display_name_snapshot TEXT,created_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,created_by_display_name_snapshot TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),deleted_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,deleted_by_display_name_snapshot TEXT,deleted_reason TEXT,deleted_at TIMESTAMPTZ)`,
		`CREATE TABLE IF NOT EXISTS task_comments(id BIGSERIAL PRIMARY KEY,task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,body TEXT NOT NULL,author_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,author_display_name_snapshot TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
		`CREATE TABLE IF NOT EXISTS task_audit_events(id BIGSERIAL PRIMARY KEY,task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,action TEXT NOT NULL,actor_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,actor_display_name_snapshot TEXT NOT NULL,changes JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
		`CREATE TABLE IF NOT EXISTS task_notifications(id BIGSERIAL PRIMARY KEY,task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,recipient_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,kind TEXT NOT NULL,source_audit_event_id BIGINT NOT NULL REFERENCES task_audit_events(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),read_at TIMESTAMPTZ,UNIQUE(recipient_account_id,source_audit_event_id))`,
		`CREATE TABLE IF NOT EXISTS task_email_deliveries(id BIGSERIAL PRIMARY KEY,task_notification_id BIGINT NOT NULL UNIQUE REFERENCES task_notifications(id) ON DELETE CASCADE,recipient_email TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempt_count INTEGER NOT NULL DEFAULT 0,provider_message_id TEXT,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),sent_at TIMESTAMPTZ)`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(ctx, statement); err != nil {
			t.Fatalf("ensure task test schema: %v", err)
		}
	}
}
