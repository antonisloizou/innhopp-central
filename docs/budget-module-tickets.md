# Budget Module Tickets (V1)

## Scope Guardrails
- No VAT/tax fields, formulas, or UI.
- No CSV import/export.
- No Google Sheets integration.
- Budget is app-native and event-scoped.

## Business Rules
- Event planning baseline:
- `planned_load_count` default is `2`.
- `confirm_load_count` default is `1`.
- `crew_on_load_count` default is `2`.
- Profitability gate:
- `worst_case_participants = full_load_size - crew_on_load_count + 1`.
- Event budget is considered safe only if worst-case margin is non-negative.
- Markup and tip:
- `target_markup_percent` default `20`.
- `optional_tip_percent` default `8`.
- `cost_drift_percent` default `3`.
- Both are fully configurable per event budget.
- Optional tip semantics:
- Tip is post-event and optional.
- It must be shown separately from guaranteed revenue/profit.

## Ticket List

### BUD-001: Add Budget Schema and Migrations
**Owner**: Backend  
**Depends on**: None


**Description**
Add new database tables for event budgets, sections, line items, assumptions, and scenarios.

**Implementation**
- Update schema bootstrap in `backend/main.go`.
- Create tables:
- `event_budgets`
- `budget_sections`
- `budget_line_items`
- `budget_assumptions`
- `budget_scenarios`
- Add unique constraint: one active budget per event in V1.
- Seed default sections on budget creation.

**Acceptance Criteria**
- App boots with schema creation on empty DB.
- Existing DB upgrades without destructive changes.
- Creating a budget automatically creates default sections.

---

### BUD-002: Add Budget RBAC Permissions
**Owner**: Backend  
**Depends on**: BUD-001

**Description**
Introduce budget-specific permissions and wire authorization checks.

**Implementation**
- Add permissions in `backend/rbac/roles.go`:
- `view_budget`
- `manage_budget`
- `approve_budget`
- Enforce permission checks in all budget endpoints.

**Acceptance Criteria**
- Unauthorized users cannot read or mutate budget data.
- Existing role mappings remain backward compatible.

---

### BUD-003: Implement Budget Domain Types and Repository Layer
**Owner**: Backend  
**Depends on**: BUD-001

**Description**
Create typed models and DB access methods for budgets and children entities.

**Implementation**
- Add domain structs and repository methods under `backend` budget package.
- Include CRUD for:
- budget
- sections (incl. reorder)
- line items
- assumptions
- scenarios

**Acceptance Criteria**
- Repository methods cover all required CRUD paths.
- Unit tests validate scans/mappings and not-found behavior.

---

### BUD-004: Implement Budget Calculation Engine
**Owner**: Backend  
**Depends on**: BUD-003

**Description**
Add deterministic server-side calculations for cost/revenue/margins and scenario outputs.

**Implementation**
- Add pure calculation service:
- `line_total = quantity * unit_cost`
- `total_cost_expected = sum(line_total)`
- `drift_amount = total_cost_expected * cost_drift_percent / 100`
- `total_cost_with_drift = total_cost_expected + drift_amount`
- `base_revenue = participants * price_per_participant`
- `markup_amount = total_cost_with_drift * target_markup_percent / 100`
- `target_revenue = total_cost_with_drift + markup_amount`
- `optional_tip_amount = target_revenue * optional_tip_percent / 100`
- `target_revenue_with_tip = target_revenue + optional_tip_amount`
- Scenario set to compute every summary call:
- `confirm_case` participants = `(full_load_size - crew_on_load_count) * confirm_load_count`
- `worst_case_gate` participants = `full_load_size - crew_on_load_count + 1`
- `planned_capacity_case` participants = `(full_load_size - crew_on_load_count) * planned_load_count`
- Return per scenario:
- expected cost
- drift-adjusted cost
- revenue without tip
- revenue with tip
- margin without tip
- margin with tip
- status color (`green` if margin without tip >= 0 else `red`)

