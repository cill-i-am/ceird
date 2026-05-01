# Job External Reference And Contact Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jobs can carry an optional general external reference and job contacts can carry/display name, email, phone, and notes.

**Architecture:** Add `externalReference` as an optional field on the existing job/work item model, not as a separate reference entity. Contacts already exist as organization-scoped external records with `email`, `phone`, and `notes` columns, so widen the current contact DTO/projection and UI instead of creating account/customer entities. Preserve existing API/database boundaries by updating Effect schemas, Drizzle schema/migrations, repository decoders, and existing integration tests.

**Tech Stack:** TypeScript, Effect Schema/HttpApi, Drizzle/Postgres, TanStack Start/React, Effect Atom, Vitest/Testing Library.

---

## Investigation Summary

- Jobs are modeled as `work_items` in `apps/api/src/domains/jobs/schema.ts`; `packages/jobs-core/src/dto.ts` exposes `JobSchema`, `JobListItemSchema`, `CreateJobInputSchema`, and `PatchJobInputSchema`.
- Sites and contacts are already separate organization-scoped records. `contacts` already has `name`, `email`, `phone`, and `notes` columns, and inline job contact creation already accepts those fields at the API DTO/service/repository level.
- The current contact option projection, `JobContactOptionSchema`, only returns `id`, `name`, and `siteIds`, so the frontend cannot display richer details even though the database can store them.
- Job detail currently renders `detail.job` plus parent-seeded option lookups from `jobsOptionsStateAtom`. The cleanest implementation is to widen the option shape and continue resolving `detail.job.contactId` through `lookup.contactById`.
- The jobs list search is client-side in `visibleJobsAtom`; it currently searches title, kind, and site name. Adding external reference search there is clean because list items are already fully loaded through `listAllBrowserJobs`.

## File Structure

- `packages/jobs-core/src/domain.ts`: define reusable boundary schemas for external reference and contact fields.
- `packages/jobs-core/src/dto.ts`: add `externalReference` to job DTOs and create/patch input DTOs; add contact details to `JobContactOptionSchema`.
- `packages/jobs-core/src/index.ts`: export any new schemas/types added to domain/DTO files.
- `packages/jobs-core/src/index.test.ts`: boundary decoding tests for trimmed external reference and contact details.
- `apps/api/src/domains/jobs/schema.ts`: add `work_items.external_reference`.
- `apps/api/drizzle/0010_*.sql`, `apps/api/drizzle/meta/0010_snapshot.json`, `apps/api/drizzle/meta/_journal.json`: generated Drizzle migration artifacts.
- `apps/api/src/domains/jobs/repositories.ts`: persist/map `externalReference` and project contact detail fields in options.
- `apps/api/src/domains/jobs/service.ts`: pass `externalReference` through create/patch and treat it as a patch change.
- `apps/api/src/domains/jobs/repositories.integration.test.ts`: verify repository create/list/detail and contact option projections.
- `apps/api/src/domains/jobs/http.integration.test.ts`: verify the HTTP create/detail/options flow.
- `apps/app/src/features/jobs/jobs-state.ts`: include `externalReference` and richer contact fields in client-side search/upsert.
- `apps/app/src/features/jobs/jobs-create-sheet.tsx`: add create form controls for external reference and inline contact details.
- `apps/app/src/features/jobs/jobs-detail-sheet.tsx`: display external reference and richer contact details.
- `apps/app/src/features/jobs/jobs-page.test.tsx`: verify search by external reference.
- `apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx`: verify create payload includes external reference/contact details.
- `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx` and `apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx`: verify visible detail content.

---

### Task 1: Core Boundary Schemas

**Files:**

- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Test: `packages/jobs-core/src/index.test.ts`

- [ ] **Step 1: Write the failing DTO boundary test**

Add `JobContactOptionSchema` to the import list in `packages/jobs-core/src/index.test.ts`, then extend `decodes trimmed boundary DTOs` with this code:

```ts
expect(
  ParseResult.decodeUnknownSync(CreateJobInputSchema)({
    title: "  Replace boiler  ",
    externalReference: "  PO-4471  ",
    contact: {
      kind: "create",
      input: {
        name: "  Alex Contact  ",
        email: "  alex@example.com  ",
        phone: "  +353 87 123 4567  ",
        notes: "  Prefers morning calls.  ",
      },
    },
  })
).toStrictEqual({
  title: "Replace boiler",
  externalReference: "PO-4471",
  contact: {
    kind: "create",
    input: {
      name: "Alex Contact",
      email: "alex@example.com",
      phone: "+353 87 123 4567",
      notes: "Prefers morning calls.",
    },
  },
});

expect(
  ParseResult.decodeUnknownSync(JobContactOptionSchema)({
    id: "550e8400-e29b-41d4-a716-446655440001",
    name: "Alex Contact",
    email: "alex@example.com",
    phone: "+353 87 123 4567",
    notes: "Prefers morning calls.",
    siteIds: [],
  })
).toStrictEqual({
  id: "550e8400-e29b-41d4-a716-446655440001",
  name: "Alex Contact",
  email: "alex@example.com",
  phone: "+353 87 123 4567",
  notes: "Prefers morning calls.",
  siteIds: [],
});
```

- [ ] **Step 2: Run the focused core test and confirm failure**

Run:

```bash
pnpm --dir packages/jobs-core test -- src/index.test.ts
```

Expected: fail because `externalReference` is not in `CreateJobInputSchema`, and `JobContactOptionSchema` does not accept contact detail fields.

- [ ] **Step 3: Add domain field schemas**

In `packages/jobs-core/src/domain.ts`, add:

```ts
export const JobExternalReferenceSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(120)
);
export type JobExternalReference = Schema.Schema.Type<
  typeof JobExternalReferenceSchema
>;

export const ContactNameSchema = Schema.Trim.pipe(Schema.minLength(1));
export type ContactName = Schema.Schema.Type<typeof ContactNameSchema>;

export const ContactEmailSchema = Schema.Trim.pipe(Schema.minLength(1));
export type ContactEmail = Schema.Schema.Type<typeof ContactEmailSchema>;

export const ContactPhoneSchema = Schema.Trim.pipe(Schema.minLength(1));
export type ContactPhone = Schema.Schema.Type<typeof ContactPhoneSchema>;

export const ContactNotesSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(2_000)
);
export type ContactNotes = Schema.Schema.Type<typeof ContactNotesSchema>;
```

- [ ] **Step 4: Wire schemas into DTOs**

In `packages/jobs-core/src/dto.ts`, add these imports from `./domain.js`:

```ts
ContactEmailSchema,
ContactNameSchema,
ContactNotesSchema,
ContactPhoneSchema,
JobExternalReferenceSchema,
```

Add `externalReference` to both `JobSchema` and `JobListItemSchema`:

```ts
externalReference: Schema.optional(JobExternalReferenceSchema),
```

Replace the inline contact create input struct with:

```ts
input: Schema.Struct({
  name: ContactNameSchema,
  email: Schema.optional(ContactEmailSchema),
  phone: Schema.optional(ContactPhoneSchema),
  notes: Schema.optional(ContactNotesSchema),
}),
```

Add `externalReference` to create and patch input schemas:

```ts
export const CreateJobInputSchema = Schema.Struct({
  title: JobTitleSchema,
  externalReference: Schema.optional(JobExternalReferenceSchema),
  priority: Schema.optional(JobPrioritySchema),
  site: Schema.optional(CreateJobSiteInputSchema),
  contact: Schema.optional(CreateJobContactInputSchema),
});

export const PatchJobInputSchema = Schema.Struct({
  title: Schema.optional(JobTitleSchema),
  externalReference: Schema.optional(Schema.NullOr(JobExternalReferenceSchema)),
  priority: Schema.optional(JobPrioritySchema),
  siteId: Schema.optional(Schema.NullOr(SiteId)),
  contactId: Schema.optional(Schema.NullOr(ContactId)),
  assigneeId: Schema.optional(Schema.NullOr(UserId)),
  coordinatorId: Schema.optional(Schema.NullOr(UserId)),
});
```

Extend `JobContactOptionSchema`:

```ts
export const JobContactOptionSchema = Schema.Struct({
  id: ContactId,
  name: ContactNameSchema,
  email: Schema.optional(ContactEmailSchema),
  phone: Schema.optional(ContactPhoneSchema),
  notes: Schema.optional(ContactNotesSchema),
  siteIds: Schema.Array(SiteId),
});
```

