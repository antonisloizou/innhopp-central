package accounting

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
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

type AccountingDocument struct {
	ID             int64      `json:"id"`
	EventID        int64      `json:"event_id"`
	VendorID       *int64     `json:"vendor_id,omitempty"`
	DocType        string     `json:"doc_type"`
	Status         string     `json:"status"`
	DocumentNumber string     `json:"document_number,omitempty"`
	DocumentDate   *time.Time `json:"document_date,omitempty"`
	DueDate        *time.Time `json:"due_date,omitempty"`
	Currency       string     `json:"currency"`
	Notes          string     `json:"notes,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type AccountingEntry struct {
	ID                 int64      `json:"id"`
	DocumentID         int64      `json:"document_id"`
	EventID            int64      `json:"event_id"`
	ScheduleItemCostID *int64     `json:"schedule_item_cost_id,omitempty"`
	BudgetLineItemID   *int64     `json:"budget_line_item_id,omitempty"`
	EntryType          string     `json:"entry_type"`
	Amount             float64    `json:"amount"`
	Currency           string     `json:"currency"`
	PostedAt           *time.Time `json:"posted_at,omitempty"`
	Description        string     `json:"description,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type Payment struct {
	ID        int64      `json:"id"`
	EventID   int64      `json:"event_id"`
	VendorID  *int64     `json:"vendor_id,omitempty"`
	Method    string     `json:"method"`
	Amount    float64    `json:"amount"`
	Currency  string     `json:"currency"`
	PaidAt    *time.Time `json:"paid_at,omitempty"`
	Reference string     `json:"reference,omitempty"`
	Notes     string     `json:"notes,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type PaymentAllocation struct {
	ID                 int64     `json:"id"`
	PaymentID          int64     `json:"payment_id"`
	AccountingEntryID  *int64    `json:"accounting_entry_id,omitempty"`
	ScheduleItemCostID *int64    `json:"schedule_item_cost_id,omitempty"`
	Amount             float64   `json:"amount"`
	Currency           string    `json:"currency"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type BudgetActualsLine struct {
	ScheduleItemCostID        int64   `json:"schedule_item_cost_id"`
	ScheduleItemType          string  `json:"schedule_item_type,omitempty"`
	ScheduleItemID            *int64  `json:"schedule_item_id,omitempty"`
	BudgetLineItemID          *int64  `json:"budget_line_item_id,omitempty"`
	SectionID                 *int64  `json:"section_id,omitempty"`
	SectionCode               string  `json:"section_code,omitempty"`
	SectionName               string  `json:"section_name,omitempty"`
	Name                      string  `json:"name"`
	Status                    string  `json:"status"`
	Currency                  string  `json:"currency"`
	PlannedAmount             float64 `json:"planned_amount"`
	InvoicedAmount            float64 `json:"invoiced_amount"`
	PaidAmount                float64 `json:"paid_amount"`
	OpenInvoiceAmount         float64 `json:"open_invoice_amount"`
	EstimateToInvoiceVariance float64 `json:"estimate_to_invoice_variance_amount"`
	InvoiceToPaidVariance     float64 `json:"invoice_to_paid_variance_amount"`
	VarianceVsBudget          float64 `json:"variance_vs_budget"`
	VariancePercent           float64 `json:"variance_percent"`
	InvoicedVarianceVsBudget  float64 `json:"invoiced_variance_vs_budget"`
	PaidVarianceVsBudget      float64 `json:"paid_variance_vs_budget"`
}

type BudgetActualsTotals struct {
	PlannedAmount             float64 `json:"planned_amount"`
	InvoicedAmount            float64 `json:"invoiced_amount"`
	PaidAmount                float64 `json:"paid_amount"`
	OpenInvoiceAmount         float64 `json:"open_invoice_amount"`
	EstimateToInvoiceVariance float64 `json:"estimate_to_invoice_variance_amount"`
	InvoiceToPaidVariance     float64 `json:"invoice_to_paid_variance_amount"`
	VarianceVsBudget          float64 `json:"variance_vs_budget"`
	InvoicedVarianceVsBudget  float64 `json:"invoiced_variance_vs_budget"`
	PaidVarianceVsBudget      float64 `json:"paid_variance_vs_budget"`
}

type BudgetActualsSectionTotal struct {
	SectionID         *int64  `json:"section_id,omitempty"`
	SectionCode       string  `json:"section_code,omitempty"`
	SectionName       string  `json:"section_name,omitempty"`
	PlannedAmount     float64 `json:"planned_amount"`
	InvoicedAmount    float64 `json:"invoiced_amount"`
	PaidAmount        float64 `json:"paid_amount"`
	OpenInvoiceAmount float64 `json:"open_invoice_amount"`
	VarianceVsBudget  float64 `json:"variance_vs_budget"`
}

type BudgetActualsReport struct {
	EventID  int64                       `json:"event_id"`
	Currency string                      `json:"currency"`
	Totals   BudgetActualsTotals         `json:"totals"`
	Sections []BudgetActualsSectionTotal `json:"sections"`
	Lines    []BudgetActualsLine         `json:"lines"`
}

var defaultBudgetSections = []struct {
	Code string
	Name string
}{
	{Code: "aircraft", Name: "Aircraft"},
	{Code: "food_accommodation", Name: "Food & Accommodation"},
	{Code: "transport_activities", Name: "Transport"},
	{Code: "entertainment", Name: "Entertainment & Activities"},
	{Code: "payable_crew", Name: "Payable Crew"},
	{Code: "optional_add_on", Name: "Other"},
}

var defaultBudgetAssumptions = map[string]float64{
	"full_load_size":                          14,
	"crew_on_load_count":                      2,
	"confirm_load_count":                      1,
	"full_load_count":                         2,
	"target_markup_percent":                   20,
	"optional_tip_percent":                    8,
	"cost_drift_percent":                      10,
	"budget_method":                           2,
	"estimate_accommodation_per_person_night": 0,
	"estimate_transport_per_day":              0,
	"estimate_food_per_day":                   0,
	"estimate_staff_salary_per_person_day":    0,
}

type scheduleTarget struct {
	ScheduleType string
	ScheduleID   int64
	Name         string
	ServiceDate  *time.Time
	SectionCode  string
}

func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewAccounting)).Get("/events/{eventID}/documents", h.listDocuments)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Post("/events/{eventID}/documents", h.createDocument)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Put("/documents/{docID}", h.updateDocument)
	r.With(enforcer.Authorize(rbac.PermissionViewAccounting)).Get("/events/{eventID}/entries", h.listEntries)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Put("/entries/{entryID}", h.updateEntry)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Delete("/entries/{entryID}", h.deleteEntry)
	r.With(enforcer.Authorize(rbac.PermissionViewAccounting)).Get("/events/{eventID}/payments", h.listPayments)
	r.With(enforcer.Authorize(rbac.PermissionViewAccounting)).Get("/events/{eventID}/allocations", h.listAllocations)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Post("/events/{eventID}/payments", h.createPayment)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Put("/payments/{paymentID}", h.updatePayment)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Delete("/payments/{paymentID}", h.deletePayment)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Delete("/allocations/{allocationID}", h.deleteAllocation)
	r.With(enforcer.Authorize(rbac.PermissionViewAccounting)).Get("/events/{eventID}/budget-actuals", h.getBudgetActuals)
	r.With(enforcer.Authorize(rbac.PermissionViewAccounting)).Get("/events/{eventID}/schedule-costs/{scheduleType}/{scheduleID}", h.listScheduleCosts)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Post("/events/{eventID}/schedule-costs/{scheduleType}/{scheduleID}", h.createScheduleCost)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Put("/events/{eventID}/schedule-costs/{costID}", h.updateScheduleCost)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Delete("/events/{eventID}/schedule-costs/{costID}", h.deleteScheduleCost)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Post("/documents/{docID}/entries", h.createEntry)
	r.With(enforcer.Authorize(rbac.PermissionManageAccounting)).Post("/payments/{paymentID}/allocations", h.createPaymentAllocation)
	return r
}

