package budgets

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

	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/rbac"
)

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

type Budget struct {
	ID               int64     `json:"id"`
	EventID          int64     `json:"event_id"`
	Name             string    `json:"name"`
	BaseCurrency     string    `json:"base_currency"`
	AircraftCurrency string    `json:"aircraft_currency"`
	Status           string    `json:"status"`
	Notes            string    `json:"notes,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type BudgetSection struct {
	ID        int64     `json:"id"`
	BudgetID  int64     `json:"budget_id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type BudgetLineItem struct {
	ID            int64      `json:"id"`
	BudgetID      int64      `json:"budget_id"`
	SectionID     int64      `json:"section_id"`
	InnhoppID     *int64     `json:"innhopp_id,omitempty"`
	SectionCode   string     `json:"section_code,omitempty"`
	SectionName   string     `json:"section_name,omitempty"`
	Name          string     `json:"name"`
	ServiceDate   *time.Time `json:"service_date,omitempty"`
	LocationLabel string     `json:"location_label,omitempty"`
	Quantity      float64    `json:"quantity"`
	UnitCost      float64    `json:"unit_cost"`
	CostCurrency  string     `json:"cost_currency"`
	LineTotal     float64    `json:"line_total"`
	SortOrder     int        `json:"sort_order"`
	Notes         string     `json:"notes,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type BudgetCurrency struct {
	CurrencyCode string  `json:"currency_code"`
	RateToBase   float64 `json:"rate_to_base"`
}

type ScenarioSummary struct {
	Name             string  `json:"name"`
	Participants     int     `json:"participants"`
	ExpectedCost     float64 `json:"expected_cost"`
	CostWithDrift    float64 `json:"cost_with_drift"`
	Revenue          float64 `json:"revenue"`
	RevenueWithTip   float64 `json:"revenue_with_tip"`
	MarginWithoutTip float64 `json:"margin_without_tip"`
	MarginWithTip    float64 `json:"margin_with_tip"`
	Status           string  `json:"status"`
}

type MarginPoint struct {
	Participants int     `json:"participants"`
	Revenue      float64 `json:"revenue"`
	Cost         float64 `json:"cost"`
	Margin       float64 `json:"margin"`
}

type BudgetSummary struct {
	Budget                Budget                     `json:"budget"`
	Parameters            map[string]float64         `json:"parameters"`
	Assumptions           map[string]float64         `json:"assumptions,omitempty"`
	SectionTotals         []map[string]any           `json:"section_totals"`
	DepositAmount         float64                    `json:"deposit_amount"`
	MainInvoiceAmount     float64                    `json:"main_invoice_amount"`
	RevenuePerParticipant float64                    `json:"revenue_per_participant"`
	ExpectedCost          float64                    `json:"expected_cost"`
	DriftAmount           float64                    `json:"drift_amount"`
	CostWithDrift         float64                    `json:"cost_with_drift"`
	MarkupAmount          float64                    `json:"markup_amount"`
	TargetRevenue         float64                    `json:"target_revenue"`
	OptionalTipAmount     float64                    `json:"optional_tip_amount"`
	RevenueWithTip        float64                    `json:"revenue_with_tip"`
	LiveFXRates           map[string]float64         `json:"live_fx_rates,omitempty"`
	Scenarios             map[string]ScenarioSummary `json:"scenarios"`
	MarginCurve           []MarginPoint              `json:"margin_curve"`
}

var defaultSections = []struct {
	Code string
	Name string
}{
	{Code: "aircraft", Name: "Aircraft"},
	{Code: "food_accommodation", Name: "Food & Accommodation"},
	{Code: "transport_activities", Name: "Transport & Activities"},
	{Code: "entertainment", Name: "Entertainment"},
	{Code: "payable_crew", Name: "Payable Crew"},
	{Code: "optional_add_on", Name: "Optional Add-on"},
}

var defaultAssumptions = map[string]float64{
	"full_load_size":              14,
	"crew_on_load_count":          2,
	"confirm_load_count":          1,
	"planned_load_count":          2,
	"aircraft_price_per_minute":   0,
	"aircraft_cruising_speed_kmh": 180,
	"target_markup_percent":       20,
	"optional_tip_percent":        8,
	"cost_drift_percent":          3,
}

const autoAircraftInnhoppNotePrefix = "[auto-aircraft-innhopp]"

func (h *Handler) EventBudgetRoutes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/", h.getBudgetByEvent)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Post("/", h.createBudgetForEvent)
	return r
}

func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/events/{eventID}", h.getBudgetByEvent)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Post("/events/{eventID}", h.createBudgetForEvent)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/{budgetID}", h.getBudget)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Put("/{budgetID}", h.updateBudget)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/{budgetID}/sections", h.listSections)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Put("/{budgetID}/sections/reorder", h.reorderSections)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/{budgetID}/line-items", h.listLineItems)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Post("/{budgetID}/line-items", h.createLineItem)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Put("/{budgetID}/line-items/{lineItemID}", h.updateLineItem)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Delete("/{budgetID}/line-items/{lineItemID}", h.deleteLineItem)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/{budgetID}/assumptions", h.getAssumptions)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Put("/{budgetID}/assumptions", h.updateAssumptions)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/{budgetID}/currencies", h.listCurrencies)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Post("/{budgetID}/currencies/preview-rates", h.previewCurrencyRates)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Put("/{budgetID}/currencies", h.updateCurrencies)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/{budgetID}/summary", h.getSummary)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Post("/{budgetID}/scenarios/calculate", h.calculateScenario)
	r.With(enforcer.Authorize(rbac.PermissionViewBudget)).Get("/{budgetID}/scenarios", h.listScenarios)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Post("/{budgetID}/scenarios", h.createScenario)
	r.With(enforcer.Authorize(rbac.PermissionManageBudget)).Delete("/{budgetID}/scenarios/{scenarioID}", h.deleteScenario)
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

func appendUniqueCurrency(codes []string, code string) []string {
	normalized := normalizeCurrency(code)
	if normalized == "" {
		return codes
	}
	for _, existing := range codes {
		if existing == normalized {
			return codes
		}
	}
	return append(codes, normalized)
}

func isValidCurrencyCode(v string) bool {
	if len(v) != 3 {
		return false
	}
	for _, r := range v {
		if r < 'A' || r > 'Z' {
			return false
		}
	}
	return true
}

func clampNonNegative(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}

func (h *Handler) getBudgetByEvent(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}
	budget, err := h.fetchBudgetByEvent(r.Context(), eventID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load budget")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, budget)
}

func (h *Handler) createBudgetForEvent(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseIDParam(w, r, "eventID")
	if !ok {
		return
	}

	var payload struct {
		Name             string `json:"name"`
		BaseCurrency     string `json:"base_currency"`
		AircraftCurrency string `json:"aircraft_currency"`
		Notes            string `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	if strings.TrimSpace(payload.Name) == "" {
		payload.Name = "Event budget"
	}
	baseCurrency := normalizeCurrency(payload.BaseCurrency)
	if !isValidCurrencyCode(baseCurrency) {
		httpx.Error(w, http.StatusBadRequest, "base_currency must be a 3-letter ISO code")
		return
	}
	aircraftCurrency := normalizeCurrency(payload.AircraftCurrency)
	if aircraftCurrency == "EUR" && strings.TrimSpace(payload.AircraftCurrency) == "" {
		aircraftCurrency = baseCurrency
	}
	if !isValidCurrencyCode(aircraftCurrency) {
		httpx.Error(w, http.StatusBadRequest, "aircraft_currency must be a 3-letter ISO code")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create budget")
		return
	}
	defer tx.Rollback(r.Context())

	var eventExists bool
	if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM events WHERE id = $1)`, eventID).Scan(&eventExists); err != nil || !eventExists {
		httpx.Error(w, http.StatusBadRequest, "event not found")
		return
	}

	var budget Budget
	insertErr := tx.QueryRow(
		r.Context(),
		`INSERT INTO event_budgets (event_id, name, base_currency, aircraft_currency, status, notes)
         VALUES ($1, $2, $3, $4, 'draft', $5)
         RETURNING id, event_id, name, base_currency, aircraft_currency, status, notes, created_at, updated_at`,
		eventID,
		strings.TrimSpace(payload.Name),
		baseCurrency,
		aircraftCurrency,
		strings.TrimSpace(payload.Notes),
	).Scan(&budget.ID, &budget.EventID, &budget.Name, &budget.BaseCurrency, &budget.AircraftCurrency, &budget.Status, &budget.Notes, &budget.CreatedAt, &budget.UpdatedAt)
	if insertErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(insertErr, &pgErr) && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "budget already exists for event")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to create budget")
		return
	}

	for i, section := range defaultSections {
		if _, err := tx.Exec(
			r.Context(),
			`INSERT INTO budget_sections (budget_id, code, name, sort_order) VALUES ($1, $2, $3, $4)`,
			budget.ID,
			section.Code,
			section.Name,
			i,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to initialize sections")
			return
		}
	}

	for k, v := range defaultAssumptions {
		if _, err := tx.Exec(
			r.Context(),
			`INSERT INTO budget_assumptions (budget_id, key, value_num) VALUES ($1, $2, $3)`,
			budget.ID,
			k,
			v,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to initialize assumptions")
			return
		}
	}

	if _, err := tx.Exec(
		r.Context(),
		`INSERT INTO budget_currencies (budget_id, currency_code, rate_to_base)
         VALUES ($1, $2, 1)
         ON CONFLICT (budget_id, currency_code) DO NOTHING`,
		budget.ID,
		budget.BaseCurrency,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to initialize currencies")
		return
	}
	if _, err := tx.Exec(
		r.Context(),
		`INSERT INTO budget_currencies (budget_id, currency_code, rate_to_base)
         VALUES ($1, $2, 1)
         ON CONFLICT (budget_id, currency_code) DO NOTHING`,
		budget.ID,
		budget.AircraftCurrency,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to initialize currencies")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create budget")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budget.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, budget)
}

func (h *Handler) getBudget(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	budget, err := h.fetchBudget(r.Context(), budgetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load budget")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, budget)
}

func (h *Handler) updateBudget(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	current, err := h.fetchBudget(r.Context(), budgetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update budget")
		return
	}

	var payload struct {
		Name             *string `json:"name"`
		BaseCurrency     *string `json:"base_currency"`
		AircraftCurrency *string `json:"aircraft_currency"`
		Status           *string `json:"status"`
		Notes            *string `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	name := current.Name
	if payload.Name != nil && strings.TrimSpace(*payload.Name) != "" {
		name = strings.TrimSpace(*payload.Name)
	}
	baseCurrency := current.BaseCurrency
	if payload.BaseCurrency != nil {
		baseCurrency = normalizeCurrency(*payload.BaseCurrency)
		if !isValidCurrencyCode(baseCurrency) {
			httpx.Error(w, http.StatusBadRequest, "base_currency must be a 3-letter ISO code")
			return
		}
	}
	aircraftCurrency := current.AircraftCurrency
	if payload.AircraftCurrency != nil {
		aircraftCurrency = normalizeCurrency(*payload.AircraftCurrency)
		if !isValidCurrencyCode(aircraftCurrency) {
			httpx.Error(w, http.StatusBadRequest, "aircraft_currency must be a 3-letter ISO code")
			return
		}
	}
	status := current.Status
	if payload.Status != nil {
		status = strings.TrimSpace(*payload.Status)
	}
	notes := current.Notes
	if payload.Notes != nil {
		notes = strings.TrimSpace(*payload.Notes)
	}

	if status == "review" || status == "approved" {
		summary, err := h.buildSummary(r.Context(), budgetID, nil)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate budget status")
			return
		}
		worst, ok := summary.Scenarios["worst_case_gate"]
		if !ok {
			httpx.Error(w, http.StatusInternalServerError, "failed to validate worst-case scenario")
			return
		}
		if worst.MarginWithoutTip < 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"error":          "worst-case margin must be non-negative before status transition",
				"reason_code":    "worst_case_negative_margin",
				"margin_deficit": marginDeficit(worst.MarginWithoutTip),
			})
			return
		}
	}

	var updated Budget
	if err := h.db.QueryRow(
		r.Context(),
		`UPDATE event_budgets
         SET name = $1, base_currency = $2, aircraft_currency = $3, status = $4, notes = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING id, event_id, name, base_currency, aircraft_currency, status, notes, created_at, updated_at`,
		name, baseCurrency, aircraftCurrency, status, notes, budgetID,
	).Scan(&updated.ID, &updated.EventID, &updated.Name, &updated.BaseCurrency, &updated.AircraftCurrency, &updated.Status, &updated.Notes, &updated.CreatedAt, &updated.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update budget")
		return
	}

	if _, err := h.db.Exec(
		r.Context(),
		`INSERT INTO budget_currencies (budget_id, currency_code, rate_to_base)
         VALUES ($1, $2, 1)
         ON CONFLICT (budget_id, currency_code) DO NOTHING`,
		budgetID,
		baseCurrency,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync budget currency")
		return
	}
	if _, err := h.db.Exec(
		r.Context(),
		`INSERT INTO budget_currencies (budget_id, currency_code, rate_to_base)
         VALUES ($1, $2, 1)
         ON CONFLICT (budget_id, currency_code) DO NOTHING`,
		budgetID,
		aircraftCurrency,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft currency")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) listSections(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	rows, err := h.db.Query(
		r.Context(),
		`SELECT id, budget_id, code, name, sort_order, created_at
         FROM budget_sections
         WHERE budget_id = $1
         ORDER BY sort_order ASC, id ASC`,
		budgetID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list sections")
		return
	}
	defer rows.Close()

	var sections []BudgetSection
	for rows.Next() {
		var section BudgetSection
		if err := rows.Scan(&section.ID, &section.BudgetID, &section.Code, &section.Name, &section.SortOrder, &section.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse section")
			return
		}
		sections = append(sections, section)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list sections")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sections)
}

