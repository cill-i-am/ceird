# Job Cost Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured labour and material cost lines to job detail without building invoicing.

**Architecture:** Model cost lines as organization-scoped child records of `work_items`, parallel to visits. Shared Effect schemas in `packages/jobs-core` define runtime validation and DTOs; the API service persists and records activity in one transaction; the app renders a compact operational `Costs` section on the existing job detail drawer.

**Tech Stack:** TypeScript, Effect Schema, Effect HttpApi, Effect services, Drizzle PostgreSQL schema/migrations, TanStack Start/Router, Effect Atom, Vitest, Testing Library.

---

## File Structure

- Modify `packages/jobs-core/src/ids.ts`: add `CostLineId` brand.
- Modify `packages/jobs-core/src/domain.ts`: add cost line type constants and validation schemas.
- Modify `packages/jobs-core/src/dto.ts`: add cost line DTOs, add-cost-line input/response, summary schema, detail fields, and calculation helpers.
- Modify `packages/jobs-core/src/http-api.ts`: add `POST /jobs/:workItemId/cost-lines`.
- Modify `packages/jobs-core/src/index.test.ts`: add schema and calculation tests.
- Modify `apps/api/src/domains/jobs/id-generation.ts`: add `generateCostLineId`.
- Modify `apps/api/src/domains/jobs/schema.ts`: add `workItemCostLine` table, relations, schema export, and activity event check support.
- Add `apps/api/drizzle/0010_job_cost_lines.sql`: create table and widen activity check constraint.
- Modify `apps/api/src/platform/database/schema.ts`: re-export cost line table and relations.
- Modify `apps/api/src/domains/jobs/repositories.ts`: map cost lines, aggregate them into detail, add `addCostLine`.
- Modify `apps/api/src/domains/jobs/activity-recorder.ts`: record `cost_line_added`.
- Modify `apps/api/src/domains/jobs/authorization.ts`: add `ensureCanAddCostLine`.
- Modify `apps/api/src/domains/jobs/service.ts`: add `addCostLine` service method.
- Modify `apps/api/src/domains/jobs/http.ts`: handle `addJobCostLine`.
- Modify `apps/api/src/domains/jobs/service.test.ts`: cover add-cost-line authorization and activity.
- Modify `apps/api/src/domains/jobs/repositories.integration.test.ts`: cover detail aggregate cost lines and summary.
- Modify `apps/api/src/domains/jobs/http.integration.test.ts`: cover endpoint and final detail activity.
- Modify `apps/app/src/hotkeys/hotkey-registry.ts`: add `jobDetailCost`.
- Modify `apps/app/src/features/jobs/jobs-detail-state.ts`: add add-cost-line mutation and optimistic insert.
- Modify `apps/app/src/features/jobs/jobs-detail-sheet.tsx`: render cost summary, form, list, activity text, and hotkey focus behavior.
- Modify `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`: cover display and optimistic behavior.

---

### Task 1: Shared Cost Line Types And Calculations

**Files:**

- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Test: `packages/jobs-core/src/index.test.ts`

- [ ] **Step 1: Write failing core tests**

Add these tests to `packages/jobs-core/src/index.test.ts`:

```ts
import {
  AddJobCostLineInputSchema,
  calculateJobCostLineTotalMinor,
  calculateJobCostSummary,
} from "./index";
import { ParseResult } from "effect";

describe("job cost lines", () => {
  it("validates add cost line input at the boundary", () => {
    const decode = ParseResult.decodeUnknownSync(AddJobCostLineInputSchema);

    expect(
      decode({
        description: "Install replacement valve",
        quantity: 1.5,
        taxRateBasisPoints: 2300,
        type: "labour",
        unitPriceMinor: 6500,
      })
    ).toStrictEqual({
      description: "Install replacement valve",
      quantity: 1.5,
      taxRateBasisPoints: 2300,
      type: "labour",
      unitPriceMinor: 6500,
    });

    expect(() =>
      decode({
        description: "",
        quantity: 0,
        type: "material",
        unitPriceMinor: -1,
      })
    ).toThrow();
  });

  it("calculates line totals and job cost summaries in minor units", () => {
    expect(
      calculateJobCostLineTotalMinor({
        quantity: 1.5,
        unitPriceMinor: 6500,
      })
    ).toBe(9750);

    expect(
      calculateJobCostSummary([
        {
          lineTotalMinor: 9750,
        },
        {
          lineTotalMinor: 2599,
        },
      ])
    ).toStrictEqual({
      subtotalMinor: 12_349,
    });
  });
});
```

- [ ] **Step 2: Run the failing core tests**

Run:

```bash
pnpm --dir packages/jobs-core exec vitest run src/index.test.ts
```

Expected: FAIL because `AddJobCostLineInputSchema`, `calculateJobCostLineTotalMinor`, and `calculateJobCostSummary` do not exist.

- [ ] **Step 3: Add the cost line id brand**

In `packages/jobs-core/src/ids.ts`, add after `VisitId`:

```ts
export const CostLineId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/CostLineId")
);
export type CostLineId = Schema.Schema.Type<typeof CostLineId>;
```

- [ ] **Step 4: Add domain schemas**

In `packages/jobs-core/src/domain.ts`, add near the activity constants:

