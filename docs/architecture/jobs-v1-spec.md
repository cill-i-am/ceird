# Jobs V1 Spec

This document defines the current organization-owned jobs and sites slice for
Ceird. The product is intentionally narrow: organizations have sites, sites have
jobs, and both jobs and sites support labels and comments.

The goal is to make the core operational loop excellent before adding adjacent
commercial or territory-planning concepts.

## Scope

Jobs V1 includes:

- organization-scoped jobs
- organization-scoped sites
- site locations with optional Google-resolved coordinates
- job and site comments
- organization labels assignable to jobs and sites
- job status, priority, assignee, coordinator, contact, visits, and activity
- collaborator access for specific jobs
- the authenticated home/dashboard surface
- organization activity
- Ceird agent actions over the same jobs, sites, labels, comments, and activity
  capability surface
- multi-tenant organization isolation across app, API, persistence, MCP, and
  agent flows

Jobs V1 does not include:

- invoicing, quoting, billing, or pricing configuration
- geographic territory configuration
- customer-facing case numbers
- customer portals
- attachments or photos
- custom workflows per organization
- linked follow-up jobs as a first-class feature

Per-organization human-readable job keys are a plausible follow-up. They should
be introduced as a first-class identifier with organization-owned sequencing,
not as a user-entered free-text field.

## Product Model

### Organizations

Every product read and write is scoped by the active organization. The domain
worker resolves the current actor, checks membership or collaborator access, and
queries by organization id before returning product data.

### Sites

Sites are reusable organization records. They own:

- name
- Google-resolved or unverified location text
- optional access notes
- optional latitude and longitude when the location has usable coordinates
- comments
- labels

Sites are the place where location quality matters. Create and update flows can
send no location, manual location text, or a Google place selection to the
domain worker. Google place selections resolve server-side through Google
Places; manual or empty locations are saved as `Unverified Location`. Maps and
future radius queries include only sites with `hasUsableCoordinates`, and
excluded jobs should be grouped under `Unverified Location`.

### Jobs

Jobs are organization-owned work items. They own:

- title
- kind, currently always `job` in the UI
- status
- priority
- optional site
- optional contact
- optional assignee
- optional coordinator
- comments
- visits
- labels
- collaborator access
- activity

The job create flow stays intentionally small:

- required: title
- optional: priority
- optional: existing site or a newly created site from a stacked `site.create`
  sheet
- optional: existing or inline-created contact

If a user needs narrative context, they add it as a first comment after
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

- `blocked` requires a free-text reason.
- Reopening is allowed and clears completion metadata.
- Assignment and coordination are separate internal roles.
- Assignee and coordinator may both be empty, may both be set, and may not be
  the same user.

### Comments And Activity

Jobs and sites both support user-authored comments.

Jobs also have append-only system activity generated from state changes such as:

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
- label added or removed

The activity feed is organization-scoped and remains read-only from the app.

### Labels

Labels are organization-level definitions. Jobs and sites assign those
definitions through join tables owned by their respective domains.

Label creation and editing lives in organization settings. Job and site detail
surfaces can assign existing labels, and elevated roles can create labels inline
where the UI supports it.

### Collaborators

Collaborators grant job-specific access to non-internal organization
participants. They are intentionally scoped to jobs, not to the whole
organization.

Collaborator access is separate from organization membership and does not imply
configuration permissions.

### Agents

Agents expose the same product capability surface as the app:

- labels list/create/update/delete
- sites options/list/create/update/comments/labels
- jobs options/list/detail/create/update/transitions/reopen/activity/comments
- job visits
- job labels
- job collaborators

Read actions can be model-available by default. Mutating actions require the
same domain authorization checks and run through the action-run ledger for
idempotency.

## Persistence Shape

The domain worker owns persistence. Shared packages define boundary schemas and
HTTP contracts; repositories stay in `apps/domain`.

Core tables:

- `work_items`
- `contacts`
- `site_contacts`
- `work_item_activity`
- `work_item_visits`
- `work_item_labels`
- `work_item_collaborators`
- `sites`
- `site_labels`
- shared `comments` plus `work_item_comments` and `site_comments`
- organization-owned `labels`

The `work_items` table keeps the general internal name so later product kinds
can reuse the model without a database rename. The shipped UI still presents the
surface as Jobs.

## HTTP Surface

Jobs endpoints live in `packages/jobs-core/src/http-api.ts` and
`apps/domain/src/domains/jobs/http.ts`.

Current job endpoints:

- `GET /jobs`
- `GET /jobs/options`
- `GET /jobs/member-options`
- `GET /jobs/external-member-options`
- `POST /jobs`
- `GET /activity`
- `GET /jobs/:workItemId`
- `PATCH /jobs/:workItemId`
- `POST /jobs/:workItemId/transitions`
- `POST /jobs/:workItemId/reopen`
- `POST /jobs/:workItemId/comments`
- `POST /jobs/:workItemId/visits`
- `POST /jobs/:workItemId/labels`
- `DELETE /jobs/:workItemId/labels/:labelId`
- `GET /jobs/:workItemId/collaborators`
- `POST /jobs/:workItemId/collaborators`
- `PATCH /jobs/:workItemId/collaborators/:collaboratorId`
- `DELETE /jobs/:workItemId/collaborators/:collaboratorId`

Sites endpoints live in `packages/sites-core/src/http-api.ts` and
`apps/domain/src/domains/sites/http.ts`.

Current site endpoints:

- `GET /sites`
- `GET /sites/options`
- `POST /sites`
- `PATCH /sites/:siteId`
- `GET /sites/:siteId/comments`
- `POST /sites/:siteId/comments`
- `POST /sites/:siteId/labels`
- `DELETE /sites/:siteId/labels/:labelId`

## Authorization

Owners and admins can manage organization-wide labels, sites, jobs, members,
and invitations. Members can work within the operations allowed by their role
and assignment. Job collaborators can access only the jobs they are attached to.

The app can mirror constraints for UX, but the domain worker is the enforcement
point for every product operation.

## UI Surfaces

The primary product loop is:

1. Create or choose a site.
2. Create a job for that site.
3. Add labels, comments, assignment, coordinator, visits, and collaborator
   access as work progresses.
4. Review activity and dashboard/home context.

Visible surfaces:

- home/dashboard
- jobs list, saved views, map, create sheet, and detail sheet
- sites list, create sheet, detail sheet, comments, labels, and map context
- organization activity
- organization settings for general settings and labels
- members and invitations
- global agent chat

## Follow-Ups

Good next bets after the loop feels world-class:

- organization-owned human-readable job keys
- mention-style linking in comments for people, jobs, and sites
- stronger saved views
- attachment support
- richer visit scheduling or calendar dispatch
