package participants

import (
	"context"
	"errors"
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

// Handler exposes participant profile endpoints.
type Handler struct {
	db *pgxpool.Pool
}

// NewHandler creates a participants handler.
func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

// Routes registers participant routes.
func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.Get("/profiles/me", h.getOwnProfile)
	r.Put("/profiles/me", h.upsertOwnProfile)
	r.With(enforcer.Authorize(rbac.PermissionViewParticipants)).Get("/profiles", h.listProfiles)
	r.With(enforcer.Authorize(rbac.PermissionManageParticipants)).Post("/profiles", h.createProfile)
	r.With(enforcer.Authorize(rbac.PermissionViewParticipants)).Get("/profiles/{profileID}", h.getProfile)
	r.With(enforcer.Authorize(rbac.PermissionManageParticipants)).Put("/profiles/{profileID}", h.updateProfile)
	r.With(enforcer.Authorize(rbac.PermissionManageParticipants)).Delete("/profiles/{profileID}", h.deleteProfile)
	return r
}

type Profile struct {
	ID                    int64     `json:"id"`
	FullName              string    `json:"full_name"`
	Email                 string    `json:"email"`
	Phone                 string    `json:"phone,omitempty"`
	ExperienceLevel       string    `json:"experience_level,omitempty"`
	EmergencyContact      string    `json:"emergency_contact,omitempty"`
	Whatsapp              string    `json:"whatsapp,omitempty"`
	Instagram             string    `json:"instagram,omitempty"`
	Citizenship           string    `json:"citizenship,omitempty"`
	DateOfBirth           string    `json:"date_of_birth,omitempty"`
	Jumper                bool      `json:"jumper"`
	YearsInSport          *int      `json:"years_in_sport,omitempty"`
	JumpCount             *int      `json:"jump_count,omitempty"`
	RecentJumpCount       *int      `json:"recent_jump_count,omitempty"`
	MainCanopy            string    `json:"main_canopy,omitempty"`
	Wingload              string    `json:"wingload,omitempty"`
	License               string    `json:"license,omitempty"`
	Roles                 []string  `json:"roles"`
	Ratings               []string  `json:"ratings"`
	Disciplines           []string  `json:"disciplines"`
	OtherAirSports        []string  `json:"other_air_sports"`
	CanopyCourse          string    `json:"canopy_course,omitempty"`
	LandingAreaPreference string    `json:"landing_area_preference,omitempty"`
	TshirtSize            string    `json:"tshirt_size,omitempty"`
	TshirtGender          string    `json:"tshirt_gender,omitempty"`
	DietaryRestrictions   []string  `json:"dietary_restrictions"`
	MedicalConditions     string    `json:"medical_conditions,omitempty"`
	MedicalExpertise      []string  `json:"medical_expertise"`
	HSSQualities          []string  `json:"hss_qualities"`
	AccountRoles          []string  `json:"account_roles"`
	CreatedAt             time.Time `json:"created_at"`
}

type profilePayload struct {
	FullName              string   `json:"full_name"`
	Email                 string   `json:"email"`
	Phone                 string   `json:"phone"`
	ExperienceLevel       string   `json:"experience_level"`
	EmergencyContact      string   `json:"emergency_contact"`
	Whatsapp              string   `json:"whatsapp"`
	Instagram             string   `json:"instagram"`
	Citizenship           string   `json:"citizenship"`
	DateOfBirth           string   `json:"date_of_birth"`
	Jumper                bool     `json:"jumper"`
	YearsInSport          *int     `json:"years_in_sport"`
	JumpCount             *int     `json:"jump_count"`
	RecentJumpCount       *int     `json:"recent_jump_count"`
	MainCanopy            string   `json:"main_canopy"`
	Wingload              string   `json:"wingload"`
	License               string   `json:"license"`
	Roles                 []string `json:"roles"`
	Ratings               []string `json:"ratings"`
	Disciplines           []string `json:"disciplines"`
	OtherAirSports        []string `json:"other_air_sports"`
	CanopyCourse          string   `json:"canopy_course"`
	LandingAreaPreference string   `json:"landing_area_preference"`
	TshirtSize            string   `json:"tshirt_size"`
	TshirtGender          string   `json:"tshirt_gender"`
	DietaryRestrictions   []string `json:"dietary_restrictions"`
	MedicalConditions     string   `json:"medical_conditions"`
	MedicalExpertise      []string `json:"medical_expertise"`
	HSSQualities          []string `json:"hss_qualities"`
	AccountRoles          []string `json:"account_roles"`
}