```ts
export const JOB_COST_LINE_TYPES = ["labour", "material"] as const;
export const JobCostLineTypeSchema = Schema.Literal(...JOB_COST_LINE_TYPES);
export type JobCostLineType = Schema.Schema.Type<typeof JobCostLineTypeSchema>;

export const JobCostLineDescriptionSchema = Schema.Trim.pipe(
  Schema.minLength(1)
);
export type JobCostLineDescription = Schema.Schema.Type<
  typeof JobCostLineDescriptionSchema
>;

export const JobCostLineQuantitySchema = Schema.Number.pipe(
  Schema.positive(),
  Schema.filter((value) => Number.isFinite(value)),
  Schema.annotations({
    message: () => "Expected a positive finite quantity",
  })
);
export type JobCostLineQuantity = Schema.Schema.Type<
  typeof JobCostLineQuantitySchema
>;

export const JobCostLineUnitPriceMinorSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(0)
);
export type JobCostLineUnitPriceMinor = Schema.Schema.Type<
  typeof JobCostLineUnitPriceMinorSchema
>;

export const JobCostLineTaxRateBasisPointsSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(10000)
);
export type JobCostLineTaxRateBasisPoints = Schema.Schema.Type<
  typeof JobCostLineTaxRateBasisPointsSchema
>;

export const JobCostLineTotalMinorSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(0)
);
export type JobCostLineTotalMinor = Schema.Schema.Type<
  typeof JobCostLineTotalMinorSchema
>;
```

Extend `JOB_ACTIVITY_EVENT_TYPES` with:

```ts
"cost_line_added",
```

- [ ] **Step 5: Add DTOs and calculations**

In `packages/jobs-core/src/dto.ts`, import the new domain schemas and `CostLineId`.

Add after `JobVisitSchema`:

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
export type JobCostLine = Schema.Schema.Type<typeof JobCostLineSchema>;

export const JobCostSummarySchema = Schema.Struct({
  subtotalMinor: JobCostLineTotalMinorSchema,
});
export type JobCostSummary = Schema.Schema.Type<typeof JobCostSummarySchema>;

export const AddJobCostLineInputSchema = Schema.Struct({
  type: JobCostLineTypeSchema,
  description: JobCostLineDescriptionSchema,
  quantity: JobCostLineQuantitySchema,
  unitPriceMinor: JobCostLineUnitPriceMinorSchema,
  taxRateBasisPoints: Schema.optional(JobCostLineTaxRateBasisPointsSchema),
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type AddJobCostLineInput = Schema.Schema.Type<
  typeof AddJobCostLineInputSchema
>;

export const AddJobCostLineResponseSchema = JobCostLineSchema;
export type AddJobCostLineResponse = Schema.Schema.Type<
  typeof AddJobCostLineResponseSchema
>;

export function calculateJobCostLineTotalMinor(input: {
  readonly quantity: number;
  readonly unitPriceMinor: number;
}): number {
  return Math.round(input.quantity * input.unitPriceMinor);
}

export function calculateJobCostSummary(
  costLines: readonly Pick<JobCostLine, "lineTotalMinor">[]
): JobCostSummary {
  return {
    subtotalMinor: costLines.reduce(
      (subtotal, costLine) => subtotal + costLine.lineTotalMinor,
      0
    ),
  };
}
```

Add the activity payload schema:

```ts
export const JobActivityCostLineAddedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("cost_line_added"),
  costLineId: CostLineId,
  costLineType: JobCostLineTypeSchema,
});
```

Include `JobActivityCostLineAddedPayloadSchema` in `JobActivityPayloadSchema`.

Extend `JobDetailSchema`:

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

- [ ] **Step 6: Add the HTTP endpoint contract**

In `packages/jobs-core/src/http-api.ts`, import `AddJobCostLineInputSchema` and `AddJobCostLineResponseSchema`.

Add to the jobs group after `addJobVisit`:

```ts
.add(
  HttpApiEndpoint.post("addJobCostLine", "/jobs/:workItemId/cost-lines")
    .setPath(Schema.Struct({ workItemId: WorkItemId }))
    .setPayload(AddJobCostLineInputSchema)
    .addSuccess(AddJobCostLineResponseSchema, { status: 201 })
    .addError(JobNotFoundError)
    .addError(JobAccessDeniedError)
    .addError(JobStorageError)
)
```

- [ ] **Step 7: Run core tests**

Run:

```bash
pnpm --dir packages/jobs-core exec vitest run src/index.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit shared contracts**

Run:

```bash
git add packages/jobs-core/src/ids.ts packages/jobs-core/src/domain.ts packages/jobs-core/src/dto.ts packages/jobs-core/src/http-api.ts packages/jobs-core/src/index.test.ts
git commit -m "feat: add job cost line contracts"
```

---

### Task 2: API Persistence And Detail Aggregation

**Files:**

- Modify: `apps/api/src/domains/jobs/id-generation.ts`
- Modify: `apps/api/src/domains/jobs/schema.ts`
- Add: `apps/api/drizzle/0010_job_cost_lines.sql`
- Modify: `apps/api/src/platform/database/schema.ts`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Test: `apps/api/src/domains/jobs/repositories.integration.test.ts`

- [ ] **Step 1: Write failing repository integration assertions**

In `apps/api/src/domains/jobs/repositories.integration.test.ts`, inside `creates aggregate job detail across jobs, comments, activity, and visits`, add a cost line insert inside the existing transaction after `JobsRepository.addVisit`:

