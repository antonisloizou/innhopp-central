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
	"deposit_pending":      {},
	"deposit_paid":         {},
	"main_invoice_pending": {},
	"completed":            {},
	"waitlisted":           {},
	"cancelled":            {},
	"expired":              {},
}

var validPaymentKinds = map[string]struct{}{
	"deposit":           {},
	"main_invoice":      {},
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

var errActiveRegistrationExists = errors.New("active registration already exists")

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
	r.Post("/public/events/{slug}/claim", h.createClaimedPublicRegistration)
	r.Get("/me", h.listOwnRegistrations)
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
	MainInvoiceDueAt    *time.Time             `json:"main_invoice_due_at,omitempty"`
	MainInvoicePaidAt   *time.Time             `json:"main_invoice_paid_at,omitempty"`
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
	MainInvoiceDueAt    string   `json:"main_invoice_due_at"`
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

type registrationEventSettings struct {
	ID                  int64
	Name                string
	StartsAt            time.Time
	MainInvoiceDeadline *time.Time
	DepositAmount       string
	MainInvoiceAmount   string
	Currency            string
}

type PublicRegistrationEvent struct {
	ID                            int64      `json:"id"`
	Name                          string     `json:"name"`
	Location                      string     `json:"location,omitempty"`
	Slots                         int        `json:"slots"`
	RemainingSlots                int        `json:"remaining_slots"`
	StartsAt                      time.Time  `json:"starts_at"`
	EndsAt                        *time.Time `json:"ends_at,omitempty"`
	PublicRegistrationSlug        string     `json:"public_registration_slug"`
	RegistrationOpenAt            *time.Time `json:"registration_open_at,omitempty"`
	MainInvoiceDeadline           *time.Time `json:"main_invoice_deadline,omitempty"`
	DepositAmount                 string     `json:"deposit_amount,omitempty"`
	MainInvoiceAmount             string     `json:"main_invoice_amount,omitempty"`
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
	r.main_invoice_due_at,
	r.main_invoice_paid_at,
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
	if status == "fully_paid" {
		status = "completed"
	}
	if _, ok := validRegistrationStatuses[status]; !ok {
		return "", errors.New("status must be one of: deposit_pending, deposit_paid, main_invoice_pending, completed, waitlisted, cancelled, expired")
	}
	return status, nil
}

func normalizePaymentKind(raw string) (string, error) {
	kind := strings.ToLower(strings.TrimSpace(raw))
	if kind == "" {
		kind = "deposit"
	}
	if _, ok := validPaymentKinds[kind]; !ok {
		return "", errors.New("kind must be one of: deposit, main_invoice, refund, manual_adjustment")
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

func parseOptionalDate(value string, field string) (*time.Time, error) {
	parsed, err := timeutil.ParseOptionalEventDate(value)
	if err != nil {
		return nil, fmt.Errorf("%s must be a valid date", field)
	}
	return parsed, nil
}

func normalizePaymentPaidAt(status string, paidAt *time.Time) *time.Time {
	if status == "paid" || status == "waived" {
		if paidAt != nil {
			return toOptionalUTCDate(paidAt)
		}
		now := toUTCDate(time.Now().UTC())
		return &now
	}
	return toOptionalUTCDate(paidAt)
}

func toUTCDate(value time.Time) time.Time {
	return time.Date(value.UTC().Year(), value.UTC().Month(), value.UTC().Day(), 0, 0, 0, 0, time.UTC)
}

func toOptionalUTCDate(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	normalized := toUTCDate(*value)
	return &normalized
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
		&registration.MainInvoiceDueAt,
		&registration.MainInvoicePaidAt,
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
	var mainInvoicePaidAt *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT MAX(COALESCE(paid_at, CURRENT_DATE)) FILTER (WHERE kind = 'deposit' AND status IN ('paid', 'waived')),
		       MAX(COALESCE(paid_at, CURRENT_DATE)) FILTER (WHERE kind = 'main_invoice' AND status IN ('paid', 'waived'))
		FROM registration_payments
		WHERE registration_id = $1
	`, registrationID).Scan(&depositPaidAt, &mainInvoicePaidAt); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE event_registrations
		SET deposit_paid_at = $2,
			main_invoice_paid_at = $3,
			updated_at = NOW()
		WHERE id = $1
	`, registrationID, depositPaidAt, mainInvoicePaidAt)
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

func loadRegistrationEventSettings(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, eventID int64) (*registrationEventSettings, error) {
	var event registrationEventSettings
	if err := q.QueryRow(ctx, `
		SELECT id,
		       name,
		       starts_at,
		       main_invoice_deadline,
		       COALESCE(deposit_amount::TEXT, ''),
		       COALESCE(main_invoice_amount::TEXT, ''),
		       COALESCE(currency, 'EUR')
		FROM events
		WHERE id = $1
	`, eventID).Scan(
		&event.ID,
		&event.Name,
		&event.StartsAt,
		&event.MainInvoiceDeadline,
		&event.DepositAmount,
		&event.MainInvoiceAmount,
		&event.Currency,
	); err != nil {
		return nil, err
	}
	event.Currency = strings.ToUpper(strings.TrimSpace(event.Currency))
	if event.Currency == "" {
		event.Currency = "EUR"
	}
	return &event, nil
}

func ensureEventParticipantTx(ctx context.Context, tx pgx.Tx, eventID, participantID int64) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO event_participants (event_id, participant_id)
		VALUES ($1, $2)
		ON CONFLICT (event_id, participant_id) DO NOTHING
	`, eventID, participantID)
	return err
}

func registrationStatusFromEventSettings(event *registrationEventSettings) string {
	if event == nil {
		return "deposit_pending"
	}
	return "deposit_pending"
}

func participantHasStaffRoleTx(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, participantID int64) (bool, error) {
	var isStaff bool
	if err := q.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM participant_profiles
			WHERE id = $1
			  AND 'Staff' = ANY(COALESCE(roles, ARRAY[]::TEXT[]))
		)
	`, participantID).Scan(&isStaff); err != nil {
		return false, err
	}
	return isStaff, nil
}

func depositDueAtFromEventSettings(now time.Time, event *registrationEventSettings) *time.Time {
	dueAt := toUTCDate(now)
	return &dueAt
}

func createDefaultPaymentRowsTx(ctx context.Context, tx pgx.Tx, registrationID int64, event *registrationEventSettings, depositDueAt, mainInvoiceDueAt *time.Time, note string) error {
	if event == nil {
		return nil
	}
	if strings.TrimSpace(event.DepositAmount) != "" && event.DepositAmount != "0" && event.DepositAmount != "0.00" {
		if _, err := tx.Exec(ctx, `
			INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, notes)
			VALUES ($1, 'deposit', $2::numeric, $3, 'pending', $4, $5)
		`, registrationID, event.DepositAmount, event.Currency, depositDueAt, note); err != nil {
			return err
		}
	}
	if strings.TrimSpace(event.MainInvoiceAmount) != "" && event.MainInvoiceAmount != "0" && event.MainInvoiceAmount != "0.00" {
		if _, err := tx.Exec(ctx, `
			INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, notes)
			VALUES ($1, 'main_invoice', $2::numeric, $3, 'pending', $4, $5)
		`, registrationID, event.MainInvoiceAmount, event.Currency, mainInvoiceDueAt, note); err != nil {
			return err
		}
	}
	return nil
}

func ensureStaffPaymentRowsWaivedTx(ctx context.Context, tx pgx.Tx, registrationID int64, event *registrationEventSettings, depositDueAt, mainInvoiceDueAt *time.Time, note string) error {
	waivedAt := toUTCDate(time.Now().UTC())

	if event != nil && hasPositiveConfiguredAmount(event.DepositAmount) {
		var paymentID int64
		err := tx.QueryRow(ctx, `
			SELECT id
			FROM registration_payments
			WHERE registration_id = $1
			  AND kind = 'deposit'
			ORDER BY id ASC
			LIMIT 1
		`, registrationID).Scan(&paymentID)
		if errors.Is(err, pgx.ErrNoRows) {
			if _, err := tx.Exec(ctx, `
				INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, paid_at, notes)
				VALUES ($1, 'deposit', $2::numeric, $3, 'waived', $4, $5, $6)
			`, registrationID, event.DepositAmount, event.Currency, depositDueAt, waivedAt, note); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}

	if event != nil && hasPositiveConfiguredAmount(event.MainInvoiceAmount) {
		var paymentID int64
		err := tx.QueryRow(ctx, `
			SELECT id
			FROM registration_payments
			WHERE registration_id = $1
			  AND kind = 'main_invoice'
			ORDER BY id ASC
			LIMIT 1
		`, registrationID).Scan(&paymentID)
		if errors.Is(err, pgx.ErrNoRows) {
			if _, err := tx.Exec(ctx, `
				INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, paid_at, notes)
				VALUES ($1, 'main_invoice', $2::numeric, $3, 'waived', $4, $5, $6)
			`, registrationID, event.MainInvoiceAmount, event.Currency, mainInvoiceDueAt, waivedAt, note); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}

	_, err := tx.Exec(ctx, `
		UPDATE registration_payments
		SET status = 'waived',
			paid_at = COALESCE(paid_at, $2),
			notes = CASE
				WHEN COALESCE(btrim(notes), '') = '' THEN $3
				ELSE notes
			END
		WHERE registration_id = $1
		  AND kind IN ('deposit', 'main_invoice')
		  AND status NOT IN ('refunded')
	`, registrationID, waivedAt, strings.TrimSpace(note))
	return err
}

func ensureStaffRegistrationCompletedTx(ctx context.Context, tx pgx.Tx, registrationID int64, event *registrationEventSettings, depositDueAt, mainInvoiceDueAt *time.Time, note string, accountID *int64) error {
	if err := ensureStaffPaymentRowsWaivedTx(ctx, tx, registrationID, event, depositDueAt, mainInvoiceDueAt, note); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE event_registrations
		SET status = 'completed',
			cancelled_at = NULL,
			expired_at = NULL,
			updated_at = NOW()
		WHERE id = $1
	`, registrationID); err != nil {
		return err
	}
	if err := syncRegistrationPaymentMarkersTx(ctx, tx, registrationID); err != nil {
		return err
	}
	return createActivityTx(ctx, tx, registrationID, "status_change", strings.TrimSpace(note), map[string]any{
		"status": "completed",
		"staff":  true,
	}, accountID)
}

func createMissingRegistrationForEventParticipantTx(ctx context.Context, tx pgx.Tx, event *registrationEventSettings, participantID int64, source, note string) error {
	if event == nil || participantID <= 0 {
		return nil
	}
	isStaff, err := participantHasStaffRoleTx(ctx, tx, participantID)
	if err != nil {
		return err
	}
	if !isStaff {
		if err := validateDepositRequired(event.DepositAmount); err != nil {
			return err
		}
	}
	exists, err := activeRegistrationExists(ctx, tx, event.ID, participantID)
	if err != nil || exists {
		return err
	}
	registeredAt := time.Now().UTC()
	depositDueAt := depositDueAtFromEventSettings(registeredAt, event)
	mainInvoiceDueAt := toOptionalUTCDate(event.MainInvoiceDeadline)
	status := registrationStatusFromEventSettings(event)
	if isStaff {
		status = "completed"
	}

	var registrationID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO event_registrations (
			event_id, participant_id, status, source, registered_at, deposit_due_at, main_invoice_due_at, tags, internal_notes
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, ARRAY[]::TEXT[], ''
		)
		RETURNING id
	`, event.ID, participantID, status, strings.TrimSpace(source), registeredAt, depositDueAt, mainInvoiceDueAt).Scan(&registrationID); err != nil {
		return err
	}

	if err := createDefaultPaymentRowsTx(ctx, tx, registrationID, event, depositDueAt, mainInvoiceDueAt, note); err != nil {
		return err
	}
	if isStaff {
		if err := ensureStaffRegistrationCompletedTx(ctx, tx, registrationID, event, depositDueAt, mainInvoiceDueAt, note, nil); err != nil {
			return err
		}
		return nil
	}
	if err := createActivityTx(ctx, tx, registrationID, "status_change", note, map[string]any{
		"status": status,
		"source": strings.TrimSpace(source),
	}, nil); err != nil {
		return err
	}
	return syncRegistrationPaymentMarkersTx(ctx, tx, registrationID)
}

func SyncEventParticipantsToRegistrationsTx(ctx context.Context, tx pgx.Tx, eventID int64, participantIDs []int64, source string) error {
	if eventID <= 0 {
		return nil
	}
	if err := deleteRemovedStaffRegistrationsForEventTx(ctx, tx, eventID, participantIDs); err != nil {
		return err
	}
	if len(participantIDs) == 0 {
		return nil
	}
	event, err := loadRegistrationEventSettings(ctx, tx, eventID)
	if err != nil {
		return err
	}
	for _, participantID := range participantIDs {
		if participantID <= 0 {
			continue
		}
		if err := createMissingRegistrationForEventParticipantTx(ctx, tx, event, participantID, source, "Registration created from event participant roster"); err != nil {
			return err
		}
	}
	return nil
}

func deleteRemovedStaffRegistrationsForEventTx(ctx context.Context, tx pgx.Tx, eventID int64, participantIDs []int64) error {
	if eventID <= 0 {
		return nil
	}

	keepParticipantIDs := make([]int64, 0, len(participantIDs))
	for _, participantID := range participantIDs {
		if participantID > 0 {
			keepParticipantIDs = append(keepParticipantIDs, participantID)
		}
	}

	if len(keepParticipantIDs) == 0 {
		_, err := tx.Exec(ctx, `
			DELETE FROM event_registrations r
			USING participant_profiles p
			WHERE r.participant_id = p.id
			  AND r.event_id = $1
			  AND r.cancelled_at IS NULL
			  AND r.expired_at IS NULL
			  AND 'Staff' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[]))
		`, eventID)
		return err
	}

	_, err := tx.Exec(ctx, `
		DELETE FROM event_registrations r
		USING participant_profiles p
		WHERE r.participant_id = p.id
		  AND r.event_id = $1
		  AND r.cancelled_at IS NULL
		  AND r.expired_at IS NULL
		  AND 'Staff' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[]))
		  AND NOT (r.participant_id = ANY($2))
	`, eventID, keepParticipantIDs)
	return err
}

func BackfillEventRosterSync(ctx context.Context, db *pgxpool.Pool) error {
	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO event_participants (event_id, participant_id)
		SELECT r.event_id, r.participant_id
		FROM event_registrations r
		WHERE r.cancelled_at IS NULL AND r.expired_at IS NULL
		ON CONFLICT (event_id, participant_id) DO NOTHING
	`); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
		SELECT ep.event_id, ep.participant_id
		FROM event_participants ep
		LEFT JOIN event_registrations r
		  ON r.event_id = ep.event_id
		 AND r.participant_id = ep.participant_id
		 AND r.cancelled_at IS NULL
		 AND r.expired_at IS NULL
		WHERE r.id IS NULL
		ORDER BY ep.event_id ASC, ep.participant_id ASC
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type pair struct {
		eventID       int64
		participantID int64
	}
	missing := make([]pair, 0)
	for rows.Next() {
		var item pair
		if err := rows.Scan(&item.eventID, &item.participantID); err != nil {
			return err
		}
		missing = append(missing, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	eventCache := make(map[int64]*registrationEventSettings)
	for _, item := range missing {
		event := eventCache[item.eventID]
		if event == nil {
			event, err = loadRegistrationEventSettings(ctx, tx, item.eventID)
			if err != nil {
				return err
			}
			eventCache[item.eventID] = event
		}
		if err := createMissingRegistrationForEventParticipantTx(ctx, tx, event, item.participantID, "event_roster_backfill", "Registration created by event roster backfill"); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func BackfillStaffRegistrations(ctx context.Context, db *pgxpool.Pool) error {
	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT r.id,
		       r.event_id,
		       r.registered_at,
		       r.deposit_due_at,
		       r.main_invoice_due_at
		FROM event_registrations r
		JOIN participant_profiles p ON p.id = r.participant_id
		WHERE r.cancelled_at IS NULL
		  AND r.expired_at IS NULL
		  AND 'Staff' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[]))
		ORDER BY r.id ASC
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type registrationItem struct {
		registrationID   int64
		eventID          int64
		registeredAt     time.Time
		depositDueAt     *time.Time
		mainInvoiceDueAt *time.Time
	}
	items := make([]registrationItem, 0)
	for rows.Next() {
		var item registrationItem
		if err := rows.Scan(&item.registrationID, &item.eventID, &item.registeredAt, &item.depositDueAt, &item.mainInvoiceDueAt); err != nil {
			return err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	eventCache := make(map[int64]*registrationEventSettings)
	for _, item := range items {
		event := eventCache[item.eventID]
		if event == nil {
			event, err = loadRegistrationEventSettings(ctx, tx, item.eventID)
			if err != nil {
				return err
			}
			eventCache[item.eventID] = event
		}
		depositDueAt := item.depositDueAt
		if depositDueAt == nil {
			depositDueAt = depositDueAtFromEventSettings(item.registeredAt, event)
		}
		mainInvoiceDueAt := item.mainInvoiceDueAt
		if mainInvoiceDueAt == nil {
			mainInvoiceDueAt = toOptionalUTCDate(event.MainInvoiceDeadline)
		}
		if err := ensureStaffRegistrationCompletedTx(ctx, tx, item.registrationID, event, depositDueAt, mainInvoiceDueAt, "Registration normalized for staff participant", nil); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func EnsureStaffParticipantRegistrations(ctx context.Context, db *pgxpool.Pool, participantID int64, accountID *int64) error {
	if participantID <= 0 {
		return nil
	}

	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	isStaff, err := participantHasStaffRoleTx(ctx, tx, participantID)
	if err != nil || !isStaff {
		return err
	}

	rows, err := tx.Query(ctx, `
		SELECT ep.event_id
		FROM event_participants ep
		WHERE ep.participant_id = $1
		ORDER BY ep.event_id ASC
	`, participantID)
	if err != nil {
		return err
	}
	defer rows.Close()

	eventIDs := make([]int64, 0)
	for rows.Next() {
		var eventID int64
		if err := rows.Scan(&eventID); err != nil {
			return err
		}
		eventIDs = append(eventIDs, eventID)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, eventID := range eventIDs {
		event, err := loadRegistrationEventSettings(ctx, tx, eventID)
		if err != nil {
			return err
		}

		var registrationID int64
		var registeredAt time.Time
		var depositDueAt *time.Time
		var mainInvoiceDueAt *time.Time
		err = tx.QueryRow(ctx, `
			SELECT id, registered_at, deposit_due_at, main_invoice_due_at
			FROM event_registrations
			WHERE event_id = $1
			  AND participant_id = $2
			  AND cancelled_at IS NULL
			  AND expired_at IS NULL
			ORDER BY created_at DESC
			LIMIT 1
		`, eventID, participantID).Scan(&registrationID, &registeredAt, &depositDueAt, &mainInvoiceDueAt)
		if errors.Is(err, pgx.ErrNoRows) {
			if err := createMissingRegistrationForEventParticipantTx(ctx, tx, event, participantID, "staff_role_sync", "Registration created from staff role assignment"); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}

		if depositDueAt == nil {
			depositDueAt = depositDueAtFromEventSettings(registeredAt, event)
		}
		if mainInvoiceDueAt == nil {
			mainInvoiceDueAt = toOptionalUTCDate(event.MainInvoiceDeadline)
		}
		if err := ensureStaffRegistrationCompletedTx(ctx, tx, registrationID, event, depositDueAt, mainInvoiceDueAt, "Registration normalized from staff role assignment", accountID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func ExpireOverdueRegistrations(ctx context.Context, db *pgxpool.Pool) (int64, error) {
	commandTag, err := db.Exec(ctx, `
		UPDATE event_registrations
		SET status = 'expired',
			expired_at = COALESCE(expired_at, NOW()),
			updated_at = NOW()
		WHERE cancelled_at IS NULL
		  AND expired_at IS NULL
		  AND status <> 'expired'
		  AND (
			(deposit_due_at IS NOT NULL AND deposit_paid_at IS NULL AND deposit_due_at < CURRENT_DATE)
			OR
			(main_invoice_due_at IS NOT NULL AND main_invoice_paid_at IS NULL AND main_invoice_due_at < CURRENT_DATE)
		  )
	`)
	if err != nil {
		return 0, err
	}
	return commandTag.RowsAffected(), nil
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

func hasPositiveConfiguredAmount(value string) bool {
	trimmed := strings.TrimSpace(value)
	return trimmed != "" && trimmed != "0" && trimmed != "0.00"
}

func validateDepositRequired(depositAmount string) error {
	if !hasPositiveConfiguredAmount(depositAmount) {
		return errors.New("deposit_amount must be configured for registrations")
	}
	return nil
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
		       GREATEST(
		       	slots - (
		       		SELECT COUNT(*)
		       		FROM event_registrations r
		       		JOIN participant_profiles p ON p.id = r.participant_id
		       		WHERE r.event_id = events.id
		       		  AND r.cancelled_at IS NULL
		       		  AND r.expired_at IS NULL
		       		  AND NOT ('Staff' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
		       	),
		       	0
		       ) AS remaining_slots,
		       starts_at,
		       ends_at,
		       COALESCE(public_registration_slug, ''),
		       registration_open_at,
		       main_invoice_deadline,
		       COALESCE(deposit_amount::TEXT, ''),
		       COALESCE(main_invoice_amount::TEXT, ''),
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
		&event.RemainingSlots,
		&event.StartsAt,
		&event.EndsAt,
		&event.PublicRegistrationSlug,
		&event.RegistrationOpenAt,
		&event.MainInvoiceDeadline,
		&event.DepositAmount,
		&event.MainInvoiceAmount,
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
	if event.RemainingSlots <= 0 {
		event.RegistrationAvailable = false
		event.RegistrationUnavailableReason = "registration is closed because the event is full"
	}
	if event.RegistrationAvailable {
		if err := validateDepositRequired(event.DepositAmount); err != nil {
			event.RegistrationAvailable = false
			event.RegistrationUnavailableReason = err.Error()
		}
	}
	return &event, nil
}

func publicDepositDueAt(now time.Time, event *PublicRegistrationEvent) *time.Time {
	dueAt := toUTCDate(now)
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

func ensureOwnParticipantProfileTx(ctx context.Context, tx pgx.Tx, claims *auth.Claims) (int64, error) {
	if claims == nil {
		return 0, errors.New("authentication required")
	}
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	fullName := strings.TrimSpace(claims.FullName)
	if email == "" {
		return 0, errors.New("email claim missing")
	}
	if fullName == "" {
		fullName = email
	}

	var participantID int64
	err := tx.QueryRow(ctx, `
		SELECT id
		FROM participant_profiles
		WHERE ($1 > 0 AND account_id = $1) OR lower(email) = $2
		ORDER BY CASE WHEN $1 > 0 AND account_id = $1 THEN 0 ELSE 1 END, id ASC
		LIMIT 1
	`, claims.AccountID, email).Scan(&participantID)
	if err == nil {
		if claims.AccountID > 0 {
			if _, err := tx.Exec(ctx, `
				UPDATE participant_profiles
				SET account_id = COALESCE(account_id, $2)
				WHERE id = $1
			`, participantID, claims.AccountID); err != nil {
				return 0, err
			}
		}
		return participantID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO participant_profiles (
			full_name,
			email,
			account_id,
			jumper,
			roles,
			account_roles
		)
		VALUES (
			$1,
			$2,
			$3,
			TRUE,
			ARRAY['Participant']::TEXT[],
			$4
		)
		RETURNING id
	`, fullName, email, nullableAccountID(claims.AccountID), normalizeAccountRoles(claims.Roles)).Scan(&participantID)
	if err != nil {
		return 0, err
	}
	return participantID, nil
}

func nullableAccountID(accountID int64) any {
	if accountID <= 0 {
		return nil
	}
	return accountID
}

func normalizeAccountRoles(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	roles := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if _, ok := seen[lower]; ok {
			continue
		}
		seen[lower] = struct{}{}
		roles = append(roles, lower)
	}
	return roles
}

