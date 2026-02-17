package logistics

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/internal/timeutil"
	"github.com/innhopp/central/backend/rbac"
)

// Handler provides logistics operations such as gear tracking.
type Handler struct {
	db         *pgxpool.Pool
	httpClient *http.Client
	mapsAPIKey string
}

type OtherLogistic struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	Coordinates *string    `json:"coordinates,omitempty"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
	Description *string    `json:"description,omitempty"`
	Notes       *string    `json:"notes,omitempty"`
	EventID     *int64     `json:"event_id,omitempty"`
	SeasonID    *int64     `json:"season_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Meal struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	Location    *string    `json:"location,omitempty"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
	Notes       *string    `json:"notes,omitempty"`
	EventID     *int64     `json:"event_id,omitempty"`
	SeasonID    *int64     `json:"season_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

func nullableInt(v int64) interface{} {
	if v == 0 {
		return nil
	}
	return v
}

func (h *Handler) listOthers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, name, coordinates, scheduled_at, description, notes, event_id, season_id, created_at FROM logistics_other ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list other logistics")
		return
	}
	defer rows.Close()

	var items []OtherLogistic
	for rows.Next() {
		var o OtherLogistic
		var coords sql.NullString
		var description sql.NullString
		var notes sql.NullString
		var eventID sql.NullInt64
		var seasonID sql.NullInt64
		if err := rows.Scan(&o.ID, &o.Name, &coords, &o.ScheduledAt, &description, &notes, &eventID, &seasonID, &o.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse other logistics entry")
			return
		}
		if coords.Valid {
			val := coords.String
			o.Coordinates = &val
		}
		if description.Valid {
			val := description.String
			o.Description = &val
		}
		if notes.Valid {
			val := notes.String
			o.Notes = &val
		}
		if eventID.Valid {
			val := eventID.Int64
			o.EventID = &val
		}
		if seasonID.Valid {
			val := seasonID.Int64
			o.SeasonID = &val
		}
		items = append(items, o)
	}

	httpx.WriteJSON(w, http.StatusOK, items)
}

func (h *Handler) getOther(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "otherID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	row := h.db.QueryRow(r.Context(), `SELECT id, name, coordinates, scheduled_at, description, notes, event_id, season_id, created_at FROM logistics_other WHERE id = $1`, id)
	var o OtherLogistic
	var coords sql.NullString
	var description sql.NullString
	var notes sql.NullString
	var eventID sql.NullInt64
	var seasonID sql.NullInt64
	if err := row.Scan(&o.ID, &o.Name, &coords, &o.ScheduledAt, &description, &notes, &eventID, &seasonID, &o.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to load other logistics entry")
		}
		return
	}
	if coords.Valid {
		val := coords.String
		o.Coordinates = &val
	}
	if description.Valid {
		val := description.String
		o.Description = &val
	}
	if notes.Valid {
		val := notes.String
		o.Notes = &val
	}
	if eventID.Valid {
		val := eventID.Int64
		o.EventID = &val
	}
	if seasonID.Valid {
		val := seasonID.Int64
		o.SeasonID = &val
	}
	httpx.WriteJSON(w, http.StatusOK, o)
}

func (h *Handler) createOther(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name        string `json:"name"`
		Coordinates string `json:"coordinates"`
		Description string `json:"description"`
		ScheduledAt string `json:"scheduled_at"`
		Notes       string `json:"notes"`
		EventID     int64  `json:"event_id"`
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
	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	var coordVal interface{}
	var coordResult *string
	if coord := strings.TrimSpace(payload.Coordinates); coord != "" {
		coordVal = coord
		coordResult = &coord
	}

	var scheduled *time.Time
	if payload.ScheduledAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.ScheduledAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduled = &t
	}

	var descriptionVal interface{}
	var descriptionResult *string
	if desc := strings.TrimSpace(payload.Description); desc != "" {
		descriptionVal = desc
		descriptionResult = &desc
	}

	var notesVal interface{}
	var notesResult *string
	if notes := strings.TrimSpace(payload.Notes); notes != "" {
		notesVal = notes
		notesResult = &notes
	}

	var seasonID interface{}
	var seasonLookup sql.NullInt64
	if err := h.db.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&seasonLookup); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}
	if seasonLookup.Valid {
		seasonID = seasonLookup.Int64
	} else {
		seasonID = nil
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO logistics_other (name, coordinates, scheduled_at, description, notes, event_id, season_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
		name, coordVal, scheduled, descriptionVal, notesVal, payload.EventID, seasonID,
	)

	var o OtherLogistic
	o.Name = name
	o.ScheduledAt = scheduled
	o.Coordinates = coordResult
	o.Notes = notesResult
	o.Description = descriptionResult
	valEvent := payload.EventID
	o.EventID = &valEvent
	if seasonID != nil {
		val := seasonID.(int64)
		o.SeasonID = &val
	}

	if err := row.Scan(&o.ID, &o.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create other logistics entry")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, o)
}

func (h *Handler) updateOther(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "otherID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload struct {
		Name        string `json:"name"`
		Coordinates string `json:"coordinates"`
		Description string `json:"description"`
		ScheduledAt string `json:"scheduled_at"`
		Notes       string `json:"notes"`
		EventID     int64  `json:"event_id"`
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

	var scheduled *time.Time
	if payload.ScheduledAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.ScheduledAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduled = &t
	}

	var coordVal interface{}
	if strings.TrimSpace(payload.Coordinates) != "" {
		coordVal = strings.TrimSpace(payload.Coordinates)
	} else {
		coordVal = nil
	}
	var descriptionVal interface{}
	if strings.TrimSpace(payload.Description) != "" {
		descriptionVal = strings.TrimSpace(payload.Description)
	} else {
		descriptionVal = nil
	}
	var notesVal interface{}
	if strings.TrimSpace(payload.Notes) != "" {
		notesVal = strings.TrimSpace(payload.Notes)
	} else {
		notesVal = nil
	}

	var seasonID interface{}
	var season sql.NullInt64
	if err := h.db.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&season); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}
	if season.Valid {
		seasonID = season.Int64
	} else {
		seasonID = nil
	}

	row := h.db.QueryRow(r.Context(),
		`UPDATE logistics_other
         SET name = $1, coordinates = $2, scheduled_at = $3, description = $4, notes = $5, event_id = $6, season_id = $7
         WHERE id = $8
         RETURNING id, name, coordinates, scheduled_at, description, notes, event_id, season_id, created_at`,
		name, coordVal, scheduled, descriptionVal, notesVal, payload.EventID, seasonID, id,
	)

	var o OtherLogistic
	var coords sql.NullString
	var description sql.NullString
	var notes sql.NullString
	var eventID sql.NullInt64
	var seasonResult sql.NullInt64
	if err := row.Scan(&o.ID, &o.Name, &coords, &o.ScheduledAt, &description, &notes, &eventID, &seasonResult, &o.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to update other logistics entry")
		}
		return
	}
	if coords.Valid {
		val := coords.String
		o.Coordinates = &val
	}
	if description.Valid {
		val := description.String
		o.Description = &val
	}
	if notes.Valid {
		val := notes.String
		o.Notes = &val
	}
	if eventID.Valid {
		val := eventID.Int64
		o.EventID = &val
	}
	if seasonResult.Valid {
		val := seasonResult.Int64
		o.SeasonID = &val
	}
	httpx.WriteJSON(w, http.StatusOK, o)
}

func (h *Handler) deleteOther(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "otherID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM logistics_other WHERE id = $1`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete other logistics entry")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listMeals(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, name, location, scheduled_at, notes, event_id, season_id, created_at FROM logistics_meals ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list meals")
		return
	}
	defer rows.Close()

	var items []Meal
	for rows.Next() {
		var m Meal
		var loc sql.NullString
		var sched sql.NullTime
		var notes sql.NullString
		var eventID sql.NullInt64
		var seasonID sql.NullInt64
		if err := rows.Scan(&m.ID, &m.Name, &loc, &sched, &notes, &eventID, &seasonID, &m.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse meal")
			return
		}
		if loc.Valid {
			val := loc.String
			m.Location = &val
		}
		if sched.Valid {
			t := sched.Time
			m.ScheduledAt = &t
		}
		if notes.Valid {
			val := notes.String
			m.Notes = &val
		}
		if eventID.Valid {
			val := eventID.Int64
			m.EventID = &val
		}
		if seasonID.Valid {
			val := seasonID.Int64
			m.SeasonID = &val
		}
		items = append(items, m)
	}

	httpx.WriteJSON(w, http.StatusOK, items)
}