```ts
yield *
  JobsRepository.addCostLine({
    authorUserId: identity.ownerUserId,
    description: "Replacement seal kit",
    organizationId: identity.organizationId,
    quantity: 2,
    taxRateBasisPoints: 2300,
    type: "material",
    unitPriceMinor: 2599,
    workItemId: job.id,
  });
```

Add these expectations after the visit assertions:

```ts
expect(detailValue.costLines).toHaveLength(1);
expect(detailValue.costLines[0]).toMatchObject({
  description: "Replacement seal kit",
  lineTotalMinor: 5198,
  quantity: 2,
  taxRateBasisPoints: 2300,
  type: "material",
  unitPriceMinor: 2599,
});
expect(detailValue.costSummary).toStrictEqual({
  subtotalMinor: 5198,
});
```

- [ ] **Step 2: Run failing repository integration test**

Run:

```bash
pnpm --dir apps/api exec vitest run src/domains/jobs/repositories.integration.test.ts
```

Expected: FAIL because repository cost line APIs do not exist.

- [ ] **Step 3: Add id generation**

In `apps/api/src/domains/jobs/id-generation.ts`, add:

```ts
export function generateCostLineId() {
  return generateJobDomainUuid();
}
```

- [ ] **Step 4: Add database schema**

In `apps/api/src/domains/jobs/schema.ts`, import `JOB_COST_LINE_TYPES` and define:

```ts
const costLineTypeValuesSql = sql.raw(
  JOB_COST_LINE_TYPES.map((value) => `'${value}'`).join(", ")
);
```

Add after `workItemVisit`:

```ts
export const workItemCostLine = pgTable(
  "work_item_cost_lines",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points"),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    check(
      "work_item_cost_lines_type_chk",
      sql`${table.type} in (${costLineTypeValuesSql})`
    ),
    check(
      "work_item_cost_lines_quantity_positive_chk",
      sql`${table.quantity} > 0`
    ),
    check(
      "work_item_cost_lines_unit_price_non_negative_chk",
      sql`${table.unitPriceMinor} >= 0`
    ),
    check(
      "work_item_cost_lines_tax_rate_range_chk",
      sql`${table.taxRateBasisPoints} is null or (${table.taxRateBasisPoints} >= 0 and ${table.taxRateBasisPoints} <= 10000)`
    ),
    index("work_item_cost_lines_work_item_created_at_idx").on(
      table.workItemId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("work_item_cost_lines_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc()
    ),
  ]
);
```

Add `costLines: many(workItemCostLine)` to `workItemRelations`.

Add:

```ts
export const workItemCostLineRelations = relations(
  workItemCostLine,
  ({ one }) => ({
    author: one(user, {
      fields: [workItemCostLine.authorUserId],
      references: [user.id],
    }),
    organization: one(organization, {
      fields: [workItemCostLine.organizationId],
      references: [organization.id],
    }),
    workItem: one(workItem, {
      fields: [workItemCostLine.workItemId],
      references: [workItem.id],
    }),
  })
);
```

Export `workItemCostLine` in `jobsSchema`.

- [ ] **Step 5: Add migration**

Create `apps/api/drizzle/0010_job_cost_lines.sql`:

```sql
CREATE TABLE "work_item_cost_lines" (
  "id" uuid PRIMARY KEY NOT NULL,
  "work_item_id" uuid NOT NULL,
  "organization_id" text NOT NULL,
  "author_user_id" text NOT NULL,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(12, 2) NOT NULL,
  "unit_price_minor" integer NOT NULL,
  "tax_rate_basis_points" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "work_item_cost_lines_type_chk" CHECK ("work_item_cost_lines"."type" in ('labour', 'material')),
  CONSTRAINT "work_item_cost_lines_quantity_positive_chk" CHECK ("work_item_cost_lines"."quantity" > 0),
  CONSTRAINT "work_item_cost_lines_unit_price_non_negative_chk" CHECK ("work_item_cost_lines"."unit_price_minor" >= 0),
  CONSTRAINT "work_item_cost_lines_tax_rate_range_chk" CHECK ("work_item_cost_lines"."tax_rate_basis_points" is null or ("work_item_cost_lines"."tax_rate_basis_points" >= 0 and "work_item_cost_lines"."tax_rate_basis_points" <= 10000))
);
--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_activity" DROP CONSTRAINT "work_item_activity_event_type_chk";
--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_event_type_chk" CHECK ("work_item_activity"."event_type" in ('job_created', 'status_changed', 'blocked_reason_changed', 'priority_changed', 'assignee_changed', 'coordinator_changed', 'site_changed', 'contact_changed', 'job_reopened', 'visit_logged', 'cost_line_added'));
--> statement-breakpoint
CREATE INDEX "work_item_cost_lines_work_item_created_at_idx" ON "work_item_cost_lines" USING btree ("work_item_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "work_item_cost_lines_organization_created_at_idx" ON "work_item_cost_lines" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
```

Then update `apps/api/drizzle/meta/_journal.json` by appending:

```json
{
  "idx": 10,
  "version": "7",
  "when": 1777330000000,
  "tag": "0010_job_cost_lines",
  "breakpoints": true
}
```

- [ ] **Step 6: Re-export schema**

In `apps/api/src/platform/database/schema.ts`, add `workItemCostLine` and `workItemCostLineRelations` to the jobs exports.

