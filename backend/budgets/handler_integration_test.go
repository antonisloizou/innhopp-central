package budgets

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestGetSummaryIntegration(t *testing.T) {
	db := openBudgetTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureBudgetTestSchema(t, ctx, db)

	seasonID := insertTestSeason(t, ctx, db)
	eventID := insertTestEvent(t, ctx, db, seasonID, 100, 200)
	budgetID := insertTestBudgetWithOneSection(t, ctx, db, eventID)

	if _, err := db.Exec(
		ctx,
		`INSERT INTO budget_line_items (budget_id, section_id, name, quantity, unit_cost, cost_currency)
         SELECT $1, id, 'Hotel', 2, 100, 'EUR'
         FROM budget_sections
         WHERE budget_id = $1 AND code = 'food_accommodation'
         LIMIT 1`,
		budgetID,
	); err != nil {
		t.Fatalf("insert line item failed: %v", err)
	}

	h := NewHandler(db)
	router := chi.NewRouter()
	router.Get("/api/budgets/{budgetID}/summary", h.getSummary)
	req := httptest.NewRequest(http.MethodGet, "/api/budgets/"+strconv.FormatInt(budgetID, 10)+"/summary", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("summary status mismatch: got %d body=%s", rec.Code, rec.Body.String())
	}

	var payload BudgetSummary
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode summary failed: %v", err)
	}
	if payload.RevenuePerParticipant != 300 {
		t.Fatalf("revenue per participant mismatch: got %.2f want 300.00", payload.RevenuePerParticipant)
	}
	if payload.ExpectedCost != 200 {
		t.Fatalf("expected cost mismatch: got %.2f want 200.00", payload.ExpectedCost)
	}
	if payload.CostWithDrift != 206 {
		t.Fatalf("cost with drift mismatch: got %.2f want 206.00", payload.CostWithDrift)
	}
	if payload.Scenarios["worst_case_gate"].Participants != 13 {
		t.Fatalf("worst-case participants mismatch: got %d want 13", payload.Scenarios["worst_case_gate"].Participants)
	}
}

func TestGetSummaryConvertsEventRevenueFromEventCurrency(t *testing.T) {
	db := openBudgetTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureBudgetTestSchema(t, ctx, db)

	seasonID := insertTestSeason(t, ctx, db)
	eventID := insertTestEventWithCurrency(t, ctx, db, seasonID, 100, 200, "NOK")
	budgetID := insertTestBudgetWithOneSection(t, ctx, db, eventID)

	if _, err := db.Exec(
		ctx,
		`INSERT INTO budget_currencies (budget_id, currency_code, rate_to_base)
         VALUES ($1, 'NOK', 10)
         ON CONFLICT (budget_id, currency_code) DO UPDATE SET rate_to_base = EXCLUDED.rate_to_base`,
		budgetID,
	); err != nil {
		t.Fatalf("insert NOK budget currency failed: %v", err)
	}

	h := NewHandler(db)
	router := chi.NewRouter()
	router.Get("/api/budgets/{budgetID}/summary", h.getSummary)
	req := httptest.NewRequest(http.MethodGet, "/api/budgets/"+strconv.FormatInt(budgetID, 10)+"/summary", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("summary status mismatch: got %d body=%s", rec.Code, rec.Body.String())
	}

	var payload BudgetSummary
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode summary failed: %v", err)
	}
	if payload.DepositAmount != 10 {
		t.Fatalf("deposit amount mismatch: got %.2f want 10.00", payload.DepositAmount)
	}
	if payload.MainInvoiceAmount != 20 {
		t.Fatalf("main invoice amount mismatch: got %.2f want 20.00", payload.MainInvoiceAmount)
	}
	if payload.RevenuePerParticipant != 30 {
		t.Fatalf("revenue per participant mismatch: got %.2f want 30.00", payload.RevenuePerParticipant)
	}
	if payload.Scenarios["confirm_case"].Revenue != 360 {
		t.Fatalf("confirm scenario revenue mismatch: got %.2f want 360.00", payload.Scenarios["confirm_case"].Revenue)
	}
}

