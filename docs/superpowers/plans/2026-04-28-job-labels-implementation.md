# Job Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organization-scoped job labels that can be created, managed, assigned to jobs, filtered on the jobs list, and shown in job activity without replacing canonical job statuses.

**Architecture:** Labels are reusable organization records stored separately from jobs, and assignments live in a `work_item_labels` join table. Shared `@task-tracker/jobs-core` schemas define IDs, DTOs, API payloads, and activity events; the API owns validation, permissions, transactions, and activity logging; the app consumes labels through the existing jobs list/detail/options flow and adds inline creation plus organization settings management.

**Tech Stack:** Effect Schema, `@effect/platform` HTTP API, Effect services, Drizzle/Postgres, raw SQL repositories, TanStack Start/Router frontend, `@effect-atom/atom-react`, existing shadcn/Base UI components, Vitest, Testing Library, Playwright.

---

## File Structure

### Shared Contracts

- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Modify: `packages/jobs-core/src/index.test.ts`

### API Persistence And Domain

- Modify: `apps/api/src/domains/jobs/id-generation.ts`
- Modify: `apps/api/src/domains/jobs/schema.ts`
- Modify: `apps/api/src/platform/database/schema.ts`
- Create: `apps/api/drizzle/0010_job_labels.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/drizzle/meta/0010_snapshot.json` by running Drizzle generation after schema changes
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Modify: `apps/api/src/domains/jobs/activity-recorder.ts`
- Modify: `apps/api/src/domains/jobs/authorization.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Modify: `apps/api/src/domains/jobs/service.test.ts`
- Modify: `apps/api/src/domains/jobs/authorization.test.ts`
- Modify: `apps/api/src/domains/jobs/repositories.integration.test.ts`
- Modify: `apps/api/src/domains/jobs/http.integration.test.ts`

### Frontend Jobs UI

- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-route-content.tsx` only if type fallout requires it
- Modify: `apps/app/src/features/jobs/jobs-page.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`
- Modify: `apps/app/src/routes/-_app._org.jobs.test.tsx`
- Modify: `apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx`

### Frontend Organization Settings

- Create: `apps/app/src/features/organizations/organization-labels-state.ts`
- Create: `apps/app/src/features/organizations/organization-labels-panel.tsx`
- Modify: `apps/app/src/features/organizations/organization-settings-page.tsx`
- Modify: `apps/app/src/features/organizations/organization-settings-page.test.tsx`

---

## Task 1: Add Shared Label Contracts

**Files:**

- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Test: `packages/jobs-core/src/index.test.ts`

- [ ] **Step 1: Write failing shared schema and API tests**

Add these cases to `packages/jobs-core/src/index.test.ts`:

```ts
it("keeps job label DTOs shapeable", () => {
  expect(
    ParseResult.decodeUnknownSync(JobLabelNameSchema)("  Waiting on PO  ")
  ).toBe("Waiting on PO");

  expect(() =>
    ParseResult.decodeUnknownSync(JobLabelNameSchema)(" ".repeat(4))
  ).toThrow(/at least 1/);

  const label = ParseResult.decodeUnknownSync(JobLabelSchema)({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Waiting on PO",
    createdAt: "2026-04-28T10:00:00.000Z",
    updatedAt: "2026-04-28T10:00:00.000Z",
  });

  expect(label.name).toBe("Waiting on PO");
});

it("keeps job labels on list and detail responses", () => {
  const label = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "No access",
    createdAt: "2026-04-28T10:00:00.000Z",
    updatedAt: "2026-04-28T10:00:00.000Z",
  };

  const listItem = ParseResult.decodeUnknownSync(JobListItemSchema)({
    createdAt: "2026-04-28T10:00:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    kind: "job",
    labels: [label],
    priority: "none",
    status: "new",
    title: "Inspect access panel",
    updatedAt: "2026-04-28T10:15:00.000Z",
  });

  expect(listItem.labels.map((jobLabel) => jobLabel.name)).toStrictEqual([
    "No access",
  ]);
});

it("accepts label filters and label activity payloads", () => {
  expect(
    ParseResult.decodeUnknownSync(JobListQuerySchema)({
      labelId: "11111111-1111-4111-8111-111111111111",
      limit: "25",
    })
  ).toMatchObject({
    labelId: "11111111-1111-4111-8111-111111111111",
    limit: 25,
  });

  expect(
    ParseResult.decodeUnknownSync(JobActivityLabelAddedPayloadSchema)({
      eventType: "label_added",
      labelId: "11111111-1111-4111-8111-111111111111",
      labelName: "Parts ordered",
    })
  ).toStrictEqual({
    eventType: "label_added",
    labelId: "11111111-1111-4111-8111-111111111111",
    labelName: "Parts ordered",
  });
});
```

Update the existing OpenAPI path test in the same file to expect:

```ts
expect(Object.keys(spec.paths)).toStrictEqual([
  "/jobs",
  "/jobs/options",
  "/jobs/{workItemId}",
  "/jobs/{workItemId}/transitions",
  "/jobs/{workItemId}/reopen",
  "/jobs/{workItemId}/comments",
  "/jobs/{workItemId}/visits",
  "/jobs/{workItemId}/labels",
  "/jobs/{workItemId}/labels/{labelId}",
  "/job-labels",
  "/job-labels/{labelId}",
  "/sites/options",
  "/sites",
  "/sites/{siteId}",
]);

expect(spec.paths["/job-labels"]?.get?.operationId).toBe("jobs.listJobLabels");
expect(spec.paths["/job-labels"]?.post?.operationId).toBe(
  "jobs.createJobLabel"
);
expect(spec.paths["/jobs/{workItemId}/labels"]?.post?.operationId).toBe(
  "jobs.assignJobLabel"
);
```

- [ ] **Step 2: Run focused shared tests and verify they fail**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts -t "label|api contract"
```

Expected: FAIL because `JobLabelId`, label DTO schemas, label activity payloads, query `labelId`, and label endpoints do not exist yet.

- [ ] **Step 3: Add `JobLabelId`**

Update `packages/jobs-core/src/ids.ts`:

```ts
export const JobLabelId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/JobLabelId")
);
export type JobLabelId = Schema.Schema.Type<typeof JobLabelId>;
```

Update `packages/jobs-core/src/index.ts` to export `JobLabelId` and type alias `JobLabelIdType`.

- [ ] **Step 4: Add label name and activity event schemas**

Update `packages/jobs-core/src/domain.ts`:

```ts
export const JOB_ACTIVITY_EVENT_TYPES = [
  "job_created",
  "status_changed",
  "blocked_reason_changed",
  "priority_changed",
  "assignee_changed",
  "coordinator_changed",
  "site_changed",
  "contact_changed",
  "job_reopened",
  "visit_logged",
  "label_added",
  "label_removed",
] as const;

export const JobLabelNameSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(48)
);
export type JobLabelName = Schema.Schema.Type<typeof JobLabelNameSchema>;
```

Update `packages/jobs-core/src/index.ts` to export `JobLabelNameSchema` and `JobLabelName`.

- [ ] **Step 5: Add label DTOs and extend jobs**

Update `packages/jobs-core/src/dto.ts` imports to include `JobLabelNameSchema` and `JobLabelId`.

Add near the existing `JobSchema` definitions:

```ts
export const JobLabelSchema = Schema.Struct({
  id: JobLabelId,
  name: JobLabelNameSchema,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
});
export type JobLabel = Schema.Schema.Type<typeof JobLabelSchema>;
```

Add `labels: Schema.Array(JobLabelSchema)` to `JobSchema` and `JobListItemSchema`.

Add label activity payloads:

```ts
export const JobActivityLabelAddedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("label_added"),
  labelId: JobLabelId,
  labelName: JobLabelNameSchema,
});

export const JobActivityLabelRemovedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("label_removed"),
  labelId: JobLabelId,
  labelName: JobLabelNameSchema,
});
```

Add both new payload schemas to `JobActivityPayloadSchema`.

Extend `JobListQuerySchema`:

```ts
labelId: Schema.optional(JobLabelId),
```

Add label input/response schemas after visit schemas:

```ts
export const CreateJobLabelInputSchema = Schema.Struct({
  name: JobLabelNameSchema,
});
export type CreateJobLabelInput = Schema.Schema.Type<
  typeof CreateJobLabelInputSchema
>;

export const UpdateJobLabelInputSchema = Schema.Struct({
  name: JobLabelNameSchema,
});
export type UpdateJobLabelInput = Schema.Schema.Type<
  typeof UpdateJobLabelInputSchema
>;

export const AssignJobLabelInputSchema = Schema.Struct({
  labelId: JobLabelId,
});
export type AssignJobLabelInput = Schema.Schema.Type<
  typeof AssignJobLabelInputSchema
>;

export const JobLabelResponseSchema = JobLabelSchema;
export type JobLabelResponse = Schema.Schema.Type<
  typeof JobLabelResponseSchema
>;

export const JobLabelsResponseSchema = Schema.Struct({
  labels: Schema.Array(JobLabelSchema),
});
export type JobLabelsResponse = Schema.Schema.Type<
  typeof JobLabelsResponseSchema
