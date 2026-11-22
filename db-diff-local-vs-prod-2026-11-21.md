# Full database diff: local vs production

Generated 2026-11-21. Production is the reference side. No database writes were performed.

## Reading the report

- **Local-only**: present locally, absent in production.
- **Prod-only**: present in production, absent locally.
- **Changed**: same primary key on both sides, with field-level differences shown as `prod → local`.
- Passwords, tokens, secrets, credential material, and hashes are redacted.

## Overall summary

- Tables compared: 71
- Rows: local 6,203; production 6,265
- Tables with data differences: 32
- Local-only rows: 122
- Prod-only rows: 184
- Changed rows paired by primary key: 259

## Schema differences

- Both sides contain 71 public base tables.
- Production runs PostgreSQL 17.9; local runs PostgreSQL 18.1.
- Local has explicitly named `NOT NULL` constraints on 17 snapshot/actor columns where production has unnamed `NOT NULL` constraints. The nullability is the same, but the constraint definitions/names differ.
- No table, column, index, primary-key, foreign-key, default, or check-constraint presence differences were found beyond those named `NOT NULL` constraints.

## Differences by table

| Table | Local rows | Prod rows | Local-only | Prod-only | Changed |
|---|---:|---:|---:|---:|---:|
| `public.account_roles` | 138 | 145 | 13 | 20 | 0 |
| `public.accounting_documents` | 0 | 0 | 0 | 0 | 0 |
| `public.accounting_entries` | 0 | 0 | 0 | 0 | 0 |
| `public.accounts` | 96 | 100 | 0 | 4 | 0 |
| `public.aircraft` | 5 | 5 | 0 | 0 | 2 |
| `public.aircraft_slot_pricing_bands` | 4 | 4 | 4 | 4 | 0 |
| `public.airfields` | 67 | 67 | 0 | 0 | 0 |
| `public.auth_magic_links` | 0 | 8 | 0 | 8 | 0 |
| `public.budget_assumptions` | 246 | 242 | 70 | 66 | 0 |
| `public.budget_currencies` | 29 | 28 | 3 | 2 | 8 |
| `public.budget_line_items` | 491 | 483 | 8 | 0 | 34 |
| `public.budget_scenarios` | 0 | 0 | 0 | 0 | 0 |
| `public.budget_sections` | 108 | 108 | 0 | 0 | 36 |
| `public.checklist_template_items` | 39 | 39 | 0 | 0 | 0 |
| `public.checklist_templates` | 5 | 5 | 0 | 0 | 0 |
| `public.crew_assignments` | 0 | 0 | 0 | 0 | 0 |
| `public.email_campaigns` | 7 | 7 | 0 | 0 | 0 |
| `public.email_deliveries` | 47 | 47 | 0 | 0 | 0 |
| `public.email_templates` | 5 | 5 | 0 | 0 | 0 |
| `public.event_accommodation` | 34 | 34 | 0 | 0 | 3 |
| `public.event_aircraft` | 20 | 20 | 0 | 0 | 2 |
| `public.event_airfields` | 102 | 102 | 0 | 0 | 3 |
| `public.event_budgets` | 18 | 18 | 0 | 0 | 6 |
| `public.event_innhopps` | 225 | 225 | 0 | 0 | 12 |
| `public.event_non_jumper_activities` | 4 | 0 | 4 | 0 | 0 |
| `public.event_registrations` | 215 | 216 | 0 | 1 | 79 |
| `public.event_staff_meetings` | 2 | 0 | 2 | 0 | 0 |
| `public.events` | 18 | 18 | 0 | 0 | 0 |
| `public.gear_assets` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_checklist_item_events` | 522 | 522 | 0 | 0 | 0 |
| `public.innhopp_checklist_overrides` | 2 | 2 | 0 | 0 | 0 |
| `public.innhopp_checklist_resets` | 8 | 8 | 0 | 0 | 0 |
| `public.innhopp_ground_crew_kit_item_events` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_ground_crew_kit_items` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_ground_crew_site_kit_item_events` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_ground_crew_site_kit_items` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_ground_crew_task_item_events` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_ground_crew_task_items` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_operational_states` | 16 | 16 | 0 | 0 | 0 |
| `public.innhopp_packer_kit_item_events` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_packer_kit_items` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_packer_site_kit_item_events` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_packer_site_kit_items` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_packer_task_item_events` | 0 | 0 | 0 | 0 | 0 |
| `public.innhopp_packer_task_items` | 0 | 0 | 0 | 0 | 0 |
| `public.logistics_event_vehicles` | 62 | 62 | 0 | 0 | 1 |
| `public.logistics_ground_crew_vehicles` | 75 | 75 | 0 | 0 | 0 |
| `public.logistics_ground_crews` | 78 | 78 | 0 | 0 | 0 |
| `public.logistics_meals` | 122 | 122 | 0 | 0 | 4 |
| `public.logistics_other` | 49 | 52 | 0 | 3 | 5 |
| `public.logistics_transport_vehicles` | 244 | 244 | 1 | 1 | 1 |
| `public.logistics_transports` | 183 | 184 | 0 | 1 | 7 |
| `public.manifest_participants` | 15 | 15 | 0 | 0 | 0 |
| `public.manifests` | 3 | 3 | 0 | 0 | 0 |
| `public.participant_email_aliases` | 3 | 3 | 1 | 1 | 2 |
| `public.participant_profiles` | 784 | 785 | 0 | 1 | 13 |
| `public.payment_allocations` | 0 | 0 | 0 | 0 | 0 |
| `public.payments` | 0 | 0 | 0 | 0 | 0 |
| `public.registration_activity` | 342 | 350 | 0 | 8 | 3 |
| `public.registration_intents` | 34 | 36 | 3 | 5 | 31 |
| `public.registration_payments` | 368 | 370 | 0 | 2 | 0 |
| `public.roles` | 8 | 8 | 0 | 0 | 0 |
| `public.roster_check_in_entries` | 1263 | 1263 | 0 | 0 | 0 |
| `public.roster_check_ins` | 50 | 50 | 0 | 0 | 0 |
| `public.schedule_item_costs` | 24 | 24 | 0 | 0 | 0 |
| `public.seasons` | 3 | 3 | 0 | 0 | 0 |
| `public.task_audit_events` | 12 | 26 | 11 | 25 | 1 |
| `public.task_comments` | 2 | 6 | 0 | 4 | 2 |
| `public.task_email_deliveries` | 1 | 11 | 0 | 10 | 1 |
| `public.task_notifications` | 1 | 11 | 0 | 10 | 1 |
| `public.tasks` | 4 | 10 | 2 | 8 | 2 |

## Event 59 spotlight

Relational differences found: 193 rows. This starts at `events.id = 59` and recursively follows foreign keys to all descendant records.

| Table | Local-only | Prod-only | Changed |
|---|---:|---:|---:|
| `public.budget_currencies` | 0 | 0 | 3 |
| `public.budget_line_items` | 0 | 0 | 34 |
| `public.event_accommodation` | 0 | 0 | 3 |
| `public.event_innhopps` | 0 | 0 | 12 |
| `public.event_registrations` | 0 | 0 | 14 |
| `public.event_staff_meetings` | 2 | 0 | 0 |
| `public.logistics_event_vehicles` | 0 | 0 | 1 |
| `public.logistics_meals` | 0 | 0 | 4 |
| `public.logistics_other` | 0 | 3 | 5 |
| `public.logistics_transport_vehicles` | 1 | 1 | 1 |
| `public.logistics_transports` | 0 | 1 | 7 |
| `public.registration_activity` | 0 | 3 | 1 |
| `public.registration_intents` | 2 | 3 | 15 |
| `public.task_audit_events` | 11 | 25 | 1 |
| `public.task_comments` | 0 | 4 | 2 |
| `public.task_email_deliveries` | 0 | 10 | 1 |
| `public.task_notifications` | 0 | 10 | 1 |
| `public.tasks` | 2 | 8 | 2 |

### `public.budget_currencies` — changed — id=648

- `rate_to_base`: 10.580983 → 10.556001

### `public.budget_currencies` — changed — id=647

- `rate_to_base`: 3650.61493 → 3642.118002

### `public.budget_currencies` — changed — id=649

- `rate_to_base`: 1.099852 → 1.103813

### `public.budget_line_items` — changed — id=140

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=898

- `quantity`: 196.0 → 250.0
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=152

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=121

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=894

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=123

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=141

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=902

- `location_label`: "#11 San Augustin Top Landing or Cow field" → "#11 Alto de las Chinas"
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=892

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=151

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=150

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=899

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=136

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=149

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=153

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=119

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=125

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=903

- `location_label`: "#12 La Chaquira" → "#12 Masaya Hostel"
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=900

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=144

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=148

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=896

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=901

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=137

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=132

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=895

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=897

- `quantity`: 134.0 → 115.0
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=133

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=893

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=130

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=905

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=904

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_line_items` — changed — id=127

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.budget_line_items` — changed — id=145

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

### `public.event_accommodation` — changed — id=56

- `check_out_at`: "2026-12-01T09:00:00+00:00" → "2026-12-01T08:00:00+00:00"
- `notes`: "" → "Contact Ana Maria Eslava +57 319 642 3937"

### `public.event_accommodation` — changed — id=55

- `notes`: "Need to change quote for 22 pax and 4 single room upgrade." → "Brayan +57 313 240 5806"

### `public.event_accommodation` — changed — id=54

- `check_out_at`: "2026-11-28T06:45:00+00:00" → "2026-11-28T07:00:00+00:00"
- `notes`: "Need to adjust quote for 22 pax." → "Need to adjust quote for 22 pax. Camillo +57 320 205 9025"

### `public.event_innhopps` — changed — id=3427

- `adjust_altimeter_aad`: "" → "Alti: + 263m / 863ft  .  AAD - 263m / 863ft"
- `hospital`: "" → "San Juan De Dios Hospital Honda (11 min after crossing the river)"
- `jumprun`: "" → "N <-> S"
- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Fernando Olmos", "telephone": "+57 321 926 7064"}]
- `minimum_requirements`: "" → "A"
- `primary_landing_area_description`: "" → "Tall grass , Trees small rocks. Adjacent to the river. Other side of the town."
- `primary_landing_area_name`: "" → "Big field next to the river"
- `primary_landing_area_obstacles`: "" → "Powerline at the N of the field, barbed wire fence, possible tall grass"
- `primary_landing_area_size`: "" → "200 x 120m grass"
- `rescue_boat`: null → true
- `risk_assessment`: "" → "River landing"
- `safety_precautions`: "" → "Good briefing, water procedures refresh, floatation device brief"

### `public.event_innhopps` — changed — id=3426

- `elevation`: 207 → 227
- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Antelmo Palacio", "telephone": "+57 321 201 5408"}, {"name": "David (guide)", "telephone": "+57 321 311 0054"}]

### `public.event_innhopps` — changed — id=3435

- `scheduled_at`: "2026-12-01T10:30:00+00:00" → "2026-12-01T10:00:00+00:00"

### `public.event_innhopps` — changed — id=3434

- `coordinates`: "1°54'10.3\"N 76°16'16.0\"W" → "1°53'46.59\"N 76°16'06.55\"W"
- `distance_by_road`: 31 → 30
- `elevation`: 0 → 1634
- `name`: "La Chaquira" → "Masaya Hostel"
- `scheduled_at`: "2026-11-30T16:45:00+00:00" → "2026-11-30T15:30:00+00:00"

### `public.event_innhopps` — changed — id=3429

- `adjust_altimeter_aad`: "+1550 at takeoff / -1550 at takeoff" → ""
- `coordinates`: "3°15'17.7\"N 75°10'10.1\"W" → "3°13'56.48\"N 75°10'07.79\"W"
- `distance_by_air`: 189 → 192
- `distance_by_road`: 311 → 318
- `elevation`: 434 → 440
- `hospital`: "ESE Hospital del Perpetuo Socorro" → ""
- `jumprun`: "In to wind" → ""
- `land_owners`: [] → [{"name": "Brayan (Estrella Hotel)", "telephone": "+57 313 240 5806"}]
- `landing_airfield_id`: 43 → 34
- `landing_distance_by_air`: 37 → 192
- `landing_distance_by_road`: 47 → 318
- `notes`: "Landing at 1400 feet." → ""
- `primary_landing_area_description`: "Hard surface, small (ish) rocks on landing. Not ideal for sliding" → ""
- `primary_landing_area_name`: "Tatacoa #1" → ""
- `primary_landing_area_obstacles`: "Cactus and small rocks" → ""
- `primary_landing_area_size`: "200*60 meters" → ""
- `reason_for_choice`: "Big(ger) open fields close to the hotel" → ""
- `rescue_boat`: false → null
- `risk_assessment`: "Off landings. Falling. Ankles," → ""
- `safety_precautions`: "Good separation. Flare! 2 jump runs." → ""
- `scheduled_at`: "2026-11-28T15:30:00+00:00" → "2026-11-28T16:00:00+00:00"
- `secondary_landing_area_description`: "Desert, hard and rocky. 300 meters East of main landing" → ""
- `secondary_landing_area_name`: "Tatacoa #2" → ""
- `secondary_landing_area_obstacles`: "Cactus, rocks that covers the end" → ""
- `secondary_landing_area_size`: "150*60" → ""

### `public.event_innhopps` — changed — id=3431

- `land_owners`: [] → [{"name": "Nelson", "telephone": "+57 310 375 7069"}]
- `landing_airfield_id`: null → 44
- `landing_distance_by_air`: null → 24
- `landing_distance_by_road`: null → 33

### `public.event_innhopps` — changed — id=3432

- `landing_airfield_id`: null → 44
- `landing_distance_by_air`: null → 15
- `landing_distance_by_road`: null → 28
- `scheduled_at`: "2026-11-30T08:00:00+00:00" → "2026-11-30T09:00:00+00:00"

### `public.event_innhopps` — changed — id=3424

- `hospital`: "Girardot Hospital (38 mi" → ""
- `jumprun`: "XIELO jumprun" → ""
- `land_owner_permission`: true → null
- `land_owners`: [{"name": "Nicolas Rubio (Xielo)"}] → []
- `landing_airfield_id`: 39 → null
- `landing_distance_by_air`: 0 → null
- `landing_distance_by_road`: 0 → null
- `minimum_requirements`: "A" → ""
- `primary_landing_area_name`: "TBD possible outside normal LZ on the E" → ""
- `rescue_boat`: false → null

### `public.event_innhopps` — changed — id=3428

- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Julian", "telephone": "+57 320 832 7883"}]
- `landing_airfield_id`: null → 34
- `landing_distance_by_air`: null → 43
- `landing_distance_by_road`: null → 65
- `scheduled_at`: "2026-11-28T08:15:00+00:00" → "2026-11-28T08:00:00+00:00"

### `public.event_innhopps` — changed — id=3433

- `landing_airfield_id`: 44 → null
- `landing_distance_by_air`: 22 → null
- `landing_distance_by_road`: 32 → null
- `name`: "San Augustin Top Landing or Cow field" → "Alto de las Chinas"
- `scheduled_at`: "2026-11-30T11:00:00+00:00" → "2026-11-30T11:30:00+00:00"

### `public.event_innhopps` — changed — id=3430

- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Oscar - Hector", "telephone": "+57 313 810 6503"}]

### `public.event_innhopps` — changed — id=3423

- `hospital`: "Girardot Hospital (38 min)" → ""
- `jumprun`: "XIELO jumprun" → ""
- `land_owner_permission`: true → null
- `landing_airfield_id`: 40 → null
- `landing_distance_by_air`: 90 → null
- `landing_distance_by_road`: 137 → null
- `minimum_requirements`: "A" → ""
- `primary_landing_area_description`: "Flat and grassy" → ""
- `primary_landing_area_name`: "XIELO Landing area" → ""
- `primary_landing_area_obstacles`: "Buildings, Windsock in the middle" → ""
- `primary_landing_area_size`: "Huuuuhe" → ""
- `rescue_boat`: true → null
- `risk_assessment`: "It's a DZ jump, with outs. Crowded landing area, new people" → ""
- `safety_precautions`: "Good briefing, don't underestimate it just because its a DZ.\nExit alt under discussion" → ""
- `secondary_landing_area_name`: "Other fields available in the area" → ""

### `public.event_registrations` — changed — id=4070

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4074

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4091

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "attendance_type": "solo", "discount_eligibility": "VEKO", "heard_about_event": "Even", "heard_about_project": "Even", "payment_method": "bank_transfer"} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-15T17:12:31.502874+00:00" → "2026-10-02T03:14:38.487588+00:00"

### `public.event_registrations` — changed — id=4016

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Peter Goodale", "additional_information": "Vegetarian meals, please", "attendance_type": "solo", "discount_eligibility": "Special discounts offered by Tayla", "heard_about_event": "Online search", "heard_about_project": "Onl… (340 chars) → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Peter Goodale"}
- `updated_at`: "2026-11-17T00:36:40.769486+00:00" → "2026-10-15T09:54:25.297737+00:00"

### `public.event_registrations` — changed — id=4072

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4090

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4071

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4067

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4020

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Connor williams"}
- `updated_at`: "2026-11-15T16:56:58.087138+00:00" → "2026-11-14T00:52:10.45379+00:00"

### `public.event_registrations` — changed — id=4021

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "attendance_type": "solo", "heard_about_event": "Even and Tayla", "heard_about_project": "Skydive Voss innhopps", "payment_method": "bank_transfer"} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-15T17:21:54.667867+00:00" → "2026-09-25T01:26:33.961808+00:00"

### `public.event_registrations` — changed — id=4068

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4073

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4069

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

### `public.event_registrations` — changed — id=4014

- `event_details`: {"accommodation": "Single Room (additional cost)", "attendance_type": "solo", "heard_about_event": "Fb or ig", "heard_about_project": "Previous Innhopp on e day in Norway", "payment_method": "bank_transfer"} → {"accommodation": "Single Room (additional cost)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-17T00:38:13.321731+00:00" → "2026-11-14T15:32:10.785564+00:00"

### `public.event_staff_meetings` — local-only — event_id=59, meeting_date="2026-11-27"

```json
{
  "event_id": 59,
  "items": [
    {
      "checked": false,
      "id": "default-1",
      "kind": "agenda",
      "title": "What went well"
    },
    {
      "checked": false,
      "id": "default-2",
      "kind": "agenda",
      "title": "What went wrong"
    },
    {
      "checked": false,
      "id": "default-3",
      "kind": "agenda",
      "title": "What we can improve"
    },
    {
      "checked": false,
      "id": "default-4",
      "kind": "agenda",
      "title": "Innhopps"
    },
    {
      "checked": false,
      "id": "default-6",
      "kind": "agenda",
      "title": "Expenses"
    },
    {
      "checked": false,
      "id": "default-7",
      "kind": "agenda",
      "title": "Tommorrow's Weather"
    },
    {
      "checked": false,
      "id": "default-8",
      "kind": "agenda",
      "title": "Ground Crew status"
    },
    {
      "checked": false,
      "id": "default-9",
      "kind": "agenda",
      "title": "Safety incidents"
    },
    {
      "checked": false,
      "id": "default-10",
      "kind": "agenda",
      "title": "Transport and accommodation issues"
    },
    {
      "checked": false,
      "id": "default-11",
      "kind": "agenda",
      "title": "Schedule changes"
    },
    {
      "checked": false,
      "id": "default-12",
      "kind": "agenda",
      "title": "Communications requiring follow-up"
    },
    {
      "checked": false,
      "id": "default-tomorrow-1",
      "kind": "tomorrow",
      "title": "Share Pilot brief with pilots"
    },
    {
      "checked": false,
      "id": "default-tomorrow-2",
      "kind": "tomorrow",
      "title": "Charge radios and communication equipment"
    },
    {
      "checked": false,
      "id": "default-tomorrow-3",
      "kind": "tomorrow",
      "title": "Confirm accommodation and meals"
    },
    {
      "checked": false,
      "id": "default-tomorrow-4",
      "kind": "tomorrow",
      "title": "Confirm staff assignments"
    },
    {
      "checked": false,
      "id": "default-tomorrow-5",
      "kind": "tomorrow",
      "title": "Confirm ground transport"
    },
    {
      "checked": true,
      "id": "default-tomorrow-6",
      "kind": "tomorrow",
      "title": "Bring Water"
    },
    {
      "checked": false,
      "id": "innhopp-3426",
      "kind": "agenda",
      "title": "Petroglifos de Honda"
    },
    {
      "checked": false,
      "id": "innhopp-3427",
      "kind": "agenda",
      "title": "Cielo Abierto"
    }
  ],
  "meeting_date": "2026-11-27",
  "updated_at": "2026-11-19T16:56:56.129389+00:00"
}
```

### `public.event_staff_meetings` — local-only — event_id=59, meeting_date="2026-11-26"

```json
{
  "event_id": 59,
  "items": [
    {
      "checked": false,
      "id": "default-1",
      "kind": "agenda",
      "title": "What went well"
    },
    {
      "checked": false,
      "id": "default-2",
      "kind": "agenda",
      "title": "What went wrong"
    },
    {
      "checked": false,
      "id": "default-3",
      "kind": "agenda",
      "title": "What we can improve"
    },
    {
      "checked": false,
      "id": "default-4",
      "kind": "agenda",
      "title": "Innhopps"
    },
    {
      "checked": false,
      "id": "default-6",
      "kind": "agenda",
      "title": "Expenses"
    },
    {
      "checked": false,
      "id": "default-7",
      "kind": "agenda",
      "title": "Tommorrow's Weather"
    },
    {
      "checked": false,
      "id": "default-8",
      "kind": "agenda",
      "title": "Ground Crew status"
    },
    {
      "checked": false,
      "id": "default-9",
      "kind": "agenda",
      "title": "Safety incidents"
    },
    {
      "checked": false,
      "id": "default-10",
      "kind": "agenda",
      "title": "Transport and accommodation issues"
    },
    {
      "checked": false,
      "id": "default-11",
      "kind": "agenda",
      "title": "Schedule changes"
    },
    {
      "checked": false,
      "id": "default-12",
      "kind": "agenda",
      "title": "Communications requiring follow-up"
    },
    {
      "checked": false,
      "id": "default-tomorrow-0",
      "kind": "tomorrow",
      "title": "Review schedule for tomorrow"
    },
    {
      "checked": false,
      "id": "default-tomorrow-1",
      "kind": "tomorrow",
      "title": "Share Pilot brief with pilots"
    },
    {
      "checked": false,
      "id": "default-tomorrow-2",
      "kind": "tomorrow",
      "title": "Charge radios and other equipment"
    },
    {
      "checked": false,
      "id": "default-tomorrow-3",
      "kind": "tomorrow",
      "title": "Confirm accommodation and meals"
    },
    {
      "checked": false,
      "id": "default-tomorrow-7",
      "kind": "tomorrow",
      "title": "Accommodation for Staff leaving early (ground crew, pilots, etc)"
    },
    {
      "checked": false,
      "id": "default-tomorrow-4",
      "kind": "tomorrow",
      "title": "Confirm staff assignments"
    },
    {
      "checked": false,
      "id": "default-tomorrow-8",
      "kind": "tomorrow",
      "title": "Assign staff to lead participant meeting and group presentations"
    },
    {
      "checked": false,
      "id": "default-tomorrow-5",
      "kind": "tomorrow",
      "title": "Confirm ground transport"
    },
    {
      "checked": false,
      "id": "default-tomorrow-6",
      "kind": "tomorrow",
      "title": "Bring Water"
    },
    {
      "checked": false,
      "id": "innhopp-3423",
      "kind": "agenda",
      "title": "XIELO"
    },
    {
      "checked": false,
      "id": "innhopp-3424",
      "kind": "agenda",
      "title": "XIELO Target Competition"
    },
    {
      "checked": false,
      "id": "innhopp-3425",
      "kind": "agenda",
      "title": "Nilo Waterfall"
    }
  ],
  "meeting_date": "2026-11-26",
  "updated_at": "2026-11-19T17:17:01.573248+00:00"
}
```

### `public.logistics_event_vehicles` — changed — id=111

- `created_at`: "2026-11-21T02:15:32.004857+00:00" → "2026-11-21T15:49:22.506845+00:00"
- `driver`: "" → "Jhon"
- `name`: "Horses and ATVs" → "Salento Minibus"
- `notes`: "" → "+57 313 285 4544"

### `public.logistics_meals` — changed — id=127

- `notes`: "" → "Band : @nathaliacortik"
- `scheduled_at`: "2026-11-29T19:00:00+00:00" → "2026-11-29T20:00:00+00:00"

### `public.logistics_meals` — changed — id=122

- `scheduled_at`: "2026-11-25T19:00:00+00:00" → "2026-11-25T20:00:00+00:00"

### `public.logistics_meals` — changed — id=131

- `notes`: "Lady cook that is next to reception inside the coffee farm." → "Lady cook that is next to reception inside the coffee farm. Contact Catalina Cardona +57 313 425 3669 for now"

### `public.logistics_meals` — changed — id=126

- `notes`: "" → "Star guy - @orioncampamento"

### `public.logistics_other` — prod-only — id=128

```json
{
  "coordinates": null,
  "created_at": "2026-11-21T02:07:53.672198+00:00",
  "description": null,
  "event_id": 59,
  "id": 128,
  "name": "Band and bonfire night",
  "notes": null,
  "scheduled_at": "2026-11-30T21:00:00+00:00",
  "season_id": 1
}
```

### `public.logistics_other` — prod-only — id=127

```json
{
  "coordinates": "1°52'46.5\"N 76°16'10.6\"W",
  "created_at": "2026-11-21T02:03:54.615862+00:00",
  "description": null,
  "event_id": 59,
  "id": 127,
  "name": "San Augustin Town and Shopping",
  "notes": null,
  "scheduled_at": "2026-11-30T14:00:00+00:00",
  "season_id": 1
}
```

### `public.logistics_other` — prod-only — id=129

```json
{
  "coordinates": "3°13'56.1\"N 75°09'19.1\"W",
  "created_at": "2026-11-21T02:13:02.761357+00:00",
  "description": null,
  "event_id": 59,
  "id": 129,
  "name": "Atalaya Mirador Turístico Tatacoa",
  "notes": null,
  "scheduled_at": "2026-11-29T08:00:00+00:00",
  "season_id": 1
}
```

### `public.logistics_other` — changed — id=122

- `notes`: "Will be used after the boat tour so they can board the bus to Lunch." → "Will be used after the boat tour so they can board the bus to Lunch. Contact is Ivan Romero (Turivan) +57 3103723856"

### `public.logistics_other` — changed — id=43

- `notes`: null → "Contact Catalina Cardona +57 313 425 3669"

### `public.logistics_other` — changed — id=126

- `coordinates`: "1°53'07.9\"N 76°17'38.9\"W" → null
- `created_at`: "2026-11-21T01:00:41.834697+00:00" → "2026-11-20T16:42:01.399532+00:00"
- `name`: "Parque Arqueológico de San Agustín" → "Museo Arqueológico de San Agustín"
- `notes`: null → "Marta Gil +57 310 2164 462"

### `public.logistics_other` — changed — id=125

- `notes`: null → "David contact +57 321 311 0054"

### `public.logistics_other` — changed — id=124

- `notes`: "Tayla will arrive earlier for setup." → "Tayla will arrive earlier for setup. Contact is Diana +57 310 4785 335"

### `public.logistics_transport_vehicles` — local-only — id=1507

```json
{
  "created_at": "2026-11-11T20:24:59.143358+00:00",
  "driver": "Private chofer",
  "event_vehicle_id": 110,
  "id": 1507,
  "name": "COL-2 Bus",
  "notes": "Bus rented for the whole event",
  "passenger_capacity": 26,
  "transport_id": 167
}
```

### `public.logistics_transport_vehicles` — prod-only — id=1513

```json
{
  "created_at": "2026-11-21T02:17:40.454656+00:00",
  "driver": "",
  "event_vehicle_id": 111,
  "id": 1513,
  "name": "Horses and ATVs",
  "notes": "",
  "passenger_capacity": 0,
  "transport_id": 456
}
```

### `public.logistics_transport_vehicles` — changed — id=1510

- `created_at`: "2026-11-15T00:12:17.476764+00:00" → "2026-11-21T15:49:28.443133+00:00"
- `driver`: "Private chofer" → "Jhon"
- `event_vehicle_id`: 110 → 111
- `name`: "COL-2 Bus" → "Salento Minibus"
- `notes`: "Bus rented for the whole event" → "+57 313 285 4544"
- `passenger_capacity`: 26 → 0
- `transport_id`: 167 → 168

### `public.logistics_transports` — prod-only — id=456

```json
{
  "created_at": "2026-11-21T02:17:05.273338+00:00",
  "destination": "Atalaya Mirador Turístico Tatacoa",
  "destination_id": 129,
  "destination_type": "Other",
  "duration_minutes": 13,
  "event_id": 59,
  "id": 456,
  "notes": "",
  "passenger_count": 20,
  "pickup_location": "Hotel Estrella La Casa del Angel",
  "pickup_location_id": 55,
  "pickup_location_type": "Accommodation",
  "scheduled_at": "2026-11-29T07:30:00+00:00",
  "season_id": 1
}
```

### `public.logistics_transports` — changed — id=173

- `duration_minutes`: 34 → 44
- `pickup_location`: "San Augustin Town and Shopping" → "#11 Alto de las Chinas"
- `pickup_location_id`: 127 → 2090
- `pickup_location_type`: "Other" → "Innhopp"
- `scheduled_at`: "2026-11-30T15:30:00+00:00" → "2026-11-30T14:00:00+00:00"

### `public.logistics_transports` — changed — id=168

- `pickup_location`: "Coffee Tasting Load 1" → "El Ocaso Farm Coffee Tasting"

### `public.logistics_transports` — changed — id=170

- `duration_minutes`: 43 → 44
- `pickup_location`: "Museo Arqueológico de San Agustín" → "#8 San Augustin"
- `pickup_location_id`: 126 → 3430
- `pickup_location_type`: "Other" → "Innhopp"

### `public.logistics_transports` — changed — id=174

- `scheduled_at`: "2026-12-01T09:30:00+00:00" → "2026-12-01T08:30:00+00:00"

### `public.logistics_transports` — changed — id=167

- `scheduled_at`: "2026-11-28T07:15:00+00:00" → "2026-11-28T07:30:00+00:00"

### `public.logistics_transports` — changed — id=169

- `duration_minutes`: 72 → 82
- `notes`: "" → "Carlos +57 321 296 0647"
- `pickup_location`: "Atalaya Mirador Turístico Tatacoa" → "Hotel Estrella La Casa del Angel"
- `pickup_location_id`: 129 → 55
- `pickup_location_type`: "Other" → "Accommodation"

### `public.logistics_transports` — changed — id=171

- `scheduled_at`: "2026-11-30T07:00:00+00:00" → "2026-11-30T08:00:00+00:00"

### `public.registration_activity` — prod-only — id=6048

```json
{
  "created_at": "2026-11-15T17:21:54.667867+00:00",
  "created_by_account_id": 725,
  "id": 6048,
  "payload": {
    "event_id": 59
  },
  "registration_id": 4021,
  "summary": "Event-specific registration details completed",
  "type": "note"
}
```

### `public.registration_activity` — prod-only — id=6049

```json
{
  "created_at": "2026-11-17T00:36:40.769486+00:00",
  "created_by_account_id": 722,
  "id": 6049,
  "payload": {
    "event_id": 59
  },
  "registration_id": 4016,
  "summary": "Event-specific registration details completed",
  "type": "note"
}
```

### `public.registration_activity` — prod-only — id=6050

```json
{
  "created_at": "2026-11-17T00:38:13.321731+00:00",
  "created_by_account_id": 733,
  "id": 6050,
  "payload": {
    "event_id": 59
  },
  "registration_id": 4014,
  "summary": "Event-specific registration details completed",
  "type": "note"
}
```

### `public.registration_activity` — changed — id=6045

- `created_at`: "2026-11-15T17:12:31.502874+00:00" → "2026-11-14T15:36:44.08269+00:00"
- `created_by_account_id`: 625 → 585
- `payload`: {"event_id": 59} → {"event_id": 79}
- `registration_id`: 4091 → 4075

### `public.registration_intents` — local-only — id=32

```json
{
  "account_id": 722,
  "completed_at": null,
  "created_at": "2026-11-14T14:27:41.07637+00:00",
  "event_id": 59,
  "id": 32,
  "status": "pending"
}
```

### `public.registration_intents` — local-only — id=244

```json
{
  "account_id": 733,
  "completed_at": null,
  "created_at": "2026-11-14T16:14:12.64179+00:00",
  "event_id": 59,
  "id": 244,
  "status": "pending"
}
```

### `public.registration_intents` — prod-only — id=227

```json
{
  "account_id": 747,
  "completed_at": null,
  "created_at": "2026-11-18T01:21:47.013447+00:00",
  "event_id": 59,
  "id": 227,
  "status": "pending"
}
```

### `public.registration_intents` — prod-only — id=221

```json
{
  "account_id": 733,
  "completed_at": "2026-11-17T00:38:13.321731+00:00",
  "created_at": "2026-11-17T00:37:21.684385+00:00",
  "event_id": 59,
  "id": 221,
  "status": "completed"
}
```

### `public.registration_intents` — prod-only — id=67

```json
{
  "account_id": 720,
  "completed_at": null,
  "created_at": "2026-11-15T17:09:29.187537+00:00",
  "event_id": 59,
  "id": 67,
  "status": "pending"
}
```

### `public.registration_intents` — changed — id=21

- `account_id`: 595 → 680
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

### `public.registration_intents` — changed — id=29

- `account_id`: 680 → 628
- `completed_at`: null → "2026-11-14T17:04:19.411122+00:00"
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 79
- `status`: "pending" → "completed"

### `public.registration_intents` — changed — id=3

- `account_id`: 638 → 625
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 60

### `public.registration_intents` — changed — id=1

- `account_id`: 625 → 330
- `completed_at`: "2026-11-15T17:12:31.502874+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 60
- `status`: "completed" → "pending"

### `public.registration_intents` — changed — id=15

- `account_id`: 590 → 264
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

### `public.registration_intents` — changed — id=7

- `account_id`: 722 → 590
- `completed_at`: "2026-11-17T00:36:40.769486+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 79
- `status`: "completed" → "pending"

### `public.registration_intents` — changed — id=27

- `account_id`: 597 → 728
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

### `public.registration_intents` — changed — id=28

- `account_id`: 599 → 638
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

### `public.registration_intents` — changed — id=31

- `account_id`: 723 → 659
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 63

### `public.registration_intents` — changed — id=26

- `account_id`: 604 → 720
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

### `public.registration_intents` — changed — id=18

- `account_id`: 725 → 604
- `completed_at`: "2026-11-15T17:18:55.672339+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 60 → 59
- `status`: "completed" → "pending"

### `public.registration_intents` — changed — id=2

- `account_id`: 728 → 583
- `completed_at`: null → "2026-11-14T15:05:46.76364+00:00"
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 79
- `status`: "pending" → "completed"

### `public.registration_intents` — changed — id=25

- `account_id`: 725 → 723
- `completed_at`: "2026-11-15T17:21:54.667867+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `status`: "completed" → "pending"

### `public.registration_intents` — changed — id=23

- `account_id`: 264 → 625
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

### `public.registration_intents` — changed — id=17

- `account_id`: 593 → 725
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

### `public.task_audit_events` — local-only — id=1017

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "testing"
  },
  "created_at": "2026-11-18T14:14:27.471171+00:00",
  "event_id": 59,
  "id": 1017,
  "task_id": 10
}
```

