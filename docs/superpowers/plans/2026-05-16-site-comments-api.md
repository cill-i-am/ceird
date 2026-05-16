# Site Comments API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add internal-only comments for sites at the API and atom layers while keeping existing site notes unchanged.

**Architecture:** Introduce a shared comments contract package so job and site comments use the same runtime schemas without making `@ceird/sites-core` depend on `@ceird/jobs-core`. Replace the jobs-owned `work_item_comments` content table with a clean shared `comments` table for body, author, creation, and edit metadata, plus target-specific ownership tables for jobs and sites. Keep job and site comments create/list-only for now, but include `updated_at` and `updated_by_user_id` on `comments` so future editable account-line comments do not require reshaping the shared table.

**Tech Stack:** TypeScript, Effect Schema, Effect HttpApi, Drizzle/Postgres, TanStack Start app API client, Effect Atom.

---

## File Structure

- Create `packages/comments-core/package.json`: shared package metadata.
- Create `packages/comments-core/tsconfig.json`: package TypeScript config matching existing core packages.
- Create `packages/comments-core/src/ids.ts`: shared `CommentId` brand.
- Create `packages/comments-core/src/domain.ts`: shared `CommentBodySchema` and ISO datetime export.
- Create `packages/comments-core/src/dto.ts`: shared `CommentSchema`, `EditableCommentSchema`, `AddCommentInputSchema`, and response aliases.
- Create `packages/comments-core/src/index.ts`: public exports.
- Create `packages/comments-core/src/index.test.ts`: schema and trim validation tests.
- Modify `packages/jobs-core/package.json`: depend on `@ceird/comments-core`.
- Modify `packages/jobs-core/src/ids.ts`: re-export `CommentId` from comments-core instead of owning the brand.
- Modify `packages/jobs-core/src/domain.ts`: re-export or alias `JobCommentBodySchema` from comments-core.
- Modify `packages/jobs-core/src/dto.ts`: compose `JobCommentSchema` from shared comment fields plus `workItemId`.
- Modify `packages/jobs-core/src/index.ts`: preserve existing `CommentId`, `JobCommentBodySchema`, `AddJobCommentInputSchema`, and related exports.
- Modify `packages/sites-core/package.json`: depend on `@ceird/comments-core`.
- Modify `packages/sites-core/src/dto.ts`: add `SiteCommentSchema`, `AddSiteCommentInputSchema`, `AddSiteCommentResponseSchema`, and `SiteCommentsResponseSchema`.
- Modify `packages/sites-core/src/http-api.ts`: add `GET /sites/:siteId/comments` and `POST /sites/:siteId/comments`.
- Modify `packages/sites-core/src/index.ts`: export site comment DTOs and shared comment types needed by the app.
- Modify `apps/api/src/domains/jobs/schema.ts`: remove jobs-owned comment content columns; keep or import a target-specific `workItemComment` ownership table.
- Create `apps/api/src/domains/comments/schema.ts`: shared Drizzle `comment` table, `workItemComment` ownership table, `siteComment` ownership table, and relations.
- Create `apps/api/src/domains/comments/repository.ts`: shared list/add helpers for job and site comments.
- Create `apps/api/src/domains/comments/id-generation.ts`: shared comment ID generation using the existing job-domain UUID helper until a broader ID module exists.
- Modify `apps/api/src/platform/database/schema.ts`: export and merge `commentsSchema`.
- Modify `apps/api/src/domains/jobs/repositories.ts`: replace direct `work_item_comments` SQL with `CommentsRepository` calls.
- Modify `apps/api/src/domains/jobs/service.ts`: keep existing `addComment` behavior and authorization, delegating insertion to the shared comments repository.
- Modify `apps/api/src/domains/sites/repositories.ts`: add a `findByIdForUpdate` helper for comment creation.
- Modify `apps/api/src/domains/sites/service.ts`: add `listComments(siteId)` and `addComment(siteId, input)` with internal-only authorization.
- Modify `apps/api/src/domains/sites/http.ts`: bind the two new site comment handlers.
- Add generated migration under `apps/api/drizzle`: migrate existing `work_item_comments` content into `comments`, then convert `work_item_comments` into the job ownership table and add `site_comments`.
- Modify `apps/app/src/features/api/app-api-client.ts`: no manual endpoint code should be needed, but keep `SitesApiGroup` included.
- Modify `apps/app/src/features/sites/sites-state.ts`: add site comments state, refresh atom, and add-comment mutation atom.
- Modify `docs/architecture/api.md`: document shared comments storage and new site endpoints.
- Modify `docs/architecture/packages.md`: document `@ceird/comments-core`.

---

### Task 0: Prepare The Worktree

**Files:**

- No code files.

- [ ] **Step 1: Check branch state**

Run:

```bash
git status --short --branch
```

Expected in this worktree today:

```text
## HEAD (no branch)
```

