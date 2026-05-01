# Organization Activity Feed Design

## Purpose

Add an organization-wide activity feed so organization owners and admins can see
recent job changes across the active organization without opening each job one by
one.

This is an operational audit view over the existing job activity model. It does
not replace the per-job activity timeline.

## Status

This document is the approved design basis for the implementation plan. It
describes intended behavior, not shipped behavior.

## Goals

- add an organization-wide activity page under the authenticated organization
  app
- restrict the page and API to organization `owner` and `admin` roles
- hide the navigation and command entries from regular `member` users
- list recent job activity for the active organization only
- show actor, event summary, related job title/reference, timestamp, and a link
  back to the job
- support filtering by actor, event type, and date range
- preserve the existing per-job activity timeline
- keep runtime validation at HTTP and persistence boundaries
- add focused backend and frontend tests for access, filtering, visibility, and
  job linking

## Non-Goals

- real-time updates
- notifications
- email or push alerts
- activity from non-job domains
- replacing the job detail activity section
- exposing organization-wide activity to members
- introducing a separate audit-log or notification table

## Current Architecture

Job activity is already persisted in `work_item_activity`.

Important existing properties:

- each activity row has `organization_id`
- each activity row has `work_item_id`
- each activity row has `event_type`
- each activity row has optional `actor_user_id`
- each activity row stores a typed activity `payload`
- the table already has
  `work_item_activity_organization_created_at_idx` on organization and creation
  time

The API currently exposes job activity through job detail. The app renders that
timeline in `JobsDetailSheet`, where activity payloads are converted into
human-readable summaries.

Organization role rules already exist:

- `owner` and `admin` are administrative roles
- `member` can view jobs but cannot create or edit most job data
- frontend organization administration routes use
  `assertOrganizationAdministrationRole`
- backend job authorization already has a `hasElevatedAccess` concept for
  `owner` and `admin`

## Product Shape

The new page should be available at `/activity`.

Owners and admins should see a primary navigation item named `Activity`.
Members should not see that item and should not see its command-bar navigation
action. If a member directly visits `/activity`, they should be redirected away
by the frontend route and denied by the API if they call it directly.

The first version should be a scannable list, not a reporting dashboard. Each
row should answer:

- who acted, if known
- what changed
- which job it relates to
- when it happened
- where to open the job

The job link should route to the existing job detail route, preserving the job
detail drawer behavior.

## Data Model

No database migration is required for the first version.

The existing `work_item_activity` table is the source of truth. The
organization-wide query should join:

- `work_item_activity` for the event
- `work_items` for the job title/reference
- `"user"` for actor display fields when `actor_user_id` is present

The query must always constrain by `work_item_activity.organization_id`. The
joined job should also be in the same organization as a defensive invariant.

## API Design

Add a new read endpoint to the existing jobs API surface:

```txt
GET /activity
```

Query parameters:

- `actorUserId`
- `eventType`
- `fromDate`
- `toDate`
- `cursor`
- `limit`

The date filters use ISO date strings (`YYYY-MM-DD`) at the HTTP boundary. The
server maps them to UTC day bounds:

- `fromDate` means activity at or after `fromDateT00:00:00.000Z`
- `toDate` means activity before the day after `toDateT00:00:00.000Z`

Response items include:

- activity id
- work item id
- job title
- actor user id, name, and email when available
- event type
- existing activity payload
- creation timestamp

The response should use cursor pagination ordered by:

```sql
created_at desc, id desc
```

## Authorization

Backend authorization is required even though the frontend hides the page.

Add a `JobsAuthorization.ensureCanViewOrganizationActivity(actor)` method. It
should allow only `owner` and `admin`; `member` should receive
`JobAccessDeniedError`.

The route should also call the existing organization administration role helper
so members are redirected away during normal navigation.

## Frontend Design

Create a focused feature area:

```txt
apps/app/src/features/activity/
```

The page should use existing layout primitives:

- `AppPageHeader`
- row/list components or table primitives already used by the app
- `CommandSelect` for actor and event filters if it fits local patterns
- date inputs for date range

The visible content should be compact:

- heading: `Activity`
- short context: active organization name if useful
- filter row
- activity list
- empty state when no results match

Each activity row should include:

- summary text using the same wording as the job detail activity timeline
- actor fallback such as `System` or `Unknown actor`
- job title linked to `/jobs/$jobId`
- timestamp
- event type label or badge

## Navigation And Hotkeys

Add `Activity` to the primary navigation for admins and owners only.

The navigation system is currently static, so this feature should introduce a
small role-aware navigation filter rather than hard-coding checks throughout the
sidebar and command bar.

Add a navigation hotkey:

```txt
G A -> Go to Activity
```

The shortcut should appear only where the Activity navigation item is visible.
The command-bar action should follow the same role gate.

## Type Safety

Use Effect Schema at HTTP boundaries:

- query params
- response payload
- activity event type
- activity payload
- dates
- cursor

Repository mapping should decode rows into shared DTOs before returning them.
The frontend should consume the generated/shared DTO types from
`@task-tracker/jobs-core`.

## Testing Strategy

Backend tests should cover:

- owner/admin access
- member denial
- organization scoping
- actor filtering
- event type filtering
- date range filtering
- job title and actor fields in response
- direct HTTP member denial

Frontend tests should cover:

- member route redirect
- admin/owner route access
- hidden member navigation item
- visible admin/owner navigation item
- hidden member command action
- activity rows link to jobs
- filter controls update search/query behavior

## Risks And Decisions

Date range is included in v1 because it maps cleanly to indexed timestamps and
is useful for an operations feed.

The first version intentionally avoids real-time behavior. Users can refresh or
change filters to fetch current results.

The activity feed should reuse existing payloads and summary formatting. If the
current summary function is too coupled to the job detail sheet, extract it into
a small shared activity formatting module instead of duplicating logic.