- [ ] **Step 7: Add repository cost line methods**

In `apps/api/src/domains/jobs/repositories.ts`, import:

```ts
JobCostLineSchema,
calculateJobCostLineTotalMinor,
calculateJobCostSummary,
CostLineId as CostLineIdSchema,
```

Add row and input types:

```ts
interface WorkItemCostLineRow {
  readonly author_user_id: string;
  readonly created_at: Date;
  readonly description: string;
  readonly id: string;
  readonly organization_id: string;
  readonly quantity: string;
  readonly tax_rate_basis_points: number | null;
  readonly type: string;
  readonly unit_price_minor: number;
  readonly work_item_id: string;
}

export interface AddJobCostLineRecordInput {
  readonly authorUserId: UserId;
  readonly description: string;
  readonly organizationId: OrganizationId;
  readonly quantity: number;
  readonly taxRateBasisPoints?: number;
  readonly type: JobCostLineType;
  readonly unitPriceMinor: number;
  readonly workItemId: WorkItemId;
}
```

Add decoders:

```ts
const decodeJobCostLine = Schema.decodeUnknownSync(JobCostLineSchema);
```

In `getDetail`, query cost lines in the `Effect.all` block:

```ts
sql<WorkItemCostLineRow>`
  select *
  from work_item_cost_lines
  where work_item_id = ${workItemId}
  order by created_at desc, id desc
`;
```

Map and return:

```ts
const mappedCostLines = costLines.map(mapJobCostLineRow);

return Option.some(
  decodeJobDetail({
    activity: activity.map(mapJobActivityRow),
    comments: comments.map(mapJobCommentRow),
    costLines: mappedCostLines,
    costSummary: calculateJobCostSummary(mappedCostLines),
    job,
    visits: visits.map(mapJobVisitRow),
  })
);
```

Add repository method:

```ts
const addCostLine = Effect.fn("JobsRepository.addCostLine")(function* (
  input: AddJobCostLineRecordInput
) {
  yield* ensureWorkItemOrganizationMatches(
    input.organizationId,
    input.workItemId
  );
  yield* ensureOrganizationMember(input.organizationId, input.authorUserId, {
    forUpdate: true,
  });

  const rows = yield* sql<WorkItemCostLineRow>`
    insert into work_item_cost_lines ${sql
      .insert({
        author_user_id: input.authorUserId,
        description: input.description,
        id: generateCostLineId(),
        organization_id: input.organizationId,
        quantity: input.quantity.toFixed(2),
        tax_rate_basis_points: input.taxRateBasisPoints ?? null,
        type: input.type,
        unit_price_minor: input.unitPriceMinor,
        work_item_id: input.workItemId,
      })
      .returning("*")}
  `;

  return mapJobCostLineRow(
    getRequiredRow(rows, "inserted work item cost line")
  );
});
```

Include `addCostLine` in the returned repository object.

Add mapper:

```ts
function mapJobCostLineRow(row: WorkItemCostLineRow): JobCostLine {
  const quantity = Number(row.quantity);
  const unitPriceMinor = row.unit_price_minor;

  return decodeJobCostLine({
    authorUserId: row.author_user_id,
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: row.id,
    lineTotalMinor: calculateJobCostLineTotalMinor({
      quantity,
      unitPriceMinor,
    }),
    quantity,
    taxRateBasisPoints: nullableToUndefined(row.tax_rate_basis_points),
    type: row.type,
    unitPriceMinor,
    workItemId: row.work_item_id,
  });
}
```

- [ ] **Step 8: Run repository integration test**

Run:

```bash
pnpm --dir apps/api exec vitest run src/domains/jobs/repositories.integration.test.ts
```

Expected: PASS when a local integration database is available, or SKIP with the existing database-unavailable message.

- [ ] **Step 9: Commit persistence**

Run:

```bash
git add apps/api/src/domains/jobs/id-generation.ts apps/api/src/domains/jobs/schema.ts apps/api/drizzle/0010_job_cost_lines.sql apps/api/drizzle/meta/_journal.json apps/api/src/platform/database/schema.ts apps/api/src/domains/jobs/repositories.ts apps/api/src/domains/jobs/repositories.integration.test.ts
git commit -m "feat: persist job cost lines"
```

---

### Task 3: API Service, Authorization, Activity, And HTTP

**Files:**

- Modify: `apps/api/src/domains/jobs/authorization.ts`
- Modify: `apps/api/src/domains/jobs/activity-recorder.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Test: `apps/api/src/domains/jobs/service.test.ts`
- Test: `apps/api/src/domains/jobs/http.integration.test.ts`

- [ ] **Step 1: Write failing service test**

In `apps/api/src/domains/jobs/service.test.ts`, import `CostLineId` and define:

```ts
const decodeCostLineId = Schema.decodeUnknownSync(CostLineId);
const costLineId = decodeCostLineId("99999999-9999-4999-8999-999999999998");
```

Add `addCostLine: 0` to harness calls.

Add an `addCostLine` mock to `JobsRepository.make`:

```ts
addCostLine: (input: {
  readonly authorUserId: UserId;
  readonly description: string;
  readonly organizationId: OrganizationId;
  readonly quantity: number;
  readonly taxRateBasisPoints?: number;
  readonly type: "labour" | "material";
  readonly unitPriceMinor: number;
  readonly workItemId: Job["id"];
}) =>
  Effect.sync(() => {
    calls.addCostLine += 1;

    return {
      authorUserId: input.authorUserId,
      createdAt: "2026-04-22T14:00:00.000Z",
      description: input.description,
      id: costLineId,
      lineTotalMinor: Math.round(input.quantity * input.unitPriceMinor),
      quantity: input.quantity,
      taxRateBasisPoints: input.taxRateBasisPoints,
      type: input.type,
      unitPriceMinor: input.unitPriceMinor,
      workItemId: input.workItemId,
    };
  }),