const profileSelectColumns = `
	id,
	full_name,
	email,
	COALESCE(phone, ''),
	COALESCE(experience_level, ''),
	COALESCE(emergency_contact, ''),
	COALESCE(whatsapp, ''),
	COALESCE(instagram, ''),
	COALESCE(citizenship, ''),
	COALESCE(date_of_birth, ''),
	jumper,
	years_in_sport,
	jump_count,
	recent_jump_count,
	COALESCE(main_canopy, ''),
	COALESCE(wingload, ''),
	COALESCE(license, ''),
	COALESCE(roles, ARRAY['Participant']::TEXT[]),
	COALESCE(ratings, ARRAY[]::TEXT[]),
	COALESCE(disciplines, ARRAY[]::TEXT[]),
	COALESCE(other_air_sports, ARRAY[]::TEXT[]),
	COALESCE(canopy_course, ''),
	COALESCE(landing_area_preference, ''),
	COALESCE(tshirt_size, ''),
	COALESCE(tshirt_gender, ''),
	COALESCE(account_roles, ARRAY[]::TEXT[]),
	COALESCE(dietary_restrictions, ARRAY[]::TEXT[]),
	COALESCE(medical_conditions, ''),
	COALESCE(medical_expertise, ARRAY[]::TEXT[]),
	COALESCE(hss_qualities, ARRAY[]::TEXT[]),
	created_at
`

var allowedRoles = map[string]struct{}{
	"Participant": {},
	"Skydiver":    {},
	"Staff":       {},
	"Ground Crew": {},
	"Jump Master": {},
	"Jump Leader": {},
	"Driver":      {},
	"Pilot":       {},
	"POC":         {},
	"Photo":       {},
}

var allowedAccountRoles = map[string]struct{}{
	string(rbac.RoleAdmin):       {},
	string(rbac.RoleStaff):       {},
	string(rbac.RoleJumpMaster):  {},
	string(rbac.RoleJumpLeader):  {},
	string(rbac.RoleGroundCrew):  {},
	string(rbac.RoleDriver):      {},
	string(rbac.RolePacker):      {},
	string(rbac.RoleParticipant): {},
}

