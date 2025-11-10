# Innhopp Central Data Management System

The Innhopp Central platform provides a unified data management hub for registration, operations, safety oversight, customer logistics, and post-event reporting.

## Vision

Create a single source of truth for all operational data that keeps the team synchronized across planning, execution, and follow-up while maintaining the highest standards for safety, compliance, and customer satisfaction.

## Core Capabilities

- **Operations Planning**: Manage season calendars, event templates, and jump manifests with aircraft, boat, and landing zone requirements.
- **Participant Lifecycle**: Track registrations, payments, waivers, certifications, gear checks and health declarations for individual jumpers and groups.
- **Logistics Coordination**: Assign transport legs, gear, and accommodation; automate notifications for check-in, briefing schedules, and packing lists.
- **Safety & Compliance**: Centralize incident reports, risk assessments, gear inspections, and regulatory filings with audit trails.
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
- **Backend**: Node.js (NestJS) or Python (FastAPI) for modular service layer.
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

## Contribution Guidelines

1. Fork the repository and clone locally.
2. Create feature branches using the format `feature/<summary>`.
3. Run the project linting and test suites before submitting pull requests.
4. Provide clear documentation and screenshots for UI changes.
5. Submit pull requests with context, testing notes, and linked issues.

## License

This project is released under the MIT License. See [LICENSE](LICENSE) for details.

