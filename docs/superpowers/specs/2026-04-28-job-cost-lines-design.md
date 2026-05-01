# Job Cost Lines Design

## Goal

Jobs should capture operational costs for labour and materials without becoming an invoicing, payment, or accounting workflow.

This feature adds job-owned cost lines that are useful on the job detail screen today and structurally compatible with later invoicing.

## Scope

In scope:

- structured cost lines on a job
- two cost line types: `labour` and `material`
- description, quantity, unit price, optional tax/VAT rate storage, and calculated line totals
- job detail display of cost lines and summary total
- add-cost-line mutation for users with job-level access
- activity event when a cost line is created
- runtime validation at API and persistence boundaries
- tests for totals, API/service behavior, UI display, and activity logging

Out of scope:

- invoices
- invoice numbers
- payment status
- customer billing workflows
- accounting exports
- organization pricing catalogs
- per-company pricing defaults
- tax-inclusive totals or VAT reporting

## Existing Architecture

The jobs slice already uses a clean shared boundary:

- `packages/jobs-core` owns branded ids, domain values, DTO schemas, and the `HttpApi` contract.
- `apps/api/src/domains/jobs` owns Effect services, authorization, repositories, database schema, and HTTP handlers.
- `apps/app/src/features/jobs` owns TanStack app state, the browser API wrapper, and job detail UI.

Jobs are persisted as `work_items`. Comments, visits, and activity are child records of a work item. Job detail currently returns an aggregate containing `job`, `comments`, `activity`, and `visits`.

Cost lines should follow the same aggregate-child pattern as visits:

- a dedicated `work_item_cost_lines` table
- typed DTOs in `jobs-core`
- repository methods to add and list cost lines
- service authorization and transaction behavior
- detail state refresh after mutation
- a compact job detail section

## Data Model

Create a `work_item_cost_lines` table.

Columns:

- `id uuid primary key`
- `work_item_id uuid not null references work_items(id) on delete cascade`
- `organization_id text not null references organization(id) on delete cascade`
- `author_user_id text not null references user(id)`
- `type text not null`
- `description text not null`
- `quantity numeric(12,2) not null`
- `unit_price_minor integer not null`
- `tax_rate_basis_points integer null`
- `created_at timestamp with time zone not null default now()`

Checks:

- `type in ('labour', 'material')`
- `quantity > 0`
- `unit_price_minor >= 0`
- `tax_rate_basis_points is null or tax_rate_basis_points between 0 and 10000`

Indexes:

- `(work_item_id, created_at desc, id desc)`
- `(organization_id, created_at desc, id desc)`

Money is stored as minor units to avoid floating-point money errors. Quantity is stored as a decimal so both labour hours and material units can be represented. The first pass calculates pre-tax totals only. The optional tax/VAT field is stored but not included in totals until a later billing/tax feature defines the semantics.

## Shared Types And Calculations

Add shared schemas in `packages/jobs-core`:

- `JOB_COST_LINE_TYPES = ['labour', 'material']`
- `JobCostLineTypeSchema`
- `JobCostLineDescriptionSchema`
- `JobCostLineQuantitySchema`
- `JobCostLineUnitPriceMinorSchema`
- `JobCostLineTaxRateBasisPointsSchema`
- `JobCostLineSchema`
- `AddJobCostLineInputSchema`
- `AddJobCostLineResponseSchema`
- `JobCostSummarySchema`

DTO shape:

```ts
export const JobCostLineSchema = Schema.Struct({
  id: CostLineId,
  workItemId: WorkItemId,
  authorUserId: UserId,
  type: JobCostLineTypeSchema,
  description: JobCostLineDescriptionSchema,
  quantity: JobCostLineQuantitySchema,
  unitPriceMinor: JobCostLineUnitPriceMinorSchema,
  taxRateBasisPoints: Schema.optional(JobCostLineTaxRateBasisPointsSchema),
  lineTotalMinor: JobCostLineTotalMinorSchema,
  createdAt: IsoDateTimeString,
});
```

Add shared calculation helpers:

- `calculateJobCostLineTotalMinor(input)`
- `calculateJobCostSummary(costLines)`

The line total is derived as `Math.round(quantity * unitPriceMinor)`. This keeps the first pass simple and deterministic. It supports quantities such as `1.5` hours at `6500` minor units per hour, producing `9750`.

## API Contract

Add endpoint:

```http
POST /jobs/:workItemId/cost-lines
```

Payload:

```json
{
  "type": "labour",
  "description": "Install replacement valve",
  "quantity": 2,
  "unitPriceMinor": 6500,
  "taxRateBasisPoints": 2300
}
```

Response:

```json
{
  "id": "uuid",
  "workItemId": "uuid",
  "authorUserId": "user_id",
  "type": "labour",
  "description": "Install replacement valve",
  "quantity": 2,
  "unitPriceMinor": 6500,
  "taxRateBasisPoints": 2300,
  "lineTotalMinor": 13000,
  "createdAt": "2026-04-28T10:00:00.000Z"
}
```

Extend job detail:

```ts
export const JobDetailSchema = Schema.Struct({
  job: JobSchema,
  comments: Schema.Array(JobCommentSchema),
  activity: Schema.Array(JobActivitySchema),
  visits: Schema.Array(JobVisitSchema),
  costLines: Schema.Array(JobCostLineSchema),
  costSummary: JobCostSummarySchema,
});
```

## Authorization

Users can view cost lines when they can view the job.

Users can add cost lines when:

- they are an owner or admin in the organization, or
- they are the assigned member on the job

This matches the current operational access model for visit logging and avoids introducing billing-specific permissions.

## Activity

Add a new activity event:

```ts
{
  eventType: ("cost_line_added", costLineId, costLineType);
}
```

The UI should describe this as:

- `Taylor Owner added a labour cost line.`
- `Taylor Owner added a material cost line.`

Activity stays separate from comments. Cost line creation does not create a comment.

## UI

Add a `Costs` section to job detail, near visits because both are execution records.

The section contains:

- a summary row showing `Cost total`
- an add form for permitted users
- a list of existing cost lines

Form fields:

- Type: command/select with `Labour` and `Material`
- Description: text input
- Quantity: numeric input, decimal step `0.25`
- Unit price: numeric input shown in currency units and converted to minor units in the submit handler

Display:

- cost type badge
- description
- quantity and unit price
- line total

Do not use customer-facing billing language. Use `Costs`, `Cost total`, `Add cost line`, and `Line total`; do not use `Invoice`, `Bill`, `Payment`, or `Amount due`.

## Keyboard Access

Adding a cost line is a new drawer workflow action, so it needs keyboard access under the project hotkey rule.

Add:

- `jobDetailCost`: hotkey `X`, label `Focus cost line`

The existing `jobDetailSubmit` hotkey should submit the focused form area when focus is inside the cost form.

## Error Handling

Validation errors should happen at the shared schema boundary before service logic:

- blank description fails
- quantity must be positive
- unit price must be a non-negative integer minor-unit value
- tax rate, when present, must be between `0` and `10000`

Service errors should mirror existing job mutations:

- missing job returns `JobNotFoundError`
- unauthorized add returns `JobAccessDeniedError`
- SQL failures map to `JobStorageError`

## Testing Strategy

Add focused tests at each boundary:

- `packages/jobs-core`: validates add-cost-line input and calculation helpers
- `apps/api` repository integration: detail aggregates cost lines and summary
- `apps/api` service: assigned users can add, unassigned members cannot, activity is recorded
- `apps/api` HTTP integration: endpoint creates a line and final detail includes activity
- `apps/app`: job detail displays totals and keeps optimistic cost lines visible if refresh fails

## Self-Review

- Spec coverage: every requested requirement is covered by the data model, API, authorization, activity, UI, and test sections.
- Placeholder scan: no deferred fields or unspecified behavior remain.
- Scope check: this is one cohesive jobs-domain feature and does not require decomposition.
- Ambiguity check: tax/VAT storage is included, but tax calculation is explicitly deferred.
