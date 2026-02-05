package innhopps

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/internal/timeutil"
	"github.com/innhopp/central/backend/rbac"
)

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

type LandingArea struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	Size        string `json:"size,omitempty"`
	Obstacles   string `json:"obstacles,omitempty"`
}

type LandOwner struct {
	Name      string `json:"name,omitempty"`
	Telephone string `json:"telephone,omitempty"`
	Email     string `json:"email,omitempty"`
}

type InnhoppImage struct {
	Name     string `json:"name,omitempty"`
	MimeType string `json:"mime_type,omitempty"`
	Data     string `json:"data,omitempty"`
}

type Innhopp struct {
	ID                   int64          `json:"id"`
	EventID              int64          `json:"event_id"`
	Sequence             int            `json:"sequence"`
	Name                 string         `json:"name"`
	Coordinates          string         `json:"coordinates,omitempty"`
	TakeoffAirfieldID    *int64         `json:"takeoff_airfield_id,omitempty"`
	ScheduledAt          *time.Time     `json:"scheduled_at,omitempty"`
	Elevation            *int           `json:"elevation,omitempty"`
	Notes                string         `json:"notes,omitempty"`
	ReasonForChoice      string         `json:"reason_for_choice,omitempty"`
	AdjustAltimeterAAD   string         `json:"adjust_altimeter_aad,omitempty"`
	Notam                string         `json:"notam,omitempty"`
	DistanceByAir        *float64       `json:"distance_by_air,omitempty"`
	DistanceByRoad       *float64       `json:"distance_by_road,omitempty"`
	PrimaryLandingArea   LandingArea    `json:"primary_landing_area"`
	SecondaryLandingArea LandingArea    `json:"secondary_landing_area"`
	RiskAssessment       string         `json:"risk_assessment,omitempty"`
	SafetyPrecautions    string         `json:"safety_precautions,omitempty"`
	Jumprun              string         `json:"jumprun,omitempty"`
	Hospital             string         `json:"hospital,omitempty"`
	RescueBoat           *bool          `json:"rescue_boat,omitempty"`
	MinimumRequirements  string         `json:"minimum_requirements,omitempty"`
	LandOwners           []LandOwner    `json:"land_owners,omitempty"`
	LandOwnerPermission  *bool          `json:"land_owner_permission,omitempty"`
	ImageFiles           []InnhoppImage `json:"image_files,omitempty"`
	CreatedAt            time.Time      `json:"created_at"`
}

type landingAreaPayload struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Size        string `json:"size"`
	Obstacles   string `json:"obstacles"`
}

type landOwnerPayload struct {
	Name      string `json:"name"`
	Telephone string `json:"telephone"`
	Email     string `json:"email"`
}

type payload struct {
	Sequence             *int               `json:"sequence"`
	Name                 string             `json:"name"`
	Coordinates          string             `json:"coordinates"`
	ScheduledAt          string             `json:"scheduled_at"`
	Elevation            *int               `json:"elevation"`
	Notes                string             `json:"notes"`
	TakeoffAirfieldID    *int64             `json:"takeoff_airfield_id"`
	ReasonForChoice      string             `json:"reason_for_choice"`
	AdjustAltimeterAAD   string             `json:"adjust_altimeter_aad"`
	Notam                string             `json:"notam"`
	DistanceByAir        *float64           `json:"distance_by_air"`
	DistanceByRoad       *float64           `json:"distance_by_road"`
	PrimaryLandingArea   landingAreaPayload `json:"primary_landing_area"`
	SecondaryLandingArea landingAreaPayload `json:"secondary_landing_area"`
	RiskAssessment       string             `json:"risk_assessment"`
	SafetyPrecautions    string             `json:"safety_precautions"`
	Jumprun              string             `json:"jumprun"`
	Hospital             string             `json:"hospital"`
	RescueBoat           *bool              `json:"rescue_boat"`
	MinimumRequirements  string             `json:"minimum_requirements"`
	LandOwners           []landOwnerPayload `json:"land_owners"`
	LandOwnerPermission  *bool              `json:"land_owner_permission"`
	ImageFiles           *[]InnhoppImage    `json:"image_files"`
}

func normalizeLandingAreaPayload(p landingAreaPayload) LandingArea {
	return LandingArea{
		Name:        strings.TrimSpace(p.Name),
		Description: strings.TrimSpace(p.Description),
		Size:        strings.TrimSpace(p.Size),
		Obstacles:   strings.TrimSpace(p.Obstacles),
	}
}

