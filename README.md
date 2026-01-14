# Innhopp Central

Full-stack operations hub for planning and running innhopp events. The frontend is a React + TypeScript (Vite) single-page app; the backend is a Go service with PostgreSQL for persistence, RBAC enforcement, and OIDC login.

## Vision
Create a single source of truth for operational data that keeps the team synchronized across planning, execution, and post-event follow-up while maintaining high standards for safety and customer satisfaction.

## Current scope (MVP)
- Operations planning for seasons, events, innhopps, manifests, and landing zones.
- Participant roster and event assignments, including crew roles per manifest.
- Logistics tracking for transports, vehicles, accommodations, meals, and ad-hoc logistics items.
- Safety and compliance fields on events/innhopps (NOTAM, risk assessment, safety precautions).
- RBAC-backed login sessions (OIDC) with seeded roles for core operational duties.

## Not yet implemented
- Payments, waivers, certifications, and health declarations.
- Automated notifications, check-in flows, or public driver route pages.
- Analytics dashboards beyond raw data access.

## User roles

| Role | Primary responsibilities | Data access highlights |
| --- | --- | --- |
| **Admin** | System configuration, user provisioning, billing, oversight | Full access to all modules and audit logs |
| **Staff** | Day-to-day ops, customer support, documentation | Manifests, participant records, logistics, support tickets |
| **Jump Master** | Go/no-go, safety decisions | Mission briefs, weather intel, gear status, incident reports |
| **Jump Leader** | Leads assigned groups and debriefs | Assigned manifests, readiness, gear allocations, notes |
| **Ground Crew** | Landing zone readiness, transport, recovery | LZ checklists, transport schedules, real-time updates |
| **Driver** | Executes transport routes | Transport assignments and schedules |
| **Packer** | Parachute packing and maintenance logs | Gear assets, packing queues, maintenance notes |
| **Participant** | Participates in events | Profile, event assignments, schedules |

RBAC ensures each user only sees the modules and actions needed for their duties; sensitive operations are logged for compliance.

## Workflows
1. **Event planning**: Create seasons/events, define innhopps with landing and safety details, and publish manifests.
2. **Participant coordination**: Maintain the roster, attach participants to events, and assign crew roles per manifest.
3. **Logistics tracking**: Capture transports, vehicles, accommodations, meals, and other logistics items per event.

## What you can do today
- Build seasons and events, including detailed innhopp plans with landing areas, NOTAM notes, risk mitigation, and hospital/boat coverage metadata.
- Register airfields, attach them to events, and manage manifests with capacity, staff slots, and participant assignments.
- Maintain a participant roster (roles, experience, contacts), add people to events/manifests, and track crew roles such as Jump Master/Leader, Ground Crew, Driver, and Packer.
- Coordinate transports, vehicles, accommodations, meals, and other logistics items per operation.
- Authenticate via OIDC (authorization code flow), persist sessions in secure cookies, and enforce role-based permissions seeded on startup (Admin, Staff, Jump Master, Jump Leader, Ground Crew, Driver, Packer, Participant). Set `DEV_ALLOW_ALL=true` to bypass auth locally.
- Use the frontend pages for login, events, manifests, participants, logistics, seasons, innhopp details, and airfield details (see `frontend/src/pages/` and `frontend/src/components/Layout.tsx` for the routes).

## Repository layout
- `backend/` – Go/Chi REST API with OIDC login, session management, RBAC, and PostgreSQL schema bootstrapping (seasons, events, innhopps, manifests, airfields, participants, crew assignments, logistics). See `backend/README.md` for full endpoint docs.
- `frontend/` – Vite React SPA that consumes the backend APIs; includes Google Identity button support for the login page and a navigation shell for events/participants/logistics.
- `index.html` – Static Google Identity demo for GitHub Pages; `events.html` and `events.css` are legacy static prototypes.

## Local development
Prereqs: Go 1.22+, Node 18+ (or current LTS), npm, and Docker (for local PostgreSQL).

1) Start Postgres (default DB and password match the backend defaults):
```bash
docker run --name innhopp-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=innhopp -p 5432:5432 -d postgres:15
```

2) Run the backend:
```bash
cd backend
# optional: export DATABASE_URL="postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable"
# for local dev without OIDC, export DEV_ALLOW_ALL=true
# set SESSION_SECRET to a strong value; SESSION_COOKIE_SECURE=true when using HTTPS
go mod tidy
go run ./...
# health check: http://localhost:8080/api/health
```

3) Run the frontend:
```bash
cd frontend
# optional: echo "VITE_API_BASE_URL=http://localhost:8080/api" > .env
# set VITE_GOOGLE_CLIENT_ID for the login button
npm install
npm run dev
# app: http://localhost:5173 (Vite proxies /api to :8080)
```

## Configuration

Backend environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable` |
| `PORT` | HTTP listen port | `8080` |
| `SESSION_SECRET` | HMAC secret for session cookies | `dev-insecure-session-secret` (development only) |
| `SESSION_COOKIE_SECURE` | Set to `true` to mark cookies as secure | `false` |
| `DEV_ALLOW_ALL` | If `true`, bypasses auth/RBAC (local use only) | `false` |
| `OIDC_ISSUER` | OIDC issuer URL | – |
| `OIDC_CLIENT_ID` | OIDC client ID | – |
| `OIDC_CLIENT_SECRET` | OIDC client secret (if required) | – |
| `OIDC_REDIRECT_URL` | Redirect URL registered with the OIDC provider | – |

Frontend environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | API base URL; leave empty to use `/api` (proxied in dev) | `/api` |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity client ID for the login page button | placeholder value |

## API and UI references
- Backend endpoints for seasons, events, innhopps, manifests, airfields, participants, crew assignments, logistics transports, and auth are documented in `backend/README.md`.
- Frontend routes include `/login`, `/events`, `/events/:eventId`, `/events/:eventId/innhopps/:innhoppId`, `/manifests`, `/manifests/:manifestId`, `/participants`, `/participants/:participantId`, `/logistics`, `/airfields/:airfieldId`, plus creation flows for seasons, events, manifests, and participants.