func normalizeRoles(input []string) []string {
	seen := make(map[string]struct{})
	var roles []string
	for _, r := range input {
		trimmed := strings.TrimSpace(r)
		if trimmed == "" {
			continue
		}
		if trimmed == "COP" {
			trimmed = "POC"
		}
		if _, ok := allowedRoles[trimmed]; !ok {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		roles = append(roles, trimmed)
	}
	if len(roles) == 0 {
		return []string{"Participant"}
	}
	return roles
}

func syncParticipantRolesWithAccountRoles(roles []string, accountRoles []string) []string {
	current := make(map[string]struct{})
	for _, role := range normalizeRoles(roles) {
		current[role] = struct{}{}
	}
	for _, role := range normalizeAccountRoles(accountRoles) {
		if role == string(rbac.RoleAdmin) {
			current["Staff"] = struct{}{}
			break
		}
	}
	out := make([]string, 0, len(current))
	for role := range current {
		out = append(out, role)
	}
	return normalizeRoles(out)
}

func allowSelfRoleRemoval(existingRoles []string, requestedRoles []string) []string {
	current := make(map[string]struct{})
	for _, role := range normalizeRoles(existingRoles) {
		current[role] = struct{}{}
	}
	requested := make(map[string]struct{})
	for _, role := range normalizeRoles(requestedRoles) {
		requested[role] = struct{}{}
	}
	if _, hasStaff := current["Staff"]; hasStaff {
		if _, keepStaff := requested["Staff"]; !keepStaff {
			delete(current, "Staff")
		}
	}
	out := make([]string, 0, len(current))
	for role := range current {
		out = append(out, role)
	}
	return normalizeRoles(out)
}

func allowSelfAccountRoleRemoval(existingRoles []string, requestedRoles []string) []string {
	current := make(map[string]struct{})
	for _, role := range normalizeAccountRoles(existingRoles) {
		current[role] = struct{}{}
	}
	requested := make(map[string]struct{})
	for _, role := range normalizeAccountRoles(requestedRoles) {
		requested[role] = struct{}{}
	}
	if _, hasAdmin := current[string(rbac.RoleAdmin)]; hasAdmin {
		if _, keepAdmin := requested[string(rbac.RoleAdmin)]; !keepAdmin {
			delete(current, string(rbac.RoleAdmin))
		}
	}
	out := make([]string, 0, len(current))
	for role := range current {
		out = append(out, role)
	}
	return normalizeAccountRoles(out)
}

func normalizeStringList(input []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(input))
	for _, raw := range input {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func normalizeAccountRoles(input []string) []string {
	normalized := normalizeStringList(input)
	out := make([]string, 0, len(normalized)+1)
	hasAdmin := false
	hasStaff := false
	for _, role := range normalized {
		key := strings.ToLower(strings.TrimSpace(role))
		if _, ok := allowedAccountRoles[key]; !ok {
			continue
		}
		if key == string(rbac.RoleAdmin) {
			hasAdmin = true
		}
		if key == string(rbac.RoleStaff) {
			hasStaff = true
		}
		out = append(out, key)
	}
	if hasAdmin && !hasStaff {
		out = append(out, string(rbac.RoleStaff))
	}
	return out
}

func normalizeOptionalString(value string) string {
	return strings.TrimSpace(value)
}

func normalizeOptionalInt(value *int) *int {
	if value == nil {
		return nil
	}
	if *value < 0 {
		next := 0
		return &next
	}
	return value
}

func nullableAccountID(accountID int64) any {
	if accountID <= 0 {
		return nil
	}
	return accountID
}

func canManageAccountRoles(ctx context.Context) bool {
	claims := auth.FromContext(ctx)
	if claims == nil {
		return false
	}
	for _, role := range claims.Roles {
		if strings.EqualFold(strings.TrimSpace(role), string(rbac.RoleAdmin)) {
			return true
		}
	}
	return false
}

func scanProfile(scanner interface{ Scan(dest ...any) error }) (*Profile, error) {
	var profile Profile
	if err := scanner.Scan(
		&profile.ID,
		&profile.FullName,
		&profile.Email,
		&profile.Phone,
		&profile.ExperienceLevel,
		&profile.EmergencyContact,
		&profile.Whatsapp,
		&profile.Instagram,
		&profile.Citizenship,
		&profile.DateOfBirth,
		&profile.Jumper,
		&profile.YearsInSport,
		&profile.JumpCount,
		&profile.RecentJumpCount,
		&profile.MainCanopy,
		&profile.Wingload,
		&profile.License,
		&profile.Roles,
		&profile.Ratings,
		&profile.Disciplines,
		&profile.OtherAirSports,
		&profile.CanopyCourse,
		&profile.LandingAreaPreference,
		&profile.TshirtSize,
		&profile.TshirtGender,
		&profile.AccountRoles,
		&profile.DietaryRestrictions,
		&profile.MedicalConditions,
		&profile.MedicalExpertise,
		&profile.HSSQualities,
		&profile.CreatedAt,
	); err != nil {
		return nil, err
	}

	profile.Email = strings.ToLower(strings.TrimSpace(profile.Email))
	profile.Roles = normalizeRoles(profile.Roles)
	profile.Ratings = normalizeStringList(profile.Ratings)
	profile.Disciplines = normalizeStringList(profile.Disciplines)
	profile.OtherAirSports = normalizeStringList(profile.OtherAirSports)
	profile.AccountRoles = normalizeAccountRoles(profile.AccountRoles)
	profile.DietaryRestrictions = normalizeStringList(profile.DietaryRestrictions)
	profile.MedicalExpertise = normalizeStringList(profile.MedicalExpertise)
	profile.HSSQualities = normalizeStringList(profile.HSSQualities)

	return &profile, nil
}

func (h *Handler) enrichAccountRoles(ctx context.Context, profile *Profile) error {
	if profile == nil {
		return nil
	}

	rows, err := h.db.Query(ctx, `
		SELECT ar.role_name
		FROM account_roles ar
		WHERE ar.account_id = COALESCE(
			(SELECT account_id FROM participant_profiles WHERE id = $1 AND account_id IS NOT NULL),
			(SELECT id FROM accounts WHERE lower(email) = lower($2) ORDER BY id ASC LIMIT 1)
		)
		ORDER BY ar.role_name ASC
	`, profile.ID, profile.Email)
	if err != nil {
		return err
	}
	defer rows.Close()

	var roles []string
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return err
		}
		roles = append(roles, role)
	}
	merged := append([]string{}, profile.AccountRoles...)
	merged = append(merged, roles...)
	profile.AccountRoles = normalizeAccountRoles(merged)
	return nil
}

