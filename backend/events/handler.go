package events

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/airfields"
	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/internal/timeutil"
	"github.com/innhopp/central/backend/rbac"
)

var (
	validEventStatuses = map[string]struct{}{
		"draft":    {},
		"planned":  {},
		"launched": {},
		"scouted":  {},
		"live":     {},
		"past":     {},
	}
	eventStatusValues = []string{"draft", "planned", "launched", "scouted", "live", "past"}
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
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Post("/events/{eventID}/copy", h.copyEvent)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Delete("/events/{eventID}", h.deleteEvent)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Post("/events/{eventID}/innhopps", h.createInnhopp)
	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/accommodations", h.listAllAccommodations)
	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/events/{eventID}/accommodations", h.listAccommodations)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Post("/events/{eventID}/accommodations", h.createAccommodation)
	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/events/{eventID}/accommodations/{accID}", h.getAccommodation)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Put("/events/{eventID}/accommodations/{accID}", h.updateAccommodation)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Delete("/events/{eventID}/accommodations/{accID}", h.deleteAccommodation)

	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/airfields", h.listAirfields)
	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/airfields/{airfieldID}", h.getAirfield)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Post("/airfields", h.createAirfield)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Put("/airfields/{airfieldID}", h.updateAirfield)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Delete("/airfields/{airfieldID}", h.deleteAirfield)

	r.With(enforcer.Authorize(rbac.PermissionViewManifests)).Get("/manifests", h.listManifests)
	r.With(enforcer.Authorize(rbac.PermissionManageManifests)).Post("/manifests", h.createManifest)
	r.With(enforcer.Authorize(rbac.PermissionViewManifests)).Get("/manifests/{manifestID}", h.getManifest)
	r.With(enforcer.Authorize(rbac.PermissionManageManifests)).Put("/manifests/{manifestID}", h.updateManifest)
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
	Slots          int        `json:"slots"`
	AirfieldIDs    []int64    `json:"airfield_ids"`
	ParticipantIDs []int64    `json:"participant_ids"`
	Innhopps       []Innhopp  `json:"innhopps"`
	CreatedAt      time.Time  `json:"created_at"`
}

