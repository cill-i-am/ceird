# Jobs V1 Spec

This document defines the first organization-owned jobs slice for the product.

It turns the decisions captured in
`docs/architecture/legacy-mvp-field-audit.md` into an implementation-ready
spec that fits the current codebase:

- organization-scoped app shell already exists
- `apps/api` already uses Effect `HttpApi`
- auth remains Better Auth + regular Drizzle
- new product slices should prefer Effect-native services and data access

## Purpose

Jobs v1 should be the first real operational workflow under the active
organization.

The slice should make the product useful for intake and day-to-day coordination
without copying the legacy MVP's admin-heavy structure.

The product language should say `Jobs`, while the backend keeps a more general
`work_item` model so the product can later support issues, inspections, and
maintenance requests without a database rename.

## Goals

- make intake fast and low-friction
- support a Linear-like status-driven workflow for construction jobs
- keep the organization boundary explicit in every domain query and mutation
- use Effect-native patterns end-to-end in the new slice
- establish a reusable foundation for later sites, contacts, issues, and saved
  views

## Non-Goals

Jobs v1 should not include:

- projects
- appointment scheduling or calendar dispatch
- attachments or photos
- materials or pricing
- external/customer access
- dashboards
- custom workflows per kind
- linked follow-up jobs as a first-class feature
- human-friendly per-organization ticket numbers

## Core Product Decisions

### Language

- UI label: `Jobs`
- internal model name: `work_item`
- core model keeps a `kind` field
- default kind: `job`
- the first shipped create flow only exposes `job`
- adjacent kinds such as `issue`, `inspection`, and `maintenance_request` are a
  later UI concern, not a v1 requirement

### Intake

The initial create flow should be intentionally small:

- required: `title`
- defaulted: `kind = job`
- optional input: `priority`
- optional: `site`
- optional: `contact`

If `priority` is omitted at intake, the persisted value should be `none`.

So the v1 rule is:

- input may omit `priority`
- storage always persists one of `none | low | medium | high | urgent`
- `none` is the default stored value, not `null`

There is no canonical description/details field in v1.

If a user needs narrative context, they add it as the first comment after
creation.

### Workflow

Canonical statuses:

- `new`
- `triaged`
- `in_progress`
- `blocked`
- `completed`
- `canceled`

Rules:

- `scheduled` is out of scope for v1
- a job may move to `triaged` without an assignee
- `blocked` requires a free-text reason
- `blocked` is reserved for true blockers, not "needs another visit"
- revisit work usually stays `in_progress`
- reopening is allowed in v1
- reopening clears completion metadata and keeps assignment fields as-is

### Roles On A Job

A job can have:

- an optional `assignee`
- an optional `coordinator`

Rules:

- both fields refer to internal organization users
- they may both be empty
- they may both be set
- they may not reference the same user
- `coordinator` is a job role, not a permission role

### Comments And Activity

Jobs v1 uses two separate records of what happened:

- user-authored comments
- system-authored activity events

Comments are the narrative thread.

Activity is append-only system history generated from state changes such as:

- job created
- status changed
- blocked reason changed
- priority changed
- assignee changed
- coordinator changed
- site changed
- contact changed
- job reopened
- visit logged

### Sites, Regions, And Contacts

- `site` is reusable and optional on the job
- `site` owns `region`
- if a job has no site yet, it may have no region yet
- `contact` is a separate external record
- a contact may link to many sites
- a site may link to many contacts
- a site may have one optional primary contact
- a job may reference a non-primary site contact

The many-to-many site/contact link stays in v1 intentionally. It is not
speculative overbuild: the product decisions already require that contacts can
link to multiple sites and that a job may reference a non-primary site contact.
A join table is the smallest clean model that supports those requirements
without encoding contradictory one-to-one assumptions into the schema.

### Site Location Model

Sites are address-first. A site should always carry enough structured address
data to geocode, with Ireland/Eircode quality especially important for the
current launch scope.

Latitude and longitude are server-derived persistence fields, not user-editable
inputs. Server geocoding should sit behind a provider-neutral service: Google is
the initial production provider, while local, dev, test, and sandbox
environments can use stub mode.