func normalizeLandOwnersPayload(raw []landOwnerPayload) []LandOwner {
	if len(raw) == 0 {
		return nil
	}

	owners := make([]LandOwner, 0, len(raw))
	for _, owner := range raw {
		name := strings.TrimSpace(owner.Name)
		telephone := strings.TrimSpace(owner.Telephone)
		email := strings.TrimSpace(owner.Email)
		if name == "" && telephone == "" && email == "" {
			continue
		}
		owners = append(owners, LandOwner{
			Name:      name,
			Telephone: telephone,
			Email:     email,
		})
	}
	if len(owners) == 0 {
		return nil
	}
	return owners
}

func normalizeImageFiles(raw []InnhoppImage) []InnhoppImage {
	if len(raw) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(raw))
	images := make([]InnhoppImage, 0, len(raw))
	for _, entry := range raw {
		name := strings.TrimSpace(entry.Name)
		data := strings.TrimSpace(entry.Data)
		mime := strings.TrimSpace(entry.MimeType)
		if data == "" {
			continue
		}
		key := data
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		images = append(images, InnhoppImage{
			Name:     name,
			MimeType: mime,
			Data:     data,
		})
	}
	if len(images) == 0 {
		return nil
	}
	return images
}

func encodeImageFiles(files []InnhoppImage) ([]byte, error) {
	if len(files) == 0 {
		return []byte("[]"), nil
	}
	return json.Marshal(files)
}

func encodeLandOwners(owners []LandOwner) ([]byte, error) {
	if len(owners) == 0 {
		return []byte("[]"), nil
	}
	return json.Marshal(owners)
}

func (h *Handler) Routes(enforcer *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(enforcer.Authorize(rbac.PermissionViewEvents)).Get("/{innhoppID}", h.getInnhopp)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Put("/{innhoppID}", h.updateInnhopp)
	r.With(enforcer.Authorize(rbac.PermissionManageEvents)).Delete("/{innhoppID}", h.deleteInnhopp)
	return r
}

func scanInnhopp(row pgx.Row) (Innhopp, error) {
	var innhopp Innhopp
	var scheduled sql.NullTime
	var elevation sql.NullInt32
	var distanceByAir sql.NullFloat64
	var distanceByRoad sql.NullFloat64
	var rescueBoat sql.NullBool
	var landOwnerPermission sql.NullBool
	var coords sql.NullString
	var reason sql.NullString
	var adjust sql.NullString
	var notam sql.NullString
	var risk sql.NullString
	var safety sql.NullString
	var jumprun sql.NullString
	var hospital sql.NullString
	var minimum sql.NullString
	var primaryName sql.NullString
	var primaryDescription sql.NullString
	var primarySize sql.NullString
	var primaryObstacles sql.NullString
	var secondaryName sql.NullString
	var secondaryDescription sql.NullString
	var secondarySize sql.NullString
	var secondaryObstacles sql.NullString
	var landOwnersRaw []byte
	var imageFilesRaw []byte

	if err := row.Scan(
		&innhopp.ID,
		&innhopp.EventID,
		&innhopp.Sequence,
		&innhopp.Name,
		&coords,
		&innhopp.TakeoffAirfieldID,
		&elevation,
		&scheduled,
		&innhopp.Notes,
		&reason,
		&adjust,
		&notam,
		&distanceByAir,
		&distanceByRoad,
		&primaryName,
		&primaryDescription,
		&primarySize,
		&primaryObstacles,
		&secondaryName,
		&secondaryDescription,
		&secondarySize,
		&secondaryObstacles,
		&risk,
		&safety,
		&jumprun,
		&hospital,
		&rescueBoat,
		&minimum,
		&imageFilesRaw,
		&landOwnersRaw,
		&landOwnerPermission,
		&innhopp.CreatedAt,
	); err != nil {
		return innhopp, err
	}

	if scheduled.Valid {
		t := scheduled.Time.UTC()
		innhopp.ScheduledAt = &t
	}
	if elevation.Valid {
		val := int(elevation.Int32)
		innhopp.Elevation = &val
	}
	if distanceByAir.Valid {
		val := distanceByAir.Float64
		innhopp.DistanceByAir = &val
	}
	if distanceByRoad.Valid {
		val := distanceByRoad.Float64
		innhopp.DistanceByRoad = &val
	}

	innhopp.Coordinates = coords.String
	innhopp.ReasonForChoice = reason.String
	innhopp.AdjustAltimeterAAD = adjust.String
	innhopp.Notam = notam.String
	innhopp.PrimaryLandingArea = LandingArea{
		Name:        primaryName.String,
		Description: primaryDescription.String,
		Size:        primarySize.String,
		Obstacles:   primaryObstacles.String,
	}
	innhopp.SecondaryLandingArea = LandingArea{
		Name:        secondaryName.String,
		Description: secondaryDescription.String,
		Size:        secondarySize.String,
		Obstacles:   secondaryObstacles.String,
	}
	innhopp.RiskAssessment = risk.String
	innhopp.SafetyPrecautions = safety.String
	innhopp.Jumprun = jumprun.String
	innhopp.Hospital = hospital.String
	innhopp.MinimumRequirements = minimum.String

	if rescueBoat.Valid {
		val := rescueBoat.Bool
		innhopp.RescueBoat = &val
	}

	if len(imageFilesRaw) > 0 {
		var files []InnhoppImage
		if err := json.Unmarshal(imageFilesRaw, &files); err != nil {
			return innhopp, err
		}
		if normalized := normalizeImageFiles(files); len(normalized) > 0 {
			innhopp.ImageFiles = normalized
		}
	}

	if len(landOwnersRaw) > 0 {
		var owners []LandOwner
		if err := json.Unmarshal(landOwnersRaw, &owners); err != nil {
			return innhopp, err
		}
		if len(owners) > 0 {
			innhopp.LandOwners = owners
		}
	}

	if landOwnerPermission.Valid {
		val := landOwnerPermission.Bool
		innhopp.LandOwnerPermission = &val
	}

	return innhopp, nil
}

