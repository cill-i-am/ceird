# Job Labels Design

## Goal

Add an organization-scoped labels layer for jobs without replacing the canonical job status lifecycle. Labels let teams attach flexible context such as "No access", "Waiting on PO", "Ready to invoice", "Callback needed", or "Parts ordered" while statuses remain the workflow backbone.

## Current Context

Jobs are modeled through `packages/jobs-core`, `apps/api/src/domains/jobs`, and `apps/app/src/features/jobs`.

- `packages/jobs-core` owns branded IDs, DTO schemas, activity payload schemas, and the Effect HTTP API contract.
- `apps/api/src/domains/jobs/schema.ts` owns Drizzle tables for work items, sites, contacts, comments, visits, and activity.
- `apps/api/src/domains/jobs/repositories.ts` owns raw SQL queries, cursor pagination, detail aggregation, and options lookups.
- `apps/api/src/domains/jobs/service.ts` owns actor loading, authorization, transactional orchestration, and error mapping.
- `apps/api/src/domains/jobs/activity-recorder.ts` converts domain changes into typed activity events.
- `apps/app/src/features/jobs/jobs-state.ts` stores list/options atom state and filters visible jobs client-side.
- `apps/app/src/features/jobs/jobs-page.tsx` renders the list, toolbar filters, active filter badges, and job rows.
- `apps/app/src/features/jobs/jobs-detail-sheet.tsx` renders job detail, status transitions, site assignment, comments, visits, and activity.
- `apps/app/src/features/jobs/jobs-create-sheet.tsx` already has a Linear-like inline create pattern for contacts using a custom `Command` popover.
- `apps/app/src/features/organizations/organization-settings-page.tsx` already has an admin-only organization settings layout suitable for label management.

There is no clean post-organization bootstrap hook for jobs-domain defaults. The current organization hook validates name and slug before creation. Default labels are out of scope for v1.

## Architecture

Use organization-scoped label definitions plus a many-to-many assignment table:

- `job_labels` stores reusable labels for an organization.
- `work_item_labels` stores assignments between jobs and labels.
- Jobs can have zero or more labels.
- Labels can be renamed or archived without mutating canonical job statuses.
- Label assignments are visible on list and detail responses.
- Label add/remove operations record activity events.

This keeps statuses as the workflow backbone and treats labels as independent contextual metadata.

## Data Model

Add a branded `JobLabelId` in `packages/jobs-core/src/ids.ts`.

Add `JobLabelNameSchema` in `packages/jobs-core/src/domain.ts`:

- trim whitespace
- require at least 1 character
- cap length at 48 characters

Add DTOs in `packages/jobs-core/src/dto.ts`:

- `JobLabelSchema`: `id`, `name`, `createdAt`, `updatedAt`
- `CreateJobLabelInputSchema`: `name`
- `UpdateJobLabelInputSchema`: `name`
- `AssignJobLabelInputSchema`: `labelId`
- `JobLabelResponseSchema`
- `JobLabelsResponseSchema`

Add `labels: Schema.Array(JobLabelSchema)` to:

- `JobSchema`
- `JobListItemSchema`
- `JobDetailSchema` through its nested `job`
- `JobOptionsResponseSchema`

Add tables in `apps/api/src/domains/jobs/schema.ts`:

- `job_labels`
  - `id uuid primary key`
  - `organization_id text not null references organization(id) on delete cascade`
  - `name text not null`
  - `normalized_name text not null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - `archived_at timestamptz`
- `work_item_labels`
  - `work_item_id uuid not null references work_items(id) on delete cascade`
  - `label_id uuid not null references job_labels(id) on delete cascade`
  - `organization_id text not null references organization(id) on delete cascade`
  - `created_at timestamptz not null default now()`
  - primary key on `work_item_id, label_id`

Indexes:

- active label lookup by organization and normalized name
- label list by organization/name
- assignment lookup by job
- assignment lookup by organization/label for filtering

The unique active name constraint should use a partial unique index on `(organization_id, normalized_name)` where `archived_at is null`.

## API Contract

Extend the jobs API with label endpoints:

- `GET /job-labels` lists active labels for the current organization.
- `POST /job-labels` creates an active label.
- `PATCH /job-labels/{labelId}` renames an active label.
- `DELETE /job-labels/{labelId}` archives a label and removes active job assignments.
- `POST /jobs/{workItemId}/labels` assigns an active label to a job.
- `DELETE /jobs/{workItemId}/labels/{labelId}` removes a label from a job.

Extend `GET /jobs` with `labelId` in `JobListQuerySchema`. The list query returns jobs that have the selected label.

Extend `GET /jobs/options` so it returns labels alongside members, regions, sites, and contacts. This keeps the jobs UI on the existing list/options loading model.

## Permissions

Preserve all existing status transition and patch permissions.

Label definition management:

- owners/admins can create, rename, and delete organization labels
- members cannot manage organization label definitions

Job label assignment:

- owners/admins can add or remove labels on any job
- assigned members can add or remove labels on jobs assigned to them
- unassigned members can view labels but cannot mutate job labels

This mirrors the current distinction between organization-level administration and assigned job operation.

## Activity

Add activity payloads:

- `label_added`: `labelId`, `labelName`
- `label_removed`: `labelId`, `labelName`

Store the label name in the activity payload at the time of the change so history remains readable after a label is renamed or deleted.

Update:

- `JOB_ACTIVITY_EVENT_TYPES`
- `JobActivityPayloadSchema`
- database event-type check
- `JobsActivityRecorder`
- `describeActivity` in the job detail sheet

Creating, renaming, and deleting label definitions does not write job activity because those actions are organization configuration, not job-specific history.

## Repository And Service Shape

Add `JobLabelsRepository` or extend `JobsRepository` only if the file remains readable. Prefer a focused `JobLabelsRepository` because label definition management is a separate responsibility from work item persistence.

Repository responsibilities:

- normalize label names for uniqueness
- create/list/update/archive labels
- ensure a label belongs to the actor organization and is active
- assign/remove labels to/from a job with organization checks
- load labels for job list and detail rows
- filter jobs by label

Service responsibilities:

- load the current actor
- enforce label definition permissions
- enforce job assignment permissions
- wrap assignment/removal in a transaction with activity logging
- map not-found and storage errors through the existing jobs error style

## UI Design

### Jobs List

Show label badges on each job row near the title/status metadata. Use existing `Badge` styles with a neutral variant; label colors are out of scope.

Add a Label command filter in the toolbar:

- options: "All labels" plus active organization labels
- updates `JobsListFilters.labelId`
- visible jobs filter checks `item.labels`
- active filter bar shows `Label: <name>`

The current route search only stores view mode. Keep label filtering in atom state for v1, consistent with the current status/assignee/site filters.

### Job Detail

Show labels in the drawer header beside status and priority.

Add a `Labels` detail section:

- shows currently assigned labels
- uses a Linear-like command popover to add existing labels
- allows assigned users/admins to remove assigned labels
- allows admins/owners to type a new label and choose `Create label: "<name>"`, then assign it to the job
- disables mutation controls for viewers without job label access

The inline creation pattern should follow `LinearContactSelect` in `jobs-create-sheet.tsx`: a custom `Popover` with `Command`, `CommandInput`, `CommandEmpty`, `CommandItem`, and an explicit create row.

No new global hotkey is needed for label assignment because it is a secondary detail-panel control and the command bar can already target current-job actions if later needed.

### Organization Settings

Add a `Labels` panel to organization settings:

- create label form
- list active labels
- inline rename action
- delete/archive action
- refresh route or local labels state after mutations

Use the existing `AppUtilityPanel` and row-list style used elsewhere in settings/members UI. The route is already admin-only, so the page can assume organization label management access.

## Error Handling

Add explicit typed errors for:

- label not found
- duplicate active label name
- label already assigned to job
- label not assigned to job

Duplicate assignment and missing removal may be treated as idempotent if that keeps the UI simpler, but tests must lock the chosen behavior. Prefer idempotent assignment/removal for v1 because it is friendlier under refetch/race conditions and avoids noisy client state errors.

## Testing

Core contract tests:

- label schemas trim and validate names
- list query accepts `labelId`
- activity payloads decode
- OpenAPI includes label endpoints

API/repository integration tests:

- create/list/update/archive organization labels
- reject duplicate active label names in one organization
- allow same label name in different organizations
- assign/remove a label to a job
- list/detail include labels
- filter jobs by label
- label assignment does not alter status

Service tests:

- admins can manage labels
- members cannot manage labels
- assigned members can add/remove labels on assigned jobs
- unassigned members cannot add/remove labels
- label add/remove records activity

App tests:

- jobs list renders labels and filters by label
- job detail renders labels and can assign/remove existing labels
- admin can create a label inline from job detail
- organization settings can create, rename, and delete labels
- activity text describes label add/remove

## Out Of Scope

- Replacing canonical statuses
- Label colors
- Workflow automation
- Customer-specific hardcoded labels
- Default seeded labels during organization creation
- Persisting label filters in the route search

## Self-Review

- Requirements coverage: the design supports organization-scoped labels, many labels per job, list/detail visibility, add/remove permissions, label filtering, activity logging, and tests.
- Status lifecycle: statuses remain unchanged and label assignment is modeled separately.
- Type/runtime boundaries: schemas are added at DTO/API boundaries and database constraints protect persistence.
- Ambiguity resolved: default labels are out of scope because there is no clean bootstrap hook; label colors are out of scope.
