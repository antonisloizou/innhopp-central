package checklists

import (
	"context"
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
	"github.com/innhopp/central/backend/realtime"
)

type Handler struct {
	db      *pgxpool.Pool
	streams *realtime.Hub
}

func NewHandler(db *pgxpool.Pool, streams *realtime.Hub) *Handler {
	return &Handler{db: db, streams: streams}
}

func (h *Handler) Routes(e *rbac.Enforcer) chi.Router {
	r := chi.NewRouter()
	r.With(e.Authorize(rbac.PermissionViewChecklists)).Get("/events", h.listEvents)
	r.With(e.Authorize(rbac.PermissionViewChecklists)).Get("/events/{eventID}/innhopps", h.listInnhopps)
	r.With(e.Authorize(rbac.PermissionViewChecklists)).Get("/innhopps/{innhoppID}", h.getChecklist)
	r.With(e.Authorize(rbac.PermissionViewChecklists)).Get("/innhopps/{innhoppID}/history", h.history)
	r.With(e.Authorize(rbac.PermissionViewChecklists)).Get("/innhopps/{innhoppID}/stream", h.stream)
	r.With(e.Authorize(rbac.PermissionCompleteChecklists)).Post("/innhopps/{innhoppID}/items/{itemID}/complete", h.complete)
	r.With(e.Authorize(rbac.PermissionReverseAnyChecklist)).Post("/innhopps/{innhoppID}/items/{itemID}/reverse", h.reverse)
	r.With(e.Authorize(rbac.PermissionOverrideChecklists)).Post("/innhopps/{innhoppID}/override", h.override)
	r.With(e.Authorize(rbac.PermissionCompleteChecklists)).Post("/innhopps/{innhoppID}/proceed", h.proceed)
	r.With(e.Authorize(rbac.PermissionCompleteChecklists)).Post("/innhopps/{innhoppID}/complete-operation", h.completeOperation)
	return r
}

