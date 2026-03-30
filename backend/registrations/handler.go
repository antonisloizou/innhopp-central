package registrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/auth"
	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/internal/timeutil"
	"github.com/innhopp/central/backend/rbac"
)

var validRegistrationStatuses = map[string]struct{}{
	"applied":         {},
	"deposit_pending": {},
	"deposit_paid":    {},
	"confirmed":       {},
	"balance_pending": {},
	"fully_paid":      {},
	"waitlisted":      {},
	"cancelled":       {},
	"expired":         {},
}

var validPaymentKinds = map[string]struct{}{
	"deposit":           {},
	"balance":           {},
	"refund":            {},
	"manual_adjustment": {},
}

var validPaymentStatuses = map[string]struct{}{
	"pending":  {},
	"paid":     {},
	"failed":   {},
	"waived":   {},
	"refunded": {},
}

var validActivityTypes = map[string]struct{}{
	"note":            {},
	"status_change":   {},
	"payment_created": {},
	"payment_updated": {},
}

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.Get("/public/events/{slug}", h.getPublicEvent)
	r.Post("/public/events/{slug}/register", h.createPublicRegistration)
	r.With(enforcer.Authorize(rbac.PermissionViewRegistrations)).Get("/events/{eventID}", h.listEventRegistrations)
	r.With(enforcer.Authorize(rbac.PermissionManageRegistrations)).Post("/events/{eventID}", h.createRegistration)
	r.With(enforcer.Authorize(rbac.PermissionViewRegistrations)).Get("/{registrationID}", h.getRegistration)
	r.With(enforcer.Authorize(rbac.PermissionManageRegistrations)).Put("/{registrationID}", h.updateRegistration)
	r.With(enforcer.Authorize(rbac.PermissionManageRegistrations)).Post("/{registrationID}/status", h.updateRegistrationStatus)
	r.With(enforcer.Authorize(rbac.PermissionManageRegistrations)).Post("/{registrationID}/payments", h.createPayment)
	r.With(enforcer.Authorize(rbac.PermissionManageRegistrations)).Put("/payments/{paymentID}", h.updatePayment)
	r.With(enforcer.Authorize(rbac.PermissionManageRegistrations)).Post("/{registrationID}/activity", h.createActivity)
	return r
}

type Registration struct {
	ID                  int64                  `json:"id"`
	EventID             int64                  `json:"event_id"`
	EventName           string                 `json:"event_name,omitempty"`
	ParticipantID       int64                  `json:"participant_id"`
	ParticipantName     string                 `json:"participant_name,omitempty"`
	ParticipantEmail    string                 `json:"participant_email,omitempty"`
	Status              string                 `json:"status"`
	Source              string                 `json:"source,omitempty"`
	RegisteredAt        time.Time              `json:"registered_at"`
	DepositDueAt        *time.Time             `json:"deposit_due_at,omitempty"`
	DepositPaidAt       *time.Time             `json:"deposit_paid_at,omitempty"`
	BalanceDueAt        *time.Time             `json:"balance_due_at,omitempty"`
	BalancePaidAt       *time.Time             `json:"balance_paid_at,omitempty"`
	CancelledAt         *time.Time             `json:"cancelled_at,omitempty"`
	ExpiredAt           *time.Time             `json:"expired_at,omitempty"`
	WaitlistPosition    *int                   `json:"waitlist_position,omitempty"`
	StaffOwnerAccountID *int64                 `json:"staff_owner_account_id,omitempty"`
	Tags                []string               `json:"tags"`
	InternalNotes       string                 `json:"internal_notes,omitempty"`
	CreatedAt           time.Time              `json:"created_at"`
	UpdatedAt           time.Time              `json:"updated_at"`
	Payments            []RegistrationPayment  `json:"payments,omitempty"`
	Activities          []RegistrationActivity `json:"activities,omitempty"`
}

