package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/auth"
	"github.com/innhopp/central/backend/events"
	"github.com/innhopp/central/backend/innhopps"
	"github.com/innhopp/central/backend/logistics"
	"github.com/innhopp/central/backend/participants"
	"github.com/innhopp/central/backend/rbac"
)

func main() {
	ctx := context.Background()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("failed to create connection pool: %v", err)
	}
	defer pool.Close()

	if err := ensureSchema(ctx, pool); err != nil {
		log.Fatalf("failed to ensure schema: %v", err)
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		sessionSecret = "dev-insecure-session-secret"
		log.Printf("SESSION_SECRET not set, using development fallback")
	}
	secureCookie := strings.EqualFold(os.Getenv("SESSION_COOKIE_SECURE"), "true")

	sessionManager, err := auth.NewSessionManager(sessionSecret, secureCookie)
	if err != nil {
		log.Fatalf("failed to configure sessions: %v", err)
	}

	authConfig := auth.Config{
		Issuer:       os.Getenv("OIDC_ISSUER"),
		ClientID:     os.Getenv("OIDC_CLIENT_ID"),
		ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("OIDC_REDIRECT_URL"),
	}

	authHandler, err := auth.NewHandler(pool, sessionManager, authConfig)
	if err != nil {
		log.Fatalf("failed to configure auth handler: %v", err)
	}

	router := chi.NewRouter()
	router.Use(
		middleware.RequestID,
		middleware.RealIP,
		middleware.Logger,
		middleware.Recoverer,
		middleware.Timeout(60*time.Second),
	)
	router.Use(sessionManager.Middleware)

	router.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	devBypass := strings.EqualFold(os.Getenv("DEV_ALLOW_ALL"), "true")

	enforcer := rbac.NewEnforcer(func(r *http.Request) []rbac.Role {
		if devBypass {
			return []rbac.Role{rbac.RoleAdmin}
		}
		claims := auth.FromContext(r.Context())
		if claims == nil {
			return nil
		}
		roles := make([]rbac.Role, 0, len(claims.Roles))
		for _, role := range claims.Roles {
			roles = append(roles, rbac.Role(role))
		}
		return roles
	})

	router.Mount("/api/auth", authHandler.Routes())
	router.Mount("/api/events", events.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/participants", participants.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/rbac", rbac.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/logistics", logistics.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/innhopps", innhopps.NewHandler(pool).Routes(enforcer))

	addr := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		addr = ":" + port
	}

	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func ensureSchema(ctx context.Context, pool *pgxpool.Pool) error {
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
            slots INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            starts_at TIMESTAMPTZ NOT NULL,
            ends_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS slots INTEGER NOT NULL DEFAULT 0`,
		`CREATE TABLE IF NOT EXISTS manifests (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    load_number INTEGER NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    staff_slots INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
		`ALTER TABLE manifests DROP COLUMN IF EXISTS scheduled_at`,
		`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE manifests ADD COLUMN IF NOT EXISTS staff_slots INTEGER`,
		`CREATE TABLE IF NOT EXISTS participant_profiles (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    experience_level TEXT,
    emergency_contact TEXT,
    roles TEXT[] NOT NULL DEFAULT ARRAY['Participant'],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['Participant']`,
		`CREATE TABLE IF NOT EXISTS event_participants (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, participant_id)
)`,
		`CREATE TABLE IF NOT EXISTS airfields (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            latitude TEXT NOT NULL,
            longitude TEXT NOT NULL,
            elevation INTEGER NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE airfields ALTER COLUMN latitude TYPE TEXT USING latitude::TEXT`,
		`ALTER TABLE airfields ALTER COLUMN longitude TYPE TEXT USING longitude::TEXT`,
		`CREATE TABLE IF NOT EXISTS event_innhopps (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    name TEXT NOT NULL,
    takeoff_airfield_id INTEGER REFERENCES airfields(id),
    elevation INTEGER,
    scheduled_at TIMESTAMPTZ,
    notes TEXT,
    coordinates TEXT,
    reason_for_choice TEXT,
    adjust_altimeter_aad TEXT,
    notam TEXT,
    distance_by_air NUMERIC,
    distance_by_road NUMERIC,
    primary_landing_area_name TEXT,
    primary_landing_area_description TEXT,
    primary_landing_area_size TEXT,
    primary_landing_area_obstacles TEXT,
    secondary_landing_area_name TEXT,
    secondary_landing_area_description TEXT,
    secondary_landing_area_size TEXT,
    secondary_landing_area_obstacles TEXT,
    risk_assessment TEXT,
    safety_precautions TEXT,
    jumprun TEXT,
    hospital TEXT,
    rescue_boat BOOLEAN,
    minimum_requirements TEXT,
    image_urls JSONB DEFAULT '[]'::jsonb,
    image_files JSONB DEFAULT '[]'::jsonb,
    land_owners JSONB,
    land_owner_permission BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS takeoff_airfield_id INTEGER REFERENCES airfields(id)`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS elevation INTEGER`,
		`ALTER TABLE event_innhopps ALTER COLUMN scheduled_at TYPE TIMESTAMPTZ USING scheduled_at::timestamptz`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS coordinates TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS reason_for_choice TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS adjust_altimeter_aad TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS notam TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS distance_by_air NUMERIC`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS distance_by_road NUMERIC`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS primary_landing_area_name TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS primary_landing_area_description TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS primary_landing_area_size TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS primary_landing_area_obstacles TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS secondary_landing_area_name TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS secondary_landing_area_description TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS secondary_landing_area_size TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS secondary_landing_area_obstacles TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS risk_assessment TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS safety_precautions TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS jumprun TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS hospital TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS rescue_boat BOOLEAN`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS minimum_requirements TEXT`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS image_files JSONB DEFAULT '[]'::jsonb`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS land_owners JSONB DEFAULT '[]'::jsonb`,
		`ALTER TABLE event_innhopps ADD COLUMN IF NOT EXISTS land_owner_permission BOOLEAN`,
		`CREATE TABLE IF NOT EXISTS manifest_participants (
    manifest_id INTEGER NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (manifest_id, participant_id)
)`,
		`CREATE TABLE IF NOT EXISTS crew_assignments (
            id SERIAL PRIMARY KEY,
            manifest_id INTEGER NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS event_airfields (
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            airfield_id INTEGER NOT NULL REFERENCES airfields(id) ON DELETE CASCADE,
            added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (event_id, airfield_id)
        )`,
		`CREATE TABLE IF NOT EXISTS event_accommodation (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            capacity INTEGER NOT NULL DEFAULT 0,
            coordinates TEXT,
            booked BOOLEAN,
            check_in_at TIMESTAMPTZ,
            check_out_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE event_accommodation ADD COLUMN IF NOT EXISTS coordinates TEXT`,
		`ALTER TABLE event_accommodation ADD COLUMN IF NOT EXISTS booked BOOLEAN`,
		`CREATE TABLE IF NOT EXISTS gear_assets (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            serial_number TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            location TEXT,
            inspected_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS logistics_transports (
            id SERIAL PRIMARY KEY,
            pickup_location TEXT NOT NULL,
            destination TEXT NOT NULL,
            passenger_count INTEGER NOT NULL,
            scheduled_at TIMESTAMPTZ,
            notes TEXT,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS notes TEXT`,
		`CREATE TABLE IF NOT EXISTS logistics_ground_crews (
            id SERIAL PRIMARY KEY,
            pickup_location TEXT NOT NULL,
            destination TEXT NOT NULL,
            passenger_count INTEGER NOT NULL,
            scheduled_at TIMESTAMPTZ,
            notes TEXT,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS notes TEXT`,
		`CREATE TABLE IF NOT EXISTS logistics_other (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            coordinates TEXT,
            scheduled_at TIMESTAMPTZ,
            description TEXT,
            notes TEXT,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_other ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE logistics_other ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL`,
		`ALTER TABLE logistics_other ADD COLUMN IF NOT EXISTS coordinates TEXT`,
		`ALTER TABLE logistics_other ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`,
		`ALTER TABLE logistics_other ADD COLUMN IF NOT EXISTS description TEXT`,
		`ALTER TABLE logistics_other ADD COLUMN IF NOT EXISTS notes TEXT`,
		`CREATE TABLE IF NOT EXISTS logistics_meals (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT,
            scheduled_at TIMESTAMPTZ,
            notes TEXT,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS location TEXT`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS notes TEXT`,
		`CREATE TABLE IF NOT EXISTS logistics_event_vehicles (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            driver TEXT,
            passenger_capacity INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS logistics_transport_vehicles (
            id SERIAL PRIMARY KEY,
            transport_id INTEGER NOT NULL REFERENCES logistics_transports(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            driver TEXT,
            passenger_capacity INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            event_vehicle_id INTEGER REFERENCES logistics_event_vehicles(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_transport_vehicles ADD COLUMN IF NOT EXISTS notes TEXT`,
		`ALTER TABLE logistics_transport_vehicles ADD COLUMN IF NOT EXISTS event_vehicle_id INTEGER REFERENCES logistics_event_vehicles(id) ON DELETE SET NULL`,
		`CREATE TABLE IF NOT EXISTS logistics_ground_crew_vehicles (
            id SERIAL PRIMARY KEY,
            ground_crew_id INTEGER NOT NULL REFERENCES logistics_ground_crews(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            driver TEXT,
            passenger_capacity INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            event_vehicle_id INTEGER REFERENCES logistics_event_vehicles(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_ground_crew_vehicles ADD COLUMN IF NOT EXISTS notes TEXT`,
		`ALTER TABLE logistics_ground_crew_vehicles ADD COLUMN IF NOT EXISTS event_vehicle_id INTEGER REFERENCES logistics_event_vehicles(id) ON DELETE SET NULL`,
		`CREATE TABLE IF NOT EXISTS accounts (
            id SERIAL PRIMARY KEY,
            subject TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            full_name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS roles (
            name TEXT PRIMARY KEY,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS account_roles (
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            role_name TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (account_id, role_name)
        )`,
	}

	for _, stmt := range stmts {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}

	if err := seedRoles(ctx, pool); err != nil {
		return err
	}

	return nil
}

func seedRoles(ctx context.Context, pool *pgxpool.Pool) error {
	type roleSeed struct {
		name        string
		description string
	}

	seeds := []roleSeed{
		{name: string(rbac.RoleAdmin), description: "Full platform administration"},
		{name: string(rbac.RoleStaff), description: "Dropzone staff operations"},
		{name: string(rbac.RoleJumpMaster), description: "Jump master manifest authority"},
		{name: string(rbac.RoleJumpLeader), description: "Jump leader manifest visibility"},
		{name: string(rbac.RoleGroundCrew), description: "Ground crew logistics"},
		{name: string(rbac.RoleDriver), description: "Driver logistics coordination"},
		{name: string(rbac.RolePacker), description: "Rigging and packing responsibilities"},
		{name: string(rbac.RoleParticipant), description: "Participant self-service access"},
	}

	batch := &pgx.Batch{}
	for _, seed := range seeds {
		batch.Queue(`INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`, seed.name, seed.description)
	}

	br := pool.SendBatch(ctx, batch)
	defer br.Close()
	for range seeds {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}