type item struct {
	ID        int64      `json:"id"`
	ItemKey   string     `json:"item_key"`
	Label     string     `json:"label"`
	Detail    string     `json:"detail,omitempty"`
	Phase     string     `json:"phase"`
	SortOrder int        `json:"sort_order"`
	Completed bool       `json:"completed"`
	CheckedBy string     `json:"checked_by,omitempty"`
	CheckedAt *time.Time `json:"checked_at,omitempty"`
}
type checklist struct {
	InnhoppID         int64            `json:"innhopp_id"`
	EventID           int64            `json:"event_id"`
	InnhoppName       string           `json:"innhopp_name"`
	Role              string           `json:"role"`
	RequiredRoles     []string         `json:"required_roles"`
	Ready             bool             `json:"ready"`
	Overridden        bool             `json:"overridden"`
	Override          *overrideSummary `json:"override,omitempty"`
	OperationalStatus string           `json:"operational_status"`
	Items             []item           `json:"items"`
}
type overrideSummary struct {
	Actor     string    `json:"actor"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}

func parseID(w http.ResponseWriter, r *http.Request, key string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, key), 10, 64)
	if err != nil || id < 1 {
		httpx.Error(w, 400, "invalid "+key)
		return 0, false
	}
	return id, true
}
func rolesFor(boat bool) []string {
	if boat {
		return []string{"jump_leader", "jump_master", "ground_crew", "boat_crew"}
	}
	return []string{"jump_leader", "jump_master", "ground_crew"}
}

func operationalTeamDetail(boat bool) string {
	if boat {
		return "Jump Master, Ground Crew and Boat Crew are confirmed."
	}
	return "Jump Master and Ground Crew are confirmed."
}

func containsRole(roles []string, role string) bool {
	for _, candidate := range roles {
		if candidate == role {
			return true
		}
	}
	return false
}
func validRole(role string) bool {
	for _, r := range []string{"jump_leader", "jump_master", "ground_crew", "boat_crew"} {
		if role == r {
			return true
		}
	}
	return false
}

func (h *Handler) listEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id, name FROM events ORDER BY starts_at DESC, id DESC`)
	if err != nil {
		httpx.Error(w, 500, "could not load checklist events")
		return
	}
	defer rows.Close()
	type eventSummary struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Innhopps int    `json:"innhopps"`
		Ready    int    `json:"ready"`
	}
	out := []eventSummary{}
	for rows.Next() {
		var x eventSummary
		if err := rows.Scan(&x.ID, &x.Name); err != nil {
			httpx.Error(w, 500, "could not read checklist event")
			return
		}
		innhopps, err := h.eventReadiness(r.Context(), x.ID)
		if err != nil {
			httpx.Error(w, 500, "could not calculate checklist readiness")
			return
		}
		x.Innhopps = len(innhopps)
		for _, ready := range innhopps {
			if ready {
				x.Ready++
			}
		}
		out = append(out, x)
	}
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) eventReadiness(ctx context.Context, eventID int64) ([]bool, error) {
	rows, err := h.db.Query(ctx, `SELECT id, COALESCE(rescue_boat,false) FROM event_innhopps WHERE event_id=$1`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []bool{}
	for rows.Next() {
		var id int64
		var boat bool
		if err := rows.Scan(&id, &boat); err != nil {
			return nil, err
		}
		out = append(out, h.ready(ctx, id, rolesFor(boat)) || h.overridden(ctx, id))
	}
	return out, rows.Err()
}

func (h *Handler) listInnhopps(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, r, "eventID")
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT id, sequence, name, COALESCE(rescue_boat,false) FROM event_innhopps WHERE event_id=$1 ORDER BY sequence, id`, eventID)
	if err != nil {
		httpx.Error(w, 500, "could not load innhopps")
		return
	}
	defer rows.Close()
	type summary struct {
		ID                int64    `json:"id"`
		Sequence          int      `json:"sequence"`
		Name              string   `json:"name"`
		RescueBoat        bool     `json:"rescue_boat"`
		RequiredRoles     []string `json:"required_roles"`
		Ready             bool     `json:"ready"`
		Overridden        bool     `json:"overridden"`
		OperationalStatus string   `json:"operational_status"`
	}
	out := []summary{}
	for rows.Next() {
		var x summary
		if err := rows.Scan(&x.ID, &x.Sequence, &x.Name, &x.RescueBoat); err != nil {
			httpx.Error(w, 500, "could not read innhopp")
			return
		}
		x.RequiredRoles = rolesFor(x.RescueBoat)
		x.Ready = h.ready(r.Context(), x.ID, x.RequiredRoles)
		x.Overridden = h.overridden(r.Context(), x.ID)
		x.Ready = x.Ready || x.Overridden
		x.OperationalStatus = h.operationalStatus(r.Context(), x.ID)
		out = append(out, x)
	}
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) getChecklist(w http.ResponseWriter, r *http.Request) {
	innhoppID, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	role := strings.TrimSpace(r.URL.Query().Get("role"))
	if !validRole(role) {
		httpx.Error(w, 400, "valid role is required")
		return
	}
	data, err := h.load(r.Context(), innhoppID, role)
	if err == pgx.ErrNoRows {
		httpx.Error(w, 404, "innhopp not found")
		return
	}
	if err != nil {
		httpx.Error(w, 500, "could not load checklist")
		return
	}
	httpx.WriteJSON(w, 200, data)
}

func (h *Handler) load(ctx context.Context, innhoppID int64, role string) (checklist, error) {
	var out checklist
	var boat bool
	err := h.db.QueryRow(ctx, `SELECT event_id,name,COALESCE(rescue_boat,false) FROM event_innhopps WHERE id=$1`, innhoppID).Scan(&out.EventID, &out.InnhoppName, &boat)
	if err != nil {
		return out, err
	}
	out.InnhoppID = innhoppID
	out.Role = role
	out.RequiredRoles = rolesFor(boat)
	out.Ready = h.ready(ctx, innhoppID, out.RequiredRoles)
	out.Overridden = h.overridden(ctx, innhoppID)
	if out.Overridden {
		out.Override = h.overrideSummary(ctx, innhoppID)
	}
	out.Ready = out.Ready || out.Overridden
	out.OperationalStatus = h.operationalStatus(ctx, innhoppID)
	rows, err := h.db.Query(ctx, `SELECT i.id,i.item_key,i.label,i.detail,i.phase,i.sort_order, COALESCE(s.action='completed',false), COALESCE(s.actor_display_name_snapshot,''),s.created_at FROM checklist_template_items i JOIN checklist_templates t ON t.id=i.template_id LEFT JOIN LATERAL (SELECT action,actor_display_name_snapshot,created_at FROM innhopp_checklist_item_events e WHERE e.innhopp_id=$1 AND e.template_item_id=i.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1) s ON TRUE WHERE t.role=$2 AND t.active AND i.active AND (NOT i.requires_rescue_boat OR $3) ORDER BY i.sort_order`, innhoppID, role, boat)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var x item
		if err := rows.Scan(&x.ID, &x.ItemKey, &x.Label, &x.Detail, &x.Phase, &x.SortOrder, &x.Completed, &x.CheckedBy, &x.CheckedAt); err != nil {
			return out, err
		}
		if x.ItemKey == "team_briefed" {
			x.Detail = operationalTeamDetail(boat)
		}
		out.Items = append(out.Items, x)
	}
	return out, rows.Err()
}

func (h *Handler) overridden(ctx context.Context, innhoppID int64) bool {
	var exists bool
	return h.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM innhopp_checklist_overrides WHERE innhopp_id=$1 AND revoked_at IS NULL)`, innhoppID).Scan(&exists) == nil && exists
}