### `public.task_audit_events` — local-only — id=1008

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 1
  },
  "created_at": "2026-11-14T19:02:35.197894+00:00",
  "event_id": 59,
  "id": 1008,
  "task_id": 7
}
```

### `public.task_audit_events` — local-only — id=1012

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "de"
  },
  "created_at": "2026-11-14T19:16:56.832864+00:00",
  "event_id": 59,
  "id": 1012,
  "task_id": 7
}
```

### `public.task_audit_events` — local-only — id=1018

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Make a daily task list for the staff meeiting"
  },
  "created_at": "2026-11-18T14:18:05.549596+00:00",
  "event_id": 59,
  "id": 1018,
  "task_id": 12
}
```

### `public.task_audit_events` — local-only — id=1010

```json
{
  "action": "completed",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:16:28.208391+00:00",
  "event_id": 59,
  "id": 1010,
  "task_id": 7
}
```

### `public.task_audit_events` — local-only — id=1013

```json
{
  "action": "restored",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:17:17.508651+00:00",
  "event_id": 59,
  "id": 1013,
  "task_id": 7
}
```

### `public.task_audit_events` — local-only — id=1014

```json
{
  "action": "completed",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:26:38.207142+00:00",
  "event_id": 59,
  "id": 1014,
  "task_id": 7
}
```

### `public.task_audit_events` — local-only — id=1009

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 2
  },
  "created_at": "2026-11-14T19:03:00.230024+00:00",
  "event_id": 59,
  "id": 1009,
  "task_id": 7
}
```

### `public.task_audit_events` — local-only — id=1016

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Packing tent"
  },
  "created_at": "2026-11-18T14:14:01.271333+00:00",
  "event_id": 59,
  "id": 1016,
  "task_id": 11
}
```

### `public.task_audit_events` — local-only — id=1011

```json
{
  "action": "reopened",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:16:38.859325+00:00",
  "event_id": 59,
  "id": 1011,
  "task_id": 7
}
```

### `public.task_audit_events` — local-only — id=1015

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "ds"
  },
  "created_at": "2026-11-14T19:27:26.924195+00:00",
  "event_id": 59,
  "id": 1015,
  "task_id": 10
}
```

### `public.task_audit_events` — prod-only — id=16

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "test"
  },
  "created_at": "2026-11-21T02:48:24.119124+00:00",
  "event_id": 59,
  "id": 16,
  "task_id": 5
}
```

### `public.task_audit_events` — prod-only — id=21

```json
{
  "action": "commented",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {
    "comment_id": 5
  },
  "created_at": "2026-11-21T13:12:11.866661+00:00",
  "event_id": 59,
  "id": 21,
  "task_id": 7
}
```

### `public.task_audit_events` — prod-only — id=11

```json
{
  "action": "completed",
  "actor_account_id": 13,
  "actor_display_name_snapshot": "Tayla Lima",
  "changes": {},
  "created_at": "2026-11-14T20:59:24.552962+00:00",
  "event_id": 59,
  "id": 11,
  "task_id": 4
}
```

### `public.task_audit_events` — prod-only — id=24

```json
{
  "action": "completed",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {},
  "created_at": "2026-11-21T13:12:43.693681+00:00",
  "event_id": 59,
  "id": 24,
  "task_id": 8
}
```

### `public.task_audit_events` — prod-only — id=3

```json
{
  "action": "created",
  "actor_account_id": 17,
  "actor_display_name_snapshot": "Hans Jørgen Monsen",
  "changes": {
    "title": "Test task"
  },
  "created_at": "2026-11-14T19:46:53.098139+00:00",
  "event_id": 59,
  "id": 3,
  "task_id": 2
}
```

### `public.task_audit_events` — prod-only — id=5

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "Testing"
  },
  "created_at": "2026-11-14T19:49:01.175679+00:00",
  "event_id": 59,
  "id": 5,
  "task_id": 2
}
```