>;
```

Extend `JobOptionsResponseSchema`:

```ts
labels: Schema.Array(JobLabelSchema),
```

Update all existing tests and fixtures that construct `Job`, `JobListItem`, or `JobOptionsResponse` to include `labels: []`.

- [ ] **Step 6: Add typed label errors**

Update `packages/jobs-core/src/errors.ts`:

```ts
export const JOB_LABEL_NOT_FOUND_ERROR_TAG =
  "@task-tracker/jobs-core/JobLabelNotFoundError" as const;

export class JobLabelNotFoundError extends Schema.TaggedError<JobLabelNotFoundError>()(
  JOB_LABEL_NOT_FOUND_ERROR_TAG,
  {
    labelId: Schema.optional(JobLabelId),
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const JOB_LABEL_NAME_CONFLICT_ERROR_TAG =
  "@task-tracker/jobs-core/JobLabelNameConflictError" as const;

export class JobLabelNameConflictError extends Schema.TaggedError<JobLabelNameConflictError>()(
  JOB_LABEL_NAME_CONFLICT_ERROR_TAG,
  {
    message: Schema.String,
    name: JobLabelNameSchema,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}
```

Export the errors and tags from `packages/jobs-core/src/index.ts`.

- [ ] **Step 7: Add label endpoints to the HTTP API**

Update `packages/jobs-core/src/http-api.ts` imports for label schemas and errors.

Add endpoints to `jobsGroup`:

```ts
.add(
  HttpApiEndpoint.get("listJobLabels", "/job-labels")
    .addSuccess(JobLabelsResponseSchema)
    .addError(JobAccessDeniedError)
    .addError(JobStorageError)
)
.add(
  HttpApiEndpoint.post("createJobLabel", "/job-labels")
    .setPayload(CreateJobLabelInputSchema)
    .addSuccess(JobLabelResponseSchema, { status: 201 })
    .addError(JobAccessDeniedError)
    .addError(JobLabelNameConflictError)
    .addError(JobStorageError)
)
.add(
  HttpApiEndpoint.patch("updateJobLabel", "/job-labels/:labelId")
    .setPath(Schema.Struct({ labelId: JobLabelId }))
    .setPayload(UpdateJobLabelInputSchema)
    .addSuccess(JobLabelResponseSchema)
    .addError(JobAccessDeniedError)
    .addError(JobLabelNotFoundError)
    .addError(JobLabelNameConflictError)
    .addError(JobStorageError)
)
.add(
  HttpApiEndpoint.del("deleteJobLabel", "/job-labels/:labelId")
    .setPath(Schema.Struct({ labelId: JobLabelId }))
    .addSuccess(JobLabelResponseSchema)
    .addError(JobAccessDeniedError)
    .addError(JobLabelNotFoundError)
    .addError(JobStorageError)
)
.add(
  HttpApiEndpoint.post("assignJobLabel", "/jobs/:workItemId/labels")
    .setPath(Schema.Struct({ workItemId: WorkItemId }))
    .setPayload(AssignJobLabelInputSchema)
    .addSuccess(JobDetailResponseSchema)
    .addError(JobNotFoundError)
    .addError(JobLabelNotFoundError)
    .addError(JobAccessDeniedError)
    .addError(JobStorageError)
)
.add(
  HttpApiEndpoint.del("removeJobLabel", "/jobs/:workItemId/labels/:labelId")
    .setPath(Schema.Struct({ workItemId: WorkItemId, labelId: JobLabelId }))
    .addSuccess(JobDetailResponseSchema)
    .addError(JobNotFoundError)
    .addError(JobLabelNotFoundError)
    .addError(JobAccessDeniedError)
    .addError(JobStorageError)
)
```

- [ ] **Step 8: Run shared tests and commit**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts
```

Expected: PASS.

Commit:

```bash
git add packages/jobs-core/src/ids.ts packages/jobs-core/src/domain.ts packages/jobs-core/src/dto.ts packages/jobs-core/src/errors.ts packages/jobs-core/src/http-api.ts packages/jobs-core/src/index.ts packages/jobs-core/src/index.test.ts
git commit -m "feat: add shared job label contracts"
```

## Task 2: Add Label Tables And Repository Behavior

**Files:**

- Modify: `apps/api/src/domains/jobs/id-generation.ts`
- Modify: `apps/api/src/domains/jobs/schema.ts`
- Modify: `apps/api/src/platform/database/schema.ts`
- Create: `apps/api/drizzle/0010_job_labels.sql`
- Create/modify: generated Drizzle meta files
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Test: `apps/api/src/domains/jobs/repositories.integration.test.ts`

- [ ] **Step 1: Write failing repository integration tests**

Add a new test to `apps/api/src/domains/jobs/repositories.integration.test.ts`:

```ts
it("creates, assigns, removes, archives, and filters organization job labels", async (context: {
  skip: (note?: string) => never;
}) => {
  const testDatabase = await createTestDatabase({ prefix: "jobs_labels" });
  cleanup.push(testDatabase.cleanup);

  const databaseUrl = testDatabase.url;
  const canReachDatabase = await withPool(
    databaseUrl,
    async (pool) => await canConnect(pool)
  );

  if (!canReachDatabase) {
    context.skip(
      "Jobs integration database unavailable; skipping label coverage"
    );
  }

  await applyAllMigrations(databaseUrl);
  const identity = await seedIdentityRecords(databaseUrl);
  const foreignIdentity = await seedIdentityRecords(databaseUrl);

  const createdJob = await runJobsEffect(
    databaseUrl,
    JobsRepository.create({
      createdByUserId: identity.ownerUserId,
      organizationId: identity.organizationId,
      title: "Replace lock cylinder",
    })
  );

  const label = await runJobsEffect(
    databaseUrl,
    JobLabelsRepository.create({
      name: "Waiting on PO",
      organizationId: identity.organizationId,
    })
  );

  const sameNameInOtherOrg = await runJobsEffect(
    databaseUrl,
    JobLabelsRepository.create({
      name: "Waiting on PO",
      organizationId: foreignIdentity.organizationId,
    })
  );

  expect(label.name).toBe("Waiting on PO");
  expect(sameNameInOtherOrg.name).toBe("Waiting on PO");

  await expect(
    Effect.runPromise(
      runJobsEffect(
        databaseUrl,
        JobLabelsRepository.create({
          name: " waiting on po ",
          organizationId: identity.organizationId,
        })
      )
    )
  ).rejects.toMatchObject({
    _tag: JOB_LABEL_NAME_CONFLICT_ERROR_TAG,
  });

  const assigned = await runJobsEffect(
    databaseUrl,
    JobLabelsRepository.assignToJob({
      labelId: label.id,
      organizationId: identity.organizationId,
      workItemId: createdJob.id,
    })
  );

  expect(assigned).toStrictEqual(label);

  const detail = expectSome(
    await runJobsEffect(
      databaseUrl,
      JobsRepository.getDetail(identity.organizationId, createdJob.id)
    )
  );
  expect(detail.job.labels.map((jobLabel) => jobLabel.name)).toStrictEqual([
    "Waiting on PO",
  ]);

  const filtered = await runJobsEffect(
    databaseUrl,
    JobsRepository.list(identity.organizationId, { labelId: label.id })
  );
  expect(filtered.items.map((item) => item.id)).toStrictEqual([createdJob.id]);

  const removed = await runJobsEffect(
    databaseUrl,
    JobLabelsRepository.removeFromJob({
      labelId: label.id,
      organizationId: identity.organizationId,
      workItemId: createdJob.id,
    })
  );
  expect(removed).toStrictEqual(label);

  const archived = await runJobsEffect(
    databaseUrl,
    JobLabelsRepository.archive(identity.organizationId, label.id)
  );
  expect(Option.getOrUndefined(archived)?.id).toBe(label.id);

  const labelsAfterArchive = await runJobsEffect(
    databaseUrl,
    JobLabelsRepository.list(identity.organizationId)
  );
  expect(labelsAfterArchive.map((jobLabel) => jobLabel.id)).not.toContain(
    label.id
  );
}, 30_000);
```

Update repository imports in the test for `JobLabelsRepository`, `JOB_LABEL_NAME_CONFLICT_ERROR_TAG`, and `Effect`.

- [ ] **Step 2: Run repository tests and verify they fail**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/repositories.integration.test.ts -t "job labels"
```

Expected: FAIL because the label tables and repository do not exist yet.

- [ ] **Step 3: Add ID generation**

Update `apps/api/src/domains/jobs/id-generation.ts`:

```ts
import {
  ActivityId,
  CommentId,
  ContactId,
  JobLabelId,
  RegionId,
  SiteId,
  VisitId,
  WorkItemId,
} from "@task-tracker/jobs-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  JobLabelIdType,
  RegionIdType,
  SiteIdType,
  VisitIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";

const decodeJobLabelId = Schema.decodeUnknownSync(JobLabelId);

export function generateJobLabelId(): JobLabelIdType {
  return decodeJobLabelId(generateJobDomainUuid());
}
```

Keep existing ID generators unchanged.

- [ ] **Step 4: Add Drizzle tables and relations**

Update `apps/api/src/domains/jobs/schema.ts` imports to include `JobLabelNameSchema` only if needed for type imports; database-level checks can stay SQL-only.

Add `jobLabel` after `contact` and before `siteContact`:

```ts
export const jobLabel = pgTable(
  "job_labels",
  {
    id: uuid("id").primaryKey().$defaultFn(generateJobDomainUuid),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: jobsTimestamp("created_at"),
    updatedAt: jobsTimestamp("updated_at"),
    archivedAt: archivedAtColumn("archived_at"),
  },
  (table) => [
    uniqueIndex("job_labels_organization_normalized_active_idx")
      .on(table.organizationId, table.normalizedName)
      .where(sql`${table.archivedAt} is null`),
    index("job_labels_organization_name_idx").on(
      table.organizationId,
      table.name,
      table.id
    ),
    check(
      "job_labels_name_not_empty_chk",
      sql`length(trim(${table.name})) > 0`
    ),
    check(
      "job_labels_normalized_name_not_empty_chk",
      sql`length(trim(${table.normalizedName})) > 0`
    ),
  ]
);
```

Add `workItemLabel` after `workItem`:

```ts
export const workItemLabel = pgTable(
  "work_item_labels",
  {
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItem.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => jobLabel.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: jobsTimestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workItemId, table.labelId] }),
    index("work_item_labels_label_work_item_idx").on(
      table.organizationId,
      table.labelId,
      table.workItemId
    ),
    index("work_item_labels_work_item_idx").on(table.workItemId),
  ]
);
```

Add relations:

```ts
export const jobLabelRelations = relations(jobLabel, ({ many, one }) => ({
  organization: one(organization, {
    fields: [jobLabel.organizationId],
    references: [organization.id],
  }),
  workItems: many(workItemLabel),
}));

