package comms

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
	"github.com/innhopp/central/backend/rbac"
)

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewComms)).Get("/templates", h.listTemplates)
	r.With(enforcer.Authorize(rbac.PermissionManageComms)).Post("/templates", h.createTemplate)
	r.With(enforcer.Authorize(rbac.PermissionManageComms)).Put("/templates/{templateID}", h.updateTemplate)
	r.With(enforcer.Authorize(rbac.PermissionViewComms)).Get("/events/{eventID}/audience-preview", h.audiencePreview)
	r.With(enforcer.Authorize(rbac.PermissionViewComms)).Get("/events/{eventID}/campaigns", h.listEventCampaigns)
	r.With(enforcer.Authorize(rbac.PermissionManageComms)).Post("/campaigns", h.createCampaign)
	r.With(enforcer.Authorize(rbac.PermissionViewComms)).Get("/campaigns/{campaignID}", h.getCampaign)
	return r
}

type EmailTemplate struct {
	ID              int64     `json:"id"`
	Key             string    `json:"key"`
	Name            string    `json:"name"`
	SubjectTemplate string    `json:"subject_template"`
	BodyTemplate    string    `json:"body_template"`
	AudienceType    string    `json:"audience_type"`
	Enabled         bool      `json:"enabled"`
	CreatedAt       time.Time `json:"created_at"`
}

type AudienceFilter struct {
	Status                  string   `json:"status,omitempty"`
	DepositState            string   `json:"deposit_state,omitempty"`
	MainInvoiceState        string   `json:"main_invoice_state,omitempty"`
	Roles                   []string `json:"roles,omitempty"`
	IncludedRegistrationIDs []int64  `json:"included_registration_ids,omitempty"`
	ExcludedRegistrationIDs []int64  `json:"excluded_registration_ids,omitempty"`
}

type AudienceRecipient struct {
	RegistrationID    int64      `json:"registration_id"`
	ParticipantID     int64      `json:"participant_id"`
	ParticipantName   string     `json:"participant_name"`
	ParticipantEmail  string     `json:"participant_email"`
	Status            string     `json:"status"`
	DepositDueAt      *time.Time `json:"deposit_due_at,omitempty"`
	DepositPaidAt     *time.Time `json:"deposit_paid_at,omitempty"`
	MainInvoiceDueAt  *time.Time `json:"main_invoice_due_at,omitempty"`
	MainInvoicePaidAt *time.Time `json:"main_invoice_paid_at,omitempty"`
	DepositState      string     `json:"deposit_state"`
	MainInvoiceState  string     `json:"main_invoice_state"`
}

type AudiencePreviewResponse struct {
	Count      int                 `json:"count"`
	Recipients []AudienceRecipient `json:"recipients"`
}

