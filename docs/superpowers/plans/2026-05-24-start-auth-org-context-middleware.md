# Start Auth/Org Context Middleware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Ceird auth and organization shell reads to TanStack Start request/function middleware and route context, while preserving direct domain API calls for product data and future ElectricSQL/TanStack DB work.

**Architecture:** Keep two lanes: the app/auth lane uses TanStack Start request middleware, server-function middleware, and a single app-context snapshot; the domain data lane continues to call the typed domain API directly. Browser-side route guards consume parent route context or the app-context snapshot cache instead of calling Better Auth endpoints directly.

**Tech Stack:** TanStack Start `createMiddleware`/`createServerFn`, TanStack Router parent route context, Better Auth, Effect Schema validation, Vitest, TypeScript, existing Ceird app/API architecture.

---

## File Structure

- Create `apps/app/src/features/auth/app-context-types.ts`
  - Owns the shared app/auth context DTO types and Effect schemas used at app boundaries.
  - Exports `AppAuthContextSnapshot`, `AuthenticatedAppContextSnapshot`, and decode helpers.

- Create `apps/app/src/features/auth/auth-request-context.server.ts`
  - Server-only request helpers for reading cookies, auth base URL, forwarded headers, session, organizations, and active role.
  - Replaces duplicated request parsing currently split between `server-session-impl.server.ts` and `organization-server-impl.server.ts`.

- Create `apps/app/src/features/auth/app-context-middleware.ts`
  - Owns TanStack Start request middleware and server-function middleware factories.
  - Exports `requestAppContextMiddleware`, `optionalAuthFunctionMiddleware`, `requiredAuthFunctionMiddleware`, `organizationFunctionMiddleware`, and `organizationAdminFunctionMiddleware`.
  - Server-only work happens inside `.server(...)` callbacks via dynamic imports from `.server.ts`.

- Create `apps/app/src/features/auth/app-context-functions.ts`
  - Owns `getCurrentAppContext` as an app-owned `createServerFn({ method: "GET" })`.
  - This is the one browser-callable app/auth snapshot read.

- Create `apps/app/src/features/auth/app-context-client-cache.ts`
  - Replaces session-only browser cache with short-lived app-context snapshot cache.
  - Caches authenticated non-null snapshots for 10 seconds, dedupes in-flight calls, skips unauthenticated snapshots, and exposes explicit invalidation.

- Modify `apps/app/src/start.ts`
  - Replace inline middleware with `requestAppContextMiddleware`.

- Modify `apps/app/src/features/auth/app-server-context.ts`
  - Reuse types from `app-context-types.ts`.
  - Keep `readGlobalAppServerContext()` as the bridge from Start request context.

- Modify `apps/app/src/features/auth/require-authenticated-session.ts`
  - Use global server context on server and cached app-context snapshot on the client.

- Modify `apps/app/src/features/auth/redirect-if-authenticated.ts`
  - Use the same app-context snapshot path for public auth redirects.

- Modify `apps/app/src/routes/_app.tsx`
  - Treat `_app` as the authenticated session parent boundary.
  - Use request context on SSR and cached app-context snapshot on client navigation fallback.

- Modify `apps/app/src/routes/_app._org.tsx`
  - Treat `_org` as the organization context parent boundary.
  - Consume `_app` session plus app-context organizations/role instead of performing fresh Better Auth client reads.

- Modify `apps/app/src/features/organizations/organization-access.ts`
  - Remove direct browser `authClient.getSession`, `organization.list`, and `getActiveMemberRole` reads from route guard paths.
  - Keep pure organization access derivation helpers such as `ensureActiveOrganizationIdForSession`.

- Modify `apps/app/src/features/organizations/organization-server.ts`
  - Apply server-function middleware to app/auth lane operations only.
  - Keep create organization and set active organization in the Start lane because they compose Better Auth cookie behavior.

- Modify invalidation call sites:
  - `apps/app/src/features/auth/login-page.tsx`
  - `apps/app/src/features/auth/signup-page.tsx`
  - `apps/app/src/features/auth/sign-out.ts`
  - `apps/app/src/features/organizations/organization-onboarding-page.tsx`
  - `apps/app/src/features/organizations/accept-invitation-page.tsx`
  - `apps/app/src/features/organizations/organization-switcher.tsx`
  - These should call `clearAppContextClientCache()` after auth/org identity changes.

- Modify docs:
  - `docs/architecture/frontend.md`
  - Document the two-lane architecture: Start app/auth lane and direct domain API lane.

---

## Guardrails

- Keep direct domain API calls for jobs, sites, activity, comments, labels, and future ElectricSQL/TanStack DB sync. Do not proxy product data through app server functions just to use middleware.
- Keep Effect Schema at runtime boundaries.
- Do not trust client-sent identity/org context. Any `sendContext` data must be validated server-side before use.
- Avoid importing Better Auth client methods into route guard files except auth entry pages that actually sign in/sign up.
- Preserve current public auth chunk work: do not import organization-heavy modules into `/login` or `/signup`.
- Use TanStack Start method order exactly: `.middleware()` then `.inputValidator()` then `.client()` then `.server()`/`.handler()` depending on API.

---

### Task 1: Define Shared App Context DTOs

**Files:**

- Create: `apps/app/src/features/auth/app-context-types.ts`
- Modify: `apps/app/src/features/auth/app-server-context.ts`
- Test: `apps/app/src/features/auth/app-context-types.test.ts`

- [ ] **Step 1: Write DTO decode tests**

Create `apps/app/src/features/auth/app-context-types.test.ts`:

```ts
import {
  decodeAppAuthContextSnapshot,
  decodeAuthenticatedAppContextSnapshot,
} from "./app-context-types";

describe("app auth context types", () => {
  it("decodes an unauthenticated app context snapshot", () => {
    expect(
      decodeAppAuthContextSnapshot({
        session: null,
        activeOrganizationId: null,
        currentOrganizationRole: undefined,
        organizations: undefined,
      })
    ).toStrictEqual({
      session: null,
      activeOrganizationId: null,
      currentOrganizationRole: undefined,
      organizations: undefined,
    });
  });

  it("decodes an authenticated app context snapshot", () => {
    const snapshot = {
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-05-31T10:00:00.000Z",
          token: "session-token",
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
          image: null,
          emailVerified: false,
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
        },
      },
      activeOrganizationId: "org_123",
      currentOrganizationRole: "owner",
      organizations: [{ id: "org_123", name: "Acme", slug: "acme" }],
    };

    expect(decodeAuthenticatedAppContextSnapshot(snapshot)).toStrictEqual(
      snapshot
    );
  });

  it("rejects malformed authenticated snapshots", () => {
    expect(() =>
      decodeAuthenticatedAppContextSnapshot({
        session: null,
        activeOrganizationId: null,
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter app test app-context-types.test.ts
```

Expected: fail because `app-context-types.ts` does not exist.

- [ ] **Step 3: Add shared DTO types and Effect schemas**

Create `apps/app/src/features/auth/app-context-types.ts`:

```ts
import {
  OrganizationId,
  OrganizationRole,
  decodeOrganizationId,
  decodeOrganizationRole,
  decodeOrganizationSummaryList,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationRole as OrganizationRoleType,
  OrganizationSummary,
} from "@ceird/identity-core";
import { Schema } from "effect";

import type { ServerAuthSession } from "./server-session-types";

const NullableString = Schema.NullOr(Schema.String);
const NullableOrganizationId = Schema.NullOr(OrganizationId);

export const ServerAuthSessionSchema = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
    userId: Schema.String,
    expiresAt: Schema.String,
    token: Schema.String,
    ipAddress: Schema.optional(NullableString),
    userAgent: Schema.optional(NullableString),
    activeOrganizationId: Schema.optional(NullableOrganizationId),
  }),
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(NullableString),
    emailVerified: Schema.Boolean,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});

export interface AppAuthContextSnapshot {
  readonly session: ServerAuthSession | null;
  readonly activeOrganizationId: OrganizationIdType | null;
  readonly currentOrganizationRole?: OrganizationRoleType | undefined;
  readonly organizations?: readonly OrganizationSummary[] | undefined;
}

export interface AuthenticatedAppContextSnapshot extends AppAuthContextSnapshot {
  readonly session: ServerAuthSession;
}

export function decodeServerAuthSession(input: unknown): ServerAuthSession {
  return Schema.decodeUnknownSync(ServerAuthSessionSchema)(input);
}

export function decodeAppAuthContextSnapshot(
  input: unknown
): AppAuthContextSnapshot {
  if (typeof input !== "object" || input === null) {
    throw new Error("App auth context snapshot must be an object.");
  }

  const record = input as Record<string, unknown>;
  const session =
    record.session === null || record.session === undefined
      ? null
      : decodeServerAuthSession(record.session);
  const activeOrganizationId =
    typeof record.activeOrganizationId === "string"
      ? decodeOrganizationId(record.activeOrganizationId)
      : null;
  const currentOrganizationRole =
    typeof record.currentOrganizationRole === "string"
      ? decodeOrganizationRole(record.currentOrganizationRole)
      : undefined;
  const organizations =
    record.organizations === undefined
      ? undefined
      : decodeOrganizationSummaryList(record.organizations);

  return {
    activeOrganizationId,
    currentOrganizationRole,
    organizations,
    session,
  };
}

export function decodeAuthenticatedAppContextSnapshot(
  input: unknown
): AuthenticatedAppContextSnapshot {
  const snapshot = decodeAppAuthContextSnapshot(input);

  if (!snapshot.session) {
    throw new Error("Expected an authenticated app context snapshot.");
  }

  return {
    ...snapshot,
    session: snapshot.session,
  };
}
```

- [ ] **Step 4: Update `app-server-context.ts` to reuse the new snapshot type**

Modify `apps/app/src/features/auth/app-server-context.ts`:

```ts
import { getGlobalStartContext } from "@tanstack/react-start";

import type { AppAuthContextSnapshot } from "./app-context-types";

export type AppServerContext = Partial<AppAuthContextSnapshot>;

export function readAppServerContext(input: unknown): AppServerContext {
  return isAppServerContext(input) ? input : {};
}

export function readGlobalAppServerContext(): AppServerContext {
  try {
    return readAppServerContext(getGlobalStartContext());
  } catch {
    return {};
  }
}

function isAppServerContext(input: unknown): input is AppServerContext {
  return typeof input === "object" && input !== null;
}
```

- [ ] **Step 5: Run the DTO tests**

Run:

```bash
pnpm --filter app test app-context-types.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/auth/app-context-types.ts apps/app/src/features/auth/app-context-types.test.ts apps/app/src/features/auth/app-server-context.ts
git commit -m "feat: define app auth context snapshot"
```

---

### Task 2: Extract Server Request Auth/Org Readers

**Files:**

- Create: `apps/app/src/features/auth/auth-request-context.server.ts`
- Modify: `apps/app/src/features/auth/server-session-impl.server.ts`
- Modify: `apps/app/src/features/organizations/organization-server-impl.server.ts`
- Test: `apps/app/src/features/auth/server-session.test.ts`
- Test: `apps/app/src/features/organizations/organization-server.test.ts`

- [ ] **Step 1: Add server helper tests through existing public surfaces**

Extend `apps/app/src/features/auth/server-session.test.ts` with a regression that proves cached context still wins:

```ts
it("reuses request context before fetching Better Auth", async () => {
  mockedReadGlobalAppServerContext.mockReturnValue({
    session: {
      session: {
        id: "session_cached",
        createdAt: "2026-05-24T10:00:00.000Z",
        updatedAt: "2026-05-24T10:00:00.000Z",
        userId: "user_123",
        expiresAt: "2026-05-31T10:00:00.000Z",
        token: "session-token",
      },
      user: {
        id: "user_123",
        name: "Taylor Example",
        email: "taylor@example.com",
        image: null,
        emailVerified: false,
        createdAt: "2026-05-24T10:00:00.000Z",
        updatedAt: "2026-05-24T10:00:00.000Z",
      },
    },
  });

  await expect(getCurrentServerSession()).resolves.toMatchObject({
    session: { id: "session_cached" },
  });
  expect(mockedFetch).not.toHaveBeenCalled();
});
```

If the current test file uses different mock names, adapt only the identifiers to the existing hoisted mocks. The behavior must be exactly: global context session returns without fetching.

- [ ] **Step 2: Run the focused tests before refactor**

Run:

```bash
pnpm --filter app test server-session.test.ts organization-server.test.ts
```

Expected: pass before extraction. This protects the behavior while moving code.

- [ ] **Step 3: Create server request helpers**

Create `apps/app/src/features/auth/auth-request-context.server.ts`:

```ts
import type {
  OrganizationId as OrganizationIdType,
  OrganizationMemberRoleResponse,
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import {
  decodeOrganizationId,
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummaryList,
} from "@ceird/identity-core";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

import {
  decodeServerAuthSession,
  type AppAuthContextSnapshot,
} from "./app-context-types";
import type { ServerAuthSession } from "./server-session-types";

export interface ServerAuthRequest {
  readonly authBaseURL: string;
  readonly cookie: string;
  readonly forwardedHeaders: ReturnType<typeof readServerApiForwardedHeaders>;
}

export type RequestHeaderReader = (name: string) => string | undefined;

export function getHeaderFromRequest(request: Request): RequestHeaderReader {
  return (name) => request.headers.get(name) ?? undefined;
}

export function readOptionalServerAuthRequest(
  getRequestHeader: RequestHeaderReader
): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  return readServerAuthRequestFromCookie(getRequestHeader, cookie);
}

export function readRequiredServerAuthRequest(
  getRequestHeader: RequestHeaderReader
): ServerAuthRequest {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    throw new Error(
      "Cannot read auth context without the current auth cookie."
    );
  }

  return readServerAuthRequestFromCookie(getRequestHeader, cookie);
}

export async function readOptionalServerAuthSessionForRequest(
  request: Request
): Promise<ServerAuthSession | null> {
  return await readOptionalServerAuthSessionFromHeaders(
    getHeaderFromRequest(request)
  );
}

export async function readOptionalServerAuthSessionFromHeaders(
  getRequestHeader: RequestHeaderReader
): Promise<ServerAuthSession | null> {
  const authRequest = readOptionalServerAuthRequest(getRequestHeader);

  if (!authRequest) {
    return null;
  }

  const response = await fetch(
    new URL("get-session", `${authRequest.authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  return payload === null ? null : decodeServerAuthSession(payload);
}

export async function readServerOrganizations(
  authRequest: ServerAuthRequest
): Promise<readonly OrganizationSummary[]> {
  const response = await fetch(
    new URL("organization/list", `${authRequest.authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Organization lookup failed with status ${response.status}.`
    );
  }

  return decodeOrganizationSummaryList((await response.json()) as unknown);
}