```

Add test:

```ts
it("adds a job cost line and records activity for the assigned user", async () => {
  const harness = makeHarness({
    actor: makeActor("member"),
    lockedJob: makeJob({
      assigneeId: actorUserId,
    }),
  });

  await expect(
    runJobsService(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addCostLine(workItemId, {
          description: "Replacement valve",
          quantity: 1.5,
          taxRateBasisPoints: 2300,
          type: "material",
          unitPriceMinor: 4200,
        });
      }),
      harness
    )
  ).resolves.toMatchObject({
    description: "Replacement valve",
    lineTotalMinor: 6300,
    type: "material",
  });

  expect(harness.calls.findByIdForUpdate).toBe(1);
  expect(harness.calls.addCostLine).toBe(1);
  expect(harness.calls.addActivity).toBe(1);
});

it("rejects cost line creation for unassigned regular members", async () => {
  const harness = makeHarness({
    actor: makeActor("member"),
    lockedJob: makeJob({
      assigneeId: "unassigned_user" as UserId,
    }),
  });

  const exit = await runJobsServiceExit(
    Effect.gen(function* () {
      const jobs = yield* JobsService;

      return yield* jobs.addCostLine(workItemId, {
        description: "Replacement valve",
        quantity: 1,
        type: "material",
        unitPriceMinor: 4200,
      });
    }),
    harness
  );

  expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
  expect(harness.calls.findByIdForUpdate).toBe(1);
  expect(harness.calls.addCostLine).toBe(0);
  expect(harness.calls.addActivity).toBe(0);
});
```

- [ ] **Step 2: Run failing service tests**

Run:

```bash
pnpm --dir apps/api exec vitest run src/domains/jobs/service.test.ts
```

Expected: FAIL because service and authorization methods do not exist.

- [ ] **Step 3: Add authorization**

In `apps/api/src/domains/jobs/authorization.ts`, add:

```ts
const ensureCanAddCostLine = Effect.fn(
  "JobsAuthorization.ensureCanAddCostLine"
)((actor: JobsActor, job: Job) =>
  hasElevatedAccess(actor) || job.assigneeId === actor.userId
    ? Effect.void
    : Effect.fail(
        makeAccessDenied(
          "Members can only add cost lines on jobs assigned to them",
          job.id
        )
      )
);
```

Return `ensureCanAddCostLine`.

- [ ] **Step 4: Add activity recorder method**

In `apps/api/src/domains/jobs/activity-recorder.ts`, import `CostLineIdType` and `JobCostLineType`.

Add:

```ts
const recordCostLineAdded = Effect.fn(
  "JobsActivityRecorder.recordCostLineAdded"
)(function* (
  actor: JobsActor,
  input: {
    readonly costLineId: CostLineId;
    readonly costLineType: JobCostLineType;
    readonly workItemId: Job["id"];
  }
) {
  yield* repository.addActivity({
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    payload: {
      costLineId: input.costLineId,
      costLineType: input.costLineType,
      eventType: "cost_line_added",
    },
    workItemId: input.workItemId,
  });
});
```

Return `recordCostLineAdded`.

- [ ] **Step 5: Add service method**

In `apps/api/src/domains/jobs/service.ts`, import `AddJobCostLineInput`.

Add method after `addVisit`:

```ts
const addCostLine = Effect.fn("JobsService.addCostLine")(function* (
  workItemId: WorkItemId,
  input: AddJobCostLineInput
) {
  const actor = yield* loadActor(workItemId);

  const result = yield* jobsRepository
    .withTransaction(
      Effect.gen(function* () {
        const job = yield* jobsRepository
          .findByIdForUpdate(actor.organizationId, workItemId)
          .pipe(Effect.map(Option.getOrUndefined));

        if (job === undefined) {
          return yield* Effect.fail(
            new JobNotFoundError({
              message: "Job does not exist",
              workItemId,
            })
          );
        }

        yield* authorization.ensureCanAddCostLine(actor, job);

        const costLine = yield* jobsRepository.addCostLine({
          authorUserId: actor.userId,
          description: input.description,
          organizationId: actor.organizationId,
          quantity: input.quantity,
          taxRateBasisPoints: input.taxRateBasisPoints,
          type: input.type,
          unitPriceMinor: input.unitPriceMinor,
          workItemId,
        });

        yield* activityRecorder.recordCostLineAdded(actor, {
          costLineId: costLine.id,
          costLineType: costLine.type,
          workItemId,
        });

        return costLine;
      })
    )
    .pipe(Effect.either);

  if (Either.isRight(result)) {
    return result.right;
  }

  switch (result.left._tag) {
    case ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG: {
      return yield* result.left.userId === actor.userId
        ? Effect.fail(
            new JobAccessDeniedError({
              message:
                "Your organization access changed while the request was running",
              workItemId,
            })
          )
        : Effect.die(result.left);
    }
    case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
      return yield* Effect.die(result.left);
    }
    case "SqlError": {
      return yield* failJobsStorageError(result.left);
    }
    default: {
      return yield* Effect.fail(result.left);
    }
  }
});
```

Return `addCostLine`.

- [ ] **Step 6: Wire HTTP handler**

In `apps/api/src/domains/jobs/http.ts`, add handler:

```ts
.handle("addJobCostLine", ({ path, payload }) =>
  jobsService.addCostLine(path.workItemId, payload)
)
```

- [ ] **Step 7: Extend HTTP integration workflow**

In `apps/api/src/domains/jobs/http.integration.test.ts`, after the valid visit response, add:

```ts
const costLineResponse = await api.handler(
  makeJsonRequest(
    `/jobs/${createdJob.id}/cost-lines`,
    {
      description: "Replacement expansion vessel",
      quantity: 1,
      taxRateBasisPoints: 2300,
      type: "material",
      unitPriceMinor: 18_500,
    },
    {
      cookieJar: memberCookieJar,
    }
  )
);
expect(costLineResponse.status).toBe(201);
const costLine = (await costLineResponse.json()) as {
  readonly lineTotalMinor: number;
};
expect(costLine.lineTotalMinor).toBe(18_500);
```

Extend final detail typing and assertions:

```ts
readonly costLines: readonly unknown[];
readonly costSummary: {
  readonly subtotalMinor: number;
};
```

```ts
expect(finalDetail.costLines).toHaveLength(1);
expect(finalDetail.costSummary.subtotalMinor).toBe(18_500);
expect(finalDetail.activity.length).toBeGreaterThanOrEqual(8);
```

- [ ] **Step 8: Run API service and HTTP tests**

Run:

```bash
pnpm --dir apps/api exec vitest run src/domains/jobs/service.test.ts src/domains/jobs/http.integration.test.ts
```

Expected: PASS when the integration database is available; HTTP integration may SKIP with the existing database-unavailable message.

- [ ] **Step 9: Commit service and endpoint**

Run:

```bash
git add apps/api/src/domains/jobs/authorization.ts apps/api/src/domains/jobs/activity-recorder.ts apps/api/src/domains/jobs/service.ts apps/api/src/domains/jobs/http.ts apps/api/src/domains/jobs/service.test.ts apps/api/src/domains/jobs/http.integration.test.ts
git commit -m "feat: add job cost line API"
```

---

### Task 4: App State And Job Detail UI

**Files:**

- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify: `apps/app/src/features/jobs/jobs-detail-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Test: `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`

