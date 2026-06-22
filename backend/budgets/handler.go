package budgets

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"sort"
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
	ID           int64     `json:"id"`
	EventID      int64     `json:"event_id"`
	Name         string    `json:"name"`
	BaseCurrency string    `json:"base_currency"`
	Status       string    `json:"status"`
	Notes        string    `json:"notes,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
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
	ID           int64      `json:"id"`
	BudgetID     int64      `json:"budget_id"`
	SectionID    int64      `json:"section_id"`
	InnhoppID    *int64     `json:"innhopp_id,omitempty"`
	SectionCode  string     `json:"section_code,omitempty"`
	SectionName  string     `json:"section_name,omitempty"`
	Name         string     `json:"name"`
	ServiceDate  *time.Time `json:"service_date,omitempty"`
	Description  string     `json:"description,omitempty"`
	Quantity     float64    `json:"quantity"`
	UnitCost     float64    `json:"unit_cost"`
	CostCurrency string     `json:"cost_currency"`
	LineTotal    float64    `json:"line_total"`
	SortOrder    int        `json:"sort_order"`
	Notes        string     `json:"notes,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
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
	ScenarioMetrics       map[string]ScenarioMetrics `json:"scenario_metrics,omitempty"`
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

type ScenarioMetrics struct {
	AircraftCost       float64 `json:"aircraft_cost"`
	AircraftMinutes    float64 `json:"aircraft_minutes"`
	AircraftDistanceKm float64 `json:"aircraft_distance_km"`
	PayableCrewCount   int     `json:"payable_crew_count"`
}