type Campaign struct {
	ID                 int64           `json:"id"`
	EventID            *int64          `json:"event_id,omitempty"`
	TemplateID         *int64          `json:"template_id,omitempty"`
	TemplateName       string          `json:"template_name,omitempty"`
	Mode               string          `json:"mode"`
	Filter             AudienceFilter  `json:"filter"`
	ScheduledFor       *time.Time      `json:"scheduled_for,omitempty"`
	Status             string          `json:"status"`
	CreatedByAccountID *int64          `json:"created_by_account_id,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	DeliveryCount      int             `json:"delivery_count"`
	Deliveries         []EmailDelivery `json:"deliveries,omitempty"`
}

type EmailDelivery struct {
	ID                int64      `json:"id"`
	CampaignID        int64      `json:"campaign_id"`
	RegistrationID    *int64     `json:"registration_id,omitempty"`
	Email             string     `json:"email"`
	Subject           string     `json:"subject"`
	Body              string     `json:"body"`
	ProviderMessageID string     `json:"provider_message_id,omitempty"`
	Status            string     `json:"status"`
	SentAt            *time.Time `json:"sent_at,omitempty"`
	FailedAt          *time.Time `json:"failed_at,omitempty"`
	ErrorMessage      string     `json:"error_message,omitempty"`
}

type templatePayload struct {
	Key             string `json:"key"`
	Name            string `json:"name"`
	SubjectTemplate string `json:"subject_template"`
	BodyTemplate    string `json:"body_template"`
	AudienceType    string `json:"audience_type"`
	Enabled         bool   `json:"enabled"`
}

type campaignPayload struct {
	EventID    int64          `json:"event_id"`
	TemplateID int64          `json:"template_id"`
	Mode       string         `json:"mode"`
	Filter     AudienceFilter `json:"filter"`
}

func parseAudienceRegistrationIDs(values []string) []int64 {
	ids := make([]int64, 0, len(values))
	for _, value := range values {
		id, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
		if err != nil || id <= 0 {
			continue
		}
		ids = append(ids, id)
	}
	return normalizeAudienceRegistrationIDs(ids)
}

func currentAccountID(ctx context.Context) *int64 {
	claims := auth.FromContext(ctx)
	if claims == nil || claims.AccountID <= 0 {
		return nil
	}
	accountID := claims.AccountID
	return &accountID
}

func normalizeTemplateAudienceType(value string) string {
	if strings.TrimSpace(value) == "" {
		return "event_registrations"
	}
	return strings.TrimSpace(strings.ToLower(value))
}

func normalizePaymentState(paymentStatus string, dueAt, paidAt *time.Time, registrationStatus string) string {
	if strings.EqualFold(strings.TrimSpace(paymentStatus), "waived") {
		return "waived"
	}
	if paidAt != nil {
		return "paid"
	}
	if dueAt == nil || registrationStatus == "cancelled" {
		return "none"
	}
	now := time.Now().UTC()
	todayUTC := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if dueAt.Before(todayUTC) {
		return "overdue"
	}
	return "pending"
}

var allowedAudienceRoles = map[string]struct{}{
	"Participant": {},
	"Skydiver":    {},
	"Staff":       {},
	"Ground Crew": {},
	"Jump Master": {},
	"Jump Leader": {},
	"Driver":      {},
	"Pilot":       {},
	"POC":         {},
	"Photo":       {},
}

func canonicalAudienceRole(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if strings.EqualFold(trimmed, "COP") {
		trimmed = "POC"
	}
	for role := range allowedAudienceRoles {
		if strings.EqualFold(trimmed, role) {
			return role
		}
	}
	return ""
}

func normalizeAudienceRoles(input []string) []string {
	seen := make(map[string]struct{})
	roles := make([]string, 0, len(input))
	for _, value := range input {
		canonical := canonicalAudienceRole(value)
		if canonical == "" {
			continue
		}
		if _, exists := seen[canonical]; exists {
			continue
		}
		seen[canonical] = struct{}{}
		roles = append(roles, canonical)
	}
	return roles
}

func normalizeAudienceRegistrationIDs(input []int64) []int64 {
	seen := make(map[int64]struct{}, len(input))
	ids := make([]int64, 0, len(input))
	for _, id := range input {
		if id <= 0 {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

func hasRole(roles []string, target string) bool {
	canonicalTarget := canonicalAudienceRole(target)
	if canonicalTarget == "" {
		return false
	}
	for _, role := range roles {
		if canonicalAudienceRole(role) == canonicalTarget {
			return true
		}
	}
	return false
}

func matchesAudienceRoleFilter(participantRoles []string, filterRoles []string) bool {
	if len(filterRoles) == 0 {
		return true
	}
	if hasRole(filterRoles, "Participant") && !hasRole(filterRoles, "Staff") && hasRole(participantRoles, "Staff") {
		return false
	}
	for _, role := range filterRoles {
		if !hasRole(participantRoles, role) {
			return false
		}
	}
	return true
}

func loadAudienceRecipients(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, eventID int64, filter AudienceFilter) ([]AudienceRecipient, error) {
	filter.Roles = normalizeAudienceRoles(filter.Roles)
	rows, err := q.Query(ctx, `
		SELECT latest.id,
		       latest.participant_id,
		       COALESCE(p.full_name, ''),
		       COALESCE(p.email, ''),
		       COALESCE(p.roles, ARRAY[]::TEXT[]),
		       latest.status,
		       latest.deposit_due_at,
		       latest.deposit_paid_at,
		       latest.main_invoice_due_at,
		       latest.main_invoice_paid_at,
		       COALESCE((
		       	SELECT rp.status
		       	FROM registration_payments rp
		       	WHERE rp.registration_id = latest.id
		       	  AND rp.kind = 'deposit'
		       	ORDER BY rp.created_at DESC, rp.id DESC
		       	LIMIT 1
		       ), ''),
		       COALESCE((
		       	SELECT rp.status
		       	FROM registration_payments rp
		       	WHERE rp.registration_id = latest.id
		       	  AND rp.kind = 'main_invoice'
		       	ORDER BY rp.created_at DESC, rp.id DESC
		       	LIMIT 1
		       ), '')
		FROM (
			SELECT DISTINCT ON (r.participant_id)
			       r.id,
			       r.participant_id,
			       r.status,
			       r.deposit_due_at,
			       r.deposit_paid_at,
			       r.main_invoice_due_at,
			       r.main_invoice_paid_at,
			       r.registered_at
			FROM event_registrations r
			WHERE r.event_id = $1
			ORDER BY r.participant_id, r.registered_at DESC, r.id DESC
		) latest
		JOIN participant_profiles p ON p.id = latest.participant_id
		WHERE COALESCE(p.email, '') <> ''
		ORDER BY latest.registered_at DESC, latest.id DESC
	`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipients := make([]AudienceRecipient, 0)
	for rows.Next() {
		var recipient AudienceRecipient
		var participantRoles []string
		var depositPaymentStatus string
		var mainInvoicePaymentStatus string
		if err := rows.Scan(
			&recipient.RegistrationID,
			&recipient.ParticipantID,
			&recipient.ParticipantName,
			&recipient.ParticipantEmail,
			&participantRoles,
			&recipient.Status,
			&recipient.DepositDueAt,
			&recipient.DepositPaidAt,
			&recipient.MainInvoiceDueAt,
			&recipient.MainInvoicePaidAt,
			&depositPaymentStatus,
			&mainInvoicePaymentStatus,
		); err != nil {
			return nil, err
		}
		recipient.ParticipantEmail = strings.ToLower(strings.TrimSpace(recipient.ParticipantEmail))
		recipient.DepositState = normalizePaymentState(depositPaymentStatus, recipient.DepositDueAt, recipient.DepositPaidAt, recipient.Status)
		recipient.MainInvoiceState = normalizePaymentState(mainInvoicePaymentStatus, recipient.MainInvoiceDueAt, recipient.MainInvoicePaidAt, recipient.Status)
		if filter.Status != "" && recipient.Status != filter.Status {
			continue
		}
		if filter.DepositState != "" && recipient.DepositState != filter.DepositState {
			continue
		}
		if filter.MainInvoiceState != "" && recipient.MainInvoiceState != filter.MainInvoiceState {
			continue
		}
		if !matchesAudienceRoleFilter(participantRoles, filter.Roles) {
			continue
		}
		recipients = append(recipients, recipient)
	}
	return recipients, rows.Err()
}

func loadAudienceRecipientsByRegistrationIDs(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, eventID int64, registrationIDs []int64) ([]AudienceRecipient, error) {
	registrationIDs = normalizeAudienceRegistrationIDs(registrationIDs)
	if len(registrationIDs) == 0 {
		return []AudienceRecipient{}, nil
	}
	rows, err := q.Query(ctx, `
		SELECT r.id,
		       r.participant_id,
		       COALESCE(p.full_name, ''),
		       COALESCE(p.email, ''),
		       r.status,
		       r.deposit_due_at,
		       r.deposit_paid_at,
		       r.main_invoice_due_at,
		       r.main_invoice_paid_at,
		       COALESCE((
		       	SELECT rp.status
		       	FROM registration_payments rp
		       	WHERE rp.registration_id = r.id
		       	  AND rp.kind = 'deposit'
		       	ORDER BY rp.created_at DESC, rp.id DESC
		       	LIMIT 1
		       ), ''),
		       COALESCE((
		       	SELECT rp.status
		       	FROM registration_payments rp
		       	WHERE rp.registration_id = r.id
		       	  AND rp.kind = 'main_invoice'
		       	ORDER BY rp.created_at DESC, rp.id DESC
		       	LIMIT 1
		       ), '')
		FROM event_registrations r
		JOIN participant_profiles p ON p.id = r.participant_id
		WHERE r.event_id = $1
		  AND r.id = ANY($2)
		  AND COALESCE(p.email, '') <> ''
		ORDER BY r.registered_at DESC, r.id DESC
	`, eventID, registrationIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipients := make([]AudienceRecipient, 0, len(registrationIDs))
	for rows.Next() {
		var recipient AudienceRecipient
		var depositPaymentStatus string
		var mainInvoicePaymentStatus string
		if err := rows.Scan(
			&recipient.RegistrationID,
			&recipient.ParticipantID,
			&recipient.ParticipantName,
			&recipient.ParticipantEmail,
			&recipient.Status,
			&recipient.DepositDueAt,
			&recipient.DepositPaidAt,
			&recipient.MainInvoiceDueAt,
			&recipient.MainInvoicePaidAt,
			&depositPaymentStatus,
			&mainInvoicePaymentStatus,
		); err != nil {
			return nil, err
		}
		recipient.ParticipantEmail = strings.ToLower(strings.TrimSpace(recipient.ParticipantEmail))
		recipient.DepositState = normalizePaymentState(depositPaymentStatus, recipient.DepositDueAt, recipient.DepositPaidAt, recipient.Status)
		recipient.MainInvoiceState = normalizePaymentState(mainInvoicePaymentStatus, recipient.MainInvoiceDueAt, recipient.MainInvoicePaidAt, recipient.Status)
		recipients = append(recipients, recipient)
	}
	return recipients, rows.Err()
}

func resolveAudienceRecipients(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, eventID int64, filter AudienceFilter) ([]AudienceRecipient, error) {
	baseRecipients, err := loadAudienceRecipients(ctx, q, eventID, filter)
	if err != nil {
		return nil, err
	}
	includedRecipients, err := loadAudienceRecipientsByRegistrationIDs(ctx, q, eventID, filter.IncludedRegistrationIDs)
	if err != nil {
		return nil, err
	}

	excludedIDs := make(map[int64]struct{}, len(filter.ExcludedRegistrationIDs))
	for _, id := range normalizeAudienceRegistrationIDs(filter.ExcludedRegistrationIDs) {
		excludedIDs[id] = struct{}{}
	}

	merged := make([]AudienceRecipient, 0, len(baseRecipients)+len(includedRecipients))
	seen := make(map[int64]struct{}, len(baseRecipients)+len(includedRecipients))
	appendRecipient := func(recipient AudienceRecipient) {
		if _, excluded := excludedIDs[recipient.RegistrationID]; excluded {
			return
		}
		if _, exists := seen[recipient.RegistrationID]; exists {
			return
		}
		seen[recipient.RegistrationID] = struct{}{}
		merged = append(merged, recipient)
	}

	for _, recipient := range baseRecipients {
		appendRecipient(recipient)
	}
	for _, recipient := range includedRecipients {
		appendRecipient(recipient)
	}
	return merged, nil
}

func renderTimestamp(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format("2006-01-02 15:04 UTC")
}

func renderDate(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format("2006-01-02")
}

func renderMoney(value string, currency string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	cur := strings.ToUpper(strings.TrimSpace(currency))
	if cur == "" {
		cur = "EUR"
	}
	return strings.TrimSpace(value) + " " + cur
}

func renderTemplate(text string, replacements map[string]string) string {
	rendered := text
	for key, value := range replacements {
		rendered = strings.ReplaceAll(rendered, "{{"+key+"}}", value)
	}
	return rendered
}

func loadTemplate(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, templateID int64) (*EmailTemplate, error) {
	var template EmailTemplate
	if err := q.QueryRow(ctx, `
		SELECT id, key, name, subject_template, body_template, audience_type, enabled, created_at
		FROM email_templates
		WHERE id = $1
	`, templateID).Scan(
		&template.ID,
		&template.Key,
		&template.Name,
		&template.SubjectTemplate,
		&template.BodyTemplate,
		&template.AudienceType,
		&template.Enabled,
		&template.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &template, nil
}

func loadEventMetadata(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, eventID int64) (map[string]string, error) {
	var name string
	var location string
	var startsAt time.Time
	var mainInvoiceDeadline *time.Time
	var depositAmount string
	var mainInvoiceAmount string
	var currency string
	var slug string
	if err := q.QueryRow(ctx, `
		SELECT name,
		       COALESCE(location, ''),
		       starts_at,
		       main_invoice_deadline,
		       COALESCE(deposit_amount::TEXT, ''),
		       COALESCE(main_invoice_amount::TEXT, ''),
		       COALESCE(currency, 'EUR'),
		       COALESCE(public_registration_slug, '')
		FROM events
		WHERE id = $1
	`, eventID).Scan(&name, &location, &startsAt, &mainInvoiceDeadline, &depositAmount, &mainInvoiceAmount, &currency, &slug); err != nil {
		return nil, err
	}
	totalAmount := ""
	if depositAmount != "" || mainInvoiceAmount != "" {
		totalAmount = renderMoney(strings.TrimSpace(fmt.Sprintf("%g", parseFloat(depositAmount)+parseFloat(mainInvoiceAmount))), currency)
	}
	publicLink := ""
	if strings.TrimSpace(slug) != "" {
		publicLink = "/register/" + strings.TrimSpace(slug)
	}
	return map[string]string{
		"event_name":               name,
		"event_location":           location,
		"event_starts_at":          startsAt.UTC().Format("2006-01-02 15:04 UTC"),
		"main_invoice_deadline":    renderTimestamp(mainInvoiceDeadline),
		"deposit_amount":           renderMoney(depositAmount, currency),
		"main_invoice_amount":      renderMoney(mainInvoiceAmount, currency),
		"total_amount":             totalAmount,
		"currency":                 strings.ToUpper(strings.TrimSpace(currency)),
		"public_registration_link": publicLink,
	}, nil
}

func parseFloat(value string) float64 {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0
	}
	parsed, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func scanCampaign(scanner interface{ Scan(dest ...any) error }) (*Campaign, error) {
	var campaign Campaign
	var eventID *int64
	var templateID *int64
	var filterJSON []byte
	if err := scanner.Scan(
		&campaign.ID,
		&eventID,
		&templateID,
		&campaign.TemplateName,
		&campaign.Mode,
		&filterJSON,
		&campaign.ScheduledFor,
		&campaign.Status,
		&campaign.CreatedByAccountID,
		&campaign.CreatedAt,
		&campaign.DeliveryCount,
	); err != nil {
		return nil, err
	}
	campaign.EventID = eventID
	campaign.TemplateID = templateID
	if len(filterJSON) > 0 && string(filterJSON) != "{}" && string(filterJSON) != "null" {
		if err := json.Unmarshal(filterJSON, &campaign.Filter); err != nil {
			return nil, err
		}
	}
	return &campaign, nil
}

func loadDeliveries(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, campaignID int64) ([]EmailDelivery, error) {
	rows, err := q.Query(ctx, `
		SELECT id,
		       campaign_id,
		       registration_id,
		       email,
		       subject,
		       body,
		       COALESCE(provider_message_id, ''),
		       status,
		       sent_at,
		       failed_at,
		       COALESCE(error_message, '')
		FROM email_deliveries
		WHERE campaign_id = $1
		ORDER BY id ASC
	`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	deliveries := make([]EmailDelivery, 0)
	for rows.Next() {
		var delivery EmailDelivery
		if err := rows.Scan(
			&delivery.ID,
			&delivery.CampaignID,
			&delivery.RegistrationID,
			&delivery.Email,
			&delivery.Subject,
			&delivery.Body,
			&delivery.ProviderMessageID,
			&delivery.Status,
			&delivery.SentAt,
			&delivery.FailedAt,
			&delivery.ErrorMessage,
		); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, delivery)
	}
	return deliveries, rows.Err()
}

func (h *Handler) listTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, key, name, subject_template, body_template, audience_type, enabled, created_at
		FROM email_templates
		ORDER BY created_at DESC, id DESC
	`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list templates")
		return
	}
	defer rows.Close()
	templates := make([]EmailTemplate, 0)
	for rows.Next() {
		var template EmailTemplate
		if err := rows.Scan(
			&template.ID,
			&template.Key,
			&template.Name,
			&template.SubjectTemplate,
			&template.BodyTemplate,
			&template.AudienceType,
			&template.Enabled,
			&template.CreatedAt,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse templates")
			return
		}
		templates = append(templates, template)
	}
	httpx.WriteJSON(w, http.StatusOK, templates)
}