func parseIDParam(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	raw := strings.TrimSpace(chi.URLParam(r, name))
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid "+name)
		return 0, false
	}
	return id, true
}

func normalizeCurrency(v string) string {
	cur := strings.ToUpper(strings.TrimSpace(v))
	if cur == "" {
		return "EUR"
	}
	return cur
}

func currentAccountID(ctx context.Context) *int64 {
	claims := auth.FromContext(ctx)
	if claims == nil || claims.AccountID <= 0 {
		return nil
	}
	accountID := claims.AccountID
	return &accountID
}

func eventExists(ctx context.Context, db interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, eventID int64) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM events WHERE id = $1)`, eventID).Scan(&exists)
	return exists, err
}

func budgetLineBelongsToEvent(ctx context.Context, db interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, eventID, budgetLineItemID int64) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM budget_line_items li
			JOIN event_budgets b ON b.id = li.budget_id
			WHERE li.id = $1 AND b.event_id = $2
		)
	`, budgetLineItemID, eventID).Scan(&exists)
	return exists, err
}

func (h *Handler) listDocuments(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, event_id, vendor_id, doc_type, status, document_number, document_date, due_date, currency, notes, created_at, updated_at
		FROM accounting_documents
		WHERE event_id = $1
		ORDER BY COALESCE(document_date, created_at) DESC, id DESC
	`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load accounting documents")
		return
	}
	defer rows.Close()

	docs := make([]AccountingDocument, 0)
	for rows.Next() {
		var doc AccountingDocument
		if err := rows.Scan(
			&doc.ID, &doc.EventID, &doc.VendorID, &doc.DocType, &doc.Status, &doc.DocumentNumber,
			&doc.DocumentDate, &doc.DueDate, &doc.Currency, &doc.Notes, &doc.CreatedAt, &doc.UpdatedAt,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to read accounting documents")
			return
		}
		doc.Currency = normalizeCurrency(doc.Currency)
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read accounting documents")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, docs)
}

func (h *Handler) createDocument(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	var payload struct {
		VendorID       *int64 `json:"vendor_id"`
		DocType        string `json:"doc_type"`
		Status         string `json:"status"`
		DocumentNumber string `json:"document_number"`
		DocumentDate   string `json:"document_date"`
		DueDate        string `json:"due_date"`
		Currency       string `json:"currency"`
		Notes          string `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	docType := strings.TrimSpace(payload.DocType)
	if docType != "invoice" && docType != "credit_note" && docType != "adjustment" {
		httpx.Error(w, http.StatusBadRequest, "doc_type must be invoice, credit_note, or adjustment")
		return
	}
	status := strings.TrimSpace(payload.Status)
	if status == "" {
		status = "draft"
	}
	if status != "draft" && status != "posted" && status != "voided" {
		httpx.Error(w, http.StatusBadRequest, "status must be draft, posted, or voided")
		return
	}

	exists, err := eventExists(r.Context(), h.db, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate event")
		return
	}
	if !exists {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}

	documentDate, err := parseOptionalDate(payload.DocumentDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "document_date must be YYYY-MM-DD")
		return
	}
	dueDate, err := parseOptionalDate(payload.DueDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "due_date must be YYYY-MM-DD")
		return
	}

	createdBy := currentAccountID(r.Context())
	var doc AccountingDocument
	if err := h.db.QueryRow(r.Context(), `
		INSERT INTO accounting_documents (
			event_id, vendor_id, doc_type, status, document_number, document_date, due_date, currency, notes, created_by_account_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, event_id, vendor_id, doc_type, status, document_number, document_date, due_date, currency, notes, created_at, updated_at
	`, eventID, payload.VendorID, docType, status, strings.TrimSpace(payload.DocumentNumber), documentDate, dueDate, normalizeCurrency(payload.Currency), strings.TrimSpace(payload.Notes), createdBy).
		Scan(&doc.ID, &doc.EventID, &doc.VendorID, &doc.DocType, &doc.Status, &doc.DocumentNumber, &doc.DocumentDate, &doc.DueDate, &doc.Currency, &doc.Notes, &doc.CreatedAt, &doc.UpdatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create accounting document")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, doc)
}

