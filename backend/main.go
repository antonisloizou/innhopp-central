package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	db *pgxpool.Pool
}

type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type Event struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	StartDate time.Time `json:"start_date"`
	CreatedAt time.Time `json:"created_at"`
}

type EventRole struct {
	EventID int64  `json:"event_id"`
	Event   string `json:"event"`
	UserID  int64  `json:"user_id"`
	User    string `json:"user"`
	Email   string `json:"email"`
	Role    string `json:"role"`
}

type assignRoleRequest struct {
	UserID int64  `json:"user_id"`
	Role   string `json:"role"`
}

type eventRequest struct {
	Name      string `json:"name"`
	StartDate string `json:"start_date"`
}

type userRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

func main() {
	ctx := context.Background()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("failed to create connection pool: %v", err)
	}
	defer pool.Close()

	if err := ensureSchema(ctx, pool); err != nil {
		log.Fatalf("failed to ensure schema: %v", err)
	}

	app := &App{db: pool}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/api/roles", app.rolesHandler)
	mux.HandleFunc("/api/users", app.usersHandler)
	mux.HandleFunc("/api/users/", app.userHandler)
	mux.HandleFunc("/api/events", app.eventsHandler)
	mux.HandleFunc("/api/events/", app.eventHandler)

	addr := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		addr = ":" + port
	}

	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, loggingMiddleware(mux)); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func ensureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            start_date DATE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS roles (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        )`,
		`CREATE TABLE IF NOT EXISTS event_user_roles (
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY(event_id, user_id, role_id)
        )`,
	}

	for _, stmt := range stmts {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}

	roles := []string{
		"Admin",
		"Staff",
		"Jump Master",
		"Jump Leader",
		"Ground Crew",
		"Driver",
		"Packer",
		"Participant",
	}

	for _, role := range roles {
		if _, err := pool.Exec(ctx, `INSERT INTO roles(name) VALUES($1) ON CONFLICT (name) DO NOTHING`, role); err != nil {
			return err
		}
	}

	return nil
}

func (a *App) rolesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	a.ListRoles(w, r)
}

func (a *App) usersHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.ListUsers(w, r)
	case http.MethodPost:
		a.CreateUser(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) userHandler(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/users/")
	if idStr == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	id, err := parseIDParam(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		a.GetUserByID(w, r, id)
	case http.MethodPut:
		a.UpdateUserByID(w, r, id)
	case http.MethodDelete:
		a.DeleteUserByID(w, r, id)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) eventsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.ListEvents(w, r)
	case http.MethodPost:
		a.CreateEvent(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) eventHandler(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/events/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	id, err := parseIDParam(parts[0])
	if err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			a.GetEventByID(w, r, id)
		case http.MethodPut:
			a.UpdateEventByID(w, r, id)
		case http.MethodDelete:
			a.DeleteEventByID(w, r, id)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}

	if parts[1] != "roles" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodGet:
		a.ListEventRolesByID(w, r, id)
	case http.MethodPost:
		a.AssignRoleToUserByID(w, r, id)
	case http.MethodDelete:
		a.RemoveRoleFromUserByID(w, r, id)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, name, email, created_at FROM users ORDER BY id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt); err != nil {
			respondError(w, http.StatusInternalServerError, err)
			return
		}
		users = append(users, u)
	}

	writeJSON(w, http.StatusOK, users)
}

func (a *App) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req userRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}

	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Email) == "" {
		respondError(w, http.StatusBadRequest, errors.New("name and email are required"))
		return
	}

	var user User
	err := a.db.QueryRow(r.Context(),
		`INSERT INTO users(name, email) VALUES($1, $2) RETURNING id, name, email, created_at`,
		req.Name, strings.ToLower(req.Email),
	).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			respondError(w, http.StatusConflict, fmt.Errorf("user with email %s already exists", req.Email))
			return
		}
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

func (a *App) GetUserByID(w http.ResponseWriter, r *http.Request, id int64) {
	var user User
	err := a.db.QueryRow(r.Context(), `SELECT id, name, email, created_at FROM users WHERE id=$1`, id).
		Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, fmt.Errorf("user %d not found", id))
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (a *App) UpdateUserByID(w http.ResponseWriter, r *http.Request, id int64) {
	var req userRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}

	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Email) == "" {
		respondError(w, http.StatusBadRequest, errors.New("name and email are required"))
		return
	}

	var user User
	err := a.db.QueryRow(r.Context(),
		`UPDATE users SET name=$1, email=$2 WHERE id=$3 RETURNING id, name, email, created_at`,
		req.Name, strings.ToLower(req.Email), id,
	).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, fmt.Errorf("user %d not found", id))
		return
	}
	if err != nil {
		if isUniqueViolation(err) {
			respondError(w, http.StatusConflict, fmt.Errorf("email %s already in use", req.Email))
			return
		}
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (a *App) DeleteUserByID(w http.ResponseWriter, r *http.Request, id int64) {
	cmd, err := a.db.Exec(r.Context(), `DELETE FROM users WHERE id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, fmt.Errorf("user %d not found", id))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *App) ListEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, name, start_date, created_at FROM events ORDER BY start_date`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var ev Event
		if err := rows.Scan(&ev.ID, &ev.Name, &ev.StartDate, &ev.CreatedAt); err != nil {
			respondError(w, http.StatusInternalServerError, err)
			return
		}
		events = append(events, ev)
	}

	writeJSON(w, http.StatusOK, events)
}

func (a *App) CreateEvent(w http.ResponseWriter, r *http.Request) {
	var req eventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.StartDate) == "" {
		respondError(w, http.StatusBadRequest, errors.New("name and start_date are required"))
		return
	}

	startDate, err := time.Parse(time.RFC3339, req.StartDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, fmt.Errorf("invalid start_date: %w", err))
		return
	}

	var event Event
	err = a.db.QueryRow(r.Context(),
		`INSERT INTO events(name, start_date) VALUES($1, $2) RETURNING id, name, start_date, created_at`,
		req.Name, startDate,
	).Scan(&event.ID, &event.Name, &event.StartDate, &event.CreatedAt)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, event)
}

func (a *App) GetEventByID(w http.ResponseWriter, r *http.Request, id int64) {
	var event Event
	err := a.db.QueryRow(r.Context(), `SELECT id, name, start_date, created_at FROM events WHERE id=$1`, id).
		Scan(&event.ID, &event.Name, &event.StartDate, &event.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, fmt.Errorf("event %d not found", id))
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, event)
}

func (a *App) UpdateEventByID(w http.ResponseWriter, r *http.Request, id int64) {
	var req eventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.StartDate) == "" {
		respondError(w, http.StatusBadRequest, errors.New("name and start_date are required"))
		return
	}

	startDate, err := time.Parse(time.RFC3339, req.StartDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, fmt.Errorf("invalid start_date: %w", err))
		return
	}

	var event Event
	err = a.db.QueryRow(r.Context(),
		`UPDATE events SET name=$1, start_date=$2 WHERE id=$3 RETURNING id, name, start_date, created_at`,
		req.Name, startDate, id,
	).Scan(&event.ID, &event.Name, &event.StartDate, &event.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, fmt.Errorf("event %d not found", id))
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, event)
}

func (a *App) DeleteEventByID(w http.ResponseWriter, r *http.Request, id int64) {
	cmd, err := a.db.Exec(r.Context(), `DELETE FROM events WHERE id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, fmt.Errorf("event %d not found", id))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *App) ListRoles(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT name FROM roles ORDER BY name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	type role struct {
		Name string `json:"name"`
	}
	var roles []role
	for rows.Next() {
		var rl role
		if err := rows.Scan(&rl.Name); err != nil {
			respondError(w, http.StatusInternalServerError, err)
			return
		}
		roles = append(roles, rl)
	}

	writeJSON(w, http.StatusOK, roles)
}