func (h *Handler) createTemplate(w http.ResponseWriter, r *http.Request) {
	var payload templatePayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	key := strings.ToLower(strings.TrimSpace(payload.Key))
	name := strings.TrimSpace(payload.Name)
	subject := strings.TrimSpace(payload.SubjectTemplate)
	body := strings.TrimSpace(payload.BodyTemplate)
	if key == "" || name == "" || subject == "" || body == "" {
		httpx.Error(w, http.StatusBadRequest, "key, name, subject_template, and body_template are required")
		return
	}
	row := h.db.QueryRow(r.Context(), `
		INSERT INTO email_templates (key, name, subject_template, body_template, audience_type, enabled)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, key, name, subject_template, body_template, audience_type, enabled, created_at
	`, key, name, subject, body, normalizeTemplateAudienceType(payload.AudienceType), payload.Enabled)
	var template EmailTemplate
	if err := row.Scan(
		&template.ID,
		&template.Key,
		&template.Name,
		&template.SubjectTemplate,
		&template.BodyTemplate,
		&template.AudienceType,
		&template.Enabled,
		&template.CreatedAt,
	); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "template key already exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to create template")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, template)
}

func (h *Handler) updateTemplate(w http.ResponseWriter, r *http.Request) {
	templateID, err := strconv.ParseInt(chi.URLParam(r, "templateID"), 10, 64)
	if err != nil || templateID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid template id")
		return
	}
	var payload templatePayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	key := strings.ToLower(strings.TrimSpace(payload.Key))
	name := strings.TrimSpace(payload.Name)
	subject := strings.TrimSpace(payload.SubjectTemplate)
	body := strings.TrimSpace(payload.BodyTemplate)
	if key == "" || name == "" || subject == "" || body == "" {
		httpx.Error(w, http.StatusBadRequest, "key, name, subject_template, and body_template are required")
		return
	}
	row := h.db.QueryRow(r.Context(), `
		UPDATE email_templates
		SET key = $2,
		    name = $3,
		    subject_template = $4,
		    body_template = $5,
		    audience_type = $6,
		    enabled = $7
		WHERE id = $1
		RETURNING id, key, name, subject_template, body_template, audience_type, enabled, created_at
	`, templateID, key, name, subject, body, normalizeTemplateAudienceType(payload.AudienceType), payload.Enabled)
	var template EmailTemplate
	if err := row.Scan(
		&template.ID,
		&template.Key,
		&template.Name,
		&template.SubjectTemplate,
		&template.BodyTemplate,
		&template.AudienceType,
		&template.Enabled,
		&template.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "template not found")
			return
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "template key already exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update template")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, template)
}