func (h *Handler) updateDocument(w http.ResponseWriter, r *http.Request) {
	docID, ok := parseIDParam(w, r, "docID")
	if !ok {
		return
	}

	var payload struct {
		VendorID       *int64 `json:"vendor_id"`
		DocType        string `json:"doc_type"`
		Status         string `json:"status"`
		DocumentNumber string `json:"document_number"`
		DocumentDate   string `json:"document_date"`
		DueDate        string `json:"due_date"`
		Currency       string `json:"currency"`
		Notes          string `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	docType := strings.TrimSpace(payload.DocType)
	if docType != "invoice" && docType != "credit_note" && docType != "adjustment" {
		httpx.Error(w, http.StatusBadRequest, "doc_type must be invoice, credit_note, or adjustment")
		return
	}
	status := strings.TrimSpace(payload.Status)
	if status != "draft" && status != "posted" && status != "voided" {
		httpx.Error(w, http.StatusBadRequest, "status must be draft, posted, or voided")
		return
	}
	documentDate, err := parseOptionalDate(payload.DocumentDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "document_date must be YYYY-MM-DD")
		return
	}
	dueDate, err := parseOptionalDate(payload.DueDate)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "due_date must be YYYY-MM-DD")
		return
	}

	var currentStatus string
	if err := h.db.QueryRow(r.Context(), `SELECT status FROM accounting_documents WHERE id = $1`, docID).Scan(&currentStatus); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "accounting document not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate accounting document")
		return
	}
	if currentStatus == "voided" && status != "voided" {
		httpx.Error(w, http.StatusBadRequest, "voided documents cannot be reopened")
		return
	}

	var doc AccountingDocument
	if err := h.db.QueryRow(r.Context(), `
		UPDATE accounting_documents
		SET vendor_id = $2,
			doc_type = $3,
			status = $4,
			document_number = $5,
			document_date = $6,
			due_date = $7,
			currency = $8,
			notes = $9,
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, event_id, vendor_id, doc_type, status, document_number, document_date, due_date, currency, notes, created_at, updated_at
	`, docID, payload.VendorID, docType, status, strings.TrimSpace(payload.DocumentNumber), documentDate, dueDate, normalizeCurrency(payload.Currency), strings.TrimSpace(payload.Notes)).
		Scan(&doc.ID, &doc.EventID, &doc.VendorID, &doc.DocType, &doc.Status, &doc.DocumentNumber, &doc.DocumentDate, &doc.DueDate, &doc.Currency, &doc.Notes, &doc.CreatedAt, &doc.UpdatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update accounting document")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, doc)
}

func (h *Handler) listEntries(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, document_id, event_id, schedule_item_cost_id, budget_line_item_id, entry_type, amount, currency, posted_at, description, created_at, updated_at
		FROM accounting_entries
		WHERE event_id = $1
		ORDER BY COALESCE(posted_at, created_at) DESC, id DESC
	`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load accounting entries")
		return
	}
	defer rows.Close()

	entries := make([]AccountingEntry, 0)
	for rows.Next() {
		var entry AccountingEntry
		if err := rows.Scan(
			&entry.ID, &entry.DocumentID, &entry.EventID, &entry.ScheduleItemCostID, &entry.BudgetLineItemID,
			&entry.EntryType, &entry.Amount, &entry.Currency, &entry.PostedAt, &entry.Description, &entry.CreatedAt, &entry.UpdatedAt,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to read accounting entries")
			return
		}
		entry.Currency = normalizeCurrency(entry.Currency)
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read accounting entries")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, entries)
}

func scheduleCostBelongsToEvent(ctx context.Context, db interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, eventID, scheduleItemCostID int64) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schedule_item_costs WHERE id = $1 AND event_id = $2)`, scheduleItemCostID, eventID).Scan(&exists)
	return exists, err
}

func (h *Handler) createEntry(w http.ResponseWriter, r *http.Request) {
	docID, ok := parseIDParam(w, r, "docID")
	if !ok {
		return
	}

	var payload struct {
		ScheduleItemCostID *int64  `json:"schedule_item_cost_id"`
		BudgetLineItemID   *int64  `json:"budget_line_item_id"`
		EntryType          string  `json:"entry_type"`
		Amount             float64 `json:"amount"`
		Currency           string  `json:"currency"`
		PostedAt           string  `json:"posted_at"`
		Description        string  `json:"description"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	entryType := strings.TrimSpace(payload.EntryType)
	if entryType != "cost" && entryType != "credit" && entryType != "adjustment" {
		httpx.Error(w, http.StatusBadRequest, "entry_type must be cost, credit, or adjustment")
		return
	}
	if payload.Amount == 0 {
		httpx.Error(w, http.StatusBadRequest, "amount must be non-zero")
		return
	}

	postedAt, err := parseOptionalDate(payload.PostedAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "posted_at must be YYYY-MM-DD")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var eventID int64
	var docStatus string
	if err := tx.QueryRow(r.Context(), `SELECT event_id, status FROM accounting_documents WHERE id = $1`, docID).Scan(&eventID, &docStatus); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "accounting document not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate accounting document")
		return
	}
	if docStatus == "voided" {
		httpx.Error(w, http.StatusBadRequest, "cannot post entries to voided document")
		return
	}
	if payload.BudgetLineItemID != nil {
		belongs, err := budgetLineBelongsToEvent(r.Context(), tx, eventID, *payload.BudgetLineItemID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate budget line item")
			return
		}
		if !belongs {
			httpx.Error(w, http.StatusBadRequest, "budget_line_item_id does not belong to document event")
			return
		}
	}
	if payload.ScheduleItemCostID != nil {
		belongs, err := scheduleCostBelongsToEvent(r.Context(), tx, eventID, *payload.ScheduleItemCostID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate schedule cost")
			return
		}
		if !belongs {
			httpx.Error(w, http.StatusBadRequest, "schedule_item_cost_id does not belong to document event")
			return
		}
	}

	createdBy := currentAccountID(r.Context())
	amount := payload.Amount
	if entryType == "credit" && amount > 0 {
		amount = -amount
	}

	var entry AccountingEntry
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO accounting_entries (
			document_id, event_id, schedule_item_cost_id, budget_line_item_id, entry_type, amount, currency, posted_at, description, created_by_account_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_DATE), $9, $10)
		RETURNING id, document_id, event_id, schedule_item_cost_id, budget_line_item_id, entry_type, amount, currency, posted_at, description, created_at, updated_at
	`, docID, eventID, payload.ScheduleItemCostID, payload.BudgetLineItemID, entryType, amount, normalizeCurrency(payload.Currency), postedAt, strings.TrimSpace(payload.Description), createdBy).
		Scan(&entry.ID, &entry.DocumentID, &entry.EventID, &entry.ScheduleItemCostID, &entry.BudgetLineItemID, &entry.EntryType, &entry.Amount, &entry.Currency, &entry.PostedAt, &entry.Description, &entry.CreatedAt, &entry.UpdatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create accounting entry")
		return
	}

	if _, err := tx.Exec(r.Context(), `UPDATE accounting_documents SET updated_at = NOW() WHERE id = $1`, docID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update accounting document")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to commit accounting entry")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, entry)
}

func (h *Handler) updateEntry(w http.ResponseWriter, r *http.Request) {
	entryID, ok := parseIDParam(w, r, "entryID")
	if !ok {
		return
	}

	var payload struct {
		DocumentID         *int64  `json:"document_id"`
		ScheduleItemCostID *int64  `json:"schedule_item_cost_id"`
		BudgetLineItemID   *int64  `json:"budget_line_item_id"`
		EntryType          string  `json:"entry_type"`
		Amount             float64 `json:"amount"`
		Currency           string  `json:"currency"`
		PostedAt           string  `json:"posted_at"`
		Description        string  `json:"description"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	entryType := strings.TrimSpace(payload.EntryType)
	if entryType != "cost" && entryType != "credit" && entryType != "adjustment" {
		httpx.Error(w, http.StatusBadRequest, "entry_type must be cost, credit, or adjustment")
		return
	}
	if payload.Amount == 0 {
		httpx.Error(w, http.StatusBadRequest, "amount must be non-zero")
		return
	}
	postedAt, err := parseOptionalDate(payload.PostedAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "posted_at must be YYYY-MM-DD")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var existingDocumentID int64
	var eventID int64
	if err := tx.QueryRow(r.Context(), `SELECT document_id, event_id FROM accounting_entries WHERE id = $1`, entryID).Scan(&existingDocumentID, &eventID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "accounting entry not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate accounting entry")
		return
	}
	targetDocumentID := existingDocumentID
	if payload.DocumentID != nil && *payload.DocumentID > 0 {
		targetDocumentID = *payload.DocumentID
	}
	var docEventID int64
	var docStatus string
	if err := tx.QueryRow(r.Context(), `SELECT event_id, status FROM accounting_documents WHERE id = $1`, targetDocumentID).Scan(&docEventID, &docStatus); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusBadRequest, "document_id not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate accounting document")
		return
	}
	if docEventID != eventID {
		httpx.Error(w, http.StatusBadRequest, "document must belong to the same event")
		return
	}
	if docStatus == "voided" {
		httpx.Error(w, http.StatusBadRequest, "cannot update entries on a voided document")
		return
	}
	if payload.BudgetLineItemID != nil {
		belongs, err := budgetLineBelongsToEvent(r.Context(), tx, eventID, *payload.BudgetLineItemID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate budget line item")
			return
		}
		if !belongs {
			httpx.Error(w, http.StatusBadRequest, "budget_line_item_id does not belong to entry event")
			return
		}
	}
	if payload.ScheduleItemCostID != nil {
		belongs, err := scheduleCostBelongsToEvent(r.Context(), tx, eventID, *payload.ScheduleItemCostID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate schedule cost")
			return
		}
		if !belongs {
			httpx.Error(w, http.StatusBadRequest, "schedule_item_cost_id does not belong to entry event")
			return
		}
	}
	var allocated float64
	if err := tx.QueryRow(r.Context(), `SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE accounting_entry_id = $1`, entryID).Scan(&allocated); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate allocations")
		return
	}
	amount := payload.Amount
	if entryType == "credit" && amount > 0 {
		amount = -amount
	}
	ceiling := amount
	if ceiling < 0 {
		ceiling = -ceiling
	}
	if allocated > ceiling+0.0001 {
		httpx.Error(w, http.StatusBadRequest, "updated entry amount cannot be lower than allocated amount")
		return
	}
	var entry AccountingEntry
	if err := tx.QueryRow(r.Context(), `
		UPDATE accounting_entries
		SET document_id = $2,
			schedule_item_cost_id = $3,
			budget_line_item_id = $4,
			entry_type = $5,
			amount = $6,
			currency = $7,
			posted_at = COALESCE($8, posted_at),
			description = $9,
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, document_id, event_id, schedule_item_cost_id, budget_line_item_id, entry_type, amount, currency, posted_at, description, created_at, updated_at
	`, entryID, targetDocumentID, payload.ScheduleItemCostID, payload.BudgetLineItemID, entryType, amount, normalizeCurrency(payload.Currency), postedAt, strings.TrimSpace(payload.Description)).
		Scan(&entry.ID, &entry.DocumentID, &entry.EventID, &entry.ScheduleItemCostID, &entry.BudgetLineItemID, &entry.EntryType, &entry.Amount, &entry.Currency, &entry.PostedAt, &entry.Description, &entry.CreatedAt, &entry.UpdatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update accounting entry")
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE accounting_documents SET updated_at = NOW() WHERE id IN ($1, $2)`, existingDocumentID, targetDocumentID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update accounting document")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to commit accounting entry update")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, entry)
}

func (h *Handler) deleteEntry(w http.ResponseWriter, r *http.Request) {
	entryID, ok := parseIDParam(w, r, "entryID")
	if !ok {
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var docID int64
	if err := tx.QueryRow(r.Context(), `SELECT document_id FROM accounting_entries WHERE id = $1`, entryID).Scan(&docID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "accounting entry not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate accounting entry")
		return
	}
	var allocationCount int64
	if err := tx.QueryRow(r.Context(), `SELECT COUNT(1) FROM payment_allocations WHERE accounting_entry_id = $1`, entryID).Scan(&allocationCount); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate allocations")
		return
	}
	if allocationCount > 0 {
		httpx.Error(w, http.StatusBadRequest, "cannot delete an entry with payment allocations")
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM accounting_entries WHERE id = $1`, entryID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete accounting entry")
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE accounting_documents SET updated_at = NOW() WHERE id = $1`, docID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update accounting document")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to commit accounting entry deletion")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) createPayment(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	var payload struct {
		VendorID  *int64  `json:"vendor_id"`
		Method    string  `json:"method"`
		Amount    float64 `json:"amount"`
		Currency  string  `json:"currency"`
		PaidAt    string  `json:"paid_at"`
		Reference string  `json:"reference"`
		Notes     string  `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	method := strings.TrimSpace(payload.Method)
	switch method {
	case "bank_transfer", "card", "cash", "other":
	default:
		httpx.Error(w, http.StatusBadRequest, "method must be bank_transfer, card, cash, or other")
		return
	}
	if payload.Amount <= 0 {
		httpx.Error(w, http.StatusBadRequest, "amount must be positive")
		return
	}

	exists, err := eventExists(r.Context(), h.db, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate event")
		return
	}
	if !exists {
		httpx.Error(w, http.StatusNotFound, "event not found")
		return
	}

	paidAt, err := parseOptionalDate(payload.PaidAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "paid_at must be YYYY-MM-DD")
		return
	}

	createdBy := currentAccountID(r.Context())
	var payment Payment
	if err := h.db.QueryRow(r.Context(), `
		INSERT INTO payments (
			event_id, vendor_id, method, amount, currency, paid_at, reference, notes, created_by_account_id
		)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), $7, $8, $9)
		RETURNING id, event_id, vendor_id, method, amount, currency, paid_at, reference, notes, created_at, updated_at
	`, eventID, payload.VendorID, method, payload.Amount, normalizeCurrency(payload.Currency), paidAt, strings.TrimSpace(payload.Reference), strings.TrimSpace(payload.Notes), createdBy).
		Scan(&payment.ID, &payment.EventID, &payment.VendorID, &payment.Method, &payment.Amount, &payment.Currency, &payment.PaidAt, &payment.Reference, &payment.Notes, &payment.CreatedAt, &payment.UpdatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create payment")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, payment)
}