func TestUpdateBudgetBlocksReviewWhenWorstCaseNegative(t *testing.T) {
	db := openBudgetTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureBudgetTestSchema(t, ctx, db)

	seasonID := insertTestSeason(t, ctx, db)
	eventID := insertTestEvent(t, ctx, db, seasonID, 0, 0)
	budgetID := insertTestBudgetWithOneSection(t, ctx, db, eventID)

	if _, err := db.Exec(
		ctx,
		`INSERT INTO budget_line_items (budget_id, section_id, name, quantity, unit_cost, cost_currency)
         SELECT $1, id, 'Aircraft Reserve', 1, 1000, 'EUR'
         FROM budget_sections
         WHERE budget_id = $1 AND code = 'food_accommodation'
         LIMIT 1`,
		budgetID,
	); err != nil {
		t.Fatalf("insert line item failed: %v", err)
	}

	h := NewHandler(db)
	router := chi.NewRouter()
	router.Put("/api/budgets/{budgetID}", h.updateBudget)
	req := httptest.NewRequest(http.MethodPut, "/api/budgets/"+strconv.FormatInt(budgetID, 10), bytes.NewBufferString(`{"status":"review"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("update status mismatch: got %d body=%s", rec.Code, rec.Body.String())
	}

	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode error response failed: %v", err)
	}
	if payload["reason_code"] != "worst_case_negative_margin" {
		t.Fatalf("reason_code mismatch: got %v", payload["reason_code"])
	}
	if deficit, ok := payload["margin_deficit"].(float64); !ok || deficit <= 0 {
		t.Fatalf("margin_deficit mismatch: got %v", payload["margin_deficit"])
	}
}

func TestCreateBudgetDoesNotPersistLegacyAircraftAssumptions(t *testing.T) {
	db := openBudgetTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureBudgetTestSchema(t, ctx, db)

	seasonID := insertTestSeason(t, ctx, db)
	eventID := insertTestEvent(t, ctx, db, seasonID, 0, 0)

	h := NewHandler(db)
	router := chi.NewRouter()
	router.Post("/api/events/{eventID}/budget", h.createBudgetForEvent)

	req := httptest.NewRequest(http.MethodPost, "/api/events/"+strconv.FormatInt(eventID, 10)+"/budget", bytes.NewBufferString(`{"name":"Created Budget","base_currency":"EUR"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status mismatch: got %d body=%s", rec.Code, rec.Body.String())
	}

	var payload Budget
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode create response failed: %v", err)
	}

	var legacyCount int
	if err := db.QueryRow(
		ctx,
		`SELECT COUNT(*)
         FROM budget_assumptions
         WHERE budget_id = $1
           AND key IN ('aircraft_price_per_minute', 'minimum_load_duration', 'aircraft_cruising_speed_kmh')`,
		payload.ID,
	).Scan(&legacyCount); err != nil {
		t.Fatalf("count legacy assumptions failed: %v", err)
	}
	if legacyCount != 0 {
		t.Fatalf("expected no legacy aircraft assumptions for new budgets, got %d", legacyCount)
	}
}

func TestSyncAutoAircraftLineItemsUsesTakeoffToInnhoppPlusInnhoppToLanding(t *testing.T) {
	db := openBudgetTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureBudgetTestSchema(t, ctx, db)

	seasonID := insertTestSeason(t, ctx, db)
	eventID := insertTestEvent(t, ctx, db, seasonID, 0, 0)
	budgetID := insertTestBudgetWithOneSection(t, ctx, db, eventID)

	if _, err := db.Exec(
		ctx,
		`UPDATE budget_assumptions
         SET value_num = CASE key
           WHEN 'full_load_count' THEN 2
           WHEN 'aircraft_cruising_speed_kmh' THEN 60
           WHEN 'minimum_load_duration' THEN 1
           WHEN 'aircraft_price_per_minute' THEN 1
           ELSE value_num
         END
         WHERE budget_id = $1
           AND key IN ('full_load_count', 'aircraft_cruising_speed_kmh', 'minimum_load_duration', 'aircraft_price_per_minute')`,
		budgetID,
	); err != nil {
		t.Fatalf("update assumptions failed: %v", err)
	}

	var innhoppID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO event_innhopps (event_id, sequence, name, takeoff_airfield_id, landing_airfield_id, distance_by_air, landing_distance_by_air)
         VALUES ($1, 1, 'Split Route', 100, 200, 10, 15)
         RETURNING id`,
		eventID,
	).Scan(&innhoppID); err != nil {
		t.Fatalf("insert innhopp failed: %v", err)
	}

	h := NewHandler(db)
	if err := h.syncAutoAircraftLineItems(ctx, budgetID); err != nil {
		t.Fatalf("sync auto aircraft line items failed: %v", err)
	}

	var qty float64
	var notes string
	if err := db.QueryRow(
		ctx,
		`SELECT quantity, COALESCE(notes, '')
         FROM budget_line_items
         WHERE budget_id = $1
           AND notes LIKE '[auto-aircraft-innhopp]:' || $2
         LIMIT 1`,
		budgetID,
		strconv.FormatInt(innhoppID, 10)+"%",
	).Scan(&qty, &notes); err != nil {
		t.Fatalf("load generated line item failed: %v", err)
	}

	// full_load_count=2:
	// - outbound: 10*2 = 20
	// - return to takeoff between loads: 10*(2-1) = 10
	// - final innhopp->landing: 15
	// totalDistanceKm = 45; speed=60km/h => 45 minutes.
	if qty != 45 {
		t.Fatalf("quantity mismatch: got %.2f want 45.00", qty)
	}
	if strings.Contains(notes, ":missing-distance") {
		t.Fatalf("unexpected missing-distance marker in notes: %q", notes)
	}
}

func TestSyncAutoAircraftLineItemsSameAirfieldZeroDistanceUsesMinimumWithoutWarning(t *testing.T) {
	db := openBudgetTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureBudgetTestSchema(t, ctx, db)

	seasonID := insertTestSeason(t, ctx, db)
	eventID := insertTestEvent(t, ctx, db, seasonID, 0, 0)
	budgetID := insertTestBudgetWithOneSection(t, ctx, db, eventID)

	if _, err := db.Exec(
		ctx,
		`UPDATE budget_assumptions
         SET value_num = CASE key
           WHEN 'full_load_count' THEN 2
           WHEN 'aircraft_cruising_speed_kmh' THEN 60
           WHEN 'minimum_load_duration' THEN 20
           WHEN 'aircraft_price_per_minute' THEN 1
           ELSE value_num
         END
         WHERE budget_id = $1
           AND key IN ('full_load_count', 'aircraft_cruising_speed_kmh', 'minimum_load_duration', 'aircraft_price_per_minute')`,
		budgetID,
	); err != nil {
		t.Fatalf("update assumptions failed: %v", err)
	}

	var innhoppID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO event_innhopps (event_id, sequence, name, takeoff_airfield_id, landing_airfield_id, distance_by_air, landing_distance_by_air)
         VALUES ($1, 1, 'At Takeoff', 100, 100, 0, 0)
         RETURNING id`,
		eventID,
	).Scan(&innhoppID); err != nil {
		t.Fatalf("insert innhopp failed: %v", err)
	}

	h := NewHandler(db)
	if err := h.syncAutoAircraftLineItems(ctx, budgetID); err != nil {
		t.Fatalf("sync auto aircraft line items failed: %v", err)
	}

	var qty float64
	var notes string
	if err := db.QueryRow(
		ctx,
		`SELECT quantity, COALESCE(notes, '')
         FROM budget_line_items
         WHERE budget_id = $1
           AND notes LIKE '[auto-aircraft-innhopp]:' || $2
         LIMIT 1`,
		budgetID,
		strconv.FormatInt(innhoppID, 10)+"%",
	).Scan(&qty, &notes); err != nil {
		t.Fatalf("load generated line item failed: %v", err)
	}

	// Same-airfield jump with zero distance should apply minimum duration:
	// minimum_load_duration=20, full_load_count=2 => 40 minutes.
	if qty != 40 {
		t.Fatalf("quantity mismatch: got %.2f want 40.00", qty)
	}
	if strings.Contains(notes, ":missing-distance") {
		t.Fatalf("unexpected missing-distance marker in notes: %q", notes)
	}
}