func (h *Handler) syncAccountRoles(ctx context.Context, profileID int64, email string, roles []string) error {
	accountRoles := normalizeAccountRoles(roles)
	if _, err := h.db.Exec(ctx, `UPDATE participant_profiles SET account_roles = $1 WHERE id = $2`, accountRoles, profileID); err != nil {
		return err
	}
	var accountID int64
	err := h.db.QueryRow(ctx, `
		SELECT COALESCE(
			(SELECT account_id FROM participant_profiles WHERE id = $1 AND account_id IS NOT NULL),
			(SELECT id FROM accounts WHERE lower(email) = lower($2) ORDER BY id ASC LIMIT 1),
			0
		)
	`, profileID, email).Scan(&accountID)
	if err != nil {
		return err
	}
	if accountID == 0 {
		return nil
	}

	if _, err := h.db.Exec(ctx, `DELETE FROM account_roles WHERE account_id = $1`, accountID); err != nil {
		return err
	}
	for _, role := range accountRoles {
		if _, err := h.db.Exec(ctx, `
			INSERT INTO account_roles (account_id, role_name)
			VALUES ($1, $2)
			ON CONFLICT (account_id, role_name) DO NOTHING
		`, accountID, role); err != nil {
			return err
		}
	}
	return nil
}

func sanitizePayload(payload *profilePayload, defaultName, defaultEmail string) (string, string, []string) {
	fullName := strings.TrimSpace(payload.FullName)
	if fullName == "" {
		fullName = strings.TrimSpace(defaultName)
	}

	email := strings.ToLower(strings.TrimSpace(payload.Email))
	if email == "" {
		email = strings.ToLower(strings.TrimSpace(defaultEmail))
	}

	payload.Phone = normalizeOptionalString(payload.Phone)
	payload.ExperienceLevel = normalizeOptionalString(payload.ExperienceLevel)
	payload.EmergencyContact = normalizeOptionalString(payload.EmergencyContact)
	payload.Whatsapp = normalizeOptionalString(payload.Whatsapp)
	payload.Instagram = normalizeOptionalString(payload.Instagram)
	payload.Citizenship = normalizeOptionalString(payload.Citizenship)
	payload.DateOfBirth = normalizeOptionalString(payload.DateOfBirth)
	payload.MainCanopy = normalizeOptionalString(payload.MainCanopy)
	payload.Wingload = normalizeOptionalString(payload.Wingload)
	payload.License = normalizeOptionalString(payload.License)
	payload.CanopyCourse = normalizeOptionalString(payload.CanopyCourse)
	payload.LandingAreaPreference = normalizeOptionalString(payload.LandingAreaPreference)
	payload.TshirtSize = normalizeOptionalString(payload.TshirtSize)
	payload.TshirtGender = normalizeOptionalString(payload.TshirtGender)
	payload.MedicalConditions = normalizeOptionalString(payload.MedicalConditions)
	payload.YearsInSport = normalizeOptionalInt(payload.YearsInSport)
	payload.JumpCount = normalizeOptionalInt(payload.JumpCount)
	payload.RecentJumpCount = normalizeOptionalInt(payload.RecentJumpCount)
	payload.Ratings = normalizeStringList(payload.Ratings)
	payload.Disciplines = normalizeStringList(payload.Disciplines)
	payload.OtherAirSports = normalizeStringList(payload.OtherAirSports)
	payload.DietaryRestrictions = normalizeStringList(payload.DietaryRestrictions)
	payload.MedicalExpertise = normalizeStringList(payload.MedicalExpertise)
	payload.HSSQualities = normalizeStringList(payload.HSSQualities)
	payload.AccountRoles = normalizeAccountRoles(payload.AccountRoles)

	return fullName, email, syncParticipantRolesWithAccountRoles(payload.Roles, payload.AccountRoles)
}