func (h *Handler) audiencePreview(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}
	filter := AudienceFilter{
		Status:                  strings.TrimSpace(r.URL.Query().Get("status")),
		DepositState:            strings.TrimSpace(r.URL.Query().Get("deposit_state")),
		MainInvoiceState:        strings.TrimSpace(r.URL.Query().Get("main_invoice_state")),
		Roles:                   r.URL.Query()["role"],
		IncludedRegistrationIDs: parseAudienceRegistrationIDs(r.URL.Query()["included_registration_id"]),
		ExcludedRegistrationIDs: parseAudienceRegistrationIDs(r.URL.Query()["excluded_registration_id"]),
	}
	recipients, err := resolveAudienceRecipients(r.Context(), h.db, eventID, filter)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load audience preview")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, AudiencePreviewResponse{
		Count:      len(recipients),
		Recipients: recipients,
	})
}

func (h *Handler) listEventCampaigns(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}
	rows, err := h.db.Query(r.Context(), `
		SELECT c.id,
		       c.event_id,
		       c.template_id,
		       COALESCE(t.name, ''),
		       c.mode,
		       c.filter_json,
		       c.scheduled_for,
		       c.status,
		       c.created_by_account_id,
		       c.created_at,
		       COUNT(d.id)::INT AS delivery_count
		FROM email_campaigns c
		LEFT JOIN email_templates t ON t.id = c.template_id
		LEFT JOIN email_deliveries d ON d.campaign_id = c.id
		WHERE c.event_id = $1
		GROUP BY c.id, t.name
		ORDER BY c.created_at DESC, c.id DESC
	`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list campaigns")
		return
	}
	defer rows.Close()
	campaigns := make([]Campaign, 0)
	for rows.Next() {
		campaign, err := scanCampaign(rows)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse campaigns")
			return
		}
		campaigns = append(campaigns, *campaign)
	}
	httpx.WriteJSON(w, http.StatusOK, campaigns)
}