- [ ] **Step 2: Create a task branch before sandbox work**

Run:

```bash
git switch -c codex/site-comments-api
```

Expected: Git switches to the new branch. This is required before `pnpm sandbox:up` because linked worktree sandbox names should be branch-derived.

---

### Task 1: Add Shared Comments Core Package

**Files:**

- Create: `packages/comments-core/package.json`
- Create: `packages/comments-core/tsconfig.json`
- Create: `packages/comments-core/src/ids.ts`
- Create: `packages/comments-core/src/domain.ts`
- Create: `packages/comments-core/src/dto.ts`
- Create: `packages/comments-core/src/index.ts`
- Create: `packages/comments-core/src/index.test.ts`

- [ ] **Step 1: Write schema tests first**

Create `packages/comments-core/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  AddCommentInputSchema,
  EditableCommentSchema,
  CommentBodySchema,
  CommentId,
  CommentSchema,
} from "./index.js";

const decodeBody = Schema.decodeUnknownSync(CommentBodySchema);
const decodeInput = Schema.decodeUnknownSync(AddCommentInputSchema);
const decodeComment = Schema.decodeUnknownSync(CommentSchema);
const decodeEditableComment = Schema.decodeUnknownSync(EditableCommentSchema);

describe("@ceird/comments-core", () => {
  it("trims non-empty comment bodies", () => {
    expect(decodeBody("  Checked access gate.  ")).toBe("Checked access gate.");
    expect(decodeInput({ body: "  Bring ladder.  " })).toStrictEqual({
      body: "Bring ladder.",
    });
  });

  it("rejects empty comment bodies", () => {
    expect(() => decodeBody("   ")).toThrow();
    expect(() => decodeInput({ body: "" })).toThrow();
  });

  it("decodes shared comment DTOs", () => {
    expect(
      decodeComment({
        id: "77777777-7777-4777-8777-777777777777",
        authorUserId: "user_123",
        authorName: "Ciara",
        body: "Gate code changed.",
        createdAt: "2026-05-16T09:30:00.000Z",
      })
    ).toStrictEqual({
      id: "77777777-7777-4777-8777-777777777777" as Schema.Schema.Type<
        typeof CommentId
      >,
      authorUserId: "user_123",
      authorName: "Ciara",
      body: "Gate code changed.",
      createdAt: "2026-05-16T09:30:00.000Z",
    });
  });

  it("supports editable comment metadata for future editable targets", () => {
    expect(
      decodeEditableComment({
        id: "77777777-7777-4777-8777-777777777777",
        authorUserId: "user_123",
        authorName: "Ciara",
        body: "Gate code changed.",
        createdAt: "2026-05-16T09:30:00.000Z",
        updatedAt: "2026-05-16T09:45:00.000Z",
        updatedByUserId: "user_456",
      })
    ).toMatchObject({
      body: "Gate code changed.",
      updatedAt: "2026-05-16T09:45:00.000Z",
      updatedByUserId: "user_456",
    });
  });
});
```

- [ ] **Step 2: Run the new package test and verify it fails**

Run:

```bash
pnpm --filter @ceird/comments-core test
```

Expected: FAIL because the package and schemas do not exist yet.

- [ ] **Step 3: Add the package files**

Create `packages/comments-core/package.json`:

```json
{
  "name": "@ceird/comments-core",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "test": "vitest run",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@ceird/identity-core": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/comments-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src"]
}
```

Create `packages/comments-core/src/ids.ts`:

```ts
import { Schema } from "effect";

export const CommentId = Schema.UUID.pipe(
  Schema.brand("@ceird/comments-core/CommentId")
);
export type CommentId = Schema.Schema.Type<typeof CommentId>;
```

Create `packages/comments-core/src/domain.ts`:

```ts
import {
  IsoDateTimeString as IdentityIsoDateTimeString,
  UserId,
} from "@ceird/identity-core";
import type { UserId as UserIdType } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export { UserId };
export type UserId = UserIdType;

export const CommentBodySchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(10_000)
);
export type CommentBody = Schema.Schema.Type<typeof CommentBodySchema>;
```

Create `packages/comments-core/src/dto.ts`:

```ts
import { Schema } from "effect";

import { CommentBodySchema, IsoDateTimeString, UserId } from "./domain.js";
import { CommentId } from "./ids.js";

export const CommentSchema = Schema.Struct({
  id: CommentId,
  authorUserId: UserId,
  authorName: Schema.optional(Schema.String),
  body: CommentBodySchema,
  createdAt: IsoDateTimeString,
});
export type Comment = Schema.Schema.Type<typeof CommentSchema>;

export const EditableCommentSchema = Schema.extend(
  CommentSchema,
  Schema.Struct({
    updatedAt: IsoDateTimeString,
    updatedByUserId: Schema.optional(UserId),
  })
);
export type EditableComment = Schema.Schema.Type<typeof EditableCommentSchema>;

export const AddCommentInputSchema = Schema.Struct({
  body: CommentBodySchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type AddCommentInput = Schema.Schema.Type<typeof AddCommentInputSchema>;

export const AddCommentResponseSchema = CommentSchema;
export type AddCommentResponse = Schema.Schema.Type<
  typeof AddCommentResponseSchema
>;
```