type RegistrationPayment struct {
	ID                  int64      `json:"id"`
	RegistrationID      int64      `json:"registration_id"`
	Kind                string     `json:"kind"`
	Amount              string     `json:"amount"`
	Currency            string     `json:"currency"`
	Status              string     `json:"status"`
	DueAt               *time.Time `json:"due_at,omitempty"`
	PaidAt              *time.Time `json:"paid_at,omitempty"`
	Provider            string     `json:"provider,omitempty"`
	ProviderRef         string     `json:"provider_ref,omitempty"`
	RecordedByAccountID *int64     `json:"recorded_by_account_id,omitempty"`
	Notes               string     `json:"notes,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
}

type RegistrationActivity struct {
	ID                 int64          `json:"id"`
	RegistrationID     int64          `json:"registration_id"`
	Type               string         `json:"type"`
	Summary            string         `json:"summary"`
	Payload            map[string]any `json:"payload,omitempty"`
	CreatedByAccountID *int64         `json:"created_by_account_id,omitempty"`
	CreatedAt          time.Time      `json:"created_at"`
}

type registrationPayload struct {
	ParticipantID       int64    `json:"participant_id"`
	Status              string   `json:"status"`
	Source              string   `json:"source"`
	RegisteredAt        string   `json:"registered_at"`
	DepositDueAt        string   `json:"deposit_due_at"`
	BalanceDueAt        string   `json:"balance_due_at"`
	WaitlistPosition    *int     `json:"waitlist_position"`
	StaffOwnerAccountID *int64   `json:"staff_owner_account_id"`
	Tags                []string `json:"tags"`
	InternalNotes       string   `json:"internal_notes"`
}

type registrationStatusPayload struct {
	Status string `json:"status"`
}

type paymentPayload struct {
	Kind        string `json:"kind"`
	Amount      string `json:"amount"`
	Currency    string `json:"currency"`
	Status      string `json:"status"`
	DueAt       string `json:"due_at"`
	PaidAt      string `json:"paid_at"`
	Provider    string `json:"provider"`
	ProviderRef string `json:"provider_ref"`
	Notes       string `json:"notes"`
}

type activityPayload struct {
	Type    string         `json:"type"`
	Summary string         `json:"summary"`
	Payload map[string]any `json:"payload"`
}

type PublicRegistrationEvent struct {
	ID                            int64      `json:"id"`
	Name                          string     `json:"name"`
	Location                      string     `json:"location,omitempty"`
	Slots                         int        `json:"slots"`
	StartsAt                      time.Time  `json:"starts_at"`
	EndsAt                        *time.Time `json:"ends_at,omitempty"`
	PublicRegistrationSlug        string     `json:"public_registration_slug"`
	RegistrationOpenAt            *time.Time `json:"registration_open_at,omitempty"`
	BalanceDeadline               *time.Time `json:"balance_deadline,omitempty"`
	DepositAmount                 string     `json:"deposit_amount,omitempty"`
	BalanceAmount                 string     `json:"balance_amount,omitempty"`
	Currency                      string     `json:"currency"`
	MinimumRegistrations          int        `json:"minimum_registrations"`
	CommercialStatus              string     `json:"commercial_status"`
	RegistrationAvailable         bool       `json:"registration_available"`
	RegistrationUnavailableReason string     `json:"registration_unavailable_reason,omitempty"`
}

type publicRegistrationPayload struct {
	FullName         string `json:"full_name"`
	Email            string `json:"email"`
	Phone            string `json:"phone"`
	ExperienceLevel  string `json:"experience_level"`
	EmergencyContact string `json:"emergency_contact"`
	Whatsapp         string `json:"whatsapp"`
	Instagram        string `json:"instagram"`
	Citizenship      string `json:"citizenship"`
	DateOfBirth      string `json:"date_of_birth"`
	Jumper           bool   `json:"jumper"`
	YearsInSport     *int   `json:"years_in_sport"`
	JumpCount        *int   `json:"jump_count"`
	RecentJumpCount  *int   `json:"recent_jump_count"`
	License          string `json:"license"`
}

const registrationSelectColumns = `
	r.id,
	r.event_id,
	e.name,
	r.participant_id,
	p.full_name,
	p.email,
	r.status,
	COALESCE(r.source, ''),
	r.registered_at,
	r.deposit_due_at,
	r.deposit_paid_at,
	r.balance_due_at,
	r.balance_paid_at,
	r.cancelled_at,
	r.expired_at,
	r.waitlist_position,
	r.staff_owner_account_id,
	COALESCE(r.tags, ARRAY[]::TEXT[]),
	COALESCE(r.internal_notes, ''),
	r.created_at,
	r.updated_at
`

func normalizeRegistrationStatus(raw string) (string, error) {
	status := strings.ToLower(strings.TrimSpace(raw))
	if status == "" {
		status = "deposit_pending"
	}
	if _, ok := validRegistrationStatuses[status]; !ok {
		return "", errors.New("status must be one of: applied, deposit_pending, deposit_paid, confirmed, balance_pending, fully_paid, waitlisted, cancelled, expired")
	}
	return status, nil
}

func normalizePaymentKind(raw string) (string, error) {
	kind := strings.ToLower(strings.TrimSpace(raw))
	if kind == "" {
		kind = "deposit"
	}
	if _, ok := validPaymentKinds[kind]; !ok {
		return "", errors.New("kind must be one of: deposit, balance, refund, manual_adjustment")
	}
	return kind, nil
}

func normalizePaymentStatus(raw string) (string, error) {
	status := strings.ToLower(strings.TrimSpace(raw))
	if status == "" {
		status = "pending"
	}
	if _, ok := validPaymentStatuses[status]; !ok {
		return "", errors.New("status must be one of: pending, paid, failed, waived, refunded")
	}
	return status, nil
}

func normalizeActivityType(raw string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" {
		value = "note"
	}
	if _, ok := validActivityTypes[value]; !ok {
		return "", errors.New("type must be one of: note, status_change, payment_created, payment_updated")
	}
	return value, nil
}

func normalizeTags(input []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(input))
	for _, raw := range input {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func parseOptionalTimestamp(value string, field string) (*time.Time, error) {
	parsed, err := timeutil.ParseOptionalEventTimestamp(value)
	if err != nil {
		return nil, fmt.Errorf("%s must be a valid timestamp", field)
	}
	return parsed, nil
}

func currentAccountID(ctx context.Context) *int64 {
	claims := auth.FromContext(ctx)
	if claims == nil || claims.AccountID <= 0 {
		return nil
	}
	accountID := claims.AccountID
	return &accountID
}

func scanRegistration(scanner interface{ Scan(dest ...any) error }) (*Registration, error) {
	var registration Registration
	if err := scanner.Scan(
		&registration.ID,
		&registration.EventID,
		&registration.EventName,
		&registration.ParticipantID,
		&registration.ParticipantName,
		&registration.ParticipantEmail,
		&registration.Status,
		&registration.Source,
		&registration.RegisteredAt,
		&registration.DepositDueAt,
		&registration.DepositPaidAt,
		&registration.BalanceDueAt,
		&registration.BalancePaidAt,
		&registration.CancelledAt,
		&registration.ExpiredAt,
		&registration.WaitlistPosition,
		&registration.StaffOwnerAccountID,
		&registration.Tags,
		&registration.InternalNotes,
		&registration.CreatedAt,
		&registration.UpdatedAt,
	); err != nil {
		return nil, err
	}
	registration.ParticipantEmail = strings.ToLower(strings.TrimSpace(registration.ParticipantEmail))
	registration.Tags = normalizeTags(registration.Tags)
	return &registration, nil
}

func loadPayments(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, registrationID int64) ([]RegistrationPayment, error) {
	rows, err := q.Query(ctx, `
		SELECT id,
		       registration_id,
		       kind,
		       amount::TEXT,
		       currency,
		       status,
		       due_at,
		       paid_at,
		       COALESCE(provider, ''),
		       COALESCE(provider_ref, ''),
		       recorded_by_account_id,
		       COALESCE(notes, ''),
		       created_at
		FROM registration_payments
		WHERE registration_id = $1
		ORDER BY created_at ASC, id ASC
	`, registrationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	payments := make([]RegistrationPayment, 0)
	for rows.Next() {
		var payment RegistrationPayment
		if err := rows.Scan(
			&payment.ID,
			&payment.RegistrationID,
			&payment.Kind,
			&payment.Amount,
			&payment.Currency,
			&payment.Status,
			&payment.DueAt,
			&payment.PaidAt,
			&payment.Provider,
			&payment.ProviderRef,
			&payment.RecordedByAccountID,
			&payment.Notes,
			&payment.CreatedAt,
		); err != nil {
			return nil, err
		}
		payments = append(payments, payment)
	}
	return payments, rows.Err()
}

func loadActivities(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, registrationID int64) ([]RegistrationActivity, error) {
	rows, err := q.Query(ctx, `
		SELECT id, registration_id, type, summary, payload, created_by_account_id, created_at
		FROM registration_activity
		WHERE registration_id = $1
		ORDER BY created_at DESC, id DESC
	`, registrationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	activities := make([]RegistrationActivity, 0)
	for rows.Next() {
		var activity RegistrationActivity
		var payloadRaw []byte
		if err := rows.Scan(
			&activity.ID,
			&activity.RegistrationID,
			&activity.Type,
			&activity.Summary,
			&payloadRaw,
			&activity.CreatedByAccountID,
			&activity.CreatedAt,
		); err != nil {
			return nil, err
		}
		if len(payloadRaw) > 0 && string(payloadRaw) != "null" && string(payloadRaw) != "{}" {
			if err := json.Unmarshal(payloadRaw, &activity.Payload); err != nil {
				return nil, err
			}
		}
		activities = append(activities, activity)
	}
	return activities, rows.Err()
}

func (h *Handler) loadRegistration(ctx context.Context, registrationID int64) (*Registration, error) {
	row := h.db.QueryRow(ctx, `
		SELECT `+registrationSelectColumns+`
		FROM event_registrations r
		JOIN events e ON e.id = r.event_id
		JOIN participant_profiles p ON p.id = r.participant_id
		WHERE r.id = $1
	`, registrationID)
	registration, err := scanRegistration(row)
	if err != nil {
		return nil, err
	}
	registration.Payments, err = loadPayments(ctx, h.db, registrationID)
	if err != nil {
		return nil, err
	}
	registration.Activities, err = loadActivities(ctx, h.db, registrationID)
	if err != nil {
		return nil, err
	}
	return registration, nil
}

func createActivityTx(ctx context.Context, tx pgx.Tx, registrationID int64, activityType, summary string, payload map[string]any, accountID *int64) error {
	if strings.TrimSpace(summary) == "" {
		return nil
	}
	payloadJSON := []byte(`{}`)
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		payloadJSON = encoded
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO registration_activity (registration_id, type, summary, payload, created_by_account_id)
		VALUES ($1, $2, $3, $4::jsonb, $5)
	`, registrationID, activityType, strings.TrimSpace(summary), string(payloadJSON), accountID)
	return err
}

