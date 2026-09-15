# RBAC audit and target authorization specification

**Status:** proposed

**Scope:** Innhopp Central backend API and frontend access controls, audited 2026-09-15.

## Executive summary

The current system has a role/permission framework, but it is not yet a restrictive RBAC system:

- `admin` and `staff` are authorized for **every** currently defined permission.
- Permissions are global. A role grants access to every event and record of that type; there is no event, assignment, ownership, or time scope.
- The UI largely reduces access to a single `admin | staff` check, so specialist roles cannot use the areas their API permissions allow.
- Account authorization roles and participant/roster roles are mixed in the same participant editing workflow.

The recommended target is scoped, permission-based access: retain a small set of platform roles, grant operational roles per event, and enforce ownership/assignment checks inside handlers. The generic `staff` authorization role must not remain a catch-all.

## Current state

### Account roles implemented by the RBAC package

The following account-level role constants exist in `backend/rbac/roles.go`:

| Role | Current purpose / effective access |
| --- | --- |
| `admin` | Every defined permission; may also impersonate users and manage account roles through the participant profile workflow. |
| `staff` | Every defined permission. This is functionally equivalent to `admin` for normal API operations. |
| `jump_master` | Manifests: view/manage; crew assignments: view/manage; checklists: view/complete/reverse/override. |
| `jump_leader` | Events/seasons/manifests/participants/crew assignments/checklists: selected read access; checklists: complete/reverse. |
| `ground_crew` | Events, logistics, budgets, accounting, crew assignments, and checklists: selected read access; logistics/budgets/accounting: manage; checklists: complete/reverse. |
| `driver` | Events, logistics, checklists: selected read access; checklists: complete. |
| `packer` | Events, logistics, checklists: selected read access; checklists: complete. |
| `participant` | Events/seasons/logistics/budget/accounting: selected global read access; session access. |
| `boat_crew` | Checklist view/complete/reverse only. **Not usable end-to-end:** declared in RBAC but absent from role seeding, account-role validation, OIDC normalization, and the frontend role options. |

`boat_crew` is therefore a code-level role rather than a currently assignable role. It should either be completed as a supported role or removed from the matrix until implemented.

### A separate participant-role catalogue also exists

`participant_profiles.roles` contains roster/personnel attributes such as `Participant`, `Skydiver`, `Staff`, `Ground Crew`, `Jump Master`, `Jump Leader`, `Driver`, `Pilot`, `POC`, and `Photo`. These are distinct from account roles in `account_roles` (`admin`, `staff`, etc.), despite overlapping names.

This distinction is important:

- `Pilot`, `Skydiver`, `POC`, and `Photo` are participant attributes only; they do not grant API access.
- `Staff` on a participant profile drives operational registration behaviour, but is not itself the `staff` account role.
- An administrator can edit `account_roles` from the participant profile editor. A staff member can edit the profile's stored `account_roles` value but cannot synchronize it to the account-role table; this is confusing and should be removed from non-admin payloads.

### Current permission model

The backend defines 28 permissions across seasons, events, registrations, communications, manifests, participants, crew assignments, logistics, budgets, accounting, session, and checklist operations. Route middleware consistently checks one of these permissions for the protected API routes.

However, the checks answer only “does this account have a qualifying role?” They do not answer:

- Is this person assigned to this event, manifest, vehicle, or checklist item?
- Is the requested event active and visible to this role?
- Is this a record owned by the caller?
- Is the caller allowed to approve their own financial change?

The result is global access. For example, a `ground_crew` account can read and modify logistics, budgets, and accounting for any event, and a `participant` account can read budgets and accounting for any event.

### High-priority findings

1. **Critical — generic staff is unrestricted.** `staff` appears in every permission mapping, including participant administration, registrations, communications, budget approvals, accounting approvals, destructive event operations, and checklist resets.
2. **High — no resource scope.** All grants apply across all events. Specialist roles are not restricted to their assigned events or operations.
3. **High — sensitive financial and personal data is overexposed.** `participant` and `ground_crew` can view budget and accounting data globally. Participant-profile readers can retrieve contact, emergency, medical, and other sensitive profile fields without field-level redaction.
4. **High — no separation of duties for finance.** The same `admin` or `staff` role can create/edit budget or accounting records and approve them. Approval permissions exist but are not used by accounting or budget routes in the audited handlers.
5. **Medium — UI/server authorization differs.** The frontend's main management guard accepts only `admin` and `staff`; it hides pages that `jump_master`, `ground_crew`, and other roles can access through the API.
6. **Medium — session role changes are not immediate.** Roles are embedded in a signed 24-hour session token. Removing a role does not invalidate an existing session; access can continue until the token expires or is replaced.
7. **Medium — role catalogues are inconsistent.** `boat_crew` is incomplete, and overlapping participant/account role names invite incorrect authorization decisions.