The app keeps rendering saved coordinates with the existing map renderer for
now. Future routing, directions, and provider swaps should remain behind
backend/provider boundaries rather than leaking manual coordinates into create
forms.

### Visits

Visits are first-class execution logs.

Each visit captures:

- visit date
- note
- duration stored as `duration_minutes`

The UI should accept whole-hour entries only in v1, but storage stays in
minutes so the model does not paint us into a corner later.

## Architecture Decision

### Transport

Jobs v1 should extend the existing `@effect/platform` `HttpApi` path and use a
typed `HttpApiClient` in the app.

Jobs v1 should not introduce `@effect/rpc` yet.

Reasoning:

- `apps/api` already exposes an Effect `HttpApi` server contract
- the app needs an HTTP-facing browser/server client anyway
- adding RPC now would create a second transport style in the same codebase
  before the first domain slice exists
- the first slice benefits more from one clean typed HTTP contract than from a
  second contract abstraction

`@effect/rpc` remains a valid future option if later slices need richer
multi-client procedure semantics, worker-heavy orchestration, or a broader RPC
surface than the app-facing HTTP API warrants.

The v1 default should be:

- shared Jobs boundary types and HTTP contract
- `HttpApi` handlers in `apps/api`
- a typed `HttpApiClient` wrapper service in `apps/app`

### Shared App Database Layer

Before shipping Jobs persistence, extract the auth-local database setup into a
shared app database layer in `apps/api`.

That layer should provide:

- one shared `pg` pool
- one regular Drizzle database for Better Auth's adapter path
- one Effect SQL Postgres layer for app-owned slices
- one Effect Drizzle layer for app-owned slices

Better Auth should keep using regular Drizzle directly.

Jobs should use the shared Effect-native database layers so the new slice does
not create a second ad hoc database runtime.

### Package And Module Boundaries

Recommended structure:

- `packages/jobs-core`
  - branded ids
  - Effect schemas
  - filter/input/output DTOs
  - status / priority / kind schemas
  - jobs `HttpApi` group definition
- `apps/api/src/domains/jobs`
  - Drizzle schema
  - migrations
  - repositories
  - domain services
  - authorization helpers
  - activity recorder
  - `HttpApi` handlers
- `apps/app/src/features/jobs`
  - typed app client service
  - route loaders / server-only query helpers
  - effect-atom query and mutation atoms
  - list/detail/create components

This follows the current split already visible in `packages/identity-core`,
`apps/api`, and `apps/app`.

## Effect-First Backend Rules

Jobs v1 should follow these rules consistently.

### Services

Business and repository services should use `Effect.Service` with accessors and
declared dependencies.

Expected service set:

- `CurrentJobsActor`
- `JobsRepository`
- `SitesRepository`
- `ContactsRepository`
- `JobsAuthorization`
- `JobsActivityRecorder`
- `JobsService`

Each public method should use `Effect.fn("Service.method")` naming for tracing.

### Errors

All domain and transport errors should use `Schema.TaggedError`.

Prefer specific errors such as:

- `JobNotFoundError`
- `JobAccessDeniedError`
- `InvalidJobTransitionError`
- `BlockedReasonRequiredError`
- `CoordinatorMatchesAssigneeError`
- `VisitDurationIncrementError`
- `SiteNotFoundError`
- `ContactNotFoundError`

Do not collapse domain failures into generic `BadRequestError` or
`NotFoundError` wrappers.

### Schemas And IDs

All boundary data should be defined with `Schema`.

Recommended id strategy:

- auth-owned ids remain branded strings because Better Auth stores them as text
- new jobs-domain entity ids should be branded UUIDs

Examples:

- `OrganizationId = Schema.String.pipe(Schema.brand(...))`
- `UserId = Schema.String.pipe(Schema.brand(...))`
- `WorkItemId = Schema.UUID.pipe(Schema.brand(...))`
- `SiteId = Schema.UUID.pipe(Schema.brand(...))`
- `ContactId = Schema.UUID.pipe(Schema.brand(...))`
- `VisitId = Schema.UUID.pipe(Schema.brand(...))`

Use `Option` in domain types for optional values that cross service boundaries.

### Layers

Compose jobs layers with `Layer.mergeAll` and `Layer.provideMerge`.

