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
	Status       string `json:"status,omitempty"`
	DepositState string `json:"deposit_state,omitempty"`
	BalanceState string `json:"balance_state,omitempty"`
}

type AudienceRecipient struct {
	RegistrationID   int64      `json:"registration_id"`
	ParticipantID    int64      `json:"participant_id"`
	ParticipantName  string     `json:"participant_name"`
	ParticipantEmail string     `json:"participant_email"`
	Status           string     `json:"status"`
	DepositDueAt     *time.Time `json:"deposit_due_at,omitempty"`
	DepositPaidAt    *time.Time `json:"deposit_paid_at,omitempty"`
	BalanceDueAt     *time.Time `json:"balance_due_at,omitempty"`
	BalancePaidAt    *time.Time `json:"balance_paid_at,omitempty"`
	DepositState     string     `json:"deposit_state"`
	BalanceState     string     `json:"balance_state"`
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

func normalizePaymentState(dueAt, paidAt *time.Time, registrationStatus string) string {
	if paidAt != nil {
		return "paid"
	}
	if dueAt == nil || registrationStatus == "cancelled" || registrationStatus == "expired" {
		return "none"
	}
	if dueAt.Before(time.Now().UTC()) {
		return "overdue"
	}
	return "pending"
}

func loadAudienceRecipients(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, eventID int64, filter AudienceFilter) ([]AudienceRecipient, error) {
	rows, err := q.Query(ctx, `
		SELECT r.id,
		       r.participant_id,
		       COALESCE(p.full_name, ''),
		       COALESCE(p.email, ''),
		       r.status,
		       r.deposit_due_at,
		       r.deposit_paid_at,
		       r.balance_due_at,
		       r.balance_paid_at
		FROM event_registrations r
		JOIN participant_profiles p ON p.id = r.participant_id
		WHERE r.event_id = $1
		  AND COALESCE(p.email, '') <> ''
		ORDER BY r.registered_at DESC, r.id DESC
	`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipients := make([]AudienceRecipient, 0)
	for rows.Next() {
		var recipient AudienceRecipient
		if err := rows.Scan(
			&recipient.RegistrationID,
			&recipient.ParticipantID,
			&recipient.ParticipantName,
			&recipient.ParticipantEmail,
			&recipient.Status,
			&recipient.DepositDueAt,
			&recipient.DepositPaidAt,
			&recipient.BalanceDueAt,
			&recipient.BalancePaidAt,
		); err != nil {
			return nil, err
		}
		recipient.ParticipantEmail = strings.ToLower(strings.TrimSpace(recipient.ParticipantEmail))
		recipient.DepositState = normalizePaymentState(recipient.DepositDueAt, recipient.DepositPaidAt, recipient.Status)
		recipient.BalanceState = normalizePaymentState(recipient.BalanceDueAt, recipient.BalancePaidAt, recipient.Status)
		if filter.Status != "" && recipient.Status != filter.Status {
			continue
		}
		if filter.DepositState != "" && recipient.DepositState != filter.DepositState {
			continue
		}
		if filter.BalanceState != "" && recipient.BalanceState != filter.BalanceState {
			continue
		}
		recipients = append(recipients, recipient)
	}
	return recipients, rows.Err()
}

func renderTimestamp(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format("2006-01-02 15:04 UTC")
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
	var balanceDeadline *time.Time
	var depositAmount string
	var balanceAmount string
	var currency string
	var slug string
	if err := q.QueryRow(ctx, `
		SELECT name,
		       COALESCE(location, ''),
		       starts_at,
		       balance_deadline,
		       COALESCE(deposit_amount::TEXT, ''),
		       COALESCE(balance_amount::TEXT, ''),
		       COALESCE(currency, 'EUR'),
		       COALESCE(public_registration_slug, '')
		FROM events
		WHERE id = $1
	`, eventID).Scan(&name, &location, &startsAt, &balanceDeadline, &depositAmount, &balanceAmount, &currency, &slug); err != nil {
		return nil, err
	}
	totalAmount := ""
	if depositAmount != "" || balanceAmount != "" {
		totalAmount = renderMoney(strings.TrimSpace(fmt.Sprintf("%g", parseFloat(depositAmount)+parseFloat(balanceAmount))), currency)
	}
	publicLink := ""
	if strings.TrimSpace(slug) != "" {
		publicLink = "/register/" + strings.TrimSpace(slug)
	}
	return map[string]string{
		"event_name":               name,
		"event_location":           location,
		"event_starts_at":          startsAt.UTC().Format("2006-01-02 15:04 UTC"),
		"balance_deadline":         renderTimestamp(balanceDeadline),
		"deposit_amount":           renderMoney(depositAmount, currency),
		"balance_amount":           renderMoney(balanceAmount, currency),
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

func (h *Handler) audiencePreview(w http.ResponseWriter, r *http.Request) {
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil || eventID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid event id")
		return
	}
	filter := AudienceFilter{
		Status:       strings.TrimSpace(r.URL.Query().Get("status")),
		DepositState: strings.TrimSpace(r.URL.Query().Get("deposit_state")),
		BalanceState: strings.TrimSpace(r.URL.Query().Get("balance_state")),
	}
	recipients, err := loadAudienceRecipients(r.Context(), h.db, eventID, filter)
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

	recipients, err := loadAudienceRecipients(ctx, tx, payload.EventID, payload.Filter)
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
			"participant_name":    recipient.ParticipantName,
			"participant_email":   recipient.ParticipantEmail,
			"registration_status": recipient.Status,
			"deposit_due_at":      renderTimestamp(recipient.DepositDueAt),
			"deposit_paid_at":     renderTimestamp(recipient.DepositPaidAt),
			"balance_due_at":      renderTimestamp(recipient.BalanceDueAt),
			"balance_paid_at":     renderTimestamp(recipient.BalancePaidAt),
			"deposit_state":       recipient.DepositState,
			"balance_state":       recipient.BalanceState,
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
