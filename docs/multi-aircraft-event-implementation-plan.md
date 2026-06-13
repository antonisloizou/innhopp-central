# Multi-Aircraft Event Implementation Plan

## Goal

Support events with multiple aircraft.

Operationally, aircraft will be managed on the event details page instead of the budget page. Each event can define multiple aircraft, each aircraft has its own commercial and operational parameters, and each innhopp is assigned to one aircraft. Budget aircraft line items and scenario calculations must then derive from the aircraft assigned to each innhopp.

## Scope Summary

- Add event-level aircraft management.
- Add innhopp-to-aircraft association.
- Move aircraft pricing and runtime parameters out of budget assumptions.
- Generate aircraft budget line items from assigned aircraft.
- Preserve compatibility for existing events through migration/backfill.
- Update downstream consumers that currently read aircraft speed from budget assumptions.

## Current State

Today the system is organized differently:

- `event_innhopps` stores jump metadata, but no aircraft assignment.
- `event_budgets.aircraft_currency` stores global aircraft currency per budget.
- `budget_assumptions` stores:
  - `aircraft_price_per_minute`
  - `aircraft_cruising_speed_kmh`
  - `minimum_load_duration`
- Budget auto-aircraft line items are generated globally across all innhopps using those budget-owned values.
- Route preview and related UI currently read aircraft speed from budget assumptions.

This means the change is a domain ownership shift, not just a field move.

## Proposed Domain Model

Recommended model:

- New reusable `aircraft` master table.
- New event-to-aircraft association table so an event can attach multiple reusable aircraft.
- New nullable `aircraft_id` foreign key on `event_innhopps`, referencing the reusable aircraft record selected for that event.
- Each aircraft stores:
  - `name`
  - `pricing_model` with allowed values `time` and `slot`
  - `rate_currency`
  - time-pricing fields:
    - `rate_per_minute`
    - `cruising_speed_kmh`
    - `minimum_load_duration`
  - slot-pricing fields:
    - `price_per_slot`
  - slot multiplier bands:
    - any number of distance bands per aircraft
    - each band defines a `max_distance_km` and a `slot_multiplier`
  - `notes`
  - reusable aircraft metadata as needed later

Event association stores:

- `event_id`
- `aircraft_id`
- event-specific `sort_order`
- optional event-specific overrides only if needed in a future phase

Recommended rules:

- One aircraft can be reused across many events.
- One event can attach many aircraft.
- One innhopp can reference zero or one aircraft.
- Each aircraft has exactly one active pricing model.
- Time-priced aircraft use the current minute-based model.
- Slot-priced aircraft use price-per-slot and configurable distance multiplier bands.
- Budget auto-aircraft costs are generated only for innhopps with an assigned aircraft.
- Unassigned innhopps are allowed in all states including draft, but they should always produce visible warnings and no derived aircraft budget row.

## Architecture Decisions

### Decision 1: Aircraft should be reusable across events

Reasoning:

- Aircraft can be real-world assets reused across multiple events.
- This avoids re-entering the same aircraft details for every event.
- Budget should consume aircraft data, not own it.

### Decision 2: Innhopp should reference aircraft directly

Reasoning:

- The requirement is one assigned aircraft per innhopp.
- `aircraft_id` on `event_innhopps` is the simplest data model.
- This avoids duplicating aircraft parameters on every innhopp.

### Decision 3: Preserve historical compatibility through backfill

Reasoning:

- Existing events and budgets already rely on budget-owned aircraft assumptions.
- We need a migration path that preserves numbers and avoids breaking existing data.

### Decision 4: Delay destructive cleanup until after rollout verification

Reasoning:

- It is safer to migrate and switch reads first.
- Legacy budget aircraft fields can be removed in a final cleanup step after verification.

### Decision 5: Aircraft pricing must support both time and slot models

Reasoning:

- Some aircraft are priced by airtime.
- Some aircraft are priced by slots instead of elapsed flight minutes.
- The pricing strategy belongs to the aircraft definition and should be reusable across events.

### Decision 6: Slot pricing needs arbitrary distance bands per aircraft

Reasoning:

- Distance-to-slot conversion differs by aircraft and operator agreement.
- Hardcoded brackets would be too restrictive.
- An ordered list of distance bands keeps the model flexible without adding event-specific overrides.

## Tickets

### Ticket 1: Finalize product and validation rules

**Purpose**

Define the exact business rules before implementation begins.

**Work**

- Confirm that an innhopp can have only one aircraft.
- Confirm whether aircraft assignment is optional during draft editing.
- Confirm delete behavior for aircraft referenced by innhopps.
- Confirm UI labels and naming conventions.
- Confirm how auto-generated aircraft line items should be labeled.

**Recommendation**

- Allow missing aircraft assignment during planning.
- Block deletion of aircraft that is still assigned to innhopps.
- Show aircraft name in generated line items for clarity.

**Acceptance Criteria**

- Business rules are written down and agreed before schema work starts.
- Backend validation and frontend UX rules are consistent with the agreed contract.

### Ticket 2: Add database support for reusable aircraft

**Purpose**

Introduce first-class reusable aircraft persistence with event association.

**Work**

- Create new `aircraft` table.
- Create new `aircraft_slot_pricing_bands` table.
- Create new event-to-aircraft join table, e.g. `event_aircraft`.
- Add `aircraft_id` to `event_innhopps`.
- Add indexes for common read paths.
- Add foreign key constraints.
- Decide whether `budget_line_items` also needs `aircraft_id`.

**Recommended schema**

- `aircraft`
  - `id`
  - `name`
  - `pricing_model`
  - `rate_currency`
  - `rate_per_minute`
  - `cruising_speed_kmh`
  - `minimum_load_duration`
  - `price_per_slot`
  - `notes`
- `created_at`
- `updated_at`
- `aircraft_slot_pricing_bands`
  - `id`
  - `aircraft_id`
  - `max_distance_km`
  - `slot_multiplier`
  - `sort_order`
  - `created_at`
  - `updated_at`
- `event_aircraft`
  - `event_id`
  - `aircraft_id`
  - `sort_order`
  - `created_at`
- `event_innhopps.aircraft_id` nullable FK to `aircraft(id)`

**Recommendation**

- Do not add `aircraft_id` to `budget_line_items` in the first pass unless reporting needs it immediately. `innhopp_id` already gives traceability.

**Acceptance Criteria**

- Schema boots cleanly in a fresh environment.
- Schema upgrade applies cleanly on existing environments.
- `event_innhopps` can reference only aircraft attached to the same event.
- Aircraft can persist both pricing models.
- Slot multiplier bands can be stored in any count and stable order per aircraft.

### Ticket 3: Backfill existing data from legacy budget aircraft fields

**Purpose**

Preserve existing behavior and values for current events.

**Work**

- For each event with legacy aircraft budget settings:
  - create or reuse a default aircraft, e.g. `Aircraft 1`
  - copy:
    - budget `aircraft_currency`
    - budget assumption `aircraft_price_per_minute`
    - budget assumption `aircraft_cruising_speed_kmh`
    - budget assumption `minimum_load_duration`
  - set `pricing_model = time`
  - attach that aircraft to the event
  - assign all existing event innhopps to that aircraft
- Make migration idempotent.

**Acceptance Criteria**

- Existing events have exactly one attached backfilled aircraft after migration where applicable.
- Existing innhopps are assigned to that backfilled aircraft.
- Post-migration budget numbers remain materially unchanged for unchanged data.

### Ticket 4: Extend backend event API types and payloads

**Purpose**

Expose reusable aircraft in event read/write APIs.

**Work**

- Add attached aircraft array to event response type.
- Add support for attaching existing aircraft to an event.
- Add inline create support when attaching a new aircraft from event details.
- Add `aircraft_id` to innhopp payloads.
- Validate:
  - aircraft is attached to same event
  - `rate_currency` is a valid 3-letter ISO currency code
  - numeric values are non-negative
  - slot-pricing bands are valid when `pricing_model = slot`

**Acceptance Criteria**