Do not build the slice around ad hoc `fetch` helpers, `process.env` access, or
manual dependency plumbing.

### Configuration

API origin, pagination defaults, and any feature flags should use `Config`.

Do not access environment variables directly inside services.

### Current Actor Resolution

Jobs endpoints must resolve the current actor from the existing Better Auth
session cookie and active organization.

The v1 rule is:

- the authenticated session must have `activeOrganizationId`
- jobs endpoints derive organization scope from `session.activeOrganizationId`
- the current user must be a member of that organization

The jobs slice should add a narrow request-scoped service such as
`CurrentJobsActor` that provides:

- `userId`
- `organizationId`
- `role`

It should fail closed when:

- there is no valid session
- there is no active organization
- the current user is not a member of the active organization

## Persistence Model

### General Rules

- migrations live in `apps/api`
- Drizzle owns schema definitions and migration generation
- jobs repositories should use Effect-native database access through
  `@effect/sql-pg` and `@effect/sql-drizzle`
- multi-step writes should use transactions
- list endpoints must paginate
- prefer keyset pagination over large offset scans
- new jobs-domain timestamps should use `timestamptz`

The auth slice remains the precedent:

- Better Auth continues to use regular Drizzle directly
- the new jobs slice uses Effect-native services over the same Postgres
  database

### Tables

#### `service_regions`

Purpose:

- stable organization-scoped region values for filtering and site assignment

Suggested columns:

- `id uuid primary key`
- `organization_id text not null references organization(id)`
- `name text not null`
- `slug text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `archived_at timestamptz null`

Constraints and indexes:

- unique `(organization_id, slug)`
- index `(organization_id, name)`

This is intentionally small, but it avoids free-text region drift on sites.

#### `sites`

Suggested columns:

- `id uuid primary key`
- `organization_id text not null references organization(id)`
- `region_id uuid null references service_regions(id) on delete set null`
- `name text null`
- `address_line_1 text null`
- `address_line_2 text null`
- `town text null`
- `county text null`
- `country text not null`
- `eircode text null`
- `access_notes text null`
- `latitude double precision null`
- `longitude double precision null`
- `geocoding_provider text null`
- `geocoded_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `archived_at timestamptz null`

Indexes:

- `(organization_id, updated_at desc)`
- `(organization_id, region_id)`
- optional trigram/search indexes can wait

#### `contacts`

Suggested columns:

- `id uuid primary key`
- `organization_id text not null references organization(id)`
- `name text not null`
- `email text null`
- `phone text null`
- `notes text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `archived_at timestamptz null`

Indexes:

- `(organization_id, name)`
- `(organization_id, email)`

#### `site_contacts`

Join table between sites and contacts.

This remains in v1 because the domain already requires many-to-many
site/contact links plus an optional primary contact per site.

Suggested columns:

- `site_id uuid not null references sites(id) on delete cascade`
- `contact_id uuid not null references contacts(id) on delete cascade`
- `is_primary boolean not null default false`
- `created_at timestamptz not null`

Constraints and indexes:

- primary key `(site_id, contact_id)`
- index `(contact_id, site_id)`
- partial unique index on `(site_id)` where `is_primary = true`

#### `work_items`

Suggested columns:

- `id uuid primary key`
- `organization_id text not null references organization(id)`
- `kind text not null`
- `title text not null`
- `status text not null`
- `priority text not null default 'none'`
- `site_id uuid null references sites(id) on delete set null`
- `contact_id uuid null references contacts(id) on delete set null`
- `assignee_id text null references user(id) on delete set null`
- `coordinator_id text null references user(id) on delete set null`
- `blocked_reason text null`
- `completed_at timestamptz null`
- `completed_by_user_id text null references user(id) on delete set null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `created_by_user_id text not null references user(id)`

Constraints:

- check that `kind` is one of the allowed core values
- check that `status` is one of the allowed core values
- check that `priority` is one of `none`, `low`, `medium`, `high`, `urgent`
- check that `status = 'blocked'` implies `blocked_reason is not null`
- check that `status <> 'blocked'` implies `blocked_reason is null`
- check that `coordinator_id is null or coordinator_id <> assignee_id`
- check that `status = 'completed'` implies `completed_at is not null`

