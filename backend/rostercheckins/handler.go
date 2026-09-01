package rostercheckins

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/auth"
	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/rbac"
)

type Handler struct{ db *pgxpool.Pool }

func NewHandler(db *pgxpool.Pool) *Handler { return &Handler{db: db} }

func (h *Handler) Routes(e *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(e.Authorize(rbac.PermissionViewEvents)).Get("/events/{eventID}/summaries", h.summaries)
	r.With(e.Authorize(rbac.PermissionViewEvents)).Get("/events/{eventID}/items/{itemType}/{itemID}", h.get)
	r.With(e.Authorize(rbac.PermissionManageEvents)).Post("/events/{eventID}/items/{itemType}/{itemID}", h.create)
	r.With(e.Authorize(rbac.PermissionManageEvents)).Post("/{checkInID}/entries/{participantID}", h.updateEntry)
	r.With(e.Authorize(rbac.PermissionManageEvents)).Delete("/{checkInID}", h.delete)
	return r
}

type Entry struct {
	ParticipantID            int64    `json:"participant_id"`
	ParticipantName          string   `json:"participant_name"`
	Roles                    []string `json:"roles"`
	IsPresent                bool     `json:"is_present"`
	DistanceFromTargetMeters *float64 `json:"distance_from_target_meters,omitempty"`
}
type CheckIn struct {
	ID               int64     `json:"id"`
	EventID          int64     `json:"event_id"`
	ScheduleItemType string    `json:"schedule_item_type"`
	ScheduleItemID   int64     `json:"schedule_item_id"`
	CheckedInCount   int       `json:"checked_in_count"`
	ExpectedCount    int       `json:"expected_count"`
	AverageDistance  *float64  `json:"average_distance_meters,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	Entries          []Entry   `json:"entries"`
}
type Summary struct {
	ScheduleItemType string   `json:"schedule_item_type"`
	ScheduleItemID   int64    `json:"schedule_item_id"`
	CheckedInCount   int      `json:"checked_in_count"`
	ExpectedCount    int      `json:"expected_count"`
	AverageDistance  *float64 `json:"average_distance_meters,omitempty"`
}

func parseID(w http.ResponseWriter, r *http.Request, key string) (int64, bool) {
	v, err := strconv.ParseInt(chi.URLParam(r, key), 10, 64)
	if err != nil || v < 1 {
		httpx.Error(w, http.StatusBadRequest, "invalid "+key)
		return 0, false
	}
	return v, true
}
func itemType(w http.ResponseWriter, r *http.Request) (string, bool) {
	v := strings.TrimSpace(chi.URLParam(r, "itemType"))
	if _, ok := sourceTables[v]; !ok {
		httpx.Error(w, http.StatusBadRequest, "invalid schedule item type")
		return "", false
	}
	return v, true
}

var sourceTables = map[string]string{
	"innhopp": "event_innhopps", "transport": "logistics_transports", "ground_crew": "logistics_ground_crews",
	"accommodation": "event_accommodation", "other": "logistics_other", "meal": "logistics_meals",
}

func actorID(ctx context.Context) int64 {
	if c := auth.FromContext(ctx); c != nil {
		return c.AccountID
	}
	return 0
}

func validateItemTx(ctx context.Context, tx pgx.Tx, eventID int64, typ string, itemID int64) error {
	var found bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM "+sourceTables[typ]+" WHERE id = $1 AND event_id = $2)", itemID, eventID).Scan(&found); err != nil {
		return err
	}
	if !found {
		return pgx.ErrNoRows
	}
	return nil
}

func (h *Handler) summaries(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, r, "eventID")
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT schedule_item_type, schedule_item_id,
		COUNT(e.id) FILTER (WHERE e.is_present)::int, COUNT(e.id)::int,
		AVG(e.distance_from_target_meters) FILTER (WHERE e.is_present AND e.distance_from_target_meters IS NOT NULL)
		FROM roster_check_ins c LEFT JOIN roster_check_in_entries e ON e.roster_check_in_id = c.id
        WHERE c.event_id = $1 AND c.deleted_at IS NULL GROUP BY c.schedule_item_type, c.schedule_item_id`, eventID)
	if err != nil {
		httpx.Error(w, 500, "failed to load roster check-ins")
		return
	}
	defer rows.Close()
	result := []Summary{}
	for rows.Next() {
		var s Summary
		if err := rows.Scan(&s.ScheduleItemType, &s.ScheduleItemID, &s.CheckedInCount, &s.ExpectedCount, &s.AverageDistance); err != nil {
			httpx.Error(w, 500, "failed to load roster check-ins")
			return
		}
		result = append(result, s)
	}
	if rows.Err() != nil {
		httpx.Error(w, 500, "failed to load roster check-ins")
		return
	}
	httpx.WriteJSON(w, 200, result)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, r, "eventID")
	if !ok {
		return
	}
	typ, ok := itemType(w, r)
	if !ok {
		return
	}
	itemID, ok := parseID(w, r, "itemID")
	if !ok {
		return
	}
	c, err := h.load(r.Context(), eventID, typ, itemID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, 404, "roster check-in not found")
		return
	}
	if err != nil {
		httpx.Error(w, 500, "failed to load roster check-in")
		return
	}
	httpx.WriteJSON(w, 200, c)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, r, "eventID")
	if !ok {
		return
	}
	typ, ok := itemType(w, r)
	if !ok {
		return
	}
	itemID, ok := parseID(w, r, "itemID")
	if !ok {
		return
	}
	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		httpx.Error(w, 500, "failed to create roster check-in")
		return
	}
	defer tx.Rollback(ctx)
	if err := validateItemTx(ctx, tx, eventID, typ, itemID); err != nil {
		httpx.Error(w, 404, "schedule item not found")
		return
	}
	var existing int64
	err = tx.QueryRow(ctx, `SELECT id FROM roster_check_ins WHERE event_id=$1 AND schedule_item_type=$2 AND schedule_item_id=$3 AND deleted_at IS NULL`, eventID, typ, itemID).Scan(&existing)
	if err == nil {
		if err := tx.Commit(ctx); err != nil {
			httpx.Error(w, 500, "failed to create roster check-in")
			return
		}
		c, err := h.load(ctx, eventID, typ, itemID)
		if err != nil {
			httpx.Error(w, 500, "failed to load roster check-in")
			return
		}
		httpx.WriteJSON(w, 200, c)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, 500, "failed to create roster check-in")
		return
	}
	var previousID *int64
	_ = tx.QueryRow(ctx, `SELECT id FROM roster_check_ins WHERE event_id=$1 AND schedule_item_type=$2 AND schedule_item_id=$3 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1`, eventID, typ, itemID).Scan(&previousID)
	var id int64
	if err := tx.QueryRow(ctx, `INSERT INTO roster_check_ins (event_id,schedule_item_type,schedule_item_id,created_by_account_id) VALUES ($1,$2,$3,$4) RETURNING id`, eventID, typ, itemID, actorID(ctx)).Scan(&id); err != nil {
		httpx.Error(w, 500, "failed to create roster check-in")
		return
	}
	_, err = tx.Exec(ctx, `INSERT INTO roster_check_in_entries (roster_check_in_id,participant_id,participant_name_snapshot,roles_snapshot,is_present,distance_from_target_meters,updated_at)
        SELECT $1,p.id,p.full_name,p.roles,COALESCE(old.is_present,FALSE),CASE WHEN $2='innhopp' THEN old.distance_from_target_meters ELSE NULL END,NOW()
        FROM event_participants ep JOIN participant_profiles p ON p.id=ep.participant_id
        LEFT JOIN roster_check_in_entries old ON old.roster_check_in_id=$3 AND old.participant_id=p.id
        WHERE ep.event_id=$4 AND ($2 <> 'innhopp' OR p.roles @> ARRAY['Skydiver']::TEXT[])
        ORDER BY p.full_name,p.id`, id, typ, previousID, eventID)
	if err != nil {
		httpx.Error(w, 500, "failed to snapshot roster")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.Error(w, 500, "failed to create roster check-in")
		return
	}
	c, err := h.load(ctx, eventID, typ, itemID)
	if err != nil {
		httpx.Error(w, 500, "failed to load roster check-in")
		return
	}
	httpx.WriteJSON(w, 201, c)
}