- `GET /events/events/:id` returns aircraft with stable ordering.
- Event create/update endpoints accept attached aircraft data.
- Event create/update endpoints support both existing aircraft attachment and inline creation.
- Event create/update endpoints accept `aircraft_id` on innhopps.
- Invalid cross-event aircraft references are rejected.
- Aircraft API contracts include pricing model and slot multiplier bands.

### Ticket 5: Update backend event persistence flow transactionally

**Purpose**

Persist aircraft and innhopp assignment safely in one event save.

**Work**

- Update event save path so aircraft attachment and innhopps are written in one transaction.
- Persist any newly created aircraft before innhopps so `aircraft_id` can be resolved.
- Support full replacement semantics safely, since current event save replaces all innhopps.
- Handle ordering and mapping between submitted aircraft rows and persisted rows.

**Risk**

- The existing replace-all innhopp flow can break aircraft mapping if the save order is wrong.

**Acceptance Criteria**

- Event save can attach, inline-create, detach, and reorder aircraft.
- Event save can assign innhopps to aircraft in the same request.
- Partial writes do not occur if one part of the payload fails validation.

### Ticket 6: Add pricing model support to aircraft calculations

**Purpose**

Support both time-based and slot-based costing from the reusable aircraft definition.

**Work**

- Add pricing model handling in backend aircraft logic.
- For `time` pricing:
  - keep the current minute-based calculation
  - use `cruising_speed_kmh`
  - use `minimum_load_duration`
  - use `rate_per_minute`
- For `slot` pricing:
  - use `distance_by_air` as pricing distance
  - choose the first band where `distance_by_air <= max_distance_km`
  - derive slot quantity as `load_count * slot_multiplier`
  - use `price_per_slot`
- Use `rate_currency` for both pricing models.
- Decide overflow behavior when no band matches.

**Recommendation**

- Bands should be evaluated in ascending `max_distance_km` order.
- If no band matches, use the highest configured band as an open-ended fallback and still emit warnings.

**Acceptance Criteria**

- Aircraft costing chooses the correct formula from `pricing_model`.
- Time-priced aircraft preserve current behavior.
- Slot-priced aircraft compute totals from price-per-slot and distance bands.
- Overflow distance beyond the highest configured band uses the last band and still emits warnings.
- Invalid or missing slot band configuration does not silently generate wrong costs.

### Ticket 7: Move budget aircraft calculations to aircraft-owned data

**Purpose**

Make aircraft calculations derive from the innhopp’s assigned aircraft instead of global budget assumptions.

**Work**

- Replace global aircraft calculation logic.
- For each innhopp:
  - load assigned aircraft
  - use aircraft `pricing_model`
  - use aircraft `rate_currency`
  - use time-pricing fields when `pricing_model = time`
  - use slot-pricing fields and distance bands when `pricing_model = slot`
- Aggregate totals in budget base currency using existing FX model.

**Acceptance Criteria**

- Events with multiple aircraft produce different aircraft-derived totals when aircraft parameters differ.
- Mixed aircraft currencies convert correctly into base currency summaries.
- Unassigned innhopps do not silently inherit global defaults.
- Time-priced and slot-priced aircraft can coexist in the same event budget.

### Ticket 8: Regenerate aircraft auto line items per innhopp aircraft

**Purpose**

Generate aircraft line items based on the aircraft assigned to each innhopp.

**Work**

- Update auto-aircraft line item sync.
- Generate one aircraft line item per innhopp with assigned aircraft.
- Populate:
  - `quantity` from derived minutes for time-priced aircraft
  - `quantity` from derived slots for slot-priced aircraft
  - `unit_cost` from aircraft rate per minute or aircraft price per slot
  - `cost_currency` from aircraft rate currency
  - `innhopp_id`
  - `location_label` from innhopp label
  - `name` including the aircraft name
- Surface warnings when:
  - aircraft is missing
  - distance/airfield data is insufficient for calculation
  - slot-priced aircraft has invalid or missing bands
  - slot-priced aircraft exceeds the highest configured band and falls back to the last band

**Acceptance Criteria**

- Generated aircraft line items reflect the assigned aircraft values.
- Generated aircraft line items display aircraft name clearly.
- Regeneration updates stale auto rows and removes no-longer-valid auto rows.
- Missing aircraft assignments are visible and do not generate misleading rows.
- Time-priced and slot-priced quantities are generated correctly.
- Line items generated from overflow fallback are still created and visibly warned.