func (h *Handler) reorderSections(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	var payload struct {
		SectionIDs []int64 `json:"section_ids"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	if len(payload.SectionIDs) == 0 {
		httpx.Error(w, http.StatusBadRequest, "section_ids are required")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to reorder sections")
		return
	}
	defer tx.Rollback(r.Context())

	for i, id := range payload.SectionIDs {
		tag, err := tx.Exec(
			r.Context(),
			`UPDATE budget_sections SET sort_order = $1 WHERE id = $2 AND budget_id = $3`,
			i, id, budgetID,
		)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to reorder sections")
			return
		}
		if tag.RowsAffected() == 0 {
			httpx.Error(w, http.StatusBadRequest, "invalid section id for budget")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to reorder sections")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) listLineItems(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	rows, err := h.db.Query(
		r.Context(),
		`SELECT li.id, li.budget_id, li.section_id, s.code, s.name, li.name, li.service_date, li.location_label,
                li.innhopp_id, li.quantity, li.unit_cost, li.cost_currency, li.sort_order, li.notes, li.created_at, li.updated_at
         FROM budget_line_items li
         JOIN budget_sections s ON s.id = li.section_id
         WHERE li.budget_id = $1
         ORDER BY s.sort_order ASC, li.sort_order ASC, li.id ASC`,
		budgetID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list line items")
		return
	}
	defer rows.Close()

	var items []BudgetLineItem
	for rows.Next() {
		var item BudgetLineItem
		if err := rows.Scan(
			&item.ID, &item.BudgetID, &item.SectionID, &item.SectionCode, &item.SectionName, &item.Name, &item.ServiceDate, &item.LocationLabel,
			&item.InnhoppID, &item.Quantity, &item.UnitCost, &item.CostCurrency, &item.SortOrder, &item.Notes, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse line item")
			return
		}
		item.LineTotal = roundMoney(item.Quantity * item.UnitCost)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list line items")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, items)
}

func (h *Handler) createLineItem(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	var payload struct {
		SectionID     int64   `json:"section_id"`
		InnhoppID     *int64  `json:"innhopp_id"`
		Name          string  `json:"name"`
		ServiceDate   string  `json:"service_date"`
		LocationLabel string  `json:"location_label"`
		Quantity      float64 `json:"quantity"`
		UnitCost      float64 `json:"unit_cost"`
		CostCurrency  string  `json:"cost_currency"`
		SortOrder     int     `json:"sort_order"`
		Notes         string  `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	if payload.SectionID <= 0 || strings.TrimSpace(payload.Name) == "" {
		httpx.Error(w, http.StatusBadRequest, "section_id and name are required")
		return
	}
	quantity := payload.Quantity
	if quantity <= 0 {
		quantity = 1
	}
	unitCost := clampNonNegative(payload.UnitCost)
	costCurrency := normalizeCurrency(payload.CostCurrency)
	if !isValidCurrencyCode(costCurrency) {
		httpx.Error(w, http.StatusBadRequest, "cost_currency must be a 3-letter ISO code")
		return
	}
	if ok, err := h.isBudgetCurrencyEnabled(r.Context(), budgetID, costCurrency); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate cost currency")
		return
	} else if !ok {
		httpx.Error(w, http.StatusBadRequest, "cost_currency is not enabled for this budget")
		return
	}

	var serviceDate *time.Time
	if strings.TrimSpace(payload.ServiceDate) != "" {
		parsed, err := time.Parse("2006-01-02", strings.TrimSpace(payload.ServiceDate))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "service_date must be YYYY-MM-DD")
			return
		}
		serviceDate = &parsed
	}

	var item BudgetLineItem
	err := h.db.QueryRow(
		r.Context(),
		`INSERT INTO budget_line_items (budget_id, section_id, innhopp_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, budget_id, section_id, innhopp_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes, created_at, updated_at`,
		budgetID, payload.SectionID, payload.InnhoppID, strings.TrimSpace(payload.Name), serviceDate, strings.TrimSpace(payload.LocationLabel), quantity, unitCost, costCurrency, payload.SortOrder, strings.TrimSpace(payload.Notes),
	).Scan(&item.ID, &item.BudgetID, &item.SectionID, &item.InnhoppID, &item.Name, &item.ServiceDate, &item.LocationLabel, &item.Quantity, &item.UnitCost, &item.CostCurrency, &item.SortOrder, &item.Notes, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create line item")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	item.LineTotal = roundMoney(item.Quantity * item.UnitCost)
	httpx.WriteJSON(w, http.StatusCreated, item)
}

