package events

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestUpdateEventPreservesInnhoppAircraftAssignmentWhenOmitted(t *testing.T) {
	db := openEventTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureEventTestSchema(t, ctx, db)

	seasonID := insertEventTestSeason(t, ctx, db)
	eventID := insertEventTestEvent(t, ctx, db, seasonID)
	aircraftID := insertEventTestAircraft(t, ctx, db)
	attachEventTestAircraft(t, ctx, db, eventID, aircraftID)
	innhoppID := insertEventTestInnhopp(t, ctx, db, eventID, aircraftID)

	h := NewHandler(db)
	router := chi.NewRouter()
	router.Put("/api/events/{eventID}", h.updateEvent)

	body := bytes.NewBufferString(`{
		"season_id": ` + strconv.FormatInt(seasonID, 10) + `,
		"name": "Updated event",
		"status": "draft",
		"starts_at": "2099-07-04T08:00:00Z",
		"slots": 12,
		"currency": "EUR",
		"minimum_deposit_count": 0,
		"commercial_status": "draft",
		"aircraft": [{
			"id": ` + strconv.FormatInt(aircraftID, 10) + `,
			"name": "Caravan",
			"pricing_model": "time",
			"rate_currency": "EUR",
			"capacity": 14,
			"crew_on_load_count": 2,
			"rate_per_minute": 100,
			"cruising_speed_kmh": 180,
			"minimum_load_duration": 0,
			"sort_order": 0
		}],
		"innhopps": [{
			"id": ` + strconv.FormatInt(innhoppID, 10) + `,
			"sequence": 1,
			"name": "Updated innhopp",
			"coordinates": "59.0 10.0",
			"scheduled_at": "2099-07-04T09:00:00Z"
		}]
	}`)
	req := httptest.NewRequest(http.MethodPut, "/api/events/"+strconv.FormatInt(eventID, 10), body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update status mismatch: got %d body=%s", rec.Code, rec.Body.String())
	}

	var updated Event
	if err := json.NewDecoder(rec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated event failed: %v", err)
	}
	if len(updated.Innhopps) != 1 {
		t.Fatalf("expected 1 innhopp in response, got %d", len(updated.Innhopps))
	}
	if updated.Innhopps[0].AircraftID == nil || *updated.Innhopps[0].AircraftID != aircraftID {
		t.Fatalf("expected response innhopp aircraft_id to remain %d, got %+v", aircraftID, updated.Innhopps[0].AircraftID)
	}

	var persistedID int64
	var persisted sql.NullInt64
	if err := db.QueryRow(ctx, `SELECT id, aircraft_id FROM event_innhopps WHERE event_id = $1 AND sequence = 1`, eventID).Scan(&persistedID, &persisted); err != nil {
		t.Fatalf("load persisted innhopp failed: %v", err)
	}
	if persistedID != innhoppID {
		t.Fatalf("expected event save to preserve innhopp id %d, got %d", innhoppID, persistedID)
	}
	if !persisted.Valid || persisted.Int64 != aircraftID {
		t.Fatalf("expected persisted aircraft_id to remain %d after event save, got valid=%t value=%d", aircraftID, persisted.Valid, persisted.Int64)
	}
}