export const workItemLabelRelations = relations(workItemLabel, ({ one }) => ({
  label: one(jobLabel, {
    fields: [workItemLabel.labelId],
    references: [jobLabel.id],
  }),
  workItem: one(workItem, {
    fields: [workItemLabel.workItemId],
    references: [workItem.id],
  }),
}));
```

Add `labels: many(workItemLabel)` to `workItemRelations`.

Add `jobLabel` and `workItemLabel` to `jobsSchema` and export both plus relations from `apps/api/src/platform/database/schema.ts`.

- [ ] **Step 5: Add migration**

Create `apps/api/drizzle/0010_job_labels.sql`:

```sql
CREATE TABLE "job_labels" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "job_labels_name_not_empty_chk" CHECK (length(trim("job_labels"."name")) > 0),
  CONSTRAINT "job_labels_normalized_name_not_empty_chk" CHECK (length(trim("job_labels"."normalized_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "work_item_labels" (
  "work_item_id" uuid NOT NULL,
  "label_id" uuid NOT NULL,
  "organization_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "work_item_labels_work_item_id_label_id_pk" PRIMARY KEY("work_item_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "job_labels" ADD CONSTRAINT "job_labels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_label_id_job_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."job_labels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "job_labels_organization_normalized_active_idx" ON "job_labels" USING btree ("organization_id","normalized_name") WHERE "job_labels"."archived_at" is null;
--> statement-breakpoint
CREATE INDEX "job_labels_organization_name_idx" ON "job_labels" USING btree ("organization_id","name","id");
--> statement-breakpoint
CREATE INDEX "work_item_labels_label_work_item_idx" ON "work_item_labels" USING btree ("organization_id","label_id","work_item_id");
--> statement-breakpoint
CREATE INDEX "work_item_labels_work_item_idx" ON "work_item_labels" USING btree ("work_item_id");
--> statement-breakpoint
ALTER TABLE "work_item_activity" DROP CONSTRAINT "work_item_activity_event_type_chk";
--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_event_type_chk" CHECK ("work_item_activity"."event_type" in ('job_created', 'status_changed', 'blocked_reason_changed', 'priority_changed', 'assignee_changed', 'coordinator_changed', 'site_changed', 'contact_changed', 'job_reopened', 'visit_logged', 'label_added', 'label_removed'));
```

Then run:

```bash
pnpm --filter api db:generate
```

Expected: Drizzle updates `apps/api/drizzle/meta/_journal.json` and creates `apps/api/drizzle/meta/0010_snapshot.json`. If Drizzle also creates a duplicate SQL migration, delete the duplicate generated SQL file and keep the hand-written `0010_job_labels.sql`, then ensure `_journal.json` points at `0010_job_labels`.

- [ ] **Step 6: Add repository row types and decoders**

Update `apps/api/src/domains/jobs/repositories.ts` imports for:

```ts
JobLabelId as JobLabelIdSchema,
JobLabelNameConflictError,
JobLabelNotFoundError,
JobLabelSchema,
JobLabelsResponseSchema,
```

Add type imports:

```ts
JobLabel,
JobLabelIdType as JobLabelId,
JobLabelName,
```

Add row interfaces:

```ts
interface JobLabelRow {
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly organization_id: string;
  readonly updated_at: Date;
}

interface WorkItemLabelRow {
  readonly created_at: Date;
  readonly label_id: string;
  readonly name: string;
  readonly work_item_id: string;
}
```

Add decoders:

```ts
const decodeJobLabel = Schema.decodeUnknownSync(JobLabelSchema);
const decodeJobLabelId = Schema.decodeUnknownSync(JobLabelIdSchema);
const decodeJobLabelsResponse = Schema.decodeUnknownSync(
  JobLabelsResponseSchema
);
```

- [ ] **Step 7: Load labels into list and detail**

In `JobsRepository.list`, add a label join only when filtering:

```ts
const labelFilterJoin =
  query.labelId === undefined
    ? sql``
    : sql`join work_item_labels as filter_labels on filter_labels.work_item_id = work_items.id`;

if (query.labelId !== undefined) {
  clauses.push(sql`filter_labels.organization_id = ${organizationId}`);
  clauses.push(sql`filter_labels.label_id = ${query.labelId}`);
}
```

Include `${labelFilterJoin}` in the SQL query before `${sitesJoin}`.

After fetching `rows`, load labels:

```ts
const labelsByWorkItemId =
  yield *
  listLabelsForWorkItems(
    organizationId,
    rows.slice(0, limit).map((row) => decodeWorkItemId(row.id))
  );
const items = rows
  .slice(0, limit)
  .map((row) => mapJobListItemRow(row, labelsByWorkItemId.get(row.id) ?? []));
```

In `getDetail`, load labels with comments/activity/visits and pass them into `mapJobRow`.

- [ ] **Step 8: Implement `JobLabelsRepository`**

Add this service below `ContactsRepository` in `repositories.ts`:

```ts
export interface CreateJobLabelRecordInput {
  readonly name: JobLabelName;
  readonly organizationId: OrganizationId;
}

export interface AssignJobLabelRecordInput {
  readonly labelId: JobLabelId;
  readonly organizationId: OrganizationId;
  readonly workItemId: WorkItemId;
}

export class JobLabelsRepository extends Effect.Service<JobLabelsRepository>()(
  "@task-tracker/domains/jobs/JobLabelsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* JobLabelsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const list = Effect.fn("JobLabelsRepository.list")(function* (
        organizationId: OrganizationId
      ) {
        const rows = yield* sql<JobLabelRow>`
          select *
          from job_labels
          where organization_id = ${organizationId}
            and archived_at is null
          order by name asc, id asc
        `;

        return rows.map(mapJobLabelRow);
      });

      const create = Effect.fn("JobLabelsRepository.create")(function* (
        input: CreateJobLabelRecordInput
      ) {
        const rows = yield* sql<JobLabelRow>`
          insert into job_labels ${sql
            .insert({
              id: generateJobLabelId(),
              name: input.name,
              normalized_name: normalizeJobLabelName(input.name),
              organization_id: input.organizationId,
            })
            .returning("*")}
        `.pipe(
          Effect.catchTag("SqlError", (error) =>
            isUniqueConstraintError(
              error,
              "job_labels_organization_normalized_active_idx"
            )
              ? Effect.fail(
                  new JobLabelNameConflictError({
                    message: "A job label with that name already exists",
                    name: input.name,
                  })
                )
              : Effect.fail(error)
          )
        );

        return mapJobLabelRow(getRequiredRow(rows, "inserted job label"));
      });

      const findById = Effect.fn("JobLabelsRepository.findById")(function* (
        organizationId: OrganizationId,
        labelId: JobLabelId
      ) {
        const rows = yield* sql<JobLabelRow>`
          select *
          from job_labels
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          limit 1
        `;

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobLabelRow));
      });

      const update = Effect.fn("JobLabelsRepository.update")(function* (
        organizationId: OrganizationId,
        labelId: JobLabelId,
        input: { readonly name: JobLabelName }
      ) {
        const rows = yield* sql<JobLabelRow>`
          update job_labels
          set ${sql.update({
            name: input.name,
            normalized_name: normalizeJobLabelName(input.name),
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          returning *
        `.pipe(
          Effect.catchTag("SqlError", (error) =>
            isUniqueConstraintError(
              error,
              "job_labels_organization_normalized_active_idx"
            )
              ? Effect.fail(
                  new JobLabelNameConflictError({
                    message: "A job label with that name already exists",
                    name: input.name,
                  })
                )
              : Effect.fail(error)
          )
        );

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobLabelRow));
      });

      const archive = Effect.fn("JobLabelsRepository.archive")(function* (
        organizationId: OrganizationId,
        labelId: JobLabelId
      ) {
        const existing = yield* findById(organizationId, labelId);

        if (Option.isNone(existing)) {
          return Option.none<JobLabel>();
        }

        yield* sql`
          delete from work_item_labels
          where organization_id = ${organizationId}
            and label_id = ${labelId}
        `;

        const rows = yield* sql<JobLabelRow>`
          update job_labels
          set ${sql.update({
            archived_at: new Date(),
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          returning *
        `;

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobLabelRow));
      });

      const assignToJob = Effect.fn("JobLabelsRepository.assignToJob")(
        function* (input: AssignJobLabelRecordInput) {
          const label = yield* findById(
            input.organizationId,
            input.labelId
          ).pipe(Effect.map(Option.getOrUndefined));

          if (label === undefined) {
            return yield* Effect.fail(
              new JobLabelNotFoundError({
                labelId: input.labelId,
                message: "Job label does not exist in the organization",
              })
            );
          }

          yield* ensureWorkItemOrganizationMatches(
            input.organizationId,
            input.workItemId
          );

          yield* sql`
          insert into work_item_labels ${sql.insert({
            label_id: input.labelId,
            organization_id: input.organizationId,
            work_item_id: input.workItemId,
          })}
          on conflict do nothing
        `;

          return label;
        }
      );

      const removeFromJob = Effect.fn("JobLabelsRepository.removeFromJob")(
        function* (input: AssignJobLabelRecordInput) {
          const label = yield* findById(
            input.organizationId,
            input.labelId
          ).pipe(Effect.map(Option.getOrUndefined));

          if (label === undefined) {
            return yield* Effect.fail(
              new JobLabelNotFoundError({
                labelId: input.labelId,
                message: "Job label does not exist in the organization",
              })
            );
          }

          yield* ensureWorkItemOrganizationMatches(
            input.organizationId,
            input.workItemId
          );

          yield* sql`
          delete from work_item_labels
          where organization_id = ${input.organizationId}
            and work_item_id = ${input.workItemId}
            and label_id = ${input.labelId}
        `;

          return label;
        }
      );

      return {
        archive,
        assignToJob,
        create,
        findById,
        list,
        removeFromJob,
        update,
      };
    }),
  }
) {}
```

If TypeScript cannot access `ensureWorkItemOrganizationMatches` from this nested service, move it to a local helper function at module scope that accepts `sql`, `organizationId`, and `workItemId`.

- [ ] **Step 9: Add mapping helpers**

Add:

```ts
function mapJobLabelRow(row: JobLabelRow): JobLabel {
  return decodeJobLabel({
    createdAt: row.created_at.toISOString(),
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
  });
}