- [ ] **Step 5: Export the new schemas**

In `packages/jobs-core/src/index.ts`, export the new domain schemas/types:

```ts
ContactEmailSchema,
ContactNameSchema,
ContactNotesSchema,
ContactPhoneSchema,
JobExternalReferenceSchema,
```

Also export the matching types if `index.ts` currently has a type export block for domain types.

- [ ] **Step 6: Run the focused core test and confirm pass**

Run:

```bash
pnpm --dir packages/jobs-core test -- src/index.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/jobs-core/src/domain.ts packages/jobs-core/src/dto.ts packages/jobs-core/src/index.ts packages/jobs-core/src/index.test.ts
git commit -m "feat(jobs): add external reference and contact detail DTOs"
```

---

### Task 2: Database And Repository Persistence

**Files:**

- Modify: `apps/api/src/domains/jobs/schema.ts`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Create: `apps/api/drizzle/0010_*.sql`
- Create: `apps/api/drizzle/meta/0010_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/src/domains/jobs/repositories.integration.test.ts`

- [ ] **Step 1: Write the failing repository integration assertions**

In `apps/api/src/domains/jobs/repositories.integration.test.ts`, update the first test's job create call:

```ts
const job =
  yield *
  JobsRepository.create({
    contactId: createdContactId,
    createdByUserId: identity.ownerUserId,
    externalReference: "PO-4471",
    organizationId: identity.organizationId,
    priority: "high",
    siteId: createdSiteId,
    title: "Replace damaged window seal",
  });
```

Extend the existing assertions:

```ts
expect(detailValue.job.externalReference).toBe("PO-4471");

const list = await runJobsEffect(
  databaseUrl,
  JobsRepository.list(identity.organizationId, {})
);
expect(list.items).toContainEqual(
  expect.objectContaining({
    id: createdJob.id,
    externalReference: "PO-4471",
  })
);

expect(createdContactOption).toMatchObject({
  id: createdContactId,
  name: "Aoife Byrne",
  email: "site-contact@example.com",
  phone: "+353871234567",
  notes: "Prefers morning calls.",
  siteIds: expect.arrayContaining([createdSiteId, overflowSiteId]),
});
```

Also add `notes: "Prefers morning calls."` to the existing `ContactsRepository.create` call in that test.

- [ ] **Step 2: Run the focused repository test and confirm failure**

Run:

```bash
pnpm --dir apps/api test -- src/domains/jobs/repositories.integration.test.ts
```

Expected: fail because the repository input/row mappings do not include `externalReference`, and contact options do not expose `email`, `phone`, or `notes`.

- [ ] **Step 3: Add the database column to the Drizzle schema**

In `apps/api/src/domains/jobs/schema.ts`, add this field inside `workItem` after `title`:

```ts
externalReference: text("external_reference"),
```

Add an index in the work item table callback:

```ts
index("work_items_organization_external_reference_idx").on(
  table.organizationId,
  table.externalReference
),
```

- [ ] **Step 4: Generate the migration**

Run:

```bash
pnpm --dir apps/api db:generate
```

Expected: Drizzle creates a new `apps/api/drizzle/0010_*.sql`, updates `apps/api/drizzle/meta/_journal.json`, and creates `apps/api/drizzle/meta/0010_snapshot.json`.

The generated SQL should include the equivalent of:

```sql
ALTER TABLE "work_items" ADD COLUMN "external_reference" text;
CREATE INDEX "work_items_organization_external_reference_idx" ON "work_items" USING btree ("organization_id","external_reference");
```

- [ ] **Step 5: Update repository types and create/patch inputs**

In `apps/api/src/domains/jobs/repositories.ts`, add `external_reference` to `WorkItemRow`:

```ts
readonly external_reference: string | null;
```

Add `externalReference` to record inputs:

```ts
export interface CreateJobRecordInput {
  readonly assigneeId?: UserId;
  readonly blockedReason?: string;
  readonly completedAt?: string;
  readonly completedByUserId?: UserId;
  readonly contactId?: ContactId;
  readonly coordinatorId?: UserId;
  readonly createdByUserId: UserId;
  readonly externalReference?: string;
  readonly kind?: JobKind;
  readonly organizationId: OrganizationId;
  readonly priority?: JobPriority;
  readonly siteId?: SiteId;
  readonly status?: JobStatus;
  readonly title: JobTitle;
}

export interface PatchJobRecordInput {
  readonly assigneeId?: UserId | null;
  readonly contactId?: ContactId | null;
  readonly coordinatorId?: UserId | null;
  readonly externalReference?: string | null;
  readonly priority?: JobPriority;
  readonly siteId?: SiteId | null;
  readonly title?: JobTitle;
}
```

In the explicit list query select, add:

```sql
work_items.external_reference,
```

In `create`, add to `insertValues`:

```ts
external_reference: input.externalReference ?? null,
```

In `patch`, add:

```ts
if (input.externalReference !== undefined) {
  values.external_reference = input.externalReference;
}
```

In `mapJobRow` and `mapJobListItemRow`, add:

```ts
externalReference: nullableToUndefined(row.external_reference),
```

- [ ] **Step 6: Project contact details from options**

In `JobContactOptionRow`, add:

```ts
readonly email: string | null;
readonly notes: string | null;
readonly phone: string | null;
```

In `ContactsRepository.listOptions`, select:

```sql
contacts.email,
contacts.notes,
contacts.phone,
```

Update the contact accumulator:

```ts
const contacts = new Map<
  string,
  {
    readonly id: string;
    readonly name: string;
    readonly email?: string;
    readonly phone?: string;
    readonly notes?: string;
    readonly siteIds: SiteId[];
  }
>();
```

When setting a new contact:

```ts
contacts.set(row.id, {
  id: row.id,
  name: row.name,
  email: nullableToUndefined(row.email),
  phone: nullableToUndefined(row.phone),
  notes: nullableToUndefined(row.notes),
  siteIds: row.site_id === null ? [] : [decodeSiteId(row.site_id)],
});
```

- [ ] **Step 7: Run the focused repository test and confirm pass**

Run:

```bash
pnpm --dir apps/api test -- src/domains/jobs/repositories.integration.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/domains/jobs/schema.ts apps/api/src/domains/jobs/repositories.ts apps/api/src/domains/jobs/repositories.integration.test.ts apps/api/drizzle
git commit -m "feat(api): persist job external references"
```

---

### Task 3: Service And HTTP API Flow

**Files:**

- Modify: `apps/api/src/domains/jobs/service.ts`
- Test: `apps/api/src/domains/jobs/http.integration.test.ts`

- [ ] **Step 1: Write the failing HTTP workflow assertions**

In `apps/api/src/domains/jobs/http.integration.test.ts`, update the existing `createJobResponse` payload:

```ts
{
  externalReference: "CLAIM-2026-0042",
  priority: "medium",
  title: "Replace boiler expansion vessel",
  contact: {
    kind: "create",
    input: {
      name: "Alex Contact",
      email: "alex@example.com",
      phone: "+353 87 123 4567",
      notes: "Prefers morning calls.",
    },
  },
}
```

Update the created job cast and assertion:

```ts
const createdJob = (await createJobResponse.json()) as {
  readonly externalReference?: string;
  readonly id: string;
  readonly status: string;
};
expect(createdJob.externalReference).toBe("CLAIM-2026-0042");
```

After create, fetch options and assert:

```ts
const optionsAfterJobResponse = await api.handler(
  makeRequest("/jobs/options", {
    cookieJar: ownerCookieJar,
  })
);
expect(optionsAfterJobResponse.status).toBe(200);
const optionsAfterJob = (await optionsAfterJobResponse.json()) as {
  readonly contacts: readonly {
    readonly email?: string;
    readonly name: string;
    readonly notes?: string;
    readonly phone?: string;
  }[];
};
expect(optionsAfterJob.contacts).toContainEqual(
  expect.objectContaining({
    email: "alex@example.com",
    name: "Alex Contact",
    notes: "Prefers morning calls.",
    phone: "+353 87 123 4567",
  })
);
```

Extend the final detail cast/assertion:

```ts
readonly job: {
  readonly completedAt?: string;
  readonly externalReference?: string;
  readonly status: string;
};
```

```ts
expect(finalDetail.job.externalReference).toBe("CLAIM-2026-0042");
```