func (a *App) ListEventRolesByID(w http.ResponseWriter, r *http.Request, eventID int64) {
	rows, err := a.db.Query(r.Context(), `
        SELECT e.id, e.name, u.id, u.name, u.email, r.name
        FROM event_user_roles eur
        JOIN events e ON e.id = eur.event_id
        JOIN users u ON u.id = eur.user_id
        JOIN roles r ON r.id = eur.role_id
        WHERE e.id = $1
        ORDER BY r.name, u.name
    `, eventID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	var assignments []EventRole
	for rows.Next() {
		var er EventRole
		if err := rows.Scan(&er.EventID, &er.Event, &er.UserID, &er.User, &er.Email, &er.Role); err != nil {
			respondError(w, http.StatusInternalServerError, err)
			return
		}
		assignments = append(assignments, er)
	}

	writeJSON(w, http.StatusOK, assignments)
}

func (a *App) AssignRoleToUserByID(w http.ResponseWriter, r *http.Request, eventID int64) {
	var req assignRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}
	if req.UserID == 0 || strings.TrimSpace(req.Role) == "" {
		respondError(w, http.StatusBadRequest, errors.New("user_id and role are required"))
		return
	}

	roleID, err := a.lookupRoleID(r.Context(), req.Role)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusBadRequest, fmt.Errorf("role %s is not recognized", req.Role))
			return
		}
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	_, err = a.db.Exec(r.Context(),
		`INSERT INTO event_user_roles(event_id, user_id, role_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING`,
		eventID, req.UserID, roleID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *App) RemoveRoleFromUserByID(w http.ResponseWriter, r *http.Request, eventID int64) {
	var req assignRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, err)
		return
	}
	if req.UserID == 0 || strings.TrimSpace(req.Role) == "" {
		respondError(w, http.StatusBadRequest, errors.New("user_id and role are required"))
		return
	}

	roleID, err := a.lookupRoleID(r.Context(), req.Role)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusBadRequest, fmt.Errorf("role %s is not recognized", req.Role))
			return
		}
		respondError(w, http.StatusInternalServerError, err)
		return
	}

	cmd, err := a.db.Exec(r.Context(),
		`DELETE FROM event_user_roles WHERE event_id=$1 AND user_id=$2 AND role_id=$3`,
		eventID, req.UserID, roleID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, fmt.Errorf("assignment not found"))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *App) lookupRoleID(ctx context.Context, role string) (int64, error) {
	var id int64
	err := a.db.QueryRow(ctx, `SELECT id FROM roles WHERE LOWER(name) = LOWER($1)`, role).Scan(&id)
	return id, err
}

func parseIDParam(val string) (int64, error) {
	if val == "" {
		return 0, errors.New("missing id parameter")
	}
	id, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid id: %w", err)
	}
	return id, nil
}

func isUniqueViolation(err error) bool {
	type pgError interface {
		SQLState() string
	}
	var perr pgError
	if errors.As(err, &perr) {
		return perr.SQLState() == "23505"
	}
	return false
}

func respondError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("failed to encode response: %v", err)
	}
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lrw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(lrw, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, lrw.status, time.Since(start))
	})
}

type loggingResponseWriter struct {
	http.ResponseWriter
	status int
}

func (lrw *loggingResponseWriter) WriteHeader(statusCode int) {
	lrw.status = statusCode
	lrw.ResponseWriter.WriteHeader(statusCode)
}