func (h *Handler) getMeal(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "mealID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, name, location, scheduled_at, notes, event_id, season_id, created_at FROM logistics_meals WHERE id = $1`,
		id,
	)
	var m Meal
	var loc sql.NullString
	var sched sql.NullTime
	var notes sql.NullString
	var eventID sql.NullInt64
	var seasonID sql.NullInt64
	if err := row.Scan(&m.ID, &m.Name, &loc, &sched, &notes, &eventID, &seasonID, &m.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "meal not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load meal")
		return
	}
	if loc.Valid {
		val := loc.String
		m.Location = &val
	}
	if sched.Valid {
		t := sched.Time
		m.ScheduledAt = &t
	}
	if notes.Valid {
		val := notes.String
		m.Notes = &val
	}
	if eventID.Valid {
		val := eventID.Int64
		m.EventID = &val
	}
	if seasonID.Valid {
		val := seasonID.Int64
		m.SeasonID = &val
	}
	httpx.WriteJSON(w, http.StatusOK, m)
}

func (h *Handler) createMeal(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name        string `json:"name"`
		Location    string `json:"location"`
		ScheduledAt string `json:"scheduled_at"`
		Notes       string `json:"notes"`
		EventID     int64  `json:"event_id"`
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
	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	var scheduled *time.Time
	if payload.ScheduledAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.ScheduledAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduled = &t
	}

	var seasonID *int64
	if err := h.db.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&seasonID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO logistics_meals (name, location, scheduled_at, notes, event_id, season_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
		name, strings.TrimSpace(payload.Location), scheduled, strings.TrimSpace(payload.Notes), payload.EventID, seasonID,
	)

	var m Meal
	m.Name = name
	if payload.Location != "" {
		loc := strings.TrimSpace(payload.Location)
		m.Location = &loc
	}
	m.ScheduledAt = scheduled
	if payload.Notes != "" {
		notes := strings.TrimSpace(payload.Notes)
		m.Notes = &notes
	}
	eventID := payload.EventID
	m.EventID = &eventID
	m.SeasonID = seasonID

	if err := row.Scan(&m.ID, &m.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create meal")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, m)
}

func (h *Handler) updateMeal(w http.ResponseWriter, r *http.Request) {
	mealID, err := strconv.ParseInt(chi.URLParam(r, "mealID"), 10, 64)
	if err != nil || mealID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid meal id")
		return
	}

	var payload struct {
		Name        string `json:"name"`
		Location    string `json:"location"`
		ScheduledAt string `json:"scheduled_at"`
		Notes       string `json:"notes"`
		EventID     int64  `json:"event_id"`
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
	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	var scheduled *time.Time
	if strings.TrimSpace(payload.ScheduledAt) != "" {
		t, err := timeutil.ParseEventTimestamp(strings.TrimSpace(payload.ScheduledAt))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduled = &t
	}

	var seasonID *int64
	if err := h.db.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&seasonID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`UPDATE logistics_meals
         SET name = $1, location = $2, scheduled_at = $3, notes = $4, event_id = $5, season_id = $6
         WHERE id = $7
         RETURNING id, name, location, scheduled_at, notes, event_id, season_id, created_at`,
		name, strings.TrimSpace(payload.Location), scheduled, strings.TrimSpace(payload.Notes), payload.EventID, seasonID, mealID,
	)

	var m Meal
	var loc sql.NullString
	var sched sql.NullTime
	var notes sql.NullString
	var eventID sql.NullInt64
	var seasonResult sql.NullInt64
	if err := row.Scan(&m.ID, &m.Name, &loc, &sched, &notes, &eventID, &seasonResult, &m.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "meal not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to update meal")
		}
		return
	}
	if loc.Valid {
		val := loc.String
		m.Location = &val
	}
	if sched.Valid {
		t := sched.Time
		m.ScheduledAt = &t
	}
	if notes.Valid {
		val := notes.String
		m.Notes = &val
	}
	if eventID.Valid {
		val := eventID.Int64
		m.EventID = &val
	}
	if seasonResult.Valid {
		val := seasonResult.Int64
		m.SeasonID = &val
	}

	httpx.WriteJSON(w, http.StatusOK, m)
}

