# Innhopp Safety Checklists: Implementation Specification

## Goal

Introduce fast, mobile-first safety checklists that must be completed before an innhopp can proceed. Every item is individually signed by the authenticated staff member who completes it, creating an auditable operational record.

## Scope

- A checklist is completed per **event**, **innhopp**, and **operational role**.
- The mandatory roles for every innhopp are:
  - Jump Leader
  - Jump Master
  - Ground Crew
- Boat Crew is mandatory only when `event_innhopps.rescue_boat = true`.
- Checklist definitions and items are centrally managed, permanent reference data for V1. Event staff cannot edit, add, or remove them.
- Staff can reach checklists from the main side menu and from an event gear menu.
- The primary interaction is designed for a phone: quick selection, large controls, immediate saves, and obvious completion state.
- Completion must identify the staff member and time for every individual item.

## Out of Scope (V1)

- Editing checklist definitions in the application.
- Event-specific checklist changes or ad-hoc checklist items.
- Offline completion/sync.
- Participant access to safety checklists.
- Replacing existing innhopp risk, landing-area, NOTAM, or safety-precaution fields.

## User Workflow

1. A staff member opens **Checklists** from the side menu, or opens an event and selects **Checklists** from its gear menu.
2. They select the event (prefilled from the gear menu), the innhopp, and the operational role checklist they are completing.
3. The page displays the full checklist for that role.
4. Tapping an unchecked item records it immediately as completed by the current authenticated account.
5. A completed item displays the signer name and completed time. It is not anonymously checked.
6. The innhopp readiness summary updates after each completion and clearly identifies every missing role/item.
7. The innhopp becomes **Ready** only when every required **Readiness** item in every required role is complete.

## Business Rules

### Required role checklists

| Condition | Required checklist roles |
|---|---|
| Every innhopp | Jump Leader, Jump Master, Ground Crew |
| `rescue_boat = true` | Jump Leader, Jump Master, Ground Crew, Boat Crew |

- Determine required roles server-side from the innhopp record. The client must not be trusted to decide whether Boat Crew is required.
- An inactive checklist template is not required for new completions; do not deactivate or change a template without an explicit release/migration decision.
- The selected role records the operational responsibility under which an item was checked. It is not an authorization boundary: any authenticated staff member may select and complete any required role checklist.
- The authenticated account is the signer. The API never accepts a staff name or account ID supplied by the browser.
- A completion is specific to one innhopp. It must never carry over to another innhopp, even within the same event.

### Checklist phases

- **Readiness** items must be complete before the innhopp can go ahead. These are the only items that control the Ready/Blocked safety gate.
- **Execution** items are checked during the operation. They are recorded and visible but cannot be completed before the relevant moment.
- **Closeout** items are checked after exit/landing. They complete the operational record and must never prevent take-off merely because they have not happened yet.
- The UI must keep phases visually distinct. A person should never mistake a closeout item for a take-off blocker.

### Changes and reversals

- Any authenticated staff member with checklist completion permission may reverse a completed item.
- Reversal requires a reason and records actor and timestamp. It must not delete the original completion.
- The UI displays the current completion state and, for supervisors, an item history showing completion and reversal events.
- Do not implement a silent checkbox toggle for a safety record.

### Proceeding gate and override

- An innhopp is **Blocked** while any required checklist item is incomplete.
- It is **Ready** only when all required **Readiness** items are complete.
- Surface this state in the checklist page, event schedule, and innhopp detail page.
- Any action that marks an innhopp as proceeding/active must be rejected while Blocked.
- A temporary override may be created only by a Jump Master or administrator/staff user with explicit override permission. It requires a reason and is separately auditable. Overrides should be visually high-risk and never appear as normal completion.

## Proposed V1 Checklists

These are proposed permanent items synthesized from the previous checklists. They deliberately remove commercial/social tasks (payments, entertainment, dinner, video, return transport) from the safety gate, avoid duplicating the same check across several roles, and turn vague headings such as “briefing” into an accountable confirmation. Exact local/regulatory wording and equipment standards must be approved by operations before seeding.

Each proposed item should be seeded with a stable `item_key`, the listed phase, and the listed role. Supporting detail can be shown below the item in the app; it should not make the phone screen dense by default.

### Jump Leader