func (h *Handler) load(ctx context.Context, eventID int64, typ string, itemID int64) (CheckIn, error) {
	var c CheckIn
	err := h.db.QueryRow(ctx, `SELECT id,event_id,schedule_item_type,schedule_item_id,created_at FROM roster_check_ins WHERE event_id=$1 AND schedule_item_type=$2 AND schedule_item_id=$3 AND deleted_at IS NULL`, eventID, typ, itemID).Scan(&c.ID, &c.EventID, &c.ScheduleItemType, &c.ScheduleItemID, &c.CreatedAt)
	if err != nil {
		return c, err
	}
	rows, err := h.db.Query(ctx, `SELECT participant_id,participant_name_snapshot,roles_snapshot,is_present,distance_from_target_meters FROM roster_check_in_entries WHERE roster_check_in_id=$1 ORDER BY participant_name_snapshot,participant_id`, c.ID)
	if err != nil {
		return c, err
	}
	defer rows.Close()
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ParticipantID, &e.ParticipantName, &e.Roles, &e.IsPresent, &e.DistanceFromTargetMeters); err != nil {
			return c, err
		}
		c.Entries = append(c.Entries, e)
		c.ExpectedCount++
		if e.IsPresent {
			c.CheckedInCount++
			if e.DistanceFromTargetMeters != nil {
				if c.AverageDistance == nil {
					v := 0.0
					c.AverageDistance = &v
				}
				*c.AverageDistance += *e.DistanceFromTargetMeters
			}
		}
	}
	if err := rows.Err(); err != nil {
		return c, err
	}
	if c.AverageDistance != nil {
		count := 0
		for _, e := range c.Entries {
			if e.IsPresent && e.DistanceFromTargetMeters != nil {
				count++
			}
		}
		if count > 0 {
			*c.AverageDistance /= float64(count)
		}
	}
	return c, nil
}