func (h *Handler) updateLineItem(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	lineItemID, ok := parseIDParam(w, r, "lineItemID")
	if !ok {
		return
	}
	var payload struct {
		SectionID     int64   `json:"section_id"`
		InnhoppID     *int64  `json:"innhopp_id"`
		Name          string  `json:"name"`
		ServiceDate   string  `json:"service_date"`
		LocationLabel string  `json:"location_label"`
		Quantity      float64 `json:"quantity"`
		UnitCost      float64 `json:"unit_cost"`
		CostCurrency  string  `json:"cost_currency"`
		SortOrder     int     `json:"sort_order"`
		Notes         string  `json:"notes"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	if payload.SectionID <= 0 || strings.TrimSpace(payload.Name) == "" {
		httpx.Error(w, http.StatusBadRequest, "section_id and name are required")
		return
	}
	quantity := payload.Quantity
	if quantity <= 0 {
		quantity = 1
	}
	unitCost := clampNonNegative(payload.UnitCost)
	costCurrency := normalizeCurrency(payload.CostCurrency)
	if !isValidCurrencyCode(costCurrency) {
		httpx.Error(w, http.StatusBadRequest, "cost_currency must be a 3-letter ISO code")
		return
	}
	if ok, err := h.isBudgetCurrencyEnabled(r.Context(), budgetID, costCurrency); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate cost currency")
		return
	} else if !ok {
		httpx.Error(w, http.StatusBadRequest, "cost_currency is not enabled for this budget")
		return
	}

	var serviceDate *time.Time
	if strings.TrimSpace(payload.ServiceDate) != "" {
		parsed, err := time.Parse("2006-01-02", strings.TrimSpace(payload.ServiceDate))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "service_date must be YYYY-MM-DD")
			return
		}
		serviceDate = &parsed
	}

	var item BudgetLineItem
	err := h.db.QueryRow(
		r.Context(),
		`UPDATE budget_line_items
         SET section_id = $1, innhopp_id = $2, name = $3, service_date = $4, location_label = $5, quantity = $6, unit_cost = $7, cost_currency = $8, sort_order = $9, notes = $10, updated_at = NOW()
         WHERE id = $11 AND budget_id = $12
         RETURNING id, budget_id, section_id, innhopp_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes, created_at, updated_at`,
		payload.SectionID, payload.InnhoppID, strings.TrimSpace(payload.Name), serviceDate, strings.TrimSpace(payload.LocationLabel), quantity, unitCost, costCurrency, payload.SortOrder, strings.TrimSpace(payload.Notes), lineItemID, budgetID,
	).Scan(&item.ID, &item.BudgetID, &item.SectionID, &item.InnhoppID, &item.Name, &item.ServiceDate, &item.LocationLabel, &item.Quantity, &item.UnitCost, &item.CostCurrency, &item.SortOrder, &item.Notes, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "line item not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update line item")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	item.LineTotal = roundMoney(item.Quantity * item.UnitCost)
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (h *Handler) deleteLineItem(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	lineItemID, ok := parseIDParam(w, r, "lineItemID")
	if !ok {
		return
	}
	tag, err := h.db.Exec(r.Context(), `DELETE FROM budget_line_items WHERE id = $1 AND budget_id = $2`, lineItemID, budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete line item")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "line item not found")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) getAssumptions(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	assumptions, err := h.fetchAssumptions(r.Context(), budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load assumptions")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"values": assumptions, "parameters": assumptions})
}

func (h *Handler) updateAssumptions(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	var payload struct {
		Values map[string]float64 `json:"values"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	if len(payload.Values) == 0 {
		httpx.Error(w, http.StatusBadRequest, "values are required")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update assumptions")
		return
	}
	defer tx.Rollback(r.Context())

	for key, val := range payload.Values {
		k := strings.TrimSpace(key)
		if k == "" {
			continue
		}
		if _, ok := defaultAssumptions[k]; !ok {
			continue
		}
		if strings.HasSuffix(k, "_percent") && val < 0 {
			httpx.Error(w, http.StatusBadRequest, k+" must be non-negative")
			return
		}
		if (strings.HasSuffix(k, "_count") || strings.HasSuffix(k, "_size")) && val < 0 {
			httpx.Error(w, http.StatusBadRequest, k+" must be non-negative")
			return
		}
		if _, err := tx.Exec(
			r.Context(),
			`INSERT INTO budget_assumptions (budget_id, key, value_num)
             VALUES ($1, $2, $3)
             ON CONFLICT (budget_id, key)
             DO UPDATE SET value_num = EXCLUDED.value_num, updated_at = NOW()`,
			budgetID, k, val,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to update assumptions")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update assumptions")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	updated, err := h.fetchAssumptions(r.Context(), budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load assumptions")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"values": updated, "parameters": updated})
}

func (h *Handler) listCurrencies(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	budget, err := h.fetchBudget(r.Context(), budgetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load currencies")
		return
	}
	currencies, err := h.fetchBudgetCurrencies(r.Context(), budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load currencies")
		return
	}
	codes := make([]string, 0, len(currencies))
	fallbackRates := map[string]float64{}
	for _, row := range currencies {
		codes = appendUniqueCurrency(codes, row.CurrencyCode)
		if row.RateToBase > 0 {
			fallbackRates[row.CurrencyCode] = row.RateToBase
		}
	}
	baseCurrency := normalizeCurrency(budget.BaseCurrency)
	aircraftCurrency := normalizeCurrency(budget.AircraftCurrency)
	codes = appendUniqueCurrency(codes, baseCurrency)
	codes = appendUniqueCurrency(codes, aircraftCurrency)
	rates, err := h.fetchLiveCurrencyRates(r.Context(), budget.BaseCurrency, codes)
	if err != nil || len(rates) == 0 {
		rates = fallbackRates
	}
	if rates == nil {
		rates = map[string]float64{}
	}
	rates[baseCurrency] = 1
	_ = h.upsertCurrencyRates(r.Context(), budgetID, rates)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"base_currency":     budget.BaseCurrency,
		"aircraft_currency": budget.AircraftCurrency,
		"currencies":        codes,
		"live_rates":        rates,
	})
}

func (h *Handler) updateCurrencies(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	budget, err := h.fetchBudget(r.Context(), budgetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update currencies")
		return
	}

	var payload struct {
		Currencies []string `json:"currencies"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	existingCurrencies, err := h.fetchBudgetCurrencies(r.Context(), budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update currencies")
		return
	}
	fallbackRates := map[string]float64{}
	for _, row := range existingCurrencies {
		if row.RateToBase > 0 {
			fallbackRates[row.CurrencyCode] = row.RateToBase
		}
	}

	seen := map[string]bool{}
	normalized := make([]BudgetCurrency, 0, len(payload.Currencies)+1)
	for _, raw := range payload.Currencies {
		code := normalizeCurrency(raw)
		if !isValidCurrencyCode(code) {
			httpx.Error(w, http.StatusBadRequest, "currency_code must be a 3-letter ISO code")
			return
		}
		if seen[code] {
			continue
		}
		seen[code] = true
		normalized = append(normalized, BudgetCurrency{CurrencyCode: code})
	}
	baseCurrency := normalizeCurrency(budget.BaseCurrency)
	aircraftCurrency := normalizeCurrency(budget.AircraftCurrency)
	if !seen[baseCurrency] {
		normalized = append(normalized, BudgetCurrency{CurrencyCode: baseCurrency})
		seen[baseCurrency] = true
	}
	if !seen[aircraftCurrency] {
		normalized = append(normalized, BudgetCurrency{CurrencyCode: aircraftCurrency})
		seen[aircraftCurrency] = true
	}
	codes := make([]string, 0, len(normalized))
	for _, row := range normalized {
		codes = appendUniqueCurrency(codes, row.CurrencyCode)
	}
	rates, err := h.fetchLiveCurrencyRates(r.Context(), budget.BaseCurrency, codes)
	if err != nil || len(rates) == 0 {
		rates = map[string]float64{}
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update currencies")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `DELETE FROM budget_currencies WHERE budget_id = $1`, budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update currencies")
		return
	}
	for _, row := range normalized {
		rateToBase := rates[row.CurrencyCode]
		if rateToBase <= 0 {
			rateToBase = fallbackRates[row.CurrencyCode]
		}
		if rateToBase <= 0 {
			rateToBase = 1
		}
		if _, err := tx.Exec(
			r.Context(),
			`INSERT INTO budget_currencies (budget_id, currency_code, rate_to_base)
             VALUES ($1, $2, $3)`,
			budgetID, row.CurrencyCode, rateToBase,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to update currencies")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to update currencies")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	if len(rates) == 0 {
		rates = map[string]float64{}
	}
	for _, row := range normalized {
		rateToBase := rates[row.CurrencyCode]
		if rateToBase <= 0 {
			rateToBase = fallbackRates[row.CurrencyCode]
		}
		if rateToBase <= 0 {
			rateToBase = 1
		}
		rates[row.CurrencyCode] = rateToBase
	}
	rates[baseCurrency] = 1
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"base_currency":     budget.BaseCurrency,
		"aircraft_currency": budget.AircraftCurrency,
		"currencies":        codes,
		"live_rates":        rates,
	})
}

func (h *Handler) previewCurrencyRates(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	budget, err := h.fetchBudget(r.Context(), budgetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to preview currency rates")
		return
	}

	var payload struct {
		BaseCurrency string   `json:"base_currency"`
		Currencies   []string `json:"currencies"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	baseCurrency := normalizeCurrency(payload.BaseCurrency)
	if payload.BaseCurrency == "" {
		baseCurrency = normalizeCurrency(budget.BaseCurrency)
	}
	if !isValidCurrencyCode(baseCurrency) {
		httpx.Error(w, http.StatusBadRequest, "base_currency must be a 3-letter ISO code")
		return
	}
	codes := make([]string, 0, len(payload.Currencies)+1)
	for _, raw := range payload.Currencies {
		code := normalizeCurrency(raw)
		if !isValidCurrencyCode(code) {
			httpx.Error(w, http.StatusBadRequest, "currency_code must be a 3-letter ISO code")
			return
		}
		codes = appendUniqueCurrency(codes, code)
	}
	codes = appendUniqueCurrency(codes, baseCurrency)
	rates, err := h.fetchLiveCurrencyRates(r.Context(), baseCurrency, codes)
	if err != nil {
		rates = map[string]float64{}
		existingCurrencies, fetchErr := h.fetchBudgetCurrencies(r.Context(), budgetID)
		if fetchErr == nil {
			for _, row := range existingCurrencies {
				if row.RateToBase > 0 {
					rates[row.CurrencyCode] = row.RateToBase
				}
			}
		}
	}
	if rates == nil {
		rates = map[string]float64{}
	}
	for _, code := range codes {
		if rates[code] <= 0 {
			rates[code] = 1
		}
	}
	rates[baseCurrency] = 1
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"base_currency": baseCurrency,
		"currencies":    codes,
		"live_rates":    rates,
	})
}