function normalizeJobLabelName(name: string): string {
  return name.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en");
}

function isUniqueConstraintError(
  error: unknown,
  constraintName: string
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "constraint" in error.cause &&
    error.cause.constraint === constraintName
  );
}
```

Update `mapJobRow` and `mapJobListItemRow` signatures:

```ts
function mapJobRow(row: WorkItemRow, labels: readonly JobLabel[] = []): Job {
  return decodeJob({
    assigneeId: nullableToUndefined(row.assignee_id),
    blockedReason: nullableToUndefined(row.blocked_reason),
    completedAt:
      row.completed_at === null ? undefined : row.completed_at.toISOString(),
    completedByUserId: nullableToUndefined(row.completed_by_user_id),
    contactId: nullableToUndefined(row.contact_id),
    coordinatorId: nullableToUndefined(row.coordinator_id),
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    id: row.id,
    kind: row.kind,
    labels,
    priority: row.priority,
    siteId: nullableToUndefined(row.site_id),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapJobListItemRow(
  row: WorkItemRow,
  labels: readonly JobLabel[] = []
): JobListItem {
  return decodeJobListItem({
    assigneeId: nullableToUndefined(row.assignee_id),
    contactId: nullableToUndefined(row.contact_id),
    coordinatorId: nullableToUndefined(row.coordinator_id),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    kind: row.kind,
    labels,
    priority: row.priority,
    siteId: nullableToUndefined(row.site_id),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  });
}
```

Add `JobLabelsRepository.Default` to `JobsRepositoriesLive`.

- [ ] **Step 10: Run repository tests and commit**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/repositories.integration.test.ts -t "job labels|filters and paginates"
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/domains/jobs/id-generation.ts apps/api/src/domains/jobs/schema.ts apps/api/src/platform/database/schema.ts apps/api/drizzle/0010_job_labels.sql apps/api/drizzle/meta/_journal.json apps/api/drizzle/meta/0010_snapshot.json apps/api/src/domains/jobs/repositories.ts apps/api/src/domains/jobs/repositories.integration.test.ts
git commit -m "feat: persist organization job labels"
```

## Task 3: Add Service, Authorization, Activity, And HTTP Handlers

**Files:**

- Modify: `apps/api/src/domains/jobs/authorization.ts`
- Modify: `apps/api/src/domains/jobs/activity-recorder.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Test: `apps/api/src/domains/jobs/authorization.test.ts`
- Test: `apps/api/src/domains/jobs/service.test.ts`
- Test: `apps/api/src/domains/jobs/http.integration.test.ts`

- [ ] **Step 1: Write failing authorization tests**

Add to `apps/api/src/domains/jobs/authorization.test.ts`:

```ts
it("allows admins to manage label definitions and blocks members", async () => {
  await expectAuthorizationSucceeds(
    JobsAuthorization.ensureCanManageJobLabels(makeActor("admin"))
  );

  await expectAuthorizationFails(
    JobsAuthorization.ensureCanManageJobLabels(makeActor("member")),
    "Only organization owners and admins can manage job labels"
  );
});

it("allows assigned members to label their jobs", async () => {
  const assignedJob = makeJob({ assigneeId: actorUserId });
  const unassignedJob = makeJob({ assigneeId: "other_user" as UserId });

  await expectAuthorizationSucceeds(
    JobsAuthorization.ensureCanAssignJobLabels(makeActor("member"), assignedJob)
  );

  await expectAuthorizationFails(
    JobsAuthorization.ensureCanAssignJobLabels(
      makeActor("member"),
      unassignedJob
    ),
    "Members can only label jobs assigned to them"
  );
});
```

Use the existing local helpers in that test file for success/failure assertions.

- [ ] **Step 2: Implement authorization methods**

Update `apps/api/src/domains/jobs/authorization.ts`:

```ts
const ensureCanManageJobLabels = Effect.fn(
  "JobsAuthorization.ensureCanManageJobLabels"
)((actor: JobsActor) =>
  hasElevatedAccess(actor)
    ? Effect.void
    : Effect.fail(
        makeAccessDenied(
          "Only organization owners and admins can manage job labels"
        )
      )
);

const ensureCanAssignJobLabels = Effect.fn(
  "JobsAuthorization.ensureCanAssignJobLabels"
)((actor: JobsActor, job: Job) =>
  hasElevatedAccess(actor) || job.assigneeId === actor.userId
    ? Effect.void
    : Effect.fail(
        makeAccessDenied("Members can only label jobs assigned to them", job.id)
      )
);
```

Return both methods from the service object.

- [ ] **Step 3: Add activity recorder methods**

Update `apps/api/src/domains/jobs/activity-recorder.ts` imports for `JobLabel`.

Add methods:

```ts
const recordLabelAdded = Effect.fn("JobsActivityRecorder.recordLabelAdded")(
  function* (
    actor: JobsActor,
    input: { readonly label: JobLabel; readonly workItemId: Job["id"] }
  ) {
    yield* repository.addActivity({
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      payload: {
        eventType: "label_added",
        labelId: input.label.id,
        labelName: input.label.name,
      },
      workItemId: input.workItemId,
    });
  }
);

const recordLabelRemoved = Effect.fn("JobsActivityRecorder.recordLabelRemoved")(
  function* (
    actor: JobsActor,
    input: { readonly label: JobLabel; readonly workItemId: Job["id"] }
  ) {
    yield* repository.addActivity({
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      payload: {
        eventType: "label_removed",
        labelId: input.label.id,
        labelName: input.label.name,
      },
      workItemId: input.workItemId,
    });
  }
);
```

Return both methods.

- [ ] **Step 4: Write failing service tests**

Update the `JobsServiceHarness` in `apps/api/src/domains/jobs/service.test.ts`:

- add `JobLabelsRepository` to imports and layers
- add `createLabel`, `assignLabel`, `removeLabel`, `archiveLabel`, `updateLabel` counters
- return `labels: []` in `makeJob`
- include `labels: []` in `JobOptionsResponse` fixtures

Add tests:

```ts
it("lets admins create job labels and includes them in options", async () => {
  const { layer } = makeHarness({ actor: makeActor("admin") });

  const label = await runJobsService(
    JobsService.createLabel({ name: " Waiting on PO " }),
    layer
  );

  expect(label.name).toBe("Waiting on PO");
});

it("blocks members from managing organization label definitions", async () => {
  const { layer } = makeHarness({ actor: makeActor("member") });

  const exit = await runJobsServiceExit(
    JobsService.createLabel({ name: "Ready to invoice" }),
    layer
  );

  expect(Cause.squash(exit.cause)).toMatchObject({
    _tag: JOB_ACCESS_DENIED_ERROR_TAG,
  });
});

it("assigns labels through job permissions and records activity", async () => {
  const { calls, layer } = makeHarness({
    actor: makeActor("member"),
    lockedJob: makeJob({ assigneeId: actorUserId }),
  });

  const detail = await runJobsService(
    JobsService.assignLabel(workItemId, { labelId }),
    layer
  );

  expect(detail.job.id).toBe(workItemId);
  expect(calls.assignLabel).toBe(1);
  expect(calls.addActivity).toBe(1);
});

it("removes labels through job permissions and records activity", async () => {
  const { calls, layer } = makeHarness({
    actor: makeActor("member"),
    lockedJob: makeJob({ assigneeId: actorUserId }),
  });

  await runJobsService(JobsService.removeLabel(workItemId, labelId), layer);

  expect(calls.removeLabel).toBe(1);
  expect(calls.addActivity).toBe(1);
});
```

- [ ] **Step 5: Implement service label methods**

Update `apps/api/src/domains/jobs/service.ts` imports for label DTOs/errors and `JobLabelsRepository`.

In `JobsServiceLive`, yield:

```ts
const jobLabelsRepository = yield * JobLabelsRepository;
```

Extend `getOptions`:

```ts
const [members, regions, sites, contacts, labels] =
  yield *
  Effect.all([
    jobsRepository.listMemberOptions(actor.organizationId),
    sitesRepository.listRegions(actor.organizationId),
    sitesRepository.listOptions(actor.organizationId),
    contactsRepository.listOptions(actor.organizationId),
    jobLabelsRepository.list(actor.organizationId),
  ]).pipe(Effect.catchTag("SqlError", failJobsStorageError));

return { contacts, labels, members, regions, sites } as const;
```

Add service methods:

```ts
const listLabels = Effect.fn("JobsService.listLabels")(function* () {
  const actor = yield* loadActor();
  yield* authorization.ensureCanView(actor);

  const labels = yield* jobLabelsRepository
    .list(actor.organizationId)
    .pipe(Effect.catchTag("SqlError", failJobsStorageError));

  return { labels };
});

const createLabel = Effect.fn("JobsService.createLabel")(function* (
  input: CreateJobLabelInput
) {
  const actor = yield* loadActor();
  yield* authorization.ensureCanManageJobLabels(actor);

  return yield* jobLabelsRepository
    .create({ name: input.name, organizationId: actor.organizationId })
    .pipe(Effect.catchTag("SqlError", failJobsStorageError));
});

const updateLabel = Effect.fn("JobsService.updateLabel")(function* (
  labelId: JobLabelId,
  input: UpdateJobLabelInput
) {
  const actor = yield* loadActor();
  yield* authorization.ensureCanManageJobLabels(actor);

  const label = yield* jobLabelsRepository
    .update(actor.organizationId, labelId, input)
    .pipe(
      Effect.catchTag("SqlError", failJobsStorageError),
      Effect.map(Option.getOrUndefined)
    );

  if (label !== undefined) {
    return label;
  }

  return yield* Effect.fail(
    new JobLabelNotFoundError({
      labelId,
      message: "Job label does not exist",
    })
  );
});

const deleteLabel = Effect.fn("JobsService.deleteLabel")(function* (
  labelId: JobLabelId
) {
  const actor = yield* loadActor();
  yield* authorization.ensureCanManageJobLabels(actor);

  const label = yield* jobLabelsRepository
    .archive(actor.organizationId, labelId)
    .pipe(
      Effect.catchTag("SqlError", failJobsStorageError),
      Effect.map(Option.getOrUndefined)
    );

  if (label !== undefined) {
    return label;
  }

  return yield* Effect.fail(
    new JobLabelNotFoundError({
      labelId,
      message: "Job label does not exist",
    })
  );
});
```

Add assignment methods:

```ts
const assignLabel = Effect.fn("JobsService.assignLabel")(function* (
  workItemId: WorkItemId,
  input: AssignJobLabelInput
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
            new JobNotFoundError({ message: "Job does not exist", workItemId })
          );
        }

        yield* authorization.ensureCanAssignJobLabels(actor, job);

        const label = yield* jobLabelsRepository.assignToJob({
          labelId: input.labelId,
          organizationId: actor.organizationId,
          workItemId,
        });

        yield* activityRecorder.recordLabelAdded(actor, { label, workItemId });

        return yield* jobsRepository
          .getDetail(actor.organizationId, workItemId)
          .pipe(Effect.map(Option.getOrUndefined));
      })
    )
    .pipe(Effect.either);

  if (Either.isRight(result) && result.right !== undefined) {
    return result.right;
  }

  if (Either.isRight(result)) {
    return yield* Effect.fail(
      new JobNotFoundError({ message: "Job does not exist", workItemId })
    );
  }

  return yield* mapLabelMutationError(result.left, workItemId);
});
```

Implement `removeLabel` the same way, calling `jobLabelsRepository.removeFromJob` and `activityRecorder.recordLabelRemoved`.

Return all six label methods from `JobsService`.

- [ ] **Step 6: Wire HTTP handlers**

Update `apps/api/src/domains/jobs/http.ts`:

```ts
.handle("listJobLabels", () => jobsService.listLabels())
.handle("createJobLabel", ({ payload }) => jobsService.createLabel(payload))
.handle("updateJobLabel", ({ path, payload }) =>
  jobsService.updateLabel(path.labelId, payload)
)
.handle("deleteJobLabel", ({ path }) => jobsService.deleteLabel(path.labelId))
.handle("assignJobLabel", ({ path, payload }) =>
  jobsService.assignLabel(path.workItemId, payload)
)
.handle("removeJobLabel", ({ path }) =>
  jobsService.removeLabel(path.workItemId, path.labelId)
)
```

Provide `JobLabelsRepository.Default` in `JobsHttpLive` through `JobsService.Default` dependencies if the service layer does not already receive `JobsRepositoriesLive`.

- [ ] **Step 7: Add API integration coverage**

Add an HTTP integration test covering:

```ts
const createLabelResponse = await api.handler(
  makeJsonRequest(
    "/job-labels",
    { name: "No access" },
    { cookieJar: ownerCookieJar }
  )
);
expect(createLabelResponse.status).toBe(201);
const label = (await createLabelResponse.json()) as {
  id: string;
  name: string;
};

