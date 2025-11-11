# Innhopp Central Backend

This Go service provides the core REST API for the Innhopp Central platform. It is implemented with the [Chi](https://github.com/go-chi/chi) router, persists data in PostgreSQL, and is structured into domain-focused modules to support rapid iteration on jump operations.

## Features

- Modular HTTP routing for authentication, event operations, participant management, crew RBAC, and logistics.
- Automatic bootstrapping of the core PostgreSQL schema for seasons, events, manifests, participant profiles, crew assignments, and gear assets.
- JSON APIs for managing seasons/events/manifests, participant records, crew assignments, and gear tracking.
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

For Railway deployments set `DATABASE_URL` to the connection string provided by the managed PostgreSQL add-on and map the service port to `$PORT`.

## Database Schema

On startup the server creates these tables if they do not already exist:

- `seasons` – defines the operational season calendar.
- `events` – jump events linked to a season with start/end timestamps.
- `manifests` – scheduled aircraft loads for an event.
- `participant_profiles` – canonical roster of all flyers and staff.
- `crew_assignments` – role assignments for a participant on a manifest.
- `gear_assets` – tracked gear inventory with inspection status.

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
| GET | `/api/events/manifests` | List manifests |
| POST | `/api/events/manifests` | Create a manifest |
| GET | `/api/events/manifests/{id}` | Retrieve a manifest |
| GET | `/api/participants/profiles` | List participant profiles |
| POST | `/api/participants/profiles` | Create a participant profile |
| GET | `/api/rbac/crew-assignments` | List crew assignments |
| POST | `/api/rbac/crew-assignments` | Create a crew assignment |
| GET | `/api/logistics/gear-assets` | List gear assets |
| POST | `/api/logistics/gear-assets` | Create a gear asset |

### Request & Response Notes

- All timestamps in request payloads must be RFC3339 strings except for season dates which use `YYYY-MM-DD`.
- Endpoints respond with JSON and enforce strict payload validation (unknown fields are rejected).
- Foreign key constraints ensure referenced seasons, events, manifests, and participants must already exist.

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