| Phase | Proposed item | Purpose / supporting detail |
|---|---|---|
| Readiness | Location is selected and authorised | Confirm landowner permission and any required local/DZ approval are in place. |
| Readiness | Operational Plan is complete and shared | Confirm landing areas, access, hazards, terrain/elevation, emergency/hospital information, and coordinates are current. |
| Readiness | Operational team is appointed and briefed | Confirm Jump Master and Ground Crew; when the innhopp requires a safety boat, also confirm Boat Crew. Establish communication/reporting method. |
| Readiness | Ground crew departure is on time | Ensure the Ground Crew departs in good time and is in place 10 minutes before the agreed briefing time. |
| Readiness | Conditions and go/no-go decision are confirmed | Use current weather, wind, NOTAM/airspace information, and local conditions; record any material limitations. |
| Readiness | Pilot and Jump Master plan is agreed | Confirm location, coordinates, altitude, jump run/exit point, number of runs/loads, timing, and abort/hold arrangements. |
| Readiness | Manifest | Load sheets are ready and participants are briefed on boarding procedures. |
| Readiness | Water briefing | Ensure all jumpers are familiar with water landing procedures. This item appears only where a safety boat is required. |
| Execution | Team departure and location status | Ground crew departure status, next location, and that the location is left undisturbed are confirmed. |
| Closeout | Innhopp outcome and incidents are reviewed | Confirm all reports have reached the appropriate DZ/operations contact and any incident follow-up has started. |

### Jump Master

| Phase | Proposed item | Purpose / supporting detail |
|---|---|---|
| Readiness | Pilot briefing is complete | Confirm that the pilot has accurate coordinates, jumprun, and altitude. |
| Readiness | Current conditions and landing plan is understood | Communicate with ground crew and get information on current winds, landing direction, and any new information. |
| Readiness | Load is checked and organised | Confirm current manifest/load sheet, participant suitability, canopy size/wing loading, equipment requirements, and water/floatation requirements when applicable. |
| Readiness | Jumper briefing is delivered and understood | Exit altitudes, altitude offsets, canopy separation, landing pattern, hazards and emergency actions are covered. |
| Readiness | Jumprun | Spotting, exit order, separation and Jump Master position are confirmed. |
| Execution | Load is visually spotted before exit | Confirm the agreed visual reference and conditions are acceptable before releasing the load. |
| Closeout | Load is accounted for | Count the load after landing and report status to Ground Crew/operations; escalate missing or overdue jumpers immediately. |
| Closeout | Record accuracy score | Coordinate with Ground Crew to record the distance from the T at which each jumper landed. |

### Ground Crew

| Phase | Proposed item | Purpose / supporting detail |
|---|---|---|
| Readiness | Current operational plan | Location, route, access and communication contact are confirmed. |
| Readiness | Arrive at the landing location on time | Be at the landing location 10 minutes before the agreed briefing time. |
| Readiness | Ground crew kit is complete | T, wind indicators, Radio and approved medical kit are present. |
| Readiness | Transport and emergency support are ready | Confirm crew transport and access/egress plan; confirm emergency contacts, hospital route, and pickup capability for off-landings. |
| Readiness | Landing area prepared | T and windblades placed, current conditions assessed. |
| Readiness | Report current conditions | Live conditions are reported to operations. |
| Readiness | Public and landing-area controls are in place | Establish crowd control/marking where needed and ensure the primary and any secondary landing area is usable. |
| Readiness | Safety boat coordination is confirmed when required | Confirm Boat Crew location, communication, and readiness signal. This item appears only where a safety boat is required. |
| Execution | Ground crew monitors exits and landings | Maintain communications, observe canopies/jumpers, track off-landings, and initiate pickup or emergency response when needed. |
| Closeout | All jumpers are accounted for and reported | Confirm counts against the current manifest and report completion/any exceptions to DZ/operations. |
| Closeout | Record accuracy score | Coordinate with the Jump Master to record the distance from the T at which each jumper landed. |
| Closeout | Ground crew site is cleared | Recover markers and kit, then report any incident, damage, or missing equipment. |

### Boat Crew (only when `rescue_boat = true`)

| Phase | Proposed item | Purpose / supporting detail |
|---|---|---|
| Readiness | Boat, crew, and recovery equipment are ready | Confirm vessel condition, fuel, required safety equipment, communications, crew PPE, and recovery equipment. |
| Readiness | Water recovery plan is understood | Confirm water landing procedures, pickup priorities, landing area/hazards, shore handover point, and emergency escalation route. |
| Readiness | Boat is in position in the water | Confirm position and give ready signal to Ground Crew. |
| Execution | Water area is monitored during exits and landings | Maintain safe position and monitor for water landings or distress. |
| Closeout | Water-area status is clear | Confirm no jumper requires recovery, or complete recovery/handover and report status to Ground Crew/operations. |