export async function readServerOrganizationMemberRole(
  authRequest: ServerAuthRequest,
  organizationId: OrganizationIdType
): Promise<OrganizationMemberRoleResponse> {
  const response = await fetch(
    new URL(
      "organization/get-active-member-role",
      `${authRequest.authBaseURL}/`
    ),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
      method: "GET",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Organization member role lookup failed with status ${response.status}.`
    );
  }

  return decodeOrganizationMemberRoleResponse(
    (await response.json()) as unknown
  );
}

export async function buildAppAuthContextSnapshotForRequest(
  request: Request
): Promise<AppAuthContextSnapshot> {
  const getRequestHeader = getHeaderFromRequest(request);
  const authRequest = readOptionalServerAuthRequest(getRequestHeader);
  const session =
    await readOptionalServerAuthSessionFromHeaders(getRequestHeader);

  if (!session || !authRequest) {
    return {
      activeOrganizationId: null,
      session,
    };
  }

  const activeOrganizationId = session.session.activeOrganizationId
    ? decodeOrganizationId(session.session.activeOrganizationId)
    : null;

  if (!activeOrganizationId) {
    return {
      activeOrganizationId,
      session,
    };
  }

  const [organizations, currentRole] = await Promise.all([
    readServerOrganizations(authRequest),
    readServerOrganizationMemberRole(authRequest, activeOrganizationId).then(
      (result) => result.role as OrganizationRole
    ),
  ]);

  return {
    activeOrganizationId,
    currentOrganizationRole: currentRole,
    organizations,
    session,
  };
}

function readServerAuthRequestFromCookie(
  getRequestHeader: RequestHeaderReader,
  cookie: string
): ServerAuthRequest {
  const authBaseURL = resolveConfiguredServerAuthBaseURL();

  if (!authBaseURL) {
    throw new Error("Cannot resolve the auth base URL.");
  }

  return {
    authBaseURL,
    cookie: normalizeServerApiCookieHeader(cookie, authBaseURL),
    forwardedHeaders: readServerApiForwardedHeaders({
      forwardedHost: getRequestHeader("x-forwarded-host"),
      forwardedProto: getRequestHeader("x-forwarded-proto"),
      host: getRequestHeader("host"),
      origin: getRequestHeader("origin"),
    }),
  };
}
```

- [ ] **Step 4: Replace duplicated session decode in `server-session-impl.server.ts`**

Modify `apps/app/src/features/auth/server-session-impl.server.ts` so it imports `readOptionalServerAuthSessionFromHeaders` and keeps only the public functions:

```ts
import { readGlobalAppServerContext } from "./app-server-context";
import {
  readOptionalServerAuthSessionForRequest,
  readOptionalServerAuthSessionFromHeaders,
} from "./auth-request-context.server";

export async function getCurrentServerSessionDirect() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cachedSession = readGlobalAppServerContext().session;

  if (cachedSession !== undefined) {
    return cachedSession;
  }

  return await readOptionalServerAuthSessionFromHeaders((name) =>
    getRequestHeader(name)
  );
}

export { readOptionalServerAuthSessionForRequest as readOptionalServerAuthSessionFromRequest };
```

- [ ] **Step 5: Replace duplicated auth request helpers in organization server implementation**

In `apps/app/src/features/organizations/organization-server-impl.server.ts`, replace local `ServerAuthRequest`, `RequestHeaderReader`, `readServerSessionRequest`, `readServerAuthRequestStrict`, `getHeaderFromRequest`, `fetchOrganizations`, and role-fetch helpers with imports from `auth-request-context.server.ts`.

The direct organization functions should keep their public names:

```ts
import {
  getHeaderFromRequest,
  readOptionalServerAuthRequest,
  readRequiredServerAuthRequest,
  readServerOrganizationMemberRole,
  readServerOrganizations,
  type ServerAuthRequest,
} from "../auth/auth-request-context.server";
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter app test server-session.test.ts organization-server.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/features/auth/auth-request-context.server.ts apps/app/src/features/auth/server-session-impl.server.ts apps/app/src/features/organizations/organization-server-impl.server.ts apps/app/src/features/auth/server-session.test.ts
git commit -m "refactor: share server auth request context"
```

---

### Task 3: Move Request Middleware Out Of `start.ts`

**Files:**

- Create/Modify: `apps/app/src/features/auth/app-context-middleware.ts`
- Modify: `apps/app/src/start.ts`
- Test: `apps/app/src/start.test.ts` or `apps/app/src/features/auth/app-context-middleware.test.ts`

- [ ] **Step 1: Add middleware unit tests**

Create `apps/app/src/features/auth/app-context-middleware.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  shouldHydrateAuthContext,
  shouldHydrateOrganizationContext,
} from "./app-context-middleware";

describe("app context middleware route selection", () => {
  it.each([
    "/",
    "/activity",
    "/create-organization",
    "/forgot-password",
    "/login",
    "/members",
    "/oauth/consent",
    "/organization/settings",
    "/reset-password",
    "/settings",
    "/signup",
    "/sites",
    "/verify-email",
    "/accept-invitation/inv_123",
    "/jobs",
    "/jobs/job_123",
    "/sites/site_123",
  ])("hydrates auth context for %s", (pathname) => {
    expect(shouldHydrateAuthContext(pathname)).toBe(true);
  });

  it("skips health checks", () => {
    expect(shouldHydrateAuthContext("/health")).toBe(false);
  });

  it.each([
    "/",
    "/activity",
    "/members",
    "/organization/settings",
    "/sites",
    "/jobs",
    "/jobs/job_123",
    "/sites/site_123",
  ])("hydrates organization context for %s", (pathname) => {
    expect(shouldHydrateOrganizationContext(pathname)).toBe(true);
  });

  it.each(["/login", "/signup", "/create-organization", "/forgot-password"])(
    "does not hydrate organization context for %s",
    (pathname) => {
      expect(shouldHydrateOrganizationContext(pathname)).toBe(false);
    }
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter app test app-context-middleware.test.ts
```

Expected: fail because exports do not exist.

- [ ] **Step 3: Create app context middleware module**

Create `apps/app/src/features/auth/app-context-middleware.ts`:

```ts
import { createMiddleware } from "@tanstack/react-start";

export const requestAppContextMiddleware = createMiddleware().server(
  async ({ next, pathname, request }) => {
    if (!shouldHydrateAuthContext(pathname)) {
      return await next();
    }

    const { buildAppAuthContextSnapshotForRequest } =
      await import("./auth-request-context.server");
    const snapshot = await buildAppAuthContextSnapshotForRequest(request);

    if (!shouldHydrateOrganizationContext(pathname)) {
      return await next({
        context: {
          activeOrganizationId: snapshot.activeOrganizationId,
          session: snapshot.session,
        },
      });
    }

    return await next({
      context: snapshot,
    });
  }
);

export function shouldHydrateAuthContext(pathname: string) {
  if (pathname === "/health") {
    return false;
  }

  return (
    pathname === "/" ||
    pathname === "/activity" ||
    pathname === "/create-organization" ||
    pathname === "/forgot-password" ||
    pathname === "/login" ||
    pathname === "/members" ||
    pathname === "/oauth/consent" ||
    pathname === "/organization/settings" ||
    pathname === "/reset-password" ||
    pathname === "/settings" ||
    pathname === "/signup" ||
    pathname === "/sites" ||
    pathname === "/verify-email" ||
    pathname.startsWith("/accept-invitation/") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/sites/")
  );
}

export function shouldHydrateOrganizationContext(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/activity" ||
    pathname === "/members" ||
    pathname === "/organization/settings" ||
    pathname === "/sites" ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/sites/")
  );
}
```

- [ ] **Step 4: Simplify `start.ts`**

Modify `apps/app/src/start.ts`:

```ts
import { createStart } from "@tanstack/react-start";

import { requestAppContextMiddleware } from "./features/auth/app-context-middleware";

export const startInstance = createStart(() => ({
  requestMiddleware: [requestAppContextMiddleware],
}));
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter app test app-context-middleware.test.ts start
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/auth/app-context-middleware.ts apps/app/src/features/auth/app-context-middleware.test.ts apps/app/src/start.ts
git commit -m "refactor: extract app context request middleware"
```

---

### Task 4: Add Server-Function Middleware For App/Auth Lane

**Files:**

- Modify: `apps/app/src/features/auth/app-context-middleware.ts`
- Test: `apps/app/src/features/auth/app-context-middleware.test.ts`

- [ ] **Step 1: Add middleware export tests**

Extend `apps/app/src/features/auth/app-context-middleware.test.ts`:

```ts
import {
  optionalAuthFunctionMiddleware,
  organizationAdminFunctionMiddleware,
  organizationFunctionMiddleware,
  requiredAuthFunctionMiddleware,
} from "./app-context-middleware";

it("exports app/auth server function middleware", () => {
  expect(optionalAuthFunctionMiddleware).toBeDefined();
  expect(requiredAuthFunctionMiddleware).toBeDefined();
  expect(organizationFunctionMiddleware).toBeDefined();
  expect(organizationAdminFunctionMiddleware).toBeDefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter app test app-context-middleware.test.ts
```

Expected: fail because middleware exports do not exist.

- [ ] **Step 3: Add function middleware**

Append to `apps/app/src/features/auth/app-context-middleware.ts`:

```ts
import {
  isAdministrativeOrganizationRole,
  decodeOrganizationId,
} from "@ceird/identity-core";
import { redirect } from "@tanstack/react-router";

import { getLoginNavigationTarget } from "./auth-navigation";

export const optionalAuthFunctionMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { buildAppAuthContextSnapshotForRequest } =
    await import("./auth-request-context.server");
  const snapshot = await buildAppAuthContextSnapshotForRequest(getRequest());

  return await next({
    context: snapshot,
  });
});

export const requiredAuthFunctionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([optionalAuthFunctionMiddleware])
  .server(async ({ context, next }) => {
    if (!context.session) {
      throw redirect(getLoginNavigationTarget());
    }

    return await next({
      context: {
        ...context,
        session: context.session,
      },
    });
  });

export const organizationFunctionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([requiredAuthFunctionMiddleware])
  .server(async ({ context, next }) => {
    const activeOrganizationId = context.session.session.activeOrganizationId
      ? decodeOrganizationId(context.session.session.activeOrganizationId)
      : null;

    if (!activeOrganizationId) {
      throw redirect({ to: "/create-organization" });
    }

    return await next({
      context: {
        ...context,
        activeOrganizationId,
      },
    });
  });

export const organizationAdminFunctionMiddleware = createMiddleware({
  type: "function",
})
  .middleware([organizationFunctionMiddleware])
  .server(async ({ context, next }) => {
    if (
      !context.currentOrganizationRole ||
      !isAdministrativeOrganizationRole(context.currentOrganizationRole)
    ) {
      throw redirect({ to: "/" });
    }

    return await next();
  });
```

- [ ] **Step 4: Run middleware tests**

Run:

```bash
pnpm --filter app test app-context-middleware.test.ts
```

Expected: pass.

- [ ] **Step 5: Run type-check to verify middleware context typing**

Run:

```bash
pnpm check-types
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/auth/app-context-middleware.ts apps/app/src/features/auth/app-context-middleware.test.ts
git commit -m "feat: add app auth server function middleware"
```

---

### Task 5: Add One Browser-Callable App Context Snapshot Server Function

**Files:**

- Create: `apps/app/src/features/auth/app-context-functions.ts`
- Create: `apps/app/src/features/auth/app-context-client-cache.ts`
- Modify: `apps/app/src/features/auth/client-session-cache.ts` or delete it after migration
- Test: `apps/app/src/features/auth/app-context-client-cache.test.ts`

- [ ] **Step 1: Write client cache tests**

Create `apps/app/src/features/auth/app-context-client-cache.test.ts`:

```ts
import {
  clearAppContextClientCache,
  getCachedClientAppContext,
} from "./app-context-client-cache";

const { mockedGetCurrentAppContext } = vi.hoisted(() => ({
  mockedGetCurrentAppContext: vi.fn<() => Promise<unknown>>(),
}));

vi.mock(import("./app-context-functions"), () => ({
  getCurrentAppContext: mockedGetCurrentAppContext,
}));

describe("app context client cache", () => {
  afterEach(() => {
    clearAppContextClientCache();
    vi.clearAllMocks();
  });

  it("reuses fresh authenticated snapshots", async () => {
    const snapshot = {
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-05-31T10:00:00.000Z",
          token: "session-token",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
          image: null,
          emailVerified: false,
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
        },
      },
      activeOrganizationId: null,
    };
    mockedGetCurrentAppContext.mockResolvedValue(snapshot);

    await expect(getCachedClientAppContext()).resolves.toStrictEqual(snapshot);
    await expect(getCachedClientAppContext()).resolves.toStrictEqual(snapshot);
    expect(mockedGetCurrentAppContext).toHaveBeenCalledOnce();
  });

  it("does not cache unauthenticated snapshots", async () => {
    mockedGetCurrentAppContext.mockResolvedValue({
      session: null,
      activeOrganizationId: null,
    });

    await expect(getCachedClientAppContext()).resolves.toMatchObject({
      session: null,
    });
    await expect(getCachedClientAppContext()).resolves.toMatchObject({
      session: null,
    });
    expect(mockedGetCurrentAppContext).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter app test app-context-client-cache.test.ts
```

Expected: fail because files do not exist.

- [ ] **Step 3: Add server function**

Create `apps/app/src/features/auth/app-context-functions.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";

import { optionalAuthFunctionMiddleware } from "./app-context-middleware";
import { decodeAppAuthContextSnapshot } from "./app-context-types";

export const getCurrentAppContext = createServerFn({
  method: "GET",
})
  .middleware([optionalAuthFunctionMiddleware])
  .handler(({ context }) => decodeAppAuthContextSnapshot(context));
```

- [ ] **Step 4: Add client cache around the app context function**

Create `apps/app/src/features/auth/app-context-client-cache.ts`:

```ts
import { getCurrentAppContext } from "./app-context-functions";
import {
  decodeAppAuthContextSnapshot,
  type AppAuthContextSnapshot,
} from "./app-context-types";

const CLIENT_APP_CONTEXT_CACHE_TTL_MS = 10_000;

interface ClientAppContextCacheEntry {
  readonly expiresAt: number;
  readonly promise: Promise<AppAuthContextSnapshot>;
}

let clientAppContextCache: ClientAppContextCacheEntry | undefined;

export function clearAppContextClientCache() {
  clientAppContextCache = undefined;
}

export async function getCachedClientAppContext(): Promise<AppAuthContextSnapshot> {
  if (isFreshClientAppContextCacheEntry(clientAppContextCache)) {
    return await clientAppContextCache.promise;
  }

  const promise = (async () =>
    decodeAppAuthContextSnapshot(await getCurrentAppContext()))();
  clientAppContextCache = {
    expiresAt: Date.now() + CLIENT_APP_CONTEXT_CACHE_TTL_MS,
    promise,
  };

  try {
    const snapshot = await promise;

    if (!snapshot.session && clientAppContextCache?.promise === promise) {
      clientAppContextCache = undefined;
    }

    return snapshot;
  } catch (error) {
    if (clientAppContextCache?.promise === promise) {
      clientAppContextCache = undefined;
    }

    throw error;
  }
}

function isFreshClientAppContextCacheEntry(
  entry: ClientAppContextCacheEntry | undefined
): entry is ClientAppContextCacheEntry {
  return entry !== undefined && entry.expiresAt > Date.now();
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter app test app-context-client-cache.test.ts app-context-types.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/auth/app-context-functions.ts apps/app/src/features/auth/app-context-client-cache.ts apps/app/src/features/auth/app-context-client-cache.test.ts
git commit -m "feat: add cached app auth context snapshot"
```

---

### Task 6: Refactor Route Guards To Use App Context Snapshot

**Files:**

- Modify: `apps/app/src/features/auth/require-authenticated-session.ts`
- Modify: `apps/app/src/features/auth/redirect-if-authenticated.ts`
- Modify: `apps/app/src/routes/_app.tsx`
- Modify: `apps/app/src/routes/_app._org.tsx`
- Modify: `apps/app/src/features/organizations/organization-access.ts`
- Test: `apps/app/src/features/auth/require-authenticated-session.test.ts`
- Test: `apps/app/src/features/auth/redirect-if-authenticated.test.ts`
- Test: `apps/app/src/routes/-_app.test.tsx`
- Test: `apps/app/src/features/organizations/organization-access.test.ts`

- [ ] **Step 1: Update tests to assert app-context cache use**

In `apps/app/src/features/auth/require-authenticated-session.test.ts`, replace `authClient.getSession` mocks with `getCachedClientAppContext` mocks for client-mode tests:

```ts
vi.mock(import("./app-context-client-cache"), () => ({
  clearAppContextClientCache: vi.fn(),
  getCachedClientAppContext: mockedGetCachedClientAppContext,
}));
```

Add:

```ts
it("uses the cached client app context on browser navigations", async () => {
  mockedIsServerEnvironment.mockReturnValue(false);
  mockedGetCachedClientAppContext.mockResolvedValue({
    session: sessionFixture,
    activeOrganizationId: null,
  });

  await expect(requireAuthenticatedSession()).resolves.toStrictEqual(
    sessionFixture
  );
  expect(mockedGetCachedClientAppContext).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run focused tests to see current failures**

Run:

```bash
pnpm --filter app test require-authenticated-session.test.ts redirect-if-authenticated.test.ts organization-access.test.ts -t "cached client app context"
```

Expected: fail until implementations switch from session-only cache.

- [ ] **Step 3: Refactor `require-authenticated-session.ts`**

Modify client branch:

```ts
import { getCachedClientAppContext } from "./app-context-client-cache";

async function getCurrentSession() {
  if (isServerEnvironment()) {
    const { getCurrentServerSession } = await importServerSession();
    return await getCurrentServerSession();
  }

  return (await getCachedClientAppContext()).session;
}
```

- [ ] **Step 4: Refactor `redirect-if-authenticated.ts`**

Modify client branch:

```ts
import { getCachedClientAppContext } from "./app-context-client-cache";

async function getCurrentSession() {
  if (isServerEnvironment()) {
    const { getCurrentServerSession } = await importServerSession();
    return await getCurrentServerSession();
  }

  return (await getCachedClientAppContext()).session;
}
```

- [ ] **Step 5: Refactor `_app.tsx`**

Change `loadAuthenticatedAppRoute` so client fallback uses one app snapshot:

```ts
const snapshot =
  serverContext.session === undefined
    ? await readAuthenticatedClientOrServerAppContext()
    : serverContext;
const session =
  snapshot.session === undefined
    ? await requireAuthenticatedSession()
    : await requireAuthenticatedServerContextSession(snapshot.session);
```

Add helper:

```ts
async function readAuthenticatedClientOrServerAppContext() {
  if (typeof document === "undefined") {
    return readAppServerContext(undefined);
  }

  const { getCachedClientAppContext } =
    await import("#/features/auth/app-context-client-cache");
  return await getCachedClientAppContext();
}
```

- [ ] **Step 6: Refactor `_app._org.tsx`**

Use `context.organizations` and `context.currentOrganizationRole` first. Do not call client Better Auth list/role functions when those values exist.

The route should still call `ensureActiveOrganizationIdForSession(context.session)` for pure derivation, but that function must read organization lists from context/cache rather than raw Better Auth client calls.

- [ ] **Step 7: Refactor `organization-access.ts` route guard reads**

Replace client `getCachedClientAuthSession()` with `getCachedClientAppContext()` and make `listOrganizations()` prefer:

```ts
const globalOrganizations = readGlobalAppServerContext().organizations;
if (globalOrganizations !== undefined) return globalOrganizations;

if (!isServerEnvironment()) {
  const snapshot = await getCachedClientAppContext();
  if (snapshot.organizations !== undefined) return snapshot.organizations;
}
```

Keep direct `authClient.organization.list()` only as a compatibility fallback for non-route UI that cannot yet consume app context. Do not leave an inline note for later cleanup; instead add a named helper:

```ts
async function listClientOrganizationsFallback() {
  return await getCachedClientOrganizations();
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
pnpm --filter app test require-authenticated-session.test.ts redirect-if-authenticated.test.ts organization-access.test.ts -_app.test.tsx
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/app/src/features/auth/require-authenticated-session.ts apps/app/src/features/auth/redirect-if-authenticated.ts apps/app/src/routes/_app.tsx apps/app/src/routes/_app._org.tsx apps/app/src/features/organizations/organization-access.ts apps/app/src/features/auth/require-authenticated-session.test.ts apps/app/src/features/auth/redirect-if-authenticated.test.ts apps/app/src/routes/-_app.test.tsx apps/app/src/features/organizations/organization-access.test.ts
git commit -m "refactor: load route auth context through app snapshot"
```

---

### Task 7: Apply Middleware To App/Auth Server Functions Only

**Files:**

- Modify: `apps/app/src/features/organizations/organization-server.ts`
- Test: `apps/app/src/features/organizations/organization-server.test.ts`

- [ ] **Step 1: Add tests for middleware-backed server functions**

In `apps/app/src/features/organizations/organization-server.test.ts`, add or update tests so create organization and set active organization fail closed without a session cookie, and use middleware context when authenticated.

Expected behavior:

```ts
await expect(
  createCurrentServerOrganization({ data: { name: "Acme" } })
).rejects.toThrow();
```

If the existing test harness mocks `createServerFn`, assert that `createCurrentServerOrganization` imports `organizationAdminFunctionMiddleware` or `requiredAuthFunctionMiddleware` by mocking the middleware module and verifying the middleware array is supplied.

- [ ] **Step 2: Run the focused test to verify the new expectation fails**

Run:

```bash
pnpm --filter app test organization-server.test.ts
```

Expected: fail until middleware is attached.

- [ ] **Step 3: Attach middleware to organization server functions**

Modify `apps/app/src/features/organizations/organization-server.ts`:

```ts
import {
  organizationFunctionMiddleware,
  requiredAuthFunctionMiddleware,
} from "../auth/app-context-middleware";

export const createCurrentServerOrganization = createServerFn({
  method: "POST",
})
  .middleware([requiredAuthFunctionMiddleware])
  .inputValidator((input: unknown) => decodeCreateOrganizationNameInput(input))
  .handler(async ({ data }) => {
    const { createCurrentServerOrganizationDirect } =
      await import("./organization-server-impl.server");

    return await createCurrentServerOrganizationDirect(
      data satisfies CreateOrganizationNameInput
    );
  });
```

Apply `organizationFunctionMiddleware` to `setCurrentServerActiveOrganizationFn`.

Do not move domain product mutations here.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter app test organization-server.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/organizations/organization-server.ts apps/app/src/features/organizations/organization-server.test.ts
git commit -m "refactor: protect organization server functions with middleware"
```

---

### Task 8: Replace Session Cache Invalidations With App Context Cache Invalidations

**Files:**

- Modify: `apps/app/src/features/auth/login-page.tsx`
- Modify: `apps/app/src/features/auth/signup-page.tsx`
- Modify: `apps/app/src/features/auth/sign-out.ts`
- Modify: `apps/app/src/features/organizations/organization-onboarding-page.tsx`
- Modify: `apps/app/src/features/organizations/accept-invitation-page.tsx`
- Modify: `apps/app/src/features/organizations/organization-switcher.tsx`
- Test: corresponding existing tests

- [ ] **Step 1: Update invalidation tests**

Update tests to mock `clearAppContextClientCache` instead of `clearClientAuthSessionCache`.

Example for login/signup tests:

```ts
const { mockedClearAppContextClientCache } = vi.hoisted(() => ({
  mockedClearAppContextClientCache: vi.fn(),
}));

vi.mock(import("./app-context-client-cache"), () => ({
  clearAppContextClientCache: mockedClearAppContextClientCache,
}));
```

Assert:

```ts
expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run focused tests to verify failures**

Run:

```bash
pnpm --filter app test login-page.test.tsx signup-page.test.tsx sign-out.test.ts organization-onboarding-page.test.tsx accept-invitation-page.test.tsx organization-switcher.test.tsx
```

Expected: fail where invalidation imports still point at session-only cache.

- [ ] **Step 3: Replace invalidation imports**

Change:

```ts
import { clearClientAuthSessionCache } from "./client-session-cache";
```

or organization-relative variants to:

```ts
import { clearAppContextClientCache } from "./app-context-client-cache";
```

For organization files:

```ts
import { clearAppContextClientCache } from "../auth/app-context-client-cache";
```

Call both `clearAppContextClientCache()` and existing route/query invalidation where identity/org state changes.

- [ ] **Step 4: Remove `client-session-cache.ts` after all imports are gone**

Run:

```bash
rg -n "client-session-cache|clearClientAuthSessionCache|getCachedClientAuthSession" apps/app/src
```

Expected: no matches.

Delete:

```bash
git rm apps/app/src/features/auth/client-session-cache.ts
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter app test login-page.test.tsx signup-page.test.tsx sign-out.test.ts organization-onboarding-page.test.tsx accept-invitation-page.test.tsx organization-switcher.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/auth/login-page.tsx apps/app/src/features/auth/signup-page.tsx apps/app/src/features/auth/sign-out.ts apps/app/src/features/organizations/organization-onboarding-page.tsx apps/app/src/features/organizations/accept-invitation-page.tsx apps/app/src/features/organizations/organization-switcher.tsx
git rm apps/app/src/features/auth/client-session-cache.ts
git commit -m "refactor: invalidate cached app context after identity changes"
```

---

### Task 9: Preserve Direct Domain API Lane And Document The Boundary

**Files:**

- Modify: `docs/architecture/frontend.md`
- Modify: `apps/app/src/features/api/app-api-client.ts` only if comments need clarifying
- Test: `apps/app/src/test/app-domain-boundaries.test.ts`

- [ ] **Step 1: Add architecture boundary test**

Extend `apps/app/src/test/app-domain-boundaries.test.ts` with checks that domain features do not import app auth server functions:

```ts
it("keeps domain product features off app auth server functions", async () => {
  const { globby } = await import("globby");
  const files = await globby([
    "src/features/jobs/**/*.{ts,tsx}",
    "src/features/sites/**/*.{ts,tsx}",
    "src/features/activity/**/*.{ts,tsx}",
  ]);

  for (const file of files) {
    const source = await fs.promises.readFile(file, "utf8");
    expect(source).not.toContain("app-context-functions");
    expect(source).not.toContain("organization-server");
  }
});
```

Use the existing file-read helpers already present in `app-domain-boundaries.test.ts` instead of adding `globby` if that test already has a local utility.

- [ ] **Step 2: Run the boundary test**

Run:

```bash
pnpm --filter app test app-domain-boundaries.test.ts
```

Expected: pass or fail with a real import violation to fix.

- [ ] **Step 3: Update frontend architecture docs**

In `docs/architecture/frontend.md`, replace the client guard cache paragraph with:

```md
The app has two data lanes:

- The app/auth lane uses TanStack Start request middleware, app-owned server
  functions, and a short-lived browser app-context cache for session,
  active-organization, organization list, and active role state.
- The domain data lane calls the typed domain API directly for jobs, sites,
  activity, comments, labels, and future ElectricSQL/TanStack DB-backed product
  data. These calls remain outside app server functions so the API/domain layer
  stays the product authorization and synchronization boundary.

Route parents own shell context. `/_app` establishes the authenticated session,
and `/_app/_org` establishes active organization context. Child routes reuse
that parent context and load only route-specific product data.
```

- [ ] **Step 4: Run docs-sensitive tests**

Run:

```bash
pnpm --filter app test app-domain-boundaries.test.ts app-route-code-splitting.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/frontend.md apps/app/src/test/app-domain-boundaries.test.ts
git commit -m "docs: document app auth and domain data lanes"
```

---

### Task 10: Verification And Prod Performance Acceptance

**Files:**

- Modify only if verification exposes failures.
- Report: `/tmp/ceird-start-auth-context-perf.json`

- [ ] **Step 1: Run focused auth/org route tests**

Run:

```bash
pnpm --filter app test require-authenticated-session.test.ts redirect-if-authenticated.test.ts organization-access.test.ts organization-server.test.ts -_app.test.tsx -_app._org.jobs.test.tsx -_app._org.sites.test.tsx -_app._org.activity.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run app-wide verification**

Run:

```bash
pnpm format
pnpm lint
pnpm check-types
pnpm --filter app test
```

Expected:

- `pnpm format`: all matched files use correct format.
- `pnpm lint`: 0 warnings, 0 errors.
- `pnpm check-types`: all workspaces done.
- `pnpm --filter app test`: all app tests pass.

- [ ] **Step 3: Run full workspace verification before handoff**

Run:

```bash
pnpm test
```

Expected: all available workspace tests pass; integration tests that require unavailable external databases may remain skipped with existing skip messages.

- [ ] **Step 4: Build and inspect bundle shape**

Run:

```bash
pnpm --filter app build
```

Expected:

- `/login` and `/signup` chunks do not import organization-heavy route modules.
- Domain API chunks remain tied to product routes, not public auth routes.

- [ ] **Step 5: Deploy after approval**

Run only after confirming the target stage and credentials are correct:

```bash
CEIRD_CLOUDFLARE=1 \
CEIRD_ZONE_NAME=ceird.app \
CEIRD_APP_HOSTNAME=app.ceird.app \
CEIRD_API_HOSTNAME=api.ceird.app \
CEIRD_AGENT_HOSTNAME=agent.ceird.app \
CEIRD_MCP_HOSTNAME=mcp.ceird.app \
pnpm alchemy deploy --env-file .env.local --stage main --yes
```

Expected: `App` updates successfully; API/domain/database resources should be noop unless unrelated changes are present.

- [ ] **Step 6: Run prod trace acceptance**

Run the same prod Playwright trace used for the previous performance work and save:

```bash
/tmp/ceird-start-auth-context-perf.json
```

Acceptance criteria:

- Signup page hydrates in under 1 second on warm Cloudflare path.
- `GET /api/auth/get-session` is no more than 2 calls across signup, org creation, home, jobs, sites, and activity.
- `GET /api/auth/organization/list` is no more than 2 calls across the same flow.
- `GET /api/auth/organization/get-active-member-role` is no more than 1 call after organization context is established.
- Product route data still calls the domain API directly.
- No failed browser requests.

- [ ] **Step 7: Commit final fixes if needed**

If verification required any changes:

```bash
git add <changed-files>
git commit -m "fix: stabilize app context middleware migration"
```

If no changes were needed, do not create an empty commit.

---

## Self-Review

**Spec coverage:** This plan covers the requested TanStack Start end state: request middleware, server-function middleware, app/auth snapshot, parent route context, direct domain API lane, and ElectricSQL/TanStack DB compatibility.

**Placeholder scan:** No task contains unresolved placeholder language. The only conditional instruction is the explicit final verification branch for fixes discovered during testing.

**Type consistency:** The main DTO is `AppAuthContextSnapshot`; middleware and client cache names use the same `app-context` language throughout.

**Intentional non-goal:** This plan does not move jobs/sites/activity/domain mutations behind server functions. Those remain direct API calls by design.