func (h *Handler) overrideSummary(ctx context.Context, innhoppID int64) *overrideSummary {
	var out overrideSummary
	if err := h.db.QueryRow(ctx, `SELECT actor_display_name_snapshot, reason, created_at FROM innhopp_checklist_overrides WHERE innhopp_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1`, innhoppID).Scan(&out.Actor, &out.Reason, &out.CreatedAt); err != nil {
		return nil
	}
	return &out
}

func (h *Handler) operationalStatus(ctx context.Context, innhoppID int64) string {
	var status string
	if err := h.db.QueryRow(ctx, `SELECT status FROM innhopp_operational_states WHERE innhopp_id=$1`, innhoppID).Scan(&status); err != nil {
		return "planned"
	}
	return status
}

type historyEvent struct {
	ID        int64     `json:"id"`
	ItemLabel string    `json:"item_label"`
	Role      string    `json:"role"`
	Action    string    `json:"action"`
	Actor     string    `json:"actor"`
	Reason    string    `json:"reason,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *Handler) history(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	rows, err := h.db.Query(r.Context(), `SELECT id,item_label,role,action,actor,reason,created_at FROM (
		SELECT id, item_label_snapshot AS item_label, role, action, actor_display_name_snapshot AS actor, reason, created_at
		FROM innhopp_checklist_item_events WHERE innhopp_id=$1
		UNION ALL
		SELECT id, 'Proceeding override' AS item_label, 'jump_master' AS role, 'overridden' AS action, actor_display_name_snapshot AS actor, reason, created_at
		FROM innhopp_checklist_overrides WHERE innhopp_id=$1
	) audit ORDER BY created_at DESC,id DESC`, id)
	if err != nil {
		httpx.Error(w, 500, "could not load checklist history")
		return
	}
	defer rows.Close()
	out := []historyEvent{}
	for rows.Next() {
		var x historyEvent
		if err := rows.Scan(&x.ID, &x.ItemLabel, &x.Role, &x.Action, &x.Actor, &x.Reason, &x.CreatedAt); err != nil {
			httpx.Error(w, 500, "could not read checklist history")
			return
		}
		out = append(out, x)
	}
	httpx.WriteJSON(w, 200, out)
}
func (h *Handler) stream(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	h.streams.ServeHTTP(w, r, realtime.Topic("checklists", id))
}
func (h *Handler) publishUpdate(innhoppID, eventID int64, action string) {
	if h.streams == nil {
		return
	}
	h.streams.Publish(realtime.Topic("checklists", innhoppID), "resource.updated", realtime.UpdatePayload("checklists", innhoppID, action))
	h.streams.Publish(realtime.Topic("events", eventID), "resource.updated", realtime.UpdatePayload("events", eventID, "checklist_"+action))
}
func (h *Handler) ready(ctx context.Context, innhoppID int64, roles []string) bool {
	var missing int
	err := h.db.QueryRow(ctx, `SELECT count(*) FROM checklist_template_items i JOIN checklist_templates t ON t.id=i.template_id JOIN event_innhopps e ON e.id=$1 LEFT JOIN LATERAL (SELECT action FROM innhopp_checklist_item_events x WHERE x.innhopp_id=$1 AND x.template_item_id=i.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) s ON TRUE WHERE t.role=ANY($2) AND t.active AND i.active AND i.phase='readiness' AND (NOT i.requires_rescue_boat OR COALESCE(e.rescue_boat,false)) AND COALESCE(s.action,'') <> 'completed'`, innhoppID, roles).Scan(&missing)
	return err == nil && missing == 0
}

func (h *Handler) complete(w http.ResponseWriter, r *http.Request) {
	innhoppID, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	itemID, ok := parseID(w, r, "itemID")
	if !ok {
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, 400, "role is required")
		return
	}
	req.Role = strings.TrimSpace(req.Role)
	if !validRole(req.Role) {
		httpx.Error(w, 400, "invalid role")
		return
	}
	var boat bool
	if err := h.db.QueryRow(r.Context(), `SELECT COALESCE(rescue_boat,false) FROM event_innhopps WHERE id=$1`, innhoppID).Scan(&boat); err != nil {
		httpx.Error(w, 404, "innhopp not found")
		return
	}
	if !containsRole(rolesFor(boat), req.Role) {
		httpx.Error(w, 400, "checklist role is not required for this innhopp")
		return
	}
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, 401, "authentication required")
		return
	}
	var eventID int64
	var version int
	var label string
	var exists bool
	err := h.db.QueryRow(r.Context(), `SELECT e.event_id,t.version,i.label, EXISTS(SELECT 1 FROM checklist_template_items x JOIN checklist_templates y ON y.id=x.template_id WHERE x.id=$2 AND y.role=$3) FROM event_innhopps e CROSS JOIN checklist_template_items i JOIN checklist_templates t ON t.id=i.template_id WHERE e.id=$1 AND i.id=$2`, innhoppID, itemID, req.Role).Scan(&eventID, &version, &label, &exists)
	if err != nil || !exists {
		httpx.Error(w, 404, "checklist item not found for role")
		return
	}
	var phase string
	if err := h.db.QueryRow(r.Context(), `SELECT phase FROM checklist_template_items WHERE id=$1`, itemID).Scan(&phase); err != nil {
		httpx.Error(w, 404, "checklist item not found")
		return
	}
	if phase != "readiness" && h.operationalStatus(r.Context(), innhoppID) != "proceeding" {
		httpx.Error(w, 409, "execution and closeout items can only be completed while the innhopp is proceeding")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "could not save checklist")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock($1, $2)`, innhoppID, itemID); err != nil {
		httpx.Error(w, 500, "could not lock checklist item")
		return
	}
	var action string
	_ = tx.QueryRow(r.Context(), `SELECT action FROM innhopp_checklist_item_events WHERE innhopp_id=$1 AND template_item_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`, innhoppID, itemID).Scan(&action)
	if action != "completed" {
		name := strings.TrimSpace(claims.FullName)
		if name == "" {
			name = claims.Email
		}
		_, err = tx.Exec(r.Context(), `INSERT INTO innhopp_checklist_item_events (event_id,innhopp_id,template_item_id,role,action,actor_account_id,actor_display_name_snapshot,template_version,item_label_snapshot) VALUES ($1,$2,$3,$4,'completed',$5,$6,$7,$8)`, eventID, innhoppID, itemID, req.Role, claims.AccountID, name, version, label)
		if err != nil {
			httpx.Error(w, 500, "could not save checklist")
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		httpx.Error(w, 500, "could not save checklist")
		return
	}
	out, err := h.load(r.Context(), innhoppID, req.Role)
	if err != nil {
		httpx.Error(w, 500, "could not load checklist")
		return
	}
	h.publishUpdate(innhoppID, eventID, "completed")
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) reverse(w http.ResponseWriter, r *http.Request) {
	innhoppID, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	itemID, ok := parseID(w, r, "itemID")
	if !ok {
		return
	}
	var req struct {
		Role   string `json:"role"`
		Reason string `json:"reason"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.Error(w, 400, "role and reversal reason are required")
		return
	}
	req.Role, req.Reason = strings.TrimSpace(req.Role), strings.TrimSpace(req.Reason)
	if !validRole(req.Role) || req.Reason == "" {
		httpx.Error(w, 400, "a valid role and reversal reason are required")
		return
	}
	var boat bool
	if err := h.db.QueryRow(r.Context(), `SELECT COALESCE(rescue_boat,false) FROM event_innhopps WHERE id=$1`, innhoppID).Scan(&boat); err != nil {
		httpx.Error(w, 404, "innhopp not found")
		return
	}
	if !containsRole(rolesFor(boat), req.Role) {
		httpx.Error(w, 400, "checklist role is not required for this innhopp")
		return
	}
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, 401, "authentication required")
		return
	}
	var eventID int64
	var version int
	var label string
	var belongs bool
	err := h.db.QueryRow(r.Context(), `SELECT e.event_id,t.version,i.label,t.role=$3 FROM event_innhopps e CROSS JOIN checklist_template_items i JOIN checklist_templates t ON t.id=i.template_id WHERE e.id=$1 AND i.id=$2`, innhoppID, itemID, req.Role).Scan(&eventID, &version, &label, &belongs)
	if err != nil || !belongs {
		httpx.Error(w, 404, "checklist item not found for role")
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		httpx.Error(w, 500, "could not reverse checklist item")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock($1, $2)`, innhoppID, itemID); err != nil {
		httpx.Error(w, 500, "could not lock checklist item")
		return
	}
	var action string
	if err := tx.QueryRow(r.Context(), `SELECT action FROM innhopp_checklist_item_events WHERE innhopp_id=$1 AND template_item_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`, innhoppID, itemID).Scan(&action); err != nil || action != "completed" {
		httpx.Error(w, 409, "only a completed item can be reversed")
		return
	}
	name := strings.TrimSpace(claims.FullName)
	if name == "" {
		name = claims.Email
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO innhopp_checklist_item_events (event_id,innhopp_id,template_item_id,role,action,actor_account_id,actor_display_name_snapshot,template_version,item_label_snapshot,reason) VALUES ($1,$2,$3,$4,'reversed',$5,$6,$7,$8,$9)`, eventID, innhoppID, itemID, req.Role, claims.AccountID, name, version, label, req.Reason); err != nil {
		httpx.Error(w, 500, "could not reverse checklist item")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		httpx.Error(w, 500, "could not reverse checklist item")
		return
	}
	out, err := h.load(r.Context(), innhoppID, req.Role)
	if err != nil {
		httpx.Error(w, 500, "could not load checklist")
		return
	}
	h.publishUpdate(innhoppID, eventID, "reversed")
	httpx.WriteJSON(w, 200, out)
}

func (h *Handler) override(w http.ResponseWriter, r *http.Request) {
	innhoppID, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil || strings.TrimSpace(req.Reason) == "" {
		httpx.Error(w, 400, "an override reason is required")
		return
	}
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, 401, "authentication required")
		return
	}
	var eventID int64
	if err := h.db.QueryRow(r.Context(), `SELECT event_id FROM event_innhopps WHERE id=$1`, innhoppID).Scan(&eventID); err != nil {
		httpx.Error(w, 404, "innhopp not found")
		return
	}
	name := strings.TrimSpace(claims.FullName)
	if name == "" {
		name = claims.Email
	}
	_, err := h.db.Exec(r.Context(), `INSERT INTO innhopp_checklist_overrides(event_id,innhopp_id,actor_account_id,actor_display_name_snapshot,reason) VALUES($1,$2,$3,$4,$5)`, eventID, innhoppID, claims.AccountID, name, strings.TrimSpace(req.Reason))
	if err != nil {
		httpx.Error(w, 500, "could not create override")
		return
	}
	h.publishUpdate(innhoppID, eventID, "overridden")
	httpx.WriteJSON(w, 201, map[string]bool{"overridden": true})
}

func (h *Handler) proceed(w http.ResponseWriter, r *http.Request) {
	innhoppID, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, 401, "authentication required")
		return
	}
	var boat bool
	if err := h.db.QueryRow(r.Context(), `SELECT COALESCE(rescue_boat,false) FROM event_innhopps WHERE id=$1`, innhoppID).Scan(&boat); err != nil {
		httpx.Error(w, 404, "innhopp not found")
		return
	}
	if !h.ready(r.Context(), innhoppID, rolesFor(boat)) && !h.overridden(r.Context(), innhoppID) {
		httpx.Error(w, 409, "innhopp is blocked: complete all required pre-take-off checks or create an authorised override")
		return
	}
	name := strings.TrimSpace(claims.FullName)
	if name == "" {
		name = claims.Email
	}
	_, err := h.db.Exec(r.Context(), `INSERT INTO innhopp_operational_states(innhopp_id,status,changed_by_account_id,changed_by_display_name_snapshot) VALUES($1,'proceeding',$2,$3) ON CONFLICT(innhopp_id) DO UPDATE SET status='proceeding',changed_by_account_id=EXCLUDED.changed_by_account_id,changed_by_display_name_snapshot=EXCLUDED.changed_by_display_name_snapshot,changed_at=NOW()`, innhoppID, claims.AccountID, name)
	if err != nil {
		httpx.Error(w, 500, "could not mark innhopp as proceeding")
		return
	}
	var eventID int64
	_ = h.db.QueryRow(r.Context(), `SELECT event_id FROM event_innhopps WHERE id=$1`, innhoppID).Scan(&eventID)
	h.publishUpdate(innhoppID, eventID, "proceeding")
	httpx.WriteJSON(w, 200, map[string]string{"operational_status": "proceeding"})
}

func (h *Handler) completeOperation(w http.ResponseWriter, r *http.Request) {
	innhoppID, ok := parseID(w, r, "innhoppID")
	if !ok {
		return
	}
	claims := auth.FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, 401, "authentication required")
		return
	}
	name := strings.TrimSpace(claims.FullName)
	if name == "" {
		name = claims.Email
	}
	_, err := h.db.Exec(r.Context(), `INSERT INTO innhopp_operational_states(innhopp_id,status,changed_by_account_id,changed_by_display_name_snapshot) VALUES($1,'completed',$2,$3) ON CONFLICT(innhopp_id) DO UPDATE SET status='completed',changed_by_account_id=EXCLUDED.changed_by_account_id,changed_by_display_name_snapshot=EXCLUDED.changed_by_display_name_snapshot,changed_at=NOW()`, innhoppID, claims.AccountID, name)
	if err != nil {
		httpx.Error(w, 500, "could not complete innhopp")
		return
	}
	var eventID int64
	_ = h.db.QueryRow(r.Context(), `SELECT event_id FROM event_innhopps WHERE id=$1`, innhoppID).Scan(&eventID)
	h.publishUpdate(innhoppID, eventID, "completed")
	httpx.WriteJSON(w, 200, map[string]string{"operational_status": "completed"})
}

type seedItem struct {
	Key, Label, Detail, Phase string
	RequiresRescueBoat        bool
}

var seedTemplates = map[string][]seedItem{
	"jump_leader": {
		{"location_authorised", "Location is selected and authorised", "Landowner permission and required approval are in place.", "readiness", false}, {"location_plan", "Operational Plan is complete and shared", "Landing areas, hazards, access and emergency information are current.", "readiness", false}, {"team_briefed", "Operational team is appointed and briefed", "Jump Master and Ground Crew are confirmed.", "readiness", false}, {"conditions", "Conditions and go/no-go decision are confirmed", "Weather, wind, NOTAM/airspace and local conditions have been assessed.", "readiness", false}, {"pilot_plan", "Pilot and Jump Master plan is agreed", "Coordinates, altitude, jump run, loads and abort plan are confirmed.", "readiness", false}, {"manifest_ready", "Manifest", "Load sheets are ready and participants are briefed on boarding procedures.", "readiness", false}, {"team_departure", "Team departure and location status", "Ground crew departure status, next location, and that the location is left undisturbed are confirmed.", "closeout", false}, {"outcome_reviewed", "Innhopp outcome and incidents are reviewed", "Reports and any incident follow-up have reached operations.", "closeout", false},
	},
	"jump_master": {
		{"pilot_brief", "Pilot briefing is complete", "Confirm that the pilot has accurate coordinates, jumprun, and altitude.", "readiness", false}, {"landing_plan", "Current conditions and landing plan is understood", "Communicate with ground crew and get information on current winds, landing direction, and any new information.", "readiness", false}, {"load_checked", "Load is checked and organised", "Current manifest, suitability and required equipment are checked.", "readiness", false}, {"jumper_brief", "Jumper briefing is delivered and understood", "Exit altitudes, altitude offsets, canopy separation, landing pattern, hazards and emergency actions are covered.", "readiness", false}, {"exit_observation_plan", "Jumprun", "Spotting, exit order, separation and Jump Master position are confirmed.", "readiness", false}, {"load_spotted", "Load is visually spotted before exit", "The agreed visual reference and conditions are acceptable.", "execution", false}, {"load_accounted", "Load is accounted for", "Count the load after landing and report any exception.", "closeout", false},
	},
	"ground_crew": {
		{"location_route", "Current operational plan", "Location, route, access and communication contact are confirmed.", "readiness", false}, {"kit_complete", "Ground crew kit is complete", "T, wind indicators, Radio and approved medical kit are present.", "readiness", false}, {"emergency_support", "Transport and emergency support are ready", "Access, emergency contacts, hospital route and off-landing pickup are confirmed.", "readiness", false}, {"landing_prepared", "Landing area prepared", "T and windblades placed, current conditions assessed.", "readiness", false}, {"report_conditions", "Report current conditions", "Live conditions are reported to operations.", "readiness", false}, {"public_controls", "Public and landing-area controls are in place", "Crowd control and primary or secondary landing-area usability are confirmed.", "readiness", false}, {"boat_coordination", "Safety boat coordination is confirmed when required", "Boat Crew location, communications and ready signal are confirmed.", "readiness", true}, {"monitor_exits_landings", "Ground crew monitors exits and landings", "Maintain communications and initiate pickup or emergency response as needed.", "execution", false}, {"all_accounted", "All jumpers are accounted for and reported", "Confirm against manifest and report completion or exceptions.", "closeout", false}, {"site_cleared", "Ground crew site is cleared", "Recover markers and kit, then report incidents, damage or missing equipment.", "closeout", false},
	},
	"boat_crew": {
		{"boat_ready", "Boat, crew and recovery equipment are ready", "Vessel, fuel, safety equipment, communications and recovery equipment are checked.", "readiness", false}, {"recovery_plan", "Water recovery plan is understood", "Priorities, hazards, shore handover and emergency route are confirmed.", "readiness", false}, {"boat_position", "Boat is in position in the water", "Confirm position and give ready signal to Ground Crew.", "readiness", false}, {"water_monitored", "Water area is monitored during exits and landings", "Maintain safe position and monitor for water landings or distress.", "execution", false}, {"water_clear", "Water-area status is clear", "Confirm recovery/handover status and report it.", "closeout", false},
	},
}

func EnsureTemplates(ctx context.Context, db *pgxpool.Pool) error {
	for role, items := range seedTemplates {
		var id int64
		if err := db.QueryRow(ctx, `INSERT INTO checklist_templates(role,name) VALUES($1,$2) ON CONFLICT(role) DO UPDATE SET name=EXCLUDED.name RETURNING id`, role, strings.ReplaceAll(role, "_", " ")).Scan(&id); err != nil {
			return err
		}
		for n, x := range items {
			_, err := db.Exec(ctx, `INSERT INTO checklist_template_items(template_id,item_key,label,detail,phase,requires_rescue_boat,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(template_id,item_key) DO UPDATE SET label=EXCLUDED.label, detail=EXCLUDED.detail, phase=EXCLUDED.phase, requires_rescue_boat=EXCLUDED.requires_rescue_boat, sort_order=EXCLUDED.sort_order`, id, x.Key, x.Label, x.Detail, x.Phase, x.RequiresRescueBoat, n+1)
			if err != nil {
				return err
			}
		}
	}
	return nil
}
