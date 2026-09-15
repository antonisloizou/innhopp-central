# Event Participants Page: Implementation Specification

## Goal

Provide a staff-facing event page that combines the event's registrations with the fullest available participant-profile data. It should make it easy to answer both operational questions (who is coming, who is paid, who has medical expertise) and planning questions (experience, disciplines, accommodation, dietary needs).

The page URL is `/events/:eventId/participants`, available to authorized staff from the event gear menu.

## Scope

- Include every registration for the selected event, including completed, pending, waitlisted, cancelled, and expired registrations.
- Default the table to active registrations: `deposit_pending`, `deposit_paid`, `main_invoice_pending`, and `completed`.
- Join every registration to its participant profile using the stable `participant_id`.
- Show aggregate statistics, filters, a sortable participant table, and a read-only participant detail drawer or page.
- Permit navigation to the existing participant and registration detail pages where the viewer has access.

## Out of Scope (V1)

- Editing a profile, registration, payment, or event roster from this page.
- New profile fields or duplicate storage of profile data in the event domain.
- Exposing data to participant-only users.
- Export, print, or communications actions. These can be added after the core view is established.

## Permissions and Privacy

- Require the same event-scoped staff/participant-management authorization used for event registrations; participant-only sessions must not see the menu entry or route.
- Treat contact details, dates of birth, emergency contacts, medical conditions, internal notes, payment details, and account roles as sensitive.
- The initial table must show operationally useful, low-sensitivity columns only. Put sensitive values in the detail view and show them only to authorized staff.
- Never return fields that the requester is not authorized to see. Enforce this in the API rather than relying on the frontend to hide columns.
- Do not include account credentials, authentication metadata, payment-provider references, or audit data in the page payload.

## Page Layout

1. Header: event title, **Participants**, and summary counts.
2. Summary cards:
   - total registrations;
   - active registrations;
   - completed registrations;
   - pending payment / deposit;
   - waitlisted;
   - cancelled or expired;
   - skydivers and non-jumpers;
   - profile-complete versus profile-incomplete.
3. Filter bar: free-text search; registration status; registration tags; jumper; roles; ratings; disciplines; licence; accommodation; dietary restrictions; medical expertise; profile completeness.
4. The shared `ParticipantList` component (extracted from **The Innhopp Family**), extended with event-specific columns where needed.
5. A selected-participant detail drawer (or a dedicated child route) with grouped profile and registration information.

## Table Columns

Show these by default:

- participant name and profile-completeness marker;
- registration status and registration date;
- tags and waitlist position where applicable;
- jumper / non-jumper;
- roles, ratings, disciplines, and licence;
- jump count, recent jump count, and years in sport;
- accommodation selection and roommate request;
- dietary restrictions;
- a compact medical-expertise indicator.

Allow staff to opt into additional non-sensitive columns such as citizenship, t-shirt size, canopy/wingload, landing-area preference, and packing preference. Do not place emergency contacts, medical conditions, internal notes, or payment values in the table.

## Participant Detail Data

The detail view should expose every existing `ParticipantProfile` field when available, grouped as follows.

### Identity and contact

- full name, email, phone;
- WhatsApp and Instagram;
- citizenship and date of birth;
- notes.

### Emergency and medical

- emergency contact, name, and phone;
- medical conditions;
- medical expertise;
- HSS qualities.

### Skydiving and experience

- jumper status;
- years in sport, total jump count, and recent jump count;
- main canopy, wingload, licence, and packing preference;
- roles, ratings, disciplines, other air sports;
- canopy-course history and landing-area preference.

### Event practicalities

- dietary restrictions;
- accommodation choice and roommate request;
- t-shirt size and gender.

### Registration context

- registration status, source, registration date, tags, and internal notes;
- payment milestone dates (deposit and main invoice due/paid), without payment-provider references;
- cancellation, expiry, or waitlist information where applicable;
- registration payments and activity only for users already authorized to view them.

### Administration

- account roles only for users authorized to manage participant access;
- profile creation timestamp.

For absent or blank values, show `Not provided`; do not manufacture values from registration data.

## Backend / API Plan

Add one event-scoped, staff-authorized endpoint, for example:

`GET /events/:eventId/participants`

The response should return:

- event identity and aggregate counts;
- a paginated list of registration rows joined to profile data;
- filter and sort metadata;
- only the fields permitted for the requesting role.

Support server-side filtering, sorting, and pagination. Use `participant_id` as the join key and retain a registration row even if its linked profile has become unavailable; return the registration snapshot fields and mark the profile as unavailable. Define profile completion by the existing `isProfileCompleteForRegistration` utility or move that rule into a shared backend contract before using it for the API aggregate.

## Frontend Plan

1. Add `EventParticipantsPage.tsx` and register `/events/:eventId/participants` behind the event-scoped authorization guard. Use `frontend/src/components/ParticipantList.tsx` for the participant list; enhance that shared component rather than duplicating the Innhopp Family list.
2. Change the disabled gear entry to navigate to this route and add `participants` to `EventGearMenuPage`.
3. Load the event and participant summary together, with loading, empty, unauthorized, and error states.
4. Implement filters and table state in the URL query string so views can be shared and revisited.
5. Render sensitive groups only after the API says they are available to the current user.
6. Link the selected row to existing detail pages rather than creating editing capability in V1.

## Acceptance Criteria

- Authorized staff can open the participant page from an event's gear menu.
- Participant-only users cannot access the entry, route, or sensitive data.
- The page includes every registration and clearly distinguishes active, waitlisted, cancelled, and expired people.
- Aggregate counts match the filtered registration records.
- Every available profile field is visible in the authorized detail view and blank values are clearly labelled.
- Sensitive fields are not present in list responses or visible to unauthorized roles.
- Filters, sorting, and pagination work server-side and remain stable for large events.
- Existing registration, participant-profile, and gear-menu behavior is unchanged.