type Accommodation struct {
	ID          int64      `json:"id"`
	EventID     int64      `json:"event_id"`
	Name        string     `json:"name"`
	Capacity    int        `json:"capacity"`
	Booked      *bool      `json:"booked,omitempty"`
	Coordinates *string    `json:"coordinates,omitempty"`
	CheckInAt   *time.Time `json:"check_in_at,omitempty"`
	CheckOutAt  *time.Time `json:"check_out_at,omitempty"`
	Notes       string     `json:"notes,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type LandingArea struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	Size        string `json:"size,omitempty"`
	Obstacles   string `json:"obstacles,omitempty"`
}

type LandOwner struct {
	Name      string `json:"name,omitempty"`
	Telephone string `json:"telephone,omitempty"`
	Email     string `json:"email,omitempty"`
}

type InnhoppImage struct {
	Name     string `json:"name,omitempty"`
	MimeType string `json:"mime_type,omitempty"`
	Data     string `json:"data,omitempty"`
}

type Innhopp struct {
	ID                   int64          `json:"id"`
	EventID              int64          `json:"event_id"`
	Sequence             int            `json:"sequence"`
	Name                 string         `json:"name"`
	Coordinates          string         `json:"coordinates,omitempty"`
	TakeoffAirfieldID    *int64         `json:"takeoff_airfield_id,omitempty"`
	Elevation            *int           `json:"elevation,omitempty"`
	ScheduledAt          *time.Time     `json:"scheduled_at,omitempty"`
	Notes                string         `json:"notes,omitempty"`
	ReasonForChoice      string         `json:"reason_for_choice,omitempty"`
	AdjustAltimeterAAD   string         `json:"adjust_altimeter_aad,omitempty"`
	Notam                string         `json:"notam,omitempty"`
	DistanceByAir        *float64       `json:"distance_by_air,omitempty"`
	DistanceByRoad       *float64       `json:"distance_by_road,omitempty"`
	PrimaryLandingArea   LandingArea    `json:"primary_landing_area"`
	SecondaryLandingArea LandingArea    `json:"secondary_landing_area"`
	RiskAssessment       string         `json:"risk_assessment,omitempty"`
	SafetyPrecautions    string         `json:"safety_precautions,omitempty"`
	Jumprun              string         `json:"jumprun,omitempty"`
	Hospital             string         `json:"hospital,omitempty"`
	RescueBoat           *bool          `json:"rescue_boat,omitempty"`
	MinimumRequirements  string         `json:"minimum_requirements,omitempty"`
	LandOwners           []LandOwner    `json:"land_owners,omitempty"`
	LandOwnerPermission  *bool          `json:"land_owner_permission,omitempty"`
	ImageFiles           []InnhoppImage `json:"image_files,omitempty"`
	CreatedAt            time.Time      `json:"created_at"`
}

type Manifest struct {
	ID             int64     `json:"id"`
	EventID        int64     `json:"event_id"`
	LoadNumber     int       `json:"load_number"`
	Capacity       int       `json:"capacity"`
	StaffSlots     *int      `json:"staff_slots,omitempty"`
	Notes          string    `json:"notes,omitempty"`
	ParticipantIDs []int64   `json:"participant_ids"`
	CreatedAt      time.Time `json:"created_at"`
}

type eventPayload struct {
	SeasonID       int64            `json:"season_id"`
	Name           string           `json:"name"`
	Location       string           `json:"location"`
	Status         string           `json:"status"`
	StartsAt       string           `json:"starts_at"`
	EndsAt         string           `json:"ends_at"`
	Slots          int              `json:"slots"`
	AirfieldIDs    []int64          `json:"airfield_ids"`
	ParticipantIDs []int64          `json:"participant_ids"`
	Innhopps       []innhoppPayload `json:"innhopps"`
}

type landingAreaPayload struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Size        string `json:"size"`
	Obstacles   string `json:"obstacles"`
}

type landOwnerPayload struct {
	Name      string `json:"name"`
	Telephone string `json:"telephone"`
	Email     string `json:"email"`
}

type innhoppPayload struct {
	ID                   *int64             `json:"id"`
	Sequence             *int               `json:"sequence"`
	Name                 string             `json:"name"`
	Coordinates          string             `json:"coordinates"`
	Elevation            *int               `json:"elevation"`
	ScheduledAt          string             `json:"scheduled_at"`
	Notes                string             `json:"notes"`
	TakeoffAirfieldID    *int64             `json:"takeoff_airfield_id"`
	ReasonForChoice      string             `json:"reason_for_choice"`
	AdjustAltimeterAAD   string             `json:"adjust_altimeter_aad"`
	Notam                string             `json:"notam"`
	DistanceByAir        *float64           `json:"distance_by_air"`
	DistanceByRoad       *float64           `json:"distance_by_road"`
	PrimaryLandingArea   landingAreaPayload `json:"primary_landing_area"`
	SecondaryLandingArea landingAreaPayload `json:"secondary_landing_area"`
	RiskAssessment       string             `json:"risk_assessment"`
	SafetyPrecautions    string             `json:"safety_precautions"`
	Jumprun              string             `json:"jumprun"`
	Hospital             string             `json:"hospital"`
	RescueBoat           *bool              `json:"rescue_boat"`
	MinimumRequirements  string             `json:"minimum_requirements"`
	LandOwners           []landOwnerPayload `json:"land_owners"`
	LandOwnerPermission  *bool              `json:"land_owner_permission"`
	ImageFiles           []InnhoppImage     `json:"image_files"`
}

type innhoppInput struct {
	ID                   *int64
	Sequence             int
	Name                 string
	Coordinates          string
	Elevation            *int
	TakeoffAirfieldID    *int64
	ScheduledAt          *time.Time
	Notes                string
	ReasonForChoice      string
	AdjustAltimeterAAD   string
	Notam                string
	DistanceByAir        *float64
	DistanceByRoad       *float64
	PrimaryLandingArea   LandingArea
	SecondaryLandingArea LandingArea
	RiskAssessment       string
	SafetyPrecautions    string
	Jumprun              string
	Hospital             string
	RescueBoat           *bool
	MinimumRequirements  string
	LandOwners           []LandOwner
	LandOwnerPermission  *bool
	ImageFiles           []InnhoppImage
}

func decodeEventJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	// intentionally allow unknown fields to remain forward compatible with UI payloads
	if err := decoder.Decode(dest); err != nil {
		return err
	}
	if decoder.More() {
		return errors.New("unexpected data after JSON payload")
	}
	return nil
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

	startsOn, err := timeutil.ParseEventDate(payload.StartsOn)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "starts_on must be a date in YYYY-MM-DD format")
		return
	}

	var endsOn *time.Time
	if payload.EndsOn != "" {
		t, err := timeutil.ParseEventDate(payload.EndsOn)
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
	rows, err := h.db.Query(r.Context(), `SELECT id, season_id, name, location, status, starts_at, ends_at, slots, created_at FROM events ORDER BY starts_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list events")
		return
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.SeasonID, &e.Name, &e.Location, &e.Status, &e.StartsAt, &e.EndsAt, &e.Slots, &e.CreatedAt); err != nil {
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
	if err := decodeEventJSON(r, &payload); err != nil {
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

	airfieldIDs, err := normalizeAirfieldIDs(payload.AirfieldIDs)
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

	slots := payload.Slots
	if slots < 0 {
		httpx.Error(w, http.StatusBadRequest, "slots cannot be negative")
		return
	}

	row := tx.QueryRow(ctx,
		`INSERT INTO events (season_id, name, location, status, starts_at, ends_at, slots) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
		payload.SeasonID, name, strings.TrimSpace(payload.Location), status, startsAt, endsAt, slots,
	)

	var event Event
	event.SeasonID = payload.SeasonID
	event.Name = name
	event.Location = strings.TrimSpace(payload.Location)
	event.Status = status
	event.StartsAt = startsAt
	event.EndsAt = endsAt
	event.Slots = slots

	if err := row.Scan(&event.ID, &event.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create event")
		return
	}

	if err := replaceEventParticipantsTx(ctx, tx, event.ID, participantIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save participants")
		return
	}

	if err := replaceEventAirfieldsTx(ctx, tx, event.ID, airfieldIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save airfields")
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
	if err := decodeEventJSON(r, &payload); err != nil {
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

	airfieldIDs, err := normalizeAirfieldIDs(payload.AirfieldIDs)
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

	slots := payload.Slots
	if slots < 0 {
		httpx.Error(w, http.StatusBadRequest, "slots cannot be negative")
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
		`UPDATE events SET season_id = $1, name = $2, location = $3, status = $4, starts_at = $5, ends_at = $6, slots = $7 WHERE id = $8`,
		payload.SeasonID, name, strings.TrimSpace(payload.Location), status, startsAt, endsAt, slots, eventID,
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

	if err := replaceEventAirfieldsTx(ctx, tx, eventID, airfieldIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save airfields")
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

func (h *Handler) copyEvent(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	ctx := r.Context()
	original, err := h.fetchEvent(ctx, eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "event not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to load event")
		}
		return
	}

	innhoppWithImages, err := h.fetchInnhoppsForEvents(ctx, []int64{eventID}, true)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load innhopps")
		return
	}
	if withImages, ok := innhoppWithImages[eventID]; ok {
		original.Innhopps = withImages
	}

	accommodations, err := h.fetchAccommodationsForEvent(ctx, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load accommodations")
		return
	}

	manifests, err := h.fetchManifestsForEvent(ctx, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load manifests")
		return
	}

	logisticsData, err := h.fetchLogisticsForEvent(ctx, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load logistics")
		return
	}

	innhoppsInput := make([]innhoppInput, len(original.Innhopps))
	for i, inn := range original.Innhopps {
		innhoppsInput[i] = innhoppInput{
			Sequence:             inn.Sequence,
			Name:                 strings.TrimSpace(inn.Name),
			Coordinates:          strings.TrimSpace(inn.Coordinates),
			Elevation:            inn.Elevation,
			TakeoffAirfieldID:    inn.TakeoffAirfieldID,
			ScheduledAt:          inn.ScheduledAt,
			Notes:                strings.TrimSpace(inn.Notes),
			ReasonForChoice:      strings.TrimSpace(inn.ReasonForChoice),
			AdjustAltimeterAAD:   strings.TrimSpace(inn.AdjustAltimeterAAD),
			Notam:                strings.TrimSpace(inn.Notam),
			DistanceByAir:        inn.DistanceByAir,
			DistanceByRoad:       inn.DistanceByRoad,
			PrimaryLandingArea:   inn.PrimaryLandingArea,
			SecondaryLandingArea: inn.SecondaryLandingArea,
			RiskAssessment:       strings.TrimSpace(inn.RiskAssessment),
			SafetyPrecautions:    strings.TrimSpace(inn.SafetyPrecautions),
			Jumprun:              strings.TrimSpace(inn.Jumprun),
			Hospital:             strings.TrimSpace(inn.Hospital),
			RescueBoat:           inn.RescueBoat,
			MinimumRequirements:  strings.TrimSpace(inn.MinimumRequirements),
			LandOwners:           inn.LandOwners,
			LandOwnerPermission:  inn.LandOwnerPermission,
			ImageFiles:           inn.ImageFiles,
		}
	}

	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to copy event")
		return
	}
	defer tx.Rollback(ctx)

	newName := strings.TrimSpace(original.Name) + " (Copy)"
	row := tx.QueryRow(ctx,
		`INSERT INTO events (season_id, name, location, status, starts_at, ends_at, slots)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
		original.SeasonID, newName, strings.TrimSpace(original.Location), original.Status, original.StartsAt, original.EndsAt, original.Slots,
	)

	var created Event
	created.SeasonID = original.SeasonID
	created.Name = newName
	created.Location = strings.TrimSpace(original.Location)
	created.Status = original.Status
	created.StartsAt = original.StartsAt
	created.EndsAt = original.EndsAt
	created.Slots = original.Slots

	if err := row.Scan(&created.ID, &created.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to copy event")
		return
	}

	if err := replaceEventParticipantsTx(ctx, tx, created.ID, original.ParticipantIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to copy participants")
		return
	}

	if err := replaceEventAirfieldsTx(ctx, tx, created.ID, original.AirfieldIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to copy airfields")
		return
	}

	if err := replaceEventInnhoppsTx(ctx, tx, created.ID, innhoppsInput); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to copy innhopps")
		return
	}

	for _, acc := range accommodations {
		var booked interface{}
		if acc.Booked != nil {
			booked = *acc.Booked
		}
		var coords interface{}
		if acc.Coordinates != nil && strings.TrimSpace(*acc.Coordinates) != "" {
			val := strings.TrimSpace(*acc.Coordinates)
			coords = val
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO event_accommodation (event_id, name, capacity, booked, coordinates, check_in_at, check_out_at, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			created.ID, strings.TrimSpace(acc.Name), acc.Capacity, booked, coords, acc.CheckInAt, acc.CheckOutAt, strings.TrimSpace(acc.Notes),
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to copy accommodations")
			return
		}
	}

	for _, manifest := range manifests {
		var newManifestID int64
		if err := tx.QueryRow(ctx,
			`INSERT INTO manifests (event_id, load_number, capacity, staff_slots, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
			created.ID, manifest.LoadNumber, manifest.Capacity, manifest.StaffSlots, strings.TrimSpace(manifest.Notes),
		).Scan(&newManifestID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to copy manifests")
			return
		}
		if err := replaceManifestParticipantsTx(ctx, tx, newManifestID, manifest.ParticipantIDs); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to copy manifest participants")
			return
		}
	}

	vehicleIDMap := make(map[int64]int64)
	for _, vehicle := range logisticsData.EventVehicles {
		var newVehicleID int64
		if err := tx.QueryRow(ctx,
			`INSERT INTO logistics_event_vehicles (event_id, name, driver, passenger_capacity, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
			created.ID, strings.TrimSpace(vehicle.Name), strings.TrimSpace(vehicle.Driver), vehicle.PassengerCapacity, strings.TrimSpace(vehicle.Notes),
		).Scan(&newVehicleID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to copy vehicles")
			return
		}
		vehicleIDMap[vehicle.ID] = newVehicleID
	}

	for _, transport := range logisticsData.Transports {
		var newTransportID int64
		if err := tx.QueryRow(ctx,
			`INSERT INTO logistics_transports (pickup_location, destination, passenger_count, scheduled_at, notes, event_id, season_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
			strings.TrimSpace(transport.PickupLocation), strings.TrimSpace(transport.Destination), transport.PassengerCount, transport.ScheduledAt, strings.TrimSpace(transport.Notes), created.ID, created.SeasonID,
		).Scan(&newTransportID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to copy transports")
			return
		}
		for _, vehicle := range transport.Vehicles {
			var mappedEventVehicle interface{}
			if vehicle.EventVehicleID != nil {
				if mappedID, ok := vehicleIDMap[*vehicle.EventVehicleID]; ok {
					mappedEventVehicle = mappedID
				}
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO logistics_transport_vehicles (transport_id, name, driver, passenger_capacity, notes, event_vehicle_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
				newTransportID, strings.TrimSpace(vehicle.Name), strings.TrimSpace(vehicle.Driver), vehicle.PassengerCapacity, strings.TrimSpace(vehicle.Notes), mappedEventVehicle,
			); err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to copy transport vehicles")
				return
			}
		}
	}

	for _, other := range logisticsData.Others {
		var coords interface{}
		if other.Coordinates != nil && strings.TrimSpace(*other.Coordinates) != "" {
			val := strings.TrimSpace(*other.Coordinates)
			coords = val
		}
		var description interface{}
		if other.Description != nil && strings.TrimSpace(*other.Description) != "" {
			val := strings.TrimSpace(*other.Description)
			description = val
		}
		var notes interface{}
		if other.Notes != nil && strings.TrimSpace(*other.Notes) != "" {
			val := strings.TrimSpace(*other.Notes)
			notes = val
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO logistics_other (name, coordinates, scheduled_at, description, notes, event_id, season_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			strings.TrimSpace(other.Name), coords, other.ScheduledAt, description, notes, created.ID, created.SeasonID,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to copy logistics entries")
			return
		}
	}

	for _, meal := range logisticsData.Meals {
		var location interface{}
		if meal.Location != nil && strings.TrimSpace(*meal.Location) != "" {
			val := strings.TrimSpace(*meal.Location)
			location = val
		}
		var notes interface{}
		if meal.Notes != nil && strings.TrimSpace(*meal.Notes) != "" {
			val := strings.TrimSpace(*meal.Notes)
			notes = val
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO logistics_meals (name, location, scheduled_at, notes, event_id, season_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
			strings.TrimSpace(meal.Name), location, meal.ScheduledAt, notes, created.ID, created.SeasonID,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to copy meals")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to copy event")
		return
	}

	cloned, err := h.fetchEvent(ctx, created.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load copied event")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, cloned)
}

func (h *Handler) listAccommodations(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT id, event_id, name, capacity, booked, coordinates, check_in_at, check_out_at, notes, created_at
         FROM event_accommodation
         WHERE event_id = $1
         ORDER BY created_at DESC`,
		eventID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list accommodations")
		return
	}
	defer rows.Close()

	var accs []Accommodation
	for rows.Next() {
		var a Accommodation
		var coords sql.NullString
		var booked sql.NullBool
		if err := rows.Scan(&a.ID, &a.EventID, &a.Name, &a.Capacity, &booked, &coords, &a.CheckInAt, &a.CheckOutAt, &a.Notes, &a.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse accommodation")
			return
		}
		if booked.Valid {
			val := booked.Bool
			a.Booked = &val
		}
		if coords.Valid {
			val := coords.String
			a.Coordinates = &val
		}
		accs = append(accs, a)
	}

	httpx.WriteJSON(w, http.StatusOK, accs)
}

func (h *Handler) listAllAccommodations(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT id, event_id, name, capacity, booked, coordinates, check_in_at, check_out_at, notes, created_at
         FROM event_accommodation
         ORDER BY created_at DESC`,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list accommodations")
		return
	}
	defer rows.Close()

	var accs []Accommodation
	for rows.Next() {
		var a Accommodation
		var coords sql.NullString
		var booked sql.NullBool
		if err := rows.Scan(&a.ID, &a.EventID, &a.Name, &a.Capacity, &booked, &coords, &a.CheckInAt, &a.CheckOutAt, &a.Notes, &a.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse accommodation")
			return
		}
		if booked.Valid {
			val := booked.Bool
			a.Booked = &val
		}
		if coords.Valid {
			val := coords.String
			a.Coordinates = &val
		}
		accs = append(accs, a)
	}

	httpx.WriteJSON(w, http.StatusOK, accs)
}

func (h *Handler) createAccommodation(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var payload struct {
		Name        string `json:"name"`
		Capacity    int    `json:"capacity"`
		Coordinates string `json:"coordinates"`
		Booked      *bool  `json:"booked"`
		CheckInAt   string `json:"check_in_at"`
		CheckOutAt  string `json:"check_out_at"`
		Notes       string `json:"notes"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	var checkIn *time.Time
	if payload.CheckInAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.CheckInAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "check_in_at must be RFC3339 timestamp")
			return
		}
		checkIn = &t
	}

	var checkOut *time.Time
	if payload.CheckOutAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.CheckOutAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "check_out_at must be RFC3339 timestamp")
			return
		}
		checkOut = &t
	}

	notes := strings.TrimSpace(payload.Notes)
	coords := strings.TrimSpace(payload.Coordinates)
	var coordVal interface{}
	if coords == "" {
		coordVal = nil
	} else {
		coordVal = coords
	}
	var bookedVal interface{}
	if payload.Booked == nil {
		bookedVal = nil
	} else {
		bookedVal = *payload.Booked
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO event_accommodation (event_id, name, capacity, booked, coordinates, check_in_at, check_out_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
		eventID, name, payload.Capacity, bookedVal, coordVal, checkIn, checkOut, notes,
	)

	var acc Accommodation
	acc.EventID = eventID
	acc.Name = name
	acc.Capacity = payload.Capacity
	if payload.Booked != nil {
		acc.Booked = payload.Booked
	}
	if coords != "" {
		acc.Coordinates = &coords
	}
	acc.CheckInAt = checkIn
	acc.CheckOutAt = checkOut
	acc.Notes = notes

	if err := row.Scan(&acc.ID, &acc.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create accommodation")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, acc)
}

func (h *Handler) getAccommodation(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}
	accID, err := strconv.ParseInt(chi.URLParam(r, "accID"), 10, 64)
	if err != nil || accID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid accommodation id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, event_id, name, capacity, booked, coordinates, check_in_at, check_out_at, notes, created_at
         FROM event_accommodation WHERE id = $1 AND event_id = $2`,
		accID, eventID,
	)
	var a Accommodation
	var coords sql.NullString
	var booked sql.NullBool
	if err := row.Scan(&a.ID, &a.EventID, &a.Name, &a.Capacity, &booked, &coords, &a.CheckInAt, &a.CheckOutAt, &a.Notes, &a.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "accommodation not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to load accommodation")
		}
		return
	}
	if booked.Valid {
		val := booked.Bool
		a.Booked = &val
	}
	if coords.Valid {
		val := coords.String
		a.Coordinates = &val
	}

	httpx.WriteJSON(w, http.StatusOK, a)
}

func (h *Handler) updateAccommodation(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}
	accID, err := strconv.ParseInt(chi.URLParam(r, "accID"), 10, 64)
	if err != nil || accID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid accommodation id")
		return
	}

	var payload struct {
		Name        string `json:"name"`
		Capacity    int    `json:"capacity"`
		Coordinates string `json:"coordinates"`
		Booked      *bool  `json:"booked"`
		CheckInAt   string `json:"check_in_at"`
		CheckOutAt  string `json:"check_out_at"`
		Notes       string `json:"notes"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	var checkIn *time.Time
	if payload.CheckInAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.CheckInAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "check_in_at must be RFC3339 timestamp")
			return
		}
		checkIn = &t
	}

	var checkOut *time.Time
	if payload.CheckOutAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.CheckOutAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "check_out_at must be RFC3339 timestamp")
			return
		}
		checkOut = &t
	}

	notes := strings.TrimSpace(payload.Notes)
	coords := strings.TrimSpace(payload.Coordinates)
	var coordVal interface{}
	if coords == "" {
		coordVal = nil
	} else {
		coordVal = coords
	}
	var bookedVal interface{}
	if payload.Booked == nil {
		bookedVal = nil
	} else {
		bookedVal = *payload.Booked
	}

	row := h.db.QueryRow(r.Context(),
		`UPDATE event_accommodation
         SET name = $1, capacity = $2, booked = $3, coordinates = $4, check_in_at = $5, check_out_at = $6, notes = $7
         WHERE id = $8 AND event_id = $9
         RETURNING id, event_id, name, capacity, booked, coordinates, check_in_at, check_out_at, notes, created_at`,
		name, payload.Capacity, bookedVal, coordVal, checkIn, checkOut, notes, accID, eventID,
	)

	var acc Accommodation
	var coordsOut sql.NullString
	var bookedOut sql.NullBool
	if err := row.Scan(&acc.ID, &acc.EventID, &acc.Name, &acc.Capacity, &bookedOut, &coordsOut, &acc.CheckInAt, &acc.CheckOutAt, &acc.Notes, &acc.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "accommodation not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to update accommodation")
		}
		return
	}
	if bookedOut.Valid {
		val := bookedOut.Bool
		acc.Booked = &val
	}
	if coordsOut.Valid {
		val := coordsOut.String
		acc.Coordinates = &val
	}

	httpx.WriteJSON(w, http.StatusOK, acc)
}

