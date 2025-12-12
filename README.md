# Innhopp Central Data Management System

The Innhopp Central platform provides a unified data management hub for registration, operations, safety oversight, customer logistics, and post-event reporting.

## Vision

Create a single source of truth for all operational data that keeps the team synchronized across planning, execution, and follow-up while maintaining the highest standards for safety, compliance, and customer satisfaction.

## Core Capabilities

- **Operations Planning**: Manage season calendars, event templates, and jump manifests with aircraft, boat, and landing zone requirements.
- **Participant Lifecycle**: Track registrations, payments, waivers, certifications, gear checks and health declarations for individual jumpers and groups.
- **Logistics Coordination**: Assign transport legs, gear, and accommodation; automate notifications for check-in, briefing schedules, and packing lists.
- **Driver Route Visibility**: Provide drivers with a read-only page that outlines location timings and detailed descriptions of the routes they must complete.
- **Safety & Compliance**: Centralize NOTAMs, risk assessments,, and regulatory filings.
- **Crew Management**: Schedule staff, capture availability, and ensure required roles are covered for each operation.
- **Analytics & Reporting**: Generate dashboards on jump volume, customer demographics, gear utilization, and safety metrics.

## User Roles

| Role | Primary Responsibilities | Data Access Highlights |
| --- | --- | --- |
| **Admin** | System configuration, user provisioning, billing, regulatory oversight | Full access to all modules, audit logs, and configuration settings |
| **Staff** | Day-to-day operations support, customer service, documentation | Access to manifests, participant records, logistics, and support tickets |
| **Jump Master** | Overall command of jump operations, safety decisions, and go/no-go authority | Mission briefs, weather intel, gear status, incident reports, crew rosters |
| **Jump Leader** | Leads specific jump groups, ensures compliance with briefings, conducts debriefs | Assigned manifests, participant readiness, gear allocations, debrief notes |
| **Ground Crew** | Coordinates landing zone readiness, transport, and recovery | LZ checklists, transport schedules, real-time updates, incident capture |
| **Driver** | Executes transport routes between jump sites and staging areas | Read-only route pages with location timings and detailed segment descriptions |
| **Packer** | Manages parachute packing, gear maintenance, and inspection logs | Packing queues, gear history, maintenance records |
| **Participant** | Registers for events, completes paperwork, receives briefs and updates | Personal profile, waiver status, event schedule, payment receipts |

Role-based access control (RBAC) ensures each user sees only the modules and actions required for their duties, while all sensitive operations are logged for compliance.

## Data Model Overview

Key domain entities include:

- **Season** → groups multiple events with shared logistics budgets and reporting targets.
- **Event** → defines a specific innhopp experience with schedule, transport, aircraft, and landing zone metadata.
- **Manifest** → connects participants, crew, gear, and timing for each jump wave.
- **Participant Profile** → stores certifications, medical declarations, payments, and waiver acknowledgements.
- **Crew Assignment** → links staff roles and availability to events and manifests.
- **Gear Asset** → tracks rigs, wingsuits, helmets, emergency equipment, and maintenance history.
- **Incident Report** → captures safety events, near-misses, and resolution workflows.
- **Communication Log** → records notifications, emails, and SMS updates for compliance.

## Integrations

- **Weather & Aviation Feeds**: Import METAR/TAF data and NOTAMs for planning and live monitoring.
- **Payment Processing**: Connect with Nordic payment gateways for secure transactions and refunds.
- **Digital Waivers**: Sync signed waivers from partner e-sign platforms.
- **Messaging**: Push operational updates via SMS, email, and in-app notifications.
- **Navigation Services**: Surface route guidance by integrating driver itineraries with Google Maps and Waze for real-time traffic-aware navigation.
- **Accounting**: Export financial summaries to bookkeeping systems for reconciliation.

## Workflows

1. **Event Planning**
   - Admin or Staff clone an event template.
   - Logistics requirements auto-populate; crew availability requests are dispatched.
   - Safety review ensures gear, weather minima, and transport constraints are satisfied before publishing.
