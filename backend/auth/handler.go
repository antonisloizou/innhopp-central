package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
)

// Handler manages authentication workflows such as session issuance.
type Handler struct {
	db *pgxpool.Pool
}

// NewHandler constructs an auth handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes exposes the auth endpoints.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/sessions", h.createSession)
	return r
}

type sessionRequest struct {
	Email string `json:"email"`
}

type sessionResponse struct {
	ParticipantID int64  `json:"participant_id"`
	FullName      string `json:"full_name"`
	Email         string `json:"email"`
}

func (h *Handler) createSession(w http.ResponseWriter, r *http.Request) {
	var payload sessionRequest
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	email := strings.TrimSpace(strings.ToLower(payload.Email))
	if email == "" {
		httpx.Error(w, http.StatusBadRequest, "email is required")
		return
	}

	row := h.db.QueryRow(r.Context(), `SELECT id, full_name, email FROM participant_profiles WHERE LOWER(email) = $1`, email)

	var resp sessionResponse
	if err := row.Scan(&resp.ParticipantID, &resp.FullName, &resp.Email); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusUnauthorized, "participant not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to lookup participant")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}