**Acceptance Criteria**
- Given the same inputs, outputs are deterministic.
- Worst-case scenario is always included in summary payload.
- Optional tip never mutates base revenue; it is additive and separate.
- Cost drift is applied to costs before markup and is clearly shown as separate from expected cost.

---

### BUD-005: Add Budget REST API Endpoints
**Owner**: Backend  
**Depends on**: BUD-002, BUD-003, BUD-004

**Description**
Expose budget APIs required by frontend.

**Implementation**
- Add routes in budget handler:
- `GET /api/events/{eventID}/budget`
- `POST /api/events/{eventID}/budget`
- `PUT /api/budgets/{budgetID}`
- `GET /api/budgets/{budgetID}/sections`
- `PUT /api/budgets/{budgetID}/sections/reorder`
- `GET /api/budgets/{budgetID}/line-items`
- `POST /api/budgets/{budgetID}/line-items`
- `PUT /api/budgets/{budgetID}/line-items/{lineItemID}`
- `DELETE /api/budgets/{budgetID}/line-items/{lineItemID}`
- `GET /api/budgets/{budgetID}/assumptions`
- `PUT /api/budgets/{budgetID}/assumptions`
- `GET /api/budgets/{budgetID}/summary`
- `POST /api/budgets/{budgetID}/scenarios/calculate`
- `GET /api/budgets/{budgetID}/scenarios`
- `POST /api/budgets/{budgetID}/scenarios`
- `DELETE /api/budgets/{budgetID}/scenarios/{scenarioID}`
- Validate numeric ranges:
- `target_markup_percent` >= 0
- `optional_tip_percent` >= 0
- `cost_drift_percent` >= 0
- counts and price non-negative

**Acceptance Criteria**
- Endpoints return typed JSON payloads used directly by frontend.
- Error payloads follow existing API error conventions.

---

### BUD-006: Enforce Budget Status Gate by Worst-Case Margin
**Owner**: Backend  
**Depends on**: BUD-004, BUD-005

**Description**
Add workflow guard that prevents moving budget to review/approved if worst-case margin is negative.

**Implementation**
- In budget status update path:
- Allow `draft -> review` only if `worst_case_gate.margin_without_tip >= 0`.
- Allow `review -> approved` only if same condition passes.
- Return explicit validation error with deficit amount if blocked.

**Acceptance Criteria**
- Status transition fails when worst-case is red.
- Response includes machine-readable reason code and human message.

---

### BUD-007: Frontend API Client and Types
**Owner**: Frontend  
**Depends on**: BUD-005

**Description**
Create budget API client and TS types.

**Implementation**
- Add `frontend/src/api/budgets.ts`.
- Define types for:
- budget entities
- assumptions
- summary payload (includes confirm/worst/planned scenarios and margin curve)
- Add client methods for all V1 endpoints.

**Acceptance Criteria**
- Frontend compiles with strict typing for budget data.
- No `any` in budget API boundary types.

---

### BUD-008: Add Budget Route and Navigation Entry
**Owner**: Frontend  
**Depends on**: BUD-007

**Description**
Expose budget module in app routing and navigation.

**Implementation**
- Add route in `frontend/src/App.tsx`:
- `/events/:eventId/budget`
- Add entry point from event/logistics context.
- Guard with existing auth + participant/event access rules.

**Acceptance Criteria**
- Authorized users can reach budget page from app navigation.
- Unauthorized users are blocked consistently with existing guards.

---

### BUD-009: Build Budget Workspace Page (Summary + Editing)
**Owner**: Frontend  
**Depends on**: BUD-007, BUD-008

**Description**
Implement a single budget workspace with:
- Summary KPIs
- Editable line-item table
- Assumptions panel
- Scenario panel