func (h *Handler) deleteMeal(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "mealID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM logistics_meals WHERE id = $1`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete meal")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "meal not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getTransport(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "transportID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid transport id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, pickup_location, destination, passenger_count, duration_minutes, scheduled_at, notes, event_id, season_id, created_at
         FROM logistics_transports WHERE id = $1`,
		id,
	)
	var t Transport
	var scheduledAt sql.NullTime
	var durationMinutes sql.NullInt32
	var notes sql.NullString
	var eventID sql.NullInt64
	var seasonID sql.NullInt64
	if err := row.Scan(&t.ID, &t.PickupLocation, &t.Destination, &t.PassengerCount, &durationMinutes, &scheduledAt, &notes, &eventID, &seasonID, &t.CreatedAt); err != nil {
		httpx.Error(w, http.StatusNotFound, "transport not found")
		return
	}
	if durationMinutes.Valid {
		val := int(durationMinutes.Int32)
		t.DurationMinutes = &val
	}
	if scheduledAt.Valid {
		t.ScheduledAt = &scheduledAt.Time
	}
	if notes.Valid {
		t.Notes = notes.String
	}
	if eventID.Valid {
		val := eventID.Int64
		t.EventID = &val
	}
	if seasonID.Valid {
		val := seasonID.Int64
		t.SeasonID = &val
	}

	vehicleRows, err := h.db.Query(r.Context(),
		`SELECT name, driver, passenger_capacity, notes, event_vehicle_id FROM logistics_transport_vehicles WHERE transport_id = $1`,
		id,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load vehicles")
		return
	}
	defer vehicleRows.Close()
	for vehicleRows.Next() {
		var v TransportVehicle
		var driver sql.NullString
		var notes sql.NullString
		var eventVehicleID sql.NullInt64
		if err := vehicleRows.Scan(&v.Name, &driver, &v.PassengerCapacity, &notes, &eventVehicleID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse vehicle")
			return
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
		t.Vehicles = append(t.Vehicles, v)
	}

	httpx.WriteJSON(w, http.StatusOK, t)
}

func (h *Handler) updateTransport(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "transportID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid transport id")
		return
	}

	var payload struct {
		PickupLocation string             `json:"pickup_location"`
		Destination    string             `json:"destination"`
		PassengerCount int                `json:"passenger_count"`
		ScheduledAt    string             `json:"scheduled_at"`
		Notes          *string            `json:"notes"`
		EventID        int64              `json:"event_id"`
		VehicleIDs     *[]int64           `json:"vehicle_ids"`
		Vehicles       []TransportVehicle `json:"vehicles"` // ignored, kept for backward compatibility
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	pickup := strings.TrimSpace(payload.PickupLocation)
	dest := strings.TrimSpace(payload.Destination)
	if pickup == "" || dest == "" {
		httpx.Error(w, http.StatusBadRequest, "pickup_location and destination are required")
		return
	}
	if payload.PassengerCount < 0 {
		httpx.Error(w, http.StatusBadRequest, "passenger_count cannot be negative")
		return
	}
	var notesVal interface{}
	if payload.Notes != nil {
		n := strings.TrimSpace(*payload.Notes)
		if n != "" {
			notesVal = n
		} else {
			notesVal = nil
		}
	}

	var scheduledAt *time.Time
	if payload.ScheduledAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.ScheduledAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduledAt = &t
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var seasonID *int64
	if err := tx.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&seasonID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}

	// Preserve existing notes when not provided.
	if notesVal == nil {
		var existingNotes sql.NullString
		if err := tx.QueryRow(r.Context(), `SELECT notes FROM logistics_transports WHERE id = $1`, id).Scan(&existingNotes); err == nil {
			if existingNotes.Valid {
				notesVal = existingNotes.String
			}
		}
	}

	durationMinutes, durationErr := h.calculateRouteDurationMinutes(r.Context(), pickup, dest)
	if durationErr != nil {
		log.Printf("transport duration lookup failed (transport_id=%d): %v", id, durationErr)
	}

	tag, err := tx.Exec(r.Context(),
		`UPDATE logistics_transports
         SET pickup_location = $1, destination = $2, passenger_count = $3, duration_minutes = $4, scheduled_at = $5, notes = $6, event_id = $7, season_id = $8
         WHERE id = $9`,
		pickup, dest, payload.PassengerCount, durationMinutes, scheduledAt, notesVal, payload.EventID, seasonID, id,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update transport")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "transport not found")
		return
	}

	// replace vehicles only when vehicle_ids are provided.
	if payload.VehicleIDs != nil {
		if _, err := tx.Exec(r.Context(), `DELETE FROM logistics_transport_vehicles WHERE transport_id = $1`, id); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to clear vehicles")
			return
		}
		if len(*payload.VehicleIDs) > 0 {
			eventVehicles, err := h.loadEventVehiclesForEvent(r.Context(), tx, payload.EventID, *payload.VehicleIDs)
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, err.Error())
				return
			}
			if err := h.attachEventVehicles(r.Context(), tx, id, eventVehicles); err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to save vehicles")
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save transport")
		return
	}

	h.getTransport(w, r)
}

func (h *Handler) deleteTransport(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "transportID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid transport id")
		return
	}
	tag, err := h.db.Exec(r.Context(), `DELETE FROM logistics_transports WHERE id = $1`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete transport")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "transport not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) attachEventVehiclesToGroundCrew(ctx context.Context, tx pgx.Tx, groundCrewID int64, vehicles []TransportVehicle) error {
	if len(vehicles) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, v := range vehicles {
		name := strings.TrimSpace(v.Name)
		if name == "" {
			continue
		}
		batch.Queue(
			`INSERT INTO logistics_ground_crew_vehicles (ground_crew_id, name, driver, passenger_capacity, notes, event_vehicle_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
			groundCrewID, name, strings.TrimSpace(v.Driver), v.PassengerCapacity, strings.TrimSpace(v.Notes), v.EventVehicleID,
		)
	}
	br := tx.SendBatch(ctx, batch)
	for range batch.QueuedQueries {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return err
		}
	}
	return br.Close()
}