Indexes:

- `(organization_id, updated_at desc, id desc)` for default list pagination
- `(organization_id, status, updated_at desc, id desc)`
- `(organization_id, assignee_id, updated_at desc, id desc)`
- `(organization_id, coordinator_id, updated_at desc, id desc)`
- `(organization_id, site_id, updated_at desc, id desc)`
- partial index for active jobs on
  `(organization_id, updated_at desc, id desc)` where
  `status not in ('completed', 'canceled')`

`priority` should start with a closed set such as:

- `none`
- `low`
- `medium`
- `high`
- `urgent`

#### `work_item_comments`

Suggested columns:

- `id uuid primary key`
- `work_item_id uuid not null references work_items(id) on delete cascade`
- `author_user_id text not null references user(id)`
- `body text not null`
- `created_at timestamptz not null`

Indexes:

- `(work_item_id, created_at asc, id asc)`

Comments should be simple and append-only in v1.

#### `work_item_activity`

Suggested columns:

- `id uuid primary key`
- `work_item_id uuid not null references work_items(id) on delete cascade`
- `organization_id text not null references organization(id)`
- `event_type text not null`
- `actor_user_id text null references user(id) on delete set null`
- `payload jsonb not null`
- `created_at timestamptz not null`

Indexes:

- `(work_item_id, created_at desc, id desc)`
- `(organization_id, created_at desc, id desc)`

`payload` should be typed in Drizzle and decoded at the boundary with Effect
schemas. Do not leave it as untyped `unknown`.

#### `work_item_visits`

Suggested columns:

- `id uuid primary key`
- `work_item_id uuid not null references work_items(id) on delete cascade`
- `organization_id text not null references organization(id)`
- `author_user_id text not null references user(id)`
- `visit_date timestamptz not null`
- `duration_minutes integer not null`
- `note text not null`
- `created_at timestamptz not null`

Constraints:

- `duration_minutes > 0`
- `duration_minutes % 60 = 0` in v1

Indexes:

- `(work_item_id, visit_date desc, id desc)`
- `(organization_id, visit_date desc, id desc)`

### Transaction Boundaries

Use transactions for:

- create job + optional initial comment + initial activity
- create site/contact inline during job creation
- status transition + activity event
- reopen + completion metadata clear + activity event
- visit creation + activity event
- coordinator/assignee updates + activity event

## HTTP API Contract

### Shape

The jobs API should be organization-scoped through the active session context:

- `GET /jobs`
- `POST /jobs`
- `GET /jobs/:workItemId`
- `POST /jobs/:workItemId/comments`
- `POST /jobs/:workItemId/visits`
- `POST /jobs/:workItemId/transitions`
- `POST /jobs/:workItemId/reopen`
- `PATCH /jobs/:workItemId`

The active organization comes from the authenticated session, not from a path
parameter. For v1, the handler should resolve `session.activeOrganizationId`,
reject the request if it is missing, and use that organization id consistently
for all authorization checks and repository queries.

### Initial Endpoints

Jobs v1 only needs a small contract:

- list jobs
- create job
- get job detail
- update assignee / coordinator / priority / site / contact / title
- transition job status
- reopen job
- add comment
- add visit
- get job detail as one aggregate response containing the job, comments,
  activity, and visits

V1 should use a single aggregate detail read contract:

- `GET /jobs/:workItemId`

The response should include:

- the job record
- comments
- activity
- visits

Separate nested pagination endpoints for comments, activity, or visits are
deferred until there is real volume pressure that justifies the extra contract
surface.

### Error Unions

Each endpoint should expose a narrow error union instead of a generic failure
type.

Examples:

- `listJobs`
  - `JobAccessDeniedError`
- `createJob`
  - `JobAccessDeniedError`
  - `CoordinatorMatchesAssigneeError`
  - `SiteNotFoundError`
  - `ContactNotFoundError`
- `transitionJob`
  - `JobNotFoundError`
  - `JobAccessDeniedError`
  - `InvalidJobTransitionError`
  - `BlockedReasonRequiredError`
- `addVisit`
  - `JobNotFoundError`
  - `JobAccessDeniedError`
  - `VisitDurationIncrementError`