2. **Participant Intake**
   - Participants register online, complete waivers, upload certificates, and pay deposits.
   - Staff review flagged items (e.g., expired licenses) and approve or request additional info.
3. **Operational Execution**
   - Jump Master confirms go/no-go.
   - Jump Leaders brief participants; Ground Crew verifies landing zone readiness.
   - Packers process gear queues; live updates broadcast to all roles.
4. **Post-Event Closeout**
   - Incident reports finalized and shared with safety board.
   - Financials reconciled; feedback surveys sent to participants.
   - Analytics dashboards update with performance and safety metrics.

## Technology Stack (Proposed)

- **Frontend**: React with TypeScript, mobile-friendly layout for on-site tablets.
- **Backend**: Minimal Go service (see `backend/`) providing REST APIs for user and event role management.
- **Database**: PostgreSQL with PostGIS for landing zone geodata.
- **Authentication**: OAuth2 / OpenID Connect with MFA support.
- **Infrastructure**: Containerized deployment (Docker/Kubernetes), CI/CD pipelines, Infrastructure-as-Code.
- **Observability**: Structured logging, metrics, and alerting via Prometheus/Grafana.

## Security & Compliance

- Enforce MFA for privileged roles.
- Encrypt data in transit (TLS 1.2+) and at rest.
- Implement data retention policies aligned with European aviation and privacy regulations (GDPR).
- Provide audit trails and immutable logs for safety-critical actions.
- Conduct regular penetration tests and disaster recovery drills.

## Roadmap

1. **MVP (Phase 1)**
   - User authentication & RBAC
   - Event calendar & manifest management
   - Participant registration & digital waivers
   - Basic logistics tracking and notifications
2. **Operational Excellence (Phase 2)**
   - Incident management workflows
   - Gear maintenance scheduling with QR code scanning
   - Real-time weather dashboards and NOTAM ingestion
3. **Insights & Growth (Phase 3)**
   - Analytics suite with KPI dashboards
   - Partner portal for aircraft/boat operators
    - API for third-party travel and booking integrations

## Local development

Prereqs: Go 1.22+, Node 18+ (or current LTS), npm, and Docker (for local Postgres). Backend lives in `backend/`, frontend in `frontend/`.

Backend:

```bash
docker run --name innhopp-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=innhopp -p 5432:5432 -d postgres:15
cd backend
# optional if you change defaults: export DATABASE_URL="postgres://postgres:postgres@localhost:5432/innhopp?sslmode=disable"
go mod tidy
go run ./...
# health check: http://localhost:8080/api/health
```

Frontend:

```bash
cd frontend
cp .env.example .env
# set VITE_GOOGLE_CLIENT_ID in .env
npm install
npm run dev
# app: http://localhost:5173
```

Use `httpie` or `curl` to hit APIs once the backend is up, e.g. `http POST :8080/api/participants/profiles full_name="Aviator Ada" email="ada@example.com"`.


## Google Login Demo

A static "Login with Google" page is included in `index.html`. To use it on GitHub Pages:

1. Create an OAuth 2.0 Web client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   - Set an authorized JavaScript origin that matches your GitHub Pages domain, e.g. `https://<username>.github.io` or `https://<username>.github.io/<repo>`.
   - (Optional) Add an authorized redirect URI only if you need to exchange the credential on a backend.
2. Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` on the `<html>` element in `index.html` with your client ID.
3. Commit the files and push to the branch you publish with GitHub Pages.
4. When the page loads, the Google button renders automatically and displays the signed-in user's name, email, and avatar once authenticated.

The demo uses the [Google Identity Services JavaScript SDK](https://developers.google.com/identity/gsi/web). The credential returned in the callback is a JWT containing basic profile information. For production deployments you should send the credential to a secure backend for verification and session management.

## Backend Service

A minimal Go backend that handles CRUD for users, events, and role assignments is located in [`backend/`](backend/). The service initializes the PostgreSQL schema on startup, seeds the canonical role list described above, and exposes REST endpoints documented in [`backend/README.md`](backend/README.md). It is configured for Railway deployment via the standard `DATABASE_URL` and `PORT` environment variables.