Create `packages/comments-core/src/index.ts`:

```ts
export { CommentId } from "./ids.js";
export type { CommentId as CommentIdType } from "./ids.js";

export { CommentBodySchema, IsoDateTimeString, UserId } from "./domain.js";
export type {
  CommentBody,
  IsoDateTimeString as IsoDateTimeStringType,
  UserId as UserIdType,
} from "./domain.js";

export {
  AddCommentInputSchema,
  AddCommentResponseSchema,
  CommentSchema,
  EditableCommentSchema,
} from "./dto.js";
export type {
  AddCommentInput,
  AddCommentResponse,
  Comment,
  EditableComment,
} from "./dto.js";
```

- [ ] **Step 4: Verify the package**

Run:

```bash
pnpm --filter @ceird/comments-core test
pnpm --filter @ceird/comments-core check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/comments-core
git commit -m "feat: add shared comments contract"
```

---

### Task 2: Refactor Jobs Core To Consume Shared Comment Primitives

**Files:**

- Modify: `packages/jobs-core/package.json`
- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Modify: `packages/jobs-core/src/index.test.ts`

- [ ] **Step 1: Add dependency and re-exports**

In `packages/jobs-core/package.json`, add:

```json
"@ceird/comments-core": "workspace:*"
```

to `dependencies`.

In `packages/jobs-core/src/ids.ts`, replace the local `CommentId` definition with:

```ts
export { CommentId } from "@ceird/comments-core";
export type { CommentId as CommentIdType } from "@ceird/comments-core";
```

Leave the existing job-owned IDs in the same file.

In `packages/jobs-core/src/domain.ts`, replace the local `JobCommentBodySchema` definition with:

```ts
export { CommentBodySchema as JobCommentBodySchema } from "@ceird/comments-core";
export type { CommentBody as JobCommentBody } from "@ceird/comments-core";
```

- [ ] **Step 2: Compose job comment DTO from shared fields**

In `packages/jobs-core/src/dto.ts`, import `CommentSchema` from `@ceird/comments-core` and define:

```ts
export const JobCommentSchema = Schema.extend(
  CommentSchema,
  Schema.Struct({
    workItemId: WorkItemId,
  })
);
export type JobComment = Schema.Schema.Type<typeof JobCommentSchema>;
```

Keep `AddJobCommentInputSchema` and `AddJobCommentResponseSchema` exported under the same names so existing app/API code remains source-compatible.

- [ ] **Step 3: Add compatibility assertions**

Extend `packages/jobs-core/src/index.test.ts` with:

```ts
it("keeps job comments compatible with the existing API shape", () => {
  const decode = Schema.decodeUnknownSync(JobCommentSchema);

  expect(
    decode({
      id: "77777777-7777-4777-8777-777777777777",
      workItemId: "11111111-1111-4111-8111-111111111111",
      authorUserId: "user_123",
      authorName: "Ciara",
      body: "Pump room inspected.",
      createdAt: "2026-05-16T09:30:00.000Z",
    })
  ).toMatchObject({
    authorUserId: "user_123",
    body: "Pump room inspected.",
  });
});
```

Add imports for `Schema` and `JobCommentSchema` if they are not already present.

- [ ] **Step 4: Verify jobs-core**

Run:

```bash
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/jobs-core check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jobs-core
git commit -m "refactor: share job comment primitives"
```

---

### Task 3: Add Site Comment Contracts

**Files:**

- Modify: `packages/sites-core/package.json`
- Modify: `packages/sites-core/src/dto.ts`
- Modify: `packages/sites-core/src/http-api.ts`
- Modify: `packages/sites-core/src/index.ts`
- Modify: `packages/sites-core/src/index.test.ts`

- [ ] **Step 1: Write sites-core contract tests**

Add to `packages/sites-core/src/index.test.ts`:

```ts
import {
  AddSiteCommentInputSchema,
  SiteCommentSchema,
  SiteCommentsResponseSchema,
} from "./index.js";

it("decodes site comment contracts", () => {
  const decodeInput = Schema.decodeUnknownSync(AddSiteCommentInputSchema);
  const decodeComment = Schema.decodeUnknownSync(SiteCommentSchema);
  const decodeResponse = Schema.decodeUnknownSync(SiteCommentsResponseSchema);

  const comment = decodeComment({
    id: "77777777-7777-4777-8777-777777777777",
    siteId: "22222222-2222-4222-8222-222222222222",
    authorUserId: "user_123",
    authorName: "Ciara",
    body: "Gate code changed.",
    createdAt: "2026-05-16T09:30:00.000Z",
  });

  expect(decodeInput({ body: "  Use north gate.  " })).toStrictEqual({
    body: "Use north gate.",
  });
  expect(decodeResponse({ comments: [comment] })).toStrictEqual({
    comments: [comment],
  });
});
```