func (h *Handler) listGroundCrews(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, pickup_location, destination, passenger_count, duration_minutes, scheduled_at, notes, event_id, season_id, created_at FROM logistics_ground_crews ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list ground crews")
		return
	}
	defer rows.Close()

	var groundCrews []Transport
	var groundCrewIDs []int64

	for rows.Next() {
		var gc Transport
		var notes sql.NullString
		var durationMinutes sql.NullInt32
		var eventID sql.NullInt64
		var seasonID sql.NullInt64
		var scheduledAt sql.NullTime
		if err := rows.Scan(&gc.ID, &gc.PickupLocation, &gc.Destination, &gc.PassengerCount, &durationMinutes, &scheduledAt, &notes, &eventID, &seasonID, &gc.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse ground crew")
			return
		}
		if durationMinutes.Valid {
			val := int(durationMinutes.Int32)
			gc.DurationMinutes = &val
		}
		if scheduledAt.Valid {
			gc.ScheduledAt = &scheduledAt.Time
		}
		if notes.Valid {
			gc.Notes = notes.String
		}
		if eventID.Valid {
			val := eventID.Int64
			gc.EventID = &val
		}
		if seasonID.Valid {
			val := seasonID.Int64
			gc.SeasonID = &val
		}
		groundCrews = append(groundCrews, gc)
		groundCrewIDs = append(groundCrewIDs, gc.ID)
	}

	if len(groundCrews) == 0 {
		httpx.WriteJSON(w, http.StatusOK, groundCrews)
		return
	}

	vehicleRows, err := h.db.Query(r.Context(),
		`SELECT ground_crew_id, name, driver, passenger_capacity, notes, event_vehicle_id
         FROM logistics_ground_crew_vehicles
         WHERE ground_crew_id = ANY($1)`,
		groundCrewIDs,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list vehicles")
		return
	}
	defer vehicleRows.Close()

	vehicleMap := make(map[int64][]TransportVehicle)
	for vehicleRows.Next() {
		var groundCrewID int64
		var v TransportVehicle
		var driver sql.NullString
		var notes sql.NullString
		var eventVehicleID sql.NullInt64
		if err := vehicleRows.Scan(&groundCrewID, &v.Name, &driver, &v.PassengerCapacity, &notes, &eventVehicleID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse vehicle")
			return
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
		vehicleMap[groundCrewID] = append(vehicleMap[groundCrewID], v)
	}

	for i := range groundCrews {
		groundCrews[i].Vehicles = vehicleMap[groundCrews[i].ID]
	}

	httpx.WriteJSON(w, http.StatusOK, groundCrews)
}

func (h *Handler) createGroundCrew(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		PickupLocation string             `json:"pickup_location"`
		Destination    string             `json:"destination"`
		PassengerCount int                `json:"passenger_count"`
		ScheduledAt    string             `json:"scheduled_at"`
		Notes          string             `json:"notes"`
		EventID        int64              `json:"event_id"`
		VehicleIDs     []int64            `json:"vehicle_ids"`
		Vehicles       []TransportVehicle `json:"vehicles"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	pickup := strings.TrimSpace(payload.PickupLocation)
	dest := strings.TrimSpace(payload.Destination)
	if pickup == "" || dest == "" {
		httpx.Error(w, http.StatusBadRequest, "pickup_location and destination are required")
		return
	}
	if payload.PassengerCount < 0 {
		httpx.Error(w, http.StatusBadRequest, "passenger_count cannot be negative")
		return
	}
	notes := strings.TrimSpace(payload.Notes)

	var scheduledAt *time.Time
	if payload.ScheduledAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.ScheduledAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduledAt = &t
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var seasonID *int64
	if err := tx.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&seasonID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}

	var groundCrew Transport
	durationMinutes, durationErr := h.calculateRouteDurationMinutes(r.Context(), pickup, dest)
	if durationErr != nil {
		log.Printf("ground crew duration lookup failed (pickup=%q,destination=%q): %v", pickup, dest, durationErr)
	}
	row := tx.QueryRow(r.Context(),
		`INSERT INTO logistics_ground_crews (pickup_location, destination, passenger_count, duration_minutes, scheduled_at, notes, event_id, season_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
		pickup, dest, payload.PassengerCount, durationMinutes, scheduledAt, notes, payload.EventID, seasonID,
	)
	if err := row.Scan(&groundCrew.ID, &groundCrew.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create ground crew")
		return
	}

	groundCrew.PickupLocation = pickup
	groundCrew.Destination = dest
	groundCrew.PassengerCount = payload.PassengerCount
	groundCrew.DurationMinutes = durationMinutes
	groundCrew.ScheduledAt = scheduledAt
	groundCrew.Notes = notes
	groundCrew.EventID = &payload.EventID
	groundCrew.SeasonID = seasonID

	if len(payload.VehicleIDs) > 0 {
		eventVehicles, err := h.loadEventVehiclesForEvent(r.Context(), tx, payload.EventID, payload.VehicleIDs)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := h.attachEventVehiclesToGroundCrew(r.Context(), tx, groundCrew.ID, eventVehicles); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to attach vehicles")
			return
		}
		groundCrew.Vehicles = eventVehicles
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save ground crew")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, groundCrew)
}