## Authorization Rules

Jobs v1 should reuse the existing organization role model:

- `owner`
- `admin`
- `member`

Do not add a second permission framework in the first slice.

### View Rules

- all organization members can view all jobs
- all organization members can read comments, activity, sites, contacts, and
  visits related to visible jobs

### Mutation Rules

`owner` and `admin` can:

- create jobs
- edit all jobs
- assign assignee/coordinator
- change any status
- reopen/cancel any job
- add comments and visits
- create sites and contacts

`member` can:

- comment on visible jobs
- add visits to jobs they are assigned to
- change status on jobs they are assigned to within the constrained transition
  set
- reopen jobs they are assigned to

`member` cannot in v1:

- create jobs
- assign jobs
- edit coordinator/assignee fields
- cancel arbitrary jobs they do not own operationally

Recommended constrained member transitions:

- `new -> in_progress`
- `triaged -> in_progress`
- `in_progress -> blocked`
- `blocked -> in_progress`
- `in_progress -> completed`
- `blocked -> completed` only if blocker is resolved in the same action
- `completed -> in_progress` via reopen

## Frontend Architecture

### TanStack Start

Jobs routes should live under the existing organization boundary:

- `/_app/_org/jobs`
- `/_app/_org/jobs/new`
- `/_app/_org/jobs/$jobId`

The sidebar should add `Jobs` as the first real operational nav item.

The home page can stay light, but it should link clearly into Jobs once the
slice exists.

### Typed App Client

`apps/app` should have a `JobsApiClient` service that wraps the shared
`HttpApiClient` contract.

It should support both:

- server-side calls with forwarded auth cookies and resolved API origin
- browser-side calls with the normal app-to-api origin mapping

Prefer one typed client service over scattered `fetch` calls.

This should follow the same shape already used by the auth-related
`createServerOnlyFn` helpers in the app:

- server-only helpers forward the request cookie and resolve the API origin
- route loaders call those helpers for first paint
- browser-side atoms and mutations reuse the same typed contract

### SSR + Effect Atom Strategy

TanStack Start loaders and `createServerOnlyFn` helpers remain the first source
of truth for initial load.

Recommended pattern:

1. Route loader runs on the server for the initial request.
2. Loader calls a server-only helper that uses the typed jobs client.
3. Loader returns decoded DTOs from the shared jobs schemas.
4. The route component seeds slice-local effect-atom state from that loader
   data.
5. effect-atom then owns reactive list/detail state and mutations on the
   client.

This gives:

- fast SSR first load
- one canonical typed boundary
- no duplicate client/server DTO definitions
- no second fetching library required for the first slice

### Atoms

Keep the initial atom surface small.

Recommended atom set:

- `jobListStateAtom`
- `jobDetailStateAtomFamily(jobId)`
- `jobIntakeOptionsAtom`
- `createJobMutationAtom`
- `updateJobMutationAtom`
- `transitionJobMutationAtom`
- `reopenJobMutationAtom`
- `addJobCommentMutationAtom`
- `addJobVisitMutationAtom`

Notes:

- `jobListStateAtom` is loader-seeded list state plus filters and refresh
- `jobDetailStateAtomFamily(jobId)` is loader-seeded aggregate detail state,
  including comments, activity, and visits
- separate query families for comments, activity, and visits are not required
  in v1 because detail returns one aggregate payload
- define atoms outside components
- prefer `Atom.keepAlive` for shared query state that should survive route
  changes inside the org shell
- prefer `Result.builder` for consistent loading and tagged-error rendering
- prefer mutation `result.waiting` over local loading state
- prefer shared reactivity-key invalidation so list/detail state stays coherent
  after mutations

### Initial Screens

#### Jobs List

Must support:

- default active jobs view
- filter by status
- filter by assignee
- filter by coordinator
- filter by priority
- filter by region through site
- filter by site

The first version does not need persisted saved views, but the filter DTOs
should be designed so saved views can be added later without changing the core
query contract.

#### Job Create

The create screen should be simple and biased toward completion:

- title
- priority
- optional site selector / inline create
- optional contact selector / inline create

There is no description field.