func (h *Handler) getInnhopp(w http.ResponseWriter, r *http.Request) {
	innhoppID, err := strconv.ParseInt(chi.URLParam(r, "innhoppID"), 10, 64)
	if err != nil || innhoppID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid innhopp id")
		return
	}

	row := h.db.QueryRow(r.Context(),
		`SELECT id, event_id, sequence, name, coordinates, takeoff_airfield_id, elevation, scheduled_at, notes,
                reason_for_choice, adjust_altimeter_aad, notam, distance_by_air, distance_by_road,
                primary_landing_area_name, primary_landing_area_description, primary_landing_area_size, primary_landing_area_obstacles,
                secondary_landing_area_name, secondary_landing_area_description, secondary_landing_area_size, secondary_landing_area_obstacles,
                risk_assessment, safety_precautions, jumprun, hospital, rescue_boat, minimum_requirements, image_files, land_owners, land_owner_permission,
                created_at
         FROM event_innhopps WHERE id = $1`,
		innhoppID,
	)
	innhopp, scanErr := scanInnhopp(row)
	if scanErr != nil {
		if errors.Is(scanErr, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "innhopp not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to load innhopp")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, innhopp)
}

func (h *Handler) updateInnhopp(w http.ResponseWriter, r *http.Request) {
	innhoppID, err := strconv.ParseInt(chi.URLParam(r, "innhoppID"), 10, 64)
	if err != nil || innhoppID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid innhopp id")
		return
	}

	var p payload
	if err := httpx.DecodeJSON(r, &p); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	seq := 1
	if p.Sequence != nil {
		if *p.Sequence <= 0 {
			httpx.Error(w, http.StatusBadRequest, "sequence must be positive")
			return
		}
		seq = *p.Sequence
	}

	name := strings.TrimSpace(p.Name)
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	var scheduled *time.Time
	if strings.TrimSpace(p.ScheduledAt) != "" {
		val := strings.TrimSpace(p.ScheduledAt)
		t, err := timeutil.ParseEventTimestamp(val)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "scheduled_at must be RFC3339 or YYYY-MM-DDTHH:MM")
			return
		}
		scheduled = &t
	}

	var elevation *int
	if p.Elevation != nil {
		if *p.Elevation < 0 {
			httpx.Error(w, http.StatusBadRequest, "elevation must be zero or positive")
			return
		}
		elevation = p.Elevation
	}

	var distanceByAir *float64
	if p.DistanceByAir != nil {
		if *p.DistanceByAir < 0 {
			httpx.Error(w, http.StatusBadRequest, "distance_by_air must be zero or positive")
			return
		}
		val := *p.DistanceByAir
		distanceByAir = &val
	}

	var distanceByRoad *float64
	if p.DistanceByRoad != nil {
		if *p.DistanceByRoad < 0 {
			httpx.Error(w, http.StatusBadRequest, "distance_by_road must be zero or positive")
			return
		}
		val := *p.DistanceByRoad
		distanceByRoad = &val
	}

	if p.TakeoffAirfieldID != nil && *p.TakeoffAirfieldID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "takeoff_airfield_id must be positive")
		return
	}

	primaryLanding := normalizeLandingAreaPayload(p.PrimaryLandingArea)
	secondaryLanding := normalizeLandingAreaPayload(p.SecondaryLandingArea)
	owners := normalizeLandOwnersPayload(p.LandOwners)
	ownersJSON, err := encodeLandOwners(owners)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to encode land owners")
		return
	}
	var imageFilesJSON []byte
	if p.ImageFiles != nil {
		imageFiles := normalizeImageFiles(*p.ImageFiles)
		encoded, err := encodeImageFiles(imageFiles)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to encode images")
			return
		}
		imageFilesJSON = encoded
	}

	reason := strings.TrimSpace(p.ReasonForChoice)
	adjust := strings.TrimSpace(p.AdjustAltimeterAAD)
	notam := strings.TrimSpace(p.Notam)
	coords := strings.TrimSpace(p.Coordinates)
	risk := strings.TrimSpace(p.RiskAssessment)
	safety := strings.TrimSpace(p.SafetyPrecautions)
	jumprun := strings.TrimSpace(p.Jumprun)
	hospital := strings.TrimSpace(p.Hospital)
	minimum := strings.TrimSpace(p.MinimumRequirements)

	row := h.db.QueryRow(r.Context(),
		`UPDATE event_innhopps
         SET sequence = $1, name = $2, coordinates = $3, takeoff_airfield_id = $4, elevation = $5, scheduled_at = $6, notes = $7,
             reason_for_choice = $8, adjust_altimeter_aad = $9, notam = $10, distance_by_air = $11, distance_by_road = $12,
             primary_landing_area_name = $13, primary_landing_area_description = $14, primary_landing_area_size = $15, primary_landing_area_obstacles = $16,
             secondary_landing_area_name = $17, secondary_landing_area_description = $18, secondary_landing_area_size = $19, secondary_landing_area_obstacles = $20,
             risk_assessment = $21, safety_precautions = $22, jumprun = $23, hospital = $24, rescue_boat = $25, minimum_requirements = $26,
             image_files = COALESCE($27, image_files), land_owners = $28, land_owner_permission = $29
         WHERE id = $30
         RETURNING id, event_id, sequence, name, coordinates, takeoff_airfield_id, elevation, scheduled_at, notes,
                   reason_for_choice, adjust_altimeter_aad, notam, distance_by_air, distance_by_road,
                   primary_landing_area_name, primary_landing_area_description, primary_landing_area_size, primary_landing_area_obstacles,
                   secondary_landing_area_name, secondary_landing_area_description, secondary_landing_area_size, secondary_landing_area_obstacles,
                   risk_assessment, safety_precautions, jumprun, hospital, rescue_boat, minimum_requirements, image_files, land_owners, land_owner_permission,
                   created_at`,
		seq, name, coords, p.TakeoffAirfieldID, elevation, scheduled, strings.TrimSpace(p.Notes),
		reason, adjust, notam, distanceByAir, distanceByRoad,
		primaryLanding.Name, primaryLanding.Description, primaryLanding.Size, primaryLanding.Obstacles,
		secondaryLanding.Name, secondaryLanding.Description, secondaryLanding.Size, secondaryLanding.Obstacles,
		risk, safety, jumprun, hospital, p.RescueBoat, minimum, imageFilesJSON, ownersJSON, p.LandOwnerPermission, innhoppID,
	)

	innhopp, scanErr := scanInnhopp(row)
	if scanErr != nil {
		if errors.Is(scanErr, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "innhopp not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update innhopp")
		return
	}

	if innhopp.TakeoffAirfieldID != nil {
		if _, err := h.db.Exec(
			r.Context(),
			`INSERT INTO event_airfields (event_id, airfield_id) VALUES ($1, $2)
             ON CONFLICT (event_id, airfield_id) DO NOTHING`,
			innhopp.EventID,
			*innhopp.TakeoffAirfieldID,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to link airfield to event")
			return
		}
	}

	httpx.WriteJSON(w, http.StatusOK, innhopp)
}

func (h *Handler) deleteInnhopp(w http.ResponseWriter, r *http.Request) {
	innhoppID, err := strconv.ParseInt(chi.URLParam(r, "innhoppID"), 10, 64)
	if err != nil || innhoppID <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid innhopp id")
		return
	}

	res, err := h.db.Exec(r.Context(), `DELETE FROM event_innhopps WHERE id = $1`, innhoppID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete innhopp")
		return
	}
	if res.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "innhopp not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