- [ ] **Step 2: Run the focused HTTP test and confirm failure**

Run:

```bash
pnpm --dir apps/api test -- src/domains/jobs/http.integration.test.ts
```

Expected: fail until the service forwards `externalReference` to the repository.

- [ ] **Step 3: Pass external reference through service create and patch**

In `apps/api/src/domains/jobs/service.ts`, update `jobsRepository.create`:

```ts
const job =
  yield *
  jobsRepository.create({
    contactId,
    createdByUserId: actor.userId,
    externalReference: input.externalReference,
    organizationId: actor.organizationId,
    priority: input.priority,
    siteId,
    title: input.title,
  });
```

Update `hasPatchChanges`:

```ts
function hasPatchChanges(input: PatchJobInput): boolean {
  return (
    input.assigneeId !== undefined ||
    input.contactId !== undefined ||
    input.coordinatorId !== undefined ||
    input.externalReference !== undefined ||
    input.priority !== undefined ||
    input.siteId !== undefined ||
    input.title !== undefined
  );
}
```

No special activity event is required because the current activity model tracks contact/site/assignment/status/priority/title changes; this feature does not need a new workflow event.

- [ ] **Step 4: Run service/API tests and confirm pass**

Run:

```bash
pnpm --dir apps/api test -- src/domains/jobs/service.test.ts src/domains/jobs/http.integration.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/jobs/service.ts apps/api/src/domains/jobs/http.integration.test.ts
git commit -m "feat(api): expose job references through service flow"
```

---

### Task 4: Frontend Create, Detail, And Search

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Test: `apps/app/src/features/jobs/jobs-page.test.tsx`
- Test: `apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx`
- Test: `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`
- Test: `apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx`

- [ ] **Step 1: Write failing app tests**

In `apps/app/src/features/jobs/jobs-page.test.tsx`, add `externalReference: "PO-4471"` to the first seeded job. Add this test:

```ts
it(
  "searches jobs by external reference",
  {
    timeout: 10_000,
  },
  async () => {
    const user = userEvent.setup();

    renderJobsPage();
    const queuePanel = getPrimaryQueuePanel();

    await user.type(screen.getByLabelText("Search jobs"), "PO-4471");

    expect(
      within(queuePanel).getAllByText("Inspect boiler").length
    ).toBeGreaterThan(0);
    expect(
      within(queuePanel).queryByText("Await materials")
    ).not.toBeInTheDocument();
  }
);
```

In `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx` and `apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx`, add this to seeded jobs/detail jobs:

```ts
externalReference: "PO-4471",
```

Add these fields to the seeded `Pat Contact` option:

```ts
email: "pat@example.com",
phone: "+353 87 765 4321",
notes: "Use email for routine updates.",
```

Assert these are visible:

```ts
expect(screen.getAllByText("PO-4471").length).toBeGreaterThan(0);
expect(screen.getAllByText("pat@example.com").length).toBeGreaterThan(0);
expect(screen.getAllByText("+353 87 765 4321").length).toBeGreaterThan(0);
expect(
  screen.getAllByText("Use email for routine updates.").length
).toBeGreaterThan(0);
```

In `apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx`, extend the successful inline contact create test so it fills these controls and asserts the payload sent to `createJob`:

```ts
await user.type(screen.getByLabelText("External reference"), "CLAIM-2026-0042");
await createInlineContact(user, "Alex Caller");
await user.type(screen.getByLabelText("Contact email"), "alex@example.com");
await user.type(screen.getByLabelText("Contact phone"), "+353 87 123 4567");
await user.type(
  screen.getByLabelText("Contact notes"),
  "Prefers morning calls."
);

expect(mockedCreateJob).toHaveBeenCalledWith(
  expect.objectContaining({
    externalReference: "CLAIM-2026-0042",
    contact: {
      kind: "create",
      input: {
        name: "Alex Caller",
        email: "alex@example.com",
        phone: "+353 87 123 4567",
        notes: "Prefers morning calls.",
      },
    },
  })
);
```

- [ ] **Step 2: Run focused app tests and confirm failure**

Run:

```bash
pnpm --dir apps/app test -- src/features/jobs/jobs-page.test.tsx src/features/jobs/jobs-create-sheet.integration.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx src/routes/-_app._org.jobs.$jobId.test.tsx
```

Expected: fail because the UI/state does not handle external references or contact detail display yet.

- [ ] **Step 3: Update jobs state search and optimistic list conversion**

In `apps/app/src/features/jobs/jobs-state.ts`, include contact details in the lookup search block:

```ts
const contact =
  item.contactId === undefined ? undefined : contactById.get(item.contactId);
const searchable = [
  item.title,
  item.kind,
  item.externalReference ?? "",
  siteName ?? "",
  contact?.name ?? "",
  contact?.email ?? "",
  contact?.phone ?? "",
]
  .join(" ")
  .toLowerCase();
```

Update the destructuring above that block to include `contactById`:

```ts
const { contactById, siteById } = get(jobsLookupAtom);
```

Add `externalReference` to `JobListItemSource` and `toJobListItem`:

```ts
| "externalReference"
```

```ts
externalReference: job.externalReference,
```

- [ ] **Step 4: Add create form fields and payload mapping**

In `apps/app/src/features/jobs/jobs-create-sheet.tsx`, import `Textarea`:

```ts
import { Textarea } from "#/components/ui/textarea";
```

Extend form state:

```ts
interface JobsCreateFormState {
  readonly contactEmail: string;
  readonly contactName: string;
  readonly contactNotes: string;
  readonly contactPhone: string;
  readonly contactSelection: string;
  readonly externalReference: string;
  readonly priority: JobPriority;
  readonly siteDraft: SiteCreateDraft;
  readonly siteSelection: string;
  readonly title: string;
}
```

Extend `defaultFormState`:

```ts
contactEmail: "",
contactName: "",
contactNotes: "",
contactPhone: "",
contactSelection: NONE_VALUE,
externalReference: "",
```

Add the external reference field after the title field:

```tsx
<FieldGroup>
  <AuthFormField label="External reference" htmlFor="job-external-reference">
    <Input
      id="job-external-reference"
      value={values.externalReference}
      onChange={(event) =>
        setValues((current) => ({
          ...current,
          externalReference: event.target.value,
        }))
      }
    />
  </AuthFormField>
</FieldGroup>
```

When an existing/none contact is selected, clear contact detail draft fields:

```ts
onValueChange={(nextValue) =>
  setValues((current) => ({
    ...current,
    contactSelection: nextValue,
    contactEmail: "",
    contactName: "",
    contactNotes: "",
    contactPhone: "",
  }))
}
```

Render inline contact detail fields when `values.contactSelection === INLINE_CREATE_VALUE`:

```tsx
{
  values.contactSelection === INLINE_CREATE_VALUE ? (
    <FieldGroup>
      <AuthFormField label="Contact email" htmlFor="job-contact-email">
        <Input
          id="job-contact-email"
          type="email"
          value={values.contactEmail}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              contactEmail: event.target.value,
            }))
          }
        />
      </AuthFormField>
      <AuthFormField label="Contact phone" htmlFor="job-contact-phone">
        <Input
          id="job-contact-phone"
          value={values.contactPhone}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              contactPhone: event.target.value,
            }))
          }
        />
      </AuthFormField>
      <AuthFormField label="Contact notes" htmlFor="job-contact-notes">
        <Textarea
          id="job-contact-notes"
          value={values.contactNotes}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              contactNotes: event.target.value,
            }))
          }
        />
      </AuthFormField>
    </FieldGroup>
  ) : null;
}
```

Add `externalReference` to `buildCreateJobInput`:

```ts
externalReference:
  values.externalReference.trim().length === 0
    ? undefined
    : values.externalReference.trim(),
```

Update inline contact input:

```ts
input: {
  name: values.contactName.trim(),
  ...(values.contactEmail.trim().length > 0
    ? { email: values.contactEmail.trim() }
    : {}),
  ...(values.contactPhone.trim().length > 0
    ? { phone: values.contactPhone.trim() }
    : {}),
  ...(values.contactNotes.trim().length > 0
    ? { notes: values.contactNotes.trim() }
    : {}),
},
```

- [ ] **Step 5: Display reference and contact details on job detail**

In `apps/app/src/features/jobs/jobs-detail-sheet.tsx`, add a header meta item:

```tsx
<HeaderMetaItem
  label="Reference"
  value={detail.job.externalReference ?? "No external reference"}
  supporting="Optional reference from outside this workspace"
/>
```

Replace the contact header supporting copy with general wording:

```tsx
supporting={
  contact?.email ?? contact?.phone ?? "No contact details yet"
}
```

Add this section after `JobsDetailLocation`:

```tsx
<DetailSection
  title="Contact"
  description="Useful details for the person or organization connected to this work."
>
  <JobsDetailContact contact={contact} />
</DetailSection>
```

Add this helper near the other detail helpers:

```tsx
function JobsDetailContact({
  contact,
}: {
  readonly contact:
    | {
        readonly email?: string;
        readonly name: string;
        readonly notes?: string;
        readonly phone?: string;
      }
    | undefined;
}) {
  if (!contact) {
    return (
      <DetailEmpty
        title="No contact yet."
        description="Add one when there is a clear related person or organization."
      />
    );
  }

  return (
    <div className="grid gap-3 text-sm">
      <HeaderMetaItem label="Name" value={contact.name} />
      {contact.email ? (
        <HeaderMetaItem label="Email" value={contact.email} />
      ) : null}
      {contact.phone ? (
        <HeaderMetaItem label="Phone" value={contact.phone} />
      ) : null}
      {contact.notes ? (
        <HeaderMetaItem label="Notes" value={contact.notes} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Run focused app tests and confirm pass**

Run:

```bash
pnpm --dir apps/app test -- src/features/jobs/jobs-page.test.tsx src/features/jobs/jobs-create-sheet.integration.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx src/routes/-_app._org.jobs.$jobId.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/features/jobs/jobs-state.ts apps/app/src/features/jobs/jobs-create-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-page.test.tsx apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx
git commit -m "feat(app): show job references and richer contacts"
```

---

### Task 5: Final Verification

**Files:**

- Verify all changed files from Tasks 1-4.

- [ ] **Step 1: Run package-level checks**

Run:

```bash
pnpm --dir packages/jobs-core check-types
pnpm --dir apps/api check-types
pnpm --dir apps/app check-types
```

Expected: all pass.

- [ ] **Step 2: Run focused test suites**

Run:

```bash
pnpm --dir packages/jobs-core test -- src/index.test.ts
pnpm --dir apps/api test -- src/domains/jobs/repositories.integration.test.ts src/domains/jobs/http.integration.test.ts src/domains/jobs/service.test.ts
pnpm --dir apps/app test -- src/features/jobs/jobs-page.test.tsx src/features/jobs/jobs-create-sheet.integration.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx src/routes/-_app._org.jobs.$jobId.test.tsx
```

Expected: all pass. Integration database tests may skip only if the test database is unavailable, matching the existing test behavior.

- [ ] **Step 3: Run full repo checks**

Run:

```bash
pnpm check-types
pnpm test
```

Expected: all pass.

- [ ] **Step 4: Optional sandbox smoke test**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Open the app URL from `pnpm sandbox:url`, create a job with external reference `PO-4471`, inline-create a contact with email/phone/notes, open the created job, and verify:

- The job detail shows `PO-4471`.
- The job detail shows contact name, email, phone, and notes.
- The jobs list search finds the job when searching `PO-4471`.

When finished:

```bash
pnpm sandbox:down
```

- [ ] **Step 5: Final commit**

If verification required small fixes, commit them:

```bash
git add .
git commit -m "test: verify job references and contact details"
```

If verification produced no new changes, leave the branch with the Task 1-4 commits.

---

## Self-Review

- Spec coverage: external reference is added to create, detail, list item, repository persistence, and client-side search. Contact name/email/phone/notes use the existing contact entity and are visible on detail. No customer/account/billing concepts are introduced.
- Type/runtime boundaries: Effect schemas cover API DTOs; Drizzle migration covers persistence; repository decoders validate output.
- Search scope: current search is client-side and already filters loaded jobs, so external reference search belongs in `visibleJobsAtom`; no new server query parameter is needed.
- Hotkeys: no new primary navigation target, command item, repeated row action, drawer action, or icon-only control is introduced. Existing create/search hotkeys remain unchanged.