func TestReplaceEventInnhoppsTxDoesNotDeleteOmittedInnhopps(t *testing.T) {
	db := openEventTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureEventTestSchema(t, ctx, db)

	seasonID := insertEventTestSeason(t, ctx, db)
	eventID := insertEventTestEvent(t, ctx, db, seasonID)
	innhoppID := insertEventTestInnhopp(t, ctx, db, eventID, 0)

	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}
	defer tx.Rollback(ctx)
	if err := replaceEventInnhoppsTx(ctx, tx, eventID, nil); err != nil {
		t.Fatalf("bulk save without innhopps failed: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit transaction: %v", err)
	}

	var count int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM event_innhopps WHERE id = $1`, innhoppID).Scan(&count); err != nil {
		t.Fatalf("count persisted innhopp: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected omitted innhopp %d to remain after bulk event save", innhoppID)
	}
}

func TestUpdateAirfieldRecalculatesDependentInnhoppAirDistances(t *testing.T) {
	db := openEventTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureEventTestSchema(t, ctx, db)

	seasonID := insertEventTestSeason(t, ctx, db)
	eventID := insertEventTestEvent(t, ctx, db, seasonID)
	takeoffAirfieldID := insertEventTestAirfield(t, ctx, db, "Takeoff", "59.0000", "10.0000")
	landingAirfieldID := insertEventTestAirfield(t, ctx, db, "Landing", "59.0000", "10.0000")

	if _, err := db.Exec(ctx, `INSERT INTO event_airfields (event_id, airfield_id) VALUES ($1, $2), ($1, $3)`, eventID, takeoffAirfieldID, landingAirfieldID); err != nil {
		t.Fatalf("attach airfields failed: %v", err)
	}

	var innhoppID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO event_innhopps (
			event_id, sequence, name, coordinates, takeoff_airfield_id, landing_airfield_id, distance_by_air, landing_distance_by_air
		) VALUES ($1, 1, 'Distance target', '59.1000 10.0000', $2, $3, 99, 99)
		RETURNING id`,
		eventID,
		takeoffAirfieldID,
		landingAirfieldID,
	).Scan(&innhoppID); err != nil {
		t.Fatalf("insert innhopp failed: %v", err)
	}

	h := NewHandler(db)
	router := chi.NewRouter()
	router.Put("/api/events/airfields/{airfieldID}", h.updateAirfield)

	body := bytes.NewBufferString(`{
		"name": "Takeoff moved",
		"elevation": 120,
		"coordinates": "59.0500 10.0000",
		"description": "Updated"
	}`)
	req := httptest.NewRequest(http.MethodPut, "/api/events/airfields/"+strconv.FormatInt(takeoffAirfieldID, 10), body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update airfield status mismatch: got %d body=%s", rec.Code, rec.Body.String())
	}

	var distanceByAir sql.NullFloat64
	var landingDistanceByAir sql.NullFloat64
	if err := db.QueryRow(
		ctx,
		`SELECT distance_by_air, landing_distance_by_air FROM event_innhopps WHERE id = $1`,
		innhoppID,
	).Scan(&distanceByAir, &landingDistanceByAir); err != nil {
		t.Fatalf("load recalculated innhopp failed: %v", err)
	}

	if !distanceByAir.Valid || distanceByAir.Float64 != 6 {
		t.Fatalf("expected takeoff distance_by_air to recalculate to 6km, got %+v", distanceByAir)
	}
	if !landingDistanceByAir.Valid || landingDistanceByAir.Float64 != 12 {
		t.Fatalf("expected landing_distance_by_air to remain derived from landing airfield at 12km, got %+v", landingDistanceByAir)
	}
}

func openEventTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set; skipping event integration tests")
	}
	db, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect db failed: %v", err)
	}
	return db
}