func syncRegistrationPaymentMarkersTx(ctx context.Context, tx pgx.Tx, registrationID int64) error {
	var depositPaidAt *time.Time
	var balancePaidAt *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT MAX(paid_at) FILTER (WHERE kind = 'deposit' AND status = 'paid'),
		       MAX(paid_at) FILTER (WHERE kind = 'balance' AND status = 'paid')
		FROM registration_payments
		WHERE registration_id = $1
	`, registrationID).Scan(&depositPaidAt, &balancePaidAt); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE event_registrations
		SET deposit_paid_at = $2,
			balance_paid_at = $3,
			updated_at = NOW()
		WHERE id = $1
	`, registrationID, depositPaidAt, balancePaidAt)
	return err
}

func activeRegistrationExists(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, eventID, participantID int64) (bool, error) {
	var existingID int64
	err := q.QueryRow(ctx, `
		SELECT id
		FROM event_registrations
		WHERE event_id = $1
		  AND participant_id = $2
		  AND cancelled_at IS NULL
		  AND expired_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
	`, eventID, participantID).Scan(&existingID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return existingID > 0, nil
}

func normalizeOptionalPublicString(value string) string {
	return strings.TrimSpace(value)
}

func normalizeOptionalPublicInt(value *int) *int {
	if value == nil {
		return nil
	}
	if *value < 0 {
		zero := 0
		return &zero
	}
	return value
}

func loadPublicRegistrationEvent(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, slug string) (*PublicRegistrationEvent, error) {
	var event PublicRegistrationEvent
	if err := q.QueryRow(ctx, `
		SELECT id,
		       name,
		       COALESCE(location, ''),
		       slots,
		       starts_at,
		       ends_at,
		       COALESCE(public_registration_slug, ''),
		       registration_open_at,
		       balance_deadline,
		       COALESCE(deposit_amount::TEXT, ''),
		       COALESCE(balance_amount::TEXT, ''),
		       COALESCE(currency, 'EUR'),
		       COALESCE(minimum_deposit_count, 0),
		       COALESCE(commercial_status, 'draft')
		FROM events
		WHERE public_registration_enabled = TRUE
		  AND lower(public_registration_slug) = lower($1)
		LIMIT 1
	`, strings.TrimSpace(slug)).Scan(
		&event.ID,
		&event.Name,
		&event.Location,
		&event.Slots,
		&event.StartsAt,
		&event.EndsAt,
		&event.PublicRegistrationSlug,
		&event.RegistrationOpenAt,
		&event.BalanceDeadline,
		&event.DepositAmount,
		&event.BalanceAmount,
		&event.Currency,
		&event.MinimumRegistrations,
		&event.CommercialStatus,
	); err != nil {
		return nil, err
	}
	event.Currency = strings.ToUpper(strings.TrimSpace(event.Currency))
	if event.Currency == "" {
		event.Currency = "EUR"
	}
	event.RegistrationAvailable = true
	now := time.Now().UTC()
	if event.RegistrationOpenAt != nil && now.Before(*event.RegistrationOpenAt) {
		event.RegistrationAvailable = false
		event.RegistrationUnavailableReason = "registration is not open yet"
	}
	if now.After(event.StartsAt) {
		event.RegistrationAvailable = false
		event.RegistrationUnavailableReason = "registration is closed because the event has already started"
	}
	return &event, nil
}

func publicDepositDueAt(now time.Time, event *PublicRegistrationEvent) *time.Time {
	if event == nil {
		return nil
	}
	dueAt := now.Add(7 * 24 * time.Hour)
	if event.BalanceDeadline != nil && event.BalanceDeadline.Before(dueAt) {
		dueAt = *event.BalanceDeadline
	}
	if event.StartsAt.Before(dueAt) {
		dueAt = event.StartsAt
	}
	return &dueAt
}

func (h *Handler) findOrCreatePublicParticipantTx(ctx context.Context, tx pgx.Tx, payload *publicRegistrationPayload) (int64, error) {
	fullName := strings.TrimSpace(payload.FullName)
	email := strings.ToLower(strings.TrimSpace(payload.Email))
	if fullName == "" || email == "" {
		return 0, errors.New("full_name and email are required")
	}

	var participantID int64
	err := tx.QueryRow(ctx, `
		SELECT id
		FROM participant_profiles
		WHERE lower(email) = lower($1)
		ORDER BY id ASC
		LIMIT 1
	`, email).Scan(&participantID)
	if err == nil {
		return participantID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	payload.Phone = normalizeOptionalPublicString(payload.Phone)
	payload.ExperienceLevel = normalizeOptionalPublicString(payload.ExperienceLevel)
	payload.EmergencyContact = normalizeOptionalPublicString(payload.EmergencyContact)
	payload.Whatsapp = normalizeOptionalPublicString(payload.Whatsapp)
	payload.Instagram = normalizeOptionalPublicString(payload.Instagram)
	payload.Citizenship = normalizeOptionalPublicString(payload.Citizenship)
	payload.DateOfBirth = normalizeOptionalPublicString(payload.DateOfBirth)
	payload.License = normalizeOptionalPublicString(payload.License)
	payload.YearsInSport = normalizeOptionalPublicInt(payload.YearsInSport)
	payload.JumpCount = normalizeOptionalPublicInt(payload.JumpCount)
	payload.RecentJumpCount = normalizeOptionalPublicInt(payload.RecentJumpCount)

	err = tx.QueryRow(ctx, `
		INSERT INTO participant_profiles (
			full_name,
			email,
			account_id,
			phone,
			experience_level,
			emergency_contact,
			whatsapp,
			instagram,
			citizenship,
			date_of_birth,
			jumper,
			years_in_sport,
			jump_count,
			recent_jump_count,
			license,
			roles
		)
		VALUES (
			$1,
			$2,
			(SELECT id FROM accounts WHERE lower(email) = lower($2) ORDER BY id ASC LIMIT 1),
			$3,
			$4,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11,
			$12,
			$13,
			$14,
			ARRAY['Participant']::TEXT[]
		)
		RETURNING id
	`, fullName, email, payload.Phone, payload.ExperienceLevel, payload.EmergencyContact, payload.Whatsapp, payload.Instagram, payload.Citizenship, payload.DateOfBirth, payload.Jumper, payload.YearsInSport, payload.JumpCount, payload.RecentJumpCount, payload.License).Scan(&participantID)
	if err != nil {
		return 0, err
	}
	return participantID, nil
}

func (h *Handler) getPublicEvent(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		httpx.Error(w, http.StatusBadRequest, "registration slug is required")
		return
	}
	event, err := loadPublicRegistrationEvent(r.Context(), h.db, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "public registration event not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load public registration event")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, event)
}

