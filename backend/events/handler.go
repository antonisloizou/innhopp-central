package events

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/rbac"
)

var (
	validEventStatuses = map[string]struct{}{
		"draft":    {},
		"planned":  {},
		"scouted":  {},
		"launched": {},
		"live":     {},
		"past":     {},
	}
	eventStatusValues = []string{"draft", "planned", "scouted", "launched", "live", "past"}
)

const defaultEventStatus = "draft"

// Handler provides read/write APIs for seasons, events, and manifests.
type Handler struct {
	db *pgxpool.Pool
}

// NewHandler creates an events handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes configures the HTTP routes for event resources.
func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewSeasons)).Get("/seasons", h.listSeasons)
	r.With(enforcer.Authorize(rbac.PermissionManageSeasons)).Post("/seasons", h.createSeason)
	r.With(enforcer.Authorize(rbac.PermissionViewSeasons)).Get("/seasons/{seasonID}", h.getSeason)

	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/events", h.listEvents)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Post("/events", h.createEvent)
	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/events/{eventID}", h.getEvent)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Put("/events/{eventID}", h.updateEvent)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Delete("/events/{eventID}", h.deleteEvent)

	r.With(enforcer.Authorize(rbac.PermissionViewManifests)).Get("/manifests", h.listManifests)
	r.With(enforcer.Authorize(rbac.PermissionManageManifests)).Post("/manifests", h.createManifest)
	r.With(enforcer.Authorize(rbac.PermissionViewManifests)).Get("/manifests/{manifestID}", h.getManifest)
	return r
}

type Season struct {
	ID        int64      `json:"id"`
	Name      string     `json:"name"`
	StartsOn  time.Time  `json:"starts_on"`
	EndsOn    *time.Time `json:"ends_on,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type Event struct {
	ID             int64      `json:"id"`
	SeasonID       int64      `json:"season_id"`
	Name           string     `json:"name"`
	Location       string     `json:"location,omitempty"`
	Status         string     `json:"status"`
	StartsAt       time.Time  `json:"starts_at"`
	EndsAt         *time.Time `json:"ends_at,omitempty"`
	ParticipantIDs []int64    `json:"participant_ids"`
	Innhopps       []Innhopp  `json:"innhopps"`
	CreatedAt      time.Time  `json:"created_at"`
}

type Innhopp struct {
	ID          int64      `json:"id"`
	EventID     int64      `json:"event_id"`
	Sequence    int        `json:"sequence"`
	Name        string     `json:"name"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
	Notes       string     `json:"notes,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Manifest struct {
	ID          int64     `json:"id"`
	EventID     int64     `json:"event_id"`
	LoadNumber  int       `json:"load_number"`
	ScheduledAt time.Time `json:"scheduled_at"`
	Notes       string    `json:"notes,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type eventPayload struct {
	SeasonID       int64            `json:"season_id"`
	Name           string           `json:"name"`
	Location       string           `json:"location"`
	Status         string           `json:"status"`
	StartsAt       string           `json:"starts_at"`
	EndsAt         string           `json:"ends_at"`
	ParticipantIDs []int64          `json:"participant_ids"`
	Innhopps       []innhoppPayload `json:"innhopps"`
}

type innhoppPayload struct {
	Sequence    *int   `json:"sequence"`
	Name        string `json:"name"`
	ScheduledAt string `json:"scheduled_at"`
	Notes       string `json:"notes"`
}

type innhoppInput struct {
	Sequence    int
	Name        string
	ScheduledAt *time.Time
	Notes       string
}

func (h *Handler) listSeasons(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, name, starts_on, ends_on, created_at FROM seasons ORDER BY starts_on DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list seasons")
		return
	}
	defer rows.Close()

	var seasons []Season
	for rows.Next() {
		var s Season
		if err := rows.Scan(&s.ID, &s.Name, &s.StartsOn, &s.EndsOn, &s.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse season")
			return
		}
		seasons = append(seasons, s)
	}

	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list seasons")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, seasons)
}