func ensureEventTestSchema(t *testing.T, ctx context.Context, db *pgxpool.Pool) {
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
			starts_at TIMESTAMPTZ NOT NULL,
			ends_at TIMESTAMPTZ,
			slots INTEGER NOT NULL DEFAULT 0,
			public_registration_slug TEXT,
			public_registration_enabled BOOLEAN NOT NULL DEFAULT FALSE,
			registration_open_at TIMESTAMPTZ,
			main_invoice_deadline TIMESTAMPTZ,
			deposit_amount NUMERIC(12,2),
			main_invoice_amount NUMERIC(12,2),
			currency TEXT NOT NULL DEFAULT 'EUR',
			minimum_deposit_count INTEGER NOT NULL DEFAULT 0,
			commercial_status TEXT NOT NULL DEFAULT 'draft',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS participant_profiles (
			id SERIAL PRIMARY KEY,
			full_name TEXT NOT NULL DEFAULT '',
			roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
		)`,
		`CREATE TABLE IF NOT EXISTS event_registrations (
			id SERIAL PRIMARY KEY,
			event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
			cancelled_at TIMESTAMPTZ,
			expired_at TIMESTAMPTZ
		)`,
		`CREATE TABLE IF NOT EXISTS event_participants (
			event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
			PRIMARY KEY (event_id, participant_id)
		)`,
		`CREATE TABLE IF NOT EXISTS event_airfields (
			event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			airfield_id INTEGER NOT NULL,
			PRIMARY KEY (event_id, airfield_id)
		)`,
		`CREATE TABLE IF NOT EXISTS airfields (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			latitude TEXT NOT NULL,
			longitude TEXT NOT NULL,
			elevation INTEGER NOT NULL DEFAULT 0,
			description TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS aircraft (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			pricing_model TEXT NOT NULL DEFAULT 'time',
			rate_currency TEXT NOT NULL DEFAULT 'EUR',
			capacity INTEGER NOT NULL DEFAULT 14,
			crew_on_load_count INTEGER NOT NULL DEFAULT 2,
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
		`CREATE TABLE IF NOT EXISTS event_innhopps (
			id SERIAL PRIMARY KEY,
			event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			sequence INTEGER NOT NULL DEFAULT 1,
			name TEXT NOT NULL,
			coordinates TEXT NOT NULL DEFAULT '',
			aircraft_id INTEGER,
			takeoff_airfield_id INTEGER,
			landing_airfield_id INTEGER,
			elevation INTEGER,
			scheduled_at TIMESTAMPTZ,
			notes TEXT NOT NULL DEFAULT '',
			reason_for_choice TEXT NOT NULL DEFAULT '',
			adjust_altimeter_aad TEXT NOT NULL DEFAULT '',
			notam TEXT NOT NULL DEFAULT '',
			distance_by_air NUMERIC,
			distance_by_road NUMERIC,
			landing_distance_by_air NUMERIC,
			landing_distance_by_road NUMERIC,
			single_load_only BOOLEAN NOT NULL DEFAULT FALSE,
			primary_landing_area_name TEXT NOT NULL DEFAULT '',
			primary_landing_area_description TEXT NOT NULL DEFAULT '',
			primary_landing_area_size TEXT NOT NULL DEFAULT '',
			primary_landing_area_obstacles TEXT NOT NULL DEFAULT '',
			secondary_landing_area_name TEXT NOT NULL DEFAULT '',
			secondary_landing_area_description TEXT NOT NULL DEFAULT '',
			secondary_landing_area_size TEXT NOT NULL DEFAULT '',
			secondary_landing_area_obstacles TEXT NOT NULL DEFAULT '',
			risk_assessment TEXT NOT NULL DEFAULT '',
			safety_precautions TEXT NOT NULL DEFAULT '',
			jumprun TEXT NOT NULL DEFAULT '',
			hospital TEXT NOT NULL DEFAULT '',
			rescue_boat BOOLEAN,
			minimum_requirements TEXT NOT NULL DEFAULT '',
			image_files JSONB NOT NULL DEFAULT '[]'::jsonb,
			land_owners JSONB NOT NULL DEFAULT '[]'::jsonb,
			land_owner_permission BOOLEAN,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS logistics_transports (
			id SERIAL PRIMARY KEY,
			pickup_location TEXT NOT NULL DEFAULT '',
			pickup_location_type TEXT,
			pickup_location_id INTEGER,
			destination TEXT NOT NULL DEFAULT '',
			destination_type TEXT,
			destination_id INTEGER,
			passenger_count INTEGER NOT NULL DEFAULT 0,
			duration_minutes INTEGER,
			scheduled_at TIMESTAMPTZ,
			notes TEXT,
			event_id INTEGER,
			season_id INTEGER,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS logistics_ground_crews (
			id SERIAL PRIMARY KEY,
			pickup_location TEXT NOT NULL DEFAULT '',
			pickup_location_type TEXT,
			pickup_location_id INTEGER,
			destination TEXT NOT NULL DEFAULT '',
			destination_type TEXT,
			destination_id INTEGER,
			passenger_count INTEGER NOT NULL DEFAULT 0,
			duration_minutes INTEGER,
			scheduled_at TIMESTAMPTZ,
			notes TEXT,
			event_id INTEGER,
			season_id INTEGER,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS logistics_meals (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			location TEXT,
			location_type TEXT,
			location_id INTEGER,
			scheduled_at TIMESTAMPTZ,
			notes TEXT,
			event_id INTEGER,
			season_id INTEGER,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(ctx, stmt); err != nil {
			t.Fatalf("schema statement failed: %v", err)
		}
	}
}

func insertEventTestSeason(t *testing.T, ctx context.Context, db *pgxpool.Pool) int64 {
	t.Helper()
	var seasonID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO seasons (name, starts_on) VALUES ('2026 Season', '2026-01-01') RETURNING id`,
	).Scan(&seasonID); err != nil {
		t.Fatalf("insert season failed: %v", err)
	}
	return seasonID
}

func insertEventTestEvent(t *testing.T, ctx context.Context, db *pgxpool.Pool, seasonID int64) int64 {
	t.Helper()
	var eventID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO events (season_id, name, starts_at, slots, currency, minimum_deposit_count, commercial_status)
		 VALUES ($1, 'Integration event', '2099-07-04T08:00:00Z', 12, 'EUR', 0, 'draft')
		 RETURNING id`,
		seasonID,
	).Scan(&eventID); err != nil {
		t.Fatalf("insert event failed: %v", err)
	}
	return eventID
}

func insertEventTestAircraft(t *testing.T, ctx context.Context, db *pgxpool.Pool) int64 {
	t.Helper()
	var aircraftID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO aircraft (name, pricing_model, rate_currency, rate_per_minute, cruising_speed_kmh, minimum_load_duration)
		 VALUES ('Caravan', 'time', 'EUR', 100, 180, 0)
		 RETURNING id`,
	).Scan(&aircraftID); err != nil {
		t.Fatalf("insert aircraft failed: %v", err)
	}
	return aircraftID
}