const assignResponse = await api.handler(
  makeJsonRequest(
    `/jobs/${job.id}/labels`,
    { labelId: label.id },
    { cookieJar: ownerCookieJar }
  )
);
expect(assignResponse.status).toBe(200);
expect((await assignResponse.json()).job.labels).toStrictEqual([
  expect.objectContaining({ name: "No access" }),
]);

const filteredResponse = await api.handler(
  makeRequest(`/jobs?labelId=${label.id}`, { cookieJar: ownerCookieJar })
);
expect(filteredResponse.status).toBe(200);
expect((await filteredResponse.json()).items).toHaveLength(1);
```

- [ ] **Step 8: Run API tests and commit**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/authorization.test.ts src/domains/jobs/service.test.ts src/domains/jobs/http.integration.test.ts
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/domains/jobs/authorization.ts apps/api/src/domains/jobs/activity-recorder.ts apps/api/src/domains/jobs/service.ts apps/api/src/domains/jobs/http.ts apps/api/src/domains/jobs/authorization.test.ts apps/api/src/domains/jobs/service.test.ts apps/api/src/domains/jobs/http.integration.test.ts
git commit -m "feat: add job label api workflows"
```

## Task 4: Show And Filter Labels On The Jobs List

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Modify: `apps/app/src/routes/-_app._org.jobs.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-page.test.tsx`

- [ ] **Step 1: Write failing jobs list UI tests**

Update `initialList` in `apps/app/src/features/jobs/jobs-page.test.tsx` to include labels on jobs:

```ts
const labelNoAccessId =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as JobLabelIdType;
const labelInvoiceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as JobLabelIdType;

const labelNoAccess = {
  id: labelNoAccessId,
  name: "No access",
  createdAt: "2026-04-23T10:00:00.000Z",
  updatedAt: "2026-04-23T10:00:00.000Z",
};
```

Add `labels: [labelNoAccess]` to one active job and `labels: []` to all other job fixtures. Add `labels: [labelNoAccess, labelInvoice]` to `initialOptions`.

Add test:

```ts
it("renders labels and filters jobs by label", async () => {
  const user = userEvent.setup();

  renderJobsPage();
  const queuePanel = getPrimaryQueuePanel();

  expect(within(queuePanel).getAllByText("No access").length).toBeGreaterThan(
    0
  );

  await chooseCommandFilter(user, /label filter/i, "No access");

  expect(within(queuePanel).getByText("Inspect boiler")).toBeVisible();
  expect(
    within(queuePanel).queryByText("Await materials")
  ).not.toBeInTheDocument();
  expect(screen.getByText("Label: No access")).toBeVisible();
});
```

- [ ] **Step 2: Update route tests for labels in empty options**

Update `EMPTY_JOBS_OPTIONS` assertions and route fixtures in `apps/app/src/routes/-_app._org.jobs.test.tsx` to include `labels: []`.

- [ ] **Step 3: Run focused app tests and verify they fail**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx src/routes/-_app._org.jobs.test.tsx -t "label|loader"
```

Expected: FAIL because list filters and rows do not handle labels yet.

- [ ] **Step 4: Add label filter state**

Update `apps/app/src/features/jobs/jobs-state.ts`:

```ts
import type {
  CreateJobInput,
  CreateJobResponse,
  Job,
  JobContactOption,
  JobLabelIdType,
  JobListCursorType,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
  JobPriority,
  JobStatus,
  RegionIdType,
  SiteIdType,
  UserIdType,
} from "@task-tracker/jobs-core";
```

Add `labelId` to `JobsListFilters` and `defaultJobsListFilters`:

```ts
export interface JobsListFilters {
  readonly assigneeId: UserIdType | "all";
  readonly coordinatorId: UserIdType | "all";
  readonly labelId: JobLabelIdType | "all";
  readonly priority: JobPriority | "all";
  readonly query: string;
  readonly regionId: RegionIdType | "all";
  readonly siteId: SiteIdType | "all";
  readonly status: JobsStatusFilter;
}

export const defaultJobsListFilters: JobsListFilters = {
  assigneeId: "all",
  coordinatorId: "all",
  labelId: "all",
  priority: "all",
  query: "",
  regionId: "all",
  siteId: "all",
  status: "active",
};
```

Add `labelById` to `jobsLookupAtom`:

```ts
labelById: new Map(options.labels.map((label) => [label.id, label])),
```

Extend `visibleJobsAtom`:

```ts
if (
  filters.labelId !== "all" &&
  !item.labels.some((label) => label.id === filters.labelId)
) {
  return false;
}
```

Update `toJobListItem` to include `labels: job.labels`.

- [ ] **Step 5: Add label toolbar filter and badges**

Update `JobsCommandToolbar` props `optionsState` to include labels.

Add filter after Site:

```tsx
<CommandFilter
  label="Label"
  value={filters.labelId}
  options={[
    { label: "All labels", value: "all" },
    ...optionsState.labels.map((label) => ({
      label: label.name,
      value: label.id,
    })),
  ]}
  onValueChange={(value) =>
    onFiltersChange({ labelId: value as JobsListFilters["labelId"] })
  }
/>
```

Update `buildActiveFilterBadges` lookup type and add:

```ts
if (filters.labelId !== defaultJobsListFilters.labelId) {
  badges.push({
    key: "labelId",
    label: `Label: ${lookup.labelById.get(filters.labelId)?.name ?? "Unknown"}`,
  });
}
```

- [ ] **Step 6: Render label badges in rows**

Add helper in `jobs-page.tsx`:

```tsx
function JobLabelBadges({
  labels,
}: {
  readonly labels: JobListItem["labels"];
}) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {labels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="max-w-36 rounded-full"
        >
          <span className="truncate">{label.name}</span>
        </Badge>
      ))}
    </span>
  );
}
```

In `JobIssueTableRow`, place `<JobLabelBadges labels={job.labels} />` after the title span.

In `JobIssueRow`, place `<JobLabelBadges labels={job.labels} />` next to status/priority in the wrap row.

- [ ] **Step 7: Run app tests and commit**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx src/routes/-_app._org.jobs.test.tsx
```

Expected: PASS.

Commit:

```bash
git add apps/app/src/features/jobs/jobs-state.ts apps/app/src/features/jobs/jobs-page.tsx apps/app/src/features/jobs/jobs-page.test.tsx apps/app/src/routes/-_app._org.jobs.test.tsx
git commit -m "feat: filter jobs by label"
```

## Task 5: Add Label Assignment To Job Detail

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-detail-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx`
- Test: `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`

- [ ] **Step 1: Write failing detail tests**

In `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`, update all job fixtures with `labels: []` and options fixtures with `labels: []`.

Add test:

```ts
it("assigns, creates, and removes labels from the job detail sheet", async () => {
  const user = userEvent.setup();
  const label = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as JobLabelIdType,
    name: "No access",
    createdAt: "2026-04-28T10:00:00.000Z",
    updatedAt: "2026-04-28T10:00:00.000Z",
  };

  mockedAssignJobLabel.mockResolvedValue({
    ...initialDetail,
    job: {
      ...initialDetail.job,
      labels: [label],
    },
  });

  renderJobsDetailSheet({
    detail: initialDetail,
    options: {
      ...initialOptions,
      labels: [label],
    },
    viewer: { role: "admin", userId: currentUserId },
  });

  await user.click(screen.getByRole("button", { name: /add label/i }));
  await user.click(screen.getByRole("option", { name: "No access" }));

  await waitFor(() => {
    expect(mockedAssignJobLabel).toHaveBeenCalledWith({
      path: { workItemId },
      payload: { labelId: label.id },
    });
  });

  expect(await screen.findByText("No access")).toBeVisible();

  mockedRemoveJobLabel.mockResolvedValue({
    ...initialDetail,
    job: {
      ...initialDetail.job,
      labels: [],
    },
  });

  await user.click(screen.getByRole("button", { name: /remove no access/i }));

  await waitFor(() => {
    expect(mockedRemoveJobLabel).toHaveBeenCalledWith({
      path: { workItemId, labelId: label.id },
    });
  });
});
```

Add a separate test for inline admin creation:

```ts
await user.click(screen.getByRole("button", { name: /add label/i }));
await user.type(screen.getByPlaceholderText("Label"), "Parts ordered");
await user.click(
  screen.getByRole("option", { name: /create label.*parts ordered/i })
);
expect(mockedCreateJobLabel).toHaveBeenCalledWith({
  payload: { name: "Parts ordered" },
});
```

- [ ] **Step 2: Add browser mutations**

Update `apps/app/src/features/jobs/jobs-detail-state.ts` imports for:

```ts
AssignJobLabelInput,
CreateJobLabelInput,
JobLabelResponse,
JobLabelIdType,
```

Add atom families:

```ts
export const assignJobLabelMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse, AssignJobLabelInput>(
      (input, get) =>
        assignBrowserJobLabel(workItemId, input).pipe(
          Effect.tap((detail) =>
            Effect.sync(() => syncJobDetail(get, workItemId, detail))
          )
        )
    )
);

export const removeJobLabelMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse, JobLabelIdType>((labelId, get) =>
      removeBrowserJobLabel(workItemId, labelId).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => syncJobDetail(get, workItemId, detail))
        )
      )
    )
);
```

Add global create-label atom in `jobs-state.ts` instead if it needs to refresh options:

```ts
export const createJobLabelMutationAtom = Atom.fn<
  AppJobsError,
  JobLabelResponse,
  CreateJobLabelInput
>((input, get) =>
  createBrowserJobLabel(input).pipe(
    Effect.tap((label) =>
      Effect.sync(() => {
        const current = get(jobsOptionsStateAtom);
        get.set(jobsOptionsStateAtom, {
          ...current,
          data: {
            ...current.data,
            labels: insertSortedLabel(current.data.labels, label),
          },
        });
      })
    )
  )
);
```

Add browser client wrappers:

```ts
function assignBrowserJobLabel(
  workItemId: WorkItemIdType,
  input: AssignJobLabelInput
) {
  return runBrowserJobsRequest("JobsBrowser.assignJobLabel", (client) =>
    client.jobs.assignJobLabel({
      path: { workItemId },
      payload: input,
    })
  );
}