- [ ] **Step 2: Run sites-core tests and verify failure**

Run:

```bash
pnpm --filter @ceird/sites-core test
```

Expected: FAIL because site comment schemas do not exist.

- [ ] **Step 3: Add DTOs**

In `packages/sites-core/package.json`, add:

```json
"@ceird/comments-core": "workspace:*"
```

In `packages/sites-core/src/dto.ts`, add imports:

```ts
import { AddCommentInputSchema, CommentSchema } from "@ceird/comments-core";
```

Then add:

```ts
export const SiteCommentSchema = Schema.extend(
  CommentSchema,
  Schema.Struct({
    siteId: SiteId,
  })
);
export type SiteComment = Schema.Schema.Type<typeof SiteCommentSchema>;

export const AddSiteCommentInputSchema = AddCommentInputSchema;
export type AddSiteCommentInput = Schema.Schema.Type<
  typeof AddSiteCommentInputSchema
>;

export const AddSiteCommentResponseSchema = SiteCommentSchema;
export type AddSiteCommentResponse = Schema.Schema.Type<
  typeof AddSiteCommentResponseSchema
>;

export const SiteCommentsResponseSchema = Schema.Struct({
  comments: Schema.Array(SiteCommentSchema),
});
export type SiteCommentsResponse = Schema.Schema.Type<
  typeof SiteCommentsResponseSchema
>;
```

- [ ] **Step 4: Add HTTP endpoints**

In `packages/sites-core/src/http-api.ts`, import the new schemas and add to `sitesGroup`:

```ts
.add(
  HttpApiEndpoint.get("listSiteComments", "/sites/:siteId/comments")
    .setPath(Schema.Struct({ siteId: SiteId }))
    .addSuccess(SiteCommentsResponseSchema)
    .addError(SiteAccessDeniedError)
    .addError(SiteNotFoundError)
    .addError(SiteStorageError)
)
.add(
  HttpApiEndpoint.post("addSiteComment", "/sites/:siteId/comments")
    .setPath(Schema.Struct({ siteId: SiteId }))
    .setPayload(AddSiteCommentInputSchema)
    .addSuccess(AddSiteCommentResponseSchema, { status: 201 })
    .addError(SiteAccessDeniedError)
    .addError(SiteNotFoundError)
    .addError(SiteStorageError)
)
```

- [ ] **Step 5: Export the new contracts**

In `packages/sites-core/src/index.ts`, export:

```ts
export {
  AddSiteCommentInputSchema,
  AddSiteCommentResponseSchema,
  SiteCommentSchema,
  SiteCommentsResponseSchema,
} from "./dto.js";
export type {
  AddSiteCommentInput,
  AddSiteCommentResponse,
  SiteComment,
  SiteCommentsResponse,
} from "./dto.js";
```

- [ ] **Step 6: Verify sites-core**

Run:

```bash
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/sites-core check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/sites-core
git commit -m "feat: add site comment contracts"
```

---

### Task 4: Add Shared Comments Persistence

**Files:**

- Create: `apps/api/src/domains/comments/id-generation.ts`
- Create: `apps/api/src/domains/comments/schema.ts`
- Create: `apps/api/src/domains/comments/repository.ts`
- Modify: `apps/api/src/platform/database/schema.ts`
- Modify: `apps/api/src/domains/jobs/schema.ts`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Modify: `apps/api/drizzle/*`

- [ ] **Step 1: Write persistence expectations**

Add focused tests to `apps/api/src/domains/persistence.integration.test.ts` proving:

```ts
it("stores comment content once and attaches it through target tables", async () => {
  // Seed organization, user, site, and job using existing helpers.
  // Insert one shared comments row and attach it through work_item_comments.
  // Insert one shared comments row and attach it through site_comments.
  // Assert both shared rows exist in comments.
  // Assert the ownership rows contain no body text.
  // Assert account-line-ready edit metadata exists on comments:
  // updated_at is not null and updated_by_user_id is nullable.
  // Assert the database rejects a work_item_comments row whose organization_id
  // does not match the referenced comment or work item.
  // Assert the database rejects a site_comments row whose organization_id does
  // not match the referenced comment or site.
});
```

Use the existing test helper style in that file rather than adding a new fixture framework.

- [ ] **Step 2: Run persistence test and verify failure**

Run:

```bash
pnpm --filter api test -- src/domains/persistence.integration.test.ts
```

Expected: FAIL because the `comments` table does not exist yet.

- [ ] **Step 3: Add shared schema**

