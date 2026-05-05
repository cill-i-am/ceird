# Organization Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin/owner-only organization-wide activity feed over existing job activity.

**Architecture:** Reuse `work_item_activity` as the source of truth and add a new typed `GET /activity` endpoint on the jobs API. Gate the endpoint with job authorization, gate the frontend route with organization administration access, and add a role-aware navigation filter so members do not see Activity or related command actions.

**Tech Stack:** Effect Schema, Effect HTTP API, Effect SQL, Drizzle schema types, TanStack Start, TanStack Router, Testing Library, Vitest

---

## Scope And Assumptions

- No database migration is required.
- Activity is job activity only.
- The page route is `/activity`.
- The API route is `GET /activity`.
- Date filters use ISO dates (`YYYY-MM-DD`) and map to UTC day bounds.
- Cursor pagination follows the existing jobs list cursor pattern.
- Members are denied by the API and redirected away from the frontend route.
- Existing per-job activity remains unchanged.

## File Structure

### Shared API Contract

- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`

### API Implementation

- Modify: `apps/api/src/domains/jobs/authorization.ts`
- Modify: `apps/api/src/domains/jobs/authorization.test.ts`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Modify: `apps/api/src/domains/jobs/repositories.integration.test.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/service.test.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Modify: `apps/api/src/domains/jobs/http.integration.test.ts`

### Frontend Data And Route

- Modify: `apps/app/src/features/jobs/jobs-client.ts`
- Modify: `apps/app/src/features/jobs/jobs-server.ts`
- Modify: `apps/app/src/features/jobs/jobs-server-ssr.ts`
- Create: `apps/app/src/features/activity/activity-formatting.ts`
- Create: `apps/app/src/features/activity/organization-activity-page.tsx`
- Create: `apps/app/src/features/activity/organization-activity-page.test.tsx`
- Create: `apps/app/src/routes/_app._org.activity.tsx`
- Create: `apps/app/src/routes/-_app._org.activity.test.tsx`
- Modify: `apps/app/src/router.tsx`
- Modify: `apps/app/src/routeTree.gen.ts` through the normal router generator/typecheck flow

### Navigation And Shortcuts

- Modify: `apps/app/src/components/app-navigation.ts`
- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/components/nav-main.tsx`
- Modify: `apps/app/src/components/nav-main.test.tsx`
- Modify: `apps/app/src/components/site-header.tsx`
- Modify: `apps/app/src/features/command-bar/app-global-command-actions.tsx`
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`

## Task 1: Add Shared Organization Activity DTOs

**Files:**

- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/index.ts`

- [ ] **Step 1: Add query and response schemas**

Add these schemas near the existing activity DTOs in `packages/jobs-core/src/dto.ts`:

```ts
export const OrganizationActivityCursor = Schema.String.pipe(
  Schema.brand("@ceird/jobs-core/OrganizationActivityCursor")
);
export type OrganizationActivityCursor = Schema.Schema.Type<
  typeof OrganizationActivityCursor
>;

export const OrganizationActivityQuerySchema = Schema.Struct({
  actorUserId: Schema.optional(UserId),
  cursor: Schema.optional(OrganizationActivityCursor),
  eventType: Schema.optional(JobActivityEventTypeSchema),
  fromDate: Schema.optional(IsoDateString),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.int(),
      Schema.positive(),
      Schema.lessThanOrEqualTo(100)
    )
  ),
  toDate: Schema.optional(IsoDateString),
});
export type OrganizationActivityQuery = Schema.Schema.Type<
  typeof OrganizationActivityQuerySchema
>;

export const OrganizationActivityActorSchema = Schema.Struct({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
});
export type OrganizationActivityActor = Schema.Schema.Type<
  typeof OrganizationActivityActorSchema
>;

export const OrganizationActivityItemSchema = Schema.Struct({
  id: ActivityId,
  workItemId: WorkItemId,
  jobTitle: JobTitleSchema,
  actor: Schema.optional(OrganizationActivityActorSchema),
  eventType: JobActivityEventTypeSchema,
  payload: JobActivityPayloadSchema,
  createdAt: IsoDateTimeString,
});
export type OrganizationActivityItem = Schema.Schema.Type<
  typeof OrganizationActivityItemSchema
>;

export const OrganizationActivityListResponseSchema = Schema.Struct({
  items: Schema.Array(OrganizationActivityItemSchema),
  nextCursor: Schema.optional(OrganizationActivityCursor),
});
export type OrganizationActivityListResponse = Schema.Schema.Type<
  typeof OrganizationActivityListResponseSchema