## Target authorization design

### Principles

1. **Deny by default.** New API routes must declare a permission; unknown permissions and unknown roles must fail closed.
2. **Permissions, not job titles, protect routes.** Roles are bundles of permissions. A handler may then apply scope and data rules.
3. **Scope every operational grant.** Use platform, season, event, and assignment scopes; do not make operational roles global by default.
4. **Keep account access separate from participant attributes.** Account roles authorize actions. Participant attributes describe capability/roster eligibility and never authorize an API request.
5. **Apply least privilege and separation of duties.** Financial approval must be independent of preparation; privileged access must be auditable and short-lived where possible.
6. **Enforce on the server.** Frontend gates are usability aids only and must consume the same capability data as the API.

### Proposed roles

| Proposed role | Scope | Intended responsibility |
| --- | --- | --- |
| `platform_admin` | Platform | Break-glass administration: identities, role grants, system configuration, audit review. Keep to a very small group. |
| `event_director` | Event | Owns an event's lifecycle, schedule, operational records, registrations, and event-team membership. Cannot administer the platform or approve own finance changes. |
| `registration_coordinator` | Event | Registration queue, statuses, participant-facing notes, payment follow-up, and approved event communications. |
| `communications_coordinator` | Event | Audience preview and campaigns/templates for assigned events; no registration or finance changes. |
| `operations_coordinator` | Event | Schedule, airfields, aircraft, accommodations, transport, ground crew, vehicles, and other logistics. |
| `jump_master` | Event or manifest | Assigned manifest authority and safety/checklist override for assigned operations only. |
| `jump_leader` | Event or innhopp | Assigned operational visibility and completion of assigned checklist responsibilities. |
| `ground_crew_lead` | Event or innhopp | Assigned logistics and checklist responsibility; no general finance access. |
| `driver`, `packer`, `boat_crew` | Assignment/innhopp | View own assignment and complete only their required checklist items. |
| `finance_editor` | Event | Prepare budgets, documents, payments, allocations, and actuals. No approval. |
| `finance_approver` | Event or platform | Approve/reject financial changes created by another account. No editing of the same approval domain. |
| `participant` | Self + registered events | Own profile and registrations; event information specifically published to participants. |

Do not introduce a replacement global `staff` role. During migration, retain `staff` only as a temporary compatibility role with a tightly time-boxed expiry, then remove it from the permission matrix and assignment UI.

### Scope model

Create explicit grants rather than deriving access from a profile label:

```text
role_grants
  id
  account_id
  role_name
  scope_type       -- platform | season | event | manifest | innhopp | assignment
  scope_id         -- null only for platform
  granted_by_account_id
  granted_at
  expires_at       -- nullable, recommended for temporary assignments
  revoked_at       -- nullable
```

Use `event_id` as the normal operational boundary. A manifest/innhopp/assignment grant is narrower and should imply access only to its parent event. Platform grants are exceptional.

Every protected handler should perform both checks:

```text
require(permission)
requireScope(account, permission, resource.event_id)
```

For participant self-service endpoints, use an ownership predicate instead:

```text
requireOwner(account, participant_profile | registration)
```

### Permission changes

Split broad `*:view` and `*:manage` permissions before migrating roles. At minimum, introduce these distinctions:

| Current area | Replace broad permission with |
| --- | --- |
| Events | `events:view_published`, `events:view_operational`, `events:edit`, `events:delete`, `events:publish`, `events:manage_team` |
| Participants | `participants:view_directory`, `participants:view_sensitive`, `participants:edit_profile`, `participants:manage_personnel_attributes` |
| Registrations | `registrations:view`, `registrations:edit`, `registrations:manage_payments`, `registrations:view_internal_notes` |
| Communications | `comms:view`, `comms:edit_template`, `comms:send_campaign`, `comms:view_audience_pii` |
| Logistics | `logistics:view`, `logistics:edit`, `logistics:manage_assets` |
| Manifests/checklists | `manifests:view`, `manifests:edit`, `checklists:complete_assigned`, `checklists:reverse_assigned`, `checklists:override`, `checklists:reset` |
| Finance | `budget:view`, `budget:edit`, `budget:approve`, `accounting:view`, `accounting:edit`, `accounting:approve`, `payments:record` |
| Identity/RBAC | `accounts:view`, `roles:grant`, `roles:revoke`, `impersonation:start`, `audit:view` |

Sensitive-profile fields (medical conditions, emergency contacts, date of birth, phone, and private notes) must be omitted by default and returned only with `participants:view_sensitive`, an event need-to-know rule, and audit logging. Participants retain access to their own fields.

### Finance controls

- `finance_editor` may create and amend drafts, but cannot approve them.
- `finance_approver` may approve/reject only a change whose creator is a different account.
- A material change after approval returns the item to draft/review.
- Record actor, timestamp, before/after values, approval decision, and reason for every financial mutation.
- Remove `participant` and operational crew access to accounting/budget data unless a deliberately published participant-facing summary is required.

### Identity and role administration

- Only `platform_admin` may grant/revoke account roles and platform grants.
- `event_director` may grant/revoke only event-scoped operational roles for events they administer; they must not grant `platform_admin`, finance approver, or roles outside their event.
- Move role assignment out of generic participant profile update payloads into dedicated grant/revoke endpoints.
- Prevent removal or alteration of the last active platform administrator.
- Record every grant, revoke, impersonation, and privileged access decision in an append-only audit log.
- Reduce session lifetime and/or maintain a per-account authorization version checked by middleware. Increment the version on role revoke so existing sessions fail immediately.

## Migration plan

1. **Stabilize the catalog.** Decide whether `boat_crew` is required; if yes, add it consistently to seeding, OIDC normalization, validation, UI, tests, and assignment workflows. Document account roles versus personnel attributes.
2. **Remove the largest exposures first.** Immediately remove `participant` from budget/accounting permissions; remove `ground_crew` accounting and budget access unless specifically justified; restrict participant-profile responses and all finance approval actions.
3. **Introduce grants and scope helpers.** Add `role_grants`, an event ownership resolver, self/assignment predicates, and audit logging. Keep existing roles temporarily for compatibility.
4. **Split permissions and protect every route.** Replace broad manage permissions incrementally, starting with finance, role administration, profile-sensitive data, registrations, and destructive event operations. Add route-level authorization tests for allow and deny cases.
5. **Migrate people.** Convert each current `staff` account to explicit event roles and only grant platform administration where truly required. Create a review report for every global grant.
6. **Update the frontend.** Obtain capabilities/scopes from `/api/auth/session` (or a dedicated `/api/me/capabilities`) and gate navigation/actions by permission and scope, never by `admin | staff` alone.
7. **Remove compatibility access.** Set an expiry for `staff`, announce it, revoke residual grants after review, and delete its universal mapping.

## Acceptance criteria

- A generic `staff` account cannot access an endpoint unless it has an explicit scoped grant.
- A crew member cannot read or mutate another event's data without a grant for that event.
- A participant cannot retrieve other participants' profiles, operational finance records, or unpublished event data.
- A finance editor cannot approve their own budget/accounting change.
- A revoked role takes effect immediately (or within a documented maximum of five minutes).
- `boat_crew` is either fully assignable and tested or absent from the RBAC matrix.
- Every protected route has allow/deny tests for role, scope, ownership/assignment, and cross-event access.
- Every role change, impersonation, and sensitive/financial mutation produces an audit entry.

## Files examined

- `backend/rbac/roles.go` and `backend/rbac/enforcer.go`
- `backend/main.go`
- `backend/auth/handler.go` and `backend/auth/session.go`
- Route definitions and handlers in `backend/events`, `participants`, `registrations`, `logistics`, `innhopps`, `checklists`, `budgets`, `accounting`, `comms`, and `rostercheckins`
- `frontend/src/auth/access.ts`, `frontend/src/auth/StaffRouteGuard.tsx`, and role-selection components