Create `apps/api/src/domains/comments/id-generation.ts`:

```ts
import { CommentId } from "@ceird/comments-core";
import type { CommentIdType } from "@ceird/comments-core";
import { Schema } from "effect";

import { generateJobDomainUuid } from "../jobs/id-generation.js";

const decodeCommentId = Schema.decodeUnknownSync(CommentId);

export function generateCommentId(): CommentIdType {
  return decodeCommentId(generateJobDomainUuid());
}
```

Create `apps/api/src/domains/comments/schema.ts` with a clean `comment` table plus target-specific ownership tables:

```ts
export const comment = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().$defaultFn(generateCommentId),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    createdAt: commentsTimestamp("created_at"),
    updatedAt: commentsTimestamp("updated_at"),
    updatedByUserId: text("updated_by_user_id").references(() => user.id),
  },
  (table) => [
    uniqueIndex("comments_id_organization_idx").on(
      table.id,
      table.organizationId
    ),
  ]
);

export const workItemComment = pgTable(
  "work_item_comments",
  {
    commentId: uuid("comment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    workItemId: uuid("work_item_id").notNull(),
    createdAt: commentsTimestamp("created_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.commentId, table.organizationId],
      foreignColumns: [comment.id, comment.organizationId],
      name: "work_item_comments_comment_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workItemId, table.organizationId],
      foreignColumns: [workItem.id, workItem.organizationId],
      name: "work_item_comments_work_item_org_fk",
    }).onDelete("cascade"),
    index("work_item_comments_work_item_created_at_idx").on(
      table.workItemId,
      table.createdAt.asc(),
      table.commentId.asc()
    ),
  ]
);

export const siteComment = pgTable(
  "site_comments",
  {
    commentId: uuid("comment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    siteId: uuid("site_id").notNull(),
    createdAt: commentsTimestamp("created_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.commentId, table.organizationId],
      foreignColumns: [comment.id, comment.organizationId],
      name: "site_comments_comment_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.siteId, table.organizationId],
      foreignColumns: [site.id, site.organizationId],
      name: "site_comments_site_org_fk",
    }).onDelete("cascade"),
    index("site_comments_site_created_at_idx").on(
      table.siteId,
      table.createdAt.asc(),
      table.commentId.asc()
    ),
  ]
);
```

Add relations to `organization`, `user`, `workItem`, `site`, `comment`, `workItemComment`, and `siteComment`. The duplicated `created_at` on each ownership table is relationship metadata used for efficient target-local ordering; the repository should set it to the same timestamp used for the shared `comments.created_at`.

- [ ] **Step 4: Move jobs schema references**

In `apps/api/src/domains/jobs/schema.ts`, remove the old `workItemComment` definition that stores `body` and `author_user_id`. Import the new `workItemComment` ownership table from `../comments/schema.js` where `workItemRelations` needs `comments: many(workItemComment)`, and remove the old table from `jobsSchema`.

In `apps/api/src/platform/database/schema.ts`, export and merge:

```ts
import { commentsSchema } from "../../domains/comments/schema.js";
export {
  comment,
  commentRelations,
  commentsSchema,
  siteComment,
  siteCommentRelations,
  workItemComment,
  workItemCommentRelations,
} from "../../domains/comments/schema.js";

export const databaseSchema = {
  ...authSchema,
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
  ...commentsSchema,
};
```

- [ ] **Step 5: Add repository helpers**

Create `apps/api/src/domains/comments/repository.ts` with methods:

```ts
listForWorkItem(input: { organizationId: OrganizationId; workItemId: WorkItemId }): Effect.Effect<readonly JobComment[], SqlError>
addForWorkItem(input: { organizationId: OrganizationId; workItemId: WorkItemId; authorUserId: UserId; body: string }): Effect.Effect<JobComment, SqlError>
listForSite(input: { organizationId: OrganizationId; siteId: SiteId }): Effect.Effect<readonly SiteComment[], SqlError>
addForSite(input: { organizationId: OrganizationId; siteId: SiteId; authorUserId: UserId; body: string }): Effect.Effect<SiteComment, SqlError>
```

Map rows with shared fields plus `workItemId` or `siteId`, preserving `authorName` from the `user` join.

- [ ] **Step 6: Update jobs repository usage**

In `apps/api/src/domains/jobs/repositories.ts`, replace SQL references to old content-bearing `work_item_comments` rows with `CommentsRepository` calls. Keep the public repository method names `addComment` and detail mapping stable.

- [ ] **Step 7: Generate and inspect migration**

Run:

```bash
pnpm --filter api db:generate
```

Inspect the generated SQL under `apps/api/drizzle`. It must:

- create `comments`;
- preserve existing job comments by copying `id`, `author_user_id`, `body`, and `created_at` from old `work_item_comments` into `comments`, deriving `organization_id` by joining `work_items`;
- convert `work_item_comments` into an ownership table with `comment_id`, `organization_id`, `work_item_id`, and `created_at`;
- create `site_comments` with the same ownership pattern;
- add `comments.updated_at` and nullable `comments.updated_by_user_id` for future editable account-line comments;
- add indexes for job and site comment ordering.

- [ ] **Step 8: Verify persistence**

Run:

```bash
pnpm --filter api test -- src/domains/persistence.integration.test.ts
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/domains/comments apps/api/src/domains/jobs/schema.ts apps/api/src/domains/jobs/repositories.ts apps/api/src/platform/database/schema.ts apps/api/drizzle
git commit -m "feat: share comment persistence"
```

---

### Task 5: Add Site Comment Service And HTTP Handlers

**Files:**

- Modify: `apps/api/src/domains/sites/repositories.ts`
- Modify: `apps/api/src/domains/sites/service.ts`
- Modify: `apps/api/src/domains/sites/http.ts`
- Modify: `apps/api/src/domains/sites/service.test.ts`
- Modify: `apps/api/src/domains/http.integration.test.ts`

- [ ] **Step 1: Write service tests**

Add tests to `apps/api/src/domains/sites/service.test.ts`:

```ts
it("allows internal members to list and add site comments", async () => {
  const harness = makeSitesServiceHarness({ role: "member" });
  const siteId = harness.seedSite();

  await expectEffectSuccess(
    harness.service.addComment(siteId, { body: "  Use the quay entrance.  " })
  ).resolves.toMatchObject({
    siteId,
    authorUserId: harness.actor.userId,
    body: "Use the quay entrance.",
  });

  await expectEffectSuccess(
    harness.service.listComments(siteId)
  ).resolves.toMatchObject({
    comments: [
      {
        siteId,
        body: "Use the quay entrance.",
      },
    ],
  });
});

it("denies external collaborators from site comments", async () => {
  const harness = makeSitesServiceHarness({ role: "external" });
  const siteId = harness.seedSite();

  await expectEffectFailure(
    harness.service.addComment(siteId, { body: "No access" })
  ).resolves.toBeInstanceOf(SiteAccessDeniedError);

  await expectEffectFailure(
    harness.service.listComments(siteId)
  ).resolves.toBeInstanceOf(SiteAccessDeniedError);
});

it("fails with SiteNotFoundError when commenting on a missing site", async () => {
  const harness = makeSitesServiceHarness({ role: "member" });
  const siteId = "22222222-2222-4222-8222-222222222222" as SiteIdType;

  await expectEffectFailure(
    harness.service.addComment(siteId, { body: "Missing" })
  ).resolves.toBeInstanceOf(SiteNotFoundError);
});
```

Adapt names to the existing harness helpers in `service.test.ts`.

- [ ] **Step 2: Write HTTP integration tests**

Add cases to `apps/api/src/domains/http.integration.test.ts`:

```ts
it("creates and lists internal site comments over HTTP", async () => {
  // Sign in an internal member with the existing helpers.
  // Create a site.
  // POST /sites/:siteId/comments with { body: " Bring keys. " }.
  // Expect 201 and body "Bring keys.".
  // GET /sites/:siteId/comments.
  // Expect comments array with the created comment.
});

it("returns 403 for external site comments", async () => {
  // Sign in an external member.
  // POST /sites/:siteId/comments.
  // Expect 403 SiteAccessDeniedError.
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --filter api test -- src/domains/sites/service.test.ts src/domains/http.integration.test.ts
```

Expected: FAIL because service and handlers do not exist.

- [ ] **Step 4: Add repository site locking helper**

In `apps/api/src/domains/sites/repositories.ts`, add:

```ts
const findByIdForUpdate = Effect.fn("SitesRepository.findByIdForUpdate")(
  function* (organizationId: OrganizationId, siteId: SiteId) {
    const rows = yield* sql<IdRow>`
      select id
      from sites
      where organization_id = ${organizationId}
        and id = ${siteId}
        and archived_at is null
      for update
      limit 1
    `;

    return Option.fromNullable(rows[0]?.id).pipe(Option.map(decodeSiteId));
  }
);
```

Return it from the repository service.

- [ ] **Step 5: Add service methods**

In `apps/api/src/domains/sites/service.ts`, inject `CommentsRepository` and add:

```ts
const listComments = Effect.fn("SitesService.listComments")(function* (
  siteId: SiteId
) {
  const actor = yield* loadActor();
  yield* ensureCanUseSiteComments(actor, authorization);
  yield* ensureSiteExists(actor.organizationId, siteId, sitesRepository);

  const comments = yield* commentsRepository
    .listForSite({ organizationId: actor.organizationId, siteId })
    .pipe(Effect.catchTag("SqlError", failSitesStorageError));

  return { comments } as const;
});

const addComment = Effect.fn("SitesService.addComment")(function* (
  siteId: SiteId,
  input: AddSiteCommentInput
) {
  const actor = yield* loadActor();
  yield* ensureCanUseSiteComments(actor, authorization);

  return yield* sitesRepository
    .withTransaction(
      Effect.gen(function* () {
        yield* ensureSiteExistsForUpdate(
          actor.organizationId,
          siteId,
          sitesRepository
        );
        return yield* commentsRepository.addForSite({
          authorUserId: actor.userId,
          body: input.body,
          organizationId: actor.organizationId,
          siteId,
        });
      })
    )
    .pipe(Effect.catchTag("SqlError", failSitesStorageError));
});
```

Implement `ensureCanUseSiteComments` as internal-only:

```ts
function ensureCanUseSiteComments(
  actor: OrganizationActor,
  authorization: OrganizationAuthorization
) {
  return authorization
    .ensureCanViewOrganizationData(actor)
    .pipe(
      Effect.catchTag(
        ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
        failSiteAccessDenied
      )
    );
}
```

Return `listComments` and `addComment` from `SitesService`.

- [ ] **Step 6: Add HTTP handlers**

In `apps/api/src/domains/sites/http.ts`, add:

```ts
.handle("listSiteComments", ({ path }) =>
  sitesService
    .listComments(path.siteId)
    .pipe(observeSitesOperation("listSiteComments"))
)
.handle("addSiteComment", ({ path, payload }) =>
  sitesService
    .addComment(path.siteId, payload)
    .pipe(observeSitesOperation("addSiteComment"))
)
```

- [ ] **Step 7: Verify API**

Run:

```bash
pnpm --filter api test -- src/domains/sites/service.test.ts src/domains/http.integration.test.ts
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/domains/sites apps/api/src/domains/http.integration.test.ts
git commit -m "feat: add site comment api"
```

---

### Task 6: Wire Site Comments Atoms

**Files:**

- Modify: `apps/app/src/features/sites/sites-state.ts`
- Modify: `apps/app/src/features/sites/sites-state.integration.test.tsx`

- [ ] **Step 1: Write atom tests**

Add tests to `apps/app/src/features/sites/sites-state.integration.test.tsx`:

```tsx
it("refreshes site comments into atom state", async () => {
  mockedListSiteComments.mockReturnValue(
    Effect.succeed({
      comments: [buildSiteComment({ body: "Use north gate." })],
    })
  );

  render(<SiteCommentsHarness siteId={siteId} />);
  fireEvent.click(screen.getByRole("button", { name: "Refresh comments" }));

  expect(await screen.findByText("Use north gate.")).toBeInTheDocument();
});

it("appends created site comments optimistically", async () => {
  mockedAddSiteComment.mockReturnValue(
    Effect.succeed(buildSiteComment({ body: "Bring keys." }))
  );

  render(<SiteCommentsHarness siteId={siteId} />);
  fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

  expect(await screen.findByText("Bring keys.")).toBeInTheDocument();
});
```

Use the existing mock-client setup in the file and add `listSiteComments` / `addSiteComment` to the mocked `client.sites` object.

- [ ] **Step 2: Run app tests and verify failure**

Run:

```bash
pnpm --filter app test -- src/features/sites/sites-state.integration.test.tsx
```

Expected: FAIL because atoms do not exist.

- [ ] **Step 3: Add atoms**

In `apps/app/src/features/sites/sites-state.ts`, import new types:

```ts
import type {
  AddSiteCommentInput,
  AddSiteCommentResponse,
  SiteComment,
} from "@ceird/sites-core";
```

Add:

```ts
export const siteCommentsStateAtomFamily = Atom.family((siteId: SiteIdType) => {
  void siteId;
  return Atom.make<readonly SiteComment[]>([]);
});

export const refreshSiteCommentsAtomFamily = Atom.family((siteId: SiteIdType) =>
  Atom.fn<AppApiError, readonly SiteComment[]>((_, get) =>
    listBrowserSiteComments(siteId).pipe(
      Effect.tap((response) =>
        Effect.sync(() => {
          get.set(siteCommentsStateAtomFamily(siteId), response.comments);
        })
      ),
      Effect.map((response) => response.comments)
    )
  )
);

export const addSiteCommentMutationAtomFamily = Atom.family(
  (siteId: SiteIdType) =>
    Atom.fn<AppApiError, AddSiteCommentResponse, AddSiteCommentInput>(
      (input, get) =>
        withMinimumMutationPendingDurationEffect(
          addBrowserSiteComment(siteId, input)
        ).pipe(
          Effect.tap((comment) =>
            Effect.sync(() => appendSiteComment(get, siteId, comment))
          )
        )
    )
);
```

Add helpers:

```ts
function listBrowserSiteComments(siteId: SiteIdType) {
  return runBrowserAppApiRequest("SitesBrowser.listSiteComments", (client) =>
    client.sites.listSiteComments({ path: { siteId } })
  );
}

function addBrowserSiteComment(siteId: SiteIdType, input: AddSiteCommentInput) {
  return runBrowserAppApiRequest("SitesBrowser.addSiteComment", (client) =>
    client.sites.addSiteComment({
      path: { siteId },
      payload: input,
    })
  );
}

function appendSiteComment(
  get: Atom.FnContext,
  siteId: SiteIdType,
  comment: SiteComment
) {
  const current = get(siteCommentsStateAtomFamily(siteId));

  get.set(siteCommentsStateAtomFamily(siteId), [
    ...current.filter((existing) => existing.id !== comment.id),
    comment,
  ]);
}
```

- [ ] **Step 4: Verify app atoms**

Run:

```bash
pnpm --filter app test -- src/features/sites/sites-state.integration.test.tsx
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/sites/sites-state.ts apps/app/src/features/sites/sites-state.integration.test.tsx
git commit -m "feat: wire site comment atoms"
```

---

### Task 7: Update Architecture Documentation

**Files:**

- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/packages.md`
- Modify: `docs/architecture/system-overview.md`

- [ ] **Step 1: Update API guide**

In `docs/architecture/api.md`, add `comments` to the API scope and database description. Update the Sites endpoints table with:

```markdown
| Method | Path                      | Handler name       |
| ------ | ------------------------- | ------------------ |
| `GET`  | `/sites/:siteId/comments` | `listSiteComments` |
| `POST` | `/sites/:siteId/comments` | `addSiteComment`   |
```

Add a short note:

```markdown
Site comments are internal-only in the first API version. Existing site
`accessNotes` remains a single editable field on the site record and is not
deprecated by the comments API.
```

- [ ] **Step 2: Update packages guide**

In `docs/architecture/packages.md`, add:

```markdown
## `@ceird/comments-core`

Path: `packages/comments-core`

Exports shared comment primitives used by jobs, sites, and future editable
comment targets:

- `CommentId`
- comment body validation
- shared created-comment DTO fields
- editable comment DTO fields with update metadata
- add-comment input and response schemas

Domain-specific packages extend these DTOs with their owning parent ID. SQL,
authorization, target ownership tables, and edit permissions stay in `apps/api`.
```

Update the dependency direction diagram with `jobs-core -> comments-core` and `sites-core -> comments-core`.

- [ ] **Step 3: Update system overview**

In `docs/architecture/system-overview.md`, mention that comments are shared storage used by jobs and sites, while site notes remain site attributes.

- [ ] **Step 4: Commit docs**

```bash
git add docs/architecture/api.md docs/architecture/packages.md docs/architecture/system-overview.md
git commit -m "docs: document site comments architecture"
```

---

### Task 8: Full Verification And Sandbox Migration Path

**Files:**

- No source edits expected unless checks reveal issues.

- [ ] **Step 1: Run focused checks**

Run:

```bash
pnpm --filter @ceird/comments-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/sites-core test
pnpm --filter api test -- src/domains/sites/service.test.ts src/domains/http.integration.test.ts src/domains/persistence.integration.test.ts
pnpm --filter app test -- src/features/sites/sites-state.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run broad checks**

Run:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
```

Expected: PASS.

- [ ] **Step 3: Verify sandbox migration path**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Expected: the sandbox starts on the branch-derived name and applies API migrations.

- [ ] **Step 4: Smoke test site comment endpoints**

Use the sandbox API URL from `pnpm sandbox:url` and the existing authenticated browser/app flow to create a site, then call:

```bash
curl -i "$API_URL/sites/$SITE_ID/comments"
curl -i -X POST "$API_URL/sites/$SITE_ID/comments" \
  -H "content-type: application/json" \
  --data '{"body":"Use the north gate."}'
```

Expected: unauthenticated calls return auth/access errors. Authenticated internal calls return `200` for list and `201` for create.

- [ ] **Step 5: Stop sandbox**

Run:

```bash
pnpm sandbox:down
```

Expected: sandbox stops cleanly.

- [ ] **Step 6: Final commit if verification changed files**

```bash
git add .
git commit -m "test: verify site comments api"
```

Only make this commit if verification required source, migration, or snapshot changes.

---

## Self-Review

- Spec coverage: The plan keeps site notes, adds site comments only at API and atoms layers, uses internal-only authorization, stores shared comment content once, attaches comments through target-specific ownership tables, and includes edit metadata for future account-line comments.
- Placeholder scan: No placeholder markers or undefined future work remains in the implementation steps.
- Type consistency: Shared comment types live in `@ceird/comments-core`; job comments extend with `workItemId`; site comments extend with `siteId`; HTTP endpoints use `SiteId` path decoding.
- Scope check: UI rendering is intentionally excluded except app state atoms. Existing job comment API names remain stable.