func (h *Handler) createPublicRegistration(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		httpx.Error(w, http.StatusBadRequest, "registration slug is required")
		return
	}

	var payload publicRegistrationPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	if strings.TrimSpace(payload.FullName) == "" || strings.TrimSpace(payload.Email) == "" {
		httpx.Error(w, http.StatusBadRequest, "full_name and email are required")
		return
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create registration")
		return
	}
	defer tx.Rollback(ctx)

	event, err := loadPublicRegistrationEvent(ctx, tx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "public registration event not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load public registration event")
		return
	}
	if !event.RegistrationAvailable {
		httpx.Error(w, http.StatusForbidden, event.RegistrationUnavailableReason)
		return
	}

	participantID, err := h.findOrCreatePublicParticipantTx(ctx, tx, &payload)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "a participant with that email already exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to prepare participant profile: %v", err))
		return
	}
	if exists, err := activeRegistrationExists(ctx, tx, event.ID, participantID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate registration")
		return
	} else if exists {
		httpx.Error(w, http.StatusConflict, "you already have an active registration for this event")
		return
	}

	registeredAt := time.Now().UTC()
	depositDueAt := publicDepositDueAt(registeredAt, event)
	balanceDueAt := event.BalanceDeadline
	status := "deposit_pending"
	if strings.TrimSpace(event.DepositAmount) == "" || event.DepositAmount == "0" || event.DepositAmount == "0.00" {
		if strings.TrimSpace(event.BalanceAmount) != "" && event.BalanceAmount != "0" && event.BalanceAmount != "0.00" {
			status = "balance_pending"
		} else {
			status = "confirmed"
		}
	}

	var registrationID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO event_registrations (
			event_id, participant_id, status, source, registered_at, deposit_due_at, balance_due_at, tags, internal_notes
		) VALUES (
			$1, $2, $3, 'public_link', $4, $5, $6, ARRAY[]::TEXT[], ''
		)
		RETURNING id
	`, event.ID, participantID, status, registeredAt, depositDueAt, balanceDueAt).Scan(&registrationID); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "you already have an active registration for this event")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create registration: %v", err))
		return
	}

	if strings.TrimSpace(event.DepositAmount) != "" && event.DepositAmount != "0" && event.DepositAmount != "0.00" {
		if _, err := tx.Exec(ctx, `
			INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, notes)
			VALUES ($1, 'deposit', $2::numeric, $3, 'pending', $4, 'Created from public registration')
		`, registrationID, event.DepositAmount, event.Currency, depositDueAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create deposit payment: %v", err))
			return
		}
	}
	if strings.TrimSpace(event.BalanceAmount) != "" && event.BalanceAmount != "0" && event.BalanceAmount != "0.00" {
		if _, err := tx.Exec(ctx, `
			INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, notes)
			VALUES ($1, 'balance', $2::numeric, $3, 'pending', $4, 'Created from public registration')
		`, registrationID, event.BalanceAmount, event.Currency, balanceDueAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create balance payment: %v", err))
			return
		}
	}

	if err := createActivityTx(ctx, tx, registrationID, "status_change", "Public registration submitted", map[string]any{
		"status":     status,
		"source":     "public_link",
		"event_slug": event.PublicRegistrationSlug,
	}, nil); err != nil {
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create registration activity: %v", err))
		return
	}
	if err := syncRegistrationPaymentMarkersTx(ctx, tx, registrationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to finalize registration: %v", err))
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to commit registration: %v", err))
		return
	}

	registration, err := h.loadRegistration(ctx, registrationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to load registration: %v", err))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, registration)
}

func (h *Handler) listEventRegistrations(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT `+registrationSelectColumns+`
		FROM event_registrations r
		JOIN events e ON e.id = r.event_id
		JOIN participant_profiles p ON p.id = r.participant_id
		WHERE r.event_id = $1
		ORDER BY r.registered_at DESC, r.id DESC
	`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list registrations")
		return
	}
	defer rows.Close()

	registrations := make([]Registration, 0)
	for rows.Next() {
		registration, scanErr := scanRegistration(rows)
		if scanErr != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse registrations")
			return
		}
		registrations = append(registrations, *registration)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list registrations")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, registrations)
}

