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
	"github.com/innhopp/central/backend/budgets"
	"github.com/innhopp/central/backend/comms"
	"github.com/innhopp/central/backend/events"
	"github.com/innhopp/central/backend/innhopps"
	"github.com/innhopp/central/backend/logistics"
	"github.com/innhopp/central/backend/participants"
	"github.com/innhopp/central/backend/rbac"
	"github.com/innhopp/central/backend/registrations"
)

func main() {
	ctx := context.Background()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable"
	}

	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatalf("failed to parse database config: %v", err)
	}
	poolConfig.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	poolConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET TIME ZONE 'UTC'")
		return err
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		log.Fatalf("failed to create connection pool: %v", err)
	}
	defer pool.Close()

	if err := ensureSchema(ctx, pool); err != nil {
		log.Fatalf("failed to ensure schema: %v", err)
	}
	backfillCtx, cancelBackfill := context.WithTimeout(ctx, 2*time.Minute)
	if err := logistics.BackfillLegacyReferenceIDs(backfillCtx, pool); err != nil {
		log.Printf("legacy id backfill failed: %v", err)
	}
	if err := logistics.BackfillMissingRouteDurations(backfillCtx, pool); err != nil {
		log.Printf("route duration backfill failed: %v", err)
	}
	if err := registrations.BackfillEventRosterSync(backfillCtx, pool); err != nil {
		log.Printf("event/registration sync backfill failed: %v", err)
	}
	if err := registrations.BackfillStaffRegistrations(backfillCtx, pool); err != nil {
		log.Printf("staff registration backfill failed: %v", err)
	}
	cancelBackfill()
	runRegistrationExpirySweep(pool)
	go startRegistrationExpiryWorker(pool)

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
		FrontendURL:  os.Getenv("FRONTEND_URL"),
		DevAllowAll:  strings.EqualFold(os.Getenv("DEV_ALLOW_ALL"), "true"),
	}
	logMissingOIDCConfig(authConfig)
	budgetsV1Enabled := !strings.EqualFold(strings.TrimSpace(os.Getenv("BUDGETS_V1")), "false")

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

	devBypass := authConfig.DevAllowAll

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
	if budgetsV1Enabled {
		router.Mount("/api/events/{eventID}/budget", budgets.NewHandler(pool).EventBudgetRoutes(enforcer))
	}
	router.Mount("/api/events", events.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/participants", participants.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/registrations", registrations.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/comms", comms.NewHandler(pool, authConfig.FrontendURL).Routes(enforcer))
	router.Mount("/api/rbac", rbac.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/logistics", logistics.NewHandler(pool).Routes(enforcer))
	router.Mount("/api/innhopps", innhopps.NewHandler(pool).Routes(enforcer))
	if budgetsV1Enabled {
		router.Mount("/api/budgets", budgets.NewHandler(pool).Routes(enforcer))
	}

	addr := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		addr = ":" + port
	}

	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func logMissingOIDCConfig(cfg auth.Config) {
	missing := make([]string, 0, 4)
	if strings.TrimSpace(cfg.Issuer) == "" {
		missing = append(missing, "OIDC_ISSUER")
	}
	if strings.TrimSpace(cfg.ClientID) == "" {
		missing = append(missing, "OIDC_CLIENT_ID")
	}
	if strings.TrimSpace(cfg.RedirectURL) == "" {
		missing = append(missing, "OIDC_REDIRECT_URL")
	}
	if strings.TrimSpace(cfg.FrontendURL) == "" {
		missing = append(missing, "FRONTEND_URL")
	}

	if len(missing) == 0 {
		log.Printf("OIDC config detected for issuer %s with redirect %s", cfg.Issuer, cfg.RedirectURL)
		return
	}

	log.Printf("OIDC is partially configured; missing: %s", strings.Join(missing, ", "))
	if strings.TrimSpace(cfg.ClientSecret) == "" {
		log.Printf("OIDC_CLIENT_SECRET is not set; Google usually requires it for web application clients")
	}
}

func runRegistrationExpirySweep(pool *pgxpool.Pool) {
	sweepCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rows, err := registrations.ExpireOverdueRegistrations(sweepCtx, pool)
	if err != nil {
		log.Printf("registration expiry sweep failed: %v", err)
		return
	}
	if rows > 0 {
		log.Printf("registration expiry sweep marked %d registrations as expired", rows)
	}
}

func startRegistrationExpiryWorker(pool *pgxpool.Pool) {
	for {
		now := time.Now().UTC()
		next := time.Date(now.Year(), now.Month(), now.Day(), 0, 1, 0, 0, time.UTC)
		if !now.Before(next) {
			next = next.Add(24 * time.Hour)
		}
		timer := time.NewTimer(time.Until(next))
		<-timer.C
		runRegistrationExpirySweep(pool)
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
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS public_registration_slug TEXT`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS public_registration_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_open_at TIMESTAMPTZ`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS main_invoice_deadline TIMESTAMPTZ`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2)`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS main_invoice_amount NUMERIC(12,2)`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR'`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS minimum_deposit_count INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL DEFAULT 'draft'`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'balance_deadline'
			) THEN
				UPDATE events
				SET main_invoice_deadline = COALESCE(main_invoice_deadline, balance_deadline)
				WHERE balance_deadline IS NOT NULL;
			END IF;
		END $$`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'balance_amount'
			) THEN
				UPDATE events
				SET main_invoice_amount = COALESCE(main_invoice_amount, balance_amount)
				WHERE balance_amount IS NOT NULL;
			END IF;
		END $$`,
		`ALTER TABLE events DROP COLUMN IF EXISTS balance_deadline`,
		`ALTER TABLE events DROP COLUMN IF EXISTS balance_amount`,
		`ALTER TABLE events DROP COLUMN IF EXISTS deposit_deadline`,
		`ALTER TABLE events DROP COLUMN IF EXISTS registration_close_at`,
		`CREATE UNIQUE INDEX IF NOT EXISTS events_public_registration_slug_idx
            ON events ((lower(public_registration_slug)))
            WHERE public_registration_slug IS NOT NULL AND btrim(public_registration_slug) <> ''`,
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
    whatsapp TEXT,
    instagram TEXT,
    citizenship TEXT,
    date_of_birth TEXT,
    jumper BOOLEAN NOT NULL DEFAULT FALSE,
    years_in_sport INTEGER,
    jump_count INTEGER,
    recent_jump_count INTEGER,
    main_canopy TEXT,
    wingload TEXT,
    license TEXT,
    roles TEXT[] NOT NULL DEFAULT ARRAY['Participant'],
    ratings TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    disciplines TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    other_air_sports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    canopy_course TEXT,
    landing_area_preference TEXT,
    tshirt_size TEXT,
    tshirt_gender TEXT,
    account_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    dietary_restrictions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    medical_conditions TEXT,
    medical_expertise TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    hss_qualities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['Participant']`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS instagram TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS citizenship TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS date_of_birth TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS jumper BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS years_in_sport INTEGER`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS jump_count INTEGER`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS recent_jump_count INTEGER`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS main_canopy TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS wingload TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS license TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS ratings TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS disciplines TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS other_air_sports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS canopy_course TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS landing_area_preference TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS tshirt_size TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS tshirt_gender TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS account_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS medical_conditions TEXT`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS medical_expertise TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS hss_qualities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`UPDATE participant_profiles
		 SET hss_qualities = array_remove(hss_qualities, 'Experiment with drugs')
		 WHERE hss_qualities @> ARRAY['Experiment with drugs']::TEXT[]`,
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
		`ALTER TABLE event_innhopps ALTER COLUMN distance_by_air TYPE NUMERIC USING distance_by_air::numeric`,
		`ALTER TABLE event_innhopps ALTER COLUMN distance_by_road TYPE NUMERIC USING distance_by_road::numeric`,
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
            pickup_location_type TEXT,
            pickup_location_id INTEGER,
            destination TEXT NOT NULL,
            destination_type TEXT,
            destination_id INTEGER,
            passenger_count INTEGER NOT NULL,
            duration_minutes INTEGER,
            scheduled_at TIMESTAMPTZ,
            notes TEXT,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS notes TEXT`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS pickup_location_type TEXT`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS pickup_location_id INTEGER`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS destination_type TEXT`,
		`ALTER TABLE logistics_transports ADD COLUMN IF NOT EXISTS destination_id INTEGER`,
		`CREATE TABLE IF NOT EXISTS logistics_ground_crews (
            id SERIAL PRIMARY KEY,
            pickup_location TEXT NOT NULL,
            pickup_location_type TEXT,
            pickup_location_id INTEGER,
            destination TEXT NOT NULL,
            destination_type TEXT,
            destination_id INTEGER,
            passenger_count INTEGER NOT NULL,
            duration_minutes INTEGER,
            scheduled_at TIMESTAMPTZ,
            notes TEXT,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS notes TEXT`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS pickup_location_type TEXT`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS pickup_location_id INTEGER`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS destination_type TEXT`,
		`ALTER TABLE logistics_ground_crews ADD COLUMN IF NOT EXISTS destination_id INTEGER`,
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
            location_type TEXT,
            location_id INTEGER,
            scheduled_at TIMESTAMPTZ,
            notes TEXT,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS location TEXT`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS location_type TEXT`,
		`ALTER TABLE logistics_meals ADD COLUMN IF NOT EXISTS location_id INTEGER`,
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
		`ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'EUR'`,
		`ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS aircraft_currency TEXT NOT NULL DEFAULT 'EUR'`,
		`ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS notes TEXT`,
		`ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
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
            innhopp_id INTEGER,
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
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS service_date DATE`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS location_label TEXT`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS innhopp_id INTEGER`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,3) NOT NULL DEFAULT 1`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS cost_currency TEXT NOT NULL DEFAULT 'EUR'`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS notes TEXT`,
		`ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`CREATE TABLE IF NOT EXISTS budget_currencies (
            id SERIAL PRIMARY KEY,
            budget_id INTEGER NOT NULL REFERENCES event_budgets(id) ON DELETE CASCADE,
            currency_code TEXT NOT NULL,
            rate_to_base NUMERIC(16,6) NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (budget_id, currency_code)
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
		`ALTER TABLE budget_assumptions ADD COLUMN IF NOT EXISTS value_num NUMERIC(16,4)`,
		`ALTER TABLE budget_assumptions ADD COLUMN IF NOT EXISTS value_text TEXT`,
		`ALTER TABLE budget_assumptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`DELETE FROM budget_assumptions WHERE key = 'aircraft_load_count'`,
		`CREATE TABLE IF NOT EXISTS budget_scenarios (
            id SERIAL PRIMARY KEY,
            budget_id INTEGER NOT NULL REFERENCES event_budgets(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            results_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE budget_scenarios ADD COLUMN IF NOT EXISTS inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`ALTER TABLE budget_scenarios ADD COLUMN IF NOT EXISTS results_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`ALTER TABLE budget_scenarios ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN NOT NULL DEFAULT FALSE`,
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
		`ALTER TABLE participant_profiles ADD COLUMN IF NOT EXISTS account_id INTEGER UNIQUE REFERENCES accounts(id) ON DELETE SET NULL`,
		`CREATE TABLE IF NOT EXISTS event_registrations (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'deposit_pending',
            source TEXT,
            registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deposit_due_at DATE,
            deposit_paid_at DATE,
            main_invoice_due_at DATE,
            main_invoice_paid_at DATE,
            cancelled_at TIMESTAMPTZ,
            expired_at TIMESTAMPTZ,
            waitlist_position INTEGER,
            staff_owner_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            internal_notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'deposit_pending'`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS source TEXT`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS deposit_due_at DATE`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS deposit_paid_at DATE`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS main_invoice_due_at DATE`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS main_invoice_paid_at DATE`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS waitlist_position INTEGER`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS staff_owner_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS internal_notes TEXT`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'event_registrations'
				  AND column_name = 'deposit_due_at'
				  AND data_type <> 'date'
			) THEN
				ALTER TABLE event_registrations
				ALTER COLUMN deposit_due_at TYPE DATE
				USING deposit_due_at::date;
			END IF;
		END $$`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'event_registrations'
				  AND column_name = 'deposit_paid_at'
				  AND data_type <> 'date'
			) THEN
				ALTER TABLE event_registrations
				ALTER COLUMN deposit_paid_at TYPE DATE
				USING deposit_paid_at::date;
			END IF;
		END $$`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'event_registrations'
				  AND column_name = 'main_invoice_paid_at'
				  AND data_type <> 'date'
			) THEN
				ALTER TABLE event_registrations
				ALTER COLUMN main_invoice_paid_at TYPE DATE
				USING main_invoice_paid_at::date;
			END IF;
		END $$`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'event_registrations'
				  AND column_name = 'main_invoice_due_at'
				  AND data_type <> 'date'
			) THEN
				ALTER TABLE event_registrations
				ALTER COLUMN main_invoice_due_at TYPE DATE
				USING main_invoice_due_at::date;
			END IF;
		END $$`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'balance_due_at'
			) AND EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'balance_paid_at'
			) THEN
				UPDATE event_registrations
				SET main_invoice_due_at = COALESCE(main_invoice_due_at, balance_due_at),
				    main_invoice_paid_at = COALESCE(main_invoice_paid_at, balance_paid_at)
				WHERE balance_due_at IS NOT NULL OR balance_paid_at IS NOT NULL;
			ELSIF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'balance_due_at'
			) THEN
				UPDATE event_registrations
				SET main_invoice_due_at = COALESCE(main_invoice_due_at, balance_due_at)
				WHERE balance_due_at IS NOT NULL;
			ELSIF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'balance_paid_at'
			) THEN
				UPDATE event_registrations
				SET main_invoice_paid_at = COALESCE(main_invoice_paid_at, balance_paid_at)
				WHERE balance_paid_at IS NOT NULL;
			END IF;
		END $$`,
		`ALTER TABLE event_registrations DROP COLUMN IF EXISTS balance_due_at`,
		`ALTER TABLE event_registrations DROP COLUMN IF EXISTS balance_paid_at`,
		`UPDATE event_registrations SET status = 'main_invoice_pending' WHERE status = 'balance_pending'`,
		`UPDATE event_registrations SET status = 'completed' WHERE status = 'fully_paid'`,
		`CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_active_participant_idx
            ON event_registrations (event_id, participant_id)
            WHERE cancelled_at IS NULL AND expired_at IS NULL`,
		`CREATE TABLE IF NOT EXISTS registration_payments (
            id SERIAL PRIMARY KEY,
            registration_id INTEGER NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'EUR',
            status TEXT NOT NULL DEFAULT 'pending',
            due_at DATE,
            paid_at DATE,
            provider TEXT,
            provider_ref TEXT,
            recorded_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'deposit'`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR'`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS due_at DATE`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS paid_at DATE`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'registration_payments'
				  AND column_name = 'due_at'
				  AND data_type <> 'date'
			) THEN
				ALTER TABLE registration_payments
				ALTER COLUMN due_at TYPE DATE
				USING due_at::date;
			END IF;
		END $$`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'registration_payments'
				  AND column_name = 'paid_at'
				  AND data_type <> 'date'
			) THEN
				ALTER TABLE registration_payments
				ALTER COLUMN paid_at TYPE DATE
				USING paid_at::date;
			END IF;
		END $$`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS provider TEXT`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS provider_ref TEXT`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS recorded_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS notes TEXT`,
		`ALTER TABLE registration_payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`UPDATE registration_payments SET kind = 'main_invoice' WHERE kind = 'balance'`,
		`UPDATE registration_payments
		 SET paid_at = COALESCE(paid_at, due_at, created_at::date, CURRENT_DATE)
		 WHERE status IN ('paid', 'waived') AND paid_at IS NULL`,
		`WITH payment_markers AS (
			SELECT registration_id,
			       MAX(COALESCE(paid_at, CURRENT_DATE)) FILTER (WHERE kind = 'deposit' AND status IN ('paid', 'waived')) AS deposit_paid_at,
			       MAX(COALESCE(paid_at, CURRENT_DATE)) FILTER (WHERE kind = 'main_invoice' AND status IN ('paid', 'waived')) AS main_invoice_paid_at
			FROM registration_payments
			GROUP BY registration_id
		)
		UPDATE event_registrations r
		SET deposit_paid_at = pm.deposit_paid_at,
		    main_invoice_paid_at = pm.main_invoice_paid_at,
		    updated_at = NOW()
		FROM payment_markers pm
		WHERE r.id = pm.registration_id
		  AND (
			r.deposit_paid_at IS DISTINCT FROM pm.deposit_paid_at
			OR r.main_invoice_paid_at IS DISTINCT FROM pm.main_invoice_paid_at
		  )`,
		`CREATE TABLE IF NOT EXISTS registration_activity (
            id SERIAL PRIMARY KEY,
            registration_id INTEGER NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            summary TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE registration_activity ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'note'`,
		`ALTER TABLE registration_activity ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE registration_activity ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`ALTER TABLE registration_activity ADD COLUMN IF NOT EXISTS created_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`,
		`ALTER TABLE registration_activity ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`CREATE TABLE IF NOT EXISTS email_templates (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            subject_template TEXT NOT NULL,
            body_template TEXT NOT NULL,
            audience_type TEXT NOT NULL DEFAULT 'event_registrations',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS key TEXT`,
		`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS name TEXT`,
		`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS subject_template TEXT`,
		`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS body_template TEXT`,
		`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS audience_type TEXT NOT NULL DEFAULT 'event_registrations'`,
		`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE`,
		`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`CREATE UNIQUE INDEX IF NOT EXISTS email_templates_key_idx ON email_templates ((lower(key)))`,
		`CREATE TABLE IF NOT EXISTS email_campaigns (
            id SERIAL PRIMARY KEY,
            event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
            template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
            mode TEXT NOT NULL DEFAULT 'manual',
            filter_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            scheduled_for TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'draft',
            created_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'manual'`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS filter_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS created_by_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`,
		`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`CREATE TABLE IF NOT EXISTS email_deliveries (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
            registration_id INTEGER REFERENCES event_registrations(id) ON DELETE SET NULL,
            email TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            provider_message_id TEXT,
            status TEXT NOT NULL DEFAULT 'queued',
            sent_at TIMESTAMPTZ,
            failed_at TIMESTAMPTZ,
            error_message TEXT
        )`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS registration_id INTEGER REFERENCES event_registrations(id) ON DELETE SET NULL`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS email TEXT`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS subject TEXT`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS body TEXT`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS provider_message_id TEXT`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued'`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ`,
		`ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS error_message TEXT`,
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