func (h *Handler) getGroundCrew(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "groundCrewID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid ground crew id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, pickup_location, destination, passenger_count, duration_minutes, scheduled_at, notes, event_id, season_id, created_at
         FROM logistics_ground_crews WHERE id = $1`,
		id,
	)
	var gc Transport
	var scheduledAt sql.NullTime
	var durationMinutes sql.NullInt32
	var notes sql.NullString
	var eventID sql.NullInt64
	var seasonID sql.NullInt64
	if err := row.Scan(&gc.ID, &gc.PickupLocation, &gc.Destination, &gc.PassengerCount, &durationMinutes, &scheduledAt, &notes, &eventID, &seasonID, &gc.CreatedAt); err != nil {
		httpx.Error(w, http.StatusNotFound, "ground crew not found")
		return
	}
	if durationMinutes.Valid {
		val := int(durationMinutes.Int32)
		gc.DurationMinutes = &val
	}
	if scheduledAt.Valid {
		gc.ScheduledAt = &scheduledAt.Time
	}
	if notes.Valid {
		gc.Notes = notes.String
	}
	if eventID.Valid {
		val := eventID.Int64
		gc.EventID = &val
	}
	if seasonID.Valid {
		val := seasonID.Int64
		gc.SeasonID = &val
	}

	vehicleRows, err := h.db.Query(r.Context(),
		`SELECT name, driver, passenger_capacity, notes, event_vehicle_id FROM logistics_ground_crew_vehicles WHERE ground_crew_id = $1`,
		id,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load vehicles")
		return
	}
	defer vehicleRows.Close()
	for vehicleRows.Next() {
		var v TransportVehicle
		var driver sql.NullString
		var notes sql.NullString
		var eventVehicleID sql.NullInt64
		if err := vehicleRows.Scan(&v.Name, &driver, &v.PassengerCapacity, &notes, &eventVehicleID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse vehicle")
			return
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
		gc.Vehicles = append(gc.Vehicles, v)
	}

	httpx.WriteJSON(w, http.StatusOK, gc)
}

func (h *Handler) updateGroundCrew(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "groundCrewID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid ground crew id")
		return
	}

	var payload struct {
		PickupLocation string             `json:"pickup_location"`
		Destination    string             `json:"destination"`
		PassengerCount int                `json:"passenger_count"`
		ScheduledAt    string             `json:"scheduled_at"`
		Notes          *string            `json:"notes"`
		EventID        int64              `json:"event_id"`
		VehicleIDs     *[]int64           `json:"vehicle_ids"`
		Vehicles       []TransportVehicle `json:"vehicles"` // ignored, kept for backward compatibility
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	pickup := strings.TrimSpace(payload.PickupLocation)
	dest := strings.TrimSpace(payload.Destination)
	if pickup == "" || dest == "" {
		httpx.Error(w, http.StatusBadRequest, "pickup_location and destination are required")
		return
	}
	if payload.PassengerCount < 0 {
		httpx.Error(w, http.StatusBadRequest, "passenger_count cannot be negative")
		return
	}
	var notesVal interface{}
	if payload.Notes != nil {
		n := strings.TrimSpace(*payload.Notes)
		if n != "" {
			notesVal = n
		} else {
			notesVal = nil
		}
	}

	var scheduledAt *time.Time
	if payload.ScheduledAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.ScheduledAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduledAt = &t
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var seasonID *int64
	if err := tx.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&seasonID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}

	if notesVal == nil {
		var existingNotes sql.NullString
		if err := tx.QueryRow(r.Context(), `SELECT notes FROM logistics_ground_crews WHERE id = $1`, id).Scan(&existingNotes); err == nil {
			if existingNotes.Valid {
				notesVal = existingNotes.String
			}
		}
	}

	durationMinutes, durationErr := h.calculateRouteDurationMinutes(r.Context(), pickup, dest)
	if durationErr != nil {
		log.Printf("ground crew duration lookup failed (ground_crew_id=%d): %v", id, durationErr)
	}

	tag, err := tx.Exec(r.Context(),
		`UPDATE logistics_ground_crews
         SET pickup_location = $1, destination = $2, passenger_count = $3, duration_minutes = $4, scheduled_at = $5, notes = $6, event_id = $7, season_id = $8
         WHERE id = $9`,
		pickup, dest, payload.PassengerCount, durationMinutes, scheduledAt, notesVal, payload.EventID, seasonID, id,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update ground crew")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "ground crew not found")
		return
	}

	if payload.VehicleIDs != nil {
		if _, err := tx.Exec(r.Context(), `DELETE FROM logistics_ground_crew_vehicles WHERE ground_crew_id = $1`, id); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to clear vehicles")
			return
		}
		if len(*payload.VehicleIDs) > 0 {
			eventVehicles, err := h.loadEventVehiclesForEvent(r.Context(), tx, payload.EventID, *payload.VehicleIDs)
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, err.Error())
				return
			}
			if err := h.attachEventVehiclesToGroundCrew(r.Context(), tx, id, eventVehicles); err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to save vehicles")
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save ground crew")
		return
	}

	h.getGroundCrew(w, r)
}

func (h *Handler) deleteGroundCrew(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "groundCrewID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid ground crew id")
		return
	}
	tag, err := h.db.Exec(r.Context(), `DELETE FROM logistics_ground_crews WHERE id = $1`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete ground crew")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "ground crew not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// NewHandler creates a logistics handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{
		db:         db,
		httpClient: &http.Client{Timeout: 8 * time.Second},
		mapsAPIKey: strings.TrimSpace(os.Getenv("GOOGLE_MAPS_API_KEY")),
	}
}

// Routes registers logistics routes.
func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/gear-assets", h.listGearAssets)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Post("/gear-assets", h.createGearAsset)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/transports", h.listTransports)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Post("/transports", h.createTransport)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/transports/{transportID}", h.getTransport)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Put("/transports/{transportID}", h.updateTransport)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Delete("/transports/{transportID}", h.deleteTransport)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/ground-crews", h.listGroundCrews)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Post("/ground-crews", h.createGroundCrew)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/ground-crews/{groundCrewID}", h.getGroundCrew)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Put("/ground-crews/{groundCrewID}", h.updateGroundCrew)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Delete("/ground-crews/{groundCrewID}", h.deleteGroundCrew)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/vehicles", h.listVehicles)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Post("/vehicles", h.createVehicle)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/vehicles/{vehicleID}", h.getVehicle)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Put("/vehicles/{vehicleID}", h.updateVehicle)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Delete("/vehicles/{vehicleID}", h.deleteVehicle)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/others", h.listOthers)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Post("/others", h.createOther)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/others/{otherID}", h.getOther)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Put("/others/{otherID}", h.updateOther)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Delete("/others/{otherID}", h.deleteOther)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/meals", h.listMeals)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Post("/meals", h.createMeal)
	r.With(enforcer.Authorize(rbac.PermissionViewLogistics)).Get("/meals/{mealID}", h.getMeal)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Put("/meals/{mealID}", h.updateMeal)
	r.With(enforcer.Authorize(rbac.PermissionManageLogistics)).Delete("/meals/{mealID}", h.deleteMeal)
	return r
}

type GearAsset struct {
	ID           int64      `json:"id"`
	Name         string     `json:"name"`
	SerialNumber string     `json:"serial_number"`
	Status       string     `json:"status"`
	Location     string     `json:"location,omitempty"`
	InspectedAt  *time.Time `json:"inspected_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

func (h *Handler) listGearAssets(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, name, serial_number, status, location, inspected_at, created_at FROM gear_assets ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list gear assets")
		return
	}
	defer rows.Close()

	var assets []GearAsset
	for rows.Next() {
		var g GearAsset
		if err := rows.Scan(&g.ID, &g.Name, &g.SerialNumber, &g.Status, &g.Location, &g.InspectedAt, &g.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse gear asset")
			return
		}
		assets = append(assets, g)
	}

	httpx.WriteJSON(w, http.StatusOK, assets)
}