func createPublicRegistrationTx(ctx context.Context, tx pgx.Tx, event *PublicRegistrationEvent, participantID int64, source, activitySummary string, accountID *int64) (int64, error) {
	if event == nil {
		return 0, errors.New("public registration event not found")
	}
	if participantID <= 0 {
		return 0, errors.New("participant is required")
	}
	if !event.RegistrationAvailable {
		return 0, errors.New(strings.TrimSpace(event.RegistrationUnavailableReason))
	}
	if err := validateDepositRequired(event.DepositAmount); err != nil {
		return 0, err
	}
	if exists, err := activeRegistrationExists(ctx, tx, event.ID, participantID); err != nil {
		return 0, err
	} else if exists {
		return 0, errActiveRegistrationExists
	}

	registeredAt := time.Now().UTC()
	depositDueAt := publicDepositDueAt(registeredAt, event)
	mainInvoiceDueAt := toOptionalUTCDate(event.MainInvoiceDeadline)
	status := "deposit_pending"

	var registrationID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO event_registrations (
			event_id, participant_id, status, source, registered_at, deposit_due_at, main_invoice_due_at, tags, internal_notes
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, ARRAY[]::TEXT[], ''
		)
		RETURNING id
	`, event.ID, participantID, status, strings.TrimSpace(source), registeredAt, depositDueAt, mainInvoiceDueAt).Scan(&registrationID); err != nil {
		return 0, err
	}
	if err := ensureEventParticipantTx(ctx, tx, event.ID, participantID); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, notes)
		VALUES ($1, 'deposit', $2::numeric, $3, 'pending', $4, 'Created from public registration')
	`, registrationID, event.DepositAmount, event.Currency, depositDueAt); err != nil {
		return 0, err
	}
	if hasPositiveConfiguredAmount(event.MainInvoiceAmount) {
		if _, err := tx.Exec(ctx, `
			INSERT INTO registration_payments (registration_id, kind, amount, currency, status, due_at, notes)
			VALUES ($1, 'main_invoice', $2::numeric, $3, 'pending', $4, 'Created from public registration')
		`, registrationID, event.MainInvoiceAmount, event.Currency, mainInvoiceDueAt); err != nil {
			return 0, err
		}
	}
	if err := createActivityTx(ctx, tx, registrationID, "status_change", activitySummary, map[string]any{
		"status":     status,
		"source":     strings.TrimSpace(source),
		"event_slug": event.PublicRegistrationSlug,
	}, accountID); err != nil {
		return 0, err
	}
	if err := syncRegistrationPaymentMarkersTx(ctx, tx, registrationID); err != nil {
		return 0, err
	}
	return registrationID, nil
}