### `public.task_audit_events` — prod-only — id=15

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "tets"
  },
  "created_at": "2026-11-21T02:47:04.037193+00:00",
  "event_id": 59,
  "id": 15,
  "task_id": 4
}
```

### `public.task_audit_events` — prod-only — id=12

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Check out the tasks"
  },
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "event_id": 59,
  "id": 12,
  "task_id": 5
}
```

### `public.task_audit_events` — prod-only — id=26

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Contact for El Ocaso 'Doña Gladys' Lunch"
  },
  "created_at": "2026-11-21T15:38:25.329339+00:00",
  "event_id": 59,
  "id": 26,
  "task_id": 10
}
```

### `public.task_audit_events` — prod-only — id=18

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Packing mat and tent"
  },
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "event_id": 59,
  "id": 18,
  "task_id": 6
}
```

### `public.task_audit_events` — prod-only — id=7

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "New task system online"
  },
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "event_id": 59,
  "id": 7,
  "task_id": 4
}
```

### `public.task_audit_events` — prod-only — id=6

```json
{
  "action": "completed",
  "actor_account_id": 17,
  "actor_display_name_snapshot": "Hans Jørgen Monsen",
  "changes": {},
  "created_at": "2026-11-14T20:47:06.507577+00:00",
  "event_id": 59,
  "id": 6,
  "task_id": 3
}
```

### `public.task_audit_events` — prod-only — id=8

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 2
  },
  "created_at": "2026-11-14T20:55:37.770788+00:00",
  "event_id": 59,
  "id": 8,
  "task_id": 4
}
```

### `public.task_audit_events` — prod-only — id=2

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 1
  },
  "created_at": "2026-11-14T19:32:05.970538+00:00",
  "event_id": 59,
  "id": 2,
  "task_id": 1
}
```

### `public.task_audit_events` — prod-only — id=19

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)"
  },
  "created_at": "2026-11-21T02:50:35.174241+00:00",
  "event_id": 59,
  "id": 19,
  "task_id": 7
}
```

### `public.task_audit_events` — prod-only — id=9

```json
{
  "action": "commented",
  "actor_account_id": 13,
  "actor_display_name_snapshot": "Tayla Lima",
  "changes": {
    "comment_id": 3
  },
  "created_at": "2026-11-14T20:59:06.353393+00:00",
  "event_id": 59,
  "id": 9,
  "task_id": 4
}
```

### `public.task_audit_events` — prod-only — id=13

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 4
  },
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "event_id": 59,
  "id": 13,
  "task_id": 5
}
```

### `public.task_audit_events` — prod-only — id=4

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Check out the new task system"
  },
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "event_id": 59,
  "id": 4,
  "task_id": 3
}
```

### `public.task_audit_events` — prod-only — id=10

```json
{
  "action": "edited",
  "actor_account_id": 13,
  "actor_display_name_snapshot": "Tayla Lima",
  "changes": {
    "due_on": {
      "new": "2026-11-14",
      "old": ""
    }
  },
  "created_at": "2026-11-14T20:59:21.536099+00:00",
  "event_id": 59,
  "id": 10,
  "task_id": 4
}
```

### `public.task_audit_events` — prod-only — id=22

```json
{
  "action": "completed",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {},
  "created_at": "2026-11-21T13:12:14.596436+00:00",
  "event_id": 59,
  "id": 22,
  "task_id": 7
}
```

### `public.task_audit_events` — prod-only — id=25

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Get the contact for Antelmo"
  },
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "event_id": 59,
  "id": 25,
  "task_id": 9
}
```

### `public.task_audit_events` — prod-only — id=23

```json
{
  "action": "commented",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {
    "comment_id": 6
  },
  "created_at": "2026-11-21T13:12:41.242978+00:00",
  "event_id": 59,
  "id": 23,
  "task_id": 8
}
```

### `public.task_audit_events` — prod-only — id=14

```json
{
  "action": "completed",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-21T02:46:36.900974+00:00",
  "event_id": 59,
  "id": 14,
  "task_id": 1
}
```

### `public.task_audit_events` — prod-only — id=20

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Talk to David from Maco for the contact for the landing area"
  },
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "event_id": 59,
  "id": 20,
  "task_id": 8
}
```

### `public.task_audit_events` — prod-only — id=17

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "test"
  },
  "created_at": "2026-11-21T02:48:37.199173+00:00",
  "event_id": 59,
  "id": 17,
  "task_id": 3
}
```

### `public.task_audit_events` — changed — id=1

- `changes`: {"title": "Get permission for trike landing area in Salento"} → {"title": "Get permission for the trike takeoff"}
- `created_at`: "2026-11-14T19:31:41.832794+00:00" → "2026-11-14T18:50:19.020862+00:00"
- `task_id`: 1 → 7

### `public.task_comments` — prod-only — id=3

```json
{
  "author_account_id": 13,
  "author_display_name_snapshot": "Tayla Lima",
  "body": "hello there",
  "created_at": "2026-11-14T20:59:06.353393+00:00",
  "id": 3,
  "task_id": 4
}
```

### `public.task_comments` — prod-only — id=5

```json
{
  "author_account_id": 47,
  "author_display_name_snapshot": "Stefano Egusquiza",
  "body": "30 min with both he said, also we can be met by them at our hotel we just need to give exact number of what we need and time.",
  "created_at": "2026-11-21T13:12:11.866661+00:00",
  "id": 5,
  "task_id": 7
}
```

### `public.task_comments` — prod-only — id=4

```json
{
  "author_account_id": 1,
  "author_display_name_snapshot": "Antonis Loizou",
  "body": "Come on bro get on with it",
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "id": 4,
  "task_id": 5
}
```

### `public.task_comments` — prod-only — id=6

```json
{
  "author_account_id": 47,
  "author_display_name_snapshot": "Stefano Egusquiza",
  "body": "he has been approached, waiting for his answer via whatsapp",
  "created_at": "2026-11-21T13:12:41.242978+00:00",
  "id": 6,
  "task_id": 8
}
```

### `public.task_comments` — changed — id=2

- `body`: "And we can add comments and stuff" → "no"
- `created_at`: "2026-11-14T20:55:37.770788+00:00" → "2026-11-14T19:03:00.230024+00:00"
- `task_id`: 4 → 7

### `public.task_comments` — changed — id=1

- `body`: "Permission is ok, we meet tomorrow at Salento at 14:00" → "is this done yet ?"
- `created_at`: "2026-11-14T19:32:05.970538+00:00" → "2026-11-14T19:02:35.197894+00:00"
- `task_id`: 1 → 7

### `public.task_email_deliveries` — prod-only — id=2

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Check out the new task system\n\nOpen task: https://central.innhopp.com/tasks?taskId=3",
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "id": 2,
  "last_error": null,
  "provider_message_id": "1794685730735149171.735149171@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "monsen.hj@gmail.com",
  "sent_at": "2026-11-14T19:48:52.504808+00:00",
  "status": "sent",
  "subject": "Task assigned: Check out the new task system",
  "task_notification_id": 2
}
```

### `public.task_email_deliveries` — prod-only — id=9

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Talk to David from Maco for the contact for the landing area\n\nOpen task: https://central.innhopp.com/tasks?taskId=8",
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "id": 9,
  "last_error": null,
  "provider_message_id": "1795229512580966667.580966667@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T02:51:54.27693+00:00",
  "status": "sent",
  "subject": "Task assigned: Talk to David from Maco for the contact for the landing area",
  "task_notification_id": 9
}
```

### `public.task_email_deliveries` — prod-only — id=11

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Contact for El Ocaso 'Doña Gladys' Lunch\n\nOpen task: https://central.innhopp.com/tasks?taskId=10",
  "created_at": "2026-11-21T15:38:25.329339+00:00",
  "id": 11,
  "last_error": null,
  "provider_message_id": "1795275505576061566.576061566@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T15:38:27.528116+00:00",
  "status": "sent",
  "subject": "Task assigned: Contact for El Ocaso 'Doña Gladys' Lunch",
  "task_notification_id": 11
}
```

### `public.task_email_deliveries` — prod-only — id=4

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou added a comment to your task.\n\nEvent: Ancient Lines\nTask: New task system online\n\nComment:\nAnd we can add comments and stuff\n\nOpen task: https://central.innhopp.com/tasks?taskId=4",
  "created_at": "2026-11-14T20:55:37.770788+00:00",
  "id": 4,
  "last_error": null,
  "provider_message_id": "1794689738006415407.6415407@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "taylanika@gmail.com",
  "sent_at": "2026-11-14T20:55:39.635479+00:00",
  "status": "sent",
  "subject": "New task comment: New task system online",
  "task_notification_id": 4
}
```

### `public.task_email_deliveries` — prod-only — id=10

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Get the contact for Antelmo\n\nOpen task: https://central.innhopp.com/tasks?taskId=9",
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "id": 10,
  "last_error": null,
  "provider_message_id": "1795275061948087160.948087160@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "taylanika@gmail.com",
  "sent_at": "2026-11-21T15:31:03.987614+00:00",
  "status": "sent",
  "subject": "Task assigned: Get the contact for Antelmo",
  "task_notification_id": 10
}
```

### `public.task_email_deliveries` — prod-only — id=3

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: New task system online\n\nOpen task: https://central.innhopp.com/tasks?taskId=4",
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "id": 3,
  "last_error": null,
  "provider_message_id": "1794689675320993244.320993244@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "taylanika@gmail.com",
  "sent_at": "2026-11-14T20:54:37.270015+00:00",
  "status": "sent",
  "subject": "Task assigned: New task system online",
  "task_notification_id": 3
}
```

### `public.task_email_deliveries` — prod-only — id=5

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Check out the tasks\n\nOpen task: https://central.innhopp.com/tasks?taskId=5",
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "id": 5,
  "last_error": null,
  "provider_message_id": "1794691352022894940.22894940@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-14T21:22:34.187287+00:00",
  "status": "sent",
  "subject": "Task assigned: Check out the tasks",
  "task_notification_id": 5
}
```

### `public.task_email_deliveries` — prod-only — id=7

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Packing mat and tent\n\nOpen task: https://central.innhopp.com/tasks?taskId=6",
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "id": 7,
  "last_error": null,
  "provider_message_id": "1795229360206469501.206469501@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T02:49:22.03533+00:00",
  "status": "sent",
  "subject": "Task assigned: Packing mat and tent",
  "task_notification_id": 7
}
```

### `public.task_email_deliveries` — prod-only — id=8

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)\n\nOpen task: https://central.innhopp.com/tasks?taskId=7",
  "created_at": "2026-11-21T02:50:35.174241+00:00",
  "id": 8,
  "last_error": null,
  "provider_message_id": "1795229435397022008.397022008@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T02:50:37.148059+00:00",
  "status": "sent",
  "subject": "Task assigned: Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)",
  "task_notification_id": 8
}
```

