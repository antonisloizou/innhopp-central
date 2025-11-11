# Innhopp Central Backend

This Go service provides a minimal REST API for managing users, events, and role assignments backed by PostgreSQL. It is intended as the starting point for the Innhopp Central platform and is deployable to Railway.

## Features

- Health check endpoint for uptime monitoring.
- CRUD operations for users and events.
- Canonical list of the event roles defined in the main project README.
- Assign and remove user roles on a per-event basis.
- Automatic bootstrapping of the database schema and default role data on startup.

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

- `users` – stores name, email, and creation timestamp.
- `events` – stores event metadata including start date.
- `roles` – seeded with the eight roles defined in the main project README.
- `event_user_roles` – join table linking users, events, and assigned roles.

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
   http POST :8080/api/users name="Aviator Ada" email="ada@example.com"
   http POST :8080/api/events name="Arctic Jump" start_date="2024-08-01T09:00:00Z"
   http POST :8080/api/events/1/roles user_id:=1 role="Jump Master"
   http GET :8080/api/events/1/roles
   ```

## API Overview

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Service health probe |
| GET | `/api/roles` | List canonical role names |
| GET | `/api/users` | List users |
| POST | `/api/users` | Create a user |
| GET | `/api/users/{id}` | Retrieve a user |
| PUT | `/api/users/{id}` | Update a user |
| DELETE | `/api/users/{id}` | Delete a user |
| GET | `/api/events` | List events |
| POST | `/api/events` | Create an event |
| GET | `/api/events/{id}` | Retrieve an event |
| PUT | `/api/events/{id}` | Update an event |
| DELETE | `/api/events/{id}` | Delete an event |
| GET | `/api/events/{id}/roles` | List role assignments for an event |
| POST | `/api/events/{id}/roles` | Assign a role to a user for an event |
| DELETE | `/api/events/{id}/roles` | Remove a role assignment from a user |

### Request & Response Notes

- `start_date` must be an ISO-8601 timestamp (RFC3339) when creating or updating an event.
- Role assignment endpoints expect a JSON body with `user_id` and `role` (case-insensitive).
- Duplicate role assignments are ignored to keep the operation idempotent.

## Testing

Run all Go tests (ensures the code compiles):

```bash
go test ./...
```

A running PostgreSQL instance accessible through `DATABASE_URL` is required for integration testing.

## Deployment on Railway

1. Add a new service from this repository and select "Go" as the build preset.
2. Provision a PostgreSQL add-on and copy the provided `DATABASE_URL` into the service variables.
3. Railway automatically sets the `$PORT` environment variable; no further configuration is required.
4. Redeploy to apply the variables—the service will start listening on the assigned port.