func (h *Handler) createCampaign(w http.ResponseWriter, r *http.Request) {
	var payload campaignPayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	if payload.EventID <= 0 || payload.TemplateID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "event_id and template_id are required")
		return
	}
	mode := strings.TrimSpace(strings.ToLower(payload.Mode))
	if mode == "" {
		mode = "manual"
	}

	ctx := r.Context()
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create campaign")
		return
	}
	defer tx.Rollback(ctx)

	template, err := loadTemplate(ctx, tx, payload.TemplateID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "template not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load template")
		return
	}
	if !template.Enabled {
		httpx.Error(w, http.StatusBadRequest, "template is disabled")
		return
	}

	payload.Filter.IncludedRegistrationIDs = normalizeAudienceRegistrationIDs(payload.Filter.IncludedRegistrationIDs)
	payload.Filter.ExcludedRegistrationIDs = normalizeAudienceRegistrationIDs(payload.Filter.ExcludedRegistrationIDs)
	recipients, err := resolveAudienceRecipients(ctx, tx, payload.EventID, payload.Filter)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load campaign audience")
		return
	}
	if len(recipients) == 0 {
		httpx.Error(w, http.StatusBadRequest, "campaign audience is empty")
		return
	}

	filterJSON, err := json.Marshal(payload.Filter)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create campaign")
		return
	}
	var campaignID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO email_campaigns (event_id, template_id, mode, filter_json, status, created_by_account_id)
		VALUES ($1, $2, $3, $4::jsonb, 'sent', $5)
		RETURNING id
	`, payload.EventID, payload.TemplateID, mode, string(filterJSON), currentAccountID(ctx)).Scan(&campaignID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create campaign")
		return
	}

	eventMeta, err := loadEventMetadata(ctx, tx, payload.EventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load event metadata")
		return
	}

	for _, recipient := range recipients {
		replacements := map[string]string{
			"participant_name":     recipient.ParticipantName,
			"participant_email":    recipient.ParticipantEmail,
			"registration_status":  recipient.Status,
			"deposit_due_at":       renderDate(recipient.DepositDueAt),
			"deposit_paid_at":      renderDate(recipient.DepositPaidAt),
			"main_invoice_due_at":  renderDate(recipient.MainInvoiceDueAt),
			"main_invoice_paid_at": renderDate(recipient.MainInvoicePaidAt),
			"deposit_state":        recipient.DepositState,
			"main_invoice_state":   recipient.MainInvoiceState,
		}
		for key, value := range eventMeta {
			replacements[key] = value
		}
		subject := renderTemplate(template.SubjectTemplate, replacements)
		body := renderTemplate(template.BodyTemplate, replacements)
		if _, err := tx.Exec(ctx, `
			INSERT INTO email_deliveries (campaign_id, registration_id, email, subject, body, status, sent_at)
			VALUES ($1, $2, $3, $4, $5, 'sent', NOW())
		`, campaignID, recipient.RegistrationID, recipient.ParticipantEmail, subject, body); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to create deliveries")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create campaign")
		return
	}
	h.getCampaignByID(w, r, campaignID)
}

func (h *Handler) getCampaignByID(w http.ResponseWriter, r *http.Request, campaignID int64) {
	row := h.db.QueryRow(r.Context(), `
		SELECT c.id,
		       c.event_id,
		       c.template_id,
		       COALESCE(t.name, ''),
		       c.mode,
		       c.filter_json,
		       c.scheduled_for,
		       c.status,
		       c.created_by_account_id,
		       c.created_at,
		       COUNT(d.id)::INT AS delivery_count
		FROM email_campaigns c
		LEFT JOIN email_templates t ON t.id = c.template_id
		LEFT JOIN email_deliveries d ON d.campaign_id = c.id
		WHERE c.id = $1
		GROUP BY c.id, t.name
	`, campaignID)
	campaign, err := scanCampaign(row)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "campaign not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load campaign")
		return
	}
	campaign.Deliveries, err = loadDeliveries(r.Context(), h.db, campaignID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load campaign deliveries")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, campaign)
}

func (h *Handler) getCampaign(w http.ResponseWriter, r *http.Request) {
	campaignID, err := strconv.ParseInt(chi.URLParam(r, "campaignID"), 10, 64)
	if err != nil || campaignID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid campaign id")
		return
	}
	h.getCampaignByID(w, r, campaignID)
}