### Checklist design notes

- “T” refers to the established landing marker; use the team’s final agreed label in the UI and make its required kit/configuration a local operating standard.
- Keep the detailed equipment list in the Ground Crew supporting text or a linked kit list, while retaining one deliberate “kit complete” confirmation in the fast checklist.
- The briefing should be a single accountable confirmation with concise expandable prompts, rather than dozens of taps that encourage blind completion.
- Water-specific briefing and floatation checks appear only where `rescue_boat = true` (or a future explicit water-landing condition), avoiding irrelevant items on normal innhopps.

## Technical Design

### Checklist reference data

Add permanent, seeded template data. Templates are tied to an operational role and have ordered items.

Suggested tables:

- `checklist_templates`
  - `id`
  - `role` (`jump_leader`, `jump_master`, `ground_crew`, `boat_crew`)
  - `name`
  - `active`
  - `version`
  - `created_at`
  - `updated_at`
- `checklist_template_items`
  - `id`
  - `template_id`
  - `item_key` (stable machine identifier)
  - `label`
  - `detail` (optional short helper text)
  - `phase` (`readiness`, `execution`, `closeout`)
  - `sort_order`
  - `active`
  - `created_at`
  - `updated_at`

V1 templates should be seeded in code from the existing agreed safety items. Stable `item_key` values are required so wording can be improved later without confusing history.

### Audit data

Use an append-only event table rather than a mutable `checked` column:

- `innhopp_checklist_item_events`
  - `id`
  - `event_id`
  - `innhopp_id`
  - `template_item_id`
  - `role`
  - `action` (`completed`, `reversed`)
  - `actor_account_id`
  - `actor_display_name_snapshot`
  - `template_version`
  - `item_label_snapshot`
  - `reason` (required for reversal)
  - `created_at`

- `innhopp_checklist_overrides`
  - `id`
  - `event_id`
  - `innhopp_id`
  - `actor_account_id`
  - `actor_display_name_snapshot`
  - `reason`
  - `created_at`
  - `revoked_at` / `revoked_by_account_id` (if needed)

The current state is the latest audit event for an innhopp + template item. A completion response must include the display name and timestamp needed by the phone UI.

### RBAC

Add explicit permissions in `backend/rbac/roles.go`:

- `checklists:view`
- `checklists:complete`
- `checklists:reverse_any`
- `checklists:override`
- `checklists:manage_templates` (reserved for future admin tooling; no V1 UI)

Recommended mappings:

| Role | View | Complete any checklist role | Reverse any | Override |
|---|---:|---:|---:|---:|
| Admin / Staff | Yes | Yes | Yes | Yes |
| Jump Master | Yes | Yes | Yes | Yes |
| Jump Leader | Yes | Yes | Yes | No |
| Ground Crew | Yes | Yes | Yes | No |
| Boat Crew | Yes | Yes | Yes | No |

Add `RoleBoatCrew = "boat_crew"` to the operational role set if it is used elsewhere in crew assignment. It must not restrict checklist completion: every authenticated staff role with `checklists:complete` may select any checklist role and sign the corresponding item. The selected operational role is stored in the audit record; the actual person is always derived from the session.

### API

Mount a `checklists` handler in `backend/main.go`. Recommended endpoints:

- `GET /api/checklists/events`
  - Returns events available to the current user with checklist readiness counts.
- `GET /api/checklists/events/{eventID}/innhopps`
  - Returns innhopps and per-required-role completion summaries.
- `GET /api/checklists/innhopps/{innhoppID}?role={role}`
  - Returns the chosen role template, each item’s current state/signer/time, innhopp readiness, and missing required items.
- `POST /api/checklists/innhopps/{innhoppID}/items/{itemID}/complete`
  - Validates staff access and selected role/template-item consistency, writes one completion event, returns current state.
- `POST /api/checklists/innhopps/{innhoppID}/items/{itemID}/reverse`
  - Requires `{ "reason": "..." }`, validates authority, writes reversal audit event.
- `GET /api/checklists/innhopps/{innhoppID}/history`
  - Supervisor audit history.
- `POST /api/checklists/innhopps/{innhoppID}/override`
  - Requires reason and override permission.

All write endpoints must be idempotent for retries: completing an already-complete item should return the current completion rather than creating duplicate records. Use a transaction/advisory locking or a uniqueness strategy so two phone taps cannot create conflicting current states.

