# Accounting Module Implementation Plan and Tickets (V1)

## Objective
Build an accounting module that tracks actual financial events for an event and compares them to budget expectations, while keeping schedule items as the operational source of truth.

## Core Model Decisions
- `schedule_item` remains generic for all schedule page entries.
- Add optional cost records linked to schedule items: `schedule_item_cost`.
- Budget line items are generated/synced from schedule item costs.
- `schedule_item_cost.estimated_amount` is the planning baseline used for budget sync and later variance comparison.
- Accounting starts when costs are invoiced (accrual view), not only when paid (cash view).
- Payments are tracked separately and allocated to costs.
- Invoiced and paid totals are derived from posted documents and payment allocations, not edited directly on the cost row.
- Finance reporting must expose line-level deltas for `estimate -> invoiced`, `invoiced -> paid`, and `budget -> actual`.

## Scope (V1)
- Planned costs linked to schedule items.
- Auto creation/sync of budget line items from schedule item costs.
- Cost lifecycle statuses: `expected`, `committed`, `invoiced`, `partially_paid`, `paid`, `cancelled`, `disputed`.
- Accounting documents and entries for invoice/credit/adjustment.
- Payment capture and allocation.
- Budget vs actual reporting (planned vs invoiced vs paid).
- Explicit variance tracking per cost line and per budget section.
- Audit trail and status derivation rules.

## Out of Scope (V1)
- Full double-entry general ledger.
- Tax/VAT calculations and tax reports.
- OCR invoice ingestion.
- Multi-entity consolidation.
- Bank feed integration.

## Architecture Plan

### Data Layer
Add accounting tables in backend bootstrap migration flow (`backend/main.go`) and use event-scoped joins for isolation.

### Domain Layer
Create new backend package `backend/accounting` with:
- models
- repository
- service (status derivation, validations, rollups)
- handler (REST)

### Integration Points
- Schedule module: create/update optional `schedule_item_cost` records without changing schedule semantics.
- Budget module: upsert corresponding budget line items when schedule item cost changes.
- RBAC module: add accounting permissions and guard all accounting endpoints.

### Frontend
- Extend schedule UI with optional cost panel per schedule item.
- Replace top-level `Budgets` navigation entry with `Finance`.
- Add finance landing page similar to logistics, with summary cards linking to existing budget views and the new accounting workspace.
- Add accounting workspace tab/page under event context.
- Add budget actuals columns in budget UI.

### Reporting
- Provide one backend projection endpoint for per-line and totals view.
- Accrual view: planned vs invoiced.
- Cash view: planned vs paid.

## Delivery Phases
1. Foundations: schema, permissions, domain models.
2. Schedule-cost integration and budget line synchronization.
3. Accounting entries and payment flows.
4. Reporting endpoints and frontend workspace.
5. Hardening: tests, audit checks, migration validation.

---

## Ticket Backlog

### ACC-001: Add Accounting and Schedule-Cost Schema
**Owner**: Backend  
**Depends on**: None

**Description**
Add all core tables and enums needed for schedule-linked planning costs and accounting actuals.

**Implementation**
- Update schema bootstrap in `backend/main.go`.
- Add tables:
  - `schedule_item_costs`
  - `accounting_documents`
  - `accounting_entries`
  - `payments`
  - `payment_allocations`
- Add enum-like constraints for:
  - `schedule_item_costs.status`
  - `accounting_documents.doc_type`
  - `accounting_documents.status`
  - `accounting_entries.entry_type`
  - `payments.method`
- Add foreign keys to:
  - `events`
  - `schedule_items`
  - `budget_line_items`
  - `vendors` (where available)
- Ensure `schedule_item_costs` stores the planning baseline and sync link fields needed for later comparisons:
  - `estimated_amount`
  - `currency`
  - `budget_line_item_id`
- Add indexes:
  - event and schedule-item access paths
  - document/date and status filters
  - allocation joins

**Acceptance Criteria**
- App boots with new schema on empty DB.
- Existing DB upgrades non-destructively.
- FK and constraint violations are enforced at DB level.
- Schema supports deriving estimate, invoiced, paid, and variance values per cost line.

---

### ACC-002: Add Accounting RBAC Permissions
**Owner**: Backend  
**Depends on**: ACC-001

**Description**
Introduce accounting permissions and wire authorization checks.

**Implementation**
- Add permissions in `backend/rbac/roles.go`:
  - `view_accounting`
  - `manage_accounting`
  - `approve_accounting`
- Map permissions to existing admin/staff roles.
- Enforce checks in all accounting endpoints.

**Acceptance Criteria**
- Unauthorized users cannot view or mutate accounting data.
- Existing non-accounting routes keep previous behavior.

---

### ACC-003: Implement Accounting Domain Models and Repository
**Owner**: Backend  
**Depends on**: ACC-001

**Description**
Create typed models and repository methods for accounting entities.