function removeBrowserJobLabel(
  workItemId: WorkItemIdType,
  labelId: JobLabelIdType
) {
  return runBrowserJobsRequest("JobsBrowser.removeJobLabel", (client) =>
    client.jobs.removeJobLabel({
      path: { workItemId, labelId },
    })
  );
}
```

- [ ] **Step 3: Add detail label UI**

Update `apps/app/src/features/jobs/jobs-detail-sheet.tsx` imports:

```ts
import {
  Add01Icon,
  Briefcase01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
```

Use `Briefcase01Icon` for label controls in this task so the plan only references an icon already imported elsewhere in the file.

Add mutation hooks:

```ts
const assignLabelResult = useAtomValue(
  assignJobLabelMutationAtomFamily(workItemId)
);
const removeLabelResult = useAtomValue(
  removeJobLabelMutationAtomFamily(workItemId)
);
const createLabelResult = useAtomValue(createJobLabelMutationAtom);
const assignJobLabel = useAtomSet(
  assignJobLabelMutationAtomFamily(workItemId),
  {
    mode: "promiseExit",
  }
);
const removeJobLabel = useAtomSet(
  removeJobLabelMutationAtomFamily(workItemId),
  {
    mode: "promiseExit",
  }
);
const createJobLabel = useAtomSet(createJobLabelMutationAtom, {
  mode: "promiseExit",
});
```

Add header labels after status/priority:

```tsx
<JobDetailLabelBadges labels={detail.job.labels} />
```

Add section after blocked reason and before "Move forward":

```tsx
<DetailSection
  title="Labels"
  description="Add flexible context without changing the workflow status."
>
  <JobLabelsEditor
    assignedLabels={detail.job.labels}
    availableLabels={[...lookup.labelById.values()]}
    canCreateLabels={hasJobsElevatedAccess(viewer.role)}
    canEditLabels={canEditJob}
    createResult={createLabelResult}
    assignResult={assignLabelResult}
    removeResult={removeLabelResult}
    onCreateAndAssign={handleCreateAndAssignLabel}
    onAssign={(labelId) => assignJobLabel({ labelId })}
    onRemove={(labelId) => removeJobLabel(labelId)}
  />
</DetailSection>
```

Implement `JobLabelsEditor` in the same file using the contact popover pattern:

```tsx
function JobLabelsEditor({
  assignedLabels,
  availableLabels,
  canCreateLabels,
  canEditLabels,
  onAssign,
  onCreateAndAssign,
  onRemove,
}: {
  readonly assignedLabels: JobDetailResponse["job"]["labels"];
  readonly availableLabels: readonly JobDetailResponse["job"]["labels"][number][];
  readonly canCreateLabels: boolean;
  readonly canEditLabels: boolean;
  readonly onAssign: (labelId: JobLabelIdType) => Promise<unknown>;
  readonly onCreateAndAssign: (name: string) => Promise<unknown>;
  readonly onRemove: (labelId: JobLabelIdType) => Promise<unknown>;
  readonly assignResult: Result.Result<unknown, { readonly message: string }>;
  readonly createResult: Result.Result<unknown, { readonly message: string }>;
  readonly removeResult: Result.Result<unknown, { readonly message: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const assignedIds = new Set(assignedLabels.map((label) => label.id));
  const unassignedLabels = availableLabels.filter(
    (label) => !assignedIds.has(label.id)
  );
  const createName = query.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {assignedLabels.map((label) => (
          <Badge
            key={label.id}
            variant="outline"
            className="gap-1 rounded-full"
          >
            {label.name}
            {canEditLabels ? (
              <button
                type="button"
                aria-label={`Remove ${label.name}`}
                onClick={() => void onRemove(label.id)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </button>
            ) : null}
          </Badge>
        ))}
        {assignedLabels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labels yet.</p>
        ) : null}
      </div>
      {canEditLabels ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button type="button" size="sm" variant="outline" />}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Add label
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--anchor-width)] min-w-72 p-0"
            align="start"
          >
            <Command>
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Label"
              />
              <CommandList>
                <CommandEmpty>No matching labels.</CommandEmpty>
                {canCreateLabels && createName ? (
                  <CommandGroup>
                    <CommandItem
                      value={`Create label ${createName}`}
                      onSelect={() => {
                        void onCreateAndAssign(createName);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      Create label:{" "}
                      <span className="text-muted-foreground">
                        &quot;{createName}&quot;
                      </span>
                    </CommandItem>
                  </CommandGroup>
                ) : null}
                <CommandGroup heading="Labels">
                  {unassignedLabels.map((label) => (
                    <CommandItem
                      key={label.id}
                      value={label.name}
                      onSelect={() => {
                        void onAssign(label.id);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {label.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <p className="text-sm text-muted-foreground">
          Labels can be changed by the assignee or organization admins.
        </p>
      )}
    </div>
  );
}
```

Wire `handleCreateAndAssignLabel`:

```ts
async function handleCreateAndAssignLabel(name: string) {
  const createExit = await createJobLabel({ name });

  if (Exit.isSuccess(createExit)) {
    await assignJobLabel({ labelId: createExit.value.id });
  }
}
```

- [ ] **Step 4: Update activity text**

Update `describeActivity`:

```ts
case "label_added": {
  return `${actorPrefix}added label ${payload.labelName}.`;
}
case "label_removed": {
  return `${actorPrefix}removed label ${payload.labelName}.`;
}
```

- [ ] **Step 5: Run detail tests and commit**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-detail-sheet.integration.test.tsx src/routes/-_app._org.jobs.$jobId.test.tsx
```

Expected: PASS.

Commit:

```bash
git add apps/app/src/features/jobs/jobs-detail-state.ts apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx
git commit -m "feat: manage labels from job detail"
```

## Task 6: Add Organization Settings Label Management

**Files:**

- Create: `apps/app/src/features/organizations/organization-labels-state.ts`
- Create: `apps/app/src/features/organizations/organization-labels-panel.tsx`
- Modify: `apps/app/src/features/organizations/organization-settings-page.tsx`
- Test: `apps/app/src/features/organizations/organization-settings-page.test.tsx`

- [ ] **Step 1: Write failing organization settings tests**

Update mocks in `organization-settings-page.test.tsx` for jobs client or mock the new panel module depending on final imports. Prefer testing through UI with mocked jobs API methods:

```ts
const {
  mockedListJobLabels,
  mockedCreateJobLabel,
  mockedUpdateJobLabel,
  mockedDeleteJobLabel,
} = vi.hoisted(() => ({
  mockedListJobLabels: vi.fn(),
  mockedCreateJobLabel: vi.fn(),
  mockedUpdateJobLabel: vi.fn(),
  mockedDeleteJobLabel: vi.fn(),
}));
```

Add test:

```ts
it("manages organization labels", async () => {
  const user = userEvent.setup();
  mockedListJobLabels.mockResolvedValue({
    labels: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "No access",
        createdAt: "2026-04-28T10:00:00.000Z",
        updatedAt: "2026-04-28T10:00:00.000Z",
      },
    ],
  });
  mockedCreateJobLabel.mockResolvedValue({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "Ready to invoice",
    createdAt: "2026-04-28T10:10:00.000Z",
    updatedAt: "2026-04-28T10:10:00.000Z",
  });
  mockedUpdateJobLabel.mockResolvedValue({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    name: "No access confirmed",
    createdAt: "2026-04-28T10:00:00.000Z",
    updatedAt: "2026-04-28T10:20:00.000Z",
  });

  render(<OrganizationSettingsPage organization={organizationFixture} />);

  expect(await screen.findByText("No access")).toBeVisible();

  await user.type(screen.getByLabelText("New label name"), "Ready to invoice");
  await user.click(screen.getByRole("button", { name: "Create label" }));

  await waitFor(() => {
    expect(mockedCreateJobLabel).toHaveBeenCalledWith({
      payload: { name: "Ready to invoice" },
    });
  });

  await user.click(screen.getByRole("button", { name: /edit no access/i }));
  await user.clear(screen.getByLabelText("Label name"));
  await user.type(screen.getByLabelText("Label name"), "No access confirmed");
  await user.click(screen.getByRole("button", { name: "Save label" }));

  expect(mockedUpdateJobLabel).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: /delete no access confirmed/i }));
  expect(mockedDeleteJobLabel).toHaveBeenCalled();
});
```

- [ ] **Step 2: Add organization label state/client helpers**

Create `apps/app/src/features/organizations/organization-labels-state.ts`:

```ts
"use client";

import { Atom } from "@effect-atom/atom-react";
import type {
  CreateJobLabelInput,
  JobLabelIdType,
  JobLabelResponse,
  JobLabelsResponse,
  UpdateJobLabelInput,
} from "@task-tracker/jobs-core";
import { Effect } from "effect";

import { runBrowserJobsRequest } from "#/features/jobs/jobs-client";
import type { AppJobsError } from "#/features/jobs/jobs-errors";

export const organizationLabelsStateAtom = Atom.make<JobLabelsResponse>({
  labels: [],
}).pipe(Atom.keepAlive);

export const loadOrganizationLabelsAtom = Atom.fn<
  AppJobsError,
  JobLabelsResponse
>((_, get) =>
  listBrowserJobLabels().pipe(
    Effect.tap((response) =>
      Effect.sync(() => get.set(organizationLabelsStateAtom, response))
    )
  )
);

export const createOrganizationLabelAtom = Atom.fn<
  AppJobsError,
  JobLabelResponse,
  CreateJobLabelInput
>((input, get) =>
  createBrowserJobLabel(input).pipe(
    Effect.tap((label) =>
      Effect.sync(() => {
        const current = get(organizationLabelsStateAtom);
        get.set(organizationLabelsStateAtom, {
          labels: insertSortedLabel(current.labels, label),
        });
      })
    )
  )
);
```

Add update/delete atoms:

```ts
export const updateOrganizationLabelAtom = Atom.fn<
  AppJobsError,
  JobLabelResponse,
  { readonly labelId: JobLabelIdType; readonly input: UpdateJobLabelInput }
>((request, get) =>
  updateBrowserJobLabel(request.labelId, request.input).pipe(
    Effect.tap((label) =>
      Effect.sync(() => {
        const current = get(organizationLabelsStateAtom);
        get.set(organizationLabelsStateAtom, {
          labels: insertSortedLabel(
            current.labels.filter(
              (currentLabel) => currentLabel.id !== label.id
            ),
            label
          ),
        });
      })
    )
  )
);

export const deleteOrganizationLabelAtom = Atom.fn<
  AppJobsError,
  JobLabelResponse,
  JobLabelIdType
>((labelId, get) =>
  deleteBrowserJobLabel(labelId).pipe(
    Effect.tap((label) =>
      Effect.sync(() => {
        const current = get(organizationLabelsStateAtom);
        get.set(organizationLabelsStateAtom, {
          labels: current.labels.filter(
            (currentLabel) => currentLabel.id !== label.id
          ),
        });
      })
    )
  )
);
```

Add browser wrappers:

```ts
function listBrowserJobLabels() {
  return runBrowserJobsRequest("OrganizationLabels.list", (client) =>
    client.jobs.listJobLabels()
  );
}

function createBrowserJobLabel(input: CreateJobLabelInput) {
  return runBrowserJobsRequest("OrganizationLabels.create", (client) =>
    client.jobs.createJobLabel({ payload: input })
  );
}

function updateBrowserJobLabel(
  labelId: JobLabelIdType,
  input: UpdateJobLabelInput
) {
  return runBrowserJobsRequest("OrganizationLabels.update", (client) =>
    client.jobs.updateJobLabel({ path: { labelId }, payload: input })
  );
}

function deleteBrowserJobLabel(labelId: JobLabelIdType) {
  return runBrowserJobsRequest("OrganizationLabels.delete", (client) =>
    client.jobs.deleteJobLabel({ path: { labelId } })
  );
}
```

- [ ] **Step 3: Add labels panel UI**

Create `apps/app/src/features/organizations/organization-labels-panel.tsx`:

```tsx
"use client";

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  Briefcase01Icon,
  Delete02Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { JobLabel } from "@task-tracker/jobs-core";
import { Exit } from "effect";
import * as React from "react";

import {
  AppRowList,
  AppRowListActions,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
} from "#/components/app-row-list";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";

import {
  createOrganizationLabelAtom,
  deleteOrganizationLabelAtom,
  loadOrganizationLabelsAtom,
  organizationLabelsStateAtom,
  updateOrganizationLabelAtom,
} from "./organization-labels-state";

export function OrganizationLabelsPanel() {
  const labels = useAtomValue(organizationLabelsStateAtom).labels;
  const loadLabels = useAtomSet(loadOrganizationLabelsAtom, {
    mode: "promiseExit",
  });
  const createLabel = useAtomSet(createOrganizationLabelAtom, {
    mode: "promiseExit",
  });
  const updateLabel = useAtomSet(updateOrganizationLabelAtom, {
    mode: "promiseExit",
  });
  const deleteLabel = useAtomSet(deleteOrganizationLabelAtom, {
    mode: "promiseExit",
  });
  const createResult = useAtomValue(createOrganizationLabelAtom);
  const [name, setName] = React.useState("");
  const [editingLabel, setEditingLabel] = React.useState<JobLabel | null>(null);
  const [editName, setEditName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();

    if (!nextName) {
      setError("Add a label name before creating it.");
      return;
    }

    setError(null);
    const exit = await createLabel({ name: nextName });

    if (Exit.isSuccess(exit)) {
      setName("");
    }
  }

  async function handleSaveEdit() {
    if (!editingLabel) {
      return;
    }

    const nextName = editName.trim();

    if (!nextName) {
      setError("Label names cannot be empty.");
      return;
    }

    const exit = await updateLabel({
      input: { name: nextName },
      labelId: editingLabel.id,
    });

    if (Exit.isSuccess(exit)) {
      setEditingLabel(null);
      setEditName("");
    }
  }

  return (
    <AppUtilityPanel
      title="Labels"
      description="Manage the reusable labels your team can apply to jobs."
      className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5 xl:col-span-2"
    >
      {Result.builder(createResult)
        .onError((resultError) => (
          <Alert variant="destructive">
            <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
            <AlertTitle>Label change failed.</AlertTitle>
            <AlertDescription>{resultError.message}</AlertDescription>
          </Alert>
        ))
        .render()}
      <form
        className="flex max-w-xl flex-col gap-3 sm:flex-row"
        onSubmit={handleCreate}
      >
        <Input
          aria-label="New label name"
          value={name}
          placeholder="New label name"
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit">
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Create label
        </Button>
      </form>
      {error ? <FieldError>{error}</FieldError> : null}
      <AppRowList aria-label="Organization labels">
        {labels.map((label) => (
          <AppRowListItem key={label.id}>
            <AppRowListLeading>
              <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
            </AppRowListLeading>
            <AppRowListBody
              title={
                editingLabel?.id === label.id ? (
                  <Input
                    aria-label="Label name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                ) : (
                  <Badge variant="outline" className="w-fit rounded-full">
                    {label.name}
                  </Badge>
                )
              }
              description={`Updated ${formatDate(label.updatedAt)}`}
            />
            <AppRowListActions>
              {editingLabel?.id === label.id ? (
                <>
                  <Button type="button" size="sm" onClick={handleSaveEdit}>
                    Save label
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingLabel(null)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${label.name}`}
                    onClick={() => {
                      setEditingLabel(label);
                      setEditName(label.name);
                    }}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${label.name}`}
                    onClick={() => void deleteLabel(label.id)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  </Button>
                </>
              )}
            </AppRowListActions>
          </AppRowListItem>
        ))}
      </AppRowList>
    </AppUtilityPanel>
  );
}
```

If a Hugeicons import does not exist, replace it with an available icon from `@hugeicons/core-free-icons` and keep the control labels unchanged.

- [ ] **Step 4: Mount panel in settings page**

Update `apps/app/src/features/organizations/organization-settings-page.tsx`:

```tsx
import { OrganizationLabelsPanel } from "./organization-labels-panel";
```

Add `<OrganizationLabelsPanel />` below the existing `Identity` panel inside the grid. Give it `xl:col-span-2` through the panel class as shown above.

- [ ] **Step 5: Run settings tests and commit**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-settings-page.test.tsx
```

Expected: PASS.

Commit:

```bash
git add apps/app/src/features/organizations/organization-labels-state.ts apps/app/src/features/organizations/organization-labels-panel.tsx apps/app/src/features/organizations/organization-settings-page.tsx apps/app/src/features/organizations/organization-settings-page.test.tsx
git commit -m "feat: manage job labels in organization settings"
```

## Task 7: Final Integration And Verification

**Files:**

- Modify any remaining fixture/test files that fail because `labels` is now required.
- Modify generated route tree only if the app build updates `apps/app/src/routeTree.gen.ts`.

- [ ] **Step 1: Run core tests**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test
```

Expected: PASS.

- [ ] **Step 2: Run API tests**

Run:

```bash
pnpm --filter api test
```

Expected: PASS. Integration tests may skip database-backed cases only when the local Postgres test database is unavailable.

- [ ] **Step 3: Run app tests**

Run:

```bash
pnpm --filter app test
```

Expected: PASS.

- [ ] **Step 4: Run type checks**

Run:

```bash
pnpm check-types
```

Expected: PASS.

- [ ] **Step 5: Run lint/format checks**

Run:

```bash
pnpm lint
pnpm format
```

Expected: PASS.

- [ ] **Step 6: Run sandbox smoke test**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Open the app URL from `pnpm sandbox:url` and manually verify:

- organization settings creates a label
- jobs list label filter appears
- job detail can assign the label
- assigned label appears on the list row
- job activity shows label added/removed

When finished:

```bash
pnpm sandbox:down
```

- [ ] **Step 7: Final commit**

Commit any final fixture or polish changes:

```bash
git status --short
git diff --name-only
git add docs/superpowers/plans/2026-04-28-job-labels-implementation.md
git commit -m "test: verify job labels workflow"
```

Replace the `git add` command with an explicit file list from `git diff --name-only` when implementation files changed; do not stage unrelated user changes.

---

## Spec Coverage Checklist

- Organization-scoped labels: `job_labels.organization_id`, repository checks, API actor organization.
- One or more labels per job: `work_item_labels` many-to-many table.
- List/detail visibility: `labels` on `Job` and `JobListItem`.
- Add/remove from job: `POST /jobs/:workItemId/labels`, `DELETE /jobs/:workItemId/labels/:labelId`, detail UI.
- Filter by label: `JobListQuery.labelId`, repository filter, app visible filter.
- Activity logging: `label_added` and `label_removed` payloads and UI descriptions.
- Default labels: out of scope because no clean post-create organization bootstrap exists.
- Status lifecycle: status fields/transitions untouched.
- Type safety/runtime validation: Effect Schema DTOs at API boundaries and DB constraints at persistence boundary.
- Tests: core, repository, service, HTTP, list UI, detail UI, settings UI.