func (h *Handler) createGearAsset(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name         string `json:"name"`
		SerialNumber string `json:"serial_number"`
		Status       string `json:"status"`
		Location     string `json:"location"`
		InspectedAt  string `json:"inspected_at"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	name := strings.TrimSpace(payload.Name)
	serial := strings.TrimSpace(payload.SerialNumber)
	status := strings.TrimSpace(payload.Status)
	if name == "" || serial == "" || status == "" {
		httpx.Error(w, http.StatusBadRequest, "name, serial_number, and status are required")
		return
	}

	var inspectedAt *time.Time
	if payload.InspectedAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.InspectedAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "inspected_at must be RFC3339 timestamp")
			return
		}
		inspectedAt = &t
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO gear_assets (name, serial_number, status, location, inspected_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
		name, serial, status, payload.Location, inspectedAt,
	)

	var asset GearAsset
	asset.Name = name
	asset.SerialNumber = serial
	asset.Status = status
	asset.Location = payload.Location
	asset.InspectedAt = inspectedAt

	if err := row.Scan(&asset.ID, &asset.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create gear asset")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, asset)
}

type TransportVehicle struct {
	Name              string `json:"name"`
	Driver            string `json:"driver,omitempty"`
	PassengerCapacity int    `json:"passenger_capacity"`
	Notes             string `json:"notes,omitempty"`
	EventVehicleID    *int64 `json:"event_vehicle_id,omitempty"`
}

type EventVehicle struct {
	ID                int64     `json:"id"`
	EventID           int64     `json:"event_id"`
	Name              string    `json:"name"`
	Driver            string    `json:"driver,omitempty"`
	PassengerCapacity int       `json:"passenger_capacity"`
	Notes             string    `json:"notes,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

func (h *Handler) loadEventVehiclesForEvent(ctx context.Context, tx pgx.Tx, eventID int64, vehicleIDs []int64) ([]TransportVehicle, error) {
	if len(vehicleIDs) == 0 {
		return nil, nil
	}
	rows, err := tx.Query(ctx,
		`SELECT id, name, driver, passenger_capacity, notes FROM logistics_event_vehicles
         WHERE event_id = $1 AND id = ANY($2)`,
		eventID, vehicleIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var vehicles []TransportVehicle
	for rows.Next() {
		var v TransportVehicle
		var id int64
		if err := rows.Scan(&id, &v.Name, &v.Driver, &v.PassengerCapacity, &v.Notes); err != nil {
			return nil, err
		}
		v.EventVehicleID = &id
		vehicles = append(vehicles, v)
	}
	if len(vehicles) != len(vehicleIDs) {
		return nil, errors.New("invalid vehicle_ids for event")
	}
	return vehicles, nil
}

func (h *Handler) attachEventVehicles(ctx context.Context, tx pgx.Tx, transportID int64, vehicles []TransportVehicle) error {
	if len(vehicles) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, v := range vehicles {
		name := strings.TrimSpace(v.Name)
		if name == "" {
			continue
		}
		batch.Queue(
			`INSERT INTO logistics_transport_vehicles (transport_id, name, driver, passenger_capacity, notes, event_vehicle_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
			transportID, name, strings.TrimSpace(v.Driver), v.PassengerCapacity, strings.TrimSpace(v.Notes), v.EventVehicleID,
		)
	}
	br := tx.SendBatch(ctx, batch)
	for range batch.QueuedQueries {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return err
		}
	}
	return br.Close()
}

type Transport struct {
	ID              int64              `json:"id"`
	PickupLocation  string             `json:"pickup_location"`
	Destination     string             `json:"destination"`
	PassengerCount  int                `json:"passenger_count"`
	DurationMinutes *int               `json:"duration_minutes,omitempty"`
	ScheduledAt     *time.Time         `json:"scheduled_at,omitempty"`
	Notes           string             `json:"notes,omitempty"`
	EventID         *int64             `json:"event_id,omitempty"`
	SeasonID        *int64             `json:"season_id,omitempty"`
	Vehicles        []TransportVehicle `json:"vehicles"`
	CreatedAt       time.Time          `json:"created_at"`
}

type directionsAPIResponse struct {
	Status       string `json:"status"`
	ErrorMessage string `json:"error_message"`
	Routes       []struct {
		Legs []struct {
			Duration struct {
				Value int `json:"value"`
			} `json:"duration"`
		} `json:"legs"`
	} `json:"routes"`
}

func (h *Handler) calculateRouteDurationMinutes(ctx context.Context, origin, destination string) (*int, error) {
	if strings.TrimSpace(origin) == "" || strings.TrimSpace(destination) == "" || h.mapsAPIKey == "" {
		return nil, nil
	}
	reqCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	q := url.Values{}
	q.Set("origin", origin)
	q.Set("destination", destination)
	q.Set("mode", "driving")
	q.Set("key", h.mapsAPIKey)
	endpoint := "https://maps.googleapis.com/maps/api/directions/json?" + q.Encode()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload directionsAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.Status != "OK" {
		if payload.Status == "ZERO_RESULTS" || payload.Status == "NOT_FOUND" {
			return nil, nil
		}
		if payload.ErrorMessage != "" {
			return nil, fmt.Errorf("%s: %s", payload.Status, payload.ErrorMessage)
		}
		return nil, fmt.Errorf(payload.Status)
	}
	if len(payload.Routes) == 0 || len(payload.Routes[0].Legs) == 0 {
		return nil, nil
	}

	totalSeconds := 0
	for _, leg := range payload.Routes[0].Legs {
		totalSeconds += leg.Duration.Value
	}
	if totalSeconds <= 0 {
		return nil, nil
	}
	minutes := (totalSeconds + 59) / 60
	return &minutes, nil
}

func (h *Handler) listTransports(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, pickup_location, destination, passenger_count, duration_minutes, scheduled_at, notes, event_id, season_id, created_at FROM logistics_transports ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list transports")
		return
	}
	defer rows.Close()

	var transports []Transport
	var transportIDs []int64

	for rows.Next() {
		var t Transport
		var notes sql.NullString
		var durationMinutes sql.NullInt32
		var eventID sql.NullInt64
		var seasonID sql.NullInt64
		var scheduledAt sql.NullTime
		if err := rows.Scan(&t.ID, &t.PickupLocation, &t.Destination, &t.PassengerCount, &durationMinutes, &scheduledAt, &notes, &eventID, &seasonID, &t.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse transport")
			return
		}
		if durationMinutes.Valid {
			val := int(durationMinutes.Int32)
			t.DurationMinutes = &val
		}
		if scheduledAt.Valid {
			t.ScheduledAt = &scheduledAt.Time
		}
		if notes.Valid {
			t.Notes = notes.String
		}
		if eventID.Valid {
			val := eventID.Int64
			t.EventID = &val
		}
		if seasonID.Valid {
			val := seasonID.Int64
			t.SeasonID = &val
		}
		transports = append(transports, t)
		transportIDs = append(transportIDs, t.ID)
	}

	if len(transports) == 0 {
		httpx.WriteJSON(w, http.StatusOK, transports)
		return
	}

	vehicleRows, err := h.db.Query(r.Context(),
		`SELECT transport_id, name, driver, passenger_capacity, notes, event_vehicle_id
         FROM logistics_transport_vehicles
         WHERE transport_id = ANY($1)`,
		transportIDs,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list vehicles")
		return
	}
	defer vehicleRows.Close()

	vehicleMap := make(map[int64][]TransportVehicle)
	for vehicleRows.Next() {
		var transportID int64
		var v TransportVehicle
		var driver sql.NullString
		var notes sql.NullString
		var eventVehicleID sql.NullInt64
		if err := vehicleRows.Scan(&transportID, &v.Name, &driver, &v.PassengerCapacity, &notes, &eventVehicleID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse vehicle")
			return
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

	for i := range transports {
		transports[i].Vehicles = vehicleMap[transports[i].ID]
	}

	httpx.WriteJSON(w, http.StatusOK, transports)
}

func (h *Handler) createTransport(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		PickupLocation string             `json:"pickup_location"`
		Destination    string             `json:"destination"`
		PassengerCount int                `json:"passenger_count"`
		ScheduledAt    string             `json:"scheduled_at"`
		Notes          string             `json:"notes"`
		EventID        int64              `json:"event_id"`
		VehicleIDs     []int64            `json:"vehicle_ids"`
		Vehicles       []TransportVehicle `json:"vehicles"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	pickup := strings.TrimSpace(payload.PickupLocation)
	dest := strings.TrimSpace(payload.Destination)
	if pickup == "" || dest == "" {
		httpx.Error(w, http.StatusBadRequest, "pickup_location and destination are required")
		return
	}
	if payload.PassengerCount < 0 {
		httpx.Error(w, http.StatusBadRequest, "passenger_count cannot be negative")
		return
	}
	notes := strings.TrimSpace(payload.Notes)

	var scheduledAt *time.Time
	if payload.ScheduledAt != "" {
		t, err := timeutil.ParseEventTimestamp(payload.ScheduledAt)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 timestamp")
			return
		}
		scheduledAt = &t
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var seasonID *int64
	if err := tx.QueryRow(r.Context(), `SELECT season_id FROM events WHERE id = $1`, payload.EventID).Scan(&seasonID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}

	var transport Transport
	durationMinutes, durationErr := h.calculateRouteDurationMinutes(r.Context(), pickup, dest)
	if durationErr != nil {
		log.Printf("transport duration lookup failed (pickup=%q,destination=%q): %v", pickup, dest, durationErr)
	}
	row := tx.QueryRow(r.Context(),
		`INSERT INTO logistics_transports (pickup_location, destination, passenger_count, duration_minutes, scheduled_at, notes, event_id, season_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
		pickup, dest, payload.PassengerCount, durationMinutes, scheduledAt, notes, payload.EventID, seasonID,
	)
	if err := row.Scan(&transport.ID, &transport.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create transport")
		return
	}

	transport.PickupLocation = pickup
	transport.Destination = dest
	transport.PassengerCount = payload.PassengerCount
	transport.DurationMinutes = durationMinutes
	transport.ScheduledAt = scheduledAt
	transport.Notes = notes
	transport.EventID = &payload.EventID
	transport.SeasonID = seasonID

	if len(payload.VehicleIDs) > 0 {
		eventVehicles, err := h.loadEventVehiclesForEvent(r.Context(), tx, payload.EventID, payload.VehicleIDs)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := h.attachEventVehicles(r.Context(), tx, transport.ID, eventVehicles); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to attach vehicles")
			return
		}
		transport.Vehicles = eventVehicles
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save transport")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, transport)
}

func (h *Handler) listVehicles(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, event_id, name, driver, passenger_capacity, notes, created_at FROM logistics_event_vehicles ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list vehicles")
		return
	}
	defer rows.Close()

	var vehicles []EventVehicle
	for rows.Next() {
		var v EventVehicle
		if err := rows.Scan(&v.ID, &v.EventID, &v.Name, &v.Driver, &v.PassengerCapacity, &v.Notes, &v.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse vehicle")
			return
		}
		vehicles = append(vehicles, v)
	}

	httpx.WriteJSON(w, http.StatusOK, vehicles)
}

func (h *Handler) createVehicle(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		EventID           int64  `json:"event_id"`
		Name              string `json:"name"`
		Driver            string `json:"driver"`
		PassengerCapacity int    `json:"passenger_capacity"`
		Notes             string `json:"notes"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	driver := strings.TrimSpace(payload.Driver)
	notes := strings.TrimSpace(payload.Notes)

	var vehicle EventVehicle
	row := h.db.QueryRow(r.Context(),
		`INSERT INTO logistics_event_vehicles (event_id, name, driver, passenger_capacity, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
		payload.EventID, name, driver, payload.PassengerCapacity, notes,
	)

	if err := row.Scan(&vehicle.ID, &vehicle.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create vehicle")
		return
	}

	vehicle.EventID = payload.EventID
	vehicle.Name = name
	vehicle.Driver = driver
	vehicle.PassengerCapacity = payload.PassengerCapacity
	vehicle.Notes = notes

	httpx.WriteJSON(w, http.StatusCreated, vehicle)
}

func (h *Handler) getVehicle(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "vehicleID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid vehicle id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, event_id, name, driver, passenger_capacity, notes, created_at
         FROM logistics_event_vehicles WHERE id = $1`,
		id,
	)

	var vehicle EventVehicle
	if err := row.Scan(&vehicle.ID, &vehicle.EventID, &vehicle.Name, &vehicle.Driver, &vehicle.PassengerCapacity, &vehicle.Notes, &vehicle.CreatedAt); err != nil {
		httpx.Error(w, http.StatusNotFound, "vehicle not found")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, vehicle)
}

func (h *Handler) updateVehicle(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "vehicleID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid vehicle id")
		return
	}

	var payload struct {
		EventID           int64  `json:"event_id"`
		Name              string `json:"name"`
		Driver            string `json:"driver"`
		PassengerCapacity int    `json:"passenger_capacity"`
		Notes             string `json:"notes"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.EventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id is required")
		return
	}

	if _, err := h.db.Exec(r.Context(), `SELECT 1 FROM events WHERE id = $1`, payload.EventID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid event_id")
		return
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	driver := strings.TrimSpace(payload.Driver)
	notes := strings.TrimSpace(payload.Notes)

	row := h.db.QueryRow(r.Context(),
		`UPDATE logistics_event_vehicles
         SET event_id = $1, name = $2, driver = $3, passenger_capacity = $4, notes = $5
         WHERE id = $6
         RETURNING created_at`,
		payload.EventID, name, driver, payload.PassengerCapacity, notes, id,
	)

	var createdAt time.Time
	if err := row.Scan(&createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "vehicle not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to update vehicle")
		}
		return
	}

	vehicle := EventVehicle{
		ID:                id,
		EventID:           payload.EventID,
		Name:              name,
		Driver:            driver,
		PassengerCapacity: payload.PassengerCapacity,
		Notes:             notes,
		CreatedAt:         createdAt,
	}

	httpx.WriteJSON(w, http.StatusOK, vehicle)
}

func (h *Handler) deleteVehicle(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "vehicleID"), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid vehicle id")
		return
	}

	var vehicle EventVehicle
	row := h.db.QueryRow(r.Context(),
		`SELECT id, event_id, name FROM logistics_event_vehicles WHERE id = $1`,
		id,
	)
	if err := row.Scan(&vehicle.ID, &vehicle.EventID, &vehicle.Name); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "vehicle not found")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "failed to load vehicle")
		}
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	// Remove any transport rows explicitly linked to this event vehicle,
	// plus legacy rows without an event_vehicle_id but matching the same event and name.
	if _, err := tx.Exec(r.Context(),
		`DELETE FROM logistics_transport_vehicles
         WHERE event_vehicle_id = $1
            OR (event_vehicle_id IS NULL AND transport_id IN (
              SELECT id FROM logistics_transports WHERE event_id = $2
            ) AND name = $3)`,
		id, vehicle.EventID, vehicle.Name,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to detach vehicle from transports")
		return
	}

	tag, err := tx.Exec(r.Context(), `DELETE FROM logistics_event_vehicles WHERE id = $1`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete vehicle")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "vehicle not found")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to finalize vehicle deletion")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