### Frontend

Add:

- `frontend/src/api/checklists.ts` for typed API calls and payloads.
- `frontend/src/pages/ChecklistsPage.tsx` for global and event-scoped access.
- A reusable `ChecklistRolePanel` / `ChecklistItemRow` component if it reduces page complexity.
- Routes:
  - `/checklists`
  - `/events/:eventId/checklists`
- A Checklists link in `frontend/src/components/Layout.tsx` for staff sessions.
- A Checklists item in `frontend/src/components/EventGearMenu.tsx`.
- Readiness status/badge in `EventSchedulePage.tsx` and `InnhoppDetailPage.tsx`.

Mobile requirements:

- Keep event, innhopp, and role selection at the top and sticky while scrolling.
- Use large, full-width rows with at least a 44px tap target.
- Make the entire unfinished row tappable; avoid tiny checkbox-only targets.
- Save immediately on tap and show a visible saving/error state.
- Display `Checked by {name} · {local time}` beneath completed items.
- Make incomplete/blocking state visible without requiring the user to open every role.
- Do not rely on hover, desktop-width tables, or modal-only critical information.

### Realtime

Publish checklist completion, reversal, and override changes through the existing realtime stream mechanism. The open checklist and schedule readiness indicators should refresh when another staff member completes an item.

## Tickets

### CHK-001: Finalize permanent role templates and safety wording

**Owner**: Operations + Product  
**Depends on**: None

**Work**

- Finalise the proposed permanent items in this specification and assign each to exactly one role template: Jump Leader, Jump Master, Ground Crew, or Boat Crew.
- Put critical checks first and use concise, action-oriented wording suitable for a phone screen.
- Assign a stable `item_key` to every item.
- Confirm each item’s phase: `readiness`, `execution`, or `closeout`.
- Confirm whether any role item needs a required detail/instruction field.
- Confirm the operational action/status that represents an innhopp “going ahead”, so the backend gate has a definite enforcement point.

**Acceptance Criteria**

- Four approved V1 templates exist, including an approved Boat Crew template.
- Every item has stable key, label, order, and owning role.
- The required-role rule in this specification is accepted by operations.

---

### CHK-002: Add checklist schema, seeds, and safe upgrades

**Owner**: Backend  
**Depends on**: CHK-001

**Work**

- Add tables and indexes described in Technical Design to `ensureSchema` in `backend/main.go`.
- Add role constraints/check constraints for valid checklist role and action values.
- Add indexes for `innhopp_id`, `template_item_id`, and chronological audit reads.
- Seed the permanent templates idempotently from code.
- Use foreign keys and event/innhopp consistency validation to prevent cross-event records.

**Acceptance Criteria**

- A fresh database creates schema and templates on startup.
- An existing database upgrades without destructive data changes.
- Startup is idempotent; it does not duplicate templates or audit data.
- A completion can only reference an item belonging to the selected role template.

---

### CHK-003: Add checklist RBAC and Boat Crew role

**Owner**: Backend  
**Depends on**: CHK-002

**Work**

- Add `boat_crew` to RBAC roles.
- Add checklist permissions and role mappings.
- Implement one staff completion permission that permits any selected checklist role, while retaining the selected role in the audit record.
- Ensure staff/admin access is explicit and does not accidentally grant participant access.

**Acceptance Criteria**

- Participants cannot view or complete checklists.
- Any staff member with checklist completion permission can complete any operational role checklist.
- Jump Masters and admins/staff can perform the designated review/override actions.

---

### CHK-004: Implement checklist domain and readiness calculation

**Owner**: Backend  
**Depends on**: CHK-002, CHK-003

**Work**

- Create `backend/checklists` domain models and query helpers.
- Implement server-side required-role calculation from `event_innhopps.rescue_boat`.
- Calculate per-role completion, missing items, overall readiness, blocked state, and active override state.
- Return signer name/timestamp for each current completed item.
- Capture template version and item-label snapshots in audit events.

**Acceptance Criteria**

- Boat Crew is required exactly when `rescue_boat` is true.
- Every other innhopp always requires Jump Leader, Jump Master, and Ground Crew.
- Readiness results are deterministic and cannot be influenced by a client-provided required-role list.

---

### CHK-005: Implement checklist API and audited mutations

**Owner**: Backend  
**Depends on**: CHK-003, CHK-004

**Work**