func (h *Handler) createRegistration(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var payload registrationPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	if payload.ParticipantID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "participant_id is required")
		return
	}

	status, err := normalizeRegistrationStatus(payload.Status)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	registeredAt, err := parseOptionalTimestamp(payload.RegisteredAt, "registered_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	depositDueAt, err := parseOptionalTimestamp(payload.DepositDueAt, "deposit_due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	balanceDueAt, err := parseOptionalTimestamp(payload.BalanceDueAt, "balance_due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	tags := normalizeTags(payload.Tags)

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create registration")
		return
	}
	defer tx.Rollback(ctx)

	if exists, err := activeRegistrationExists(ctx, tx, eventID, payload.ParticipantID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate registration")
		return
	} else if exists {
		httpx.Error(w, http.StatusConflict, "participant already has an active registration for this event")
		return
	}

	var registrationID int64
	row := tx.QueryRow(ctx, `
		INSERT INTO event_registrations (
			event_id, participant_id, status, source, registered_at, deposit_due_at, balance_due_at,
			cancelled_at, expired_at, waitlist_position, staff_owner_account_id, tags, internal_notes
		) VALUES (
			$1, $2, $3, $4, COALESCE($5, NOW()), $6, $7,
			CASE WHEN $3 = 'cancelled' THEN NOW() ELSE NULL END,
			CASE WHEN $3 = 'expired' THEN NOW() ELSE NULL END,
			$8, $9, $10, $11
		)
		RETURNING id
	`, eventID, payload.ParticipantID, status, strings.TrimSpace(payload.Source), registeredAt, depositDueAt, balanceDueAt, payload.WaitlistPosition, payload.StaffOwnerAccountID, tags, strings.TrimSpace(payload.InternalNotes))
	if err := row.Scan(&registrationID); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			httpx.Error(w, http.StatusBadRequest, "event_id or participant_id is invalid")
			return
		}
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "participant already has an active registration for this event")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to create registration")
		return
	}

	if err := createActivityTx(ctx, tx, registrationID, "status_change", "Registration created", map[string]any{
		"status": status,
		"source": strings.TrimSpace(payload.Source),
	}, currentAccountID(ctx)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create registration")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create registration")
		return
	}

	registration, err := h.loadRegistration(ctx, registrationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load registration")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, registration)
}