**Implementation**
- Add package `backend/accounting` with repository and models.
- CRUD/query support for:
  - `schedule_item_cost`
  - `accounting_document`
  - `accounting_entry`
  - `payment`
  - `payment_allocation`
- Add list/filter methods by event, status, date range.

**Acceptance Criteria**
- Repository covers read/write paths required by API.
- Unit tests validate mapping, null handling, and not-found behavior.

---

### ACC-004: Schedule Item Cost API and Budget Line Sync
**Owner**: Backend  
**Depends on**: ACC-003

**Description**
Allow schedule items to optionally carry planned costs and synchronize to budget line items.

**Implementation**
- Add endpoints under schedule/event context:
  - `GET /api/schedule-items/{id}/costs`
  - `POST /api/schedule-items/{id}/costs`
  - `PUT /api/schedule-item-costs/{costId}`
  - `DELETE /api/schedule-item-costs/{costId}`
- On create/update/delete of schedule item cost:
  - upsert/delete linked `budget_line_item`
  - preserve user-edited budget fields where required (define sync strategy)
- Add idempotent sync function in service layer.
- Treat the schedule item cost estimate as the authoritative planned amount for budget comparison.

**Acceptance Criteria**
- Financially-relevant schedule items produce budget lines automatically.
- Non-financial schedule items remain unchanged.
- Repeated updates do not create duplicate budget lines.

---

### ACC-005: Accounting Posting Service (Accrual + Cash)
**Owner**: Backend  
**Depends on**: ACC-003

**Description**
Implement invoice/credit/adjustment posting and payment allocation rules.

**Implementation**
- Add service logic for:
  - creating accounting documents
  - posting accounting entries per budget/schedule cost link
  - recording payments
  - allocating payments to cost lines/documents
- Enforce invariants:
  - allocation sum cannot exceed payment amount
  - paid can exceed invoiced only via explicit overpayment path
  - credits use negative signed amounts

**Acceptance Criteria**
- Invoicing updates accrual actuals.
- Payments update cash actuals.
- Validation errors are returned for over-allocation and invalid references.

---

### ACC-006: Cost Status State Machine and Auto-Derivation
**Owner**: Backend  
**Depends on**: ACC-004, ACC-005

**Description**
Derive cost status from financial activity, with explicit manual states for `disputed`/`cancelled`.

**Implementation**
- Add derived rules:
  - `expected`: no document and no payment
  - `committed`: marked committed without invoicing
  - `invoiced`: invoiced total > 0 and paid = 0
  - `partially_paid`: paid > 0 and paid < invoiced
  - `paid`: paid >= invoiced and invoiced > 0
- Manual-only transitions:
  - to/from `disputed`
  - to `cancelled` with reversal checks
- Add transition validation helper.

**Acceptance Criteria**
- Statuses update correctly after posting invoices and payments.
- Invalid manual transitions are rejected with reason codes.

---

### ACC-007: Accounting REST API Endpoints
**Owner**: Backend  
**Depends on**: ACC-002, ACC-005, ACC-006

**Description**
Expose endpoints for documents, entries, payments, allocations, and rollups.

**Implementation**
- Add routes:
  - `GET /api/events/{eventID}/accounting/documents`
  - `POST /api/events/{eventID}/accounting/documents`
  - `POST /api/accounting/documents/{docID}/entries`
  - `GET /api/events/{eventID}/accounting/entries`
  - `POST /api/events/{eventID}/accounting/payments`
  - `POST /api/accounting/payments/{paymentID}/allocations`
  - `GET /api/events/{eventID}/accounting/budget-actuals`
- Ensure the rollup payload can drive both the finance landing cards and the per-line comparison table.
- Validate amount precision, currency code, foreign keys, and date formats.

**Acceptance Criteria**
- APIs return typed payloads for frontend consumption.
- Errors follow existing backend error conventions.

---

### ACC-008: Budget Actuals Projection and Variance Engine
**Owner**: Backend  
**Depends on**: ACC-005

**Description**
Provide reporting projections per line and total for planned/invoiced/paid/open/variance.

**Implementation**
- Add service/query projection fields:
  - `planned_amount`
  - `invoiced_amount`
  - `paid_amount`
  - `open_invoice_amount`
  - `estimate_to_invoice_variance_amount`
  - `invoice_to_paid_variance_amount`
  - `variance_vs_budget`
  - `variance_percent`
  - `invoiced_variance_vs_budget`
  - `paid_variance_vs_budget`
- Include totals per event and grouping by section/category.

**Acceptance Criteria**
- Projection is deterministic for a fixed dataset.
- Credited lines and partial payments compute correctly.
- Every line can show the amount progression from estimate to invoiced to paid without manual calculation in the frontend.

---

### ACC-009: Frontend Types and API Client for Accounting
**Owner**: Frontend  
**Depends on**: ACC-007, ACC-008

**Description**
Add strict TypeScript types and API methods.