- Implement and mount the read, completion, reversal, history, and override endpoints specified above.
- Derive actor identity from authenticated session.
- Validate event membership, innhopp ownership, template-item/selected-role consistency, staff checklist permission, and reversal/override authority.
- Make completion idempotent and safe for concurrent requests.
- Use existing API error conventions and provide clear blocked/permission validation codes.

**Acceptance Criteria**

- A completed response always identifies the actual authenticated signer and time.
- Client-submitted account IDs/names cannot impersonate another staff member.
- Reversal preserves original completion and stores a required reason.
- Duplicate completion taps do not produce duplicate current completions.

---

### CHK-006: Add backend tests for roles, audit trail, and readiness

**Owner**: Backend  
**Depends on**: CHK-005

**Work**

- Add unit tests for required-role/readiness calculation.
- Add integration tests for authorized and unauthorized completion, including a staff member completing a checklist outside their ordinary operational role.
- Test boat-required and boat-not-required innhopps.
- Test repeat completion, reversal, override, and cross-event/item-role validation.
- Test that audits retain the original signer and label snapshot after reversal.

**Acceptance Criteria**

- Test coverage proves all mandatory-role combinations.
- Non-staff access and client impersonation attempts fail; staff role selection across checklist roles succeeds.
- All checks pass with the project’s backend test command.

---

### CHK-007: Add typed frontend checklist client and navigation

**Owner**: Frontend  
**Depends on**: CHK-005

**Work**

- Add `frontend/src/api/checklists.ts` with strict types and API methods.
- Add routes for global and event-scoped checklist pages in `frontend/src/App.tsx`.
- Add the side menu entry for staff roles.
- Add Checklists to the event gear menu and route users to the current event’s checklist page.
- Apply existing authenticated/event route guards.

**Acceptance Criteria**

- Authorized staff can enter from both requested locations.
- Event gear navigation preserves the event context.
- The frontend compiles with no `any` at the API boundary.

---

### CHK-008: Build the mobile checklist completion page

**Owner**: Frontend  
**Depends on**: CHK-007

**Work**

- Build event, innhopp, and role selection flow.
- Render the complete selected role template, including signed current state.
- Implement immediate completion save, retry/error messaging, and disabling while saving.
- Provide progress and a role summary showing exactly what blocks readiness.
- Build a supervisor-only history/reversal/override view.
- Implement responsive styles for common phone widths.

**Acceptance Criteria**

- Completing an item takes one deliberate tap after selection.
- A completed row shows signer and timestamp without opening another screen.
- Missing required roles/items are clear from the innhopp summary.
- The page is usable at phone width without horizontal scrolling.

---

### CHK-009: Surface readiness and enforce the operational gate

**Owner**: Backend + Frontend  
**Depends on**: CHK-004, CHK-005, CHK-008

**Work**

- Add compact readiness state to event schedule and innhopp detail API/UI.
- Locate the existing action/status transition that means an innhopp is proceeding, then enforce the server-side readiness check there.
- Implement controlled override presentation and audit display.
- Ensure a direct API call cannot bypass the gate.

**Acceptance Criteria**

- Schedule and innhopp detail show Ready, Blocked, or Overridden status.
- A Blocked innhopp cannot proceed through the application or direct API request.
- An override visibly names the author, time, and reason.

---

### CHK-010: Add realtime updates and operational QA

**Owner**: Frontend + Backend + Operations  
**Depends on**: CHK-008, CHK-009

**Work**

- Publish mutation changes through the existing realtime stream.
- Update visible checklist and schedule state for other staff without a manual reload.
- Test two phones completing separate roles on the same innhopp.
- Run an on-site mobile usability review under realistic time pressure.
- Record any wording/order adjustments as a new template version rather than rewriting history.

**Acceptance Criteria**

- A completion made on one device appears on another open device promptly.
- The full mandatory-role path works for both normal and safety-boat innhopps.
- Operations signs off that the checklist is fast enough to be used reliably in the field.

## Rollout Plan

1. Release templates, read-only readiness calculation, and mobile completion pages behind a feature flag.
2. Trial the flow at one event while keeping the gate informational, and resolve usability defects.
3. Enable the blocking gate for new innhopps once operations approves the templates and real-device test.
4. Monitor reversal and override usage; high override volume is a safety/process signal requiring review.

## Success Measures

- 100% of innhopps show a visible checklist readiness state.
- For completed items, 100% have a signer and timestamp.
- No innhopp transitions to proceeding while missing a required checklist item unless a logged override exists.
- Checklist completion is usable on a phone and requires no staff member to remember which list applies.