var defaultSections = []struct {
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

var defaultAssumptions = map[string]float64{
	"confirm_participant_count":               12,
	"worst_participant_count":                 13,
	"full_participant_count":                  24,
	"target_markup_percent":                   20,
	"optional_tip_percent":                    8,
	"cost_drift_percent":                      10,
	"budget_method":                           2, // 0=estimates, 1=line_items, 2=hybrid
	"estimate_accommodation_per_person_night": 0,
	"estimate_transport_per_day":              0,
	"estimate_food_per_day":                   0,
	"estimate_staff_salary_per_person_day":    0,
}

var liveCurrencyRatesClient = &http.Client{
	Timeout: 3 * time.Second,
}

var estimateAssumptionKeys = map[string]struct{}{
	"estimate_accommodation_per_person_night": {},
	"estimate_transport_per_day":              {},
	"estimate_food_per_day":                   {},
	"estimate_staff_salary_per_person_day":    {},
}

const autoAircraftInnhoppNotePrefix = "[auto-aircraft-innhopp]"
const autoAircraftMissingDistanceSuffix = ":missing-distance"
const autoAircraftMissingAircraftSuffix = ":missing-aircraft"
const autoAircraftSlotOverflowSuffix = ":slot-overflow"
const autoEstimateLineItemNotePrefix = "[auto-estimate]"
const autoEstimateWarningSuffix = ":estimate-generated"

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

func assumptionCurrencyKey(assumptionKey string) string {
	return assumptionKey + "_currency"
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

type aircraftSlotBand struct {
	MaxDistanceKm  float64
	SlotMultiplier float64
}

type eventAircraftInnhopp struct {
	InnhoppID              int64
	Sequence               int64
	InnhoppName            string
	ServiceDate            *time.Time
	DistanceByAirKm        *float64
	TakeoffAirfieldID      int64
	LandingAirfieldID      int64
	LandingDistanceByAirKm *float64
	AircraftID             *int64
	AircraftName           string
	PricingModel           string
	RateCurrency           string
	Capacity               int
	CrewOnLoadCount        int
	RatePerMinute          *float64
	CruisingSpeedKmh       *float64
	MinimumLoadDuration    *float64
	PricePerSlot           *float64
	SlotBands              []aircraftSlotBand
}

type aircraftComputedMetric struct {
	Quantity        float64
	UnitCost        float64
	CostCurrency    string
	BaseCost        float64
	AirMinutes      float64
	AirDistanceKm   float64
	MissingAircraft bool
	MissingDistance bool
	SlotOverflow    bool
	Valid           bool
}

func pickRateToBase(currency string, liveRates, fallbackRates map[string]float64) float64 {
	rate := liveRates[normalizeCurrency(currency)]
	if rate <= 0 {
		rate = fallbackRates[normalizeCurrency(currency)]
	}
	if rate <= 0 {
		rate = 1
	}
	return rate
}

func toBaseAmount(amount float64, rate float64) float64 {
	if rate <= 0 {
		return amount
	}
	return amount / rate
}

func displayInnhoppLabel(sequence int64, name string) string {
	displayName := strings.TrimSpace(name)
	if displayName == "" {
		displayName = "Untitled innhopp"
	}
	if sequence > 0 {
		return fmt.Sprintf("#%d %s", sequence, displayName)
	}
	return displayName
}

func seatsPerAircraftLoad(capacity int, crewOnLoadCount int) int {
	seats := capacity - crewOnLoadCount
	if seats < 0 {
		return 0
	}
	return seats
}

func aircraftLoadCount(item eventAircraftInnhopp, participantCount int) int {
	if participantCount <= 0 {
		return 0
	}
	seats := seatsPerAircraftLoad(item.Capacity, item.CrewOnLoadCount)
	if seats <= 0 {
		return 0
	}
	return int(math.Ceil(float64(participantCount) / float64(seats)))
}

func (h *Handler) collectBudgetSummaryCurrencyCodes(ctx context.Context, budgetID int64, eventID int64, estimateCurrencies map[string]string, initial []string) ([]string, error) {
	codes := slices.Clone(initial)
	for _, currency := range estimateCurrencies {
		codes = appendUniqueCurrency(codes, currency)
	}

	lineItemRows, err := h.db.Query(
		ctx,
		`SELECT DISTINCT COALESCE(cost_currency, '')
         FROM budget_line_items
         WHERE budget_id = $1`,
		budgetID,
	)
	if err != nil {
		return nil, err
	}
	defer lineItemRows.Close()

	for lineItemRows.Next() {
		var currency string
		if err := lineItemRows.Scan(&currency); err != nil {
			return nil, err
		}
		codes = appendUniqueCurrency(codes, currency)
	}
	if err := lineItemRows.Err(); err != nil {
		return nil, err
	}

	aircraftRows, err := h.fetchAircraftInnhopps(ctx, eventID)
	if err != nil {
		return nil, err
	}
	for _, item := range aircraftRows {
		codes = appendUniqueCurrency(codes, item.RateCurrency)
	}

	return codes, nil
}

func (h *Handler) fetchAircraftInnhopps(ctx context.Context, eventID int64) ([]eventAircraftInnhopp, error) {
	rows, err := h.db.Query(
		ctx,
		`SELECT i.id, COALESCE(i.sequence, 0), COALESCE(i.name, ''), i.scheduled_at,
                i.distance_by_air, COALESCE(i.takeoff_airfield_id, 0), COALESCE(i.landing_airfield_id, 0), i.landing_distance_by_air,
                i.aircraft_id, COALESCE(a.name, ''), COALESCE(a.pricing_model, ''), COALESCE(a.rate_currency, 'EUR'),
                COALESCE(a.capacity, 14), COALESCE(a.crew_on_load_count, 2), a.rate_per_minute, a.cruising_speed_kmh, a.minimum_load_duration, a.price_per_slot
         FROM event_innhopps i
         LEFT JOIN event_aircraft ea ON ea.event_id = i.event_id AND ea.aircraft_id = i.aircraft_id
         LEFT JOIN aircraft a ON a.id = ea.aircraft_id
         WHERE i.event_id = $1
         ORDER BY i.sequence ASC, i.id ASC`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]eventAircraftInnhopp, 0)
	aircraftIDs := make([]int64, 0)
	seenAircraft := map[int64]struct{}{}
	for rows.Next() {
		var item eventAircraftInnhopp
		var scheduledAt sql.NullTime
		var distanceByAir sql.NullFloat64
		var landingDistanceByAir sql.NullFloat64
		var aircraftID sql.NullInt64
		var ratePerMinute sql.NullFloat64
		var cruisingSpeedKmh sql.NullFloat64
		var minimumLoadDuration sql.NullFloat64
		var pricePerSlot sql.NullFloat64
		if err := rows.Scan(
			&item.InnhoppID,
			&item.Sequence,
			&item.InnhoppName,
			&scheduledAt,
			&distanceByAir,
			&item.TakeoffAirfieldID,
			&item.LandingAirfieldID,
			&landingDistanceByAir,
			&aircraftID,
			&item.AircraftName,
			&item.PricingModel,
			&item.RateCurrency,
			&item.Capacity,
			&item.CrewOnLoadCount,
			&ratePerMinute,
			&cruisingSpeedKmh,
			&minimumLoadDuration,
			&pricePerSlot,
		); err != nil {
			return nil, err
		}
		if scheduledAt.Valid {
			day := time.Date(scheduledAt.Time.Year(), scheduledAt.Time.Month(), scheduledAt.Time.Day(), 0, 0, 0, 0, time.UTC)
			item.ServiceDate = &day
		}
		if distanceByAir.Valid {
			val := distanceByAir.Float64
			item.DistanceByAirKm = &val
		}
		if landingDistanceByAir.Valid {
			val := landingDistanceByAir.Float64
			item.LandingDistanceByAirKm = &val
		}
		if aircraftID.Valid {
			val := aircraftID.Int64
			item.AircraftID = &val
			if _, ok := seenAircraft[val]; !ok {
				aircraftIDs = append(aircraftIDs, val)
				seenAircraft[val] = struct{}{}
			}
		}
		if ratePerMinute.Valid {
			val := ratePerMinute.Float64
			item.RatePerMinute = &val
		}
		if cruisingSpeedKmh.Valid {
			val := cruisingSpeedKmh.Float64
			item.CruisingSpeedKmh = &val
		}
		if minimumLoadDuration.Valid {
			val := minimumLoadDuration.Float64
			item.MinimumLoadDuration = &val
		}
		if pricePerSlot.Valid {
			val := pricePerSlot.Float64
			item.PricePerSlot = &val
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(aircraftIDs) == 0 {
		return items, nil
	}

	bandRows, err := h.db.Query(
		ctx,
		`SELECT aircraft_id, max_distance_km, slot_multiplier
         FROM aircraft_slot_pricing_bands
         WHERE aircraft_id = ANY($1)
         ORDER BY aircraft_id ASC, sort_order ASC, id ASC`,
		aircraftIDs,
	)
	if err != nil {
		return nil, err
	}
	defer bandRows.Close()
	bandsByAircraft := map[int64][]aircraftSlotBand{}
	for bandRows.Next() {
		var aircraftID int64
		var band aircraftSlotBand
		if err := bandRows.Scan(&aircraftID, &band.MaxDistanceKm, &band.SlotMultiplier); err != nil {
			return nil, err
		}
		bandsByAircraft[aircraftID] = append(bandsByAircraft[aircraftID], band)
	}
	if err := bandRows.Err(); err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].AircraftID != nil {
			items[i].SlotBands = bandsByAircraft[*items[i].AircraftID]
		}
	}
	return items, nil
}

func computeTimeBasedAircraftMetric(item eventAircraftInnhopp, participantCount int, liveRates, fallbackRates map[string]float64) aircraftComputedMetric {
	loadCount := aircraftLoadCount(item, participantCount)
	if loadCount <= 0 {
		return aircraftComputedMetric{}
	}
	speed := 180.0
	if item.CruisingSpeedKmh != nil && *item.CruisingSpeedKmh > 0 {
		speed = *item.CruisingSpeedKmh
	}
	minLoadDuration := 0.0
	if item.MinimumLoadDuration != nil && *item.MinimumLoadDuration > 0 {
		minLoadDuration = *item.MinimumLoadDuration
	}
	unitCost := 0.0
	if item.RatePerMinute != nil && *item.RatePerMinute > 0 {
		unitCost = roundMoney(*item.RatePerMinute)
	}
	sameAirfield := item.LandingAirfieldID <= 0 || item.LandingAirfieldID == item.TakeoffAirfieldID
	missingDistance := item.TakeoffAirfieldID <= 0 || item.DistanceByAirKm == nil || *item.DistanceByAirKm < 0
	totalDistanceKm := 0.0
	if !missingDistance {
		if sameAirfield {
			totalDistanceKm = *item.DistanceByAirKm * 2 * float64(loadCount)
		} else {
			if item.LandingAirfieldID <= 0 || *item.DistanceByAirKm <= 0 || item.LandingDistanceByAirKm == nil || *item.LandingDistanceByAirKm < 0 {
				missingDistance = true
			} else {
				outboundKm := *item.DistanceByAirKm * float64(loadCount)
				returnToTakeoffKm := *item.DistanceByAirKm * math.Max(float64(loadCount-1), 0)
				finalLandingKm := math.Max(*item.LandingDistanceByAirKm, 0)
				totalDistanceKm = outboundKm + returnToTakeoffKm + finalLandingKm
			}
		}
	}
	totalMinutes := 0.0
	if !missingDistance && totalDistanceKm > 0 {
		totalMinutes = (totalDistanceKm / speed) * 60
	}
	minimumMinutes := minLoadDuration * float64(loadCount)
	if totalMinutes < minimumMinutes {
		totalMinutes = minimumMinutes
	}
	totalMinutes = math.Ceil(totalMinutes)
	if totalMinutes <= 0 {
		return aircraftComputedMetric{}
	}
	rateToBase := pickRateToBase(item.RateCurrency, liveRates, fallbackRates)
	return aircraftComputedMetric{
		Quantity:        totalMinutes,
		UnitCost:        unitCost,
		CostCurrency:    normalizeCurrency(item.RateCurrency),
		BaseCost:        roundMoney(toBaseAmount(totalMinutes*unitCost, rateToBase)),
		AirMinutes:      totalMinutes,
		AirDistanceKm:   totalDistanceKm,
		MissingDistance: missingDistance,
		Valid:           true,
	}
}

func computeSlotBasedAircraftMetric(item eventAircraftInnhopp, participantCount int, liveRates, fallbackRates map[string]float64) aircraftComputedMetric {
	if participantCount <= 0 {
		return aircraftComputedMetric{}
	}
	if item.PricePerSlot == nil || *item.PricePerSlot < 0 || len(item.SlotBands) == 0 {
		return aircraftComputedMetric{}
	}
	if item.DistanceByAirKm == nil || *item.DistanceByAirKm < 0 {
		return aircraftComputedMetric{MissingDistance: true}
	}
	distance := *item.DistanceByAirKm
	selected := item.SlotBands[0]
	found := false
	for _, band := range item.SlotBands {
		selected = band
		if distance <= band.MaxDistanceKm {
			found = true
			break
		}
	}
	slotOverflow := !found
	quantity := roundMoney(float64(participantCount))
	if quantity <= 0 {
		return aircraftComputedMetric{}
	}
	unitCost := roundMoney(*item.PricePerSlot * selected.SlotMultiplier)
	rateToBase := pickRateToBase(item.RateCurrency, liveRates, fallbackRates)
	return aircraftComputedMetric{
		Quantity:      quantity,
		UnitCost:      unitCost,
		CostCurrency:  normalizeCurrency(item.RateCurrency),
		BaseCost:      roundMoney(toBaseAmount(quantity*unitCost, rateToBase)),
		AirDistanceKm: distance * float64(participantCount),
		SlotOverflow:  slotOverflow,
		Valid:         true,
	}
}

func computeAircraftMetric(item eventAircraftInnhopp, participantCount int, liveRates, fallbackRates map[string]float64) aircraftComputedMetric {
	if item.AircraftID == nil || strings.TrimSpace(item.AircraftName) == "" {
		return aircraftComputedMetric{MissingAircraft: true}
	}
	switch strings.ToLower(strings.TrimSpace(item.PricingModel)) {
	case "slot":
		return computeSlotBasedAircraftMetric(item, participantCount, liveRates, fallbackRates)
	default:
		return computeTimeBasedAircraftMetric(item, participantCount, liveRates, fallbackRates)
	}
}

func (h *Handler) computeAircraftScenarioTotals(ctx context.Context, eventID int64, participantCount int, liveRates, fallbackRates map[string]float64) (cost float64, minutes float64, distance float64, crewCount int, currencies []string, err error) {
	items, err := h.fetchAircraftInnhopps(ctx, eventID)
	if err != nil {
		return 0, 0, 0, 0, nil, err
	}
	currencySet := map[string]struct{}{}
	for _, item := range items {
		metric := computeAircraftMetric(item, participantCount, liveRates, fallbackRates)
		if !metric.Valid {
			continue
		}
		cost += metric.BaseCost
		minutes += metric.AirMinutes
		distance += metric.AirDistanceKm
		crewCount += aircraftLoadCount(item, participantCount) * max(item.CrewOnLoadCount, 0)
		if metric.CostCurrency != "" {
			currencySet[metric.CostCurrency] = struct{}{}
		}
	}
	cost = roundMoney(cost)
	minutes = roundMoney(minutes)
	distance = roundMoney(distance)
	for currency := range currencySet {
		currencies = append(currencies, currency)
	}
	sort.Strings(currencies)
	return cost, minutes, distance, crewCount, currencies, nil
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
		Name         string `json:"name"`
		BaseCurrency string `json:"base_currency"`
		Notes        string `json:"notes"`
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
		`INSERT INTO event_budgets (event_id, name, base_currency, status, notes)
         VALUES ($1, $2, $3, 'draft', $4)
         RETURNING id, event_id, name, base_currency, status, notes, created_at, updated_at`,
		eventID,
		strings.TrimSpace(payload.Name),
		baseCurrency,
		strings.TrimSpace(payload.Notes),
	).Scan(&budget.ID, &budget.EventID, &budget.Name, &budget.BaseCurrency, &budget.Status, &budget.Notes, &budget.CreatedAt, &budget.UpdatedAt)
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
		Name         *string `json:"name"`
		BaseCurrency *string `json:"base_currency"`
		Status       *string `json:"status"`
		Notes        *string `json:"notes"`
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
	status := current.Status
	if payload.Status != nil {
		status = strings.TrimSpace(*payload.Status)
	}
	notes := current.Notes
	if payload.Notes != nil {
		notes = strings.TrimSpace(*payload.Notes)
	}

	if current.Status == "draft" && status == "review" {
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
         SET name = $1, base_currency = $2, status = $3, notes = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, event_id, name, base_currency, status, notes, created_at, updated_at`,
		name, baseCurrency, status, notes, budgetID,
	).Scan(&updated.ID, &updated.EventID, &updated.Name, &updated.BaseCurrency, &updated.Status, &updated.Notes, &updated.CreatedAt, &updated.UpdatedAt); err != nil {
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
		`SELECT li.id, li.budget_id, li.section_id, s.code, s.name, li.name, li.service_date, COALESCE(li.location_label, ''),
                li.innhopp_id, li.quantity, li.unit_cost, li.cost_currency, li.sort_order, li.notes, li.created_at, li.updated_at
         FROM budget_line_items li
         JOIN budget_sections s ON s.id = li.section_id
         WHERE li.budget_id = $1
         ORDER BY li.service_date ASC NULLS LAST, s.sort_order ASC, li.sort_order ASC, li.id ASC`,
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
			&item.ID, &item.BudgetID, &item.SectionID, &item.SectionCode, &item.SectionName, &item.Name, &item.ServiceDate, &item.Description,
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
		Description   string  `json:"description"`
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

	description := strings.TrimSpace(payload.Description)
	if description == "" {
		description = strings.TrimSpace(payload.LocationLabel)
	}

	var item BudgetLineItem
	err := h.db.QueryRow(
		r.Context(),
		`INSERT INTO budget_line_items (budget_id, section_id, innhopp_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, budget_id, section_id, innhopp_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes, created_at, updated_at`,
		budgetID, payload.SectionID, payload.InnhoppID, strings.TrimSpace(payload.Name), serviceDate, description, quantity, unitCost, costCurrency, payload.SortOrder, strings.TrimSpace(payload.Notes),
	).Scan(&item.ID, &item.BudgetID, &item.SectionID, &item.InnhoppID, &item.Name, &item.ServiceDate, &item.Description, &item.Quantity, &item.UnitCost, &item.CostCurrency, &item.SortOrder, &item.Notes, &item.CreatedAt, &item.UpdatedAt)
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
		Description   string  `json:"description"`
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

	description := strings.TrimSpace(payload.Description)
	if description == "" {
		description = strings.TrimSpace(payload.LocationLabel)
	}

	var item BudgetLineItem
	err := h.db.QueryRow(
		r.Context(),
		`UPDATE budget_line_items
         SET section_id = $1, innhopp_id = $2, name = $3, service_date = $4, location_label = $5, quantity = $6, unit_cost = $7, cost_currency = $8, sort_order = $9, notes = $10, updated_at = NOW()
         WHERE id = $11 AND budget_id = $12
         RETURNING id, budget_id, section_id, innhopp_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes, created_at, updated_at`,
		payload.SectionID, payload.InnhoppID, strings.TrimSpace(payload.Name), serviceDate, description, quantity, unitCost, costCurrency, payload.SortOrder, strings.TrimSpace(payload.Notes), lineItemID, budgetID,
	).Scan(&item.ID, &item.BudgetID, &item.SectionID, &item.InnhoppID, &item.Name, &item.ServiceDate, &item.Description, &item.Quantity, &item.UnitCost, &item.CostCurrency, &item.SortOrder, &item.Notes, &item.CreatedAt, &item.UpdatedAt)
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
	assumptions, estimateCurrencies, err := h.fetchAssumptionsWithEstimateCurrencies(r.Context(), budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load assumptions")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"values":              assumptions,
		"parameters":          assumptions,
		"estimate_currencies": estimateCurrencies,
	})
}

func (h *Handler) updateAssumptions(w http.ResponseWriter, r *http.Request) {
	budgetID, ok := parseIDParam(w, r, "budgetID")
	if !ok {
		return
	}
	var payload struct {
		Values             map[string]float64 `json:"values"`
		EstimateCurrencies map[string]string  `json:"estimate_currencies"`
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
	for key, currency := range payload.EstimateCurrencies {
		if _, ok := estimateAssumptionKeys[key]; !ok {
			continue
		}
		normalizedCurrency := normalizeCurrency(currency)
		if !isValidCurrencyCode(normalizedCurrency) {
			httpx.Error(w, http.StatusBadRequest, key+"_currency must be a 3-letter ISO code")
			return
		}
		if _, err := tx.Exec(
			r.Context(),
			`INSERT INTO budget_assumptions (budget_id, key, value_text)
             VALUES ($1, $2, $3)
             ON CONFLICT (budget_id, key)
             DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = NOW()`,
			budgetID, assumptionCurrencyKey(key), normalizedCurrency,
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
	updated, estimateCurrencies, err := h.fetchAssumptionsWithEstimateCurrencies(r.Context(), budgetID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load assumptions")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"values":              updated,
		"parameters":          updated,
		"estimate_currencies": estimateCurrencies,
	})
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
	codes = appendUniqueCurrency(codes, baseCurrency)
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
		"base_currency": budget.BaseCurrency,
		"currencies":    codes,
		"live_rates":    rates,
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
	if !seen[baseCurrency] {
		normalized = append(normalized, BudgetCurrency{CurrencyCode: baseCurrency})
		seen[baseCurrency] = true
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
		"base_currency": budget.BaseCurrency,
		"currencies":    codes,
		"live_rates":    rates,
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
		`SELECT id, event_id, name, base_currency, status, notes, created_at, updated_at
         FROM event_budgets
         WHERE event_id = $1`,
		eventID,
	).Scan(&budget.ID, &budget.EventID, &budget.Name, &budget.BaseCurrency, &budget.Status, &budget.Notes, &budget.CreatedAt, &budget.UpdatedAt)
	return budget, err
}

func (h *Handler) fetchBudget(ctx context.Context, budgetID int64) (Budget, error) {
	var budget Budget
	err := h.db.QueryRow(
		ctx,
		`SELECT id, event_id, name, base_currency, status, notes, created_at, updated_at
         FROM event_budgets
         WHERE id = $1`,
		budgetID,
	).Scan(&budget.ID, &budget.EventID, &budget.Name, &budget.BaseCurrency, &budget.Status, &budget.Notes, &budget.CreatedAt, &budget.UpdatedAt)
	return budget, err
}

func (h *Handler) fetchAssumptionsWithEstimateCurrencies(ctx context.Context, budgetID int64) (map[string]float64, map[string]string, error) {
	values := make(map[string]float64, len(defaultAssumptions))
	for k, v := range defaultAssumptions {
		values[k] = v
	}
	estimateCurrencies := make(map[string]string, len(estimateAssumptionKeys))
	rows, err := h.db.Query(
		ctx,
		`SELECT key, value_num, value_text
         FROM budget_assumptions
         WHERE budget_id = $1`,
		budgetID,
	)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var val *float64
		var valueText *string
		if err := rows.Scan(&key, &val, &valueText); err != nil {
			return nil, nil, err
		}
		for estimateKey := range estimateAssumptionKeys {
			if key == assumptionCurrencyKey(estimateKey) {
				if valueText != nil {
					estimateCurrencies[estimateKey] = normalizeCurrency(*valueText)
				}
				goto nextRow
			}
		}
		if _, ok := defaultAssumptions[key]; !ok {
			goto nextRow
		}
		if val != nil {
			values[key] = *val
		}
	nextRow:
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	return values, estimateCurrencies, nil
}

func (h *Handler) fetchAssumptions(ctx context.Context, budgetID int64) (map[string]float64, error) {
	values, _, err := h.fetchAssumptionsWithEstimateCurrencies(ctx, budgetID)
	return values, err
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
	budget, err := h.fetchBudget(ctx, budgetID)
	if err != nil {
		return BudgetSummary{}, err
	}
	assumptions, estimateCurrencies, err := h.fetchAssumptionsWithEstimateCurrencies(ctx, budgetID)
	if err != nil {
		return BudgetSummary{}, err
	}
	for k, v := range overrides {
		assumptions[k] = v
	}
	depositAmount, mainInvoiceAmount, eventCurrency, err := h.fetchEventRevenueInputs(ctx, budget.EventID)
	if err != nil {
		return BudgetSummary{}, err
	}

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
	eventCurrency = normalizeCurrency(eventCurrency)
	if eventCurrency != "" && eventCurrency != budget.BaseCurrency {
		foundEventCurrency := false
		for _, code := range currencyCodes {
			if code == eventCurrency {
				foundEventCurrency = true
				break
			}
		}
		if !foundEventCurrency {
			currencyCodes = append(currencyCodes, eventCurrency)
		}
	}
	currencyCodes, err = h.collectBudgetSummaryCurrencyCodes(ctx, budgetID, budget.EventID, estimateCurrencies, currencyCodes)
	if err != nil {
		return BudgetSummary{}, err
	}
	liveRates, liveErr := h.fetchLiveCurrencyRates(ctx, budget.BaseCurrency, currencyCodes)
	if liveErr != nil {
		liveRates = fallbackRates
	}
	if liveRates == nil {
		liveRates = map[string]float64{}
	}
	liveRates[budget.BaseCurrency] = 1
	toBaseAmountFromCurrency := func(amount float64, sourceCurrency string) float64 {
		rate := liveRates[normalizeCurrency(sourceCurrency)]
		if rate <= 0 {
			rate = fallbackRates[normalizeCurrency(sourceCurrency)]
		}
		if rate <= 0 {
			rate = 1
		}
		return amount / rate
	}
	depositAmountBase := roundMoney(toBaseAmountFromCurrency(depositAmount, eventCurrency))
	mainInvoiceAmountBase := roundMoney(toBaseAmountFromCurrency(mainInvoiceAmount, eventCurrency))
	revenuePerParticipant := roundMoney(depositAmountBase + mainInvoiceAmountBase)
	assumptions["deposit_amount"] = depositAmountBase
	assumptions["main_invoice_amount"] = mainInvoiceAmountBase

	confirmParticipantsInput := int(clampNonNegative(assumptions["confirm_participant_count"]))
	worstParticipantsInput := int(clampNonNegative(assumptions["worst_participant_count"]))
	fullParticipantsInput := int(clampNonNegative(assumptions["full_participant_count"]))

	confirmParticipants, worstParticipants, fullParticipants := scenarioParticipantCounts(
		confirmParticipantsInput,
		worstParticipantsInput,
		fullParticipantsInput,
	)

	confirmAircraftDerivedCost, confirmAircraftMinutes, confirmAircraftDistance, confirmCrewCount, _, aircraftErr := h.computeAircraftScenarioTotals(
		ctx,
		budget.EventID,
		confirmParticipants,
		liveRates,
		fallbackRates,
	)
	if aircraftErr != nil {
		return BudgetSummary{}, aircraftErr
	}
	worstAircraftDerivedCost, worstAircraftMinutes, worstAircraftDistance, worstCrewCount, _, aircraftErr := h.computeAircraftScenarioTotals(
		ctx,
		budget.EventID,
		worstParticipants,
		liveRates,
		fallbackRates,
	)
	if aircraftErr != nil {
		return BudgetSummary{}, aircraftErr
	}
	fullAircraftDerivedCost, fullAircraftMinutes, fullAircraftDistance, fullCrewCount, _, aircraftErr := h.computeAircraftScenarioTotals(
		ctx,
		budget.EventID,
		fullParticipants,
		liveRates,
		fallbackRates,
	)
	if aircraftErr != nil {
		return BudgetSummary{}, aircraftErr
	}
	lineRows, err := h.db.Query(
		ctx,
		`SELECT section_id, quantity, unit_cost, cost_currency, service_date, COALESCE(notes, '')
         FROM budget_line_items
         WHERE budget_id = $1`,
		budgetID,
	)
	if err != nil {
		return BudgetSummary{}, err
	}
	defer lineRows.Close()
	manualTotalsBySection := map[int64]float64{}
	manualNonAircraftByDate := map[string]float64{}
	manualNonAircraftWithoutDate := 0.0
	nonAircraftLineItemCountByCode := map[string]int{}
	nonAircraftDaysByCode := map[string]map[string]bool{}
	sectionCodeByID := map[int64]string{}
	for _, section := range sections {
		sectionCodeByID[section.ID] = section.Code
	}
	for lineRows.Next() {
		var sectionID int64
		var quantity float64
		var unitCost float64
		var costCurrency string
		var serviceDate *time.Time
		var notes string
		if err := lineRows.Scan(&sectionID, &quantity, &unitCost, &costCurrency, &serviceDate, &notes); err != nil {
			return BudgetSummary{}, err
		}
		if strings.HasPrefix(notes, autoEstimateLineItemNotePrefix+":") {
			continue
		}
		rate := liveRates[normalizeCurrency(costCurrency)]
		if rate <= 0 {
			rate = fallbackRates[normalizeCurrency(costCurrency)]
		}
		if rate <= 0 {
			rate = 1
		}
		baseAmount := toBaseAmount(quantity*unitCost, rate)
		manualTotalsBySection[sectionID] += baseAmount
		sectionCode := sectionCodeByID[sectionID]
		if sectionCode == "aircraft" {
			continue
		}
		nonAircraftLineItemCountByCode[sectionCode]++
		if serviceDate != nil {
			dayKey := serviceDate.UTC().Format("2006-01-02")
			if nonAircraftDaysByCode[sectionCode] == nil {
				nonAircraftDaysByCode[sectionCode] = map[string]bool{}
			}
			nonAircraftDaysByCode[sectionCode][dayKey] = true
			manualNonAircraftByDate[dayKey] += baseAmount
		} else {
			manualNonAircraftWithoutDate += baseAmount
		}
	}
	if err := lineRows.Err(); err != nil {
		return BudgetSummary{}, err
	}
	manualNonAircraftWithoutDate = roundMoney(manualNonAircraftWithoutDate)

	eventDurationDays, err := h.fetchEventDurationDays(ctx, budget.EventID)
	if err != nil {
		return BudgetSummary{}, err
	}

	budgetMethod := int(math.Round(clampNonNegative(assumptions["budget_method"])))
	if budgetMethod > 2 {
		budgetMethod = 2
	}
	estimateAccommodationPerPersonNight := clampNonNegative(toBaseAmountFromCurrency(
		assumptions["estimate_accommodation_per_person_night"],
		estimateCurrencies["estimate_accommodation_per_person_night"],
	))
	estimateTransportPerDay := clampNonNegative(toBaseAmountFromCurrency(
		assumptions["estimate_transport_per_day"],
		estimateCurrencies["estimate_transport_per_day"],
	))
	estimateFoodPerDay := clampNonNegative(toBaseAmountFromCurrency(
		assumptions["estimate_food_per_day"],
		estimateCurrencies["estimate_food_per_day"],
	))
	estimateStaffSalaryPerPersonDay := clampNonNegative(toBaseAmountFromCurrency(
		assumptions["estimate_staff_salary_per_person_day"],
		estimateCurrencies["estimate_staff_salary_per_person_day"],
	))
	buildEstimatedDailyNonAircraftCost := func(participants int, crewCount int) float64 {
		return roundMoney(
			estimateAccommodationPerPersonNight*float64(participants) +
				estimateFoodPerDay*float64(participants) +
				estimateTransportPerDay +
				estimateStaffSalaryPerPersonDay*float64(crewCount),
		)
	}
	datedManualTotal := 0.0
	for _, amount := range manualNonAircraftByDate {
		datedManualTotal += amount
	}
	datedManualTotal = roundMoney(datedManualTotal)
	manualNonAircraftTotal := roundMoney(manualNonAircraftWithoutDate + datedManualTotal)
	buildEstimatedNonAircraftTotal := func(participants int, crewCount int, dayCount int) float64 {
		daily := buildEstimatedDailyNonAircraftCost(participants, crewCount)
		return roundMoney(daily * float64(dayCount))
	}
	buildHybridFallbackEstimateTotal := func(participants int, crewCount int, dayCount int) float64 {
		total := 0.0
		foodAccommodationMissingDays := dayCount - len(nonAircraftDaysByCode["food_accommodation"])
		transportMissingDays := dayCount - len(nonAircraftDaysByCode["transport_activities"])
		crewMissingDays := dayCount - len(nonAircraftDaysByCode["payable_crew"])
		if foodAccommodationMissingDays < 0 {
			foodAccommodationMissingDays = 0
		}
		if transportMissingDays < 0 {
			transportMissingDays = 0
		}
		if crewMissingDays < 0 {
			crewMissingDays = 0
		}
		// Accommodation and food both correspond to the Food & Accommodation section.
		if foodAccommodationMissingDays > 0 {
			total += estimateAccommodationPerPersonNight * float64(participants) * float64(foodAccommodationMissingDays)
			total += estimateFoodPerDay * float64(participants) * float64(foodAccommodationMissingDays)
		}
		if transportMissingDays > 0 {
			total += estimateTransportPerDay * float64(transportMissingDays)
		}
		if crewMissingDays > 0 {
			total += estimateStaffSalaryPerPersonDay * float64(crewCount) * float64(crewMissingDays)
		}
		return roundMoney(total)
	}
	buildHybridNonAircraftTotal := func(participants int, crewCount int) float64 {
		fallbackEstimateTotal := buildHybridFallbackEstimateTotal(participants, crewCount, eventDurationDays)
		return roundMoney(manualNonAircraftTotal + fallbackEstimateTotal)
	}
	buildSectionEstimateTotal := func(sectionCode string, participants int, crewCount int, dayCount int) float64 {
		switch sectionCode {
		case "food_accommodation":
			return roundMoney((estimateAccommodationPerPersonNight + estimateFoodPerDay) * float64(participants) * float64(dayCount))
		case "transport_activities":
			return roundMoney(estimateTransportPerDay * float64(dayCount))
		case "payable_crew":
			return roundMoney(estimateStaffSalaryPerPersonDay * float64(crewCount) * float64(dayCount))
		default:
			return 0
		}
	}
	buildHybridSectionTotal := func(sectionCode string, manualTotal float64, participants int, crewCount int) float64 {
		if sectionCode == "aircraft" {
			return manualTotal
		}
		missingDays := eventDurationDays - len(nonAircraftDaysByCode[sectionCode])
		if missingDays < 0 {
			missingDays = 0
		}
		return roundMoney(manualTotal + buildSectionEstimateTotal(sectionCode, participants, crewCount, missingDays))
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
			total = roundMoney(fullAircraftDerivedCost)
			sectionData["manual_total"] = manualTotal
			sectionData["derived_total"] = total
			sectionData["air_minutes"] = roundMoney(fullAircraftMinutes)
			sectionData["air_distance_km"] = roundMoney(fullAircraftDistance)
			sectionData["total"] = total
		} else {
			switch budgetMethod {
			case 0: // estimates
				total = buildSectionEstimateTotal(code, fullParticipants, fullCrewCount, eventDurationDays)
			case 2: // hybrid
				total = buildHybridSectionTotal(code, manualTotal, fullParticipants, fullCrewCount)
			default: // line items
				total = manualTotal
			}
			sectionData["total"] = total
			nonAircraftExpectedCost += total
		}
		sectionTotals = append(sectionTotals, sectionData)
		expectedCost += total
	}
	if !aircraftSectionPresent {
		sectionTotals = append(sectionTotals, map[string]any{
			"section_id":      int64(0),
			"code":            "aircraft",
			"name":            "Aircraft",
			"total":           roundMoney(fullAircraftDerivedCost),
			"manual_total":    float64(0),
			"derived_total":   roundMoney(fullAircraftDerivedCost),
			"air_minutes":     roundMoney(fullAircraftMinutes),
			"air_distance_km": roundMoney(fullAircraftDistance),
		})
		expectedCost += fullAircraftDerivedCost
	}
	switch budgetMethod {
	case 0: // estimates
		nonAircraftExpectedCost = buildEstimatedNonAircraftTotal(fullParticipants, fullCrewCount, eventDurationDays)
	case 1: // line items
		nonAircraftExpectedCost = roundMoney(nonAircraftExpectedCost)
	default: // hybrid
		nonAircraftExpectedCost = buildHybridNonAircraftTotal(fullParticipants, fullCrewCount)
	}
	expectedCost = roundMoney(nonAircraftExpectedCost + fullAircraftDerivedCost)

	costDriftPercent := clampNonNegative(assumptions["cost_drift_percent"])
	driftAmount := roundMoney(expectedCost * costDriftPercent / 100)
	costWithDrift := roundMoney(expectedCost + driftAmount)

	targetMarkupPercent := clampNonNegative(assumptions["target_markup_percent"])
	markupAmount := roundMoney(costWithDrift * targetMarkupPercent / 100)
	targetRevenue := roundMoney(costWithDrift + markupAmount)

	optionalTipPercent := clampNonNegative(assumptions["optional_tip_percent"])
	optionalTipAmount := roundMoney(targetRevenue * optionalTipPercent / 100)
	revenueWithTip := roundMoney(targetRevenue + optionalTipAmount)
	buildScenarioNonAircraftCost := func(participants int, crewCount int) float64 {
		switch budgetMethod {
		case 0: // estimates
			return buildEstimatedNonAircraftTotal(participants, crewCount, eventDurationDays)
		case 1: // line items
			return nonAircraftExpectedCost
		default: // hybrid
			return buildHybridNonAircraftTotal(participants, crewCount)
		}
	}
	buildCostWithDrift := func(participants int, crewCount int, aircraftDerivedCost float64) (float64, float64) {
		scenarioExpectedCost := roundMoney(buildScenarioNonAircraftCost(participants, crewCount) + aircraftDerivedCost)
		scenarioDrift := roundMoney(scenarioExpectedCost * costDriftPercent / 100)
		return scenarioExpectedCost, roundMoney(scenarioExpectedCost + scenarioDrift)
	}
	confirmExpectedCost, confirmCostWithDrift := buildCostWithDrift(confirmParticipants, confirmCrewCount, confirmAircraftDerivedCost)
	worstExpectedCost, worstCostWithDrift := buildCostWithDrift(worstParticipants, worstCrewCount, worstAircraftDerivedCost)
	fullExpectedCost, fullCostWithDrift := buildCostWithDrift(fullParticipants, fullCrewCount, fullAircraftDerivedCost)

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
		"full_capacity_case": buildScenarioSummary(
			"Full Capacity",
			fullParticipants,
			fullExpectedCost,
			fullCostWithDrift,
			revenuePerParticipant,
			optionalTipPercent,
		),
	}

	curve := make([]MarginPoint, 0)
	start := confirmParticipants
	end := fullParticipants
	if worstParticipants < start {
		start = worstParticipants
	}
	if worstParticipants > end {
		end = worstParticipants
	}
	if start > end {
		start, end = end, start
	}
	curveCostAnchors := []struct {
		participants  int
		costWithDrift float64
	}{
		{participants: confirmParticipants, costWithDrift: confirmCostWithDrift},
		{participants: worstParticipants, costWithDrift: worstCostWithDrift},
		{participants: fullParticipants, costWithDrift: fullCostWithDrift},
	}
	sort.Slice(curveCostAnchors, func(i, j int) bool {
		return curveCostAnchors[i].participants < curveCostAnchors[j].participants
	})
	interpolateCostWithDrift := func(participants int) float64 {
		if len(curveCostAnchors) == 0 {
			return costWithDrift
		}
		if participants <= curveCostAnchors[0].participants {
			return curveCostAnchors[0].costWithDrift
		}
		last := curveCostAnchors[len(curveCostAnchors)-1]
		if participants >= last.participants {
			return last.costWithDrift
		}
		for i := 0; i < len(curveCostAnchors)-1; i++ {
			left := curveCostAnchors[i]
			right := curveCostAnchors[i+1]
			if participants < left.participants || participants > right.participants {
				continue
			}
			span := right.participants - left.participants
			if span <= 0 {
				return left.costWithDrift
			}
			ratio := float64(participants-left.participants) / float64(span)
			return roundMoney(left.costWithDrift + (right.costWithDrift-left.costWithDrift)*ratio)
		}
		return costWithDrift
	}
	for p := start; p <= end; p++ {
		revenue := roundMoney(float64(p) * revenuePerParticipant)
		scenarioCostWithDrift := interpolateCostWithDrift(p)
		margin := roundMoney(revenue - scenarioCostWithDrift)
		curve = append(curve, MarginPoint{
			Participants: p,
			Revenue:      revenue,
			Cost:         scenarioCostWithDrift,
			Margin:       margin,
		})
	}

	return BudgetSummary{
		Budget:      budget,
		Parameters:  assumptions,
		Assumptions: assumptions,
		ScenarioMetrics: map[string]ScenarioMetrics{
			"confirm_case": {
				AircraftCost:       confirmAircraftDerivedCost,
				AircraftMinutes:    confirmAircraftMinutes,
				AircraftDistanceKm: confirmAircraftDistance,
				PayableCrewCount:   confirmCrewCount,
			},
			"worst_case_gate": {
				AircraftCost:       worstAircraftDerivedCost,
				AircraftMinutes:    worstAircraftMinutes,
				AircraftDistanceKm: worstAircraftDistance,
				PayableCrewCount:   worstCrewCount,
			},
			"full_capacity_case": {
				AircraftCost:       fullAircraftDerivedCost,
				AircraftMinutes:    fullAircraftMinutes,
				AircraftDistanceKm: fullAircraftDistance,
				PayableCrewCount:   fullCrewCount,
			},
		},
		SectionTotals:         sectionTotals,
		DepositAmount:         depositAmountBase,
		MainInvoiceAmount:     mainInvoiceAmountBase,
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

func (h *Handler) fetchEventRevenueInputs(ctx context.Context, eventID int64) (depositAmount float64, mainInvoiceAmount float64, currency string, err error) {
	var depositRaw string
	var mainInvoiceRaw string
	var eventCurrency string
	if err := h.db.QueryRow(
		ctx,
		`SELECT
            COALESCE(deposit_amount::text, '0'),
            COALESCE(main_invoice_amount::text, '0'),
            COALESCE(currency, 'EUR')
         FROM events
         WHERE id = $1`,
		eventID,
	).Scan(&depositRaw, &mainInvoiceRaw, &eventCurrency); err != nil {
		return 0, 0, "", err
	}
	if parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(depositRaw), 64); parseErr == nil {
		depositAmount = parsed
	}
	if parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(mainInvoiceRaw), 64); parseErr == nil {
		mainInvoiceAmount = parsed
	}
	return roundMoney(clampNonNegative(depositAmount)), roundMoney(clampNonNegative(mainInvoiceAmount)), normalizeCurrency(eventCurrency), nil
}

func (h *Handler) fetchEventDurationDays(ctx context.Context, eventID int64) (int, error) {
	var startsAt time.Time
	var endsAt *time.Time
	if err := h.db.QueryRow(
		ctx,
		`SELECT starts_at, ends_at
         FROM events
         WHERE id = $1`,
		eventID,
	).Scan(&startsAt, &endsAt); err != nil {
		return 1, err
	}
	startDate := startsAt.UTC().Truncate(24 * time.Hour)
	endDate := startDate
	if endsAt != nil {
		endDate = endsAt.UTC().Truncate(24 * time.Hour)
	}
	if endDate.Before(startDate) {
		endDate = startDate
	}
	days := int(endDate.Sub(startDate)/(24*time.Hour)) + 1
	if days < 1 {
		return 1, nil
	}
	return days, nil
}

func (h *Handler) fetchLiveCurrencyRates(ctx context.Context, baseCurrency string, currencyCodes []string) (map[string]float64, error) {
	base := normalizeCurrency(baseCurrency)
	if !isValidCurrencyCode(base) {
		base = "EUR"
	}
	ratesCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ratesCtx, http.MethodGet, fmt.Sprintf("https://open.er-api.com/v6/latest/%s", base), nil)
	if err != nil {
		return nil, err
	}
	resp, err := liveCurrencyRatesClient.Do(req)
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

	_, _, fullParticipants := scenarioParticipantCounts(
		int(clampNonNegative(assumptions["confirm_participant_count"])),
		int(clampNonNegative(assumptions["worst_participant_count"])),
		int(clampNonNegative(assumptions["full_participant_count"])),
	)
	liveRates, _ := h.fetchLiveCurrencyRates(ctx, budget.BaseCurrency, nil)
	if liveRates == nil {
		liveRates = map[string]float64{}
	}
	fallbackRates := map[string]float64{budget.BaseCurrency: 1}

	type generatedLineItem struct {
		InnhoppID       int64
		Marker          string
		MissingDistance bool
		MissingAircraft bool
		SlotOverflow    bool
		Name            string
		ServiceDate     *time.Time
		LocationLabel   string
		Quantity        float64
		UnitCost        float64
		CostCurrency    string
		SortOrder       int
	}

	rows, err := h.fetchAircraftInnhopps(ctx, budget.EventID)
	if err != nil {
		return err
	}

	overrideRows, err := h.db.Query(
		ctx,
		`SELECT schedule_item_id
         FROM schedule_item_costs
         WHERE event_id = $1
           AND schedule_item_type = 'innhopp'
           AND status = 'expected'`,
		budget.EventID,
	)
	if err != nil {
		return err
	}
	defer overrideRows.Close()

	overrideInnhoppIDs := map[int64]struct{}{}
	for overrideRows.Next() {
		var scheduleItemID int64
		if err := overrideRows.Scan(&scheduleItemID); err != nil {
			return err
		}
		overrideInnhoppIDs[scheduleItemID] = struct{}{}
	}
	if err := overrideRows.Err(); err != nil {
		return err
	}

	items := make([]generatedLineItem, 0)
	for _, row := range rows {
		if fullParticipants <= 0 {
			continue
		}
		if _, overridden := overrideInnhoppIDs[row.InnhoppID]; overridden {
			continue
		}
		metric := computeAircraftMetric(row, fullParticipants, liveRates, fallbackRates)
		if !metric.Valid {
			continue
		}
		marker := fmt.Sprintf("%s:%d", autoAircraftInnhoppNotePrefix, row.InnhoppID)
		if metric.MissingDistance {
			marker += autoAircraftMissingDistanceSuffix
		}
		if metric.MissingAircraft {
			marker += autoAircraftMissingAircraftSuffix
		}
		if metric.SlotOverflow {
			marker += autoAircraftSlotOverflowSuffix
		}
		displayName := displayInnhoppLabel(row.Sequence, row.InnhoppName)
		lineName := strings.TrimSpace(row.AircraftName)
		if lineName == "" {
			lineName = "Aircraft"
		}
		items = append(items, generatedLineItem{
			InnhoppID:       row.InnhoppID,
			Marker:          marker,
			MissingDistance: metric.MissingDistance,
			MissingAircraft: metric.MissingAircraft,
			SlotOverflow:    metric.SlotOverflow,
			Name:            lineName,
			ServiceDate:     row.ServiceDate,
			LocationLabel:   displayName,
			Quantity:        metric.Quantity,
			UnitCost:        metric.UnitCost,
			CostCurrency:    metric.CostCurrency,
			SortOrder:       len(items),
		})
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

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return h.syncAutoEstimateLineItems(ctx, budgetID)
}

func (h *Handler) SyncAutoAircraftLineItems(ctx context.Context, budgetID int64) error {
	return h.syncAutoAircraftLineItems(ctx, budgetID)
}

func (h *Handler) syncAutoEstimateLineItems(ctx context.Context, budgetID int64) error {
	budget, err := h.fetchBudget(ctx, budgetID)
	if err != nil {
		return err
	}
	assumptions, estimateCurrencies, err := h.fetchAssumptionsWithEstimateCurrencies(ctx, budgetID)
	if err != nil {
		return err
	}
	budgetMethod := int(math.Round(clampNonNegative(assumptions["budget_method"])))
	if budgetMethod > 2 {
		budgetMethod = 2
	}

	sectionRows, err := h.db.Query(
		ctx,
		`SELECT id, code FROM budget_sections WHERE budget_id = $1`,
		budgetID,
	)
	if err != nil {
		return err
	}
	defer sectionRows.Close()
	sectionIDByCode := map[string]int64{}
	for sectionRows.Next() {
		var id int64
		var code string
		if err := sectionRows.Scan(&id, &code); err != nil {
			return err
		}
		sectionIDByCode[code] = id
	}
	if err := sectionRows.Err(); err != nil {
		return err
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if budgetMethod == 1 {
		if _, err := tx.Exec(
			ctx,
			`DELETE FROM budget_line_items
             WHERE budget_id = $1
               AND notes LIKE $2`,
			budgetID,
			autoEstimateLineItemNotePrefix+":%",
		); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	var startsAt time.Time
	var endsAt *time.Time
	if err := tx.QueryRow(
		ctx,
		`SELECT starts_at, ends_at FROM events WHERE id = $1`,
		budget.EventID,
	).Scan(&startsAt, &endsAt); err != nil {
		return err
	}
	startDate := startsAt.UTC().Truncate(24 * time.Hour)
	endDate := startDate
	if endsAt != nil {
		endDate = endsAt.UTC().Truncate(24 * time.Hour)
	}
	if endDate.Before(startDate) {
		endDate = startDate
	}
	eventDays := make([]time.Time, 0)
	for day := startDate; !day.After(endDate); day = day.Add(24 * time.Hour) {
		eventDays = append(eventDays, day)
	}

	manualDaysByCode := map[string]map[string]bool{}
	if budgetMethod != 1 {
		rows, err := tx.Query(
			ctx,
			`SELECT s.code, li.service_date
             FROM budget_line_items li
             JOIN budget_sections s ON s.id = li.section_id
             WHERE li.budget_id = $1
               AND s.code IN ('food_accommodation', 'transport_activities', 'payable_crew')
               AND li.service_date IS NOT NULL
               AND COALESCE(li.notes, '') NOT LIKE $2
               AND COALESCE(li.notes, '') NOT LIKE $3`,
			budgetID,
			autoAircraftInnhoppNotePrefix+":%",
			autoEstimateLineItemNotePrefix+":%",
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var code string
			var serviceDate time.Time
			if err := rows.Scan(&code, &serviceDate); err != nil {
				return err
			}
			dayKey := serviceDate.UTC().Format("2006-01-02")
			if manualDaysByCode[code] == nil {
				manualDaysByCode[code] = map[string]bool{}
			}
			manualDaysByCode[code][dayKey] = true
		}
		if err := rows.Err(); err != nil {
			return err
		}
	}

	_, _, fullParticipants := scenarioParticipantCounts(
		int(clampNonNegative(assumptions["confirm_participant_count"])),
		int(clampNonNegative(assumptions["worst_participant_count"])),
		int(clampNonNegative(assumptions["full_participant_count"])),
	)
	_, _, _, crewCount, _, err := h.computeAircraftScenarioTotals(
		ctx,
		budget.EventID,
		fullParticipants,
		map[string]float64{budget.BaseCurrency: 1},
		map[string]float64{budget.BaseCurrency: 1},
	)
	if err != nil {
		return err
	}

	estimateAccommodationPerPersonNight := clampNonNegative(assumptions["estimate_accommodation_per_person_night"])
	estimateFoodPerDay := clampNonNegative(assumptions["estimate_food_per_day"])
	estimateTransportPerDay := clampNonNegative(assumptions["estimate_transport_per_day"])
	estimateStaffSalaryPerPersonDay := clampNonNegative(assumptions["estimate_staff_salary_per_person_day"])

	type generatedLineItem struct {
		SectionID     int64
		Name          string
		ServiceDate   *time.Time
		LocationLabel string
		Quantity      float64
		UnitCost      float64
		CostCurrency  string
		SortOrder     int
		Marker        string
	}
	items := make([]generatedLineItem, 0)
	addEstimateLine := func(sectionCode, estimateKey, name string, quantity, unitCost float64, day time.Time) {
		sectionID := sectionIDByCode[sectionCode]
		if sectionID <= 0 {
			return
		}
		dayKey := day.Format("2006-01-02")
		if manualDaysByCode[sectionCode] != nil && manualDaysByCode[sectionCode][dayKey] {
			return
		}
		dateCopy := day
		currency := normalizeCurrency(estimateCurrencies[estimateKey])
		marker := fmt.Sprintf(
			"%s:%s:%s:%s%s",
			autoEstimateLineItemNotePrefix,
			sectionCode,
			estimateKey,
			dayKey,
			autoEstimateWarningSuffix,
		)
		items = append(items, generatedLineItem{
			SectionID:     sectionID,
			Name:          name,
			ServiceDate:   &dateCopy,
			LocationLabel: "Estimate",
			Quantity:      quantity,
			UnitCost:      unitCost,
			CostCurrency:  currency,
			SortOrder:     len(items),
			Marker:        marker,
		})
	}

	for _, day := range eventDays {
		addEstimateLine(
			"food_accommodation",
			"estimate_accommodation_per_person_night",
			"Accommodation",
			float64(fullParticipants),
			estimateAccommodationPerPersonNight,
			day,
		)
		addEstimateLine(
			"food_accommodation",
			"estimate_food_per_day",
			"Food",
			float64(fullParticipants),
			estimateFoodPerDay,
			day,
		)
		addEstimateLine(
			"transport_activities",
			"estimate_transport_per_day",
			"Transport",
			1,
			estimateTransportPerDay,
			day,
		)
		addEstimateLine(
			"payable_crew",
			"estimate_staff_salary_per_person_day",
			"Staff Salary",
			float64(crewCount),
			estimateStaffSalaryPerPersonDay,
			day,
		)
	}

	existingRows, err := tx.Query(
		ctx,
		`SELECT id, COALESCE(notes, '')
         FROM budget_line_items
         WHERE budget_id = $1
           AND notes LIKE $2`,
		budgetID,
		autoEstimateLineItemNotePrefix+":%",
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
                 SET section_id = $1, name = $2, service_date = $3, location_label = $4, quantity = $5, unit_cost = $6,
                     cost_currency = $7, sort_order = $8, updated_at = NOW()
                 WHERE id = $9`,
				item.SectionID,
				item.Name,
				item.ServiceDate,
				item.LocationLabel,
				item.Quantity,
				item.UnitCost,
				item.CostCurrency,
				item.SortOrder,
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
                (budget_id, section_id, name, service_date, location_label, quantity, unit_cost, cost_currency, sort_order, notes)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			budgetID,
			item.SectionID,
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