func (h *Handler) deleteAccommodation(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}
	accID, err := strconv.ParseInt(chi.URLParam(r, "accID"), 10, 64)
	if err != nil || accID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid accommodation id")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM event_accommodation WHERE id = $1 AND event_id = $2`, accID, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete accommodation")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "accommodation not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listManifests(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, event_id, load_number, capacity, staff_slots, notes, created_at FROM manifests ORDER BY load_number ASC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list manifests")
		return
	}
	defer rows.Close()

	var manifests []Manifest
	for rows.Next() {
		var m Manifest
		var staff sql.NullInt32
		if err := rows.Scan(&m.ID, &m.EventID, &m.LoadNumber, &m.Capacity, &staff, &m.Notes, &m.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse manifest")
			return
		}
		if staff.Valid {
			val := int(staff.Int32)
			m.StaffSlots = &val
		}
		manifests = append(manifests, m)
	}

	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list manifests")
		return
	}

	manifests, err = h.attachManifestParticipants(r.Context(), manifests)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load manifest participants")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, manifests)
}

func (h *Handler) createManifest(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		EventID        int64   `json:"event_id"`
		LoadNumber     int     `json:"load_number"`
		Capacity       int     `json:"capacity"`
		StaffSlots     *int    `json:"staff_slots"`
		Notes          string  `json:"notes"`
		ParticipantIDs []int64 `json:"participant_ids"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID == 0 || payload.LoadNumber == 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id and load_number are required")
		return
	}

	if payload.Capacity < 0 {
		httpx.Error(w, http.StatusBadRequest, "capacity cannot be negative")
		return
	}
	if payload.StaffSlots != nil && *payload.StaffSlots < 0 {
		httpx.Error(w, http.StatusBadRequest, "staff_slots cannot be negative")
		return
	}

	participantIDs, err := normalizeParticipantIDs(payload.ParticipantIDs)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create manifest")
		return
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx,
		`INSERT INTO manifests (event_id, load_number, capacity, staff_slots, notes) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
		payload.EventID, payload.LoadNumber, payload.Capacity, payload.StaffSlots, payload.Notes,
	)

	var manifest Manifest
	manifest.EventID = payload.EventID
	manifest.LoadNumber = payload.LoadNumber
	manifest.Capacity = payload.Capacity
	manifest.StaffSlots = payload.StaffSlots
	manifest.Notes = payload.Notes

	if err := row.Scan(&manifest.ID, &manifest.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create manifest")
		return
	}

	if err := replaceManifestParticipantsTx(ctx, tx, manifest.ID, participantIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save participants")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create manifest")
		return
	}

	created, err := h.getManifestByID(ctx, manifest.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load manifest")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) getManifest(w http.ResponseWriter, r *http.Request) {
	manifestID, err := strconv.ParseInt(chi.URLParam(r, "manifestID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid manifest id")
		return
	}

	manifest, err := h.getManifestByID(r.Context(), manifestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "manifest not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load manifest")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, manifest)
}