func (h *Handler) updatePayment(w http.ResponseWriter, r *http.Request) {
	paymentID, ok := parseIDParam(w, r, "paymentID")
	if !ok {
		return
	}

	var payload struct {
		VendorID  *int64  `json:"vendor_id"`
		Method    string  `json:"method"`
		Amount    float64 `json:"amount"`
		Currency  string  `json:"currency"`
		PaidAt    string  `json:"paid_at"`
		Reference string  `json:"reference"`
		Notes     string  `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	method := strings.TrimSpace(payload.Method)
	switch method {
	case "bank_transfer", "card", "cash", "other":
	default:
		httpx.Error(w, http.StatusBadRequest, "method must be bank_transfer, card, cash, or other")
		return
	}
	if payload.Amount <= 0 {
		httpx.Error(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	paidAt, err := parseOptionalDate(payload.PaidAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "paid_at must be YYYY-MM-DD")
		return
	}
	var allocated float64
	if err := h.db.QueryRow(r.Context(), `SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE payment_id = $1`, paymentID).Scan(&allocated); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate payment allocations")
		return
	}
	if allocated > payload.Amount+0.0001 {
		httpx.Error(w, http.StatusBadRequest, "updated payment amount cannot be lower than allocated amount")
		return
	}
	var payment Payment
	if err := h.db.QueryRow(r.Context(), `
		UPDATE payments
		SET vendor_id = $2,
			method = $3,
			amount = $4,
			currency = $5,
			paid_at = COALESCE($6, paid_at),
			reference = $7,
			notes = $8,
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, event_id, vendor_id, method, amount, currency, paid_at, reference, notes, created_at, updated_at
	`, paymentID, payload.VendorID, method, payload.Amount, normalizeCurrency(payload.Currency), paidAt, strings.TrimSpace(payload.Reference), strings.TrimSpace(payload.Notes)).
		Scan(&payment.ID, &payment.EventID, &payment.VendorID, &payment.Method, &payment.Amount, &payment.Currency, &payment.PaidAt, &payment.Reference, &payment.Notes, &payment.CreatedAt, &payment.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "payment not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update payment")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, payment)
}

func (h *Handler) deletePayment(w http.ResponseWriter, r *http.Request) {
	paymentID, ok := parseIDParam(w, r, "paymentID")
	if !ok {
		return
	}
	var allocationCount int64
	if err := h.db.QueryRow(r.Context(), `SELECT COUNT(1) FROM payment_allocations WHERE payment_id = $1`, paymentID).Scan(&allocationCount); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate payment allocations")
		return
	}
	if allocationCount > 0 {
		httpx.Error(w, http.StatusBadRequest, "cannot delete a payment with allocations")
		return
	}
	tag, err := h.db.Exec(r.Context(), `DELETE FROM payments WHERE id = $1`, paymentID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete payment")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "payment not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) listPayments(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, event_id, vendor_id, method, amount, currency, paid_at, reference, notes, created_at, updated_at
		FROM payments
		WHERE event_id = $1
		ORDER BY COALESCE(paid_at, created_at::date) DESC, id DESC
	`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load payments")
		return
	}
	defer rows.Close()

	payments := make([]Payment, 0)
	for rows.Next() {
		var payment Payment
		if err := rows.Scan(
			&payment.ID, &payment.EventID, &payment.VendorID, &payment.Method, &payment.Amount, &payment.Currency,
			&payment.PaidAt, &payment.Reference, &payment.Notes, &payment.CreatedAt, &payment.UpdatedAt,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to read payments")
			return
		}
		payment.Currency = normalizeCurrency(payment.Currency)
		payments = append(payments, payment)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read payments")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, payments)
}

func (h *Handler) createPaymentAllocation(w http.ResponseWriter, r *http.Request) {
	paymentID, ok := parseIDParam(w, r, "paymentID")
	if !ok {
		return
	}

	var payload struct {
		AccountingEntryID  *int64  `json:"accounting_entry_id"`
		ScheduleItemCostID *int64  `json:"schedule_item_cost_id"`
		Amount             float64 `json:"amount"`
		Currency           string  `json:"currency"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if payload.Amount <= 0 {
		httpx.Error(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if payload.AccountingEntryID == nil && payload.ScheduleItemCostID == nil {
		httpx.Error(w, http.StatusBadRequest, "accounting_entry_id or schedule_item_cost_id is required")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var paymentAmount float64
	var paymentEventID int64
	if err := tx.QueryRow(r.Context(), `SELECT event_id, amount FROM payments WHERE id = $1`, paymentID).Scan(&paymentEventID, &paymentAmount); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "payment not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate payment")
		return
	}
	var allocated float64
	if err := tx.QueryRow(r.Context(), `SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE payment_id = $1`, paymentID).Scan(&allocated); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate payment allocations")
		return
	}
	if allocated+payload.Amount > paymentAmount+0.0001 {
		httpx.Error(w, http.StatusBadRequest, "allocation exceeds payment amount")
		return
	}
	if payload.AccountingEntryID != nil {
		var entryExists bool
		var entryEventID int64
		var entryAmount float64
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM accounting_entries WHERE id = $1), COALESCE((SELECT event_id FROM accounting_entries WHERE id = $1), 0), COALESCE((SELECT amount FROM accounting_entries WHERE id = $1), 0)`, *payload.AccountingEntryID).Scan(&entryExists, &entryEventID, &entryAmount); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate accounting entry")
			return
		}
		if !entryExists {
			httpx.Error(w, http.StatusBadRequest, "accounting_entry_id not found")
			return
		}
		if entryEventID != paymentEventID {
			httpx.Error(w, http.StatusBadRequest, "payment and accounting entry must belong to the same event")
			return
		}
		var allocatedToEntry float64
		if err := tx.QueryRow(r.Context(), `SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE accounting_entry_id = $1`, *payload.AccountingEntryID).Scan(&allocatedToEntry); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate entry allocations")
			return
		}
		entryCeiling := entryAmount
		if entryCeiling < 0 {
			entryCeiling = -entryCeiling
		}
		if allocatedToEntry+payload.Amount > entryCeiling+0.0001 {
			httpx.Error(w, http.StatusBadRequest, "allocation exceeds accounting entry amount")
			return
		}
	}

	createdBy := currentAccountID(r.Context())
	var allocation PaymentAllocation
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO payment_allocations (
			payment_id, accounting_entry_id, schedule_item_cost_id, amount, currency, created_by_account_id
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, payment_id, accounting_entry_id, schedule_item_cost_id, amount, currency, created_at, updated_at
	`, paymentID, payload.AccountingEntryID, payload.ScheduleItemCostID, payload.Amount, normalizeCurrency(payload.Currency), createdBy).
		Scan(&allocation.ID, &allocation.PaymentID, &allocation.AccountingEntryID, &allocation.ScheduleItemCostID, &allocation.Amount, &allocation.Currency, &allocation.CreatedAt, &allocation.UpdatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create payment allocation")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to commit payment allocation")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, allocation)
}

func (h *Handler) listAllocations(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT pa.id, pa.payment_id, pa.accounting_entry_id, pa.schedule_item_cost_id, pa.amount, pa.currency, pa.created_at, pa.updated_at
		FROM payment_allocations pa
		JOIN payments p ON p.id = pa.payment_id
		WHERE p.event_id = $1
		ORDER BY pa.created_at DESC, pa.id DESC
	`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load payment allocations")
		return
	}
	defer rows.Close()

	allocations := make([]PaymentAllocation, 0)
	for rows.Next() {
		var allocation PaymentAllocation
		if err := rows.Scan(
			&allocation.ID,
			&allocation.PaymentID,
			&allocation.AccountingEntryID,
			&allocation.ScheduleItemCostID,
			&allocation.Amount,
			&allocation.Currency,
			&allocation.CreatedAt,
			&allocation.UpdatedAt,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to read payment allocations")
			return
		}
		allocation.Currency = normalizeCurrency(allocation.Currency)
		allocations = append(allocations, allocation)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read payment allocations")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, allocations)
}

