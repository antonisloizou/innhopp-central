package participants

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/rbac"
)

// Handler exposes participant profile endpoints.
type Handler struct {
	db *pgxpool.Pool
}

// NewHandler creates a participants handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes registers participant routes.
func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewParticipants)).Get("/profiles", h.listProfiles)
	r.With(enforcer.Authorize(rbac.PermissionManageParticipants)).Post("/profiles", h.createProfile)
	r.With(enforcer.Authorize(rbac.PermissionViewParticipants)).Get("/profiles/{profileID}", h.getProfile)
	r.With(enforcer.Authorize(rbac.PermissionManageParticipants)).Put("/profiles/{profileID}", h.updateProfile)
	return r
}

type Profile struct {
	ID               int64     `json:"id"`
	FullName         string    `json:"full_name"`
	Email            string    `json:"email"`
	Phone            string    `json:"phone,omitempty"`
	ExperienceLevel  string    `json:"experience_level,omitempty"`
	EmergencyContact string    `json:"emergency_contact,omitempty"`
	Roles            []string  `json:"roles"`
	CreatedAt        time.Time `json:"created_at"`
}

var allowedRoles = map[string]struct{}{
	"Participant": {},
	"Skydiver":    {},
	"Staff":       {},
	"Ground Crew": {},
	"Jump Master": {},
	"Jump Leader": {},
	"Driver":      {},
	"Pilot":       {},
	"COP":         {},
}

func normalizeRoles(input []string) []string {
	seen := make(map[string]struct{})
	var roles []string
	for _, r := range input {
		trimmed := strings.TrimSpace(r)
		if trimmed == "" {
			continue
		}
		if _, ok := allowedRoles[trimmed]; !ok {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		roles = append(roles, trimmed)
	}
	if len(roles) == 0 {
		return []string{"Participant"}
	}
	return roles
}

func (h *Handler) listProfiles(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, full_name, email, phone, experience_level, emergency_contact, roles, created_at FROM participant_profiles ORDER BY created_at DESC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list participants")
		return
	}
	defer rows.Close()

	var profiles []Profile
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.FullName, &p.Email, &p.Phone, &p.ExperienceLevel, &p.EmergencyContact, &p.Roles, &p.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse participant")
			return
		}
		p.Roles = normalizeRoles(p.Roles)
		profiles = append(profiles, p)
	}

	httpx.WriteJSON(w, http.StatusOK, profiles)
}

func (h *Handler) createProfile(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		FullName         string   `json:"full_name"`
		Email            string   `json:"email"`
		Phone            string   `json:"phone"`
		ExperienceLevel  string   `json:"experience_level"`
		EmergencyContact string   `json:"emergency_contact"`
		Roles            []string `json:"roles"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	fullName := strings.TrimSpace(payload.FullName)
	email := strings.TrimSpace(strings.ToLower(payload.Email))
	if fullName == "" || email == "" {
		httpx.Error(w, http.StatusBadRequest, "full_name and email are required")
		return
	}
	roles := normalizeRoles(payload.Roles)

	row := h.db.QueryRow(r.Context(),
		`INSERT INTO participant_profiles (full_name, email, phone, experience_level, emergency_contact, roles)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
		fullName, email, payload.Phone, payload.ExperienceLevel, payload.EmergencyContact, roles,
	)

	var profile Profile
	profile.FullName = fullName
	profile.Email = email
	profile.Phone = payload.Phone
	profile.ExperienceLevel = payload.ExperienceLevel
	profile.EmergencyContact = payload.EmergencyContact
	profile.Roles = roles

	if err := row.Scan(&profile.ID, &profile.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create participant")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, profile)
}

func (h *Handler) getProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := strconv.ParseInt(chi.URLParam(r, "profileID"), 10, 64)
	if err != nil || profileID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid profile id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, full_name, email, phone, experience_level, emergency_contact, roles, created_at
         FROM participant_profiles WHERE id = $1`,
		profileID,
	)

	var profile Profile
	if err := row.Scan(&profile.ID, &profile.FullName, &profile.Email, &profile.Phone, &profile.ExperienceLevel, &profile.EmergencyContact, &profile.Roles, &profile.CreatedAt); err != nil {
		httpx.Error(w, http.StatusNotFound, "participant not found")
		return
	}
	profile.Roles = normalizeRoles(profile.Roles)

	httpx.WriteJSON(w, http.StatusOK, profile)
}

func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := strconv.ParseInt(chi.URLParam(r, "profileID"), 10, 64)
	if err != nil || profileID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid profile id")
		return
	}

	var payload struct {
		FullName         string   `json:"full_name"`
		Email            string   `json:"email"`
		Phone            string   `json:"phone"`
		ExperienceLevel  string   `json:"experience_level"`
		EmergencyContact string   `json:"emergency_contact"`
		Roles            []string `json:"roles"`
	}

	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	fullName := strings.TrimSpace(payload.FullName)
	email := strings.TrimSpace(strings.ToLower(payload.Email))
	if fullName == "" || email == "" {
		httpx.Error(w, http.StatusBadRequest, "full_name and email are required")
		return
	}
	roles := normalizeRoles(payload.Roles)

	tag, err := h.db.Exec(r.Context(),
		`UPDATE participant_profiles
         SET full_name = $1, email = $2, phone = $3, experience_level = $4, emergency_contact = $5, roles = $6
         WHERE id = $7`,
		fullName, email, payload.Phone, payload.ExperienceLevel, payload.EmergencyContact, roles, profileID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update participant")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "participant not found")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, full_name, email, phone, experience_level, emergency_contact, roles, created_at
         FROM participant_profiles WHERE id = $1`,
		profileID,
	)

	var profile Profile
	if err := row.Scan(&profile.ID, &profile.FullName, &profile.Email, &profile.Phone, &profile.ExperienceLevel, &profile.EmergencyContact, &profile.Roles, &profile.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load participant")
		return
	}
	profile.Roles = normalizeRoles(profile.Roles)

	httpx.WriteJSON(w, http.StatusOK, profile)
}