func (h *Handler) getRegistration(w http.ResponseWriter, r *http.Request) {
	registrationID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil || registrationID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid registration id")
		return
	}
	registration, err := h.loadRegistration(r.Context(), registrationID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "registration not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load registration")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, registration)
}

func (h *Handler) updateRegistration(w http.ResponseWriter, r *http.Request) {
	registrationID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil || registrationID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid registration id")
		return
	}

	var payload registrationPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	depositDueAt, err := parseOptionalTimestamp(payload.DepositDueAt, "deposit_due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	balanceDueAt, err := parseOptionalTimestamp(payload.BalanceDueAt, "balance_due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	tags := normalizeTags(payload.Tags)

	commandTag, err := h.db.Exec(r.Context(), `
		UPDATE event_registrations
		SET source = $2,
			deposit_due_at = $3,
			balance_due_at = $4,
			waitlist_position = $5,
			staff_owner_account_id = $6,
			tags = $7,
			internal_notes = $8,
			updated_at = NOW()
		WHERE id = $1
	`, registrationID, strings.TrimSpace(payload.Source), depositDueAt, balanceDueAt, payload.WaitlistPosition, payload.StaffOwnerAccountID, tags, strings.TrimSpace(payload.InternalNotes))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update registration")
		return
	}
	if commandTag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "registration not found")
		return
	}

	registration, err := h.loadRegistration(r.Context(), registrationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load registration")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, registration)
}