func (h *Handler) updateManifest(w http.ResponseWriter, r *http.Request) {
	manifestID, err := strconv.ParseInt(chi.URLParam(r, "manifestID"), 10, 64)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid manifest id")
		return
	}

	var payload struct {
		EventID        int64   `json:"event_id"`
		LoadNumber     int     `json:"load_number"`
		Capacity       int     `json:"capacity"`
		StaffSlots     *int    `json:"staff_slots"`
		Notes          string  `json:"notes"`
		ParticipantIDs []int64 `json:"participant_ids"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID == 0 || payload.LoadNumber == 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id and load_number are required")
		return
	}

	if payload.Capacity < 0 {
		httpx.Error(w, http.StatusBadRequest, "capacity cannot be negative")
		return
	}
	if payload.StaffSlots != nil && *payload.StaffSlots < 0 {
		httpx.Error(w, http.StatusBadRequest, "staff_slots cannot be negative")
		return
	}

	participantIDs, err := normalizeParticipantIDs(payload.ParticipantIDs)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update manifest")
		return
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE manifests
         SET event_id = $1, load_number = $2, capacity = $3, staff_slots = $4, notes = $5
         WHERE id = $6`,
		payload.EventID, payload.LoadNumber, payload.Capacity, payload.StaffSlots, payload.Notes, manifestID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update manifest")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "manifest not found")
		return
	}

	if err := replaceManifestParticipantsTx(ctx, tx, manifestID, participantIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save participants")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update manifest")
		return
	}

	updated, err := h.getManifestByID(ctx, manifestID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load manifest")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) fetchEvent(ctx context.Context, eventID int64) (Event, error) {
	row := h.db.QueryRow(ctx, `SELECT id, season_id, name, location, status, starts_at, ends_at, slots, created_at FROM events WHERE id = $1`, eventID)
	var event Event
	if err := row.Scan(&event.ID, &event.SeasonID, &event.Name, &event.Location, &event.Status, &event.StartsAt, &event.EndsAt, &event.Slots, &event.CreatedAt); err != nil {
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

type eventVehicleSnapshot struct {
	ID                int64
	Name              string
	Driver            string
	PassengerCapacity int
	Notes             string
}

type transportVehicleSnapshot struct {
	Name              string
	Driver            string
	PassengerCapacity int
	Notes             string
	EventVehicleID    *int64
}

type transportSnapshot struct {
	PickupLocation string
	Destination    string
	PassengerCount int
	ScheduledAt    *time.Time
	Notes          string
	Vehicles       []transportVehicleSnapshot
}

type otherLogisticSnapshot struct {
	Name        string
	Coordinates *string
	ScheduledAt *time.Time
	Description *string
	Notes       *string
}

type mealSnapshot struct {
	Name        string
	Location    *string
	ScheduledAt *time.Time
	Notes       *string
}

type eventLogisticsSnapshot struct {
	EventVehicles []eventVehicleSnapshot
	Transports    []transportSnapshot
	Others        []otherLogisticSnapshot
	Meals         []mealSnapshot
}

func (h *Handler) fetchAccommodationsForEvent(ctx context.Context, eventID int64) ([]Accommodation, error) {
	rows, err := h.db.Query(ctx,
		`SELECT id, event_id, name, capacity, booked, coordinates, check_in_at, check_out_at, notes, created_at
         FROM event_accommodation
         WHERE event_id = $1
         ORDER BY created_at ASC`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accs []Accommodation
	for rows.Next() {
		var a Accommodation
		var coords sql.NullString
		var booked sql.NullBool
		if err := rows.Scan(&a.ID, &a.EventID, &a.Name, &a.Capacity, &booked, &coords, &a.CheckInAt, &a.CheckOutAt, &a.Notes, &a.CreatedAt); err != nil {
			return nil, err
		}
		if booked.Valid {
			val := booked.Bool
			a.Booked = &val
		}
		if coords.Valid {
			val := coords.String
			a.Coordinates = &val
		}
		accs = append(accs, a)
	}

	return accs, rows.Err()
}

func (h *Handler) fetchManifestsForEvent(ctx context.Context, eventID int64) ([]Manifest, error) {
	rows, err := h.db.Query(ctx,
		`SELECT id, event_id, load_number, capacity, staff_slots, notes, created_at
         FROM manifests
         WHERE event_id = $1
         ORDER BY load_number ASC`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var manifests []Manifest
	for rows.Next() {
		var m Manifest
		var staff sql.NullInt32
		if err := rows.Scan(&m.ID, &m.EventID, &m.LoadNumber, &m.Capacity, &staff, &m.Notes, &m.CreatedAt); err != nil {
			return nil, err
		}
		if staff.Valid {
			val := int(staff.Int32)
			m.StaffSlots = &val
		}
		manifests = append(manifests, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(manifests) == 0 {
		return manifests, nil
	}

	return h.attachManifestParticipants(ctx, manifests)
}

func (h *Handler) fetchLogisticsForEvent(ctx context.Context, eventID int64) (eventLogisticsSnapshot, error) {
	var snapshot eventLogisticsSnapshot

	vehicleRows, err := h.db.Query(ctx,
		`SELECT id, name, driver, passenger_capacity, notes
         FROM logistics_event_vehicles
         WHERE event_id = $1
         ORDER BY created_at ASC`,
		eventID,
	)
	if err != nil {
		return snapshot, err
	}
	defer vehicleRows.Close()

	for vehicleRows.Next() {
		var v eventVehicleSnapshot
		var driver sql.NullString
		var notes sql.NullString
		if err := vehicleRows.Scan(&v.ID, &v.Name, &driver, &v.PassengerCapacity, &notes); err != nil {
			return snapshot, err
		}
		if driver.Valid {
			v.Driver = driver.String
		}
		if notes.Valid {
			v.Notes = notes.String
		}
		snapshot.EventVehicles = append(snapshot.EventVehicles, v)
	}
	if err := vehicleRows.Err(); err != nil {
		return snapshot, err
	}

	transportRows, err := h.db.Query(ctx,
		`SELECT id, pickup_location, destination, passenger_count, scheduled_at, notes
         FROM logistics_transports
         WHERE event_id = $1
         ORDER BY created_at ASC`,
		eventID,
	)
	if err != nil {
		return snapshot, err
	}
	defer transportRows.Close()

	var transportIDs []int64
	for transportRows.Next() {
		var t transportSnapshot
		var id int64
		var scheduled sql.NullTime
		var notes sql.NullString
		if err := transportRows.Scan(&id, &t.PickupLocation, &t.Destination, &t.PassengerCount, &scheduled, &notes); err != nil {
			return snapshot, err
		}
		if scheduled.Valid {
			ts := scheduled.Time
			t.ScheduledAt = &ts
		}
		if notes.Valid {
			t.Notes = notes.String
		}
		snapshot.Transports = append(snapshot.Transports, t)
		transportIDs = append(transportIDs, id)
	}
	if err := transportRows.Err(); err != nil {
		return snapshot, err
	}

	if len(transportIDs) > 0 {
		vehicleRows, err := h.db.Query(ctx,
			`SELECT transport_id, name, driver, passenger_capacity, notes, event_vehicle_id
             FROM logistics_transport_vehicles
             WHERE transport_id = ANY($1)`,
			transportIDs,
		)
		if err != nil {
			return snapshot, err
		}
		defer vehicleRows.Close()

		vehicleMap := make(map[int64][]transportVehicleSnapshot)
		for vehicleRows.Next() {
			var transportID int64
			var v transportVehicleSnapshot
			var driver sql.NullString
			var notes sql.NullString
			var eventVehicleID sql.NullInt64
			if err := vehicleRows.Scan(&transportID, &v.Name, &driver, &v.PassengerCapacity, &notes, &eventVehicleID); err != nil {
				return snapshot, err
			}
			if driver.Valid {
				v.Driver = driver.String
			}
			if notes.Valid {
				v.Notes = notes.String
			}
			if eventVehicleID.Valid {
				val := eventVehicleID.Int64
				v.EventVehicleID = &val
			}
			vehicleMap[transportID] = append(vehicleMap[transportID], v)
		}
		if err := vehicleRows.Err(); err != nil {
			return snapshot, err
		}
		for i := range snapshot.Transports {
			snapshot.Transports[i].Vehicles = vehicleMap[transportIDs[i]]
		}
	}

	otherRows, err := h.db.Query(ctx,
		`SELECT name, coordinates, scheduled_at, description, notes
         FROM logistics_other
         WHERE event_id = $1
         ORDER BY created_at ASC`,
		eventID,
	)
	if err != nil {
		return snapshot, err
	}
	defer otherRows.Close()

	for otherRows.Next() {
		var o otherLogisticSnapshot
		var coords sql.NullString
		var scheduled sql.NullTime
		var description sql.NullString
		var notes sql.NullString
		if err := otherRows.Scan(&o.Name, &coords, &scheduled, &description, &notes); err != nil {
			return snapshot, err
		}
		if coords.Valid {
			val := coords.String
			o.Coordinates = &val
		}
		if scheduled.Valid {
			t := scheduled.Time
			o.ScheduledAt = &t
		}
		if description.Valid {
			val := description.String
			o.Description = &val
		}
		if notes.Valid {
			val := notes.String
			o.Notes = &val
		}
		snapshot.Others = append(snapshot.Others, o)
	}
	if err := otherRows.Err(); err != nil {
		return snapshot, err
	}

	mealRows, err := h.db.Query(ctx,
		`SELECT name, location, scheduled_at, notes
         FROM logistics_meals
         WHERE event_id = $1
         ORDER BY created_at ASC`,
		eventID,
	)
	if err != nil {
		return snapshot, err
	}
	defer mealRows.Close()

	for mealRows.Next() {
		var m mealSnapshot
		var location sql.NullString
		var scheduled sql.NullTime
		var notes sql.NullString
		if err := mealRows.Scan(&m.Name, &location, &scheduled, &notes); err != nil {
			return snapshot, err
		}
		if location.Valid {
			val := location.String
			m.Location = &val
		}
		if scheduled.Valid {
			t := scheduled.Time
			m.ScheduledAt = &t
		}
		if notes.Valid {
			val := notes.String
			m.Notes = &val
		}
		snapshot.Meals = append(snapshot.Meals, m)
	}
	if err := mealRows.Err(); err != nil {
		return snapshot, err
	}

	return snapshot, nil
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

	innhoppMap, err := h.fetchInnhoppsForEvents(ctx, ids, false)
	if err != nil {
		return nil, err
	}

	airfieldMap, err := h.fetchAirfieldsForEvents(ctx, ids)
	if err != nil {
		return nil, err
	}

	attached := make([]Event, len(events))
	copy(attached, events)
	for i := range attached {
		attached[i].ParticipantIDs = participantMap[attached[i].ID]
		attached[i].Innhopps = innhoppMap[attached[i].ID]
		attached[i].AirfieldIDs = airfieldMap[attached[i].ID]
	}
	return attached, nil
}

func (h *Handler) fetchParticipantsForEvents(ctx context.Context, eventIDs []int64) (map[int64][]int64, error) {
	result := make(map[int64][]int64, len(eventIDs))
	rows, err := h.db.Query(ctx,
		`SELECT event_id, participant_id
         FROM event_participants
         WHERE event_id = ANY($1)
         ORDER BY event_id, participant_id`,
		eventIDs,
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

func (h *Handler) fetchAirfieldsForEvents(ctx context.Context, eventIDs []int64) (map[int64][]int64, error) {
	result := make(map[int64][]int64, len(eventIDs))
	rows, err := h.db.Query(ctx,
		`SELECT event_id, airfield_id
         FROM event_airfields
         WHERE event_id = ANY($1)
         ORDER BY event_id, airfield_id`,
		eventIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var eventID, airfieldID int64
		if err := rows.Scan(&eventID, &airfieldID); err != nil {
			return nil, err
		}
		result[eventID] = append(result[eventID], airfieldID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}

func (h *Handler) listAirfields(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, name, latitude, longitude, elevation, description, created_at FROM airfields ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list airfields")
		return
	}
	defer rows.Close()

	var items []airfields.Airfield
	for rows.Next() {
		var a airfields.Airfield
		if err := rows.Scan(&a.ID, &a.Name, &a.Latitude, &a.Longitude, &a.Elevation, &a.Description, &a.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse airfield")
			return
		}
		a.Coordinates = strings.TrimSpace(a.Latitude + " " + a.Longitude)
		items = append(items, a)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list airfields")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, items)
}

func (h *Handler) getAirfield(w http.ResponseWriter, r *http.Request) {
	airfieldID, err := strconv.ParseInt(chi.URLParam(r, "airfieldID"), 10, 64)
	if err != nil || airfieldID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid airfield id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, name, latitude, longitude, elevation, description, created_at FROM airfields WHERE id = $1`,
		airfieldID,
	)
	var a airfields.Airfield
	if err := row.Scan(&a.ID, &a.Name, &a.Latitude, &a.Longitude, &a.Elevation, &a.Description, &a.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "airfield not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load airfield")
		return
	}
	a.Coordinates = strings.TrimSpace(a.Latitude + " " + a.Longitude)

	httpx.WriteJSON(w, http.StatusOK, a)
}

func (h *Handler) createAirfield(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name        string `json:"name"`
		Elevation   int    `json:"elevation"`
		Coordinates string `json:"coordinates"`
		Description string `json:"description"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	name := strings.TrimSpace(payload.Name)
	coords := strings.TrimSpace(payload.Coordinates)
	if name == "" || coords == "" {
		httpx.Error(w, http.StatusBadRequest, "name and coordinates are required")
		return
	}
	if payload.Elevation < 0 {
		httpx.Error(w, http.StatusBadRequest, "elevation must be zero or greater (meters)")
		return
	}

	latRaw, lonRaw, err := splitCoords(coords)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO airfields (name, latitude, longitude, elevation, description) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
		name, latRaw, lonRaw, payload.Elevation, strings.TrimSpace(payload.Description),
	)

	var a airfields.Airfield
	a.Name = name
	a.Latitude = latRaw
	a.Longitude = lonRaw
	a.Coordinates = strings.TrimSpace(latRaw + " " + lonRaw)
	a.Elevation = payload.Elevation
	a.Description = strings.TrimSpace(payload.Description)

	if err := row.Scan(&a.ID, &a.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create airfield")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, a)
}

func (h *Handler) updateAirfield(w http.ResponseWriter, r *http.Request) {
	airfieldID, err := strconv.ParseInt(chi.URLParam(r, "airfieldID"), 10, 64)
	if err != nil || airfieldID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid airfield id")
		return
	}

	var payload struct {
		Name        string `json:"name"`
		Elevation   int    `json:"elevation"`
		Coordinates string `json:"coordinates"`
		Description string `json:"description"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	name := strings.TrimSpace(payload.Name)
	coords := strings.TrimSpace(payload.Coordinates)
	if name == "" || coords == "" {
		httpx.Error(w, http.StatusBadRequest, "name and coordinates are required")
		return
	}
	if payload.Elevation < 0 {
		httpx.Error(w, http.StatusBadRequest, "elevation must be zero or greater (meters)")
		return
	}

	latRaw, lonRaw, err := splitCoords(coords)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`UPDATE airfields SET name = $1, latitude = $2, longitude = $3, elevation = $4, description = $5 WHERE id = $6`,
		name, latRaw, lonRaw, payload.Elevation, strings.TrimSpace(payload.Description), airfieldID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update airfield")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "airfield not found")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, name, latitude, longitude, elevation, description, created_at FROM airfields WHERE id = $1`,
		airfieldID,
	)
	var a airfields.Airfield
	if err := row.Scan(&a.ID, &a.Name, &a.Latitude, &a.Longitude, &a.Elevation, &a.Description, &a.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load updated airfield")
		return
	}
	a.Coordinates = strings.TrimSpace(a.Latitude + " " + a.Longitude)

	httpx.WriteJSON(w, http.StatusOK, a)
}

func (h *Handler) deleteAirfield(w http.ResponseWriter, r *http.Request) {
	airfieldID, err := strconv.ParseInt(chi.URLParam(r, "airfieldID"), 10, 64)
	if err != nil || airfieldID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid airfield id")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM airfields WHERE id = $1`, airfieldID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete airfield")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "airfield not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) attachManifestParticipants(ctx context.Context, manifests []Manifest) ([]Manifest, error) {
	if len(manifests) == 0 {
		return manifests, nil
	}

	ids := make([]int64, len(manifests))
	for i, m := range manifests {
		ids[i] = m.ID
	}

	participantMap, err := h.fetchParticipantsForManifests(ctx, ids)
	if err != nil {
		return nil, err
	}

	attached := make([]Manifest, len(manifests))
	copy(attached, manifests)
	for i := range attached {
		attached[i].ParticipantIDs = participantMap[attached[i].ID]
	}
	return attached, nil
}

func (h *Handler) fetchParticipantsForManifests(ctx context.Context, manifestIDs []int64) (map[int64][]int64, error) {
	result := make(map[int64][]int64, len(manifestIDs))
	rows, err := h.db.Query(ctx,
		`SELECT manifest_id, participant_id
         FROM manifest_participants
         WHERE manifest_id = ANY($1)
         ORDER BY manifest_id, participant_id`,
		manifestIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var manifestID, participantID int64
		if err := rows.Scan(&manifestID, &participantID); err != nil {
			return nil, err
		}
		result[manifestID] = append(result[manifestID], participantID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return result, nil
}

func replaceManifestParticipantsTx(ctx context.Context, tx pgx.Tx, manifestID int64, participantIDs []int64) error {
	if _, err := tx.Exec(ctx, `DELETE FROM manifest_participants WHERE manifest_id = $1`, manifestID); err != nil {
		return err
	}
	if len(participantIDs) == 0 {
		return nil
	}
	for _, pid := range participantIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO manifest_participants (manifest_id, participant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			manifestID, pid,
		); err != nil {
			return err
		}
	}
	return nil
}

func (h *Handler) getManifestByID(ctx context.Context, manifestID int64) (Manifest, error) {
	row := h.db.QueryRow(ctx, `SELECT id, event_id, load_number, capacity, staff_slots, notes, created_at FROM manifests WHERE id = $1`, manifestID)
	var manifest Manifest
	var staff sql.NullInt32
	if err := row.Scan(&manifest.ID, &manifest.EventID, &manifest.LoadNumber, &manifest.Capacity, &staff, &manifest.Notes, &manifest.CreatedAt); err != nil {
		return Manifest{}, err
	}
	if staff.Valid {
		val := int(staff.Int32)
		manifest.StaffSlots = &val
	}

	participants, err := h.fetchParticipantsForManifests(ctx, []int64{manifest.ID})
	if err != nil {
		return Manifest{}, err
	}
	manifest.ParticipantIDs = participants[manifest.ID]

	return manifest, nil
}

func scanInnhopp(row pgx.Row, includeImages bool) (Innhopp, error) {
	var innhopp Innhopp
	var scheduled sql.NullTime
	var elevation sql.NullInt32
	var distanceByAir sql.NullFloat64
	var distanceByRoad sql.NullFloat64
	var rescueBoat sql.NullBool
	var landOwnerPermission sql.NullBool
	var coords sql.NullString
	var reason sql.NullString
	var adjust sql.NullString
	var notam sql.NullString
	var risk sql.NullString
	var safety sql.NullString
	var jumprun sql.NullString
	var hospital sql.NullString
	var minimum sql.NullString
	var primaryName sql.NullString
	var primaryDescription sql.NullString
	var primarySize sql.NullString
	var primaryObstacles sql.NullString
	var secondaryName sql.NullString
	var secondaryDescription sql.NullString
	var secondarySize sql.NullString
	var secondaryObstacles sql.NullString
	var landOwnersRaw []byte
	var imageFilesRaw []byte

	if err := row.Scan(
		&innhopp.ID,
		&innhopp.EventID,
		&innhopp.Sequence,
		&innhopp.Name,
		&coords,
		&innhopp.TakeoffAirfieldID,
		&elevation,
		&scheduled,
		&innhopp.Notes,
		&reason,
		&adjust,
		&notam,
		&distanceByAir,
		&distanceByRoad,
		&primaryName,
		&primaryDescription,
		&primarySize,
		&primaryObstacles,
		&secondaryName,
		&secondaryDescription,
		&secondarySize,
		&secondaryObstacles,
		&risk,
		&safety,
		&jumprun,
		&hospital,
		&rescueBoat,
		&minimum,
		&imageFilesRaw,
		&landOwnersRaw,
		&landOwnerPermission,
		&innhopp.CreatedAt,
	); err != nil {
		return innhopp, err
	}

	if scheduled.Valid {
		t := scheduled.Time.UTC()
		innhopp.ScheduledAt = &t
	}
	if elevation.Valid {
		val := int(elevation.Int32)
		innhopp.Elevation = &val
	}
	if distanceByAir.Valid {
		val := distanceByAir.Float64
		innhopp.DistanceByAir = &val
	}
	if distanceByRoad.Valid {
		val := distanceByRoad.Float64
		innhopp.DistanceByRoad = &val
	}

	innhopp.Coordinates = coords.String
	innhopp.ReasonForChoice = reason.String
	innhopp.AdjustAltimeterAAD = adjust.String
	innhopp.Notam = notam.String
	innhopp.PrimaryLandingArea = LandingArea{
		Name:        primaryName.String,
		Description: primaryDescription.String,
		Size:        primarySize.String,
		Obstacles:   primaryObstacles.String,
	}
	innhopp.SecondaryLandingArea = LandingArea{
		Name:        secondaryName.String,
		Description: secondaryDescription.String,
		Size:        secondarySize.String,
		Obstacles:   secondaryObstacles.String,
	}
	innhopp.RiskAssessment = risk.String
	innhopp.SafetyPrecautions = safety.String
	innhopp.Jumprun = jumprun.String
	innhopp.Hospital = hospital.String
	innhopp.MinimumRequirements = minimum.String

	if rescueBoat.Valid {
		val := rescueBoat.Bool
		innhopp.RescueBoat = &val
	}

	if includeImages && len(imageFilesRaw) > 0 {
		var files []InnhoppImage
		if err := json.Unmarshal(imageFilesRaw, &files); err != nil {
			return innhopp, err
		}
		if normalized := normalizeImageFiles(files); len(normalized) > 0 {
			innhopp.ImageFiles = normalized
		}
	}

	if len(landOwnersRaw) > 0 {
		var owners []LandOwner
		if err := json.Unmarshal(landOwnersRaw, &owners); err != nil {
			return innhopp, err
		}
		if len(owners) > 0 {
			innhopp.LandOwners = owners
		}
	}

	if landOwnerPermission.Valid {
		val := landOwnerPermission.Bool
		innhopp.LandOwnerPermission = &val
	}

	return innhopp, nil
}

func (h *Handler) fetchInnhoppsForEvents(ctx context.Context, eventIDs []int64, includeImages bool) (map[int64][]Innhopp, error) {
	result := make(map[int64][]Innhopp, len(eventIDs))
	rows, err := h.db.Query(ctx,
		`SELECT id, event_id, sequence, name, coordinates, takeoff_airfield_id, elevation, scheduled_at, notes,
                reason_for_choice, adjust_altimeter_aad, notam, distance_by_air, distance_by_road,
                primary_landing_area_name, primary_landing_area_description, primary_landing_area_size, primary_landing_area_obstacles,
                secondary_landing_area_name, secondary_landing_area_description, secondary_landing_area_size, secondary_landing_area_obstacles,
                risk_assessment, safety_precautions, jumprun, hospital, rescue_boat, minimum_requirements, image_files, land_owners, land_owner_permission,
                created_at
         FROM event_innhopps
         WHERE event_id = ANY($1)
         ORDER BY event_id, sequence, id`,
		eventIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		innhopp, scanErr := scanInnhopp(rows, includeImages)
		if scanErr != nil {
			return nil, scanErr
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

	startsAt, err := timeutil.ParseEventTimestamp(starts)
	if err != nil {
		return time.Time{}, nil, errors.New("starts_at must be RFC3339 timestamp")
	}

	if strings.TrimSpace(ends) == "" {
		return startsAt, nil, nil
	}

	endsAt, err := timeutil.ParseEventTimestamp(strings.TrimSpace(ends))
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

func normalizeAirfieldIDs(raw []int64) ([]int64, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	seen := make(map[int64]struct{}, len(raw))
	ids := make([]int64, 0, len(raw))
	for _, id := range raw {
		if id <= 0 {
			return nil, errors.New("airfield_ids must contain positive integers")
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

func normalizeLandingAreaPayload(p landingAreaPayload) LandingArea {
	return LandingArea{
		Name:        strings.TrimSpace(p.Name),
		Description: strings.TrimSpace(p.Description),
		Size:        strings.TrimSpace(p.Size),
		Obstacles:   strings.TrimSpace(p.Obstacles),
	}
}

func normalizeLandOwnersPayload(raw []landOwnerPayload) []LandOwner {
	if len(raw) == 0 {
		return nil
	}

	owners := make([]LandOwner, 0, len(raw))
	for _, owner := range raw {
		name := strings.TrimSpace(owner.Name)
		telephone := strings.TrimSpace(owner.Telephone)
		email := strings.TrimSpace(owner.Email)
		if name == "" && telephone == "" && email == "" {
			continue
		}
		owners = append(owners, LandOwner{
			Name:      name,
			Telephone: telephone,
			Email:     email,
		})
	}

	if len(owners) == 0 {
		return nil
	}
	return owners
}

func encodeLandOwners(owners []LandOwner) ([]byte, error) {
	if len(owners) == 0 {
		return []byte("[]"), nil
	}
	return json.Marshal(owners)
}

func normalizeImageFiles(raw []InnhoppImage) []InnhoppImage {
	if len(raw) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(raw))
	images := make([]InnhoppImage, 0, len(raw))
	for _, entry := range raw {
		name := strings.TrimSpace(entry.Name)
		data := strings.TrimSpace(entry.Data)
		mime := strings.TrimSpace(entry.MimeType)
		if data == "" {
			continue
		}
		key := data
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		images = append(images, InnhoppImage{
			Name:     name,
			MimeType: mime,
			Data:     data,
		})
	}
	if len(images) == 0 {
		return nil
	}
	return images
}

func encodeImageFiles(files []InnhoppImage) ([]byte, error) {
	if len(files) == 0 {
		return []byte("[]"), nil
	}
	return json.Marshal(files)
}

func (h *Handler) createInnhopp(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var payload innhoppPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	inputs, err := normalizeInnhopps([]innhoppPayload{payload})
	if err != nil || len(inputs) == 0 {
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
		} else {
			httpx.Error(w, http.StatusBadRequest, "invalid innhopp payload")
		}
		return
	}
	in := inputs[0]

	ownersJSON, err := encodeLandOwners(in.LandOwners)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid land owners")
		return
	}
	imageFilesJSON, err := encodeImageFiles(in.ImageFiles)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid images")
		return
	}

	var created Innhopp
	row := h.db.QueryRow(r.Context(),
		`INSERT INTO event_innhopps (
            event_id, sequence, name, coordinates, takeoff_airfield_id, elevation, scheduled_at, notes,
            reason_for_choice, adjust_altimeter_aad, notam, distance_by_air, distance_by_road,
            primary_landing_area_name, primary_landing_area_description, primary_landing_area_size, primary_landing_area_obstacles,
            secondary_landing_area_name, secondary_landing_area_description, secondary_landing_area_size, secondary_landing_area_obstacles,
            risk_assessment, safety_precautions, jumprun, hospital, rescue_boat, minimum_requirements, image_files, land_owners, land_owner_permission
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, $20, $21,
            $22, $23, $24, $25, $26, $27, $28, $29, $30
        )
        RETURNING id, event_id, sequence, name, coordinates, takeoff_airfield_id, elevation, scheduled_at, notes,
                  reason_for_choice, adjust_altimeter_aad, notam, distance_by_air, distance_by_road,
                  primary_landing_area_name, primary_landing_area_description, primary_landing_area_size, primary_landing_area_obstacles,
                  secondary_landing_area_name, secondary_landing_area_description, secondary_landing_area_size, secondary_landing_area_obstacles,
                  risk_assessment, safety_precautions, jumprun, hospital, rescue_boat, minimum_requirements, image_files, land_owners, land_owner_permission,
                  created_at`,
		eventID, in.Sequence, in.Name, in.Coordinates, in.TakeoffAirfieldID, in.Elevation, in.ScheduledAt, strings.TrimSpace(payload.Notes),
		in.ReasonForChoice, in.AdjustAltimeterAAD, in.Notam, in.DistanceByAir, in.DistanceByRoad,
		in.PrimaryLandingArea.Name, in.PrimaryLandingArea.Description, in.PrimaryLandingArea.Size, in.PrimaryLandingArea.Obstacles,
		in.SecondaryLandingArea.Name, in.SecondaryLandingArea.Description, in.SecondaryLandingArea.Size, in.SecondaryLandingArea.Obstacles,
		in.RiskAssessment, in.SafetyPrecautions, in.Jumprun, in.Hospital, in.RescueBoat, in.MinimumRequirements, imageFilesJSON, ownersJSON, in.LandOwnerPermission,
	)

	var coords sql.NullString
	var takeoff sql.NullInt64
	var elevation sql.NullInt32
	var scheduled sql.NullTime
	var reason sql.NullString
	var adjust sql.NullString
	var notam sql.NullString
	var dAir sql.NullFloat64
	var dRoad sql.NullFloat64
	var primaryName sql.NullString
	var primaryDescription sql.NullString
	var primarySize sql.NullString
	var primaryObstacles sql.NullString
	var secondaryName sql.NullString
	var secondaryDescription sql.NullString
	var secondarySize sql.NullString
	var secondaryObstacles sql.NullString
	var risk sql.NullString
	var safety sql.NullString
	var jumprun sql.NullString
	var hospital sql.NullString
	var rescueBoat sql.NullBool
	var minimum sql.NullString
	var imageFilesRaw []byte
	var ownersRaw []byte
	var landOwnerPermission sql.NullBool

	if err := row.Scan(
		&created.ID,
		&created.EventID,
		&created.Sequence,
		&created.Name,
		&coords,
		&takeoff,
		&elevation,
		&scheduled,
		&created.Notes,
		&reason,
		&adjust,
		&notam,
		&dAir,
		&dRoad,
		&primaryName,
		&primaryDescription,
		&primarySize,
		&primaryObstacles,
		&secondaryName,
		&secondaryDescription,
		&secondarySize,
		&secondaryObstacles,
		&risk,
		&safety,
		&jumprun,
		&hospital,
		&rescueBoat,
		&minimum,
		&imageFilesRaw,
		&ownersRaw,
		&landOwnerPermission,
		&created.CreatedAt,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create innhopp")
		return
	}

	if coords.Valid {
		created.Coordinates = coords.String
	}
	if takeoff.Valid {
		val := takeoff.Int64
		created.TakeoffAirfieldID = &val
	}
	if elevation.Valid {
		val := int(elevation.Int32)
		created.Elevation = &val
	}
	if scheduled.Valid {
		t := scheduled.Time.UTC()
		created.ScheduledAt = &t
	}
	if reason.Valid {
		created.ReasonForChoice = reason.String
	}
	if adjust.Valid {
		created.AdjustAltimeterAAD = adjust.String
	}
	if notam.Valid {
		created.Notam = notam.String
	}
	if dAir.Valid {
		val := dAir.Float64
		created.DistanceByAir = &val
	}
	if dRoad.Valid {
		val := dRoad.Float64
		created.DistanceByRoad = &val
	}
	created.PrimaryLandingArea = LandingArea{
		Name:        primaryName.String,
		Description: primaryDescription.String,
		Size:        primarySize.String,
		Obstacles:   primaryObstacles.String,
	}
	created.SecondaryLandingArea = LandingArea{
		Name:        secondaryName.String,
		Description: secondaryDescription.String,
		Size:        secondarySize.String,
		Obstacles:   secondaryObstacles.String,
	}
	if risk.Valid {
		created.RiskAssessment = risk.String
	}
	if safety.Valid {
		created.SafetyPrecautions = safety.String
	}
	if jumprun.Valid {
		created.Jumprun = jumprun.String
	}
	if hospital.Valid {
		created.Hospital = hospital.String
	}
	if rescueBoat.Valid {
		val := rescueBoat.Bool
		created.RescueBoat = &val
	}
	if minimum.Valid {
		created.MinimumRequirements = minimum.String
	}
	if len(imageFilesRaw) > 0 {
		var files []InnhoppImage
		if err := json.Unmarshal(imageFilesRaw, &files); err == nil {
			if normalized := normalizeImageFiles(files); len(normalized) > 0 {
				created.ImageFiles = normalized
			}
		}
	}
	if len(ownersRaw) > 0 {
		var owners []LandOwner
		if err := json.Unmarshal(ownersRaw, &owners); err == nil && len(owners) > 0 {
			created.LandOwners = owners
		}
	}
	if landOwnerPermission.Valid {
		val := landOwnerPermission.Bool
		created.LandOwnerPermission = &val
	}

	if created.TakeoffAirfieldID != nil {
		if _, err := h.db.Exec(
			r.Context(),
			`INSERT INTO event_airfields (event_id, airfield_id) VALUES ($1, $2)
             ON CONFLICT (event_id, airfield_id) DO NOTHING`,
			eventID,
			*created.TakeoffAirfieldID,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to link airfield to event")
			return
		}
	}

	httpx.WriteJSON(w, http.StatusCreated, created)
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
		coordinates := strings.TrimSpace(payload.Coordinates)

		sequence := i + 1
		if payload.Sequence != nil {
			if *payload.Sequence <= 0 {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].sequence must be positive")
			}
			sequence = *payload.Sequence
		}

		var scheduled *time.Time
		if strings.TrimSpace(payload.ScheduledAt) != "" {
			rawTS := strings.TrimSpace(payload.ScheduledAt)
			t, err := timeutil.ParseEventTimestamp(rawTS)
			if err != nil {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].scheduled_at must be RFC3339 or YYYY-MM-DDTHH:MM")
			}
			scheduled = &t
		}

		var takeoff *int64
		if payload.TakeoffAirfieldID != nil {
			if *payload.TakeoffAirfieldID <= 0 {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].takeoff_airfield_id must be positive")
			}
			takeoff = payload.TakeoffAirfieldID
		}

		var elevation *int
		if payload.Elevation != nil {
			if *payload.Elevation < 0 {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].elevation must be zero or positive")
			}
			elevation = payload.Elevation
		}

		var distanceByAir *float64
		if payload.DistanceByAir != nil {
			if *payload.DistanceByAir < 0 {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].distance_by_air must be zero or positive")
			}
			distance := *payload.DistanceByAir
			distanceByAir = &distance
		}

		var distanceByRoad *float64
		if payload.DistanceByRoad != nil {
			if *payload.DistanceByRoad < 0 {
				return nil, errors.New("innhopps[" + strconv.Itoa(i) + "].distance_by_road must be zero or positive")
			}
			distance := *payload.DistanceByRoad
			distanceByRoad = &distance
		}

		innhopps = append(innhopps, innhoppInput{
			ID:                   payload.ID,
			Sequence:             sequence,
			Name:                 name,
			Coordinates:          coordinates,
			Elevation:            elevation,
			TakeoffAirfieldID:    takeoff,
			ScheduledAt:          scheduled,
			Notes:                strings.TrimSpace(payload.Notes),
			ReasonForChoice:      strings.TrimSpace(payload.ReasonForChoice),
			AdjustAltimeterAAD:   strings.TrimSpace(payload.AdjustAltimeterAAD),
			Notam:                strings.TrimSpace(payload.Notam),
			DistanceByAir:        distanceByAir,
			DistanceByRoad:       distanceByRoad,
			PrimaryLandingArea:   normalizeLandingAreaPayload(payload.PrimaryLandingArea),
			SecondaryLandingArea: normalizeLandingAreaPayload(payload.SecondaryLandingArea),
			RiskAssessment:       strings.TrimSpace(payload.RiskAssessment),
			SafetyPrecautions:    strings.TrimSpace(payload.SafetyPrecautions),
			Jumprun:              strings.TrimSpace(payload.Jumprun),
			Hospital:             strings.TrimSpace(payload.Hospital),
			RescueBoat:           payload.RescueBoat,
			MinimumRequirements:  strings.TrimSpace(payload.MinimumRequirements),
			LandOwners:           normalizeLandOwnersPayload(payload.LandOwners),
			LandOwnerPermission:  payload.LandOwnerPermission,
			ImageFiles:           normalizeImageFiles(payload.ImageFiles),
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

func replaceEventAirfieldsTx(ctx context.Context, tx pgx.Tx, eventID int64, airfieldIDs []int64) error {
	if _, err := tx.Exec(ctx, `DELETE FROM event_airfields WHERE event_id = $1`, eventID); err != nil {
		return err
	}
	if len(airfieldIDs) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, airfieldID := range airfieldIDs {
		batch.Queue(`INSERT INTO event_airfields (event_id, airfield_id) VALUES ($1, $2)`, eventID, airfieldID)
	}

	br := tx.SendBatch(ctx, batch)
	defer br.Close()
	for range airfieldIDs {
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
		landOwnersJSON, err := encodeLandOwners(innhopp.LandOwners)
		if err != nil {
			return err
		}
		imageFilesJSON, err := encodeImageFiles(innhopp.ImageFiles)
		if err != nil {
			return err
		}

		batch.Queue(`INSERT INTO event_innhopps (
                event_id, sequence, name, coordinates, takeoff_airfield_id, elevation, scheduled_at, notes,
                reason_for_choice, adjust_altimeter_aad, notam, distance_by_air, distance_by_road,
                primary_landing_area_name, primary_landing_area_description, primary_landing_area_size, primary_landing_area_obstacles,
                secondary_landing_area_name, secondary_landing_area_description, secondary_landing_area_size, secondary_landing_area_obstacles,
                risk_assessment, safety_precautions, jumprun, hospital, rescue_boat, minimum_requirements, image_files, land_owners, land_owner_permission
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13,
                $14, $15, $16, $17,
                $18, $19, $20, $21,
                $22, $23, $24, $25, $26, $27, $28, $29, $30
            )`,
			eventID,
			innhopp.Sequence,
			innhopp.Name,
			innhopp.Coordinates,
			innhopp.TakeoffAirfieldID,
			innhopp.Elevation,
			innhopp.ScheduledAt,
			innhopp.Notes,
			innhopp.ReasonForChoice,
			innhopp.AdjustAltimeterAAD,
			innhopp.Notam,
			innhopp.DistanceByAir,
			innhopp.DistanceByRoad,
			innhopp.PrimaryLandingArea.Name,
			innhopp.PrimaryLandingArea.Description,
			innhopp.PrimaryLandingArea.Size,
			innhopp.PrimaryLandingArea.Obstacles,
			innhopp.SecondaryLandingArea.Name,
			innhopp.SecondaryLandingArea.Description,
			innhopp.SecondaryLandingArea.Size,
			innhopp.SecondaryLandingArea.Obstacles,
			innhopp.RiskAssessment,
			innhopp.SafetyPrecautions,
			innhopp.Jumprun,
			innhopp.Hospital,
			innhopp.RescueBoat,
			innhopp.MinimumRequirements,
			imageFilesJSON,
			landOwnersJSON,
			innhopp.LandOwnerPermission,
		)
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

func splitCoords(raw string) (string, string, error) {
	if raw == "" {
		return "", "", errors.New("coordinates are required")
	}

	// First try comma separation
	parts := strings.Split(raw, ",")
	if len(parts) < 2 {
		parts = strings.Fields(raw)
	}
	if len(parts) < 2 {
		return "", "", errors.New("coordinates must include latitude and longitude separated by comma or space")
	}

	lat := strings.TrimSpace(parts[0])
	lon := strings.TrimSpace(parts[1])
	if lat == "" || lon == "" {
		return "", "", errors.New("coordinates must include both latitude and longitude")
	}

	return lat, lon, nil
}

// NOTE: Coordinate parsing/validation removed per request; values are stored as provided (split into latitude/longitude).