func insertEventTestAirfield(t *testing.T, ctx context.Context, db *pgxpool.Pool, name, latitude, longitude string) int64 {
	t.Helper()
	var airfieldID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO airfields (name, latitude, longitude, elevation, description)
		 VALUES ($1, $2, $3, 0, '') RETURNING id`,
		name,
		latitude,
		longitude,
	).Scan(&airfieldID); err != nil {
		t.Fatalf("insert airfield failed: %v", err)
	}
	return airfieldID
}

func attachEventTestAircraft(t *testing.T, ctx context.Context, db *pgxpool.Pool, eventID, aircraftID int64) {
	t.Helper()
	if _, err := db.Exec(
		ctx,
		`INSERT INTO event_aircraft (event_id, aircraft_id, sort_order) VALUES ($1, $2, 0)`,
		eventID,
		aircraftID,
	); err != nil {
		t.Fatalf("attach aircraft failed: %v", err)
	}
}

func insertEventTestInnhopp(t *testing.T, ctx context.Context, db *pgxpool.Pool, eventID, aircraftID int64) int64 {
	t.Helper()
	var innhoppID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO event_innhopps (event_id, sequence, name, coordinates, aircraft_id, scheduled_at)
		 VALUES ($1, 1, 'Original innhopp', '59.0 10.0', $2, '2099-07-04T09:00:00Z')
		 RETURNING id`,
		eventID,
		aircraftID,
	).Scan(&innhoppID); err != nil {
		t.Fatalf("insert innhopp failed: %v", err)
	}
	return innhoppID
}