func (h *Handler) updateRegistrationStatus(w http.ResponseWriter, r *http.Request) {
	registrationID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil || registrationID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid registration id")
		return
	}

	var payload registrationStatusPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	status, err := normalizeRegistrationStatus(payload.Status)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update registration status")
		return
	}
	defer tx.Rollback(ctx)

	commandTag, err := tx.Exec(ctx, `
		UPDATE event_registrations
		SET status = $2,
			cancelled_at = CASE WHEN $2 = 'cancelled' THEN NOW() ELSE NULL END,
			expired_at = CASE WHEN $2 = 'expired' THEN NOW() ELSE NULL END,
			updated_at = NOW()
		WHERE id = $1
	`, registrationID, status)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update registration status")
		return
	}
	if commandTag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "registration not found")
		return
	}

	if err := createActivityTx(ctx, tx, registrationID, "status_change", "Registration status updated", map[string]any{
		"status": status,
	}, currentAccountID(ctx)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update registration status")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update registration status")
		return
	}

	registration, err := h.loadRegistration(ctx, registrationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load registration")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, registration)
}

func (h *Handler) createPayment(w http.ResponseWriter, r *http.Request) {
	registrationID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil || registrationID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid registration id")
		return
	}

	var payload paymentPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	kind, err := normalizePaymentKind(payload.Kind)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	status, err := normalizePaymentStatus(payload.Status)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	dueAt, err := parseOptionalTimestamp(payload.DueAt, "due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	paidAt, err := parseOptionalTimestamp(payload.PaidAt, "paid_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	currency := strings.ToUpper(strings.TrimSpace(payload.Currency))
	if currency == "" {
		currency = "EUR"
	}
	amount := strings.TrimSpace(payload.Amount)
	if amount == "" {
		amount = "0"
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create payment")
		return
	}
	defer tx.Rollback(ctx)

	var paymentID int64
	row := tx.QueryRow(ctx, `
		INSERT INTO registration_payments (
			registration_id, kind, amount, currency, status, due_at, paid_at, provider, provider_ref, recorded_by_account_id, notes
		) VALUES (
			$1, $2, $3::numeric, $4, $5, $6, $7, $8, $9, $10, $11
		)
		RETURNING id
	`, registrationID, kind, amount, currency, status, dueAt, paidAt, strings.TrimSpace(payload.Provider), strings.TrimSpace(payload.ProviderRef), currentAccountID(ctx), strings.TrimSpace(payload.Notes))
	if err := row.Scan(&paymentID); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			httpx.Error(w, http.StatusBadRequest, "registration_id is invalid")
			return
		}
		if errors.As(err, &pgErr) && pgErr.Code == "22P02" {
			httpx.Error(w, http.StatusBadRequest, "amount must be numeric")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to create payment")
		return
	}

	if err := syncRegistrationPaymentMarkersTx(ctx, tx, registrationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment markers")
		return
	}
	if err := createActivityTx(ctx, tx, registrationID, "payment_created", "Payment record created", map[string]any{
		"payment_id": paymentID,
		"kind":       kind,
		"status":     status,
		"amount":     amount,
		"currency":   currency,
	}, currentAccountID(ctx)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create payment")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create payment")
		return
	}

	registration, err := h.loadRegistration(ctx, registrationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load registration")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, registration)
}

