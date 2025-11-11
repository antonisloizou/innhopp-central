package logistics

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
)

// Handler provides logistics operations such as gear tracking.
type Handler struct {
	db *pgxpool.Pool
}

// NewHandler creates a logistics handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes registers logistics routes.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/gear-assets", h.listGearAssets)
	r.Post("/gear-assets", h.createGearAsset)
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
		t, err := time.Parse(time.RFC3339, payload.InspectedAt)
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
