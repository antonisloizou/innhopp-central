# Roster Check-in: Implementation Specification

## Goal

Provide an on-demand **Roster check-in** for every schedule item in an event. It lets staff quickly record who is present from the expected participant and staff roster.

For an innhopp, staff can also manually record each checked-in person's **distance from target**. The schedule then shows the checked-in total and the calculated average distance.

## Scope

- A roster check-in is available for every schedule-item type displayed in the event schedule.
- It is created only when a staff member selects **Create roster check-in**.
- The check-in contains one row per expected person and one presence checkbox per row.
- Expected people include all participants and staff assigned to the event at the time the check-in is created.
- The expected roster is snapshotted at creation so later event-roster changes do not alter the historical denominator.
- A check-in can be deleted and recreated after the event roster has been corrected.
- Recreating a deleted check-in uses the current event roster and carries over recorded values for people who remain on that roster.
- An innhopp check-in includes an optional, manually entered distance-from-target value for each person.
- The schedule displays only the agreed summaries; the full roster is visible only after opening the check-in.

## Out of Scope (V1)

- GPS/location capture or automatic distance calculation.
- Attendance states beyond present/not present (for example late, excused, or absent reasons).
- Participant self-check-in.
- Check-in summaries in exports, printouts, reporting, or notifications.
- Editing the roster directly inside an existing check-in. Correct the event roster, then delete and recreate the check-in instead.

## User Flow

1. A staff member opens an event schedule item.
2. If no check-in exists, they select **Create roster check-in**.
3. The system creates the record and snapshots the event's participants and staff into individual rows, initially unchecked.
4. The staff member ticks a person's checkbox to record that they are present. Changes save immediately.
5. On an innhopp, staff may manually enter a distance from target for each person. Distance is optional and does not automatically mark the person present.
6. Once created, the schedule-item action changes to **Open roster check-in**. It always opens the same record; a second check-in cannot be created for the same item.
7. If the expected roster is wrong, a staff member selects **Delete roster check-in** and confirms the action.
8. After the event roster is corrected, selecting **Create roster check-in** creates a new version from the current roster. For every person who remains on the roster, the system copies their previous presence checkbox and, for innhopps, their distance value. New people begin unchecked with no distance. Removed people do not appear in the new check-in.

## Delete and Recreate Rules

- “Delete” retires the active check-in rather than permanently erasing its data. This preserves a recovery source and basic audit history.
- A deleted check-in is not shown in normal schedule or check-in views.
- At most one check-in may be active for a schedule item.
- Recreating always takes its denominator from the event roster as it exists at that moment; it must not reuse the old roster snapshot.
- Carry values forward only by the stable participant profile ID, never by display name or email.
- Carry forward `is_present` and, for an innhopp, `distance_from_target_meters`. Do not carry values for a person removed from the corrected roster.
- A delete confirmation must make clear that a replacement check-in can restore entries only for people still present in the corrected roster.

## Schedule Display

After a roster check-in exists, show a compact, read-only summary on its schedule entry:

- All schedule items: `Checked in: 12/14`
- Innhopps: `Checked in: 12/14 · Average distance: 180 m`

The numerator is the number of checked presence boxes. The denominator is the number of people in the roster snapshot.

For innhopps, calculate **Average distance** from entries that are both checked in and have a distance value. Do not show an average until at least one qualifying distance has been entered. Round the displayed value to a whole metre.

## Innhopp Aircraft Label

In the innhopp schedule summary, show the assigned aircraft name directly after the existing plane icon.

Example: `✈ Cessna Caravan`

- Show the icon and name only when an aircraft is assigned to the innhopp.
- Do not introduce a fallback aircraft name when no aircraft is assigned.
- This label is independent of roster check-in creation and remains visible whether or not a check-in exists.

## Data Model

Use a generic parent record linked to a schedule entry, with person-level child rows.

### `roster_check_ins`

- `id`
- `event_id` — owning event
- `schedule_item_type` — the concrete schedule type, such as `innhopp`, `transport`, `ground_crew`, `meal`, or `other`
- `schedule_item_id` — identifier of the source schedule record
- `created_by_account_id`
- `created_at`
- `updated_at`
- `deleted_by_account_id` — nullable
- `deleted_at` — nullable

Enforce a partial unique constraint on `(event_id, schedule_item_type, schedule_item_id)` where `deleted_at IS NULL`, so a schedule item has at most one active roster check-in while retaining deleted versions.

### `roster_check_in_entries`

- `id`
- `roster_check_in_id`
- `participant_id`
- `participant_name_snapshot`
- `roles_snapshot` — preserves whether the person was participant/staff at creation
- `is_present` — boolean, default `false`
- `distance_from_target_meters` — nullable numeric; valid only for an innhopp check-in
- `updated_by_account_id`
- `updated_at`

Enforce one row per person per roster check-in with a unique constraint on `(roster_check_in_id, participant_id)`.

Distances must be zero or greater. Store metres as the canonical unit and label the input **Distance from target (m)**.

## Backend/API Plan

1. Add the two tables and indexes in the existing schema-bootstrap migration flow.
2. Add a `rostercheckins` backend package with validation and authorization.
3. Expose event-scoped endpoints to:
   - retrieve the check-in for a schedule item;
   - create it and snapshot the expected roster;
   - update an entry's `is_present` value;
   - update an innhopp entry's manual distance;
   - delete (soft-delete) an active check-in;
   - return the calculated summary needed by the schedule.
4. Validate server-side that the source schedule item belongs to the supplied event and that its type matches the referenced record.
5. Reject a distance update for non-innhopp check-ins.
6. Treat create requests as idempotent: if an active check-in already exists, return it rather than creating a duplicate. If only deleted versions exist, create a fresh roster snapshot and copy entries forward according to the delete and recreate rules.
7. Apply appropriate existing event/staff permissions for viewing and managing roster check-ins. Participant-only access must not allow changing check-in data.

## Frontend Plan

1. Add the create/open action to each schedule item in `EventSchedulePage` and any schedule-entry preview/detail surface that exposes item actions.
2. Add a roster check-in panel or dedicated view with:
   - schedule item title and time;
   - a checked-in counter;
   - one clearly tappable presence checkbox per person;
   - on innhopps only, a numeric `Distance from target (m)` input per row.
3. Save checkbox and distance changes immediately, with an unobtrusive saving/error state.
4. Update the corresponding schedule entry after a successful change so its summary is current.
5. Add the assigned aircraft name next to the existing plane icon in the innhopp schedule-entry summary.
6. Provide **Delete roster check-in** in the open check-in view for authorized staff, with a confirmation dialog. After deletion, return to the schedule item and show **Create roster check-in**.

## Acceptance Criteria

- Staff can create a roster check-in from any schedule item with one click.
- The new check-in contains every participant and staff member expected for that event at creation time.
- Each person can be marked present with exactly one checkbox.
- Creating/opening a check-in never produces duplicates for the same schedule item.
- Authorized staff can delete an active check-in, correct the event roster, and create a replacement.
- The replacement contains the corrected current roster and carries forward presence and innhopp-distance values for matching people.
- A deleted check-in does not contribute to the schedule summary.
- The schedule shows `Checked in: present/expected` once a check-in exists.
- An innhopp check-in accepts a manual per-person distance in metres.
- Innhopp average distance includes only present people with a recorded distance and is correctly rounded for display.
- Non-innhopp check-ins never display or accept distance values.
- An innhopp with an assigned aircraft displays its aircraft name next to the plane icon.
- Existing event, schedule, and innhopp behaviour remains unchanged when no roster check-in exists.