- [ ] **Step 1: Write failing app integration test**

In `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`, add `CostLineIdType` to imports.

Add `mockedAddJobCostLine` to the hoisted mocks and reset it in `beforeEach`.

Add the client mock method:

```ts
addJobCostLine: mockedAddJobCostLine,
```

Extend `buildDetail()`:

```ts
costLines: [
  {
    authorUserId: actorUserId,
    createdAt: "2026-04-23T12:00:00.000Z",
    description: "Replacement relay",
    id: "99999999-9999-4999-8999-999999999999" as CostLineIdType,
    lineTotalMinor: 4500,
    quantity: 1,
    type: "material",
    unitPriceMinor: 4500,
    workItemId,
  },
],
costSummary: {
  subtotalMinor: 4500,
},
```

Add test:

```ts
it(
  "shows cost totals and keeps a newly added cost line visible when refresh fails",
  {
    timeout: 10_000,
  },
  async () => {
    mockedAddJobCostLine.mockReturnValue(
      Effect.succeed({
        authorUserId: actorUserId,
        createdAt: "2026-04-24T13:00:00.000Z",
        description: "Two hours install labour",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab" as CostLineIdType,
        lineTotalMinor: 13_000,
        quantity: 2,
        type: "labour",
        unitPriceMinor: 6500,
        workItemId,
      })
    );
    mockedGetJobDetail.mockReturnValue(
      Effect.fail(new Error("refresh failed"))
    );

    const user = userEvent.setup();
    renderDetailSheet();

    expect(screen.getByText("Cost total")).toBeInTheDocument();
    expect(screen.getByText("€45.00")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Cost type"), "labour");
    await user.type(
      screen.getByLabelText("Cost description"),
      "Two hours install labour"
    );
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "2");
    await user.clear(screen.getByLabelText("Unit price"));
    await user.type(screen.getByLabelText("Unit price"), "65");
    await user.click(screen.getByRole("button", { name: /add cost line/i }));

    await expect(
      screen.findByText("Two hours install labour")
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("€175.00")).toBeInTheDocument();
    expect(
      screen.queryByText(/that update didn't land/i)
    ).not.toBeInTheDocument();
  }
);
```

- [ ] **Step 2: Run failing app integration test**

Run:

```bash
pnpm --dir apps/app exec vitest run src/features/jobs/jobs-detail-sheet.integration.test.tsx
```

Expected: FAIL because state, API call, and UI do not exist.

- [ ] **Step 3: Add hotkey definition**

In `apps/app/src/hotkeys/hotkey-registry.ts`, add near other job detail hotkeys:

```ts
jobDetailCost: {
  group: "Job drawer",
  hotkey: "X",
  id: "jobDetailCost",
  label: "Focus cost line",
  scope: "job-detail",
},
```