### `public.task_email_deliveries` — prod-only — id=6

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou added a comment to your task.\n\nEvent: Ancient Lines\nTask: Check out the tasks\n\nComment:\nCome on bro get on with it\n\nOpen task: https://central.innhopp.com/tasks?taskId=5",
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "id": 6,
  "last_error": null,
  "provider_message_id": "1794691370028896654.28896654@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-14T21:22:51.466183+00:00",
  "status": "sent",
  "subject": "New task comment: Check out the tasks",
  "task_notification_id": 6
}
```

### `public.task_email_deliveries` — changed — id=1

- `attempt_count`: 1 → 0
- `body`: "Hans Jørgen Monsen assigned this task to you.\n\nEvent: Ancient Lines\nTask: Test task\n\nOpen task: https://central.innhopp.com/tasks?taskId=2" → "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Packing tent\n\nOpen task: http://localhost:5173/tasks?taskId=11"
- `created_at`: "2026-11-14T19:46:53.098139+00:00" → "2026-11-18T14:14:01.271333+00:00"
- `provider_message_id`: "1794685613346250811.346250811@smtp.mail.eu-west-1.awsapps.com" → null
- `recipient_email`: "antonis.loizou@gmail.com" → "sdfano220@gmail.com"
- `sent_at`: "2026-11-14T19:46:55.599486+00:00" → null
- `status`: "sent" → "queued"
- `subject`: "Task assigned: Test task" → "Task assigned: Packing tent"

### `public.task_notifications` — prod-only — id=2

```json
{
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "id": 2,
  "kind": "assigned",
  "read_at": "2026-11-14T20:46:55.720506+00:00",
  "recipient_account_id": 17,
  "source_audit_event_id": 4,
  "task_id": 3
}
```

### `public.task_notifications` — prod-only — id=9

```json
{
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "id": 9,
  "kind": "assigned",
  "read_at": "2026-11-21T13:12:23.212168+00:00",
  "recipient_account_id": 47,
  "source_audit_event_id": 20,
  "task_id": 8
}
```

### `public.task_notifications` — prod-only — id=11

```json
{
  "created_at": "2026-11-21T15:38:25.329339+00:00",
  "id": 11,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 26,
  "task_id": 10
}
```

### `public.task_notifications` — prod-only — id=4

```json
{
  "created_at": "2026-11-14T20:55:37.770788+00:00",
  "id": 4,
  "kind": "commented",
  "read_at": "2026-11-14T20:58:42.945993+00:00",
  "recipient_account_id": 13,
  "source_audit_event_id": 8,
  "task_id": 4
}
```

### `public.task_notifications` — prod-only — id=10

```json
{
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "id": 10,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 13,
  "source_audit_event_id": 25,
  "task_id": 9
}
```

### `public.task_notifications` — prod-only — id=3

```json
{
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "id": 3,
  "kind": "assigned",
  "read_at": "2026-11-14T20:58:42.945993+00:00",
  "recipient_account_id": 13,
  "source_audit_event_id": 7,
  "task_id": 4
}
```

### `public.task_notifications` — prod-only — id=5

```json
{
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "id": 5,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 12,
  "task_id": 5
}
```

### `public.task_notifications` — prod-only — id=7

```json
{
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "id": 7,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 18,
  "task_id": 6
}
```

### `public.task_notifications` — prod-only — id=8

```json
{
  "created_at": "2026-11-21T02:50:35.174241+00:00",
  "id": 8,
  "kind": "assigned",
  "read_at": "2026-11-21T13:10:54.475703+00:00",
  "recipient_account_id": 47,
  "source_audit_event_id": 19,
  "task_id": 7
}
```

### `public.task_notifications` — prod-only — id=6

```json
{
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "id": 6,
  "kind": "commented",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 13,
  "task_id": 5
}
```

### `public.task_notifications` — changed — id=1

- `created_at`: "2026-11-14T19:46:53.098139+00:00" → "2026-11-18T14:14:01.271333+00:00"
- `read_at`: "2026-11-14T19:47:02.311006+00:00" → null
- `recipient_account_id`: 1 → 47
- `source_audit_event_id`: 3 → 1016
- `task_id`: 2 → 11

### `public.tasks` — local-only — id=11

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-18T14:14:01.271333+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Would be nice to have shade and a space to psack off the sand \n\nmin 10 x 5 m",
  "due_on": null,
  "event_id": 59,
  "id": 11,
  "title": "Packing tent",
  "updated_at": "2026-11-18T14:14:01.271333+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — local-only — id=12

```json
{
  "assignee_account_id": 1,
  "assignee_display_name_snapshot": "Antonis Loizou",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-18T14:18:05.549596+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "An agenda for the staff meeting and checklist for the next day",
  "due_on": null,
  "event_id": 59,
  "id": 12,
  "title": "Make a daily task list for the staff meeiting",
  "updated_at": "2026-11-18T14:18:05.549596+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — prod-only — id=2

```json
{
  "assignee_account_id": 1,
  "assignee_display_name_snapshot": "Antonis Loizou",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-14T19:46:53.098139+00:00",
  "created_by_account_id": 17,
  "created_by_display_name_snapshot": "Hans Jørgen Monsen",
  "deleted_at": "2026-11-14T19:49:01.175679+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "Testing",
  "description": "wsd",
  "due_on": null,
  "event_id": 59,
  "id": 2,
  "title": "Test task",
  "updated_at": "2026-11-14T19:49:01.175679+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — prod-only — id=9

```json
{
  "assignee_account_id": 13,
  "assignee_display_name_snapshot": "Tayla Lima",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Need to remember to ask",
  "due_on": null,
  "event_id": 59,
  "id": 9,
  "title": "Get the contact for Antelmo",
  "updated_at": "2026-11-21T15:31:01.653747+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — prod-only — id=4

```json
{
  "assignee_account_id": 13,
  "assignee_display_name_snapshot": "Tayla Lima",
  "completed_at": "2026-11-14T20:59:24.552962+00:00",
  "completed_by_account_id": 13,
  "completed_by_display_name_snapshot": "Tayla Lima",
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": "2026-11-21T02:47:04.037193+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "tets",
  "description": "Check it out",
  "due_on": "2026-11-14",
  "event_id": 59,
  "id": 4,
  "title": "New task system online",
  "updated_at": "2026-11-21T02:47:04.037193+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — prod-only — id=3

```json
{
  "assignee_account_id": 17,
  "assignee_display_name_snapshot": "Hans Jørgen Monsen",
  "completed_at": "2026-11-14T20:47:06.507577+00:00",
  "completed_by_account_id": 17,
  "completed_by_display_name_snapshot": "Hans Jørgen Monsen",
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": "2026-11-21T02:48:37.199173+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "test",
  "description": "I just implemented it, would love feedback",
  "due_on": null,
  "event_id": 59,
  "id": 3,
  "title": "Check out the new task system",
  "updated_at": "2026-11-21T02:48:37.199173+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — prod-only — id=5

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": "2026-11-21T02:48:24.119124+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "test",
  "description": "Testing",
  "due_on": null,
  "event_id": 59,
  "id": 5,
  "title": "Check out the tasks",
  "updated_at": "2026-11-21T02:48:24.119124+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — prod-only — id=1

```json
{
  "assignee_account_id": 1,
  "assignee_display_name_snapshot": "Antonis Loizou",
  "completed_at": "2026-11-21T02:46:36.900974+00:00",
  "completed_by_account_id": 1,
  "completed_by_display_name_snapshot": "Antonis Loizou",
  "created_at": "2026-11-14T19:31:41.832794+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Talk to the guy and get permission",
  "due_on": null,
  "event_id": 59,
  "id": 1,
  "title": "Get permission for trike landing area in Salento",
  "updated_at": "2026-11-21T02:46:36.900974+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — prod-only — id=8

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": "2026-11-21T13:12:43.693681+00:00",
  "completed_by_account_id": 47,
  "completed_by_display_name_snapshot": "Stefano Egusquiza",
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "One more attempt to reach the landowner",
  "due_on": null,
  "event_id": 59,
  "id": 8,
  "title": "Talk to David from Maco for the contact for the landing area",
  "updated_at": "2026-11-21T13:12:43.693681+00:00",
  "updated_by_account_id": 47
}
```

### `public.tasks` — prod-only — id=6

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Would be nice to have shade and a space to pack off the sand",
  "due_on": null,
  "event_id": 59,
  "id": 6,
  "title": "Packing mat and tent",
  "updated_at": "2026-11-21T02:49:19.956943+00:00",
  "updated_by_account_id": 1
}
```

### `public.tasks` — changed — id=7

- `assignee_account_id`: 47 → 1
- `assignee_display_name_snapshot`: "Stefano Egusquiza" → "Antonis Loizou"
- `completed_at`: "2026-11-21T13:12:14.596436+00:00" → "2026-11-14T19:26:38.207142+00:00"
- `completed_by_account_id`: 47 → 1
- `completed_by_display_name_snapshot`: "Stefano Egusquiza" → "Antonis Loizou"
- `created_at`: "2026-11-21T02:50:35.174241+00:00" → "2026-11-14T18:50:19.020862+00:00"
- `description`: "We are budgeting 30mins" → "Get in contact with Hector and arrange things"
- `title`: "Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)" → "Get permission for the trike takeoff"
- `updated_at`: "2026-11-21T13:12:14.596436+00:00" → "2026-11-14T19:26:38.207142+00:00"
- `updated_by_account_id`: 47 → 1

### `public.tasks` — changed — id=10

- `assignee_account_id`: 47 → 1
- `assignee_display_name_snapshot`: "Stefano Egusquiza" → "Antonis Loizou"
- `created_at`: "2026-11-21T15:38:25.329339+00:00" → "2026-11-14T19:27:26.924195+00:00"
- `deleted_at`: null → "2026-11-18T14:14:27.471171+00:00"
- `deleted_by_account_id`: null → 1
- `deleted_by_display_name_snapshot`: null → "Antonis Loizou"
- `deleted_reason`: null → "testing"
- `description`: "Get it" → "fdsa"
- `title`: "Contact for El Ocaso 'Doña Gladys' Lunch" → "ds"
- `updated_at`: "2026-11-21T15:38:25.329339+00:00" → "2026-11-18T14:14:27.471171+00:00"

## Complete row-level differences

### `public.account_roles`

Local-only: 13; prod-only: 20; changed: 0.

#### Local-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-09-16T18:50:17.309792+00:00",
  "role_name": "jump_leader"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-09-16T18:50:17.31121+00:00",
  "role_name": "staff"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-09-16T18:50:17.312264+00:00",
  "role_name": "jump_master"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-09-16T18:50:17.31329+00:00",
  "role_name": "admin"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 583,
  "created_at": "2026-11-14T14:20:50.440288+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 585,
  "created_at": "2026-11-14T15:24:02.79501+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 589,
  "created_at": "2026-11-14T17:06:25.396323+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 612,
  "created_at": "2026-11-14T16:33:34.41483+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 628,
  "created_at": "2026-11-14T17:03:42.31703+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 720,
  "created_at": "2026-11-11T19:56:58.040504+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 723,
  "created_at": "2026-11-13T22:26:01.927607+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 725,
  "created_at": "2026-11-11T22:22:18.380631+00:00",
  "role_name": "participant"
}
```

#### Local-only — row without primary key

```json
{
  "account_id": 726,
  "created_at": "2026-11-11T22:40:33.712906+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-11-17T00:21:06.781587+00:00",
  "role_name": "jump_leader"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-11-17T00:21:06.788664+00:00",
  "role_name": "staff"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-11-17T00:21:06.789664+00:00",
  "role_name": "jump_master"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 1,
  "created_at": "2026-11-17T00:21:06.790531+00:00",
  "role_name": "admin"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 583,
  "created_at": "2026-09-14T15:04:21.534379+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 585,
  "created_at": "2026-09-14T17:06:37.630448+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 589,
  "created_at": "2026-09-15T12:56:18.444995+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 612,
  "created_at": "2026-09-17T19:02:45.924034+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 628,
  "created_at": "2026-09-23T14:10:32.47064+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 720,
  "created_at": "2026-11-15T17:11:49.30794+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 723,
  "created_at": "2026-11-11T20:13:19.773176+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 725,
  "created_at": "2026-11-15T17:15:24.30422+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 726,
  "created_at": "2026-11-19T15:28:43.947757+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 726,
  "created_at": "2026-11-19T15:29:01.566053+00:00",
  "role_name": "staff"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 744,
  "created_at": "2026-11-14T22:50:56.275621+00:00",
  "role_name": "admin"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 744,
  "created_at": "2026-11-14T22:50:56.275621+00:00",
  "role_name": "ground_crew"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 744,
  "created_at": "2026-11-14T22:50:56.275621+00:00",
  "role_name": "staff"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 745,
  "created_at": "2026-11-15T14:28:50.097072+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 746,
  "created_at": "2026-11-17T00:23:20.423299+00:00",
  "role_name": "participant"
}
```

#### Prod-only — row without primary key

```json
{
  "account_id": 747,
  "created_at": "2026-11-18T01:23:27.723893+00:00",
  "role_name": "participant"
}
```

### `public.accounts`

Local-only: 0; prod-only: 4; changed: 0.

#### Prod-only — id=744

```json
{
  "created_at": "2026-11-14T22:50:56.267638+00:00",
  "email": "skycon@innhopp.com",
  "full_name": "skycon@innhopp.com",
  "id": 744,
  "subject": "email:wd8ui4tBPucv3245jfP8MiKGBRNFmfhYAZlRHfsghHQ"
}
```

#### Prod-only — id=745

```json
{
  "created_at": "2026-11-15T14:03:25.196813+00:00",
  "email": "joshua@groveparktree.com",
  "full_name": "joshua@groveparktree.com",
  "id": 745,
  "subject": "email:QZgpz27CdLQNRv5B9-DrsXTyKj69iyEya_xErssdQnk"
}
```

#### Prod-only — id=746

```json
{
  "created_at": "2026-11-17T00:23:20.415163+00:00",
  "email": "peter@goodale.com",
  "full_name": "peter@goodale.com",
  "id": 746,
  "subject": "email:BFly5b9ozzqgu1iI7W-mOztF9yUNrGJWEAG0OHpmCBE"
}
```

#### Prod-only — id=747

```json
{
  "created_at": "2026-11-18T01:21:46.99636+00:00",
  "email": "dcarvainis@gmail.com",
  "full_name": "Dan",
  "id": 747,
  "subject": "111553262012523926781"
}
```

### `public.aircraft`

Local-only: 0; prod-only: 0; changed: 2.

#### Changed — id=6

- `updated_at`: "2026-11-18T13:12:46.928094+00:00" → "2026-10-14T04:58:41.197317+00:00"

#### Changed — id=7

- `updated_at`: "2026-11-18T13:12:46.928094+00:00" → "2026-10-14T04:58:41.197317+00:00"

### `public.aircraft_slot_pricing_bands`

Local-only: 4; prod-only: 4; changed: 0.

#### Local-only — id=824

```json
{
  "aircraft_id": 7,
  "created_at": "2026-10-14T04:58:41.197317+00:00",
  "id": 824,
  "max_distance_km": 30,
  "slot_multiplier": 1,
  "sort_order": 0,
  "updated_at": "2026-10-14T04:58:41.197317+00:00"
}
```

#### Local-only — id=825

```json
{
  "aircraft_id": 7,
  "created_at": "2026-10-14T04:58:41.197317+00:00",
  "id": 825,
  "max_distance_km": 48,
  "slot_multiplier": 1.2,
  "sort_order": 1,
  "updated_at": "2026-10-14T04:58:41.197317+00:00"
}
```

#### Local-only — id=826

```json
{
  "aircraft_id": 7,
  "created_at": "2026-10-14T04:58:41.197317+00:00",
  "id": 826,
  "max_distance_km": 60,
  "slot_multiplier": 1.5,
  "sort_order": 2,
  "updated_at": "2026-10-14T04:58:41.197317+00:00"
}
```

#### Local-only — id=827

```json
{
  "aircraft_id": 7,
  "created_at": "2026-10-14T04:58:41.197317+00:00",
  "id": 827,
  "max_distance_km": 80,
  "slot_multiplier": 2,
  "sort_order": 3,
  "updated_at": "2026-10-14T04:58:41.197317+00:00"
}
```

#### Prod-only — id=828

```json
{
  "aircraft_id": 7,
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "id": 828,
  "max_distance_km": 30,
  "slot_multiplier": 1,
  "sort_order": 0,
  "updated_at": "2026-11-18T13:12:46.928094+00:00"
}
```

#### Prod-only — id=829

```json
{
  "aircraft_id": 7,
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "id": 829,
  "max_distance_km": 48,
  "slot_multiplier": 1.2,
  "sort_order": 1,
  "updated_at": "2026-11-18T13:12:46.928094+00:00"
}
```

#### Prod-only — id=830

```json
{
  "aircraft_id": 7,
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "id": 830,
  "max_distance_km": 60,
  "slot_multiplier": 1.5,
  "sort_order": 2,
  "updated_at": "2026-11-18T13:12:46.928094+00:00"
}
```

#### Prod-only — id=831

```json
{
  "aircraft_id": 7,
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "id": 831,
  "max_distance_km": 80,
  "slot_multiplier": 2,
  "sort_order": 3,
  "updated_at": "2026-11-18T13:12:46.928094+00:00"
}
```

### `public.auth_magic_links`

Local-only: 0; prod-only: 8; changed: 0.

#### Prod-only — token_hash="\\x0369532e825066b010702a170958d55e598a74d1442963c4400c2daab724aeb5"

```json
{
  "consumed_at": "2026-11-18T16:07:24.800982+00:00",
  "created_at": "2026-11-18T16:06:45.267115+00:00",
  "email": "easyml9@gmail.com",
  "expires_at": "2026-11-18T16:21:45.267115+00:00",
  "redirect_path": "/",
  "token_hash": "[REDACTED]"
}
```

#### Prod-only — token_hash="\\x1fade5cea9cb977ec4ff6896251b99a86cbf9ee570692cc4b24e29c73bf9b328"

```json
{
  "consumed_at": null,
  "created_at": "2026-11-18T16:20:02.627983+00:00",
  "email": "joshua@groveparktree.con",
  "expires_at": "2026-11-18T16:35:02.627983+00:00",
  "redirect_path": "/",
  "token_hash": "[REDACTED]"
}
```

#### Prod-only — token_hash="\\x368e3a1e52ca3f90fa01670060724c61470872ec9d1f2f03c0331dd068aeb041"

```json
{
  "consumed_at": "2026-11-14T22:50:56.264708+00:00",
  "created_at": "2026-11-14T22:49:33.976724+00:00",
  "email": "skycon@innhopp.com",
  "expires_at": "2026-11-14T23:04:33.976724+00:00",
  "redirect_path": "/events/59/tasks",
  "token_hash": "[REDACTED]"
}
```

#### Prod-only — token_hash="\\x70d821e0d9a1ff680adb5f3882ffb123c5337b9880d3530b54c320c2a0a4dd46"

```json
{
  "consumed_at": "2026-11-17T02:04:59.510453+00:00",
  "created_at": "2026-11-17T02:04:32.437688+00:00",
  "email": "easyml9@gmail.com",
  "expires_at": "2026-11-17T02:19:32.437688+00:00",
  "redirect_path": "/",
  "token_hash": "[REDACTED]"
}
```

#### Prod-only — token_hash="\\x7262bb20ab8cc8d43cd9ce8b9e82e0bd6b88b3b92c544614575c01890035d2f2"

```json
{
  "consumed_at": "2026-11-17T00:23:20.411619+00:00",
  "created_at": "2026-11-17T00:23:02.272387+00:00",
  "email": "peter@goodale.com",
  "expires_at": "2026-11-17T00:38:02.272387+00:00",
  "redirect_path": "/",
  "token_hash": "[REDACTED]"
}
```

#### Prod-only — token_hash="\\x987bef524c7fc693cb7b4a7875499346af407b8c394301efb5274798fa951100"

```json
{
  "consumed_at": "2026-11-15T17:10:28.957517+00:00",
  "created_at": "2026-11-15T17:09:51.585041+00:00",
  "email": "easyml9@gmail.com",
  "expires_at": "2026-11-15T17:24:51.585041+00:00",
  "redirect_path": "/",
  "token_hash": "[REDACTED]"
}
```

#### Prod-only — token_hash="\\xdb7cfe853ba642fcf437da6d118049f79cf424beea7f077e5a68dba154b1fbe9"

```json
{
  "consumed_at": "2026-11-17T00:31:03.054149+00:00",
  "created_at": "2026-11-17T00:30:54.790258+00:00",
  "email": "pmurf77@gmail.com",
  "expires_at": "2026-11-17T00:45:54.790258+00:00",
  "redirect_path": "",
  "token_hash": "[REDACTED]"
}
```

#### Prod-only — token_hash="\\xef613f97df21315a6b5c405b619ba948b7e4deb791794cead60d199eab97aaa4"

```json
{
  "consumed_at": "2026-11-15T14:03:25.191723+00:00",
  "created_at": "2026-11-15T14:02:59.954174+00:00",
  "email": "joshua@groveparktree.com",
  "expires_at": "2026-11-15T14:17:59.954174+00:00",
  "redirect_path": "/",
  "token_hash": "[REDACTED]"
}
```

### `public.budget_assumptions`

Local-only: 70; prod-only: 66; changed: 0.

#### Local-only — id=6819

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6819,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Local-only — id=6820

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6820,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Local-only — id=6821

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6821,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Local-only — id=6822

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6822,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Local-only — id=6823

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6823,
  "key": "budget_method",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Local-only — id=6824

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6824,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6825

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6825,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6826

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6826,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6827

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6827,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Local-only — id=6828

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6828,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Local-only — id=6829

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:13.664884+00:00",
  "id": 6829,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6841

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:27.760942+00:00",
  "id": 6841,
  "key": "estimate_transport_per_day_currency",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": null,
  "value_text": "EUR"
}
```

#### Local-only — id=6842

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:27.760942+00:00",
  "id": 6842,
  "key": "estimate_food_per_day_currency",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": null,
  "value_text": "EUR"
}
```

#### Local-only — id=6843

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:27.760942+00:00",
  "id": 6843,
  "key": "estimate_staff_salary_per_person_day_currency",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": null,
  "value_text": "EUR"
}
```

#### Local-only — id=6844

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T16:45:27.760942+00:00",
  "id": 6844,
  "key": "estimate_accommodation_per_person_night_currency",
  "updated_at": "2026-11-14T16:45:27.760942+00:00",
  "value_num": null,
  "value_text": "EUR"
}
```

#### Local-only — id=6884

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6884,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Local-only — id=6885

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6885,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Local-only — id=6886

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6886,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Local-only — id=6887

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6887,
  "key": "budget_method",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Local-only — id=6888

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6888,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6889

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6889,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6890

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6890,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Local-only — id=6891

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6891,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Local-only — id=6892

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6892,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Local-only — id=6893

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6893,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6894

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6894,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6895

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6895,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6896

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6896,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6897

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6897,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Local-only — id=6898

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6898,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Local-only — id=6899

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6899,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Local-only — id=6900

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6900,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6901

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6901,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6902

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6902,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Local-only — id=6903

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6903,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Local-only — id=6904

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6904,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Local-only — id=6905

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6905,
  "key": "budget_method",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Local-only — id=6906

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6906,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Local-only — id=6907

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6907,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Local-only — id=6908

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6908,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Local-only — id=6909

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6909,
  "key": "budget_method",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Local-only — id=6910

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6910,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6911

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6911,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6912

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6912,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Local-only — id=6913

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6913,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Local-only — id=6914

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6914,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Local-only — id=6915

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6915,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6916

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6916,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6917

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6917,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Local-only — id=6918

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6918,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Local-only — id=6919

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6919,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Local-only — id=6920

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6920,
  "key": "budget_method",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Local-only — id=6921

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6921,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6922

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6922,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6923

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6923,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Local-only — id=6924

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6924,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Local-only — id=6925

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6925,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Local-only — id=6926

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6926,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6927

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6927,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6928

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6928,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Local-only — id=6929

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6929,
  "key": "budget_method",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Local-only — id=6930

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6930,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6931

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6931,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6932

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6932,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Local-only — id=6933

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6933,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Local-only — id=6934

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6934,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Local-only — id=6935

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6935,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6936

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6936,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Local-only — id=6937

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6937,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Local-only — id=6938

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "id": 6938,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T16:56:46.605242+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Prod-only — id=6351

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6351,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Prod-only — id=6352

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6352,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Prod-only — id=6353

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6353,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Prod-only — id=6354

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6354,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6355

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6355,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6356

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6356,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6357

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6357,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Prod-only — id=6358

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6358,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Prod-only — id=6359

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6359,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Prod-only — id=6360

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6360,
  "key": "budget_method",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Prod-only — id=6361

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6361,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6362

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6362,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Prod-only — id=6363

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6363,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Prod-only — id=6364

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6364,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Prod-only — id=6365

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6365,
  "key": "budget_method",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Prod-only — id=6366

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6366,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6367

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6367,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6368

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6368,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Prod-only — id=6369

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6369,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Prod-only — id=6370

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6370,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Prod-only — id=6371

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6371,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6372

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6372,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6373

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6373,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6374

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6374,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Prod-only — id=6375

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6375,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Prod-only — id=6376

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6376,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Prod-only — id=6377

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6377,
  "key": "budget_method",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Prod-only — id=6378

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6378,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6379

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6379,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Prod-only — id=6380

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6380,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Prod-only — id=6381

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6381,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Prod-only — id=6382

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6382,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6383

```json
{
  "budget_id": 17,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6383,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6384

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6384,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6385

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6385,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6386

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6386,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Prod-only — id=6387

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6387,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Prod-only — id=6388

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6388,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Prod-only — id=6389

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6389,
  "key": "budget_method",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Prod-only — id=6390

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6390,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6391

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6391,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6392

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6392,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Prod-only — id=6393

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6393,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Prod-only — id=6394

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6394,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Prod-only — id=6395

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6395,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6396

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6396,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Prod-only — id=6397

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6397,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Prod-only — id=6398

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6398,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Prod-only — id=6399

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6399,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6400

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6400,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6401

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6401,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6402

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6402,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Prod-only — id=6403

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6403,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Prod-only — id=6404

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6404,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Prod-only — id=6405

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6405,
  "key": "budget_method",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Prod-only — id=6406

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6406,
  "key": "worst_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 13.0,
  "value_text": null
}
```

#### Prod-only — id=6407

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6407,
  "key": "target_markup_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 20.0,
  "value_text": null
}
```

#### Prod-only — id=6408

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6408,
  "key": "cost_drift_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 10.0,
  "value_text": null
}
```

#### Prod-only — id=6409

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6409,
  "key": "estimate_transport_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6410

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6410,
  "key": "estimate_staff_salary_per_person_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6411

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6411,
  "key": "confirm_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 12.0,
  "value_text": null
}
```

#### Prod-only — id=6412

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6412,
  "key": "full_participant_count",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 24.0,
  "value_text": null
}
```

#### Prod-only — id=6413

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6413,
  "key": "optional_tip_percent",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 8.0,
  "value_text": null
}
```

#### Prod-only — id=6414

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6414,
  "key": "budget_method",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 2.0,
  "value_text": null
}
```

#### Prod-only — id=6415

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6415,
  "key": "estimate_accommodation_per_person_night",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