**Implementation**
- Add `frontend/src/api/accounting.ts`.
- Define DTO types for costs, documents, entries, payments, allocations, and actuals report.
- Integrate with existing event and budget pages.

**Acceptance Criteria**
- No `any` in accounting API boundary types.
- Frontend compiles with strict typing.

---

### ACC-010: Schedule Page Cost UI
**Owner**: Frontend  
**Depends on**: ACC-009, ACC-004

**Description**
Add optional cost section to schedule item detail/edit views.

**Implementation**
- Update schedule page components to:
  - attach planned cost to an item
  - assign category/currency/owner
  - show derived cost status badge
- Keep UI optional and non-blocking for non-financial items.

**Acceptance Criteria**
- Users can add/remove planned costs from schedule items.
- Schedule-only items continue to work unchanged.

---

### ACC-011: Accounting Workspace UI
**Owner**: Frontend  
**Depends on**: ACC-009

**Description**
Create event-level accounting workspace for document posting and payment tracking.

**Implementation**
- Add page `frontend/src/pages/EventAccountingPage.tsx`.
- Sections:
  - finance summary cards for budget/accrual/cash status
  - document list + create form
  - entry posting form
  - payment recording + allocation
  - line status table with estimate, invoiced, paid, and delta columns
- Add route and navigation entry from event context and the finance landing page.

**Acceptance Criteria**
- Users can post invoices/credits and record payments end-to-end.
- Status and totals refresh after mutations.

---

### ACC-012: Budget Page Integration for Actuals Columns
**Owner**: Frontend  
**Depends on**: ACC-008, ACC-009

**Description**
Expose planned vs invoiced vs paid vs variance directly in budget workspace.

**Implementation**
- Extend `frontend/src/pages/EventBudgetPage.tsx` line item table with:
  - invoiced
  - paid
  - open amount
  - estimate to invoiced variance
  - invoiced to paid variance
  - variance amount and percent
- Add toggle between accrual and cash emphasis.

**Acceptance Criteria**
- Budget users can compare budget and accounting in one view.
- Totals match backend projection endpoint.

---

### ACC-013: Audit Trail and Reversal Rules
**Owner**: Backend  
**Depends on**: ACC-005

**Description**
Guarantee traceability and non-destructive correction flow.

**Implementation**
- Ensure all accounting rows include `created_at`, `updated_at`, `created_by`.
- Implement soft-void/reversal paths for documents and entries.
- Prevent hard-delete on posted accounting records.

**Acceptance Criteria**
- Every accounting mutation is attributable.
- Corrections happen through reversal, not deletion.

---

### ACC-014: End-to-End Tests (Backend + Frontend Critical Flows)
**Owner**: Full-stack  
**Depends on**: ACC-011, ACC-012, ACC-013

**Description**
Add automated coverage for critical module flows.

**Implementation**
- Backend integration tests for:
  - schedule cost -> budget sync
  - invoice posting
  - partial and full payment allocation
  - disputed/cancelled edge transitions
  - variance projection correctness
- Frontend tests for:
  - cost attachment UI
  - accounting workspace forms
  - budget actuals display

**Acceptance Criteria**
- Test suite covers happy path and key edge cases.
- No regressions in existing budget calculations.

---

### ACC-015: Backfill and Migration Script for Existing Events
**Owner**: Backend  
**Depends on**: ACC-001, ACC-004

**Description**
Provide a safe migration path for existing data.

**Implementation**
- Add one-time script/handler to:
  - link existing relevant budget lines to synthetic `schedule_item_cost` where possible
  - leave ambiguous records unlinked with review flag
- Output migration report counts.

**Acceptance Criteria**
- Existing events are usable without manual DB surgery.
- Unresolved links are explicitly reported for manual follow-up.

---

### ACC-016: Operational Readiness and Rollout Controls
**Owner**: Full-stack  
**Depends on**: ACC-014, ACC-015

**Description**
Ship module behind controlled rollout and monitor correctness.

**Implementation**
- Add feature flag for accounting workspace visibility.
- Add basic metrics/logging:
  - number of posted documents
  - allocation failures
  - status transition failures
- Add rollback plan for UI-only disable while keeping persisted data.

**Acceptance Criteria**
- Module can be enabled per environment.
- Production incidents can be mitigated without destructive rollback.

---

## Suggested Execution Order
1. ACC-001, ACC-002, ACC-003
2. ACC-004, ACC-005, ACC-006
3. ACC-007, ACC-008
4. ACC-009, ACC-010, ACC-011, ACC-012
5. ACC-013, ACC-014, ACC-015, ACC-016

## Definition of Done (Module)
- Schedule items can optionally carry planned costs.
- Planned costs are synchronized into budget lines.
- Invoices/credits/payments are recordable and auditable.
- Cost status reflects real accounting activity.
- Finance pages show estimate vs invoiced vs paid and compare those actuals back to budget.
- Core flows are covered by automated tests.