func (h *Handler) getSummary(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	summary, err := h.buildSummary(r.Context(), budgetID, nil)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to build summary")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, summary)
}

func (h *Handler) calculateScenario(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	var payload struct {
		Overrides map[string]float64 `json:"overrides"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	summary, err := h.buildSummary(r.Context(), budgetID, payload.Overrides)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to calculate scenario")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, summary)
}

func (h *Handler) listScenarios(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	rows, err := h.db.Query(
		r.Context(),
		`SELECT id, budget_id, name, inputs_json, results_json, is_baseline, created_at
         FROM budget_scenarios
         WHERE budget_id = $1
         ORDER BY created_at DESC, id DESC`,
		budgetID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list scenarios")
		return
	}
	defer rows.Close()

	type scenario struct {
		ID          int64          `json:"id"`
		BudgetID    int64          `json:"budget_id"`
		Name        string         `json:"name"`
		InputsJSON  map[string]any `json:"inputs_json"`
		ResultsJSON map[string]any `json:"results_json"`
		IsBaseline  bool           `json:"is_baseline"`
		CreatedAt   time.Time      `json:"created_at"`
	}
	var out []scenario
	for rows.Next() {
		var s scenario
		var inputsRaw []byte
		var resultsRaw []byte
		if err := rows.Scan(&s.ID, &s.BudgetID, &s.Name, &inputsRaw, &resultsRaw, &s.IsBaseline, &s.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse scenario")
			return
		}
		_ = json.Unmarshal(inputsRaw, &s.InputsJSON)
		_ = json.Unmarshal(resultsRaw, &s.ResultsJSON)
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list scenarios")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) createScenario(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	var payload struct {
		Name       string             `json:"name"`
		Overrides  map[string]float64 `json:"overrides"`
		IsBaseline bool               `json:"is_baseline"`
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
	summary, err := h.buildSummary(r.Context(), budgetID, payload.Overrides)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "budget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to calculate scenario")
		return
	}

	inputsJSON, _ := json.Marshal(payload.Overrides)
	resultsJSON, _ := json.Marshal(summary.Scenarios)

	type scenario struct {
		ID         int64     `json:"id"`
		BudgetID   int64     `json:"budget_id"`
		Name       string    `json:"name"`
		IsBaseline bool      `json:"is_baseline"`
		CreatedAt  time.Time `json:"created_at"`
	}
	var created scenario
	if err := h.db.QueryRow(
		r.Context(),
		`INSERT INTO budget_scenarios (budget_id, name, inputs_json, results_json, is_baseline)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, budget_id, name, is_baseline, created_at`,
		budgetID, name, inputsJSON, resultsJSON, payload.IsBaseline,
	).Scan(&created.ID, &created.BudgetID, &created.Name, &created.IsBaseline, &created.CreatedAt); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create scenario")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) deleteScenario(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	scenarioID, ok := parseIDParam(w, r, "scenarioID")
	if !ok {
		return
	}
	tag, err := h.db.Exec(r.Context(), `DELETE FROM budget_scenarios WHERE id = $1 AND budget_id = $2`, scenarioID, budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete scenario")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "scenario not found")
		return
	}
	if err := h.syncAutoAircraftLineItems(r.Context(), budgetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to sync aircraft line items")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) fetchBudgetByEvent(ctx context.Context, eventID int64) (Budget, error) {
	var budget Budget
	err := h.db.QueryRow(
		ctx,
		`SELECT id, event_id, name, base_currency, aircraft_currency, status, notes, created_at, updated_at
         FROM event_budgets
         WHERE event_id = $1`,
		eventID,
	).Scan(&budget.ID, &budget.EventID, &budget.Name, &budget.BaseCurrency, &budget.AircraftCurrency, &budget.Status, &budget.Notes, &budget.CreatedAt, &budget.UpdatedAt)
	return budget, err
}

func (h *Handler) fetchBudget(ctx context.Context, budgetID int64) (Budget, error) {
	var budget Budget
	err := h.db.QueryRow(
		ctx,
		`SELECT id, event_id, name, base_currency, aircraft_currency, status, notes, created_at, updated_at
         FROM event_budgets
         WHERE id = $1`,
		budgetID,
	).Scan(&budget.ID, &budget.EventID, &budget.Name, &budget.BaseCurrency, &budget.AircraftCurrency, &budget.Status, &budget.Notes, &budget.CreatedAt, &budget.UpdatedAt)
	return budget, err
}

func (h *Handler) fetchAssumptions(ctx context.Context, budgetID int64) (map[string]float64, error) {
	values := make(map[string]float64, len(defaultAssumptions))
	for k, v := range defaultAssumptions {
		values[k] = v
	}
	rows, err := h.db.Query(
		ctx,
		`SELECT key, value_num
         FROM budget_assumptions
         WHERE budget_id = $1`,
		budgetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var val *float64
		if err := rows.Scan(&key, &val); err != nil {
			return nil, err
		}
		if _, ok := defaultAssumptions[key]; !ok {
			continue
		}
		if val != nil {
			values[key] = *val
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return values, nil
}

func (h *Handler) fetchBudgetCurrencies(ctx context.Context, budgetID int64) ([]BudgetCurrency, error) {
	rows, err := h.db.Query(
		ctx,
		`SELECT currency_code, rate_to_base
         FROM budget_currencies
         WHERE budget_id = $1
         ORDER BY currency_code ASC`,
		budgetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]BudgetCurrency, 0)
	for rows.Next() {
		var row BudgetCurrency
		if err := rows.Scan(&row.CurrencyCode, &row.RateToBase); err != nil {
			return nil, err
		}
		if row.RateToBase <= 0 {
			row.RateToBase = 1
		}
		list = append(list, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (h *Handler) upsertCurrencyRates(ctx context.Context, budgetID int64, rates map[string]float64) error {
	for code, rate := range rates {
		normalized := normalizeCurrency(code)
		if !isValidCurrencyCode(normalized) || rate <= 0 {
			continue
		}
		if _, err := h.db.Exec(
			ctx,
			`UPDATE budget_currencies
             SET rate_to_base = $3
             WHERE budget_id = $1 AND currency_code = $2`,
			budgetID,
			normalized,
			rate,
		); err != nil {
			return err
		}
	}
	return nil
}

func (h *Handler) isBudgetCurrencyEnabled(ctx context.Context, budgetID int64, currencyCode string) (bool, error) {
	var exists bool
	err := h.db.QueryRow(
		ctx,
		`SELECT EXISTS(
            SELECT 1 FROM budget_currencies
            WHERE budget_id = $1 AND currency_code = $2
         )`,
		budgetID,
		normalizeCurrency(currencyCode),
	).Scan(&exists)
	return exists, err
}

func (h *Handler) buildSummary(ctx context.Context, budgetID int64, overrides map[string]float64) (BudgetSummary, error) {
	if err := h.syncAutoAircraftLineItems(ctx, budgetID); err != nil {
		return BudgetSummary{}, err
	}
	budget, err := h.fetchBudget(ctx, budgetID)
	if err != nil {
		return BudgetSummary{}, err
	}
	assumptions, err := h.fetchAssumptions(ctx, budgetID)
	if err != nil {
		return BudgetSummary{}, err
	}
	for k, v := range overrides {
		assumptions[k] = v
	}
	depositAmount, mainInvoiceAmount, err := h.fetchEventRevenueInputs(ctx, budget.EventID)
	if err != nil {
		return BudgetSummary{}, err
	}
	revenuePerParticipant := roundMoney(depositAmount + mainInvoiceAmount)
	assumptions["deposit_amount"] = depositAmount
	assumptions["main_invoice_amount"] = mainInvoiceAmount

	sectionRows, err := h.db.Query(
		ctx,
		`SELECT id, code, name
         FROM budget_sections
         WHERE budget_id = $1
         ORDER BY sort_order ASC, id ASC`,
		budgetID,
	)
	if err != nil {
		return BudgetSummary{}, err
	}
	defer sectionRows.Close()

	type sectionMeta struct {
		ID   int64
		Code string
		Name string
	}
	sections := make([]sectionMeta, 0)
	for sectionRows.Next() {
		var row sectionMeta
		if err := sectionRows.Scan(&row.ID, &row.Code, &row.Name); err != nil {
			return BudgetSummary{}, err
		}
		sections = append(sections, row)
	}
	if err := sectionRows.Err(); err != nil {
		return BudgetSummary{}, err
	}

	selectedCurrencies, err := h.fetchBudgetCurrencies(ctx, budgetID)
	if err != nil {
		return BudgetSummary{}, err
	}
	currencyCodes := make([]string, 0, len(selectedCurrencies))
	fallbackRates := map[string]float64{}
	for _, row := range selectedCurrencies {
		currencyCodes = append(currencyCodes, row.CurrencyCode)
		fallbackRates[row.CurrencyCode] = row.RateToBase
	}
	liveRates, liveErr := h.fetchLiveCurrencyRates(ctx, budget.BaseCurrency, currencyCodes)
	if liveErr != nil {
		liveRates = fallbackRates
	}
	if liveRates == nil {
		liveRates = map[string]float64{}
	}
	liveRates[budget.BaseCurrency] = 1

	aircraftPricePerMinute := clampNonNegative(assumptions["aircraft_price_per_minute"])
	aircraftCurrency := normalizeCurrency(budget.AircraftCurrency)
	aircraftRateToBase := liveRates[aircraftCurrency]
	if aircraftRateToBase <= 0 {
		aircraftRateToBase = fallbackRates[aircraftCurrency]
	}
	if aircraftRateToBase <= 0 {
		aircraftRateToBase = 1
	}
	toBaseAmount := func(amount float64, rate float64) float64 {
		if rate <= 0 {
			return amount
		}
		return amount / rate
	}
	fullLoadSize := int(clampNonNegative(assumptions["full_load_size"]))
	crewOnLoad := int(clampNonNegative(assumptions["crew_on_load_count"]))
	confirmLoads := int(clampNonNegative(assumptions["confirm_load_count"]))
	plannedLoads := int(clampNonNegative(assumptions["planned_load_count"]))

	confirmParticipants, worstParticipants, plannedParticipants := scenarioParticipantCounts(
		fullLoadSize,
		crewOnLoad,
		confirmLoads,
		plannedLoads,
	)

	confirmAircraftLoads := confirmLoads
	worstAircraftLoads := confirmLoads + 1
	plannedAircraftLoads := plannedLoads

	confirmAircraftMinutes, _, aircraftErr := h.computeAircraftFlightMetrics(
		ctx,
		budget.EventID,
		assumptions,
		confirmAircraftLoads,
	)
	if aircraftErr != nil {
		return BudgetSummary{}, aircraftErr
	}
	worstAircraftMinutes, _, aircraftErr := h.computeAircraftFlightMetrics(
		ctx,
		budget.EventID,
		assumptions,
		worstAircraftLoads,
	)
	if aircraftErr != nil {
		return BudgetSummary{}, aircraftErr
	}
	plannedAircraftMinutes, plannedAircraftDistance, aircraftErr := h.computeAircraftFlightMetrics(
		ctx,
		budget.EventID,
		assumptions,
		plannedAircraftLoads,
	)
	if aircraftErr != nil {
		return BudgetSummary{}, aircraftErr
	}
	confirmAircraftDerivedCost := roundMoney(toBaseAmount(confirmAircraftMinutes*aircraftPricePerMinute, aircraftRateToBase))
	worstAircraftDerivedCost := roundMoney(toBaseAmount(worstAircraftMinutes*aircraftPricePerMinute, aircraftRateToBase))
	plannedAircraftDerivedCost := roundMoney(toBaseAmount(plannedAircraftMinutes*aircraftPricePerMinute, aircraftRateToBase))

	lineRows, err := h.db.Query(
		ctx,
		`SELECT section_id, quantity, unit_cost, cost_currency
         FROM budget_line_items
         WHERE budget_id = $1`,
		budgetID,
	)
	if err != nil {
		return BudgetSummary{}, err
	}
	defer lineRows.Close()
	manualTotalsBySection := map[int64]float64{}
	for lineRows.Next() {
		var sectionID int64
		var quantity float64
		var unitCost float64
		var costCurrency string
		if err := lineRows.Scan(&sectionID, &quantity, &unitCost, &costCurrency); err != nil {
			return BudgetSummary{}, err
		}
		rate := liveRates[normalizeCurrency(costCurrency)]
		if rate <= 0 {
			rate = fallbackRates[normalizeCurrency(costCurrency)]
		}
		if rate <= 0 {
			rate = 1
		}
		manualTotalsBySection[sectionID] += toBaseAmount(quantity*unitCost, rate)
	}
	if err := lineRows.Err(); err != nil {
		return BudgetSummary{}, err
	}

	sectionTotals := make([]map[string]any, 0)
	expectedCost := 0.0
	nonAircraftExpectedCost := 0.0
	aircraftSectionPresent := false
	for _, section := range sections {
		sectionID := section.ID
		code := section.Code
		name := section.Name
		total := manualTotalsBySection[sectionID]
		manualTotal := roundMoney(total)
		total = manualTotal
		sectionData := map[string]any{
			"section_id": sectionID,
			"code":       code,
			"name":       name,
			"total":      total,
		}
		if code == "aircraft" {
			aircraftSectionPresent = true
			total = roundMoney(plannedAircraftDerivedCost)
			sectionData["manual_total"] = manualTotal
			sectionData["derived_total"] = total
			sectionData["air_minutes"] = roundMoney(plannedAircraftMinutes)
			sectionData["air_distance_km"] = roundMoney(plannedAircraftDistance)
			sectionData["aircraft_currency"] = aircraftCurrency
			sectionData["aircraft_rate_to_base"] = roundMoney(aircraftRateToBase)
			sectionData["total"] = total
		} else {
			nonAircraftExpectedCost += total
		}
		sectionTotals = append(sectionTotals, sectionData)
		expectedCost += total
	}
	if !aircraftSectionPresent {
		sectionTotals = append(sectionTotals, map[string]any{
			"section_id":            int64(0),
			"code":                  "aircraft",
			"name":                  "Aircraft",
			"total":                 roundMoney(plannedAircraftDerivedCost),
			"manual_total":          float64(0),
			"derived_total":         roundMoney(plannedAircraftDerivedCost),
			"air_minutes":           roundMoney(plannedAircraftMinutes),
			"air_distance_km":       roundMoney(plannedAircraftDistance),
			"aircraft_currency":     aircraftCurrency,
			"aircraft_rate_to_base": roundMoney(aircraftRateToBase),
		})
		expectedCost += plannedAircraftDerivedCost
	}
	nonAircraftExpectedCost = roundMoney(nonAircraftExpectedCost)
	expectedCost = roundMoney(expectedCost)

	costDriftPercent := clampNonNegative(assumptions["cost_drift_percent"])
	driftAmount := roundMoney(expectedCost * costDriftPercent / 100)
	costWithDrift := roundMoney(expectedCost + driftAmount)

	targetMarkupPercent := clampNonNegative(assumptions["target_markup_percent"])
	markupAmount := roundMoney(costWithDrift * targetMarkupPercent / 100)
	targetRevenue := roundMoney(costWithDrift + markupAmount)

	optionalTipPercent := clampNonNegative(assumptions["optional_tip_percent"])
	optionalTipAmount := roundMoney(targetRevenue * optionalTipPercent / 100)
	revenueWithTip := roundMoney(targetRevenue + optionalTipAmount)
	buildCostWithDrift := func(aircraftDerivedCost float64) (float64, float64) {
		scenarioExpectedCost := roundMoney(nonAircraftExpectedCost + aircraftDerivedCost)
		scenarioDrift := roundMoney(scenarioExpectedCost * costDriftPercent / 100)
		return scenarioExpectedCost, roundMoney(scenarioExpectedCost + scenarioDrift)
	}
	confirmExpectedCost, confirmCostWithDrift := buildCostWithDrift(confirmAircraftDerivedCost)
	worstExpectedCost, worstCostWithDrift := buildCostWithDrift(worstAircraftDerivedCost)
	plannedExpectedCost, plannedCostWithDrift := buildCostWithDrift(plannedAircraftDerivedCost)

	scenarios := map[string]ScenarioSummary{
		"confirm_case": buildScenarioSummary(
			"Confirm",
			confirmParticipants,
			confirmExpectedCost,
			confirmCostWithDrift,
			revenuePerParticipant,
			optionalTipPercent,
		),
		"worst_case_gate": buildScenarioSummary(
			"Worst Case",
			worstParticipants,
			worstExpectedCost,
			worstCostWithDrift,
			revenuePerParticipant,
			optionalTipPercent,
		),
		"planned_capacity_case": buildScenarioSummary(
			"Planned Capacity",
			plannedParticipants,
			plannedExpectedCost,
			plannedCostWithDrift,
			revenuePerParticipant,
			optionalTipPercent,
		),
	}

	curve := make([]MarginPoint, 0)
	start := confirmParticipants
	end := plannedParticipants
	if start > end {
		start, end = end, start
	}
	for p := start; p <= end; p++ {
		revenue := roundMoney(float64(p) * revenuePerParticipant)
		margin := roundMoney(revenue - costWithDrift)
		curve = append(curve, MarginPoint{
			Participants: p,
			Revenue:      revenue,
			Cost:         costWithDrift,
			Margin:       margin,
		})
	}

	return BudgetSummary{
		Budget:                budget,
		Parameters:            assumptions,
		Assumptions:           assumptions,
		SectionTotals:         sectionTotals,
		DepositAmount:         depositAmount,
		MainInvoiceAmount:     mainInvoiceAmount,
		RevenuePerParticipant: revenuePerParticipant,
		ExpectedCost:          expectedCost,
		DriftAmount:           driftAmount,
		CostWithDrift:         costWithDrift,
		MarkupAmount:          markupAmount,
		TargetRevenue:         targetRevenue,
		OptionalTipAmount:     optionalTipAmount,
		RevenueWithTip:        revenueWithTip,
		LiveFXRates:           liveRates,
		Scenarios:             scenarios,
		MarginCurve:           curve,
	}, nil
}

func (h *Handler) fetchEventRevenueInputs(ctx context.Context, eventID int64) (depositAmount float64, mainInvoiceAmount float64, err error) {
	var depositRaw string
	var mainInvoiceRaw string
	if err := h.db.QueryRow(
		ctx,
		`SELECT
            COALESCE(deposit_amount::text, '0'),
            COALESCE(main_invoice_amount::text, '0')
         FROM events
         WHERE id = $1`,
		eventID,
	).Scan(&depositRaw, &mainInvoiceRaw); err != nil {
		return 0, 0, err
	}
	if parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(depositRaw), 64); parseErr == nil {
		depositAmount = parsed
	}
	if parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(mainInvoiceRaw), 64); parseErr == nil {
		mainInvoiceAmount = parsed
	}
	return roundMoney(clampNonNegative(depositAmount)), roundMoney(clampNonNegative(mainInvoiceAmount)), nil
}

func (h *Handler) fetchLiveCurrencyRates(ctx context.Context, baseCurrency string, currencyCodes []string) (map[string]float64, error) {
	base := normalizeCurrency(baseCurrency)
	if !isValidCurrencyCode(base) {
		base = "EUR"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("https://open.er-api.com/v6/latest/%s", base), nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("rate provider returned status %d", resp.StatusCode)
	}
	var payload struct {
		Result string             `json:"result"`
		Rates  map[string]float64 `json:"rates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if len(payload.Rates) == 0 {
		return nil, fmt.Errorf("rate provider returned empty rates")
	}
	result := map[string]float64{base: 1}
	if len(currencyCodes) == 0 {
		for code, rate := range payload.Rates {
			normalized := normalizeCurrency(code)
			if !isValidCurrencyCode(normalized) || rate <= 0 {
				continue
			}
			result[normalized] = rate
		}
		return result, nil
	}
	for _, code := range currencyCodes {
		normalized := normalizeCurrency(code)
		if normalized == base {
			result[normalized] = 1
			continue
		}
		if rate := payload.Rates[normalized]; rate > 0 {
			result[normalized] = rate
		}
	}
	return result, nil
}