func (h *Handler) deleteAllocation(w http.ResponseWriter, r *http.Request) {
	allocationID, ok := parseIDParam(w, r, "allocationID")
	if !ok {
		return
	}
	tag, err := h.db.Exec(r.Context(), `DELETE FROM payment_allocations WHERE id = $1`, allocationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete payment allocation")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "payment allocation not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) getBudgetActuals(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		WITH synced_schedule_costs AS (
			SELECT
				sc.id AS line_id,
				'schedule_cost'::text AS line_kind,
				sc.id AS schedule_item_cost_id,
				sc.schedule_item_type,
				sc.schedule_item_id,
				li.id AS budget_line_item_id,
				li.section_id,
				bs.code AS section_code,
				bs.name AS section_name,
				COALESCE(NULLIF(TRIM(sc.name), ''), li.name) AS name,
				sc.status,
				COALESCE(NULLIF(TRIM(sc.currency), ''), li.cost_currency, 'EUR') AS currency,
				COALESCE(sc.estimated_amount, 0)::numeric(16,2) AS planned_amount,
				(li.quantity * li.unit_cost)::numeric(16,2) AS budget_amount
			FROM schedule_item_costs sc
			LEFT JOIN budget_line_items li ON li.id = sc.budget_line_item_id
			LEFT JOIN budget_sections bs ON bs.id = li.section_id
			WHERE sc.event_id = $1
		),
		budget_only_lines AS (
			SELECT
				li.id AS line_id,
				'budget_only'::text AS line_kind,
				NULL::integer AS schedule_item_cost_id,
				''::text AS schedule_item_type,
				NULL::integer AS schedule_item_id,
				li.id AS budget_line_item_id,
				li.section_id,
				bs.code AS section_code,
				bs.name AS section_name,
				li.name,
				'expected'::text AS status,
				COALESCE(NULLIF(TRIM(li.cost_currency), ''), 'EUR') AS currency,
				(li.quantity * li.unit_cost)::numeric(16,2) AS planned_amount,
				(li.quantity * li.unit_cost)::numeric(16,2) AS budget_amount
			FROM event_budgets b
			JOIN budget_line_items li ON li.budget_id = b.id
			JOIN budget_sections bs ON bs.id = li.section_id
			LEFT JOIN schedule_item_costs sc ON sc.budget_line_item_id = li.id
			WHERE b.event_id = $1
			  AND sc.id IS NULL
		),
		planned_lines AS (
			SELECT * FROM synced_schedule_costs
			UNION ALL
			SELECT * FROM budget_only_lines
		),
		invoiced_totals AS (
			SELECT
				CASE
					WHEN ae.schedule_item_cost_id IS NOT NULL THEN 'schedule_cost'
					ELSE 'budget_only'
				END AS line_kind,
				COALESCE(ae.schedule_item_cost_id, ae.budget_line_item_id) AS line_id,
				COALESCE(SUM(ae.amount), 0)::numeric(16,2) AS invoiced_amount
			FROM accounting_entries ae
			JOIN accounting_documents ad ON ad.id = ae.document_id
			WHERE ae.event_id = $1
			  AND (ae.schedule_item_cost_id IS NOT NULL OR ae.budget_line_item_id IS NOT NULL)
			  AND ad.status <> 'voided'
			GROUP BY 1, 2
		),
		paid_totals AS (
			SELECT
				CASE
					WHEN ae.schedule_item_cost_id IS NOT NULL THEN 'schedule_cost'
					ELSE 'budget_only'
				END AS line_kind,
				COALESCE(ae.schedule_item_cost_id, ae.budget_line_item_id) AS line_id,
				COALESCE(SUM(pa.amount), 0)::numeric(16,2) AS paid_amount
			FROM payment_allocations pa
			JOIN accounting_entries ae ON ae.id = pa.accounting_entry_id
			WHERE ae.event_id = $1
			  AND (ae.schedule_item_cost_id IS NOT NULL OR ae.budget_line_item_id IS NOT NULL)
			GROUP BY 1, 2
		)
		SELECT
			pl.line_kind,
			pl.line_id,
			pl.schedule_item_cost_id,
			pl.schedule_item_type,
			pl.schedule_item_id,
			pl.budget_line_item_id,
			pl.section_id,
			pl.section_code,
			pl.section_name,
			pl.name,
			pl.status,
			pl.currency,
			pl.planned_amount::float8,
			pl.budget_amount::float8,
			COALESCE(it.invoiced_amount, 0)::float8,
			COALESCE(pt.paid_amount, 0)::float8
		FROM planned_lines pl
		LEFT JOIN invoiced_totals it ON it.line_kind = pl.line_kind AND it.line_id = pl.line_id
		LEFT JOIN paid_totals pt ON pt.line_kind = pl.line_kind AND pt.line_id = pl.line_id
		ORDER BY pl.section_code, pl.name, pl.line_id
	`, eventID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to build budget actuals")
		return
	}
	defer rows.Close()

	report := BudgetActualsReport{
		EventID:  eventID,
		Currency: "EUR",
		Sections: make([]BudgetActualsSectionTotal, 0),
		Lines:    make([]BudgetActualsLine, 0),
	}

	sectionIndex := map[int64]int{}
	for rows.Next() {
		var lineKind string
		var lineID int64
		var scheduleItemCostID *int64
		var scheduleItemType string
		var scheduleItemID *int64
		var budgetLineItemID *int64
		var sectionID *int64
		var sectionCode string
		var sectionName string
		var name string
		var lineStatus string
		var currency string
		var planned, budgetAmount, invoiced, paid float64
		if err := rows.Scan(
			&lineKind,
			&lineID,
			&scheduleItemCostID,
			&scheduleItemType,
			&scheduleItemID,
			&budgetLineItemID,
			&sectionID,
			&sectionCode,
			&sectionName,
			&name,
			&lineStatus,
			&currency,
			&planned,
			&budgetAmount,
			&invoiced,
			&paid,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to read budget actuals")
			return
		}

		open := invoiced - paid
		estimateToInvoice := invoiced - planned
		invoiceToPaid := paid - invoiced
		invoicedVariance := invoiced - budgetAmount
		paidVariance := paid - budgetAmount
		variancePct := 0.0
		if budgetAmount != 0 {
			variancePct = (paidVariance / budgetAmount) * 100
		}
		lineScheduleItemCostID := lineID
		if scheduleItemCostID != nil && *scheduleItemCostID > 0 {
			lineScheduleItemCostID = *scheduleItemCostID
		}
		status := lineStatus
		if lineKind == "schedule_cost" {
			status = deriveStatus(invoiced, paid)
		}
		line := BudgetActualsLine{
			ScheduleItemCostID:        lineScheduleItemCostID,
			ScheduleItemType:          scheduleItemType,
			ScheduleItemID:            scheduleItemID,
			BudgetLineItemID:          budgetLineItemID,
			SectionID:                 sectionID,
			SectionCode:               sectionCode,
			SectionName:               sectionName,
			Name:                      name,
			Status:                    status,
			Currency:                  normalizeCurrency(currency),
			PlannedAmount:             planned,
			InvoicedAmount:            invoiced,
			PaidAmount:                paid,
			OpenInvoiceAmount:         open,
			EstimateToInvoiceVariance: estimateToInvoice,
			InvoiceToPaidVariance:     invoiceToPaid,
			VarianceVsBudget:          paidVariance,
			VariancePercent:           variancePct,
			InvoicedVarianceVsBudget:  invoicedVariance,
			PaidVarianceVsBudget:      paidVariance,
		}
		report.Lines = append(report.Lines, line)

		report.Totals.PlannedAmount += planned
		report.Totals.InvoicedAmount += invoiced
		report.Totals.PaidAmount += paid
		report.Totals.OpenInvoiceAmount += open
		report.Totals.EstimateToInvoiceVariance += estimateToInvoice
		report.Totals.InvoiceToPaidVariance += invoiceToPaid
		report.Totals.VarianceVsBudget += paidVariance
		report.Totals.InvoicedVarianceVsBudget += invoicedVariance
		report.Totals.PaidVarianceVsBudget += paidVariance
		sectionKey := int64(0)
		if sectionID != nil {
			sectionKey = *sectionID
		}
		if idx, exists := sectionIndex[sectionKey]; exists {
			report.Sections[idx].PlannedAmount += planned
			report.Sections[idx].InvoicedAmount += invoiced
			report.Sections[idx].PaidAmount += paid
			report.Sections[idx].OpenInvoiceAmount += open
			report.Sections[idx].VarianceVsBudget += paidVariance
		} else {
			report.Sections = append(report.Sections, BudgetActualsSectionTotal{
				SectionID:         sectionID,
				SectionCode:       sectionCode,
				SectionName:       sectionName,
				PlannedAmount:     planned,
				InvoicedAmount:    invoiced,
				PaidAmount:        paid,
				OpenInvoiceAmount: open,
				VarianceVsBudget:  paidVariance,
			})
			sectionIndex[sectionKey] = len(report.Sections) - 1
		}
		if report.Currency == "EUR" && strings.TrimSpace(currency) != "" {
			report.Currency = normalizeCurrency(currency)
		}
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read budget actuals")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, report)
}

func parseOptionalDate(raw string) (*time.Time, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, err
	}
	utc := t.UTC()
	return &utc, nil
}

func deriveStatus(invoiced, paid float64) string {
	switch {
	case invoiced <= 0 && paid <= 0:
		return "expected"
	case invoiced > 0 && paid <= 0:
		return "invoiced"
	case paid > 0 && paid < invoiced:
		return "partially_paid"
	case invoiced > 0 && paid >= invoiced:
		return "paid"
	default:
		return "committed"
	}
}

func (h *Handler) listScheduleCosts(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}
	scheduleType, scheduleID, ok := parseScheduleTargetParams(w, r)
	if !ok {
		return
	}
	if _, err := h.resolveScheduleTarget(r.Context(), h.db, eventID, scheduleType, scheduleID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "schedule item not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate schedule item")
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, event_id, schedule_item_type, schedule_item_id, budget_line_item_id, vendor_id, name, category, owner, estimated_amount, currency, status, notes, created_at, updated_at
		FROM schedule_item_costs
		WHERE event_id = $1 AND schedule_item_type = $2 AND schedule_item_id = $3
		ORDER BY created_at ASC, id ASC
	`, eventID, scheduleType, scheduleID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load schedule costs")
		return
	}
	defer rows.Close()

	costs := make([]ScheduleItemCost, 0)
	for rows.Next() {
		cost, err := scanScheduleItemCost(rows)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to read schedule costs")
			return
		}
		costs = append(costs, *cost)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read schedule costs")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, costs)
}