func (h *Handler) updatePayment(w http.ResponseWriter, r *http.Request) {
	paymentID, err := strconv.ParseInt(chi.URLParam(r, "paymentID"), 10, 64)
	if err != nil || paymentID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid payment id")
		return
	}

	var payload paymentPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	kind, err := normalizePaymentKind(payload.Kind)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	status, err := normalizePaymentStatus(payload.Status)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	dueAt, err := parseOptionalTimestamp(payload.DueAt, "due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	paidAt, err := parseOptionalTimestamp(payload.PaidAt, "paid_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	currency := strings.ToUpper(strings.TrimSpace(payload.Currency))
	if currency == "" {
		currency = "EUR"
	}
	amount := strings.TrimSpace(payload.Amount)
	if amount == "" {
		amount = "0"
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment")
		return
	}
	defer tx.Rollback(ctx)

	var registrationID int64
	commandTag, err := tx.Exec(ctx, `
		UPDATE registration_payments
		SET kind = $2,
			amount = $3::numeric,
			currency = $4,
			status = $5,
			due_at = $6,
			paid_at = $7,
			provider = $8,
			provider_ref = $9,
			notes = $10
		WHERE id = $1
	`, paymentID, kind, amount, currency, status, dueAt, paidAt, strings.TrimSpace(payload.Provider), strings.TrimSpace(payload.ProviderRef), strings.TrimSpace(payload.Notes))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "22P02" {
			httpx.Error(w, http.StatusBadRequest, "amount must be numeric")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment")
		return
	}
	if commandTag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "payment not found")
		return
	}
	if err := tx.QueryRow(ctx, `SELECT registration_id FROM registration_payments WHERE id = $1`, paymentID).Scan(&registrationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment")
		return
	}
	if err := syncRegistrationPaymentMarkersTx(ctx, tx, registrationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment markers")
		return
	}
	if err := createActivityTx(ctx, tx, registrationID, "payment_updated", "Payment record updated", map[string]any{
		"payment_id": paymentID,
		"kind":       kind,
		"status":     status,
		"amount":     amount,
		"currency":   currency,
	}, currentAccountID(ctx)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment")
		return
	}

	registration, err := h.loadRegistration(ctx, registrationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load registration")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, registration)
}

func (h *Handler) createActivity(w http.ResponseWriter, r *http.Request) {
	registrationID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil || registrationID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid registration id")
		return
	}

	var payload activityPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	activityType, err := normalizeActivityType(payload.Type)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	summary := strings.TrimSpace(payload.Summary)
	if summary == "" {
		httpx.Error(w, http.StatusBadRequest, "summary is required")
		return
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create activity")
		return
	}
	defer tx.Rollback(ctx)

	if err := createActivityTx(ctx, tx, registrationID, activityType, summary, payload.Payload, currentAccountID(ctx)); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			httpx.Error(w, http.StatusBadRequest, "registration_id is invalid")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to create activity")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create activity")
		return
	}

	registration, err := h.loadRegistration(ctx, registrationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load registration")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, registration)
}