func (h *Handler) createSeason(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name     string `json:"name"`
		StartsOn string `json:"starts_on"`
		EndsOn   string `json:"ends_on"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.Name == "" || payload.StartsOn == "" {
		httpx.Error(w, http.StatusBadRequest, "name and starts_on are required")
		return
	}

	startsOn, err := time.Parse("2006-01-02", payload.StartsOn)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "starts_on must be a date in YYYY-MM-DD format")
		return
	}

	var endsOn *time.Time
	if payload.EndsOn != "" {
		t, err := time.Parse("2006-01-02", payload.EndsOn)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "ends_on must be a date in YYYY-MM-DD format")
			return
		}
		endsOn = &t
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO seasons (name, starts_on, ends_on) VALUES ($1, $2, $3) RETURNING id, created_at`,
		payload.Name, startsOn, endsOn,
	)

	var season Season
	season.Name = payload.Name
	season.StartsOn = startsOn
	season.EndsOn = endsOn

	if err := row.Scan(&season.ID, &season.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create season")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, season)
}

func (h *Handler) getSeason(w http.ResponseWriter, r *http.Request) {
	seasonID, err := strconv.ParseInt(chi.URLParam(r, "seasonID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid season id")
		return
	}

	row := h.db.QueryRow(r.Context(), `SELECT id, name, starts_on, ends_on, created_at FROM seasons WHERE id = $1`, seasonID)
	var season Season
	if err := row.Scan(&season.ID, &season.Name, &season.StartsOn, &season.EndsOn, &season.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "season not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load season")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, season)
}

func (h *Handler) listEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, season_id, name, location, status, starts_at, ends_at, created_at FROM events ORDER BY starts_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list events")
		return
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.SeasonID, &e.Name, &e.Location, &e.Status, &e.StartsAt, &e.EndsAt, &e.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse event")
			return
		}
		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list events")
		return
	}

	events, err = h.attachEventRelations(r.Context(), events)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load event relations")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, events)
}

func (h *Handler) createEvent(w http.ResponseWriter, r *http.Request) {
	var payload eventPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.SeasonID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "season_id is required")
		return
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	status, err := normalizeEventStatus(payload.Status)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	startsAt, endsAt, err := parseEventTimes(payload.StartsAt, payload.EndsAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	participantIDs, err := normalizeParticipantIDs(payload.ParticipantIDs)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	innhopps, err := normalizeInnhopps(payload.Innhopps)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create event")
		return
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx,
		`INSERT INTO events (season_id, name, location, status, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
		payload.SeasonID, name, strings.TrimSpace(payload.Location), status, startsAt, endsAt,
	)

	var event Event
	event.SeasonID = payload.SeasonID
	event.Name = name
	event.Location = strings.TrimSpace(payload.Location)
	event.Status = status
	event.StartsAt = startsAt
	event.EndsAt = endsAt

	if err := row.Scan(&event.ID, &event.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create event")
		return
	}

	if err := replaceEventParticipantsTx(ctx, tx, event.ID, participantIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save participants")
		return
	}

	if err := replaceEventInnhoppsTx(ctx, tx, event.ID, innhopps); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save innhopps")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create event")
		return
	}

	created, err := h.fetchEvent(ctx, event.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load event")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) getEvent(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	event, err := h.fetchEvent(r.Context(), eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "event not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load event")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, event)
}

func (h *Handler) updateEvent(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var payload eventPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.SeasonID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "season_id is required")
		return
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	status, err := normalizeEventStatus(payload.Status)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	startsAt, endsAt, err := parseEventTimes(payload.StartsAt, payload.EndsAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	participantIDs, err := normalizeParticipantIDs(payload.ParticipantIDs)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	innhopps, err := normalizeInnhopps(payload.Innhopps)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update event")
		return
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE events SET season_id = $1, name = $2, location = $3, status = $4, starts_at = $5, ends_at = $6 WHERE id = $7`,
		payload.SeasonID, name, strings.TrimSpace(payload.Location), status, startsAt, endsAt, eventID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update event")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}

	if err := replaceEventParticipantsTx(ctx, tx, eventID, participantIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save participants")
		return
	}

	if err := replaceEventInnhoppsTx(ctx, tx, eventID, innhopps); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save innhopps")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update event")
		return
	}

	updated, err := h.fetchEvent(ctx, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load event")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteEvent(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM events WHERE id = $1`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete event")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listManifests(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, event_id, load_number, scheduled_at, notes, created_at FROM manifests ORDER BY scheduled_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list manifests")
		return
	}
	defer rows.Close()

	var manifests []Manifest
	for rows.Next() {
		var m Manifest
		if err := rows.Scan(&m.ID, &m.EventID, &m.LoadNumber, &m.ScheduledAt, &m.Notes, &m.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse manifest")
			return
		}
		manifests = append(manifests, m)
	}

	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list manifests")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, manifests)
}