func TestBackfillAircraftAssignmentsFromBudgetParamsCreatesEditableEventAircraft(t *testing.T) {
	db := openBudgetTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureBudgetTestSchema(t, ctx, db)

	seasonID := insertTestSeason(t, ctx, db)
	eventID := insertTestEvent(t, ctx, db, seasonID, 0, 0)
	budgetID := insertTestBudgetWithOneSection(t, ctx, db, eventID)

	if _, err := db.Exec(ctx, `UPDATE event_budgets SET aircraft_currency = 'NOK' WHERE id = $1`, budgetID); err != nil {
		t.Fatalf("update aircraft currency failed: %v", err)
	}
	if _, err := db.Exec(
		ctx,
		`UPDATE budget_assumptions
         SET value_num = CASE key
           WHEN 'aircraft_price_per_minute' THEN 12.5
           WHEN 'aircraft_cruising_speed_kmh' THEN 210
           WHEN 'minimum_load_duration' THEN 18
           ELSE value_num
         END
         WHERE budget_id = $1
           AND key IN ('aircraft_price_per_minute', 'aircraft_cruising_speed_kmh', 'minimum_load_duration')`,
		budgetID,
	); err != nil {
		t.Fatalf("update assumptions failed: %v", err)
	}

	var firstInnhoppID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO event_innhopps (event_id, sequence, name, distance_by_air, landing_distance_by_air)
         VALUES ($1, 1, 'Legacy One', 10, 5)
         RETURNING id`,
		eventID,
	).Scan(&firstInnhoppID); err != nil {
		t.Fatalf("insert first innhopp failed: %v", err)
	}
	if _, err := db.Exec(
		ctx,
		`INSERT INTO event_innhopps (event_id, sequence, name, distance_by_air, landing_distance_by_air)
         VALUES ($1, 2, 'Legacy Two', 15, 5)`,
		eventID,
	); err != nil {
		t.Fatalf("insert second innhopp failed: %v", err)
	}

	if err := BackfillAircraftAssignmentsFromBudgetParams(ctx, db); err != nil {
		t.Fatalf("backfill failed: %v", err)
	}
	if err := BackfillAircraftAssignmentsFromBudgetParams(ctx, db); err != nil {
		t.Fatalf("second backfill failed: %v", err)
	}

	var aircraftID int64
	var aircraftName string
	var pricingModel string
	var rateCurrency string
	var ratePerMinute float64
	var cruisingSpeed float64
	var minimumLoad float64
	if err := db.QueryRow(
		ctx,
		`SELECT a.id, a.name, a.pricing_model, a.rate_currency, a.rate_per_minute, a.cruising_speed_kmh, a.minimum_load_duration
         FROM aircraft a
         JOIN event_aircraft ea ON ea.aircraft_id = a.id
         WHERE ea.event_id = $1`,
		eventID,
	).Scan(&aircraftID, &aircraftName, &pricingModel, &rateCurrency, &ratePerMinute, &cruisingSpeed, &minimumLoad); err != nil {
		t.Fatalf("load backfilled aircraft failed: %v", err)
	}

	if aircraftName != "Budget Test Event Aircraft" {
		t.Fatalf("aircraft name mismatch: got %q", aircraftName)
	}
	if pricingModel != "time" {
		t.Fatalf("pricing model mismatch: got %q", pricingModel)
	}
	if rateCurrency != "NOK" {
		t.Fatalf("rate currency mismatch: got %q", rateCurrency)
	}
	if ratePerMinute != 12.5 {
		t.Fatalf("rate per minute mismatch: got %.2f want 12.50", ratePerMinute)
	}
	if cruisingSpeed != 210 {
		t.Fatalf("cruising speed mismatch: got %.2f want 210.00", cruisingSpeed)
	}
	if minimumLoad != 18 {
		t.Fatalf("minimum load mismatch: got %.2f want 18.00", minimumLoad)
	}

	var attachedCount int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM event_aircraft WHERE event_id = $1`, eventID).Scan(&attachedCount); err != nil {
		t.Fatalf("count attached aircraft failed: %v", err)
	}
	if attachedCount != 1 {
		t.Fatalf("attached aircraft count mismatch: got %d want 1", attachedCount)
	}

	var assignedCount int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM event_innhopps WHERE event_id = $1 AND aircraft_id = $2`, eventID, aircraftID).Scan(&assignedCount); err != nil {
		t.Fatalf("count assigned innhopps failed: %v", err)
	}
	if assignedCount != 2 {
		t.Fatalf("assigned innhopps mismatch: got %d want 2", assignedCount)
	}

	if _, err := db.Exec(ctx, `UPDATE aircraft SET name = 'Edited Aircraft Name' WHERE id = $1`, aircraftID); err != nil {
		t.Fatalf("update aircraft name failed: %v", err)
	}
	var editedName string
	if err := db.QueryRow(ctx, `SELECT name FROM aircraft WHERE id = $1`, aircraftID).Scan(&editedName); err != nil {
		t.Fatalf("reload aircraft name failed: %v", err)
	}
	if editedName != "Edited Aircraft Name" {
		t.Fatalf("edited aircraft name mismatch: got %q", editedName)
	}

	var firstAssignedAircraftID int64
	if err := db.QueryRow(ctx, `SELECT aircraft_id FROM event_innhopps WHERE id = $1`, firstInnhoppID).Scan(&firstAssignedAircraftID); err != nil {
		t.Fatalf("reload innhopp aircraft failed: %v", err)
	}
	if firstAssignedAircraftID != aircraftID {
		t.Fatalf("innhopp aircraft mismatch: got %d want %d", firstAssignedAircraftID, aircraftID)
	}
}

func openBudgetTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set; skipping integration budget tests")
	}
	db, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect db failed: %v", err)
	}
	return db
}

func ensureBudgetTestSchema(t *testing.T, ctx context.Context, db *pgxpool.Pool) {
	t.Helper()
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS seasons (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            starts_on DATE NOT NULL,
            ends_on DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            location TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            slots INTEGER NOT NULL DEFAULT 0,
            starts_at TIMESTAMPTZ NOT NULL,
            ends_at TIMESTAMPTZ,
            deposit_amount NUMERIC(12,2),
            main_invoice_amount NUMERIC(12,2),
            currency TEXT NOT NULL DEFAULT 'EUR',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS event_innhopps (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL DEFAULT 0,
            name TEXT NOT NULL DEFAULT '',
            aircraft_id INTEGER,
            takeoff_airfield_id INTEGER,
            landing_airfield_id INTEGER,
            distance_by_air NUMERIC(10,2) NOT NULL DEFAULT 0,
            landing_distance_by_air NUMERIC(10,2) NOT NULL DEFAULT 0
        )`,
		`CREATE TABLE IF NOT EXISTS aircraft (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            pricing_model TEXT NOT NULL DEFAULT 'time',
            rate_currency TEXT NOT NULL DEFAULT 'EUR',
            rate_per_minute NUMERIC,
            cruising_speed_kmh NUMERIC,
            minimum_load_duration NUMERIC,
            price_per_slot NUMERIC,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS event_aircraft (
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            aircraft_id INTEGER NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (event_id, aircraft_id)
        )`,
		`CREATE TABLE IF NOT EXISTS aircraft_slot_pricing_bands (
            id SERIAL PRIMARY KEY,
            aircraft_id INTEGER NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
            max_distance_km NUMERIC NOT NULL,
            slot_multiplier NUMERIC NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS event_budgets (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            base_currency TEXT NOT NULL DEFAULT 'EUR',
            aircraft_currency TEXT NOT NULL DEFAULT 'EUR',
            status TEXT NOT NULL DEFAULT 'draft',
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS budget_sections (
            id SERIAL PRIMARY KEY,
            budget_id INTEGER NOT NULL REFERENCES event_budgets(id) ON DELETE CASCADE,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (budget_id, code)
        )`,
		`CREATE TABLE IF NOT EXISTS budget_line_items (
            id SERIAL PRIMARY KEY,
            budget_id INTEGER NOT NULL REFERENCES event_budgets(id) ON DELETE CASCADE,
            section_id INTEGER NOT NULL REFERENCES budget_sections(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            service_date DATE,
            location_label TEXT,
            quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
            unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
            cost_currency TEXT NOT NULL DEFAULT 'EUR',
            sort_order INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS budget_assumptions (
            id SERIAL PRIMARY KEY,
            budget_id INTEGER NOT NULL REFERENCES event_budgets(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value_num NUMERIC(16,4),
            value_text TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (budget_id, key)
        )`,
		`CREATE TABLE IF NOT EXISTS budget_currencies (
            id SERIAL PRIMARY KEY,
            budget_id INTEGER NOT NULL REFERENCES event_budgets(id) ON DELETE CASCADE,
            currency_code TEXT NOT NULL,
            rate_to_base NUMERIC(16,6) NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (budget_id, currency_code)
        )`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(ctx, stmt); err != nil {
			t.Fatalf("schema statement failed: %v", err)
		}
	}
}