#### Prod-only — id=6416

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "id": 6416,
  "key": "estimate_food_per_day",
  "updated_at": "2026-11-14T19:30:38.62501+00:00",
  "value_num": 0.0,
  "value_text": null
}
```

### `public.budget_currencies`

Local-only: 3; prod-only: 2; changed: 8.

#### Local-only — id=656

```json
{
  "budget_id": 18,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "currency_code": "EUR",
  "id": 656,
  "rate_to_base": 1.0,
  "updated_at": "2026-11-14T16:56:46.605242+00:00"
}
```

#### Local-only — id=657

```json
{
  "budget_id": 19,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "currency_code": "EUR",
  "id": 657,
  "rate_to_base": 1.0,
  "updated_at": "2026-11-14T16:56:46.605242+00:00"
}
```

#### Local-only — id=658

```json
{
  "budget_id": 20,
  "created_at": "2026-11-14T16:56:46.605242+00:00",
  "currency_code": "EUR",
  "id": 658,
  "rate_to_base": 1.0,
  "updated_at": "2026-11-14T16:56:46.605242+00:00"
}
```

#### Prod-only — id=650

```json
{
  "budget_id": 15,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "currency_code": "EUR",
  "id": 650,
  "rate_to_base": 1.0,
  "updated_at": "2026-11-14T19:30:38.62501+00:00"
}
```

#### Prod-only — id=651

```json
{
  "budget_id": 16,
  "created_at": "2026-11-14T19:30:38.62501+00:00",
  "currency_code": "EUR",
  "id": 651,
  "rate_to_base": 1.0,
  "updated_at": "2026-11-14T19:30:38.62501+00:00"
}
```

#### Changed — id=523

- `rate_to_base`: 10.580983 → 10.821965

#### Changed — id=647

- `rate_to_base`: 3650.61493 → 3642.118002

#### Changed — id=648

- `rate_to_base`: 10.580983 → 10.556001

#### Changed — id=649

- `rate_to_base`: 1.099852 → 1.103813

#### Changed — id=652

- `budget_id`: 17 → 15
- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:27.272616+00:00"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:27.272616+00:00"

#### Changed — id=653

- `budget_id`: 18 → 15
- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:27.272616+00:00"
- `currency_code`: "EUR" → "USD"
- `rate_to_base`: 1.0 → 1.103813
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:27.272616+00:00"

#### Changed — id=654

- `budget_id`: 19 → 16
- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=655

- `budget_id`: 20 → 17
- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

### `public.budget_line_items`

Local-only: 8; prod-only: 0; changed: 34.

#### Local-only — id=1906

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1906,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Accommodation",
  "notes": "[auto-estimate]:food_accommodation:estimate_accommodation_per_person_night:2027-07-14:estimate-generated",
  "quantity": 24.0,
  "section_id": 86,
  "service_date": "2027-07-14",
  "sort_order": 0,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Local-only — id=1907

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1907,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Food",
  "notes": "[auto-estimate]:food_accommodation:estimate_food_per_day:2027-07-14:estimate-generated",
  "quantity": 24.0,
  "section_id": 86,
  "service_date": "2027-07-14",
  "sort_order": 1,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Local-only — id=1908

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1908,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Transport",
  "notes": "[auto-estimate]:transport_activities:estimate_transport_per_day:2027-07-14:estimate-generated",
  "quantity": 1.0,
  "section_id": 87,
  "service_date": "2027-07-14",
  "sort_order": 2,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Local-only — id=1909

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1909,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Staff Salary",
  "notes": "[auto-estimate]:payable_crew:estimate_staff_salary_per_person_day:2027-07-14:estimate-generated",
  "quantity": 0.0,
  "section_id": 89,
  "service_date": "2027-07-14",
  "sort_order": 3,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Local-only — id=1910

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1910,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Accommodation",
  "notes": "[auto-estimate]:food_accommodation:estimate_accommodation_per_person_night:2027-07-15:estimate-generated",
  "quantity": 24.0,
  "section_id": 86,
  "service_date": "2027-07-15",
  "sort_order": 4,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Local-only — id=1911

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1911,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Food",
  "notes": "[auto-estimate]:food_accommodation:estimate_food_per_day:2027-07-15:estimate-generated",
  "quantity": 24.0,
  "section_id": 86,
  "service_date": "2027-07-15",
  "sort_order": 5,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Local-only — id=1912

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1912,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Transport",
  "notes": "[auto-estimate]:transport_activities:estimate_transport_per_day:2027-07-15:estimate-generated",
  "quantity": 1.0,
  "section_id": 87,
  "service_date": "2027-07-15",
  "sort_order": 6,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Local-only — id=1913

```json
{
  "budget_id": 15,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T16:45:14.302644+00:00",
  "id": 1913,
  "innhopp_id": null,
  "location_label": "Estimate",
  "name": "Staff Salary",
  "notes": "[auto-estimate]:payable_crew:estimate_staff_salary_per_person_day:2027-07-15:estimate-generated",
  "quantity": 0.0,
  "section_id": 89,
  "service_date": "2027-07-15",
  "sort_order": 7,
  "unit_cost": 0.0,
  "updated_at": "2026-11-14T16:45:32.866211+00:00"
}
```

#### Changed — id=119

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=121

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=123

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=125

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=127

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=130

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=132

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=133

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=136

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=137

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=140

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=141

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=144

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=145

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=148

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=149

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=150

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=151

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=152

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=153

- `updated_at`: "2026-11-21T02:45:47.769168+00:00" → "2026-11-21T16:00:48.264175+00:00"

#### Changed — id=892

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=893

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=894

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=895

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=896

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=897

- `quantity`: 134.0 → 115.0
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=898

- `quantity`: 196.0 → 250.0
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=899

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=900

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=901

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=902

- `location_label`: "#11 San Augustin Top Landing or Cow field" → "#11 Alto de las Chinas"
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=903

- `location_label`: "#12 La Chaquira" → "#12 Masaya Hostel"
- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=904

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

#### Changed — id=905

- `updated_at`: "2026-11-21T02:45:47.752494+00:00" → "2026-11-21T16:00:48.254535+00:00"

### `public.budget_sections`

Local-only: 0; prod-only: 0; changed: 36.

#### Changed — id=100

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=101

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=102

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=103

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=104

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=105

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=106

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=107

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=108

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=109

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=110

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=111

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=112

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=113

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=114

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=115

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=116

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=117

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=118

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=119

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=120

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=85

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:13.664884+00:00"

#### Changed — id=86

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:13.664884+00:00"

#### Changed — id=87

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:13.664884+00:00"

#### Changed — id=88

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:13.664884+00:00"

#### Changed — id=89

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:13.664884+00:00"

#### Changed — id=90

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:13.664884+00:00"

#### Changed — id=91

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=92

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=93

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=94

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=95

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=96

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=97

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=98

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=99

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

### `public.event_accommodation`

Local-only: 0; prod-only: 0; changed: 3.

#### Changed — id=54

- `check_out_at`: "2026-11-28T06:45:00+00:00" → "2026-11-28T07:00:00+00:00"
- `notes`: "Need to adjust quote for 22 pax." → "Need to adjust quote for 22 pax. Camillo +57 320 205 9025"

#### Changed — id=55

- `notes`: "Need to change quote for 22 pax and 4 single room upgrade." → "Brayan +57 313 240 5806"

#### Changed — id=56

- `check_out_at`: "2026-12-01T09:00:00+00:00" → "2026-12-01T08:00:00+00:00"
- `notes`: "" → "Contact Ana Maria Eslava +57 319 642 3937"

### `public.event_aircraft`

Local-only: 0; prod-only: 0; changed: 2.

#### Changed — event_id=63, aircraft_id=6

- `created_at`: "2026-11-18T13:12:46.928094+00:00" → "2026-10-14T04:58:41.197317+00:00"

#### Changed — event_id=63, aircraft_id=7

- `created_at`: "2026-11-18T13:12:46.928094+00:00" → "2026-10-14T04:58:41.197317+00:00"

### `public.event_airfields`

Local-only: 0; prod-only: 0; changed: 3.

#### Changed — event_id=63, airfield_id=23

- `added_at`: "2026-11-18T13:12:46.928094+00:00" → "2026-10-14T04:58:41.197317+00:00"

#### Changed — event_id=63, airfield_id=31

- `added_at`: "2026-11-18T13:12:46.928094+00:00" → "2026-10-14T04:58:41.197317+00:00"

#### Changed — event_id=63, airfield_id=58

- `added_at`: "2026-11-18T13:12:46.928094+00:00" → "2026-10-14T04:58:41.197317+00:00"

### `public.event_budgets`

Local-only: 0; prod-only: 0; changed: 6.

#### Changed — id=15

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:13.664884+00:00"
- `event_id`: 50 → 79
- `name`: "From Fjords to Glacier budget" → "Event budget"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:45:25.017028+00:00"

#### Changed — id=16

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"
- `event_id`: 70 → 50
- `name`: "Swoop the Hill budget" → "From Fjords to Glacier budget"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=17

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"
- `event_id`: 75 → 70
- `name`: "Taste of Innhopp budget" → "Swoop the Hill budget"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=18

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"
- `event_id`: 76 → 75
- `name`: "Taste of Innhopp II budget" → "Taste of Innhopp budget"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=19

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"
- `event_id`: 78 → 76
- `name`: "INNHOPP x PARAHOSPODY budget" → "Taste of Innhopp II budget"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

#### Changed — id=20

- `created_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"
- `event_id`: 79 → 78
- `name`: "WE FLY x INNHOPP - Private Event budget" → "INNHOPP x PARAHOSPODY budget"
- `updated_at`: "2026-11-14T19:30:38.62501+00:00" → "2026-11-14T16:56:46.605242+00:00"

### `public.event_innhopps`

Local-only: 0; prod-only: 0; changed: 12.

#### Changed — id=3423

- `hospital`: "Girardot Hospital (38 min)" → ""
- `jumprun`: "XIELO jumprun" → ""
- `land_owner_permission`: true → null
- `landing_airfield_id`: 40 → null
- `landing_distance_by_air`: 90 → null
- `landing_distance_by_road`: 137 → null
- `minimum_requirements`: "A" → ""
- `primary_landing_area_description`: "Flat and grassy" → ""
- `primary_landing_area_name`: "XIELO Landing area" → ""
- `primary_landing_area_obstacles`: "Buildings, Windsock in the middle" → ""
- `primary_landing_area_size`: "Huuuuhe" → ""
- `rescue_boat`: true → null
- `risk_assessment`: "It's a DZ jump, with outs. Crowded landing area, new people" → ""
- `safety_precautions`: "Good briefing, don't underestimate it just because its a DZ.\nExit alt under discussion" → ""
- `secondary_landing_area_name`: "Other fields available in the area" → ""

#### Changed — id=3424

- `hospital`: "Girardot Hospital (38 mi" → ""
- `jumprun`: "XIELO jumprun" → ""
- `land_owner_permission`: true → null
- `land_owners`: [{"name": "Nicolas Rubio (Xielo)"}] → []
- `landing_airfield_id`: 39 → null
- `landing_distance_by_air`: 0 → null
- `landing_distance_by_road`: 0 → null
- `minimum_requirements`: "A" → ""
- `primary_landing_area_name`: "TBD possible outside normal LZ on the E" → ""
- `rescue_boat`: false → null

#### Changed — id=3426

- `elevation`: 207 → 227
- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Antelmo Palacio", "telephone": "+57 321 201 5408"}, {"name": "David (guide)", "telephone": "+57 321 311 0054"}]

#### Changed — id=3427

- `adjust_altimeter_aad`: "" → "Alti: + 263m / 863ft  .  AAD - 263m / 863ft"
- `hospital`: "" → "San Juan De Dios Hospital Honda (11 min after crossing the river)"
- `jumprun`: "" → "N <-> S"
- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Fernando Olmos", "telephone": "+57 321 926 7064"}]
- `minimum_requirements`: "" → "A"
- `primary_landing_area_description`: "" → "Tall grass , Trees small rocks. Adjacent to the river. Other side of the town."
- `primary_landing_area_name`: "" → "Big field next to the river"
- `primary_landing_area_obstacles`: "" → "Powerline at the N of the field, barbed wire fence, possible tall grass"
- `primary_landing_area_size`: "" → "200 x 120m grass"
- `rescue_boat`: null → true
- `risk_assessment`: "" → "River landing"
- `safety_precautions`: "" → "Good briefing, water procedures refresh, floatation device brief"

#### Changed — id=3428

- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Julian", "telephone": "+57 320 832 7883"}]
- `landing_airfield_id`: null → 34
- `landing_distance_by_air`: null → 43
- `landing_distance_by_road`: null → 65
- `scheduled_at`: "2026-11-28T08:15:00+00:00" → "2026-11-28T08:00:00+00:00"

#### Changed — id=3429

- `adjust_altimeter_aad`: "+1550 at takeoff / -1550 at takeoff" → ""
- `coordinates`: "3°15'17.7\"N 75°10'10.1\"W" → "3°13'56.48\"N 75°10'07.79\"W"
- `distance_by_air`: 189 → 192
- `distance_by_road`: 311 → 318
- `elevation`: 434 → 440
- `hospital`: "ESE Hospital del Perpetuo Socorro" → ""
- `jumprun`: "In to wind" → ""
- `land_owners`: [] → [{"name": "Brayan (Estrella Hotel)", "telephone": "+57 313 240 5806"}]
- `landing_airfield_id`: 43 → 34
- `landing_distance_by_air`: 37 → 192
- `landing_distance_by_road`: 47 → 318
- `notes`: "Landing at 1400 feet." → ""
- `primary_landing_area_description`: "Hard surface, small (ish) rocks on landing. Not ideal for sliding" → ""
- `primary_landing_area_name`: "Tatacoa #1" → ""
- `primary_landing_area_obstacles`: "Cactus and small rocks" → ""
- `primary_landing_area_size`: "200*60 meters" → ""
- `reason_for_choice`: "Big(ger) open fields close to the hotel" → ""
- `rescue_boat`: false → null
- `risk_assessment`: "Off landings. Falling. Ankles," → ""
- `safety_precautions`: "Good separation. Flare! 2 jump runs." → ""
- `scheduled_at`: "2026-11-28T15:30:00+00:00" → "2026-11-28T16:00:00+00:00"
- `secondary_landing_area_description`: "Desert, hard and rocky. 300 meters East of main landing" → ""
- `secondary_landing_area_name`: "Tatacoa #2" → ""
- `secondary_landing_area_obstacles`: "Cactus, rocks that covers the end" → ""
- `secondary_landing_area_size`: "150*60" → ""

#### Changed — id=3430

- `land_owner_permission`: null → true
- `land_owners`: [] → [{"name": "Oscar - Hector", "telephone": "+57 313 810 6503"}]

#### Changed — id=3431

- `land_owners`: [] → [{"name": "Nelson", "telephone": "+57 310 375 7069"}]
- `landing_airfield_id`: null → 44
- `landing_distance_by_air`: null → 24
- `landing_distance_by_road`: null → 33

#### Changed — id=3432

- `landing_airfield_id`: null → 44
- `landing_distance_by_air`: null → 15
- `landing_distance_by_road`: null → 28
- `scheduled_at`: "2026-11-30T08:00:00+00:00" → "2026-11-30T09:00:00+00:00"

#### Changed — id=3433

- `landing_airfield_id`: 44 → null
- `landing_distance_by_air`: 22 → null
- `landing_distance_by_road`: 32 → null
- `name`: "San Augustin Top Landing or Cow field" → "Alto de las Chinas"
- `scheduled_at`: "2026-11-30T11:00:00+00:00" → "2026-11-30T11:30:00+00:00"

#### Changed — id=3434

- `coordinates`: "1°54'10.3\"N 76°16'16.0\"W" → "1°53'46.59\"N 76°16'06.55\"W"
- `distance_by_road`: 31 → 30
- `elevation`: 0 → 1634
- `name`: "La Chaquira" → "Masaya Hostel"
- `scheduled_at`: "2026-11-30T16:45:00+00:00" → "2026-11-30T15:30:00+00:00"

#### Changed — id=3435

- `scheduled_at`: "2026-12-01T10:30:00+00:00" → "2026-12-01T10:00:00+00:00"

### `public.event_non_jumper_activities`

Local-only: 4; prod-only: 0; changed: 0.

#### Local-only — id=4

```json
{
  "cost": 500.0,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T17:02:24.663432+00:00",
  "description": "Its a tandem jump",
  "event_id": 79,
  "id": 4,
  "kind": "opt_in",
  "sort_order": 0,
  "title": "Tandem Jump",
  "updated_at": "2026-11-14T17:02:24.663432+00:00"
}
```

#### Local-only — id=5

```json
{
  "cost": null,
  "cost_currency": "",
  "created_at": "2026-11-14T17:02:40.343482+00:00",
  "description": "A boat ride",
  "event_id": 79,
  "id": 5,
  "kind": "opt_out",
  "sort_order": 0,
  "title": "Rib Boat Ride",
  "updated_at": "2026-11-14T17:02:40.343482+00:00"
}
```

#### Local-only — id=6

```json
{
  "cost": null,
  "cost_currency": "",
  "created_at": "2026-11-14T17:02:50.627998+00:00",
  "description": "",
  "event_id": 79,
  "id": 6,
  "kind": "opt_out",
  "sort_order": 1,
  "title": "Kayaking",
  "updated_at": "2026-11-14T17:02:50.627998+00:00"
}
```

#### Local-only — id=7

```json
{
  "cost": 100.0,
  "cost_currency": "EUR",
  "created_at": "2026-11-14T17:03:10.211585+00:00",
  "description": "Cost is per min of flying",
  "event_id": 79,
  "id": 7,
  "kind": "opt_in",
  "sort_order": 1,
  "title": "Heli Ride",
  "updated_at": "2026-11-14T17:03:10.211585+00:00"
}
```

### `public.event_registrations`

Local-only: 0; prod-only: 1; changed: 79.

#### Prod-only — id=4096

```json
{
  "cancelled_at": null,
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "deposit_due_at": "2026-11-18",
  "deposit_paid_at": "2026-11-18",
  "event_details": {
    "accommodation": "Shared (usually 2 per room)",
    "accommodation_roommate": ""
  },
  "event_id": 63,
  "expired_at": null,
  "id": 4096,
  "internal_notes": "",
  "main_invoice_due_at": null,
  "main_invoice_paid_at": null,
  "participant_id": 891,
  "registered_at": "2026-11-18T13:12:46.938692+00:00",
  "registration_checklist": {},
  "source": "event_roster",
  "staff_owner_account_id": null,
  "status": "deposit_paid",
  "tags": [],
  "updated_at": "2026-11-18T13:15:13.921357+00:00",
  "waitlist_position": null
}
```

#### Changed — id=1935

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=1937

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=1939

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=1940

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=1996

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=1997

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=1998

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2037

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2265

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2266

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2268

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2279

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2280

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2281

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2300

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2302

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2303

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2304

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2305

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2306

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2615

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2648

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2649

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2650

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2651

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2653

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2654

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2655

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2729

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2733

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2782

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2783

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2784

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=2785

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3179

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3180

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3449

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3450

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3637

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3870

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3871

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3872

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3873

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3874

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3875

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3876

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3878

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3879

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3914

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3915

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3916

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3920

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3932

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Connor williams"}
- `updated_at`: "2026-11-15T16:56:58.087138+00:00" → "2026-11-14T00:52:10.45379+00:00"

#### Changed — id=3959

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=3994

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Connor williams"}
- `updated_at`: "2026-11-15T16:56:58.087138+00:00" → "2026-11-14T00:52:10.45379+00:00"

#### Changed — id=4001

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "attendance_type": "solo", "discount_eligibility": "The % off discount given during Extremsportsveko 2026", "heard_about_event": "Even and Tayla", "heard_about_project": "Skydive Voss innhopps", "payment_method": "bank_transfer"} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-15T17:18:55.672339+00:00" → "2026-10-13T06:14:13.030942+00:00"