>;
```

- [ ] **Step 2: Export the new contract**

Update `packages/jobs-core/src/index.ts` to export:

```ts
OrganizationActivityActorSchema,
OrganizationActivityCursor,
OrganizationActivityItemSchema,
OrganizationActivityListResponseSchema,
OrganizationActivityQuerySchema,
```

and these types:

```ts
OrganizationActivityActor,
OrganizationActivityCursor as OrganizationActivityCursorType,
OrganizationActivityItem,
OrganizationActivityListResponse,
OrganizationActivityQuery,
```

- [ ] **Step 3: Run package typecheck**

Run:

```bash
pnpm --filter @ceird/jobs-core check-types
```

Expected: PASS.

## Task 2: Add The HTTP Endpoint Contract

**Files:**

- Modify: `packages/jobs-core/src/http-api.ts`

- [ ] **Step 1: Import the new schemas**

Add `OrganizationActivityListResponseSchema` and
`OrganizationActivityQuerySchema` to the DTO imports.

- [ ] **Step 2: Add the activity endpoint to the jobs group**

Add this endpoint before `getJobDetail` so `/activity` does not conceptually sit
behind job-id routes:

```ts
.add(
  HttpApiEndpoint.get("listOrganizationActivity", "/activity")
    .setUrlParams(OrganizationActivityQuerySchema)
    .addSuccess(OrganizationActivityListResponseSchema)
    .addError(JobAccessDeniedError)
    .addError(JobListCursorInvalidError)
    .addError(JobStorageError)
)
```

- [ ] **Step 3: Run package typecheck**

Run:

```bash
pnpm --filter @ceird/jobs-core check-types
```

Expected: PASS.

## Task 3: Add Backend Authorization

**Files:**

- Modify: `apps/api/src/domains/jobs/authorization.ts`
- Modify: `apps/api/src/domains/jobs/authorization.test.ts`

- [ ] **Step 1: Add failing authorization expectations**

Extend `apps/api/src/domains/jobs/authorization.test.ts`:

```ts
await expect(
  runAuthorization(
    Effect.gen(function* () {
      const authorization = yield* JobsAuthorization;
      yield* authorization.ensureCanViewOrganizationActivity(owner);
    })
  )
).resolves.toBeUndefined();