- [ ] **Step 4: Add state mutation**

In `apps/app/src/features/jobs/jobs-detail-state.ts`, import `AddJobCostLineInput` and `AddJobCostLineResponse`.

Add atom family:

```ts
export const addJobCostLineMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, AddJobCostLineResponse, AddJobCostLineInput>(
      (input, get) =>
        addBrowserJobCostLine(workItemId, input).pipe(
          Effect.tap((costLine) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                insertJobCostLine(get, workItemId, costLine);
              });

              yield* refreshJobDetailIfPossible(get, workItemId);
            })
          )
        )
    )
);
```

Add API wrapper:

```ts
function addBrowserJobCostLine(
  workItemId: WorkItemIdType,
  input: AddJobCostLineInput
) {
  return runBrowserJobsRequest("JobsBrowser.addJobCostLine", (client) =>
    client.jobs.addJobCostLine({
      path: { workItemId },
      payload: input,
    })
  );
}
```

Add optimistic insert:

```ts
function insertJobCostLine(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  costLine: AddJobCostLineResponse
) {
  const currentDetail = get(jobDetailStateAtomFamily(workItemId));

  if (currentDetail === null) {
    return;
  }

  const costLines = [
    costLine,
    ...currentDetail.costLines.filter((current) => current.id !== costLine.id),
  ].sort((left, right) => {
    const createdAtOrder = right.createdAt.localeCompare(left.createdAt);

    return createdAtOrder === 0
      ? String(right.id).localeCompare(String(left.id))
      : createdAtOrder;
  });

  get.set(jobDetailStateAtomFamily(workItemId), {
    ...currentDetail,
    costLines,
    costSummary: {
      subtotalMinor: costLines.reduce(
        (subtotal, current) => subtotal + current.lineTotalMinor,
        0
      ),
    },
  });
}
```

- [ ] **Step 5: Add UI state, handlers, and section**

In `apps/app/src/features/jobs/jobs-detail-sheet.tsx`, import `HOTKEYS`, `useAppHotkey`, and `addJobCostLineMutationAtomFamily`.

Add state:

```ts
const costLineResult = useAtomValue(
  addJobCostLineMutationAtomFamily(workItemId)
);
const addJobCostLine = useAtomSet(
  addJobCostLineMutationAtomFamily(workItemId),
  {
    mode: "promiseExit",
  }
);
const canAddCostLine = hasAssignmentAccess;
const costDescriptionRef = React.useRef<HTMLInputElement>(null);
const [costLineType, setCostLineType] =
  React.useState<JobDetailResponse["costLines"][number]["type"]>("labour");
const [costDescription, setCostDescription] = React.useState("");
const [costQuantity, setCostQuantity] = React.useState("1");
const [costUnitPrice, setCostUnitPrice] = React.useState("");
const [costError, setCostError] = React.useState<string | null>(null);
```

Register focus hotkey:

```ts
useAppHotkey(
  "jobDetailCost",
  () => {
    costDescriptionRef.current?.focus();
  },
  {
    enabled: canAddCostLine,
  }
);
```

Add submit handler:

```ts
async function handleAddCostLine(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const quantity = Number(costQuantity);
  const unitPriceMajor = Number(costUnitPrice);

  if (costDescription.trim().length === 0) {
    setCostError("Add a short cost description.");
    return;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    setCostError("Quantity must be greater than zero.");
    return;
  }

  if (!Number.isFinite(unitPriceMajor) || unitPriceMajor < 0) {
    setCostError("Unit price must be zero or more.");
    return;
  }

  setCostError(null);
  const exit = await addJobCostLine({
    description: costDescription.trim(),
    quantity,
    type: costLineType,
    unitPriceMinor: Math.round(unitPriceMajor * 100),
  });

  if (Exit.isSuccess(exit)) {
    setCostLineType("labour");
    setCostDescription("");
    setCostQuantity("1");
    setCostUnitPrice("");
  }
}
```

Add section before `Visits`:

```tsx
<DetailSection
  title="Costs"
  description="Track labour and materials for the work without creating an invoice."
>
  <div className="flex flex-col gap-5">
    <div className="flex items-center justify-between border-b pb-3">
      <span className="text-sm font-medium text-muted-foreground">
        Cost total
      </span>
      <span className="text-lg font-semibold text-foreground">
        {formatMoneyMinor(detail.costSummary.subtotalMinor)}
      </span>
    </div>

    {canAddCostLine ? (
      <form
        className="flex flex-col gap-4"
        method="post"
        onSubmit={handleAddCostLine}
      >
        {renderMutationError(costLineResult)}
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="job-cost-type">Cost type</FieldLabel>
              <FieldContent>
                <CommandSelect
                  id="job-cost-type"
                  value={costLineType}
                  placeholder="Pick type"
                  emptyText="No cost types found."
                  groups={COST_LINE_TYPE_SELECTION_GROUPS}
                  onValueChange={(nextValue) =>
                    setCostLineType(nextValue as typeof costLineType)
                  }
                />
              </FieldContent>
            </Field>
            <Field
              data-invalid={
                Boolean(costError) && costQuantity.trim().length === 0
              }
            >
              <FieldLabel htmlFor="job-cost-quantity">Quantity</FieldLabel>
              <FieldContent>
                <Input
                  id="job-cost-quantity"
                  inputMode="decimal"
                  min="0.01"
                  step="0.25"
                  type="number"
                  value={costQuantity}
                  onChange={(event) => setCostQuantity(event.target.value)}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="job-cost-unit-price">Unit price</FieldLabel>
              <FieldContent>
                <Input
                  id="job-cost-unit-price"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={costUnitPrice}
                  onChange={(event) => setCostUnitPrice(event.target.value)}
                />
              </FieldContent>
            </Field>
          </div>
          <Field
            data-invalid={
              Boolean(costError) && costDescription.trim().length === 0
            }
          >
            <FieldLabel htmlFor="job-cost-description">
              Cost description
            </FieldLabel>
            <FieldContent>
              <Input
                id="job-cost-description"
                ref={costDescriptionRef}
                value={costDescription}
                onChange={(event) => setCostDescription(event.target.value)}
              />
              <FieldDescription>
                Keep it operational: labour performed or material used.
              </FieldDescription>
              <FieldError>{costError}</FieldError>
            </FieldContent>
          </Field>
        </FieldGroup>
        <div className="flex">
          <Button
            type="submit"
            loading={costLineResult.waiting}
            className="w-full sm:w-fit"
          >
            {costLineResult.waiting ? "Adding..." : "Add cost line"}
          </Button>
        </div>
      </form>
    ) : (
      <Alert>
        <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
        <AlertTitle>Cost entry is limited here.</AlertTitle>
        <AlertDescription>
          Members can only add costs on jobs assigned to them.
        </AlertDescription>
      </Alert>
    )}

    <Separator />

    {detail.costLines.length === 0 ? (
      <DetailEmpty
        title="No cost lines yet."
        description="Add labour or materials once the work starts taking shape."
      />
    ) : (
      <ul className="flex flex-col gap-3">
        {detail.costLines.map((costLine) => (
          <li
            key={costLine.id}
            className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">
                    {COST_LINE_TYPE_LABELS[costLine.type]}
                  </Badge>
                  <span>
                    {formatQuantity(costLine.quantity)} x{" "}
                    {formatMoneyMinor(costLine.unitPriceMinor)}
                  </span>
                </div>
                <span className="text-sm font-medium">
                  {formatMoneyMinor(costLine.lineTotalMinor)}
                </span>
              </div>
              <p className="text-sm leading-7">{costLine.description}</p>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
</DetailSection>
```

Add constants:

```ts
const COST_LINE_TYPE_LABELS = {
  labour: "Labour",
  material: "Material",
} as const;

const COST_LINE_TYPE_SELECTION_GROUPS = [
  {
    label: "Cost type",
    options: [
      { label: "Labour", value: "labour" },
      { label: "Material", value: "material" },
    ],
  },
] satisfies readonly CommandSelectGroup[];
```

Add format helpers:

```ts
function formatMoneyMinor(value: number) {
  return new Intl.NumberFormat("en-IE", {
    currency: "EUR",
    style: "currency",
  }).format(value / 100);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}
```

Extend `describeActivity`:

```ts
case "cost_line_added": {
  return `${actorPrefix}added a ${COST_LINE_TYPE_LABELS[payload.costLineType].toLowerCase()} cost line.`;
}
```

- [ ] **Step 6: Run app integration test**

Run:

```bash
pnpm --dir apps/app exec vitest run src/features/jobs/jobs-detail-sheet.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit app UI**

Run:

```bash
git add apps/app/src/hotkeys/hotkey-registry.ts apps/app/src/features/jobs/jobs-detail-state.ts apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx
git commit -m "feat: show job cost lines"
```

---

### Task 5: Full Verification

**Files:**

- All files changed by Tasks 1-4

- [ ] **Step 1: Run focused package tests**

Run:

```bash
pnpm --dir packages/jobs-core exec vitest run src/index.test.ts
pnpm --dir apps/api exec vitest run src/domains/jobs/service.test.ts src/domains/jobs/repositories.integration.test.ts src/domains/jobs/http.integration.test.ts
pnpm --dir apps/app exec vitest run src/features/jobs/jobs-detail-sheet.integration.test.tsx
```

Expected: all non-skipped tests pass. Integration tests may skip only when the existing test database availability check skips them.

- [ ] **Step 2: Run type checks**

Run:

```bash
pnpm check-types
```

Expected: PASS.

- [ ] **Step 3: Run lint/check**

Run:

```bash
pnpm lint
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Run the app sandbox for manual verification**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Expected: sandbox starts and prints app/API URLs for the current worktree.

Manual check:

- open a job detail drawer
- confirm the `Costs` section is visible
- add a labour line with quantity `2` and unit price `65`
- confirm the line total is `€130.00`
- add a material line with quantity `1` and unit price `45`
- confirm cost total is `€175.00`
- confirm activity shows a cost-line-added entry
- confirm no invoice, payment, or billing UI appears

- [ ] **Step 5: Shut down sandbox**

Run:

```bash
pnpm sandbox:down
```

Expected: sandbox services stop cleanly.

- [ ] **Step 6: Commit final verification fixes**

If verification required fixes, commit them:

```bash
git add packages/jobs-core/src apps/api/src apps/api/drizzle apps/app/src
git commit -m "fix: verify job cost line workflow"
```

If no fixes were required, do not create an empty commit.