#### Changed — id=4010

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Dayana Lusson", "attendance_type": "group", "discount_eligibility": "VEKO", "group_names": "Dayana Lusson", "group_size": 2, "heard_about_event": "Even", "heard_about_project": "Even", "payment_method": "bank_transfer"} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-15T17:13:41.956368+00:00" → "2026-10-13T06:02:00.90383+00:00"

#### Changed — id=4014

- `event_details`: {"accommodation": "Single Room (additional cost)", "attendance_type": "solo", "heard_about_event": "Fb or ig", "heard_about_project": "Previous Innhopp on e day in Norway", "payment_method": "bank_transfer"} → {"accommodation": "Single Room (additional cost)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-17T00:38:13.321731+00:00" → "2026-11-14T15:32:10.785564+00:00"

#### Changed — id=4016

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Peter Goodale", "additional_information": "Vegetarian meals, please", "attendance_type": "solo", "discount_eligibility": "Special discounts offered by Tayla", "heard_about_event": "Online search", "heard_about_project": "Onl… (340 chars) → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Peter Goodale"}
- `updated_at`: "2026-11-17T00:36:40.769486+00:00" → "2026-10-15T09:54:25.297737+00:00"

#### Changed — id=4020

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Connor williams"}
- `updated_at`: "2026-11-15T16:56:58.087138+00:00" → "2026-11-14T00:52:10.45379+00:00"

#### Changed — id=4021

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "attendance_type": "solo", "heard_about_event": "Even and Tayla", "heard_about_project": "Skydive Voss innhopps", "payment_method": "bank_transfer"} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-15T17:21:54.667867+00:00" → "2026-09-25T01:26:33.961808+00:00"

#### Changed — id=4030

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4031

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4032

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4046

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4052

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4064

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "", "attendance_type": "group", "group_names": "s s", "group_size": 2, "heard_about_event": "d", "heard_about_project": "d", "payment_method": "bank_transfer"}
- `updated_at`: "2026-09-17T08:39:26.314054+00:00" → "2026-11-14T15:05:46.76364+00:00"

#### Changed — id=4067

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4068

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4069

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4070

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4071

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4072

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4073

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4074

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4075

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "", "attendance_type": "solo", "heard_about_event": "s", "heard_about_project": "s", "payment_method": "bank_transfer"}
- `updated_at`: "2026-09-17T08:41:28.018354+00:00" → "2026-11-14T15:36:44.08269+00:00"

#### Changed — id=4088

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Alfonso Pesqueira"} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": "Alfonso Pesqueira", "attendance_type": "solo", "heard_about_event": "fgg", "heard_about_project": "ihkgvjhk", "non_jumper_opt_in_ids": [4, 7], "non_jumper_opt_ins": [{"cost": "500.00", "cost_currency": "EUR", "description": … (671 chars)
- `updated_at`: "2026-09-24T07:41:53.717065+00:00" → "2026-11-14T17:04:19.411122+00:00"

#### Changed — id=4090

- `updated_at`: "2026-11-19T17:23:46.634618+00:00" → "2026-11-19T17:12:19.907348+00:00"

#### Changed — id=4091

- `event_details`: {"accommodation": "Shared (usually 2 per room)", "attendance_type": "solo", "discount_eligibility": "VEKO", "heard_about_event": "Even", "heard_about_project": "Even", "payment_method": "bank_transfer"} → {"accommodation": "Shared (usually 2 per room)", "accommodation_roommate": ""}
- `updated_at`: "2026-11-15T17:12:31.502874+00:00" → "2026-10-02T03:14:38.487588+00:00"

### `public.event_staff_meetings`

Local-only: 2; prod-only: 0; changed: 0.

#### Local-only — event_id=59, meeting_date="2026-11-26"

```json
{
  "event_id": 59,
  "items": [
    {
      "checked": false,
      "id": "default-1",
      "kind": "agenda",
      "title": "What went well"
    },
    {
      "checked": false,
      "id": "default-2",
      "kind": "agenda",
      "title": "What went wrong"
    },
    {
      "checked": false,
      "id": "default-3",
      "kind": "agenda",
      "title": "What we can improve"
    },
    {
      "checked": false,
      "id": "default-4",
      "kind": "agenda",
      "title": "Innhopps"
    },
    {
      "checked": false,
      "id": "default-6",
      "kind": "agenda",
      "title": "Expenses"
    },
    {
      "checked": false,
      "id": "default-7",
      "kind": "agenda",
      "title": "Tommorrow's Weather"
    },
    {
      "checked": false,
      "id": "default-8",
      "kind": "agenda",
      "title": "Ground Crew status"
    },
    {
      "checked": false,
      "id": "default-9",
      "kind": "agenda",
      "title": "Safety incidents"
    },
    {
      "checked": false,
      "id": "default-10",
      "kind": "agenda",
      "title": "Transport and accommodation issues"
    },
    {
      "checked": false,
      "id": "default-11",
      "kind": "agenda",
      "title": "Schedule changes"
    },
    {
      "checked": false,
      "id": "default-12",
      "kind": "agenda",
      "title": "Communications requiring follow-up"
    },
    {
      "checked": false,
      "id": "default-tomorrow-0",
      "kind": "tomorrow",
      "title": "Review schedule for tomorrow"
    },
    {
      "checked": false,
      "id": "default-tomorrow-1",
      "kind": "tomorrow",
      "title": "Share Pilot brief with pilots"
    },
    {
      "checked": false,
      "id": "default-tomorrow-2",
      "kind": "tomorrow",
      "title": "Charge radios and other equipment"
    },
    {
      "checked": false,
      "id": "default-tomorrow-3",
      "kind": "tomorrow",
      "title": "Confirm accommodation and meals"
    },
    {
      "checked": false,
      "id": "default-tomorrow-7",
      "kind": "tomorrow",
      "title": "Accommodation for Staff leaving early (ground crew, pilots, etc)"
    },
    {
      "checked": false,
      "id": "default-tomorrow-4",
      "kind": "tomorrow",
      "title": "Confirm staff assignments"
    },
    {
      "checked": false,
      "id": "default-tomorrow-8",
      "kind": "tomorrow",
      "title": "Assign staff to lead participant meeting and group presentations"
    },
    {
      "checked": false,
      "id": "default-tomorrow-5",
      "kind": "tomorrow",
      "title": "Confirm ground transport"
    },
    {
      "checked": false,
      "id": "default-tomorrow-6",
      "kind": "tomorrow",
      "title": "Bring Water"
    },
    {
      "checked": false,
      "id": "innhopp-3423",
      "kind": "agenda",
      "title": "XIELO"
    },
    {
      "checked": false,
      "id": "innhopp-3424",
      "kind": "agenda",
      "title": "XIELO Target Competition"
    },
    {
      "checked": false,
      "id": "innhopp-3425",
      "kind": "agenda",
      "title": "Nilo Waterfall"
    }
  ],
  "meeting_date": "2026-11-26",
  "updated_at": "2026-11-19T17:17:01.573248+00:00"
}
```

#### Local-only — event_id=59, meeting_date="2026-11-27"

```json
{
  "event_id": 59,
  "items": [
    {
      "checked": false,
      "id": "default-1",
      "kind": "agenda",
      "title": "What went well"
    },
    {
      "checked": false,
      "id": "default-2",
      "kind": "agenda",
      "title": "What went wrong"
    },
    {
      "checked": false,
      "id": "default-3",
      "kind": "agenda",
      "title": "What we can improve"
    },
    {
      "checked": false,
      "id": "default-4",
      "kind": "agenda",
      "title": "Innhopps"
    },
    {
      "checked": false,
      "id": "default-6",
      "kind": "agenda",
      "title": "Expenses"
    },
    {
      "checked": false,
      "id": "default-7",
      "kind": "agenda",
      "title": "Tommorrow's Weather"
    },
    {
      "checked": false,
      "id": "default-8",
      "kind": "agenda",
      "title": "Ground Crew status"
    },
    {
      "checked": false,
      "id": "default-9",
      "kind": "agenda",
      "title": "Safety incidents"
    },
    {
      "checked": false,
      "id": "default-10",
      "kind": "agenda",
      "title": "Transport and accommodation issues"
    },
    {
      "checked": false,
      "id": "default-11",
      "kind": "agenda",
      "title": "Schedule changes"
    },
    {
      "checked": false,
      "id": "default-12",
      "kind": "agenda",
      "title": "Communications requiring follow-up"
    },
    {
      "checked": false,
      "id": "default-tomorrow-1",
      "kind": "tomorrow",
      "title": "Share Pilot brief with pilots"
    },
    {
      "checked": false,
      "id": "default-tomorrow-2",
      "kind": "tomorrow",
      "title": "Charge radios and communication equipment"
    },
    {
      "checked": false,
      "id": "default-tomorrow-3",
      "kind": "tomorrow",
      "title": "Confirm accommodation and meals"
    },
    {
      "checked": false,
      "id": "default-tomorrow-4",
      "kind": "tomorrow",
      "title": "Confirm staff assignments"
    },
    {
      "checked": false,
      "id": "default-tomorrow-5",
      "kind": "tomorrow",
      "title": "Confirm ground transport"
    },
    {
      "checked": true,
      "id": "default-tomorrow-6",
      "kind": "tomorrow",
      "title": "Bring Water"
    },
    {
      "checked": false,
      "id": "innhopp-3426",
      "kind": "agenda",
      "title": "Petroglifos de Honda"
    },
    {
      "checked": false,
      "id": "innhopp-3427",
      "kind": "agenda",
      "title": "Cielo Abierto"
    }
  ],
  "meeting_date": "2026-11-27",
  "updated_at": "2026-11-19T16:56:56.129389+00:00"
}
```

### `public.logistics_event_vehicles`

Local-only: 0; prod-only: 0; changed: 1.

#### Changed — id=111

- `created_at`: "2026-11-21T02:15:32.004857+00:00" → "2026-11-21T15:49:22.506845+00:00"
- `driver`: "" → "Jhon"
- `name`: "Horses and ATVs" → "Salento Minibus"
- `notes`: "" → "+57 313 285 4544"

### `public.logistics_meals`

Local-only: 0; prod-only: 0; changed: 4.

#### Changed — id=122

- `scheduled_at`: "2026-11-25T19:00:00+00:00" → "2026-11-25T20:00:00+00:00"

#### Changed — id=126

- `notes`: "" → "Star guy - @orioncampamento"

#### Changed — id=127

- `notes`: "" → "Band : @nathaliacortik"
- `scheduled_at`: "2026-11-29T19:00:00+00:00" → "2026-11-29T20:00:00+00:00"

#### Changed — id=131

- `notes`: "Lady cook that is next to reception inside the coffee farm." → "Lady cook that is next to reception inside the coffee farm. Contact Catalina Cardona +57 313 425 3669 for now"

### `public.logistics_other`

Local-only: 0; prod-only: 3; changed: 5.

#### Prod-only — id=127

```json
{
  "coordinates": "1°52'46.5\"N 76°16'10.6\"W",
  "created_at": "2026-11-21T02:03:54.615862+00:00",
  "description": null,
  "event_id": 59,
  "id": 127,
  "name": "San Augustin Town and Shopping",
  "notes": null,
  "scheduled_at": "2026-11-30T14:00:00+00:00",
  "season_id": 1
}
```

#### Prod-only — id=128

```json
{
  "coordinates": null,
  "created_at": "2026-11-21T02:07:53.672198+00:00",
  "description": null,
  "event_id": 59,
  "id": 128,
  "name": "Band and bonfire night",
  "notes": null,
  "scheduled_at": "2026-11-30T21:00:00+00:00",
  "season_id": 1
}
```

#### Prod-only — id=129

```json
{
  "coordinates": "3°13'56.1\"N 75°09'19.1\"W",
  "created_at": "2026-11-21T02:13:02.761357+00:00",
  "description": null,
  "event_id": 59,
  "id": 129,
  "name": "Atalaya Mirador Turístico Tatacoa",
  "notes": null,
  "scheduled_at": "2026-11-29T08:00:00+00:00",
  "season_id": 1
}
```

#### Changed — id=122

- `notes`: "Will be used after the boat tour so they can board the bus to Lunch." → "Will be used after the boat tour so they can board the bus to Lunch. Contact is Ivan Romero (Turivan) +57 3103723856"

#### Changed — id=124

- `notes`: "Tayla will arrive earlier for setup." → "Tayla will arrive earlier for setup. Contact is Diana +57 310 4785 335"

#### Changed — id=125

- `notes`: null → "David contact +57 321 311 0054"

#### Changed — id=126

- `coordinates`: "1°53'07.9\"N 76°17'38.9\"W" → null
- `created_at`: "2026-11-21T01:00:41.834697+00:00" → "2026-11-20T16:42:01.399532+00:00"
- `name`: "Parque Arqueológico de San Agustín" → "Museo Arqueológico de San Agustín"
- `notes`: null → "Marta Gil +57 310 2164 462"

#### Changed — id=43

- `notes`: null → "Contact Catalina Cardona +57 313 425 3669"

### `public.logistics_transport_vehicles`

Local-only: 1; prod-only: 1; changed: 1.

#### Local-only — id=1507

```json
{
  "created_at": "2026-11-11T20:24:59.143358+00:00",
  "driver": "Private chofer",
  "event_vehicle_id": 110,
  "id": 1507,
  "name": "COL-2 Bus",
  "notes": "Bus rented for the whole event",
  "passenger_capacity": 26,
  "transport_id": 167
}
```

#### Prod-only — id=1513

```json
{
  "created_at": "2026-11-21T02:17:40.454656+00:00",
  "driver": "",
  "event_vehicle_id": 111,
  "id": 1513,
  "name": "Horses and ATVs",
  "notes": "",
  "passenger_capacity": 0,
  "transport_id": 456
}
```

#### Changed — id=1510

- `created_at`: "2026-11-15T00:12:17.476764+00:00" → "2026-11-21T15:49:28.443133+00:00"
- `driver`: "Private chofer" → "Jhon"
- `event_vehicle_id`: 110 → 111
- `name`: "COL-2 Bus" → "Salento Minibus"
- `notes`: "Bus rented for the whole event" → "+57 313 285 4544"
- `passenger_capacity`: 26 → 0
- `transport_id`: 167 → 168

### `public.logistics_transports`

Local-only: 0; prod-only: 1; changed: 7.

#### Prod-only — id=456

```json
{
  "created_at": "2026-11-21T02:17:05.273338+00:00",
  "destination": "Atalaya Mirador Turístico Tatacoa",
  "destination_id": 129,
  "destination_type": "Other",
  "duration_minutes": 13,
  "event_id": 59,
  "id": 456,
  "notes": "",
  "passenger_count": 20,
  "pickup_location": "Hotel Estrella La Casa del Angel",
  "pickup_location_id": 55,
  "pickup_location_type": "Accommodation",
  "scheduled_at": "2026-11-29T07:30:00+00:00",
  "season_id": 1
}
```

#### Changed — id=167

- `scheduled_at`: "2026-11-28T07:15:00+00:00" → "2026-11-28T07:30:00+00:00"

#### Changed — id=168

- `pickup_location`: "Coffee Tasting Load 1" → "El Ocaso Farm Coffee Tasting"

#### Changed — id=169

- `duration_minutes`: 72 → 82
- `notes`: "" → "Carlos +57 321 296 0647"
- `pickup_location`: "Atalaya Mirador Turístico Tatacoa" → "Hotel Estrella La Casa del Angel"
- `pickup_location_id`: 129 → 55
- `pickup_location_type`: "Other" → "Accommodation"

#### Changed — id=170

- `duration_minutes`: 43 → 44
- `pickup_location`: "Museo Arqueológico de San Agustín" → "#8 San Augustin"
- `pickup_location_id`: 126 → 3430
- `pickup_location_type`: "Other" → "Innhopp"

#### Changed — id=171

- `scheduled_at`: "2026-11-30T07:00:00+00:00" → "2026-11-30T08:00:00+00:00"

#### Changed — id=173

- `duration_minutes`: 34 → 44
- `pickup_location`: "San Augustin Town and Shopping" → "#11 Alto de las Chinas"
- `pickup_location_id`: 127 → 2090
- `pickup_location_type`: "Other" → "Innhopp"
- `scheduled_at`: "2026-11-30T15:30:00+00:00" → "2026-11-30T14:00:00+00:00"

#### Changed — id=174

- `scheduled_at`: "2026-12-01T09:30:00+00:00" → "2026-12-01T08:30:00+00:00"

### `public.participant_email_aliases`

Local-only: 1; prod-only: 1; changed: 2.

#### Local-only — id=4

```json
{
  "created_at": "2026-11-14T15:32:10.785564+00:00",
  "email": "dj2000handa@hotmail.com",
  "id": 4,
  "participant_id": 890
}
```

#### Prod-only — id=3

```json
{
  "created_at": "2026-11-15T16:59:16.375318+00:00",
  "email": "dj2000handa@hotmail.com",
  "id": 3,
  "participant_id": 890
}
```

#### Changed — id=1

- `created_at`: "2026-11-15T16:56:43.793206+00:00" → "2026-11-14T00:52:10.45379+00:00"
- `email`: "angelosnic1993@gmail.com" → "angelosflights@hotmail.com"

#### Changed — id=2

- `created_at`: "2026-11-15T16:56:58.087138+00:00" → "2026-11-14T13:36:05.685902+00:00"
- `email`: "angelosflights@hotmail.com" → "angelosnic1993@gmail.com"

### `public.participant_profiles`

Local-only: 0; prod-only: 1; changed: 13.

#### Prod-only — id=891

```json
{
  "accommodation": "Shared (usually 2 per room)",
  "accommodation_roommate": "",
  "account_id": 745,
  "account_roles": [
    "participant"
  ],
  "canopy_course": "Attended 1 or more canopy courses",
  "citizenship": "US",
  "created_at": "2026-11-15T14:03:25.203972+00:00",
  "date_of_birth": "1984-07-06",
  "dietary_restrictions": [
    "None"
  ],
  "disciplines": [
    "WS",
    "FS"
  ],
  "email": "joshua@groveparktree.com",
  "emergency_contact": "",
  "emergency_contact_name": "Lindsay Reynolds",
  "emergency_contact_phone": "4152983704",
  "full_name": "Joshua Otstott",
  "hss_qualities": [
    "Lots of spice on food"
  ],
  "id": 891,
  "instagram": "Otstottjoshua",
  "jump_count": 900,
  "landing_area_preference": "Limited with big and safe backup",
  "license": "D",
  "main_canopy": "Nitron 120 spectre 120",
  "medical_conditions": "",
  "medical_expertise": [],
  "notes": "",
  "other_air_sports": [],
  "phone": "3366074802",
  "ratings": [],
  "recent_jump_count": 50,
  "roles": [
    "Participant",
    "Skydiver"
  ],
  "tshirt_gender": "Male",
  "tshirt_size": "L",
  "uses_packer": "No",
  "whatsapp": "",
  "wingload": "1.3",
  "years_in_sport": 5
}
```

#### Changed — id=1

- `roles`: ["Jump Leader", "Staff", "Skydiver", "Jump Master"] → ["Staff", "Skydiver", "Jump Master", "Jump Leader"]
- `whatsapp`: "+3579982982" → ""

#### Changed — id=220

- `accommodation_roommate`: "" → null
- `account_roles`: ["participant"] → []
- `canopy_course`: "Attended 1 or more canopy courses" → null
- `citizenship`: "NO" → "Norway"
- `dietary_restrictions`: ["None"] → []
- `disciplines`: ["FS", "FF", "CP"] → []
- `emergency_contact`: "" → null
- `emergency_contact_name`: "Eva Sita Pettersen" → null
- `emergency_contact_phone`: "+4790023653" → null
- `hss_qualities`: ["Active in multiple sports", "Pushing boundaries", "Listen to music while reading", "Lots of spice on food", "Take risks"] → []
- `jump_count`: 228 → 200
- `landing_area_preference`: "Limited with big and safe backup" → null
- `medical_conditions`: "N/A" → null
- `notes`: "" → null
- `recent_jump_count`: 10 → 100
- `tshirt_gender`: "Male" → null
- `tshirt_size`: "M" → null
- `uses_packer`: "No" → null

#### Changed — id=234

- `citizenship`: "United Kingdom" → "GB"

#### Changed — id=24

- `account_id`: 744 → null

#### Changed — id=33

- `accommodation_roommate`: "" → null
- `account_id`: 747 → null
- `account_roles`: ["participant"] → []
- `canopy_course`: "Attended 1 or more canopy courses" → null
- `citizenship`: "US" → null
- `date_of_birth`: "" → null
- `disciplines`: ["FS", "FF", "CP", "CRW"] → []
- `emergency_contact_name`: "Reid Garton" → null
- `emergency_contact_phone`: "+1 (206) 228-8653" → null
- `instagram`: "Dcarvainis" → null
- `landing_area_preference`: "" → null
- `license`: "D" → null
- `main_canopy`: "JFX 2 104" → null
- `medical_conditions`: "" → null
- `medical_expertise`: ["First aid certified"] → []
- `notes`: "" → null
- `other_air_sports`: ["BASE"] → []
- `recent_jump_count`: 200 → null
- `tshirt_gender`: "Male" → null
- `tshirt_size`: "L" → null
- `uses_packer`: "No" → null
- `whatsapp`: "" → null
- `wingload`: "2.1" → null
- `years_in_sport`: 4 → null

#### Changed — id=60

- `accommodation_roommate`: null → ""
- `account_roles`: [] → ["participant"]
- `emergency_contact_name`: null → "a"
- `emergency_contact_phone`: null → "sa"
- `jump_count`: null → 1
- `license`: "" → "A"
- `main_canopy`: "" → "d"
- `notes`: null → ""
- `recent_jump_count`: null → 2
- `roles`: ["Participant", "Skydiver"] → ["Skydiver", "Participant"]
- `uses_packer`: null → "Yes"
- `wingload`: "" → "e"
- `years_in_sport`: null → 10

#### Changed — id=863

- `accommodation_roommate`: null → ""
- `notes`: null → ""
- `roles`: ["Participant", "Skydiver"] → ["Skydiver", "Participant"]
- `uses_packer`: null → "Yes"

#### Changed — id=865

- `accommodation_roommate`: null → ""
- `notes`: null → ""
- `uses_packer`: null → "Yes"

#### Changed — id=867

- `accommodation_roommate`: null → ""
- `uses_packer`: null → "No"

#### Changed — id=878

- `license`: "B" → "Non jumper"
- `roles`: ["Participant", "Skydiver"] → ["Participant"]

#### Changed — id=884

- `license`: "D" → "Non jumper"
- `roles`: ["Participant", "Skydiver"] → ["Participant"]

#### Changed — id=887

- `medical_conditions`: "" → null
- `whatsapp`: "0035799211216" → ""

#### Changed — id=888

- `roles`: ["Participant", "Staff", "Skydiver"] → ["Skydiver", "Participant"]

### `public.registration_activity`

Local-only: 0; prod-only: 8; changed: 3.

#### Prod-only — id=6047

```json
{
  "created_at": "2026-11-15T17:18:55.672339+00:00",
  "created_by_account_id": 725,
  "id": 6047,
  "payload": {
    "event_id": 60
  },
  "registration_id": 4001,
  "summary": "Event-specific registration details completed",
  "type": "note"
}
```

#### Prod-only — id=6048

```json
{
  "created_at": "2026-11-15T17:21:54.667867+00:00",
  "created_by_account_id": 725,
  "id": 6048,
  "payload": {
    "event_id": 59
  },
  "registration_id": 4021,
  "summary": "Event-specific registration details completed",
  "type": "note"
}
```

#### Prod-only — id=6049

```json
{
  "created_at": "2026-11-17T00:36:40.769486+00:00",
  "created_by_account_id": 722,
  "id": 6049,
  "payload": {
    "event_id": 59
  },
  "registration_id": 4016,
  "summary": "Event-specific registration details completed",
  "type": "note"
}
```

#### Prod-only — id=6050

```json
{
  "created_at": "2026-11-17T00:38:13.321731+00:00",
  "created_by_account_id": 733,
  "id": 6050,
  "payload": {
    "event_id": 59
  },
  "registration_id": 4014,
  "summary": "Event-specific registration details completed",
  "type": "note"
}
```

#### Prod-only — id=6051

```json
{
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "created_by_account_id": null,
  "id": 6051,
  "payload": {
    "source": "event_roster",
    "status": "deposit_pending"
  },
  "registration_id": 4096,
  "summary": "Registration created from event roster",
  "type": "status_change"
}
```

#### Prod-only — id=6052

```json
{
  "created_at": "2026-11-18T13:14:22.863629+00:00",
  "created_by_account_id": 13,
  "id": 6052,
  "payload": {
    "status": "deposit_paid"
  },
  "registration_id": 4096,
  "summary": "Registration status updated",
  "type": "status_change"
}
```

#### Prod-only — id=6053

```json
{
  "created_at": "2026-11-18T13:14:32.206752+00:00",
  "created_by_account_id": 13,
  "id": 6053,
  "payload": {
    "amount": "825.00",
    "currency": "EUR",
    "kind": "deposit",
    "payment_id": 7749,
    "status": "paid"
  },
  "registration_id": 4096,
  "summary": "Payment record updated",
  "type": "payment_updated"
}
```

#### Prod-only — id=6054

```json
{
  "created_at": "2026-11-18T13:15:13.921357+00:00",
  "created_by_account_id": 13,
  "id": 6054,
  "payload": {
    "amount": "4675.00",
    "currency": "EUR",
    "kind": "main_invoice",
    "payment_id": 7750,
    "status": "pending"
  },
  "registration_id": 4096,
  "summary": "Payment record updated",
  "type": "payment_updated"
}
```

#### Changed — id=6044

- `created_at`: "2026-11-14T00:32:53.244769+00:00" → "2026-11-14T15:05:46.76364+00:00"
- `created_by_account_id`: 1 → 583
- `payload`: {} → {"event_id": 79}
- `registration_id`: 4042 → 4064
- `summary`: "d" → "Event-specific registration details completed"

#### Changed — id=6045

- `created_at`: "2026-11-15T17:12:31.502874+00:00" → "2026-11-14T15:36:44.08269+00:00"
- `created_by_account_id`: 625 → 585
- `payload`: {"event_id": 59} → {"event_id": 79}
- `registration_id`: 4091 → 4075

#### Changed — id=6046

- `created_at`: "2026-11-15T17:13:41.956368+00:00" → "2026-11-14T17:04:19.411122+00:00"
- `created_by_account_id`: 625 → 628
- `payload`: {"event_id": 60} → {"event_id": 79}
- `registration_id`: 4010 → 4088

### `public.registration_intents`

Local-only: 3; prod-only: 5; changed: 31.

#### Local-only — id=244

```json
{
  "account_id": 733,
  "completed_at": null,
  "created_at": "2026-11-14T16:14:12.64179+00:00",
  "event_id": 59,
  "id": 244,
  "status": "pending"
}
```

#### Local-only — id=32

```json
{
  "account_id": 722,
  "completed_at": null,
  "created_at": "2026-11-14T14:27:41.07637+00:00",
  "event_id": 59,
  "id": 32,
  "status": "pending"
}
```

#### Local-only — id=33

```json
{
  "account_id": 675,
  "completed_at": null,
  "created_at": "2026-11-14T14:27:41.07637+00:00",
  "event_id": 60,
  "id": 33,
  "status": "pending"
}
```

#### Prod-only — id=221

```json
{
  "account_id": 733,
  "completed_at": "2026-11-17T00:38:13.321731+00:00",
  "created_at": "2026-11-17T00:37:21.684385+00:00",
  "event_id": 59,
  "id": 221,
  "status": "completed"
}
```

#### Prod-only — id=227

```json
{
  "account_id": 747,
  "completed_at": null,
  "created_at": "2026-11-18T01:21:47.013447+00:00",
  "event_id": 59,
  "id": 227,
  "status": "pending"
}
```

#### Prod-only — id=237

```json
{
  "account_id": 745,
  "completed_at": null,
  "created_at": "2026-11-19T17:23:44.269318+00:00",
  "event_id": 63,
  "id": 237,
  "status": "pending"
}
```

#### Prod-only — id=67

```json
{
  "account_id": 720,
  "completed_at": null,
  "created_at": "2026-11-15T17:09:29.187537+00:00",
  "event_id": 59,
  "id": 67,
  "status": "pending"
}
```

#### Prod-only — id=68

```json
{
  "account_id": 720,
  "completed_at": null,
  "created_at": "2026-11-15T17:09:29.187537+00:00",
  "event_id": 60,
  "id": 68,
  "status": "pending"
}
```

#### Changed — id=1

- `account_id`: 625 → 330
- `completed_at`: "2026-11-15T17:12:31.502874+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 60
- `status`: "completed" → "pending"

#### Changed — id=10

- `account_id`: 583 → 725
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 60

#### Changed — id=11

- `account_id`: 625 → 405
- `completed_at`: "2026-11-15T17:13:41.956368+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `status`: "completed" → "pending"

#### Changed — id=12

- `account_id`: 589 → 584
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=13

- `account_id`: 585 → 595
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=14

- `account_id`: 586 → 596
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=15

- `account_id`: 590 → 264
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

#### Changed — id=16

- `account_id`: 592 → 601
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=17

- `account_id`: 593 → 725
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

#### Changed — id=18

- `account_id`: 725 → 604
- `completed_at`: "2026-11-15T17:18:55.672339+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 60 → 59
- `status`: "completed" → "pending"

#### Changed — id=19

- `account_id`: 405 → 597
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 60 → 79

#### Changed — id=2

- `account_id`: 728 → 583
- `completed_at`: null → "2026-11-14T15:05:46.76364+00:00"
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 79
- `status`: "pending" → "completed"

#### Changed — id=20

- `account_id`: 584 → 599
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=21

- `account_id`: 595 → 680
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

#### Changed — id=22

- `account_id`: 596 → 720
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 60

#### Changed — id=23

- `account_id`: 264 → 625
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=24

- `account_id`: 601 → 612
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=25

- `account_id`: 725 → 723
- `completed_at`: "2026-11-15T17:21:54.667867+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `status`: "completed" → "pending"

#### Changed — id=26

- `account_id`: 604 → 720
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=27

- `account_id`: 597 → 728
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

#### Changed — id=28

- `account_id`: 599 → 638
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 79 → 59

#### Changed — id=29

- `account_id`: 680 → 628
- `completed_at`: null → "2026-11-14T17:04:19.411122+00:00"
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 79
- `status`: "pending" → "completed"

#### Changed — id=3

- `account_id`: 638 → 625
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 60

#### Changed — id=30

- `account_id`: 612 → 627
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=31

- `account_id`: 723 → 659
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 63

#### Changed — id=4

- `account_id`: 628 → 589
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"

#### Changed — id=5

- `account_id`: 627 → 585
- `completed_at`: null → "2026-11-14T15:36:44.08269+00:00"
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `status`: "pending" → "completed"

#### Changed — id=6

- `account_id`: 659 → 586
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 63 → 79

#### Changed — id=7

- `account_id`: 722 → 590
- `completed_at`: "2026-11-17T00:36:40.769486+00:00" → null
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 59 → 79
- `status`: "completed" → "pending"

#### Changed — id=8

- `account_id`: 675 → 592
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 60 → 79

#### Changed — id=9

- `account_id`: 330 → 593
- `created_at`: "2026-11-14T19:30:38.47377+00:00" → "2026-11-14T14:27:41.07637+00:00"
- `event_id`: 60 → 79

### `public.registration_payments`

Local-only: 0; prod-only: 2; changed: 0.

#### Prod-only — id=7749

```json
{
  "amount": 825.0,
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "currency": "EUR",
  "due_at": "2026-11-18",
  "id": 7749,
  "kind": "deposit",
  "notes": "Registration created from event roster",
  "paid_at": "2026-11-18",
  "provider": "",
  "provider_ref": "",
  "recorded_by_account_id": null,
  "registration_id": 4096,
  "status": "paid"
}
```

#### Prod-only — id=7750

```json
{
  "amount": 4675.0,
  "created_at": "2026-11-18T13:12:46.928094+00:00",
  "currency": "EUR",
  "due_at": "2027-04-20",
  "id": 7750,
  "kind": "main_invoice",
  "notes": "Registration created from event roster",
  "paid_at": null,
  "provider": "",
  "provider_ref": "",
  "recorded_by_account_id": null,
  "registration_id": 4096,
  "status": "pending"
}
```

### `public.task_audit_events`

Local-only: 11; prod-only: 25; changed: 1.

#### Local-only — id=1008

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 1
  },
  "created_at": "2026-11-14T19:02:35.197894+00:00",
  "event_id": 59,
  "id": 1008,
  "task_id": 7
}
```

#### Local-only — id=1009

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 2
  },
  "created_at": "2026-11-14T19:03:00.230024+00:00",
  "event_id": 59,
  "id": 1009,
  "task_id": 7
}
```