After creation, the detail screen should encourage adding the first comment if
context is needed.

#### Job Detail

The detail screen should show:

- title, status, priority
- assignee and coordinator
- site and region
- contact
- comments tab or section
- activity tab or section
- visits section
- transition actions

## Testing And Observability

### Backend Tests

- repository integration tests against Postgres for list filters and
  transaction boundaries
- service tests for status transitions, reopen rules, and role checks
- `HttpApi` integration tests for the jobs contract

### Frontend Tests

- route loader tests for server-first jobs pages
- component tests for list filters, create flow, and detail mutations
- one end-to-end happy path covering create -> comment -> start -> block ->
  unblock -> visit -> complete -> reopen

### Logging And Tracing

Use structured `Effect.log` with job-scoped annotations such as:

- `organizationId`
- `workItemId`
- `status`
- `assigneeId`
- `coordinatorId`

Activity history is for product audit. Logs and traces are for runtime
operations. Keep both.

## Subagent-Driven Implementation Plan

The first jobs slice should be executed as a sequence of small, reviewable
tasks. Each task should go through:

1. implementer subagent
2. spec compliance review
3. code quality review

### Task 1: Shared App Database Layer Extraction

Deliver:

- shared app database module in `apps/api`
- one shared `pg` pool
- one regular Drizzle database for Better Auth
- one Effect SQL Postgres layer for app-owned slices
- one Effect Drizzle layer for app-owned slices
- tests proving auth still boots correctly on the shared database runtime

Why first:

- Jobs should not be the slice that duplicates or bypasses the database runtime
- all later jobs persistence work depends on this being stable

### Task 2: Shared Jobs Core Package

Deliver:

- `packages/jobs-core`
- branded ids
- enums and schemas for kinds, statuses, priorities
- filter/query DTOs
- input/output DTOs for the initial jobs endpoints
- shared `HttpApi` group definition

Why second:

- it fixes names and boundaries before persistence or UI work begins

### Task 3: Persistence And Repository Layers

Deliver:

- Drizzle schema for regions, sites, contacts, site_contacts, work_items,
  comments, activity, visits
- migration files
- Effect SQL / sql-drizzle repository services
- repository integration tests

Why separate:

- this is mostly a database-focused task with limited UI coupling

### Task 4: Jobs Service, Authorization, And HTTP Handlers

Deliver:

- authorization service using existing organization roles
- constrained member transition rules enforced in service and handlers
- jobs domain service
- activity recorder
- list/create/detail/update/transition/reopen/comment/visit handlers
- API integration tests

Why separate:

- transport, permissions, and business rules should be correct before UI work
  starts

### Task 5: Typed App Client And Server Query Helpers

Deliver:

- app-side typed `JobsApiClient`
- server-only query helpers for loaders with cookie forwarding
- shared error handling strategy for job queries and mutations

Why separate:

- this locks in client/server communication before UI state is built

### Task 6: Jobs List And Create Flow

Deliver:

- sidebar `Jobs` entry
- `/_app/_org/jobs` route
- SSR loader for list page
- effect-atom list/query state
- create job flow
- list/create UI tests

Why separate:

- this is the first user-visible vertical slice and proves intake, which is the
  main v1 job-to-be-done

### Task 7: Job Detail, Comments, Activity, And Visits

Deliver:

- `/_app/_org/jobs/$jobId` route
- detail loader and atoms
- comment composer
- activity rendering
- visit logging
- status transition and reopen UI

Why separate:

- it adds execution tracking after intake is already working

### Task 8: Hardening, Filter Polish, And Observability

Deliver:

- region/site/assignee/coordinator filter polish
- observability hooks
- end-to-end happy path coverage
- home page and empty-state polish

Why last:

- it tightens the slice after the primary workflow exists

## Default Recommendation Summary

If there is pressure to simplify further, keep these defaults:

- use `HttpApi` + typed `HttpApiClient`, not `@effect/rpc`, for this slice
- create a shared `jobs-core` package before writing handlers
- use Effect-native services and repositories in the jobs domain
- keep Drizzle responsible for schema and migrations
- use TanStack Start loaders for first paint and effect-atom for ongoing query
  and mutation state
- ship intake first, then detail/execution, then polish
