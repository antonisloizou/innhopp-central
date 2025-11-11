package rbac

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
)

// Handler exposes crew assignment operations.
type Handler struct {
	db *pgxpool.Pool
}

// NewHandler creates an RBAC handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes registers crew assignment routes.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/crew-assignments", h.listAssignments)
	r.Post("/crew-assignments", h.createAssignment)
	return r
}

type CrewAssignment struct {
	ID              int64     `json:"id"`
	ManifestID      int64     `json:"manifest_id"`
	ParticipantID   int64     `json:"participant_id"`
	ParticipantName string    `json:"participant_name"`
	Role            string    `json:"role"`
	AssignedAt      time.Time `json:"assigned_at"`
}

func (h *Handler) listAssignments(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT ca.id, ca.manifest_id, ca.participant_id, pp.full_name, ca.role, ca.assigned_at
        FROM crew_assignments ca
        JOIN participant_profiles pp ON pp.id = ca.participant_id
        ORDER BY ca.assigned_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list crew assignments")
		return
	}
	defer rows.Close()

	var assignments []CrewAssignment
	for rows.Next() {
		var ca CrewAssignment
		if err := rows.Scan(&ca.ID, &ca.ManifestID, &ca.ParticipantID, &ca.ParticipantName, &ca.Role, &ca.AssignedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse crew assignment")
			return
		}
		assignments = append(assignments, ca)
	}

	httpx.WriteJSON(w, http.StatusOK, assignments)
}

func (h *Handler) createAssignment(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ManifestID    int64  `json:"manifest_id"`
		ParticipantID int64  `json:"participant_id"`
		Role          string `json:"role"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if payload.ManifestID == 0 || payload.ParticipantID == 0 || payload.Role == "" {
		httpx.Error(w, http.StatusBadRequest, "manifest_id, participant_id, and role are required")
		return
	}

	role := strings.TrimSpace(payload.Role)
	if role == "" {
		httpx.Error(w, http.StatusBadRequest, "role is required")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO crew_assignments (manifest_id, participant_id, role)
         VALUES ($1, $2, $3)
         RETURNING id, assigned_at`,
		payload.ManifestID, payload.ParticipantID, role,
	)

	var assignment CrewAssignment
	assignment.ManifestID = payload.ManifestID
	assignment.ParticipantID = payload.ParticipantID
	assignment.Role = role

	if err := row.Scan(&assignment.ID, &assignment.AssignedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create crew assignment")
		return
	}

	participantRow := h.db.QueryRow(r.Context(), `SELECT full_name FROM participant_profiles WHERE id = $1`, payload.ParticipantID)
	if err := participantRow.Scan(&assignment.ParticipantName); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load participant for assignment")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, assignment)
}