#### Local-only — id=1010

```json
{
  "action": "completed",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:16:28.208391+00:00",
  "event_id": 59,
  "id": 1010,
  "task_id": 7
}
```

#### Local-only — id=1011

```json
{
  "action": "reopened",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:16:38.859325+00:00",
  "event_id": 59,
  "id": 1011,
  "task_id": 7
}
```

#### Local-only — id=1012

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "de"
  },
  "created_at": "2026-11-14T19:16:56.832864+00:00",
  "event_id": 59,
  "id": 1012,
  "task_id": 7
}
```

#### Local-only — id=1013

```json
{
  "action": "restored",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:17:17.508651+00:00",
  "event_id": 59,
  "id": 1013,
  "task_id": 7
}
```

#### Local-only — id=1014

```json
{
  "action": "completed",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-14T19:26:38.207142+00:00",
  "event_id": 59,
  "id": 1014,
  "task_id": 7
}
```

#### Local-only — id=1015

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "ds"
  },
  "created_at": "2026-11-14T19:27:26.924195+00:00",
  "event_id": 59,
  "id": 1015,
  "task_id": 10
}
```

#### Local-only — id=1016

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Packing tent"
  },
  "created_at": "2026-11-18T14:14:01.271333+00:00",
  "event_id": 59,
  "id": 1016,
  "task_id": 11
}
```

#### Local-only — id=1017

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "testing"
  },
  "created_at": "2026-11-18T14:14:27.471171+00:00",
  "event_id": 59,
  "id": 1017,
  "task_id": 10
}
```

#### Local-only — id=1018

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Make a daily task list for the staff meeiting"
  },
  "created_at": "2026-11-18T14:18:05.549596+00:00",
  "event_id": 59,
  "id": 1018,
  "task_id": 12
}
```

#### Prod-only — id=10

```json
{
  "action": "edited",
  "actor_account_id": 13,
  "actor_display_name_snapshot": "Tayla Lima",
  "changes": {
    "due_on": {
      "new": "2026-11-14",
      "old": ""
    }
  },
  "created_at": "2026-11-14T20:59:21.536099+00:00",
  "event_id": 59,
  "id": 10,
  "task_id": 4
}
```

#### Prod-only — id=11

```json
{
  "action": "completed",
  "actor_account_id": 13,
  "actor_display_name_snapshot": "Tayla Lima",
  "changes": {},
  "created_at": "2026-11-14T20:59:24.552962+00:00",
  "event_id": 59,
  "id": 11,
  "task_id": 4
}
```

#### Prod-only — id=12

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Check out the tasks"
  },
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "event_id": 59,
  "id": 12,
  "task_id": 5
}
```

#### Prod-only — id=13

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 4
  },
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "event_id": 59,
  "id": 13,
  "task_id": 5
}
```

#### Prod-only — id=14

```json
{
  "action": "completed",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {},
  "created_at": "2026-11-21T02:46:36.900974+00:00",
  "event_id": 59,
  "id": 14,
  "task_id": 1
}
```

#### Prod-only — id=15

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "tets"
  },
  "created_at": "2026-11-21T02:47:04.037193+00:00",
  "event_id": 59,
  "id": 15,
  "task_id": 4
}
```

#### Prod-only — id=16

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "test"
  },
  "created_at": "2026-11-21T02:48:24.119124+00:00",
  "event_id": 59,
  "id": 16,
  "task_id": 5
}
```

#### Prod-only — id=17

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "test"
  },
  "created_at": "2026-11-21T02:48:37.199173+00:00",
  "event_id": 59,
  "id": 17,
  "task_id": 3
}
```

#### Prod-only — id=18

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Packing mat and tent"
  },
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "event_id": 59,
  "id": 18,
  "task_id": 6
}
```

#### Prod-only — id=19

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)"
  },
  "created_at": "2026-11-21T02:50:35.174241+00:00",
  "event_id": 59,
  "id": 19,
  "task_id": 7
}
```

#### Prod-only — id=2

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 1
  },
  "created_at": "2026-11-14T19:32:05.970538+00:00",
  "event_id": 59,
  "id": 2,
  "task_id": 1
}
```

#### Prod-only — id=20

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Talk to David from Maco for the contact for the landing area"
  },
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "event_id": 59,
  "id": 20,
  "task_id": 8
}
```

#### Prod-only — id=21

```json
{
  "action": "commented",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {
    "comment_id": 5
  },
  "created_at": "2026-11-21T13:12:11.866661+00:00",
  "event_id": 59,
  "id": 21,
  "task_id": 7
}
```

#### Prod-only — id=22

```json
{
  "action": "completed",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {},
  "created_at": "2026-11-21T13:12:14.596436+00:00",
  "event_id": 59,
  "id": 22,
  "task_id": 7
}
```

#### Prod-only — id=23

```json
{
  "action": "commented",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {
    "comment_id": 6
  },
  "created_at": "2026-11-21T13:12:41.242978+00:00",
  "event_id": 59,
  "id": 23,
  "task_id": 8
}
```

#### Prod-only — id=24

```json
{
  "action": "completed",
  "actor_account_id": 47,
  "actor_display_name_snapshot": "Stefano Egusquiza",
  "changes": {},
  "created_at": "2026-11-21T13:12:43.693681+00:00",
  "event_id": 59,
  "id": 24,
  "task_id": 8
}
```

#### Prod-only — id=25

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Get the contact for Antelmo"
  },
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "event_id": 59,
  "id": 25,
  "task_id": 9
}
```

#### Prod-only — id=26

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Contact for El Ocaso 'Doña Gladys' Lunch"
  },
  "created_at": "2026-11-21T15:38:25.329339+00:00",
  "event_id": 59,
  "id": 26,
  "task_id": 10
}
```

#### Prod-only — id=3

```json
{
  "action": "created",
  "actor_account_id": 17,
  "actor_display_name_snapshot": "Hans Jørgen Monsen",
  "changes": {
    "title": "Test task"
  },
  "created_at": "2026-11-14T19:46:53.098139+00:00",
  "event_id": 59,
  "id": 3,
  "task_id": 2
}
```