func (h *Handler) updateEntry(w http.ResponseWriter, r *http.Request) {
	checkID, ok := parseID(w, r, "checkInID")
	if !ok {
		return
	}
	participantID, ok := parseID(w, r, "participantID")
	if !ok {
		return
	}
	var req struct {
		IsPresent *bool    `json:"is_present"`
		Distance  *float64 `json:"distance_from_target_meters"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil || (req.IsPresent == nil && req.Distance == nil) {
		httpx.Error(w, 400, "is_present or distance_from_target_meters is required")
		return
	}
	if req.Distance != nil && *req.Distance < 0 {
		httpx.Error(w, 400, "distance must be zero or greater")
		return
	}
	ctx := r.Context()
	var typ string
	var eventID int64
	if err := h.db.QueryRow(ctx, `SELECT event_id,schedule_item_type FROM roster_check_ins WHERE id=$1 AND deleted_at IS NULL`, checkID).Scan(&eventID, &typ); err != nil {
		httpx.Error(w, 404, "roster check-in not found")
		return
	}
	if req.Distance != nil && typ != "innhopp" {
		httpx.Error(w, 400, "distance is only available for innhopps")
		return
	}
	tag, err := h.db.Exec(ctx, `UPDATE roster_check_in_entries SET is_present=COALESCE($1,is_present),distance_from_target_meters=CASE WHEN $2::numeric IS NULL THEN distance_from_target_meters ELSE $2 END,updated_by_account_id=$3,updated_at=NOW() WHERE roster_check_in_id=$4 AND participant_id=$5`, req.IsPresent, req.Distance, actorID(ctx), checkID, participantID)
	if err != nil {
		httpx.Error(w, 500, "failed to update roster entry")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, 404, "roster entry not found")
		return
	}
	var itemID int64
	if err := h.db.QueryRow(ctx, `SELECT schedule_item_id FROM roster_check_ins WHERE id=$1`, checkID).Scan(&itemID); err != nil {
		httpx.Error(w, 500, "failed to load roster check-in")
		return
	}
	c, err := h.load(ctx, eventID, typ, itemID)
	if err != nil {
		httpx.Error(w, 500, "failed to load roster check-in")
		return
	}
	httpx.WriteJSON(w, 200, c)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "checkInID")
	if !ok {
		return
	}
	tag, err := h.db.Exec(r.Context(), `UPDATE roster_check_ins SET deleted_at=NOW(),deleted_by_account_id=$1,updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL`, actorID(r.Context()), id)
	if err != nil {
		httpx.Error(w, 500, "failed to delete roster check-in")
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, 404, "roster check-in not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
