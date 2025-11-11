package events

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
)

// Handler provides read/write APIs for seasons, events, and manifests.
type Handler struct {
	db *pgxpool.Pool
}

// NewHandler creates an events handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes configures the HTTP routes for event resources.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/seasons", h.listSeasons)
	r.Post("/seasons", h.createSeason)
	r.Get("/seasons/{seasonID}", h.getSeason)

	r.Get("/events", h.listEvents)
	r.Post("/events", h.createEvent)
	r.Get("/events/{eventID}", h.getEvent)

	r.Get("/manifests", h.listManifests)
	r.Post("/manifests", h.createManifest)
	r.Get("/manifests/{manifestID}", h.getManifest)
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
	ID        int64      `json:"id"`
	SeasonID  int64      `json:"season_id"`
	Name      string     `json:"name"`
	Location  string     `json:"location,omitempty"`
	StartsAt  time.Time  `json:"starts_at"`
	EndsAt    *time.Time `json:"ends_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type Manifest struct {
	ID          int64     `json:"id"`
	EventID     int64     `json:"event_id"`
	LoadNumber  int       `json:"load_number"`
	ScheduledAt time.Time `json:"scheduled_at"`
	Notes       string    `json:"notes,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
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
	rows, err := h.db.Query(r.Context(), `SELECT id, season_id, name, location, starts_at, ends_at, created_at FROM events ORDER BY starts_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list events")
		return
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.SeasonID, &e.Name, &e.Location, &e.StartsAt, &e.EndsAt, &e.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse event")
			return
		}
		events = append(events, e)
	}

	httpx.WriteJSON(w, http.StatusOK, events)
}

func (h *Handler) createEvent(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		SeasonID int64  `json:"season_id"`
		Name     string `json:"name"`
		Location string `json:"location"`
		StartsAt string `json:"starts_at"`
		EndsAt   string `json:"ends_at"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.SeasonID == 0 || payload.Name == "" || payload.StartsAt == "" {
		httpx.Error(w, http.StatusBadRequest, "season_id, name, and starts_at are required")
		return
	}

	startsAt, err := time.Parse(time.RFC3339, payload.StartsAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "starts_at must be RFC3339 timestamp")
		return
	}

	var endsAt *time.Time
	if payload.EndsAt != "" {
		t, err := time.Parse(time.RFC3339, payload.EndsAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "ends_at must be RFC3339 timestamp")
			return
		}
		endsAt = &t
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO events (season_id, name, location, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
		payload.SeasonID, payload.Name, payload.Location, startsAt, endsAt,
	)

	var event Event
	event.SeasonID = payload.SeasonID
	event.Name = payload.Name
	event.Location = payload.Location
	event.StartsAt = startsAt
	event.EndsAt = endsAt

	if err := row.Scan(&event.ID, &event.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create event")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, event)
}

func (h *Handler) getEvent(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	row := h.db.QueryRow(r.Context(), `SELECT id, season_id, name, location, starts_at, ends_at, created_at FROM events WHERE id = $1`, eventID)
	var event Event
	if err := row.Scan(&event.ID, &event.SeasonID, &event.Name, &event.Location, &event.StartsAt, &event.EndsAt, &event.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "event not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load event")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, event)
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