func insertTestSeason(t *testing.T, ctx context.Context, db *pgxpool.Pool) int64 {
	t.Helper()
	var seasonID int64
	err := db.QueryRow(
		ctx,
		`INSERT INTO seasons (name, starts_on, ends_on)
         VALUES ('Budget Test Season', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day')
         RETURNING id`,
	).Scan(&seasonID)
	if err != nil {
		t.Fatalf("insert season failed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(context.Background(), `DELETE FROM seasons WHERE id = $1`, seasonID)
	})
	return seasonID
}

func insertTestEvent(t *testing.T, ctx context.Context, db *pgxpool.Pool, seasonID int64, depositAmount, mainInvoiceAmount float64) int64 {
	return insertTestEventWithCurrency(t, ctx, db, seasonID, depositAmount, mainInvoiceAmount, "EUR")
}

func insertTestEventWithCurrency(t *testing.T, ctx context.Context, db *pgxpool.Pool, seasonID int64, depositAmount, mainInvoiceAmount float64, currency string) int64 {
	t.Helper()
	var eventID int64
	err := db.QueryRow(
		ctx,
		`INSERT INTO events (season_id, name, location, starts_at, ends_at, deposit_amount, main_invoice_amount, currency)
         VALUES ($1, 'Budget Test Event', 'Test Location', NOW(), NOW() + INTERVAL '2 days', $2, $3, $4)
         RETURNING id`,
		seasonID, depositAmount, mainInvoiceAmount, currency,
	).Scan(&eventID)
	if err != nil {
		t.Fatalf("insert event failed: %v", err)
	}
	return eventID
}