func (h *Handler) createManifest(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		EventID     int64  `json:"event_id"`
		LoadNumber  int    `json:"load_number"`
		ScheduledAt string `json:"scheduled_at"`
		Notes       string `json:"notes"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID == 0 || payload.LoadNumber == 0 || payload.ScheduledAt == "" {
		httpx.Error(w, http.StatusBadRequest, "event_id, load_number, and scheduled_at are required")
		return
	}

	scheduledAt, err := time.Parse(time.RFC3339, payload.ScheduledAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO manifests (event_id, load_number, scheduled_at, notes) VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
		payload.EventID, payload.LoadNumber, scheduledAt, payload.Notes,
	)

	var manifest Manifest
	manifest.EventID = payload.EventID
	manifest.LoadNumber = payload.LoadNumber
	manifest.ScheduledAt = scheduledAt
	manifest.Notes = payload.Notes

	if err := row.Scan(&manifest.ID, &manifest.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create manifest")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, manifest)
}

func (h *Handler) getManifest(w http.ResponseWriter, r *http.Request) {
	manifestID, err := strconv.ParseInt(chi.URLParam(r, "manifestID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid manifest id")
		return
	}

	row := h.db.QueryRow(r.Context(), `SELECT id, event_id, load_number, scheduled_at, notes, created_at FROM manifests WHERE id = $1`, manifestID)
	var manifest Manifest
	if err := row.Scan(&manifest.ID, &manifest.EventID, &manifest.LoadNumber, &manifest.ScheduledAt, &manifest.Notes, &manifest.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "manifest not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load manifest")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, manifest)
}

func (h *Handler) fetchEvent(ctx context.Context, eventID int64) (Event, error) {
	row := h.db.QueryRow(ctx, `SELECT id, season_id, name, location, status, starts_at, ends_at, created_at FROM events WHERE id = $1`, eventID)
	var event Event
	if err := row.Scan(&event.ID, &event.SeasonID, &event.Name, &event.Location, &event.Status, &event.StartsAt, &event.EndsAt, &event.CreatedAt); err != nil {
		return Event{}, err
	}

	events, err := h.attachEventRelations(ctx, []Event{event})
	if err != nil {
		return Event{}, err
	}
	if len(events) == 0 {
		return Event{}, pgx.ErrNoRows
	}
	return events[0], nil
}

func (h *Handler) attachEventRelations(ctx context.Context, events []Event) ([]Event, error) {
	if len(events) == 0 {
		return events, nil
	}

	ids := make([]int64, len(events))
	for i, event := range events {
		ids[i] = event.ID
	}

	participantMap, err := h.fetchParticipantsForEvents(ctx, ids)
	if err != nil {
		return nil, err
	}

	innhoppMap, err := h.fetchInnhoppsForEvents(ctx, ids)
	if err != nil {
		return nil, err
	}

	attached := make([]Event, len(events))
	copy(attached, events)
	for i := range attached {
		attached[i].ParticipantIDs = participantMap[attached[i].ID]
		attached[i].Innhopps = innhoppMap[attached[i].ID]
	}
	return attached, nil
}

func (h *Handler) fetchParticipantsForEvents(ctx context.Context, eventIDs []int64) (map[int64][]int64, error) {
	result := make(map[int64][]int64, len(eventIDs))
	rows, err := h.db.Query(ctx,
		`SELECT event_id, participant_id
         FROM event_participants
         WHERE event_id = ANY($1::bigint[])
         ORDER BY event_id, participant_id`,
		pgx.Array(eventIDs),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var eventID, participantID int64
		if err := rows.Scan(&eventID, &participantID); err != nil {
			return nil, err
		}
		result[eventID] = append(result[eventID], participantID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}

func (h *Handler) fetchInnhoppsForEvents(ctx context.Context, eventIDs []int64) (map[int64][]Innhopp, error) {
	result := make(map[int64][]Innhopp, len(eventIDs))
	rows, err := h.db.Query(ctx,
		`SELECT id, event_id, sequence, name, scheduled_at, notes, created_at
         FROM event_innhopps
         WHERE event_id = ANY($1::bigint[])
         ORDER BY event_id, sequence, id`,
		pgx.Array(eventIDs),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var innhopp Innhopp
		if err := rows.Scan(&innhopp.ID, &innhopp.EventID, &innhopp.Sequence, &innhopp.Name, &innhopp.ScheduledAt, &innhopp.Notes, &innhopp.CreatedAt); err != nil {
			return nil, err
		}
		result[innhopp.EventID] = append(result[innhopp.EventID], innhopp)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}

func normalizeEventStatus(raw string) (string, error) {
	status := strings.ToLower(strings.TrimSpace(raw))
	if status == "" {
		status = defaultEventStatus
	}
	if _, ok := validEventStatuses[status]; !ok {
		return "", errors.New("status must be one of: " + strings.Join(eventStatusValues, ", "))
	}
	return status, nil
}

func parseEventTimes(starts, ends string) (time.Time, *time.Time, error) {
	starts = strings.TrimSpace(starts)
	if starts == "" {
		return time.Time{}, nil, errors.New("starts_at is required")
	}

	startsAt, err := time.Parse(time.RFC3339, starts)
	if err != nil {
		return time.Time{}, nil, errors.New("starts_at must be RFC3339 timestamp")
	}

	if strings.TrimSpace(ends) == "" {
		return startsAt, nil, nil
	}

	endsAt, err := time.Parse(time.RFC3339, strings.TrimSpace(ends))
	if err != nil {
		return time.Time{}, nil, errors.New("ends_at must be RFC3339 timestamp")
	}
	if endsAt.Before(startsAt) {
		return time.Time{}, nil, errors.New("ends_at cannot be before starts_at")
	}

	return startsAt, &endsAt, nil
}

func normalizeParticipantIDs(raw []int64) ([]int64, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	seen := make(map[int64]struct{}, len(raw))
	ids := make([]int64, 0, len(raw))
	for _, id := range raw {
		if id <= 0 {
			return nil, errors.New("participant_ids must contain positive integers")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}

	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids, nil
}

func normalizeInnhopps(raw []innhoppPayload) ([]innhoppInput, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	innhopps := make([]innhoppInput, 0, len(raw))
	for i, payload := range raw {
		name := strings.TrimSpace(payload.Name)
		if name == "" {
			return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].name is required")
		}

		sequence := i + 1
		if payload.Sequence != nil {
			if *payload.Sequence <= 0 {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].sequence must be positive")
			}
			sequence = *payload.Sequence
		}

		var scheduled *time.Time
		if strings.TrimSpace(payload.ScheduledAt) != "" {
			t, err := time.Parse(time.RFC3339, strings.TrimSpace(payload.ScheduledAt))
			if err != nil {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].scheduled_at must be RFC3339 timestamp")
			}
			scheduled = &t
		}

		innhopps = append(innhopps, innhoppInput{
			Sequence:    sequence,
			Name:        name,
			ScheduledAt: scheduled,
			Notes:       strings.TrimSpace(payload.Notes),
		})
	}

	sort.SliceStable(innhopps, func(i, j int) bool {
		if innhopps[i].Sequence == innhopps[j].Sequence {
			return i < j
		}
		return innhopps[i].Sequence < innhopps[j].Sequence
	})

	return innhopps, nil
}

func replaceEventParticipantsTx(ctx context.Context, tx pgx.Tx, eventID int64, participantIDs []int64) error {
	if _, err := tx.Exec(ctx, `DELETE FROM event_participants WHERE event_id = $1`, eventID); err != nil {
		return err
	}
	if len(participantIDs) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, participantID := range participantIDs {
		batch.Queue(`INSERT INTO event_participants (event_id, participant_id) VALUES ($1, $2)`, eventID, participantID)
	}

	br := tx.SendBatch(ctx, batch)
	defer br.Close()
	for range participantIDs {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

func replaceEventInnhoppsTx(ctx context.Context, tx pgx.Tx, eventID int64, innhopps []innhoppInput) error {
	if _, err := tx.Exec(ctx, `DELETE FROM event_innhopps WHERE event_id = $1`, eventID); err != nil {
		return err
	}
	if len(innhopps) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, innhopp := range innhopps {
		batch.Queue(`INSERT INTO event_innhopps (event_id, sequence, name, scheduled_at, notes) VALUES ($1, $2, $3, $4, $5)`,
			eventID, innhopp.Sequence, innhopp.Name, innhopp.ScheduledAt, innhopp.Notes)
	}

	br := tx.SendBatch(ctx, batch)
	defer br.Close()
	for range innhopps {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}
