# Innhopp Central Backend

This Go service provides the core REST API for the Innhopp Central platform. It is implemented with the [Chi](https://github.com/go-chi/chi) router, persists data in PostgreSQL, and is structured into domain-focused modules to support rapid iteration on jump operations.

## Features

- Modular HTTP routing for authentication, event operations, participant management, crew RBAC, and logistics.
- Budget module for event-level cost/revenue planning, parameters, scenario gating, and line-item editing.
- Automatic bootstrapping of the core PostgreSQL schema for seasons, events, manifests, participant profiles, registrations, payment records, crew assignments, and gear assets.
- JSON APIs for managing seasons/events/manifests, participant records, registration lifecycles, payment/activity records, crew assignments, and gear tracking.
- Health check endpoint for uptime monitoring and Chi middleware for structured logging and request tracing.

## Requirements

- Go 1.22+
- PostgreSQL 13+ (local development tested against default Docker image)

## Configuration

The service uses the following environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable` |
| `PORT` | HTTP listen port | `8080` |
| `BUDGETS_V1` | Enable budget endpoints (`false` disables mount) | `true` |

For Railway deployments set `DATABASE_URL` to the connection string provided by the managed PostgreSQL add-on and map the service port to `$PORT`.

## Database Schema

On startup the server creates these tables if they do not already exist:

- `seasons` – defines the operational season calendar.
- `events` – jump events linked to a season with start/end timestamps.
- `events` also store commercial registration settings such as public slugs, registration windows, payment deadlines, pricing, currency, and deposit thresholds.
- `event_participants` – associations between events and participant profiles.
- `event_innhopps` – ordered jump sequences planned within an event.
- `manifests` – scheduled aircraft loads for an event.
- `participant_profiles` – canonical roster of all flyers and staff.
- `event_registrations` – participant-to-event lifecycle records with deadlines, notes, and ownership.
- `registration_payments` – ledger entries for deposit, main invoice, refund, and manual adjustments per registration.
- `registration_activity` – internal timeline entries attached to a registration.
- `email_templates` – reusable subject/body templates for event communications.
- `email_campaigns` – manual or automated campaign executions with stored audience filters.
- `email_deliveries` – rendered outbound messages logged per recipient and campaign.
- `crew_assignments` – role assignments for a participant on a manifest.
- `gear_assets` – tracked gear inventory with inspection status.
- `event_budgets` – one budget per event, with base currency (EUR default), workflow status, and notes.
- `budget_sections` – normalized section groupings for budget line items.
- `budget_line_items` – editable budget costs, including per-item currency (`cost_currency`).
- `budget_currencies` – event-selected currency codes used for line-item entries (live FX converted to base currency in summaries).
- `budget_assumptions` – numeric parameters for load sizing, markup, optional tip, and drift.
- `budget_scenarios` – saved scenario snapshots.

## Running Locally

1. Start PostgreSQL (for example using Docker):

   ```bash
   docker run --name innhopp-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=innhopp -p 5432:5432 -d postgres:15
   ```

2. Export the connection string if you are not using the default:

   ```bash
   export DATABASE_URL="postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable"
   ```

3. Download dependencies (once per environment):

   ```bash
   go mod tidy
   ```

4. Run the server:

   ```bash
   go run ./...
   ```

5. Interact with the API (examples use `httpie` but `curl` works as well):

   ```bash
   http POST :8080/api/participants/profiles full_name="Aviator Ada" email="ada@example.com"
   http POST :8080/api/events/seasons name="Winter Ops" starts_on="2024-01-10" ends_on="2024-03-01"
   http POST :8080/api/events/events season_id:=1 name="Ice Landing" location="Tromsø" starts_at="2024-02-05T09:00:00Z"
   http POST :8080/api/events/manifests event_id:=1 load_number:=1 scheduled_at="2024-02-05T09:30:00Z"
   http POST :8080/api/rbac/crew-assignments manifest_id:=1 participant_id:=1 role="Jump Master"
   http POST :8080/api/logistics/gear-assets name="Main Rig" serial_number="RIG-001" status="available"
   ```

## API Overview

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Service health probe |
| POST | `/api/auth/sessions` | Bootstrap a participant session by email |
| GET | `/api/events/seasons` | List seasons |
| POST | `/api/events/seasons` | Create a season |
| GET | `/api/events/seasons/{id}` | Retrieve a season |
| GET | `/api/events/events` | List events |
| POST | `/api/events/events` | Create an event |
| GET | `/api/events/events/{id}` | Retrieve an event |
| PUT | `/api/events/events/{id}` | Update an event |
| DELETE | `/api/events/events/{id}` | Remove an event |
| GET | `/api/events/manifests` | List manifests |
| POST | `/api/events/manifests` | Create a manifest |
| GET | `/api/events/manifests/{id}` | Retrieve a manifest |
| GET | `/api/participants/profiles` | List participant profiles |
| POST | `/api/participants/profiles` | Create a participant profile |
| GET | `/api/registrations/events/{eventID}` | List registrations for an event |
| POST | `/api/registrations/events/{eventID}` | Create a registration for an event |
| GET | `/api/registrations/public/events/{slug}` | Load public registration page data for an event slug |
| POST | `/api/registrations/public/events/{slug}/register` | Submit a public registration and create default payment rows |
| GET | `/api/registrations/{registrationID}` | Retrieve one registration with payments and activity |
| PUT | `/api/registrations/{registrationID}` | Update registration metadata |
| POST | `/api/registrations/{registrationID}/status` | Transition a registration status |
| POST | `/api/registrations/{registrationID}/payments` | Create a payment ledger row |
| PUT | `/api/registrations/payments/{paymentID}` | Update a payment ledger row |
| POST | `/api/registrations/{registrationID}/activity` | Append an internal activity entry |
| GET | `/api/comms/templates` | List email templates |
| POST | `/api/comms/templates` | Create an email template |
| GET | `/api/comms/events/{eventID}/audience-preview` | Preview comms recipients for an event with status/payment filters |
| GET | `/api/comms/events/{eventID}/campaigns` | List campaign history for an event |
| POST | `/api/comms/campaigns` | Create and send a manual campaign |
| GET | `/api/comms/campaigns/{campaignID}` | Retrieve one campaign with delivery log |
| GET | `/api/rbac/crew-assignments` | List crew assignments |
| POST | `/api/rbac/crew-assignments` | Create a crew assignment |
| GET | `/api/logistics/gear-assets` | List gear assets |
| POST | `/api/logistics/gear-assets` | Create a gear asset |
| GET | `/api/budgets/events/{eventID}` | Get event budget |
| POST | `/api/budgets/events/{eventID}` | Create event budget |
| GET | `/api/budgets/{budgetID}/summary` | Build computed budget summary (base EUR) |
| GET | `/api/budgets/{budgetID}/line-items` | List budget line items |
| POST | `/api/budgets/{budgetID}/line-items` | Create budget line item |
| PUT | `/api/budgets/{budgetID}/line-items/{lineItemID}` | Update budget line item |
| DELETE | `/api/budgets/{budgetID}/line-items/{lineItemID}` | Delete budget line item |
| GET | `/api/budgets/{budgetID}/assumptions` | Get budget parameters |
| PUT | `/api/budgets/{budgetID}/assumptions` | Update budget parameters |
| GET | `/api/budgets/{budgetID}/currencies` | List selected currencies with live FX rates |
| PUT | `/api/budgets/{budgetID}/currencies` | Update selected currencies |

### Request & Response Notes

- All timestamps in request payloads must be RFC3339 strings except for season dates which use `YYYY-MM-DD`.
- Endpoints respond with JSON and enforce strict payload validation (unknown fields are rejected).
- Foreign key constraints ensure referenced seasons, events, manifests, and participants must already exist.
- The registration backbone enforces one active registration per participant per event; cancelled or expired registrations can be recreated.
- Public registration links only work for events with `public_registration_enabled=true`; the backend also respects `registration_open_at` and rejects registrations after the event start time.
- Public registrations match existing participants by normalized email or create a new participant profile, then create deposit/main invoice payment rows from the event commercial settings.
- The first comms slice renders templates and logs per-recipient deliveries inside the database; it does not yet integrate an SMTP/provider transport or background scheduler.
- Budget workflow gate: moving budget status to `review` or `approved` is blocked when `worst_case_gate.margin_without_tip` is negative.
- Budget formula notes:
  - `target_markup_percent` and `optional_tip_percent` are independent.
  - Optional tip is post-event and always shown separately from guaranteed revenue/margin.
  - `cost_drift_percent` applies before markup.
  - Event base currency defaults to `EUR`; line items can be stored in selected foreign currencies and are converted to base using live FX on summary build.

## Testing

Run a compile check across all packages:

```bash
go build ./...
```

A running PostgreSQL instance accessible through `DATABASE_URL` is required to exercise the HTTP endpoints end-to-end.

## Deployment on Railway

1. Add a new service from this repository and select "Go" as the build preset.
2. Provision a PostgreSQL add-on and copy the provided `DATABASE_URL` into the service variables.
3. Railway automatically sets the `$PORT` environment variable; no further configuration is required.
4. Redeploy to apply the variables—the service will start listening on the assigned port.