await expect(
  runAuthorization(
    Effect.gen(function* () {
      const authorization = yield* JobsAuthorization;
      yield* authorization.ensureCanViewOrganizationActivity(member);
    })
  )
).rejects.toMatchObject({
  message: "Only organization owners and admins can view organization activity",
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/authorization.test.ts
```

Expected: FAIL because `ensureCanViewOrganizationActivity` is missing.

- [ ] **Step 3: Implement the authorization method**

Add to `JobsAuthorization`:

```ts
const ensureCanViewOrganizationActivity = Effect.fn(
  "JobsAuthorization.ensureCanViewOrganizationActivity"
)((actor: JobsActor) =>
  hasElevatedAccess(actor)
    ? Effect.void
    : Effect.fail(
        makeAccessDenied(
          "Only organization owners and admins can view organization activity"
        )
      )
);
```

Return it from the service object.

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/authorization.test.ts
```

Expected: PASS.

## Task 4: Add Repository Organization Activity Listing

**Files:**

- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Modify: `apps/api/src/domains/jobs/repositories.integration.test.ts`

- [ ] **Step 1: Add the repository integration test**

Add a test that:

- seeds one organization with two jobs and three activity rows
- seeds a second organization with one activity row
- asserts only the active organization rows are returned
- asserts actor, event type, date range, and job title filtering

Use fixed timestamps:

```ts
new Date("2026-04-20T10:00:00.000Z");
new Date("2026-04-21T10:00:00.000Z");
new Date("2026-04-22T10:00:00.000Z");
```

Expected result shape:

```ts
expect(all.items.map((item) => item.jobTitle)).toStrictEqual([
  "Newest activity job",
  "Middle activity job",
  "Oldest activity job",
]);
expect(byActor.items).toHaveLength(2);
expect(byEvent.items.every((item) => item.eventType === "status_changed")).toBe(
  true
);
expect(byDate.items.map((item) => item.createdAt)).toStrictEqual([
  "2026-04-21T10:00:00.000Z",
]);
```

- [ ] **Step 2: Run the focused repository test and verify it fails**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/repositories.integration.test.ts -t "organization activity"
```

Expected: FAIL because the repository method does not exist.

- [ ] **Step 3: Add repository types and decoders**

In `repositories.ts`, import:

```ts
OrganizationActivityItemSchema,
OrganizationActivityListResponseSchema,
OrganizationActivityCursor as OrganizationActivityCursorSchema,
```

and types:

```ts
OrganizationActivityItem,
OrganizationActivityListResponse,
OrganizationActivityQuery,
OrganizationActivityCursorType as OrganizationActivityCursor,
JobActivityEventType,
```

Add row and cursor interfaces:

```ts
interface OrganizationActivityRow extends WorkItemActivityRow {
  readonly actor_email: string | null;
  readonly actor_name: string | null;
  readonly job_title: string;
}

interface OrganizationActivityCursorState {
  readonly id: string;
  readonly createdAt: string;
}
```

- [ ] **Step 4: Implement cursor helpers**

Add helpers parallel to the job list cursor helpers:

```ts
function encodeOrganizationActivityCursor(
  row: Pick<OrganizationActivityRow, "id" | "created_at">
): OrganizationActivityCursor {
  return decodeOrganizationActivityCursor(
    Buffer.from(
      JSON.stringify({
        id: row.id,
        createdAt: row.created_at.toISOString(),
      })
    ).toString("base64url")
  );
}

function decodeOrganizationActivityCursorValue(
  cursor: OrganizationActivityCursor
): OrganizationActivityCursorState {
  return decodeOrganizationActivityCursorState(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
  );
}
```

- [ ] **Step 5: Implement `listOrganizationActivity`**

Add the repository method:

```ts
const listOrganizationActivity = Effect.fn(
  "JobsRepository.listOrganizationActivity"
)(function* (organizationId: OrganizationId, query: OrganizationActivityQuery) {
  const limit = clampJobListLimit(query.limit ?? boundedDefaultListLimit);
  const clauses = [
    sql`work_item_activity.organization_id = ${organizationId}`,
    sql`work_items.organization_id = ${organizationId}`,
  ];

  if (query.actorUserId !== undefined) {
    clauses.push(sql`work_item_activity.actor_user_id = ${query.actorUserId}`);
  }

  if (query.eventType !== undefined) {
    clauses.push(sql`work_item_activity.event_type = ${query.eventType}`);
  }

  if (query.fromDate !== undefined) {
    clauses.push(sql`work_item_activity.created_at >= ${query.fromDate}`);
  }

  if (query.toDate !== undefined) {
    clauses.push(
      sql`work_item_activity.created_at < ${getExclusiveDateUpperBound(
        query.toDate
      )}`
    );
  }

  if (query.cursor !== undefined) {
    const cursor = yield* Effect.try({
      try: () => decodeOrganizationActivityCursorValue(query.cursor),
      catch: () =>
        new JobListCursorInvalidError({
          cursor: query.cursor,
          message: "Organization activity cursor is invalid",
        }),
    });

    clauses.push(sql`(
      work_item_activity.created_at < ${cursor.createdAt}
      or (
        work_item_activity.created_at = ${cursor.createdAt}
        and work_item_activity.id < ${cursor.id}
      )
    )`);
  }

  const rows = yield* sql<OrganizationActivityRow>`
    select
      work_item_activity.*,
      work_items.title as job_title,
      "user".name as actor_name,
      "user".email as actor_email
    from work_item_activity
    join work_items on work_items.id = work_item_activity.work_item_id
    left join "user" on "user".id = work_item_activity.actor_user_id
    where ${sql.and(clauses)}
    order by work_item_activity.created_at desc, work_item_activity.id desc
    limit ${limit + 1}
  `;

  const items = rows.slice(0, limit).map(mapOrganizationActivityRow);
  const nextCursorRow = rows.length > limit ? rows[limit - 1] : undefined;

  return decodeOrganizationActivityListResponse({
    items,
    nextCursor:
      nextCursorRow === undefined
        ? undefined
        : encodeOrganizationActivityCursor(nextCursorRow),
  });
});
```

Return it from the repository service.

- [ ] **Step 6: Add row mapping**

Add:

```ts
function mapOrganizationActivityRow(
  row: OrganizationActivityRow
): OrganizationActivityItem {
  return decodeOrganizationActivityItem({
    actor:
      row.actor_user_id === null
        ? undefined
        : {
            email: row.actor_email ?? "",
            id: row.actor_user_id,
            name: row.actor_name ?? row.actor_email ?? "Team member",
          },
    createdAt: row.created_at.toISOString(),
    eventType: row.event_type,
    id: row.id,
    jobTitle: row.job_title,
    payload: decodeJobActivityPayload(row.payload),
    workItemId: row.work_item_id,
  });
}
```

- [ ] **Step 7: Run the focused repository test**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/repositories.integration.test.ts -t "organization activity"
```

Expected: PASS.

## Task 5: Add Service And HTTP Handler

**Files:**

- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/service.test.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Modify: `apps/api/src/domains/jobs/http.integration.test.ts`

- [ ] **Step 1: Add service harness support**

Extend the test harness repository in `service.test.ts` with:

```ts
listOrganizationActivity: (_organizationId, _query) =>
  Effect.succeed({
    items: [],
    nextCursor: undefined,
  }),
```

and add a call counter for `listOrganizationActivity`.

- [ ] **Step 2: Add service tests**

Add tests that assert:

```ts
await expect(
  runJobsService(
    Effect.gen(function* () {
      const jobs = yield* JobsService;
      return yield* jobs.listOrganizationActivity({});
    }),
    makeHarness({ actor: makeActor("owner") })
  )
).resolves.toStrictEqual({
  items: [],
  nextCursor: undefined,
});
```

and:

```ts
const exit = await runJobsServiceExit(
  Effect.gen(function* () {
    const jobs = yield* JobsService;
    return yield* jobs.listOrganizationActivity({});
  }),
  makeHarness({ actor: makeActor("member") })
);

expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
```

- [ ] **Step 3: Implement `JobsService.listOrganizationActivity`**

Add:

```ts
const listOrganizationActivity = Effect.fn(
  "JobsService.listOrganizationActivity"
)(function* (query: OrganizationActivityQuery) {
  const actor = yield* loadActor();
  yield* authorization.ensureCanViewOrganizationActivity(actor);

  return yield* jobsRepository
    .listOrganizationActivity(actor.organizationId, query)
    .pipe(Effect.catchTag("SqlError", failJobsStorageError));
});
```

Return it from `JobsService`.

- [ ] **Step 4: Wire the HTTP handler**

In `http.ts`, add:

```ts
.handle("listOrganizationActivity", ({ urlParams }) =>
  jobsService.listOrganizationActivity(urlParams)
)
```

- [ ] **Step 5: Add HTTP integration coverage**

In `http.integration.test.ts`, after creating and mutating a job, request:

```ts
const ownerActivityResponse = await api.handler(
  makeRequest("/activity", { cookieJar: ownerCookieJar })
);
expect(ownerActivityResponse.status).toBe(200);

const memberActivityResponse = await api.handler(
  makeRequest("/activity", { cookieJar: memberCookieJar })
);
expect(memberActivityResponse.status).toBe(403);
```

Also assert filtered requests:

```ts
makeRequest(`/activity?actorUserId=${memberUserId}`, {
  cookieJar: ownerCookieJar,
});
makeRequest(
  "/activity?eventType=visit_logged&fromDate=2026-04-22&toDate=2026-04-22",
  {
    cookieJar: ownerCookieJar,
  }
);
```

- [ ] **Step 6: Run API tests**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/authorization.test.ts src/domains/jobs/service.test.ts src/domains/jobs/http.integration.test.ts
```

Expected: PASS.

## Task 6: Add Frontend Activity Client Helpers

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-client.ts`
- Modify: `apps/app/src/features/jobs/jobs-server.ts`
- Modify: `apps/app/src/features/jobs/jobs-server-ssr.ts`

- [ ] **Step 1: Extend server helper types**

Import `OrganizationActivityQuery` and
`OrganizationActivityListResponse` from `@ceird/jobs-core`.

- [ ] **Step 2: Add browser/server helper functions**

Add `listCurrentServerOrganizationActivity(query)` following the same
isomorphic pattern as `listCurrentServerJobs`.

Server direct implementation:

```ts
export async function listCurrentServerOrganizationActivityDirect(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(
    request,
    "JobsServer.listOrganizationActivity",
    (client) =>
      client.jobs.listOrganizationActivity({
        urlParams: query,
      })
  );
}
```

Browser implementation:

```ts
async function listCurrentBrowserOrganizationActivity(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  return await runBrowserJobsClient((client) =>
    client.jobs.listOrganizationActivity({ urlParams: query })
  );
}
```

- [ ] **Step 3: Run app typecheck**

Run:

```bash
pnpm --filter app check-types
```

Expected: PASS after the API contract is visible to the app.

## Task 7: Extract Activity Formatting

**Files:**

- Create: `apps/app/src/features/activity/activity-formatting.ts`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`

- [ ] **Step 1: Move summary labels into a shared module**

Create `activity-formatting.ts`:

```ts
import type { JobActivityPayload } from "@ceird/jobs-core";

export function describeJobActivity(
  actorName: string | undefined,
  payload: JobActivityPayload
) {
  const actorPrefix = actorName ? `${actorName} ` : "";

  switch (payload.eventType) {
    case "assignee_changed":
      return `${actorPrefix}updated the assignee.`;
    case "blocked_reason_changed":
      return `${actorPrefix}updated the blocked reason.`;
    case "contact_changed":
      return `${actorPrefix}updated the contact.`;
    case "coordinator_changed":
      return `${actorPrefix}updated the coordinator.`;
    case "job_created":
      return `${actorPrefix}created the job.`;
    case "job_reopened":
      return `${actorPrefix}reopened the job.`;
    case "priority_changed":
      return `${actorPrefix}changed priority from ${priorityLabel(
        payload.fromPriority
      )} to ${priorityLabel(payload.toPriority)}.`;
    case "site_changed":
      return `${actorPrefix}updated the site.`;
    case "status_changed":
      return `${actorPrefix}changed status from ${statusLabel(
        payload.fromStatus
      )} to ${statusLabel(payload.toStatus)}.`;
    case "visit_logged":
      return `${actorPrefix}logged a visit.`;
    default:
      return assertNever(payload);
  }
}
```

Move existing status/priority label reuse into this module if those constants
are not already shared.

- [ ] **Step 2: Update job detail sheet**

Replace local `describeActivity` calls with `describeJobActivity`.

- [ ] **Step 3: Run job detail tests**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-detail-sheet.test.tsx
```

Expected: PASS.

## Task 8: Build The Activity Page And Route

**Files:**

- Create: `apps/app/src/features/activity/organization-activity-page.tsx`
- Create: `apps/app/src/features/activity/organization-activity-page.test.tsx`
- Create: `apps/app/src/routes/_app._org.activity.tsx`
- Create: `apps/app/src/routes/-_app._org.activity.test.tsx`
- Modify: `apps/app/src/router.tsx`
- Modify: `apps/app/src/routeTree.gen.ts`

- [ ] **Step 1: Add route loader tests**

Add route tests that mock:

- `getCurrentOrganizationMemberRole`
- `listCurrentServerOrganizationActivity`
- `getCurrentServerJobOptions`

Assert admin access:

```ts
await expect(loadActivityRouteData(context)).resolves.toStrictEqual({
  activity,
  options,
});
```

Assert member redirect:

```ts
await expect(loadActivityRouteData(memberContext)).rejects.toMatchObject({
  options: { to: "/" },
});
```

- [ ] **Step 2: Implement the route**

Create `_app._org.activity.tsx` with:

```ts
export const Route = createFileRoute("/_app/_org/activity")({
  staticData: {
    breadcrumb: {
      label: "Activity",
      to: "/activity",
    },
  },
  validateSearch: decodeActivitySearch,
  loader: ({ context, location }) =>
    loadActivityRouteData(context, location.search),
  component: ActivityRoute,
});
```

`loadActivityRouteData` should:

- return empty data while active org sync is pending
- fetch current member role
- call `assertOrganizationAdministrationRole`
- fetch activity and job options in parallel

- [ ] **Step 3: Add the page component test**

Render a sample activity row and assert:

```ts
expect(screen.getByText(/Taylor Owner created the job/i)).toBeInTheDocument();
expect(screen.getByRole("link", { name: /Inspect boiler/i })).toHaveAttribute(
  "href",
  "/jobs/11111111-1111-4111-8111-111111111111"
);
```

Also assert the actor and event filters render.

- [ ] **Step 4: Implement the page**

The page should accept:

```ts
interface OrganizationActivityPageProps {
  readonly activity: OrganizationActivityListResponse;
  readonly options: JobOptionsResponse;
  readonly search: ActivitySearch;
  readonly onSearchChange: (search: ActivitySearch) => void;
}
```

Render:

- `AppPageHeader` title `Activity`
- actor select from `options.members`
- event type select from `JOB_ACTIVITY_EVENT_TYPES`
- `fromDate` and `toDate` date inputs
- list of activity rows
- empty state when `activity.items.length === 0`

- [ ] **Step 5: Generate or refresh the route tree**

Run the normal app typecheck/build flow that updates generated TanStack Router
types if needed:

```bash
pnpm --filter app check-types
```

If `apps/app/src/routeTree.gen.ts` changes, include it.

## Task 9: Add Role-Aware Navigation And Hotkeys

**Files:**

- Modify: `apps/app/src/components/app-navigation.ts`
- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/components/nav-main.tsx`
- Modify: `apps/app/src/components/nav-main.test.tsx`
- Modify: `apps/app/src/components/site-header.tsx`
- Modify: `apps/app/src/features/command-bar/app-global-command-actions.tsx`
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`

- [ ] **Step 1: Add navigation filtering helper**

In `app-navigation.ts`, add:

```ts
export type AppNavigationAccess = "all" | "administrators";

export function getPrimaryNavItemsForRole(role?: OrganizationRole) {
  return APP_PRIMARY_NAV_ITEMS.filter(
    (item) =>
      item.access !== "administrators" || role === "owner" || role === "admin"
  );
}
```

Add Activity:

```ts
{
  access: "administrators",
  icon: TaskDaily01Icon,
  id: "activity",
  keywords: ["audit", "history", "changes"],
  title: "Activity",
  url: "/activity",
}
```

Mark Members as `administrators`.

- [ ] **Step 2: Add hotkey**

In `hotkey-registry.ts`, add:

```ts
goActivity: {
  group: "Navigation",
  hotkey: "G A",
  id: "goActivity",
  label: "Go to Activity",
  scope: "global",
},
```

In `nav-main.tsx`, add:

```ts
"/activity": HOTKEYS.goActivity,
```

- [ ] **Step 3: Pass role into sidebar and command actions**

Load current role in `_app._org` context and pass it to:

- `AppOrganizationCommandActions`
- `AppSidebar` through the app layout route context or a route-match lookup

The sidebar should call `getPrimaryNavItemsForRole(currentRole)` before
rendering.

- [ ] **Step 4: Update command actions**

In `AppOrganizationCommandActions`, register navigation actions from
`getPrimaryNavItemsForRole(currentRole)` instead of raw `APP_PRIMARY_NAV_ITEMS`.

- [ ] **Step 5: Update active shortcut scopes**

In `site-header.tsx`, add:

```ts
if (pathname === "/activity") {
  return ["global"];
}
```

No page-specific shortcut scope is needed for v1 because the page uses normal
form controls.

- [ ] **Step 6: Add nav tests**

Update `nav-main.test.tsx` or add `app-navigation.test.ts` to assert:

```ts
expect(
  getPrimaryNavItemsForRole("member").map((item) => item.url)
).not.toContain("/activity");
expect(getPrimaryNavItemsForRole("owner").map((item) => item.url)).toContain(
  "/activity"
);
```

Also assert Members remains hidden for members.

## Task 10: Final Verification

**Files:**

- All shared API, backend, frontend route, activity feature, navigation, and
  hotkey files listed in this plan

- [ ] **Step 1: Run focused API tests**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/authorization.test.ts src/domains/jobs/service.test.ts src/domains/jobs/repositories.integration.test.ts src/domains/jobs/http.integration.test.ts
```

Expected: PASS. Integration tests may skip if the local Postgres test database
is unavailable.

- [ ] **Step 2: Run focused app tests**

Run:

```bash
pnpm --filter app test -- src/routes/-_app._org.activity.test.tsx src/features/activity/organization-activity-page.test.tsx src/components/nav-main.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run:

```bash
pnpm --filter @ceird/jobs-core check-types
pnpm --filter api check-types
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 4: Run formatter/lint if time allows**

Run:

```bash
pnpm lint
pnpm format
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/jobs-core/src/dto.ts packages/jobs-core/src/http-api.ts packages/jobs-core/src/index.ts apps/api/src/domains/jobs apps/app/src/features/activity apps/app/src/features/jobs apps/app/src/routes apps/app/src/components apps/app/src/hotkeys
git commit -m "feat: add organization activity feed"
```

## Self-Review Checklist

- [ ] The API always filters by active organization.
- [ ] Members are denied by the API.
- [ ] Members are redirected away from `/activity`.
- [ ] Members do not see Activity navigation or command actions.
- [ ] Date range uses inclusive user-facing dates and an exclusive upper bound.
- [ ] Activity summaries are shared with job detail.
- [ ] Per-job activity rendering remains intact.
- [ ] Activity rows link back to existing job detail routes.