func (h *Handler) syncAutoAircraftLineItems(ctx context.Context, budgetID int64) error {
	budget, err := h.fetchBudget(ctx, budgetID)
	if err != nil {
		return err
	}
	assumptions, err := h.fetchAssumptions(ctx, budgetID)
	if err != nil {
		return err
	}

	var aircraftSectionID int64
	if err := h.db.QueryRow(
		ctx,
		`SELECT id
         FROM budget_sections
         WHERE budget_id = $1 AND code = 'aircraft'
         LIMIT 1`,
		budgetID,
	).Scan(&aircraftSectionID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}

	plannedLoadCount := int(clampNonNegative(assumptions["planned_load_count"]))
	aircraftPricePerMinute := roundMoney(clampNonNegative(assumptions["aircraft_price_per_minute"]))
	aircraftCurrency := normalizeCurrency(budget.AircraftCurrency)
	cruisingSpeedKmh := clampNonNegative(assumptions["aircraft_cruising_speed_kmh"])
	if cruisingSpeedKmh <= 0 {
		cruisingSpeedKmh = defaultAssumptions["aircraft_cruising_speed_kmh"]
	}

	type generatedLineItem struct {
		InnhoppID     int64
		Marker        string
		Name          string
		ServiceDate   *time.Time
		LocationLabel string
		Quantity      float64
		UnitCost      float64
		CostCurrency  string
		SortOrder     int
	}

	rows, err := h.db.Query(
		ctx,
		`SELECT id, COALESCE(sequence, 0), COALESCE(name, ''), scheduled_at, COALESCE(distance_by_air, 0)
         FROM event_innhopps
         WHERE event_id = $1
         ORDER BY sequence ASC, id ASC`,
		budget.EventID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	items := make([]generatedLineItem, 0)
	for rows.Next() {
		var innhoppID int64
		var sequence int64
		var name string
		var scheduledAt *time.Time
		var distanceByAirKm float64
		if err := rows.Scan(&innhoppID, &sequence, &name, &scheduledAt, &distanceByAirKm); err != nil {
			return err
		}
		if distanceByAirKm <= 0 || plannedLoadCount <= 0 {
			continue
		}

		roundTripDistanceKm := distanceByAirKm * 2
		roundTripMinutes := (roundTripDistanceKm / cruisingSpeedKmh) * 60
		totalMinutes := roundMoney(roundTripMinutes * float64(plannedLoadCount))
		if totalMinutes <= 0 {
			continue
		}

		displayName := strings.TrimSpace(name)
		if displayName == "" {
			displayName = "Untitled innhopp"
		}
		if sequence > 0 {
			displayName = fmt.Sprintf("#%d %s", sequence, displayName)
		}
		marker := fmt.Sprintf("%s:%d", autoAircraftInnhoppNotePrefix, innhoppID)
		var serviceDate *time.Time
		if scheduledAt != nil {
			day := time.Date(scheduledAt.Year(), scheduledAt.Month(), scheduledAt.Day(), 0, 0, 0, 0, time.UTC)
			serviceDate = &day
		}

		items = append(items, generatedLineItem{
			InnhoppID:     innhoppID,
			Marker:        marker,
			Name:          "Aircraft",
			ServiceDate:   serviceDate,
			LocationLabel: displayName,
			Quantity:      totalMinutes,
			UnitCost:      aircraftPricePerMinute,
			CostCurrency:  aircraftCurrency,
			SortOrder:     len(items),
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	existingRows, err := tx.Query(
		ctx,
		`SELECT id, notes
         FROM budget_line_items
         WHERE budget_id = $1 AND section_id = $2 AND notes LIKE $3`,
		budgetID,
		aircraftSectionID,
		autoAircraftInnhoppNotePrefix+":%",
	)
	if err != nil {
		return err
	}
	defer existingRows.Close()

	existingByMarker := map[string]int64{}
	staleIDs := map[int64]struct{}{}
	for existingRows.Next() {
		var id int64
		var marker string
		if err := existingRows.Scan(&id, &marker); err != nil {
			return err
		}
		existingByMarker[marker] = id
		staleIDs[id] = struct{}{}
	}
	if err := existingRows.Err(); err != nil {
		return err
	}

	for _, item := range items {
		if existingID, ok := existingByMarker[item.Marker]; ok {
			if _, err := tx.Exec(
				ctx,
				`UPDATE budget_line_items
                 SET name = $1, service_date = $2, location_label = $3, quantity = $4, unit_cost = $5,
                     cost_currency = $6, sort_order = $7, innhopp_id = $8, updated_at = NOW()
                 WHERE id = $9`,
				item.Name,
				item.ServiceDate,
				item.LocationLabel,
				item.Quantity,
				item.UnitCost,
				item.CostCurrency,
				item.SortOrder,
				item.InnhoppID,
				existingID,
			); err != nil {
				return err
			}
			delete(staleIDs, existingID)
			continue
		}
		if _, err := tx.Exec(
			ctx,
			`INSERT INTO budget_line_items
                (budget_id, section_id, innhopp_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
			budgetID,
			aircraftSectionID,
			item.InnhoppID,
			item.Name,
			item.ServiceDate,
			item.LocationLabel,
			item.Quantity,
			item.UnitCost,
			item.CostCurrency,
			item.SortOrder,
			item.Marker,
		); err != nil {
			return err
		}
	}

	for staleID := range staleIDs {
		if _, err := tx.Exec(ctx, `DELETE FROM budget_line_items WHERE id = $1`, staleID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (h *Handler) computeAircraftFlightMetrics(ctx context.Context, eventID int64, assumptions map[string]float64, loadCount int) (minutes float64, totalDistance float64, err error) {
	rows, err := h.db.Query(
		ctx,
		`SELECT COALESCE(distance_by_air, 0)
         FROM event_innhopps
         WHERE event_id = $1
         ORDER BY sequence ASC, id ASC`,
		eventID,
	)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	cruisingSpeedKmh := clampNonNegative(assumptions["aircraft_cruising_speed_kmh"])
	if cruisingSpeedKmh <= 0 {
		cruisingSpeedKmh = defaultAssumptions["aircraft_cruising_speed_kmh"]
	}
	if loadCount < 0 {
		loadCount = 0
	}

	aggregateMinutes := 0.0
	aggregateDistance := 0.0
	for rows.Next() {
		var distanceByAirKm float64
		if err := rows.Scan(&distanceByAirKm); err != nil {
			return 0, 0, err
		}
		if distanceByAirKm <= 0 || loadCount <= 0 {
			continue
		}
		// One load is takeoff->innhopp->takeoff, so each load is one round trip.
		roundTripDistanceKm := distanceByAirKm * 2
		aggregateDistance += roundTripDistanceKm * float64(loadCount)
		roundTripMinutes := (roundTripDistanceKm / cruisingSpeedKmh) * 60
		aggregateMinutes += roundTripMinutes * float64(loadCount)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	return aggregateMinutes, aggregateDistance, nil
}