### Ticket 9: Remove budget ownership of aircraft parameters

**Purpose**

Stop budget from acting as the source of truth for aircraft settings.

**Work**

- Stop using:
  - `event_budgets.aircraft_currency`
  - `budget_assumptions.aircraft_price_per_minute`
  - `budget_assumptions.aircraft_cruising_speed_kmh`
  - `budget_assumptions.minimum_load_duration`
- Do not introduce new slot-pricing configuration into budget-owned tables.
- Keep legacy fields temporarily during rollout if needed for compatibility.
- Remove them fully in final cleanup migration after verification.

**Acceptance Criteria**

- Budget calculations no longer depend on legacy aircraft assumption keys.
- Budget save flow no longer needs aircraft settings payloads.
- Cleanup plan exists for removing dead schema and code after rollout validation.

### Ticket 10: Add frontend event aircraft types and API integration

**Purpose**

Expose aircraft to the frontend data model.

**Work**

- Extend `frontend/src/api/events.ts` with:
  - `EventAircraft`
  - `AircraftPricingModel`
  - `AircraftSlotPricingBand`
  - aircraft array on `Event`
  - aircraft payload shape on create/update
  - `aircraft_id` on `Innhopp` and `InnhoppInput`

**Acceptance Criteria**

- Frontend event types match backend contract.
- Event read/write calls support aircraft data without type gaps.

### Ticket 11: Add aircraft card on event details page

**Purpose**

Allow event managers to attach and create aircraft from the event details page.

**Work**

- Add new aircraft card to `frontend/src/pages/EventDetailPage.tsx`.
- Support:
  - attach existing aircraft
  - inline create aircraft
  - remove aircraft from event
  - reorder aircraft if needed
  - edit aircraft name
  - choose pricing model
  - edit rate per minute
  - edit rate currency
  - edit cruising speed
  - edit minimum load duration
  - edit price per slot
  - add/remove/reorder any number of slot multiplier bands
  - edit notes
- Reuse existing currency list support.

**Acceptance Criteria**

- Users can attach existing aircraft and inline-create new aircraft from event details.
- Aircraft fields validate cleanly in the UI.
- Save persists aircraft changes alongside other event details.
- Pricing-model-specific fields appear only when relevant.
- Slot multiplier bands can be managed inline with no hardcoded limit.

### Ticket 12: Add dedicated aircraft detail page

**Purpose**

Provide a focused page for aircraft maintenance beyond inline event editing.

**Work**

- Add aircraft detail route and page.
- Support create/edit flows for reusable aircraft records.
- Show key aircraft parameters and event attachment context.
- Support both pricing models.
- Provide full slot multiplier band editor.
- Support navigation from event details into aircraft details.

**Acceptance Criteria**

- Users can open a dedicated aircraft detail page for an attached aircraft.
- Users can create and edit reusable aircraft outside the event form.
- Event details and aircraft detail page stay consistent after save.
- Aircraft detail page supports arbitrary slot multiplier bands.

### Ticket 13: Add aircraft assignment control to innhopps

**Purpose**

Associate each innhopp with the relevant aircraft.

**Work**

- Add aircraft selector to the innhopp editor on event details.
- Only show aircraft from the same event.
- Clear or flag invalid selection when an aircraft is removed.
- Choose field placement so the relationship is obvious to users.

**Acceptance Criteria**

- Each innhopp can be assigned to one aircraft from the event.
- Removing or renaming aircraft updates selector behavior correctly.
- Invalid aircraft references cannot be submitted.

### Ticket 14: Remove aircraft parameters from budget page UI

**Purpose**

Reflect the new ownership model in the budget interface.

**Work**

- Remove budget parameter fields for:
  - aircraft rate per minute
  - aircraft currency
  - aircraft speed
  - minimum load duration
- Replace with read-only guidance that aircraft settings are managed on event details.
- Ensure budget save payload no longer writes removed aircraft fields.

**Acceptance Criteria**