**Implementation**
- Add page: `frontend/src/pages/EventBudgetPage.tsx`.
- Add components:
- `BudgetSummaryCards`
- `BudgetLineItemsTable`
- `BudgetAssumptionsPanel`
- `BudgetScenarioPanel`
- Editable assumptions must include:
- `target_markup_percent` (default 20)
- `optional_tip_percent` (default 8)
- `cost_drift_percent` (default 3)
- `full_load_size`
- `crew_on_load_count` (default 2)
- `confirm_load_count` (default 1)
- `planned_load_count` (default 2)
- `price_per_participant`

**Acceptance Criteria**
- User can edit line items and assumptions and see updated summary.
- Optional tip is displayed separately from base target.
- Worst-case status is visually obvious.

---

### BUD-010: Add Financial Visualizations (Red/Green)
**Owner**: Frontend  
**Depends on**: BUD-009

**Description**
Add charts needed for decision-making before event confirmation.

**Implementation**
- Cost vs Revenue grouped bars:
- three scenarios (`confirm`, `worst`, `planned`)
- cost in red, revenue in green
- margin badge per scenario
- show tooltip split of expected cost vs drift amount
- Profitability curve:
- x-axis participants from confirm to planned capacity
- y-axis margin
- red area below zero, green area above zero
- markers at confirm/worst/planned
- Cost split chart:
- section-level split (donut or stacked bar)
- toggle amount vs percentage
- Worst-case gate KPI tile:
- green if `worst_case_gate.margin_without_tip >= 0`
- red otherwise, with exact deficit/surplus

**Acceptance Criteria**
- Charts update after edits without page reload.
- Colors consistently map to profitability state.
- User can quickly determine if worst case is green.

---

### BUD-011: Add Guarded Action for “Submit for Review”
**Owner**: Frontend  
**Depends on**: BUD-006, BUD-009

**Description**
Prevent budget submission to review when worst-case gate fails.

**Implementation**
- Disable/guard “Submit for review” button if worst-case margin is negative.
- Show warning banner:
- if confirm case is green but worst case is red, show “false safety” warning.
- On server rejection, surface backend error message.

**Acceptance Criteria**
- UI never silently allows invalid transition.
- User sees exact reason and amount needed to reach green.

---

### BUD-012: Backend Tests for Calculations and Gate Logic
**Owner**: Backend  
**Depends on**: BUD-004, BUD-006

**Description**
Add comprehensive unit/integration tests for budget math and state gating.

**Implementation**
- Unit tests:
- markup/tip/drift arithmetic
- scenario participant rules
- worst-case margin color/status
- Integration tests:
- summary API with seeded budget
- blocked status transition when worst-case negative

**Acceptance Criteria**
- Tests cover both happy path and negative margin paths.
- CI passes with budget tests enabled.

---

### BUD-013: Frontend Tests for Budget UX and Visual State
**Owner**: Frontend  
**Depends on**: BUD-010, BUD-011

**Description**
Add UI tests for critical interactions and decision visuals.

**Implementation**
- Test cases:
- editing assumptions recalculates cards/charts
- red/green status changes when margins cross zero
- “Submit for review” disabled when worst-case is red
- optional tip shown as separate value, not merged into base target

**Acceptance Criteria**
- Critical decision-flow behaviors are covered by automated tests.
- Regressions in gate logic are caught at UI level.

---

### BUD-014: Documentation and Rollout Notes
**Owner**: Backend + Frontend  
**Depends on**: BUD-001..BUD-013

**Description**
Document usage, assumptions, and operational rollout.

**Implementation**
- Update root `README.md` and `backend/README.md` + `frontend/README.md`:
- budget endpoints
- assumptions model
- meaning of target markup vs optional tip
- gating rule based on worst-case scenario
- Add release note for feature flag `BUDGETS_V1`.

**Acceptance Criteria**
- Docs explain how to configure markup/tip and interpret charts.
- Teams can onboard without spreadsheet dependency.

## Suggested Delivery Order
1. BUD-001, BUD-002, BUD-003  
2. BUD-004, BUD-005, BUD-006  
3. BUD-007, BUD-008, BUD-009  
4. BUD-010, BUD-011  
5. BUD-012, BUD-013  
6. BUD-014