type ScheduleItemCost struct {
	ID               int64     `json:"id"`
	EventID          int64     `json:"event_id"`
	ScheduleItemType string    `json:"schedule_item_type"`
	ScheduleItemID   int64     `json:"schedule_item_id"`
	BudgetLineItemID *int64    `json:"budget_line_item_id,omitempty"`
	VendorID         *int64    `json:"vendor_id,omitempty"`
	Name             string    `json:"name"`
	Category         string    `json:"category,omitempty"`
	Owner            string    `json:"owner,omitempty"`
	EstimatedAmount  float64   `json:"estimated_amount"`
	Currency         string    `json:"currency"`
	Status           string    `json:"status"`
	Notes            string    `json:"notes,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func scanScheduleItemCost(scanner interface{ Scan(dest ...any) error }) (*ScheduleItemCost, error) {
	var cost ScheduleItemCost
	if err := scanner.Scan(
		&cost.ID,
		&cost.EventID,
		&cost.ScheduleItemType,
		&cost.ScheduleItemID,
		&cost.BudgetLineItemID,
		&cost.VendorID,
		&cost.Name,
		&cost.Category,
		&cost.Owner,
		&cost.EstimatedAmount,
		&cost.Currency,
		&cost.Status,
		&cost.Notes,
		&cost.CreatedAt,
		&cost.UpdatedAt,
	); err != nil {
		return nil, err
	}
	cost.Currency = normalizeCurrency(cost.Currency)
	return &cost, nil
}

func parseScheduleTargetParams(w http.ResponseWriter, r *http.Request) (string, int64, bool) {
	scheduleType := strings.TrimSpace(chi.URLParam(r, "scheduleType"))
	if scheduleType == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid scheduleType")
		return "", 0, false
	}
	scheduleID, ok := parseIDParam(w, r, "scheduleID")
	if !ok {
		return "", 0, false
	}
	return scheduleType, scheduleID, true
}

func normalizeScheduleType(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "innhopp":
		return "innhopp"
	case "transport":
		return "transport"
	case "ground_crew":
		return "ground_crew"
	case "other":
		return "other"
	case "meal":
		return "meal"
	case "accommodation":
		return "accommodation"
	case "accommodation_check_in":
		return "accommodation_check_in"
	case "accommodation_check_out":
		return "accommodation_check_out"
	default:
		return ""
	}
}

func (h *Handler) resolveScheduleTarget(ctx context.Context, db interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, eventID int64, scheduleType string, scheduleID int64) (*scheduleTarget, error) {
	switch normalizeScheduleType(scheduleType) {
	case "innhopp":
		var name string
		var sequence int64
		var scheduledAt *time.Time
		err := db.QueryRow(ctx, `SELECT name, sequence, scheduled_at FROM innhopps WHERE id = $1 AND event_id = $2`, scheduleID, eventID).Scan(&name, &sequence, &scheduledAt)
		if err != nil {
			return nil, err
		}
		return &scheduleTarget{ScheduleType: "innhopp", ScheduleID: scheduleID, Name: "Innhopp #" + strconv.FormatInt(sequence, 10) + ": " + name, ServiceDate: scheduledAt, SectionCode: "aircraft"}, nil
	case "transport":
		var pickup, destination string
		var scheduledAt *time.Time
		err := db.QueryRow(ctx, `SELECT pickup_location, destination, scheduled_at FROM logistics_transports WHERE id = $1 AND event_id = $2`, scheduleID, eventID).Scan(&pickup, &destination, &scheduledAt)
		if err != nil {
			return nil, err
		}
		return &scheduleTarget{ScheduleType: "transport", ScheduleID: scheduleID, Name: strings.TrimSpace(pickup) + " -> " + strings.TrimSpace(destination), ServiceDate: scheduledAt, SectionCode: "transport_activities"}, nil
	case "ground_crew":
		var pickup, destination string
		var scheduledAt *time.Time
		err := db.QueryRow(ctx, `SELECT pickup_location, destination, scheduled_at FROM logistics_ground_crews WHERE id = $1 AND event_id = $2`, scheduleID, eventID).Scan(&pickup, &destination, &scheduledAt)
		if err != nil {
			return nil, err
		}
		return &scheduleTarget{ScheduleType: "ground_crew", ScheduleID: scheduleID, Name: strings.TrimSpace(pickup) + " -> " + strings.TrimSpace(destination), ServiceDate: scheduledAt, SectionCode: "transport_activities"}, nil
	case "other":
		var name string
		var scheduledAt *time.Time
		err := db.QueryRow(ctx, `SELECT name, scheduled_at FROM logistics_other WHERE id = $1 AND event_id = $2`, scheduleID, eventID).Scan(&name, &scheduledAt)
		if err != nil {
			return nil, err
		}
		return &scheduleTarget{ScheduleType: "other", ScheduleID: scheduleID, Name: name, ServiceDate: scheduledAt, SectionCode: "optional_add_on"}, nil
	case "meal":
		var name string
		var scheduledAt *time.Time
		err := db.QueryRow(ctx, `SELECT name, scheduled_at FROM logistics_meals WHERE id = $1 AND event_id = $2`, scheduleID, eventID).Scan(&name, &scheduledAt)
		if err != nil {
			return nil, err
		}
		return &scheduleTarget{ScheduleType: "meal", ScheduleID: scheduleID, Name: name, ServiceDate: scheduledAt, SectionCode: "food_accommodation"}, nil
	case "accommodation", "accommodation_check_in", "accommodation_check_out":
		var name string
		var checkInAt *time.Time
		var checkOutAt *time.Time
		err := db.QueryRow(ctx, `SELECT name, check_in_at, check_out_at FROM event_accommodation WHERE id = $1 AND event_id = $2`, scheduleID, eventID).Scan(&name, &checkInAt, &checkOutAt)
		if err != nil {
			return nil, err
		}
		serviceDate := checkInAt
		label := name
		if normalizeScheduleType(scheduleType) == "accommodation_check_out" {
			serviceDate = checkOutAt
			label = "Check-out: " + name
		} else if normalizeScheduleType(scheduleType) == "accommodation_check_in" {
			serviceDate = checkInAt
			label = "Check-in: " + name
		}
		return &scheduleTarget{ScheduleType: normalizeScheduleType(scheduleType), ScheduleID: scheduleID, Name: label, ServiceDate: serviceDate, SectionCode: "food_accommodation"}, nil
	default:
		return nil, pgx.ErrNoRows
	}
}

func (h *Handler) createScheduleCost(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}
	scheduleType, scheduleID, ok := parseScheduleTargetParams(w, r)
	if !ok {
		return
	}
	target, err := h.resolveScheduleTarget(r.Context(), h.db, eventID, scheduleType, scheduleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "schedule item not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to validate schedule item")
		return
	}
	var payload struct {
		Name            string  `json:"name"`
		Category        string  `json:"category"`
		Owner           string  `json:"owner"`
		EstimatedAmount float64 `json:"estimated_amount"`
		Currency        string  `json:"currency"`
		Notes           string  `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if payload.EstimatedAmount < 0 {
		httpx.Error(w, http.StatusBadRequest, "estimated_amount must be non-negative")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())
	createdBy := currentAccountID(r.Context())
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		name = target.Name
	}
	var cost ScheduleItemCost
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO schedule_item_costs (
			event_id, schedule_item_type, schedule_item_id, name, category, owner, estimated_amount, currency, status, notes, created_by_account_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'expected', $9, $10)
		RETURNING id, event_id, schedule_item_type, schedule_item_id, budget_line_item_id, vendor_id, name, category, owner, estimated_amount, currency, status, notes, created_at, updated_at
	`, eventID, target.ScheduleType, scheduleID, name, strings.TrimSpace(payload.Category), strings.TrimSpace(payload.Owner), payload.EstimatedAmount, normalizeCurrency(payload.Currency), strings.TrimSpace(payload.Notes), createdBy).Scan(
		&cost.ID, &cost.EventID, &cost.ScheduleItemType, &cost.ScheduleItemID, &cost.BudgetLineItemID, &cost.VendorID, &cost.Name, &cost.Category, &cost.Owner, &cost.EstimatedAmount, &cost.Currency, &cost.Status, &cost.Notes, &cost.CreatedAt, &cost.UpdatedAt,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create schedule cost")
		return
	}
	if err := h.syncBudgetLineForScheduleCost(r.Context(), tx, target, &cost); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync budget line")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to commit schedule cost")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, cost)
}

func (h *Handler) updateScheduleCost(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}
	costID, ok := parseIDParam(w, r, "costID")
	if !ok {
		return
	}
	var payload struct {
		Name            string  `json:"name"`
		Category        string  `json:"category"`
		Owner           string  `json:"owner"`
		EstimatedAmount float64 `json:"estimated_amount"`
		Currency        string  `json:"currency"`
		Status          string  `json:"status"`
		Notes           string  `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if payload.EstimatedAmount < 0 {
		httpx.Error(w, http.StatusBadRequest, "estimated_amount must be non-negative")
		return
	}
	status := strings.TrimSpace(payload.Status)
	if status == "" {
		status = "expected"
	}
	switch status {
	case "expected", "committed", "invoiced", "partially_paid", "paid", "cancelled", "disputed":
	default:
		httpx.Error(w, http.StatusBadRequest, "invalid status")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())
	var current ScheduleItemCost
	if err := tx.QueryRow(r.Context(), `
		SELECT id, event_id, schedule_item_type, schedule_item_id, budget_line_item_id, vendor_id, name, category, owner, estimated_amount, currency, status, notes, created_at, updated_at
		FROM schedule_item_costs
		WHERE id = $1 AND event_id = $2
	`, costID, eventID).Scan(
		&current.ID, &current.EventID, &current.ScheduleItemType, &current.ScheduleItemID, &current.BudgetLineItemID, &current.VendorID, &current.Name, &current.Category, &current.Owner, &current.EstimatedAmount, &current.Currency, &current.Status, &current.Notes, &current.CreatedAt, &current.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "schedule cost not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load schedule cost")
		return
	}
	target, err := h.resolveScheduleTarget(r.Context(), tx, eventID, current.ScheduleItemType, current.ScheduleItemID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate schedule item")
		return
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		name = current.Name
	}
	if err := tx.QueryRow(r.Context(), `
		UPDATE schedule_item_costs
		SET name = $3, category = $4, owner = $5, estimated_amount = $6, currency = $7, status = $8, notes = $9, updated_at = NOW()
		WHERE id = $1 AND event_id = $2
		RETURNING id, event_id, schedule_item_type, schedule_item_id, budget_line_item_id, vendor_id, name, category, owner, estimated_amount, currency, status, notes, created_at, updated_at
	`, costID, eventID, name, strings.TrimSpace(payload.Category), strings.TrimSpace(payload.Owner), payload.EstimatedAmount, normalizeCurrency(payload.Currency), status, strings.TrimSpace(payload.Notes)).Scan(
		&current.ID, &current.EventID, &current.ScheduleItemType, &current.ScheduleItemID, &current.BudgetLineItemID, &current.VendorID, &current.Name, &current.Category, &current.Owner, &current.EstimatedAmount, &current.Currency, &current.Status, &current.Notes, &current.CreatedAt, &current.UpdatedAt,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update schedule cost")
		return
	}
	if err := h.syncBudgetLineForScheduleCost(r.Context(), tx, target, &current); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync budget line")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to commit schedule cost")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, current)
}