- Budget page no longer exposes aircraft parameter editing.
- Budget save works without those fields.
- Users are directed to event details for aircraft management.

### Ticket 15: Update budget displays for mixed-aircraft events

**Purpose**

Ensure budget UI remains clear when events use multiple aircraft.

**Work**

- Verify aircraft section totals still summarize correctly in base/display currency.
- Show aircraft name in auto-generated line item labels or notes.
- Make sure mixed source currencies display correctly through current conversion UI.
- Make minutes-based and slot-based quantities understandable in the UI.

**Acceptance Criteria**

- Budget aircraft totals remain understandable for multiple aircraft.
- Users can identify which aircraft produced which auto-generated rows.
- Users can distinguish time-priced and slot-priced generated rows.

### Ticket 16: Update route planner and schedule preview consumers

**Purpose**

Remove downstream dependency on budget assumptions for aircraft speed.

**Work**

- Update route and preview code that currently reads `aircraft_cruising_speed_kmh` from budget assumptions.
- Instead use the speed from the innhopp’s assigned aircraft.
- Decide fallback behavior for unassigned aircraft.
- For slot-priced aircraft, continue using speed only for operational preview, not for pricing.

**Recommendation**

- Show `Unavailable` when aircraft speed is missing rather than applying a fake default in preview UI.

**Acceptance Criteria**

- Schedule preview flight-time calculations use the assigned aircraft speed.
- Events with different aircraft show different route/preview timings when appropriate.
- Unassigned innhopps display a clear fallback state.
- Slot pricing does not interfere with route-time preview behavior.

### Ticket 17: Add validation and warning UX

**Purpose**

Make incomplete aircraft setup visible and safe.

**Work**

- Add frontend and backend validation for aircraft fields.
- Add warning states for:
  - innhopp without aircraft
  - aircraft assigned but route metrics incomplete
  - deleted/invalid aircraft reference
  - slot-priced aircraft with missing or invalid distance bands
  - slot-priced aircraft whose innhopp distance exceeds the configured bands and falls back to the last band
- Ensure budget page communicates skipped or partial auto-aircraft generation.

**Product rule**

- Show missing-aircraft warnings even in draft state.
- If an innhopp distance exceeds the highest slot band, still generate costing from the last band but warn on both the innhopp and the generated line item.

**Acceptance Criteria**

- Users get actionable feedback when aircraft setup is incomplete.
- Budget output never silently invents aircraft costs from missing data.

### Ticket 18: Add backend automated tests

**Purpose**

Protect the migration and calculation changes.

**Work**

- Add tests for:
  - aircraft persistence through event APIs
  - innhopp aircraft assignment validation
  - migration/backfill behavior
  - auto-generated aircraft line items for:
    - one aircraft
    - multiple aircraft
    - mixed currencies
    - mixed pricing models
    - mixed speeds
    - mixed minimum load durations
    - slot pricing with multiple bands
    - slot pricing with overflow beyond the highest configured band
    - missing aircraft assignment
  - budget scenario summaries after migration

**Acceptance Criteria**

- New backend tests cover the new aircraft data flow end to end.
- Existing aircraft budget integration tests are updated to the new model.

### Ticket 19: Add frontend automated tests

**Purpose**

Protect UI behavior and contract changes.

**Work**

- Add tests for:
  - aircraft card rendering and editing
  - aircraft detail page flows
  - pricing model switching
  - slot band editing
  - innhopp aircraft selector behavior
  - budget page removal of aircraft parameter editors
  - preview/route usage of assigned aircraft speed

**Acceptance Criteria**

- Frontend tests cover creation, editing, assignment, and downstream display behavior.

### Ticket 20: Update technical documentation

**Purpose**

Document the new ownership model and operational flow.

**Work**

- Update `README.md`
- Update `backend/README.md`
- Document:
  - multi-aircraft support
  - reusable global aircraft
  - innhopp aircraft assignment
  - time-based vs slot-based pricing
  - slot multiplier band behavior
  - budget derivation behavior
  - migration notes for existing data

**Acceptance Criteria**

- Documentation reflects the new model and major workflows.

## Delivery Sequence

Recommended implementation order:

1. Finalize business rules.
2. Add schema for reusable `aircraft`, event association, and `event_innhopps.aircraft_id`.
3. Add migration/backfill from legacy budget aircraft fields.
4. Extend backend event APIs and transactional save flow.
5. Add frontend event aircraft card, aircraft detail page, and innhopp selector.
6. Add pricing model support for time-based and slot-based costing.
7. Switch budget calculation and auto-line-item generation to aircraft data.
8. Remove aircraft editing from budget UI.
9. Update route preview and any other downstream consumers.
10. Add tests.
11. Update docs.
12. Remove legacy budget aircraft schema and dead code after rollout verification.

## Risks

### Risk 1: Event save currently replaces innhopps wholesale

Impact:

- Aircraft assignment can break if aircraft persistence and innhopp persistence are not coordinated carefully.

Mitigation:

- Persist aircraft and innhopps in one transaction.
- Resolve aircraft references before writing innhopps.

### Risk 2: Historical budget compatibility

Impact:

- Existing events may show different aircraft cost totals after rollout if backfill is incomplete or wrong.

Mitigation:

- Perform deterministic backfill.
- Add integration tests comparing pre/post-migration behavior for legacy-style events.

### Risk 3: Mixed aircraft currencies

Impact:

- Aircraft totals can become misleading if conversion is inconsistent across line items and summaries.

Mitigation:

- Keep base-currency conversion in budget summary as the canonical source.
- Test multi-currency scenarios explicitly.

### Risk 4: Downstream hidden dependencies

Impact:

- UI pieces outside the budget page may still read aircraft speed from budget assumptions.

Mitigation:

- Audit all consumers before cleanup.
- Add explicit follow-up tickets for route preview and overlays.

### Risk 5: Slot band ambiguity

Impact:

- Pricing can become inconsistent if band ordering, boundary rules, or overflow behavior are not defined clearly.

Mitigation:

- Define an explicit first-match rule.
- Validate sort order and band configuration.
- Use explicit open-ended fallback to the last configured band and warn wherever fallback occurs.

### Risk 6: Quantity semantics in budget UI

Impact:

- Users may read slot-based quantities as minutes unless the UI makes the distinction explicit.

Mitigation:

- Differentiate slot-based and time-based rows in labels or helper text.
- Update any UI copy that currently implies all aircraft quantities are minutes.

## Open Questions

- Should aircraft names be unique within an event?
  - Recommendation: yes at the UX level for attached aircraft lists, even if the reusable master record is not globally unique.
- What is the exact overflow rule when distance exceeds the highest slot band?
  - Decided: use the highest configured band as an open-ended fallback and warn on both the innhopp and the generated line item.
- Should slot pricing use `distance_by_air` only?
  - Recommendation: yes, use `distance_by_air` as the pricing distance input for now.
- Should slot-priced aircraft still store speed?
  - Recommendation: yes, because route preview and operational planning can still use speed even when pricing does not.
- Should an innhopp without aircraft be allowed past planning state?
  - Decided: allowed, but warn already in draft state.
- Should generated aircraft line items show generic `Aircraft` or the aircraft name?
  - Decided: use aircraft name for clarity.
- Do we need a dedicated aircraft page?
  - Decided: yes, add aircraft detail page while keeping inline create/attach on event details.

## Definition of Done

This initiative is done when all of the following are true:

- Event details supports attaching and inline-creating multiple reusable aircraft.
- Aircraft can also be maintained from a dedicated aircraft detail page.
- Each innhopp can be assigned to one aircraft attached to the event.
- Budget no longer owns aircraft speed, aircraft currency, aircraft rate, minimum load duration, or slot-pricing configuration.
- Aircraft auto-line-items and scenario totals derive from assigned aircraft.
- Aircraft auto-line-items display aircraft names.
- Aircraft support both time-based and slot-based costing.
- Slot-based costing supports any number of distance multiplier bands per aircraft.
- Missing aircraft warnings appear even in draft state.
- Existing data is migrated safely.
- Route preview and related UI no longer read aircraft speed from budget assumptions.
- Tests cover the new model.
- Docs reflect the new architecture.