func (h *Handler) loadProfileByID(ctx context.Context, profileID int64) (*Profile, error) {
	row := h.db.QueryRow(ctx, `
		SELECT `+profileSelectColumns+`
		FROM participant_profiles
		WHERE id = $1
	`, profileID)
	profile, err := scanProfile(row)
	if err != nil {
		return nil, err
	}
	if err := h.enrichAccountRoles(ctx, profile); err != nil {
		return nil, err
	}
	return profile, nil
}

func (h *Handler) listProfiles(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT `+profileSelectColumns+`
		FROM participant_profiles
		ORDER BY created_at DESC
	`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list participants")
		return
	}
	defer rows.Close()

	var profiles []Profile
	for rows.Next() {
		profile, scanErr := scanProfile(rows)
		if scanErr != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to parse participant")
			return
		}
		if err := h.enrichAccountRoles(r.Context(), profile); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load participant roles")
			return
		}
		profiles = append(profiles, *profile)
	}

	httpx.WriteJSON(w, http.StatusOK, profiles)
}

func (h *Handler) createProfile(w http.ResponseWriter, r *http.Request) {
	var payload profilePayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	fullName, email, roles := sanitizePayload(&payload, "", "")
	if fullName == "" || email == "" {
		httpx.Error(w, http.StatusBadRequest, "full_name and email are required")
		return
	}

	row := h.db.QueryRow(r.Context(), `
		INSERT INTO participant_profiles (
			full_name,
			email,
			account_id,
			phone,
			experience_level,
			emergency_contact,
			whatsapp,
			instagram,
			citizenship,
			date_of_birth,
			jumper,
			years_in_sport,
			jump_count,
			recent_jump_count,
			main_canopy,
			wingload,
			license,
			roles,
			ratings,
			disciplines,
			other_air_sports,
			canopy_course,
			landing_area_preference,
			tshirt_size,
			tshirt_gender,
			account_roles,
			dietary_restrictions,
			medical_conditions,
			medical_expertise,
			hss_qualities
		)
		VALUES (
			$1,
			$2,
			(SELECT id FROM accounts WHERE lower(email) = lower($2) ORDER BY id ASC LIMIT 1),
			$3,
			$4,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11,
			$12,
			$13,
			$14,
			$15,
			$16,
			$17,
			$18,
			$19,
			$20,
			$21,
			$22,
			$23,
			$24,
			$25,
			$26,
			$27,
			$28,
			$29
		)
		RETURNING `+profileSelectColumns,
		fullName,
		email,
		payload.Phone,
		payload.ExperienceLevel,
		payload.EmergencyContact,
		payload.Whatsapp,
		payload.Instagram,
		payload.Citizenship,
		payload.DateOfBirth,
		payload.Jumper,
		payload.YearsInSport,
		payload.JumpCount,
		payload.RecentJumpCount,
		payload.MainCanopy,
		payload.Wingload,
		payload.License,
		roles,
		payload.Ratings,
		payload.Disciplines,
		payload.OtherAirSports,
		payload.CanopyCourse,
		payload.LandingAreaPreference,
		payload.TshirtSize,
		payload.TshirtGender,
		normalizeAccountRoles(payload.AccountRoles),
		payload.DietaryRestrictions,
		payload.MedicalConditions,
		payload.MedicalExpertise,
		payload.HSSQualities,
	)

	profile, err := scanProfile(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if ok := errors.As(err, &pgErr); ok && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "a participant with that email already exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to create participant")
		return
	}
	if canManageAccountRoles(r.Context()) {
		if err := h.syncAccountRoles(r.Context(), profile.ID, profile.Email, payload.AccountRoles); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to assign account roles")
			return
		}
	}
	if err := h.enrichAccountRoles(r.Context(), profile); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load account roles")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, profile)
}

func (h *Handler) getProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := strconv.ParseInt(chi.URLParam(r, "profileID"), 10, 64)
	if err != nil || profileID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid profile id")
		return
	}

	profile, err := h.loadProfileByID(r.Context(), profileID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "participant not found")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, profile)
}

func (h *Handler) getOwnProfile(w http.ResponseWriter, r *http.Request) {
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		httpx.Error(w, http.StatusBadRequest, "email claim missing")
		return
	}

	row := h.db.QueryRow(r.Context(), `
		SELECT `+profileSelectColumns+`
		FROM participant_profiles
		WHERE ($1 > 0 AND account_id = $1) OR lower(email) = $2
		ORDER BY CASE WHEN $1 > 0 AND account_id = $1 THEN 0 ELSE 1 END, id ASC
		LIMIT 1
	`, claims.AccountID, email)

	profile, err := scanProfile(row)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "participant profile not found")
		return
	}
	if err := h.enrichAccountRoles(r.Context(), profile); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load account roles")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, profile)
}

func (h *Handler) upsertOwnProfile(w http.ResponseWriter, r *http.Request) {
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var payload profilePayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	fullName, email, _ := sanitizePayload(&payload, claims.FullName, claims.Email)
	if fullName == "" || email == "" {
		httpx.Error(w, http.StatusBadRequest, "full_name and email are required")
		return
	}

	var existingID int64
	var existingRoles []string
	var existingAccountRoles []string
	err := h.db.QueryRow(r.Context(), `
		SELECT id, roles, COALESCE(account_roles, ARRAY[]::TEXT[])
		FROM participant_profiles
		WHERE ($1 > 0 AND account_id = $1) OR lower(email) = $2
		ORDER BY CASE WHEN $1 > 0 AND account_id = $1 THEN 0 ELSE 1 END, id ASC
		LIMIT 1
	`, claims.AccountID, strings.ToLower(strings.TrimSpace(claims.Email))).Scan(&existingID, &existingRoles, &existingAccountRoles)

	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusInternalServerError, "failed to load participant profile")
		return
	}

	roles := normalizeRoles(existingRoles)
	accountRoles := normalizeAccountRoles(existingAccountRoles)
	accountRoles = normalizeAccountRoles(append(accountRoles, claims.Roles...))
	if errors.Is(err, pgx.ErrNoRows) {
		roles = []string{"Participant"}
		accountRoles = normalizeAccountRoles(claims.Roles)
	}

	roles = allowSelfRoleRemoval(existingRoles, payload.Roles)
	accountRoles = allowSelfAccountRoleRemoval(accountRoles, payload.AccountRoles)

	if errors.Is(err, pgx.ErrNoRows) {
		row := h.db.QueryRow(r.Context(), `
			INSERT INTO participant_profiles (
				full_name,
				email,
				account_id,
				phone,
				experience_level,
				emergency_contact,
				whatsapp,
				instagram,
				citizenship,
				date_of_birth,
				jumper,
				years_in_sport,
				jump_count,
				recent_jump_count,
				main_canopy,
				wingload,
				license,
				roles,
				ratings,
				disciplines,
				other_air_sports,
				canopy_course,
				landing_area_preference,
				tshirt_size,
				tshirt_gender,
				account_roles,
				dietary_restrictions,
				medical_conditions,
				medical_expertise,
				hss_qualities
			)
			VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
				$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
			)
			RETURNING `+profileSelectColumns,
			fullName,
			email,
			nullableAccountID(claims.AccountID),
			payload.Phone,
			payload.ExperienceLevel,
			payload.EmergencyContact,
			payload.Whatsapp,
			payload.Instagram,
			payload.Citizenship,
			payload.DateOfBirth,
			payload.Jumper,
			payload.YearsInSport,
			payload.JumpCount,
			payload.RecentJumpCount,
			payload.MainCanopy,
			payload.Wingload,
			payload.License,
			roles,
			payload.Ratings,
			payload.Disciplines,
			payload.OtherAirSports,
			payload.CanopyCourse,
			payload.LandingAreaPreference,
			payload.TshirtSize,
			payload.TshirtGender,
			accountRoles,
			payload.DietaryRestrictions,
			payload.MedicalConditions,
			payload.MedicalExpertise,
			payload.HSSQualities,
		)

		profile, insertErr := scanProfile(row)
		if insertErr != nil {
			var pgErr *pgconn.PgError
			if ok := errors.As(insertErr, &pgErr); ok && pgErr.Code == "23505" {
				httpx.Error(w, http.StatusConflict, "a participant with that email already exists")
				return
			}
			httpx.Error(w, http.StatusInternalServerError, "failed to save participant profile")
			return
		}
		if err := h.syncAccountRoles(r.Context(), profile.ID, profile.Email, accountRoles); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to save account roles")
			return
		}
		if err := h.enrichAccountRoles(r.Context(), profile); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load account roles")
			return
		}

		httpx.WriteJSON(w, http.StatusOK, profile)
		return
	}

	tag, execErr := h.db.Exec(r.Context(), `
		UPDATE participant_profiles
		SET
			full_name = $1,
			email = $2,
			account_id = COALESCE($31, account_id, (SELECT id FROM accounts WHERE lower(email) = lower($2) ORDER BY id ASC LIMIT 1)),
			phone = $3,
			experience_level = $4,
			emergency_contact = $5,
			whatsapp = $6,
			instagram = $7,
			citizenship = $8,
			date_of_birth = $9,
			jumper = $10,
			years_in_sport = $11,
			jump_count = $12,
			recent_jump_count = $13,
			main_canopy = $14,
			wingload = $15,
			license = $16,
			roles = $17,
			ratings = $18,
			disciplines = $19,
			other_air_sports = $20,
			canopy_course = $21,
			landing_area_preference = $22,
			tshirt_size = $23,
			tshirt_gender = $24,
			account_roles = $25,
			dietary_restrictions = $26,
			medical_conditions = $27,
			medical_expertise = $28,
			hss_qualities = $29
		WHERE id = $30
	`,
		fullName,
		email,
		payload.Phone,
		payload.ExperienceLevel,
		payload.EmergencyContact,
		payload.Whatsapp,
		payload.Instagram,
		payload.Citizenship,
		payload.DateOfBirth,
		payload.Jumper,
		payload.YearsInSport,
		payload.JumpCount,
		payload.RecentJumpCount,
		payload.MainCanopy,
		payload.Wingload,
		payload.License,
		roles,
		payload.Ratings,
		payload.Disciplines,
		payload.OtherAirSports,
		payload.CanopyCourse,
		payload.LandingAreaPreference,
		payload.TshirtSize,
		payload.TshirtGender,
		accountRoles,
		payload.DietaryRestrictions,
		payload.MedicalConditions,
		payload.MedicalExpertise,
		payload.HSSQualities,
		existingID,
		nullableAccountID(claims.AccountID),
	)
	if execErr != nil {
		var pgErr *pgconn.PgError
		if ok := errors.As(execErr, &pgErr); ok && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "a participant with that email already exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to save participant profile")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "participant profile not found")
		return
	}
	if err := h.syncAccountRoles(r.Context(), existingID, email, accountRoles); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save account roles")
		return
	}

	profile, loadErr := h.loadProfileByID(r.Context(), existingID)
	if loadErr != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load participant profile")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, profile)
}

func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := strconv.ParseInt(chi.URLParam(r, "profileID"), 10, 64)
	if err != nil || profileID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid profile id")
		return
	}

	var payload profilePayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	fullName, email, roles := sanitizePayload(&payload, "", "")
	if fullName == "" || email == "" {
		httpx.Error(w, http.StatusBadRequest, "full_name and email are required")
		return
	}

	tag, execErr := h.db.Exec(r.Context(), `
		UPDATE participant_profiles
		SET
			full_name = $1,
			email = $2,
			account_id = COALESCE(account_id, (SELECT id FROM accounts WHERE lower(email) = lower($2) ORDER BY id ASC LIMIT 1)),
			phone = $3,
			experience_level = $4,
			emergency_contact = $5,
			whatsapp = $6,
			instagram = $7,
			citizenship = $8,
			date_of_birth = $9,
			jumper = $10,
			years_in_sport = $11,
			jump_count = $12,
			recent_jump_count = $13,
			main_canopy = $14,
			wingload = $15,
			license = $16,
			roles = $17,
			ratings = $18,
			disciplines = $19,
			other_air_sports = $20,
			canopy_course = $21,
			landing_area_preference = $22,
			tshirt_size = $23,
			tshirt_gender = $24,
			account_roles = $25,
			dietary_restrictions = $26,
			medical_conditions = $27,
			medical_expertise = $28,
			hss_qualities = $29
		WHERE id = $30
	`,
		fullName,
		email,
		payload.Phone,
		payload.ExperienceLevel,
		payload.EmergencyContact,
		payload.Whatsapp,
		payload.Instagram,
		payload.Citizenship,
		payload.DateOfBirth,
		payload.Jumper,
		payload.YearsInSport,
		payload.JumpCount,
		payload.RecentJumpCount,
		payload.MainCanopy,
		payload.Wingload,
		payload.License,
		roles,
		payload.Ratings,
		payload.Disciplines,
		payload.OtherAirSports,
		payload.CanopyCourse,
		payload.LandingAreaPreference,
		payload.TshirtSize,
		payload.TshirtGender,
		normalizeAccountRoles(payload.AccountRoles),
		payload.DietaryRestrictions,
		payload.MedicalConditions,
		payload.MedicalExpertise,
		payload.HSSQualities,
		profileID,
	)
	if execErr != nil {
		var pgErr *pgconn.PgError
		if ok := errors.As(execErr, &pgErr); ok && pgErr.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "a participant with that email already exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update participant")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "participant not found")
		return
	}
	if canManageAccountRoles(r.Context()) {
		if err := h.syncAccountRoles(r.Context(), profileID, email, payload.AccountRoles); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to update account roles")
			return
		}
	}

	profile, loadErr := h.loadProfileByID(r.Context(), profileID)
	if loadErr != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load participant")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, profile)
}

func (h *Handler) deleteProfile(w http.ResponseWriter, r *http.Request) {
	profileID, err := strconv.ParseInt(chi.URLParam(r, "profileID"), 10, 64)
	if err != nil || profileID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid profile id")
		return
	}

	if _, execErr := h.db.Exec(r.Context(), `DELETE FROM participant_profiles WHERE id = $1`, profileID); execErr != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete participant")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
