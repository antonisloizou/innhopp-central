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

	enforcer := rbac.NewEnforcer(func(r *http.Request) []rbac.Role {
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
            status TEXT NOT NULL DEFAULT 'draft',
            starts_at TIMESTAMPTZ NOT NULL,
            ends_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'`,
		`CREATE TABLE IF NOT EXISTS manifests (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            load_number INTEGER NOT NULL,
            scheduled_at TIMESTAMPTZ NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS event_participants (
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
            added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (event_id, participant_id)
        )`,
		`CREATE TABLE IF NOT EXISTS event_innhopps (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,
            name TEXT NOT NULL,
            scheduled_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS participant_profiles (
            id SERIAL PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            phone TEXT,
            experience_level TEXT,
            emergency_contact TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS crew_assignments (
            id SERIAL PRIMARY KEY,
            manifest_id INTEGER NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
            participant_id INTEGER NOT NULL REFERENCES participant_profiles(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
		`CREATE TABLE IF NOT EXISTS gear_assets (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            serial_number TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            location TEXT,
            inspected_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
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