func (h *Handler) deleteScheduleCost(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}
	costID, ok := parseIDParam(w, r, "costID")
	if !ok {
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())
	var budgetLineItemID *int64
	if err := tx.QueryRow(r.Context(), `SELECT budget_line_item_id FROM schedule_item_costs WHERE id = $1 AND event_id = $2`, costID, eventID).Scan(&budgetLineItemID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "schedule cost not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load schedule cost")
		return
	}
	if budgetLineItemID != nil {
		if _, err := tx.Exec(r.Context(), `DELETE FROM budget_line_items WHERE id = $1`, *budgetLineItemID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to delete synced budget line")
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM schedule_item_costs WHERE id = $1 AND event_id = $2`, costID, eventID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete schedule cost")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to commit schedule cost deletion")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) syncBudgetLineForScheduleCost(ctx context.Context, tx pgx.Tx, target *scheduleTarget, cost *ScheduleItemCost) error {
	budgetID, err := h.ensureEventBudget(ctx, tx, cost.EventID, cost.Currency)
	if err != nil {
		return err
	}
	sectionID, err := h.ensureBudgetSection(ctx, tx, budgetID, target.SectionCode)
	if err != nil {
		return err
	}
	serviceDate := toOptionalDate(target.ServiceDate)
	note := "[schedule-cost:" + strconv.FormatInt(cost.ID, 10) + "]"
	if cost.BudgetLineItemID != nil && *cost.BudgetLineItemID > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE budget_line_items
			SET section_id = $2, name = $3, service_date = $4, quantity = 1, unit_cost = $5, cost_currency = $6, notes = $7, updated_at = NOW()
			WHERE id = $1
		`, *cost.BudgetLineItemID, sectionID, cost.Name, serviceDate, cost.EstimatedAmount, cost.Currency, strings.TrimSpace(note+" "+cost.Notes))
		return err
	}
	var lineItemID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO budget_line_items (budget_id, section_id, name, service_date, quantity, unit_cost, cost_currency, sort_order, notes)
		VALUES ($1, $2, $3, $4, 1, $5, $6, 0, $7)
		RETURNING id
	`, budgetID, sectionID, cost.Name, serviceDate, cost.EstimatedAmount, cost.Currency, strings.TrimSpace(note+" "+cost.Notes)).Scan(&lineItemID); err != nil {
		return err
	}
	cost.BudgetLineItemID = &lineItemID
	_, err = tx.Exec(ctx, `UPDATE schedule_item_costs SET budget_line_item_id = $2, updated_at = NOW() WHERE id = $1`, cost.ID, lineItemID)
	return err
}

func (h *Handler) ensureEventBudget(ctx context.Context, tx pgx.Tx, eventID int64, currency string) (int64, error) {
	var budgetID int64
	err := tx.QueryRow(ctx, `SELECT id FROM event_budgets WHERE event_id = $1`, eventID).Scan(&budgetID)
	if err == nil {
		return budgetID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO event_budgets (event_id, name, base_currency, status, notes)
		VALUES ($1, 'Event budget', $2, 'draft', '')
		RETURNING id
	`, eventID, normalizeCurrency(currency)).Scan(&budgetID); err != nil {
		return 0, err
	}
	for idx, section := range defaultBudgetSections {
		if _, err := tx.Exec(ctx, `INSERT INTO budget_sections (budget_id, code, name, sort_order) VALUES ($1, $2, $3, $4)`, budgetID, section.Code, section.Name, idx); err != nil {
			return 0, err
		}
	}
	for key, value := range defaultBudgetAssumptions {
		if _, err := tx.Exec(ctx, `INSERT INTO budget_assumptions (budget_id, key, value_num) VALUES ($1, $2, $3)`, budgetID, key, value); err != nil {
			return 0, err
		}
	}
	return budgetID, nil
}

func (h *Handler) ensureBudgetSection(ctx context.Context, tx pgx.Tx, budgetID int64, sectionCode string) (int64, error) {
	var sectionID int64
	err := tx.QueryRow(ctx, `SELECT id FROM budget_sections WHERE budget_id = $1 AND code = $2`, budgetID, sectionCode).Scan(&sectionID)
	if err == nil {
		return sectionID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	name := sectionCode
	sortOrder := len(defaultBudgetSections)
	for idx, section := range defaultBudgetSections {
		if section.Code == sectionCode {
			name = section.Name
			sortOrder = idx
			break
		}
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO budget_sections (budget_id, code, name, sort_order)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, budgetID, sectionCode, name, sortOrder).Scan(&sectionID); err != nil {
		return 0, err
	}
	return sectionID, nil
}

func toOptionalDate(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	date := time.Date(value.UTC().Year(), value.UTC().Month(), value.UTC().Day(), 0, 0, 0, 0, time.UTC)
	return &date
}