func normalizeStaffPublicRegistrationTx(ctx context.Context, tx pgx.Tx, registrationID int64, participantID int64, accountID *int64) error {
	if registrationID <= 0 || participantID <= 0 {
		return nil
	}
	isStaff, err := participantHasStaffRoleTx(ctx, tx, participantID)
	if err != nil || !isStaff {
		return err
	}

	var eventID int64
	var registeredAt time.Time
	var depositDueAt *time.Time
	var mainInvoiceDueAt *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT event_id, registered_at, deposit_due_at, main_invoice_due_at
		FROM event_registrations
		WHERE id = $1
	`, registrationID).Scan(&eventID, &registeredAt, &depositDueAt, &mainInvoiceDueAt); err != nil {
		return err
	}

	event, err := loadRegistrationEventSettings(ctx, tx, eventID)
	if err != nil {
		return err
	}
	if depositDueAt == nil {
		depositDueAt = depositDueAtFromEventSettings(registeredAt, event)
	}
	if mainInvoiceDueAt == nil {
		mainInvoiceDueAt = toOptionalUTCDate(event.MainInvoiceDeadline)
	}
	return ensureStaffRegistrationCompletedTx(
		ctx,
		tx,
		registrationID,
		event,
		depositDueAt,
		mainInvoiceDueAt,
		"Registration normalized from public registration for staff participant",
		accountID,
	)
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
	if err := validateDepositRequired(event.DepositAmount); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
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

	registrationID, err := createPublicRegistrationTx(ctx, tx, event, participantID, "public_link", "Public registration submitted", nil)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.Is(err, errActiveRegistrationExists) || (errors.As(err, &pgErr) && pgErr.Code == "23505") {
			httpx.Error(w, http.StatusConflict, "you already have an active registration for this event")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create registration: %v", err))
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

func (h *Handler) createClaimedPublicRegistration(w http.ResponseWriter, r *http.Request) {
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		httpx.Error(w, http.StatusBadRequest, "registration slug is required")
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

	participantID, err := ensureOwnParticipantProfileTx(ctx, tx, claims)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to prepare participant profile: %v", err))
		return
	}

	accountID := claims.AccountID
	registrationID, err := createPublicRegistrationTx(
		ctx,
		tx,
		event,
		participantID,
		"public_google",
		"Public registration claimed after Google sign-in",
		&accountID,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		switch {
		case errors.Is(err, errActiveRegistrationExists), (errors.As(err, &pgErr) && pgErr.Code == "23505"):
			httpx.Error(w, http.StatusConflict, "you already have an active registration for this event")
			return
		case strings.TrimSpace(err.Error()) == strings.TrimSpace(event.RegistrationUnavailableReason):
			httpx.Error(w, http.StatusForbidden, err.Error())
			return
		default:
			httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create registration: %v", err))
			return
		}
	}
	if err := normalizeStaffPublicRegistrationTx(ctx, tx, registrationID, participantID, &accountID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to normalize staff registration: %v", err))
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

func (h *Handler) listOwnRegistrations(w http.ResponseWriter, r *http.Request) {
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		httpx.Error(w, http.StatusBadRequest, "email claim missing")
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id
		FROM (
			SELECT DISTINCT ON (r.event_id)
			       r.id,
			       r.event_id,
			       r.cancelled_at,
			       r.expired_at,
			       r.registered_at
			FROM event_registrations r
			JOIN participant_profiles p ON p.id = r.participant_id
			WHERE (($1 > 0 AND p.account_id = $1) OR lower(p.email) = $2)
			ORDER BY
				r.event_id,
				CASE WHEN r.cancelled_at IS NULL AND r.expired_at IS NULL THEN 0 ELSE 1 END,
				r.registered_at DESC,
				r.id DESC
		) own_registrations
		ORDER BY registered_at DESC, id DESC
	`, claims.AccountID, email)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list registrations")
		return
	}
	defer rows.Close()

	registrations := make([]Registration, 0)
	for rows.Next() {
		var registrationID int64
		if err := rows.Scan(&registrationID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse registrations")
			return
		}
		registration, err := h.loadRegistration(r.Context(), registrationID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load registrations")
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

func (h *Handler) listEventRegistrations(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT `+registrationSelectColumns+`
		FROM (
			SELECT DISTINCT ON (participant_id)
			       id,
			       event_id,
			       participant_id,
			       status,
			       source,
			       registered_at,
			       deposit_due_at,
			       deposit_paid_at,
			       main_invoice_due_at,
			       main_invoice_paid_at,
			       cancelled_at,
			       expired_at,
			       waitlist_position,
			       staff_owner_account_id,
			       tags,
			       internal_notes,
			       created_at,
			       updated_at
			FROM event_registrations
			WHERE event_id = $1
			ORDER BY participant_id, registered_at DESC, id DESC
		) r
		JOIN events e ON e.id = r.event_id
		JOIN participant_profiles p ON p.id = r.participant_id
		WHERE NOT ('Staff' = ANY(COALESCE(p.roles, ARRAY[]::TEXT[])))
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
	depositDueAt, err := parseOptionalDate(payload.DepositDueAt, "deposit_due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	mainInvoiceDueAt, err := parseOptionalDate(payload.MainInvoiceDueAt, "main_invoice_due_at")
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
	eventSettings, err := loadRegistrationEventSettings(ctx, tx, eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusBadRequest, "event_id is invalid")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load event settings")
		return
	}
	if err := validateDepositRequired(eventSettings.DepositAmount); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if depositDueAt == nil {
		depositDueAt = depositDueAtFromEventSettings(time.Now().UTC(), eventSettings)
	}
	if mainInvoiceDueAt == nil {
		mainInvoiceDueAt = toOptionalUTCDate(eventSettings.MainInvoiceDeadline)
	}

	var registrationID int64
	row := tx.QueryRow(ctx, `
		INSERT INTO event_registrations (
			event_id, participant_id, status, source, registered_at, deposit_due_at, main_invoice_due_at,
			cancelled_at, expired_at, waitlist_position, staff_owner_account_id, tags, internal_notes
		) VALUES (
			$1, $2, $3, $4, COALESCE($5, NOW()), $6, $7,
			CASE WHEN $3 = 'cancelled' THEN NOW() ELSE NULL END,
			CASE WHEN $3 = 'expired' THEN NOW() ELSE NULL END,
			$8, $9, $10, $11
		)
		RETURNING id
	`, eventID, payload.ParticipantID, status, strings.TrimSpace(payload.Source), registeredAt, depositDueAt, mainInvoiceDueAt, payload.WaitlistPosition, payload.StaffOwnerAccountID, tags, strings.TrimSpace(payload.InternalNotes))
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
	if err := ensureEventParticipantTx(ctx, tx, eventID, payload.ParticipantID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync event participant")
		return
	}
	if err := createDefaultPaymentRowsTx(ctx, tx, registrationID, eventSettings, depositDueAt, mainInvoiceDueAt, "Created from staff registration"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create default payments")
		return
	}
	if err := syncRegistrationPaymentMarkersTx(ctx, tx, registrationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to finalize registration")
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

	depositDueAt, err := parseOptionalDate(payload.DepositDueAt, "deposit_due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	mainInvoiceDueAt, err := parseOptionalDate(payload.MainInvoiceDueAt, "main_invoice_due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	tags := normalizeTags(payload.Tags)

	commandTag, err := h.db.Exec(r.Context(), `
		UPDATE event_registrations
		SET source = $2,
			deposit_due_at = $3,
			main_invoice_due_at = $4,
			waitlist_position = $5,
			staff_owner_account_id = $6,
			tags = $7,
			internal_notes = $8,
			updated_at = NOW()
		WHERE id = $1
	`, registrationID, strings.TrimSpace(payload.Source), depositDueAt, mainInvoiceDueAt, payload.WaitlistPosition, payload.StaffOwnerAccountID, tags, strings.TrimSpace(payload.InternalNotes))
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
	dueAt, err := parseOptionalDate(payload.DueAt, "due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	paidAt, err := parseOptionalDate(payload.PaidAt, "paid_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	paidAt = normalizePaymentPaidAt(status, paidAt)
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
	dueAt, err := parseOptionalDate(payload.DueAt, "due_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	paidAt, err := parseOptionalDate(payload.PaidAt, "paid_at")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	paidAt = normalizePaymentPaidAt(status, paidAt)
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
