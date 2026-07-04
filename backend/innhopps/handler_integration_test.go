package innhopps

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

func TestUpdateInnhoppPreservesAircraftWhenAircraftIDOmitted(t *testing.T) {
	db := openInnhoppTestDB(t)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ensureInnhoppTestSchema(t, ctx, db)

	eventID := insertInnhoppTestEvent(t, ctx, db)
	aircraftID := insertInnhoppTestAircraft(t, ctx, db)
	attachInnhoppTestAircraft(t, ctx, db, eventID, aircraftID)
	innhoppID := insertInnhoppTestRow(t, ctx, db, eventID, aircraftID)

	h := NewHandler(db)
	router := chi.NewRouter()
	router.Put("/api/innhopps/{innhoppID}", h.updateInnhopp)

	body := bytes.NewBufferString(`{"name":"Updated innhopp","sequence":1,"coordinates":"59.0 10.0","scheduled_at":"2099-07-04T09:00","notes":"still editing"}`)
	req := httptest.NewRequest(http.MethodPut, "/api/innhopps/"+strconv.FormatInt(innhoppID, 10), body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update status mismatch: got %d body=%s", rec.Code, rec.Body.String())
	}

	var updated Innhopp
	if err := json.NewDecoder(rec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated innhopp failed: %v", err)
	}
	if updated.AircraftID == nil || *updated.AircraftID != aircraftID {
		t.Fatalf("expected response aircraft_id to remain %d, got %+v", aircraftID, updated.AircraftID)
	}

	var persisted sql.NullInt64
	if err := db.QueryRow(ctx, `SELECT aircraft_id FROM event_innhopps WHERE id = $1`, innhoppID).Scan(&persisted); err != nil {
		t.Fatalf("load persisted aircraft_id failed: %v", err)
	}
	if !persisted.Valid || persisted.Int64 != aircraftID {
		t.Fatalf("expected persisted aircraft_id to remain %d, got valid=%t value=%d", aircraftID, persisted.Valid, persisted.Int64)
	}
}

func openInnhoppTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set; skipping innhopp integration tests")
	}
	db, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect db failed: %v", err)
	}
	return db
}

func ensureInnhoppTestSchema(t *testing.T, ctx context.Context, db *pgxpool.Pool) {
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
		`CREATE TABLE IF NOT EXISTS event_airfields (
			event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			airfield_id INTEGER NOT NULL,
			PRIMARY KEY (event_id, airfield_id)
		)`,
		`CREATE TABLE IF NOT EXISTS event_innhopps (
			id SERIAL PRIMARY KEY,
			event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			sequence INTEGER NOT NULL DEFAULT 1,
			name TEXT NOT NULL,
			aircraft_id INTEGER,
			coordinates TEXT NOT NULL DEFAULT '',
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
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(ctx, stmt); err != nil {
			t.Fatalf("schema statement failed: %v", err)
		}
	}
}

func insertInnhoppTestEvent(t *testing.T, ctx context.Context, db *pgxpool.Pool) int64 {
	t.Helper()
	var seasonID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO seasons (name, starts_on) VALUES ('2099 Season', '2099-01-01') RETURNING id`,
	).Scan(&seasonID); err != nil {
		t.Fatalf("insert test season failed: %v", err)
	}
	var eventID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO events (season_id, name, starts_at) VALUES ($1, 'Integration event', '2099-07-04T08:00:00Z') RETURNING id`,
		seasonID,
	).Scan(&eventID); err != nil {
		t.Fatalf("insert test event failed: %v", err)
	}
	return eventID
}

func insertInnhoppTestAircraft(t *testing.T, ctx context.Context, db *pgxpool.Pool) int64 {
	t.Helper()
	var aircraftID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO aircraft (name, pricing_model, rate_currency, rate_per_minute, cruising_speed_kmh, minimum_load_duration)
		 VALUES ('Caravan', 'time', 'EUR', 100, 180, 0)
		 RETURNING id`,
	).Scan(&aircraftID); err != nil {
		t.Fatalf("insert test aircraft failed: %v", err)
	}
	return aircraftID
}

func attachInnhoppTestAircraft(t *testing.T, ctx context.Context, db *pgxpool.Pool, eventID, aircraftID int64) {
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

func insertInnhoppTestRow(t *testing.T, ctx context.Context, db *pgxpool.Pool, eventID, aircraftID int64) int64 {
	t.Helper()
	var innhoppID int64
	if err := db.QueryRow(
		ctx,
		`INSERT INTO event_innhopps (event_id, sequence, name, aircraft_id, coordinates, scheduled_at)
		 VALUES ($1, 1, 'Original innhopp', $2, '59.0 10.0', '2099-07-04T09:00:00Z')
		 RETURNING id`,
		eventID,
		aircraftID,
	).Scan(&innhoppID); err != nil {
		t.Fatalf("insert test innhopp failed: %v", err)
	}
	return innhoppID
}