#### Prod-only — id=4

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "Check out the new task system"
  },
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "event_id": 59,
  "id": 4,
  "task_id": 3
}
```

#### Prod-only — id=5

```json
{
  "action": "deleted",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "reason": "Testing"
  },
  "created_at": "2026-11-14T19:49:01.175679+00:00",
  "event_id": 59,
  "id": 5,
  "task_id": 2
}
```

#### Prod-only — id=6

```json
{
  "action": "completed",
  "actor_account_id": 17,
  "actor_display_name_snapshot": "Hans Jørgen Monsen",
  "changes": {},
  "created_at": "2026-11-14T20:47:06.507577+00:00",
  "event_id": 59,
  "id": 6,
  "task_id": 3
}
```

#### Prod-only — id=7

```json
{
  "action": "created",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "title": "New task system online"
  },
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "event_id": 59,
  "id": 7,
  "task_id": 4
}
```

#### Prod-only — id=8

```json
{
  "action": "commented",
  "actor_account_id": 1,
  "actor_display_name_snapshot": "Antonis Loizou",
  "changes": {
    "comment_id": 2
  },
  "created_at": "2026-11-14T20:55:37.770788+00:00",
  "event_id": 59,
  "id": 8,
  "task_id": 4
}
```

#### Prod-only — id=9

```json
{
  "action": "commented",
  "actor_account_id": 13,
  "actor_display_name_snapshot": "Tayla Lima",
  "changes": {
    "comment_id": 3
  },
  "created_at": "2026-11-14T20:59:06.353393+00:00",
  "event_id": 59,
  "id": 9,
  "task_id": 4
}
```

#### Changed — id=1

- `changes`: {"title": "Get permission for trike landing area in Salento"} → {"title": "Get permission for the trike takeoff"}
- `created_at`: "2026-11-14T19:31:41.832794+00:00" → "2026-11-14T18:50:19.020862+00:00"
- `task_id`: 1 → 7

### `public.task_comments`

Local-only: 0; prod-only: 4; changed: 2.

#### Prod-only — id=3

```json
{
  "author_account_id": 13,
  "author_display_name_snapshot": "Tayla Lima",
  "body": "hello there",
  "created_at": "2026-11-14T20:59:06.353393+00:00",
  "id": 3,
  "task_id": 4
}
```

#### Prod-only — id=4

```json
{
  "author_account_id": 1,
  "author_display_name_snapshot": "Antonis Loizou",
  "body": "Come on bro get on with it",
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "id": 4,
  "task_id": 5
}
```

#### Prod-only — id=5

```json
{
  "author_account_id": 47,
  "author_display_name_snapshot": "Stefano Egusquiza",
  "body": "30 min with both he said, also we can be met by them at our hotel we just need to give exact number of what we need and time.",
  "created_at": "2026-11-21T13:12:11.866661+00:00",
  "id": 5,
  "task_id": 7
}
```

#### Prod-only — id=6

```json
{
  "author_account_id": 47,
  "author_display_name_snapshot": "Stefano Egusquiza",
  "body": "he has been approached, waiting for his answer via whatsapp",
  "created_at": "2026-11-21T13:12:41.242978+00:00",
  "id": 6,
  "task_id": 8
}
```

#### Changed — id=1

- `body`: "Permission is ok, we meet tomorrow at Salento at 14:00" → "is this done yet ?"
- `created_at`: "2026-11-14T19:32:05.970538+00:00" → "2026-11-14T19:02:35.197894+00:00"
- `task_id`: 1 → 7

#### Changed — id=2

- `body`: "And we can add comments and stuff" → "no"
- `created_at`: "2026-11-14T20:55:37.770788+00:00" → "2026-11-14T19:03:00.230024+00:00"
- `task_id`: 4 → 7

### `public.task_email_deliveries`

Local-only: 0; prod-only: 10; changed: 1.

#### Prod-only — id=10

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Get the contact for Antelmo\n\nOpen task: https://central.innhopp.com/tasks?taskId=9",
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "id": 10,
  "last_error": null,
  "provider_message_id": "1795275061948087160.948087160@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "taylanika@gmail.com",
  "sent_at": "2026-11-21T15:31:03.987614+00:00",
  "status": "sent",
  "subject": "Task assigned: Get the contact for Antelmo",
  "task_notification_id": 10
}
```

#### Prod-only — id=11

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Contact for El Ocaso 'Doña Gladys' Lunch\n\nOpen task: https://central.innhopp.com/tasks?taskId=10",
  "created_at": "2026-11-21T15:38:25.329339+00:00",
  "id": 11,
  "last_error": null,
  "provider_message_id": "1795275505576061566.576061566@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T15:38:27.528116+00:00",
  "status": "sent",
  "subject": "Task assigned: Contact for El Ocaso 'Doña Gladys' Lunch",
  "task_notification_id": 11
}
```

#### Prod-only — id=2

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Check out the new task system\n\nOpen task: https://central.innhopp.com/tasks?taskId=3",
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "id": 2,
  "last_error": null,
  "provider_message_id": "1794685730735149171.735149171@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "monsen.hj@gmail.com",
  "sent_at": "2026-11-14T19:48:52.504808+00:00",
  "status": "sent",
  "subject": "Task assigned: Check out the new task system",
  "task_notification_id": 2
}
```

#### Prod-only — id=3

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: New task system online\n\nOpen task: https://central.innhopp.com/tasks?taskId=4",
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "id": 3,
  "last_error": null,
  "provider_message_id": "1794689675320993244.320993244@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "taylanika@gmail.com",
  "sent_at": "2026-11-14T20:54:37.270015+00:00",
  "status": "sent",
  "subject": "Task assigned: New task system online",
  "task_notification_id": 3
}
```

#### Prod-only — id=4

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou added a comment to your task.\n\nEvent: Ancient Lines\nTask: New task system online\n\nComment:\nAnd we can add comments and stuff\n\nOpen task: https://central.innhopp.com/tasks?taskId=4",
  "created_at": "2026-11-14T20:55:37.770788+00:00",
  "id": 4,
  "last_error": null,
  "provider_message_id": "1794689738006415407.6415407@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "taylanika@gmail.com",
  "sent_at": "2026-11-14T20:55:39.635479+00:00",
  "status": "sent",
  "subject": "New task comment: New task system online",
  "task_notification_id": 4
}
```

#### Prod-only — id=5

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Check out the tasks\n\nOpen task: https://central.innhopp.com/tasks?taskId=5",
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "id": 5,
  "last_error": null,
  "provider_message_id": "1794691352022894940.22894940@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-14T21:22:34.187287+00:00",
  "status": "sent",
  "subject": "Task assigned: Check out the tasks",
  "task_notification_id": 5
}
```

#### Prod-only — id=6

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou added a comment to your task.\n\nEvent: Ancient Lines\nTask: Check out the tasks\n\nComment:\nCome on bro get on with it\n\nOpen task: https://central.innhopp.com/tasks?taskId=5",
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "id": 6,
  "last_error": null,
  "provider_message_id": "1794691370028896654.28896654@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-14T21:22:51.466183+00:00",
  "status": "sent",
  "subject": "New task comment: Check out the tasks",
  "task_notification_id": 6
}
```

#### Prod-only — id=7

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Packing mat and tent\n\nOpen task: https://central.innhopp.com/tasks?taskId=6",
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "id": 7,
  "last_error": null,
  "provider_message_id": "1795229360206469501.206469501@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T02:49:22.03533+00:00",
  "status": "sent",
  "subject": "Task assigned: Packing mat and tent",
  "task_notification_id": 7
}
```

#### Prod-only — id=8

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)\n\nOpen task: https://central.innhopp.com/tasks?taskId=7",
  "created_at": "2026-11-21T02:50:35.174241+00:00",
  "id": 8,
  "last_error": null,
  "provider_message_id": "1795229435397022008.397022008@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T02:50:37.148059+00:00",
  "status": "sent",
  "subject": "Task assigned: Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)",
  "task_notification_id": 8
}
```

#### Prod-only — id=9

```json
{
  "attempt_count": 1,
  "body": "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Talk to David from Maco for the contact for the landing area\n\nOpen task: https://central.innhopp.com/tasks?taskId=8",
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "id": 9,
  "last_error": null,
  "provider_message_id": "1795229512580966667.580966667@smtp.mail.eu-west-1.awsapps.com",
  "recipient_email": "sdfano220@gmail.com",
  "sent_at": "2026-11-21T02:51:54.27693+00:00",
  "status": "sent",
  "subject": "Task assigned: Talk to David from Maco for the contact for the landing area",
  "task_notification_id": 9
}
```

#### Changed — id=1

- `attempt_count`: 1 → 0
- `body`: "Hans Jørgen Monsen assigned this task to you.\n\nEvent: Ancient Lines\nTask: Test task\n\nOpen task: https://central.innhopp.com/tasks?taskId=2" → "Antonis Loizou assigned this task to you.\n\nEvent: Ancient Lines\nTask: Packing tent\n\nOpen task: http://localhost:5173/tasks?taskId=11"
- `created_at`: "2026-11-14T19:46:53.098139+00:00" → "2026-11-18T14:14:01.271333+00:00"
- `provider_message_id`: "1794685613346250811.346250811@smtp.mail.eu-west-1.awsapps.com" → null
- `recipient_email`: "antonis.loizou@gmail.com" → "sdfano220@gmail.com"
- `sent_at`: "2026-11-14T19:46:55.599486+00:00" → null
- `status`: "sent" → "queued"
- `subject`: "Task assigned: Test task" → "Task assigned: Packing tent"

### `public.task_notifications`

Local-only: 0; prod-only: 10; changed: 1.

#### Prod-only — id=10

```json
{
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "id": 10,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 13,
  "source_audit_event_id": 25,
  "task_id": 9
}
```

#### Prod-only — id=11

```json
{
  "created_at": "2026-11-21T15:38:25.329339+00:00",
  "id": 11,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 26,
  "task_id": 10
}
```

#### Prod-only — id=2

```json
{
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "id": 2,
  "kind": "assigned",
  "read_at": "2026-11-14T20:46:55.720506+00:00",
  "recipient_account_id": 17,
  "source_audit_event_id": 4,
  "task_id": 3
}
```

#### Prod-only — id=3

```json
{
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "id": 3,
  "kind": "assigned",
  "read_at": "2026-11-14T20:58:42.945993+00:00",
  "recipient_account_id": 13,
  "source_audit_event_id": 7,
  "task_id": 4
}
```

#### Prod-only — id=4

```json
{
  "created_at": "2026-11-14T20:55:37.770788+00:00",
  "id": 4,
  "kind": "commented",
  "read_at": "2026-11-14T20:58:42.945993+00:00",
  "recipient_account_id": 13,
  "source_audit_event_id": 8,
  "task_id": 4
}
```

#### Prod-only — id=5

```json
{
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "id": 5,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 12,
  "task_id": 5
}
```

#### Prod-only — id=6

```json
{
  "created_at": "2026-11-14T21:22:49.962499+00:00",
  "id": 6,
  "kind": "commented",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 13,
  "task_id": 5
}
```

#### Prod-only — id=7

```json
{
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "id": 7,
  "kind": "assigned",
  "read_at": null,
  "recipient_account_id": 47,
  "source_audit_event_id": 18,
  "task_id": 6
}
```

#### Prod-only — id=8

```json
{
  "created_at": "2026-11-21T02:50:35.174241+00:00",
  "id": 8,
  "kind": "assigned",
  "read_at": "2026-11-21T13:10:54.475703+00:00",
  "recipient_account_id": 47,
  "source_audit_event_id": 19,
  "task_id": 7
}
```

#### Prod-only — id=9

```json
{
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "id": 9,
  "kind": "assigned",
  "read_at": "2026-11-21T13:12:23.212168+00:00",
  "recipient_account_id": 47,
  "source_audit_event_id": 20,
  "task_id": 8
}
```

#### Changed — id=1

- `created_at`: "2026-11-14T19:46:53.098139+00:00" → "2026-11-18T14:14:01.271333+00:00"
- `read_at`: "2026-11-14T19:47:02.311006+00:00" → null
- `recipient_account_id`: 1 → 47
- `source_audit_event_id`: 3 → 1016
- `task_id`: 2 → 11

### `public.tasks`

Local-only: 2; prod-only: 8; changed: 2.

#### Local-only — id=11

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-18T14:14:01.271333+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Would be nice to have shade and a space to psack off the sand \n\nmin 10 x 5 m",
  "due_on": null,
  "event_id": 59,
  "id": 11,
  "title": "Packing tent",
  "updated_at": "2026-11-18T14:14:01.271333+00:00",
  "updated_by_account_id": 1
}
```

#### Local-only — id=12

```json
{
  "assignee_account_id": 1,
  "assignee_display_name_snapshot": "Antonis Loizou",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-18T14:18:05.549596+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "An agenda for the staff meeting and checklist for the next day",
  "due_on": null,
  "event_id": 59,
  "id": 12,
  "title": "Make a daily task list for the staff meeiting",
  "updated_at": "2026-11-18T14:18:05.549596+00:00",
  "updated_by_account_id": 1
}
```

#### Prod-only — id=1

```json
{
  "assignee_account_id": 1,
  "assignee_display_name_snapshot": "Antonis Loizou",
  "completed_at": "2026-11-21T02:46:36.900974+00:00",
  "completed_by_account_id": 1,
  "completed_by_display_name_snapshot": "Antonis Loizou",
  "created_at": "2026-11-14T19:31:41.832794+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Talk to the guy and get permission",
  "due_on": null,
  "event_id": 59,
  "id": 1,
  "title": "Get permission for trike landing area in Salento",
  "updated_at": "2026-11-21T02:46:36.900974+00:00",
  "updated_by_account_id": 1
}
```

#### Prod-only — id=2

```json
{
  "assignee_account_id": 1,
  "assignee_display_name_snapshot": "Antonis Loizou",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-14T19:46:53.098139+00:00",
  "created_by_account_id": 17,
  "created_by_display_name_snapshot": "Hans Jørgen Monsen",
  "deleted_at": "2026-11-14T19:49:01.175679+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "Testing",
  "description": "wsd",
  "due_on": null,
  "event_id": 59,
  "id": 2,
  "title": "Test task",
  "updated_at": "2026-11-14T19:49:01.175679+00:00",
  "updated_by_account_id": 1
}
```

#### Prod-only — id=3

```json
{
  "assignee_account_id": 17,
  "assignee_display_name_snapshot": "Hans Jørgen Monsen",
  "completed_at": "2026-11-14T20:47:06.507577+00:00",
  "completed_by_account_id": 17,
  "completed_by_display_name_snapshot": "Hans Jørgen Monsen",
  "created_at": "2026-11-14T19:48:50.494613+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": "2026-11-21T02:48:37.199173+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "test",
  "description": "I just implemented it, would love feedback",
  "due_on": null,
  "event_id": 59,
  "id": 3,
  "title": "Check out the new task system",
  "updated_at": "2026-11-21T02:48:37.199173+00:00",
  "updated_by_account_id": 1
}
```

#### Prod-only — id=4

```json
{
  "assignee_account_id": 13,
  "assignee_display_name_snapshot": "Tayla Lima",
  "completed_at": "2026-11-14T20:59:24.552962+00:00",
  "completed_by_account_id": 13,
  "completed_by_display_name_snapshot": "Tayla Lima",
  "created_at": "2026-11-14T20:54:35.06552+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": "2026-11-21T02:47:04.037193+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "tets",
  "description": "Check it out",
  "due_on": "2026-11-14",
  "event_id": 59,
  "id": 4,
  "title": "New task system online",
  "updated_at": "2026-11-21T02:47:04.037193+00:00",
  "updated_by_account_id": 1
}
```

#### Prod-only — id=5

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-14T21:22:31.751615+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": "2026-11-21T02:48:24.119124+00:00",
  "deleted_by_account_id": 1,
  "deleted_by_display_name_snapshot": "Antonis Loizou",
  "deleted_reason": "test",
  "description": "Testing",
  "due_on": null,
  "event_id": 59,
  "id": 5,
  "title": "Check out the tasks",
  "updated_at": "2026-11-21T02:48:24.119124+00:00",
  "updated_by_account_id": 1
}
```

#### Prod-only — id=6

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-21T02:49:19.956943+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Would be nice to have shade and a space to pack off the sand",
  "due_on": null,
  "event_id": 59,
  "id": 6,
  "title": "Packing mat and tent",
  "updated_at": "2026-11-21T02:49:19.956943+00:00",
  "updated_by_account_id": 1
}
```

#### Prod-only — id=8

```json
{
  "assignee_account_id": 47,
  "assignee_display_name_snapshot": "Stefano Egusquiza",
  "completed_at": "2026-11-21T13:12:43.693681+00:00",
  "completed_by_account_id": 47,
  "completed_by_display_name_snapshot": "Stefano Egusquiza",
  "created_at": "2026-11-21T02:51:52.344719+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "One more attempt to reach the landowner",
  "due_on": null,
  "event_id": 59,
  "id": 8,
  "title": "Talk to David from Maco for the contact for the landing area",
  "updated_at": "2026-11-21T13:12:43.693681+00:00",
  "updated_by_account_id": 47
}
```

#### Prod-only — id=9

```json
{
  "assignee_account_id": 13,
  "assignee_display_name_snapshot": "Tayla Lima",
  "completed_at": null,
  "completed_by_account_id": null,
  "completed_by_display_name_snapshot": null,
  "created_at": "2026-11-21T15:31:01.653747+00:00",
  "created_by_account_id": 1,
  "created_by_display_name_snapshot": "Antonis Loizou",
  "deleted_at": null,
  "deleted_by_account_id": null,
  "deleted_by_display_name_snapshot": null,
  "deleted_reason": null,
  "description": "Need to remember to ask",
  "due_on": null,
  "event_id": 59,
  "id": 9,
  "title": "Get the contact for Antelmo",
  "updated_at": "2026-11-21T15:31:01.653747+00:00",
  "updated_by_account_id": 1
}
```

#### Changed — id=10

- `assignee_account_id`: 47 → 1
- `assignee_display_name_snapshot`: "Stefano Egusquiza" → "Antonis Loizou"
- `created_at`: "2026-11-21T15:38:25.329339+00:00" → "2026-11-14T19:27:26.924195+00:00"
- `deleted_at`: null → "2026-11-18T14:14:27.471171+00:00"
- `deleted_by_account_id`: null → 1
- `deleted_by_display_name_snapshot`: null → "Antonis Loizou"
- `deleted_reason`: null → "testing"
- `description`: "Get it" → "fdsa"
- `title`: "Contact for El Ocaso 'Doña Gladys' Lunch" → "ds"
- `updated_at`: "2026-11-21T15:38:25.329339+00:00" → "2026-11-18T14:14:27.471171+00:00"

#### Changed — id=7

- `assignee_account_id`: 47 → 1
- `assignee_display_name_snapshot`: "Stefano Egusquiza" → "Antonis Loizou"
- `completed_at`: "2026-11-21T13:12:14.596436+00:00" → "2026-11-14T19:26:38.207142+00:00"
- `completed_by_account_id`: 47 → 1
- `completed_by_display_name_snapshot`: "Stefano Egusquiza" → "Antonis Loizou"
- `created_at`: "2026-11-21T02:50:35.174241+00:00" → "2026-11-14T18:50:19.020862+00:00"
- `description`: "We are budgeting 30mins" → "Get in contact with Hector and arrange things"
- `title`: "Ask Carlos about how long the horses take from hotel to bus meeting point (restaurant/tower/alien area)" → "Get permission for the trike takeoff"
- `updated_at`: "2026-11-21T13:12:14.596436+00:00" → "2026-11-14T19:26:38.207142+00:00"
- `updated_by_account_id`: 47 → 1