func insertTestBudgetWithOneSection(t *testing.T, ctx context.Context, db *pgxpool.Pool, eventID int64) int64 {
	t.Helper()
	var budgetID int64
	err := db.QueryRow(
		ctx,
		`INSERT INTO event_budgets (event_id, name, base_currency, aircraft_currency, status)
         VALUES ($1, 'Budget Fixture', 'EUR', 'EUR', 'draft')
         RETURNING id`,
		eventID,
	).Scan(&budgetID)
	if err != nil {
		t.Fatalf("insert budget failed: %v", err)
	}
	sections := []struct {
		code  string
		name  string
		order int
	}{
		{"aircraft", "Aircraft", 0},
		{"food_accommodation", "Food & Accommodation", 1},
	}
	for _, section := range sections {
		if _, err := db.Exec(
			ctx,
			`INSERT INTO budget_sections (budget_id, code, name, sort_order)
             VALUES ($1, $2, $3, $4)`,
			budgetID, section.code, section.name, section.order,
		); err != nil {
			t.Fatalf("insert section failed: %v", err)
		}
	}
	for key, value := range defaultAssumptions {
		if _, err := db.Exec(
			ctx,
			`INSERT INTO budget_assumptions (budget_id, key, value_num)
             VALUES ($1, $2, $3)
             ON CONFLICT (budget_id, key) DO UPDATE SET value_num = EXCLUDED.value_num`,
			budgetID, key, value,
		); err != nil {
			t.Fatalf("insert assumption failed: %v", err)
		}
	}
	if _, err := db.Exec(
		ctx,
		`INSERT INTO budget_currencies (budget_id, currency_code, rate_to_base)
         VALUES ($1, 'EUR', 1)
         ON CONFLICT (budget_id, currency_code) DO NOTHING`,
		budgetID,
	); err != nil {
		t.Fatalf("insert budget currency failed: %v", err)
	}
	return budgetID
}
