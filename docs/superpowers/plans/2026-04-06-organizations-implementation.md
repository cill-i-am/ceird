# Organizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first multi-tenant organization slice with Better Auth organizations, protected first-login org onboarding, and org-gated product access.

**Architecture:** Keep Better Auth native on the backend by enabling the organization plugin and extending the auth schema with organization-backed tables plus session `activeOrganizationId`. In the app, keep `/_app` as the authenticated boundary, add an org-specific guard for the main product area, and add a protected `/create-organization` onboarding route that creates the org and lands the user in the app. Preserve room for future invites and multi-org switching without implementing them in this slice.

**Tech Stack:** Better Auth, Better Auth organization plugin, Drizzle, Effect, TanStack Start, TanStack Router, TanStack Form, Effect Schema, Vitest, Playwright

---

## File Structure

### Backend

- Modify: `apps/api/src/domains/identity/authentication/schema.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`
- Create: `apps/api/drizzle/0003_organizations.sql`
- Create: `apps/api/drizzle/meta/0003_snapshot.json`

### Frontend

- Modify: `apps/app/src/lib/auth-client.ts`
- Create: `apps/app/src/features/organizations/organization-server.ts`
- Create: `apps/app/src/features/organizations/organization-access.ts`
- Create: `apps/app/src/features/organizations/organization-access.test.ts`
- Create: `apps/app/src/features/organizations/organization-schemas.ts`
- Create: `apps/app/src/features/organizations/organization-schemas.test.ts`
- Create: `apps/app/src/features/organizations/organization-onboarding-page.tsx`
- Create: `apps/app/src/features/organizations/organization-onboarding-page.test.tsx`
- Modify: `apps/app/src/routes/_app.tsx`
- Delete: `apps/app/src/routes/_app.index.tsx`
- Create: `apps/app/src/routes/_app._org.tsx`
- Create: `apps/app/src/routes/_app._org.index.tsx`
- Create: `apps/app/src/routes/_app.create-organization.tsx`

### End-to-End And Docs

- Modify: `apps/app/e2e/auth.test.ts`
- Create: `apps/app/e2e/pages/create-organization-page.ts`
- Create: `docs/architecture/organization-next-steps.md`

## Task 1: Add Backend Organization Support

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/schema.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`
- Create: `apps/api/drizzle/0003_organizations.sql`
- Create: `apps/api/drizzle/meta/0003_snapshot.json`

- [ ] **Step 1: Extend the backend tests to describe the new org schema and plugin behavior**

Add these assertions to `apps/api/src/domains/identity/authentication/authentication.test.ts`:

```ts
import { getTableColumns, getTableName } from "drizzle-orm";

import {
  account,
  authSchema,
  invitation,
  member,
  organization,
  rateLimit,
  session,
  user,
  verification,
} from "./schema.js";

it("defines the Better Auth organization tables and active organization session column", () => {
  expect(getTableName(organization)).toBe("organization");
  expect(getTableName(member)).toBe("member");
  expect(getTableName(invitation)).toBe("invitation");
  expect(getTableColumns(session)).toHaveProperty("activeOrganizationId");

  expect(authSchema).toMatchObject({
    user,
    session,
    account,
    verification,
    rateLimit,
    organization,
    member,
    invitation,
  });
}, 10_000);
```

Add this integration coverage to `apps/api/src/domains/identity/authentication/authentication.integration.test.ts` after sign-up succeeds:

```ts
const createOrganizationResponse = await auth.handler(
  makeJsonRequest(
    "/organization/create",
    {
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    },
    {
      cookieJar,
    }
  )
);
updateCookieJar(cookieJar, createOrganizationResponse);
expect(createOrganizationResponse.status).toBe(200);

const createdOrganization = (await createOrganizationResponse.json()) as {
  id: string;
  name: string;
  slug: string;
  members: Array<{ userId: string; role: string }>;
};

expect(createdOrganization.name).toBe("Acme Field Ops");
expect(createdOrganization.slug).toBe("acme-field-ops");
expect(createdOrganization.members).toHaveLength(1);
expect(createdOrganization.members[0]?.role).toBe("owner");

const sessionAfterOrganizationResponse = await auth.handler(
  makeRequest("/get-session", {
    cookieJar,
  })
);
const sessionAfterOrganization =
  (await sessionAfterOrganizationResponse.json()) as SessionResponse;

expect(sessionAfterOrganization?.session?.activeOrganizationId).toBe(
  createdOrganization.id
);
```

- [ ] **Step 2: Run the backend tests to verify they fail before the implementation**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts -t "defines the Better Auth organization tables and active organization session column"
pnpm --filter api test -- src/domains/identity/authentication/authentication.integration.test.ts -t "serves sign-up, sign-in, sign-out, session, password reset"
```

Expected:

- the schema test fails because `organization`, `member`, and `invitation` are not exported yet
- the integration test fails because `/organization/create` is not mounted

- [ ] **Step 3: Extend the auth schema and Better Auth config with the organization plugin**

Update `apps/api/src/domains/identity/authentication/schema.ts` so the session table and auth schema include organization support:

```ts
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrganizationId: text("active_organization_id"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organization_slug_idx").on(table.slug)]
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
    uniqueIndex("member_organization_user_idx").on(
      table.organizationId,
      table.userId
    ),
  ]
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at"),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invitation_organization_id_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ]
);

export const authSchema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  organization,
  member,
  invitation,
};
```

Update `apps/api/src/domains/identity/authentication/auth.ts` to register the Better Auth organization plugin:

```ts
import { organization } from "better-auth/plugins";

return betterAuth({
  ...authConfig,
  advanced: {
    backgroundTasks: {
      handler: options.backgroundTaskHandler,
    },
  },
  database: drizzleAdapter(database, {
    provider: "pg",
    schema: authSchema,
  }),
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
    }),
  ],
  emailAndPassword: {
    ...authConfig.emailAndPassword,
    sendResetPassword: async ({ token, user, url }) => {
      // existing reset email flow
    },
  },
});
```

Create `apps/api/drizzle/0003_organizations.sql` with the schema changes:

```sql
ALTER TABLE "session"
ADD COLUMN "active_organization_id" text;

CREATE TABLE "organization" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logo" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "organization_slug_idx"
  ON "organization" USING btree ("slug");

CREATE TABLE "member" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "member_organization_id_idx"
  ON "member" USING btree ("organization_id");
CREATE INDEX "member_user_id_idx"
  ON "member" USING btree ("user_id");
CREATE UNIQUE INDEX "member_organization_user_idx"
  ON "member" USING btree ("organization_id", "user_id");

CREATE TABLE "invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "invitation_organization_id_idx"
  ON "invitation" USING btree ("organization_id");
CREATE INDEX "invitation_email_idx"
  ON "invitation" USING btree ("email");
```

- [ ] **Step 4: Run the backend tests again and verify they pass**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
pnpm --filter api test -- src/domains/identity/authentication/authentication.integration.test.ts
```

Expected:

- the schema test passes with the new tables and session column
- the integration test passes or keeps only the existing database-availability skips

- [ ] **Step 5: Commit the backend organization slice**

```bash
git add \
  apps/api/src/domains/identity/authentication/schema.ts \
  apps/api/src/domains/identity/authentication/auth.ts \
  apps/api/src/domains/identity/authentication/authentication.test.ts \
  apps/api/src/domains/identity/authentication/authentication.integration.test.ts \
  apps/api/drizzle/0003_organizations.sql \
  apps/api/drizzle/meta/0003_snapshot.json
git commit -m "feat: add backend organization support"
```

## Task 2: Add Organization Client And Access Guarding

**Files:**

- Modify: `apps/app/src/lib/auth-client.ts`
- Create: `apps/app/src/features/organizations/organization-server.ts`
- Create: `apps/app/src/features/organizations/organization-access.ts`
- Create: `apps/app/src/features/organizations/organization-access.test.ts`

- [ ] **Step 1: Write the failing organization access tests**

Create `apps/app/src/features/organizations/organization-access.test.ts`:

```ts
import { isRedirect } from "@tanstack/react-router";

import {
  redirectIfOrganizationReady,
  requireOrganizationAccess,
} from "./organization-access";

const {
  mockedGetServerAuthSession,
  mockedGetSession,
  mockedListServerOrganizations,
  mockedListOrganizations,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetServerAuthSession: vi.fn(),
  mockedGetSession: vi.fn(),
  mockedListServerOrganizations: vi.fn(),
  mockedListOrganizations: vi.fn(),
  mockedIsServerEnvironment: vi.fn(),
}));

vi.mock(import("#/features/auth/server-session"), () => ({
  getCurrentServerSession: mockedGetServerAuthSession,
}));

vi.mock(import("./organization-server"), () => ({
  listCurrentServerOrganizations: mockedListServerOrganizations,
}));

vi.mock(import("#/features/auth/runtime-environment"), () => ({
  isServerEnvironment: mockedIsServerEnvironment,
}));

vi.mock(import("#/lib/auth-client"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: mockedGetSession,
      organization: {
        list: mockedListOrganizations,
      },
    },
  };
});

describe("organization access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects authenticated users without memberships to /create-organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: { id: "session_123", activeOrganizationId: null },
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      },
      error: null,
    });
    mockedListOrganizations.mockResolvedValue({ data: [], error: null });
    mockedListServerOrganizations.mockResolvedValue([]);

    const result = requireOrganizationAccess();

    await expect(result).rejects.toMatchObject({
      options: { to: "/create-organization" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  });

  it("resolves when the session already has an active organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: { id: "session_123", activeOrganizationId: "org_123" },
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      },
      error: null,
    });

    await expect(requireOrganizationAccess()).resolves.toMatchObject({
      activeOrganizationId: "org_123",
    });
    expect(mockedListOrganizations).not.toHaveBeenCalled();
  });

  it("allows access when memberships exist but the session has no active organization yet", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: { id: "session_123", activeOrganizationId: null },
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      },
      error: null,
    });
    mockedListOrganizations.mockResolvedValue({
      data: [{ id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" }],
      error: null,
    });

    await expect(requireOrganizationAccess()).resolves.toMatchObject({
      activeOrganizationId: "org_123",
    });
  });

  it("redirects onboarding users back to / when an organization is already active", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: { id: "session_123", activeOrganizationId: "org_123" },
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      },
      error: null,
    });

    const result = redirectIfOrganizationReady();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  });
});
```

- [ ] **Step 2: Run the organization access tests and verify they fail**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-access.test.ts
```

Expected:

- the run fails because `organization-access.ts` does not exist yet

- [ ] **Step 3: Add the Better Auth org client plugin and implement the access helpers**

Update `apps/app/src/lib/auth-client.ts`:

```ts
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createTaskTrackerAuthClient(baseURL?: string | undefined) {
  return createAuthClient({
    basePath: AUTH_BASE_PATH,
    ...(baseURL ? { baseURL } : {}),
    plugins: [organizationClient()],
  });
}
```

Create `apps/app/src/features/organizations/organization-access.ts`:

```ts
import { isRedirect, redirect } from "@tanstack/react-router";

import { isServerEnvironment } from "#/features/auth/runtime-environment";
import { getCurrentServerSession } from "#/features/auth/server-session";
import { authClient } from "#/lib/auth-client";

import { listCurrentServerOrganizations } from "./organization-server";

interface OrganizationSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

async function getCurrentSession() {
  if (isServerEnvironment()) {
    return await getCurrentServerSession();
  }

  const session = await authClient.getSession();
  return session.data ?? null;
}

async function listOrganizations(): Promise<readonly OrganizationSummary[]> {
  if (isServerEnvironment()) {
    return await listCurrentServerOrganizations();
  }

  const result = await authClient.organization.list();
  return result.data ?? [];
}

async function ensureActiveOrganizationId() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect({ to: "/login" });
  }

  const activeOrganizationId = session.session.activeOrganizationId;

  if (activeOrganizationId) {
    return {
      activeOrganizationId,
      session,
    };
  }

  const organizations = await listOrganizations();

  if (organizations.length === 0) {
    throw redirect({ to: "/create-organization" });
  }

  const firstOrganization = organizations[0];

  if (!firstOrganization) {
    throw redirect({ to: "/create-organization" });
  }

  return {
    activeOrganizationId: firstOrganization.id,
    session,
  };
}

export async function requireOrganizationAccess() {
  try {
    return await ensureActiveOrganizationId();
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    throw redirect({ to: "/create-organization" });
  }
}

export async function redirectIfOrganizationReady() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect({ to: "/login" });
  }

  if (session.session.activeOrganizationId) {
    throw redirect({ to: "/" });
  }

  const organizations = await listOrganizations();

  if (organizations.length > 0) {
    throw redirect({ to: "/" });
  }
}
```

Create `apps/app/src/features/organizations/organization-server.ts`:

```ts
import { createServerOnlyFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";

import { resolveAuthBaseURL } from "#/lib/auth-client";

interface ServerOrganizationSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

function readServerAuthOrigin(): string | undefined {
  if (typeof __SERVER_AUTH_ORIGIN__ === "string") {
    return __SERVER_AUTH_ORIGIN__;
  }

  const authOrigin = process.env.AUTH_ORIGIN;
  return typeof authOrigin === "string" ? authOrigin : undefined;
}

export const listCurrentServerOrganizations = createServerOnlyFn(async () => {
  const cookie = getRequestHeader("cookie");
  const authBaseURL = resolveAuthBaseURL(
    `${getRequestProtocol()}://${getRequestHost()}`,
    readServerAuthOrigin()
  );

  if (!cookie || !authBaseURL) {
    return [] as const;
  }

  const response = await fetch(
    new URL("organization/list", `${authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie,
      },
    }
  );

  if (!response.ok) {
    return [] as const;
  }

  return (((await response.json()) as ServerOrganizationSummary[] | null) ??
    []) satisfies readonly ServerOrganizationSummary[];
});
```

- [ ] **Step 4: Run the app tests again and verify they pass**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-access.test.ts
pnpm --filter app test -- src/features/auth/require-authenticated-session.test.ts
```

Expected:

- the new organization-access tests pass
- the existing authenticated-session tests still pass unchanged

- [ ] **Step 5: Commit the client and access guard work**

```bash
git add \
  apps/app/src/lib/auth-client.ts \
  apps/app/src/features/organizations/organization-server.ts \
  apps/app/src/features/organizations/organization-access.ts \
  apps/app/src/features/organizations/organization-access.test.ts
git commit -m "feat: add organization access guards"
```

## Task 3: Add Protected Organization Onboarding

**Files:**

- Create: `apps/app/src/features/organizations/organization-schemas.ts`
- Create: `apps/app/src/features/organizations/organization-schemas.test.ts`
- Create: `apps/app/src/features/organizations/organization-onboarding-page.tsx`
- Create: `apps/app/src/features/organizations/organization-onboarding-page.test.tsx`
- Create: `apps/app/src/routes/_app.create-organization.tsx`

- [ ] **Step 1: Write the failing schema and page tests**

Create `apps/app/src/features/organizations/organization-schemas.test.ts`:

```ts
import {
  decodeCreateOrganizationInput,
  organizationOnboardingSchema,
} from "./organization-schemas";

describe("organization onboarding schema", () => {
  it("accepts a valid organization name and slug", () => {
    expect(
      decodeCreateOrganizationInput({
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      })
    ).toStrictEqual({
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });
    expect(organizationOnboardingSchema).toBeDefined();
  });

  it("rejects slugs with uppercase letters or spaces", () => {
    expect(() =>
      decodeCreateOrganizationInput({
        name: "Acme Field Ops",
        slug: "Acme Field Ops",
      })
    ).toThrow();
  });
});
```

Create `apps/app/src/features/organizations/organization-onboarding-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OrganizationOnboardingPage } from "./organization-onboarding-page";

const { mockedCreateOrganization, mockedNavigate } = vi.hoisted(() => ({
  mockedCreateOrganization: vi.fn(),
  mockedNavigate: vi.fn(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock(import("#/lib/auth-client"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      organization: {
        ...actual.authClient.organization,
        create: mockedCreateOrganization,
      },
    },
  };
});

describe("organization onboarding page", () => {
  beforeEach(() => {
    mockedNavigate.mockResolvedValue(undefined);
    mockedCreateOrganization.mockResolvedValue({
      data: {
        id: "org_123",
        name: "Acme Field Ops",
        slug: "acme-field-ops",
        members: [{ id: "member_123", role: "owner", userId: "user_123" }],
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the organization and returns to the app", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(
      screen.getByLabelText("Organization name"),
      "Acme Field Ops"
    );
    await user.type(
      screen.getByLabelText("Organization slug"),
      "acme-field-ops"
    );
    await user.click(
      screen.getByRole("button", { name: /create organization/i })
    );

    await waitFor(() => {
      expect(mockedCreateOrganization).toHaveBeenCalledWith({
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/" });
    });
  });

  it("shows an inline error when org creation fails", async () => {
    mockedCreateOrganization.mockResolvedValue({
      data: null,
      error: {
        message: "Organization slug already taken",
        status: 400,
        statusText: "Bad Request",
      },
    });

    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(
      screen.getByLabelText("Organization name"),
      "Acme Field Ops"
    );
    await user.type(
      screen.getByLabelText("Organization slug"),
      "acme-field-ops"
    );
    await user.click(
      screen.getByRole("button", { name: /create organization/i })
    );

    await expect(
      screen.findByText(
        "We couldn't create your organization. Please try again."
      )
    ).resolves.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the onboarding tests to verify they fail**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-schemas.test.ts
pnpm --filter app test -- src/features/organizations/organization-onboarding-page.test.tsx
```

Expected:

- both tests fail because the schema and page files do not exist yet

- [ ] **Step 3: Implement the onboarding schema, page, and route**

Create `apps/app/src/features/organizations/organization-schemas.ts`:

```ts
import { ParseResult, Schema } from "effect";

const OrganizationName = Schema.Trim.pipe(Schema.minLength(2));
const OrganizationSlug = Schema.Trim.pipe(
  Schema.minLength(2),
  Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
);

const CreateOrganizationInput = Schema.Struct({
  name: OrganizationName,
  slug: OrganizationSlug,
});

export type CreateOrganizationInput = typeof CreateOrganizationInput.Type;

export const organizationOnboardingSchema = CreateOrganizationInput;

export function decodeCreateOrganizationInput(
  input: unknown
): CreateOrganizationInput {
  return ParseResult.decodeUnknownSync(CreateOrganizationInput)(input);
}
```

Create `apps/app/src/features/organizations/organization-onboarding-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { AuthFormField } from "#/features/auth/auth-form-field";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { authClient } from "#/lib/auth-client";

import {
  decodeCreateOrganizationInput,
  organizationOnboardingSchema,
} from "./organization-schemas";

export function OrganizationOnboardingPage() {
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: {
      name: "",
      slug: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationOnboardingSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });

      const input = decodeCreateOrganizationInput(value);
      const result = await authClient.organization.create({
        name: input.name,
        slug: input.slug,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: "We couldn't create your organization. Please try again.",
            fields: {},
          },
        });
        return;
      }

      await navigate({ to: "/" });
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create your organization</CardTitle>
          <CardDescription>
            Set up the organization that will own your work in Task Tracker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="name">
                {(field) => (
                  <AuthFormField
                    label="Organization name"
                    htmlFor="organization-name"
                    invalid={Boolean(getErrorText(field.state.meta.errors))}
                    errorText={getErrorText(field.state.meta.errors)}
                  >
                    <Input
                      id="organization-name"
                      name={field.name}
                      placeholder="Acme Field Ops"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </AuthFormField>
                )}
              </form.Field>

              <form.Field name="slug">
                {(field) => (
                  <AuthFormField
                    label="Organization slug"
                    htmlFor="organization-slug"
                    invalid={Boolean(getErrorText(field.state.meta.errors))}
                    errorText={getErrorText(field.state.meta.errors)}
                  >
                    <Input
                      id="organization-slug"
                      name={field.name}
                      placeholder="acme-field-ops"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </AuthFormField>
                )}
              </form.Field>
            </FieldGroup>

            <CardFooter className="flex-col items-stretch gap-4 px-0">
              <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                {(error) =>
                  getFormErrorText(error) ? (
                    <FieldError>{getFormErrorText(error)}</FieldError>
                  ) : null
                }
              </form.Subscribe>

              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Creating organization..."
                      : "Create organization"}
                  </Button>
                )}
              </form.Subscribe>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

Create `apps/app/src/routes/_app.create-organization.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { OrganizationOnboardingPage } from "#/features/organizations/organization-onboarding-page";
import { redirectIfOrganizationReady } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app/create-organization")({
  beforeLoad: redirectIfOrganizationReady,
  component: OrganizationOnboardingPage,
});
```

- [ ] **Step 4: Run the onboarding tests again and verify they pass**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-schemas.test.ts
pnpm --filter app test -- src/features/organizations/organization-onboarding-page.test.tsx
```

Expected:

- the schema test passes
- the onboarding page submits the org create request and shows safe failures

- [ ] **Step 5: Commit the onboarding flow**

```bash
git add \
  apps/app/src/features/organizations/organization-schemas.ts \
  apps/app/src/features/organizations/organization-schemas.test.ts \
  apps/app/src/features/organizations/organization-onboarding-page.tsx \
  apps/app/src/features/organizations/organization-onboarding-page.test.tsx \
  apps/app/src/routes/_app.create-organization.tsx
git commit -m "feat: add organization onboarding"
```

## Task 4: Gate The Product Area On Organization Access

**Files:**

- Delete: `apps/app/src/routes/_app.index.tsx`
- Create: `apps/app/src/routes/_app._org.tsx`
- Create: `apps/app/src/routes/_app._org.index.tsx`
- Modify: `apps/app/e2e/auth.test.ts`
- Create: `apps/app/e2e/pages/create-organization-page.ts`

- [ ] **Step 1: Write the failing e2e expectations for the new route policy**

Update `apps/app/e2e/auth.test.ts` so signup and first login expect onboarding first:

```ts
async function expectOrganizationOnboarding(page: Page) {
  await expect(page).toHaveURL("http://localhost:4173/create-organization");
  await expect(
    page.getByRole("heading", { name: "Create your organization" })
  ).toBeVisible();
}

test("signup sends the user to organization onboarding before the app", async ({
  page,
}) => {
  const signupPage = new SignupPage(page);
  const email = createTestEmail("signup");

  await signupPage.goto();
  await signupPage.name.fill("Taylor Example");
  await signupPage.email.fill(email);
  await signupPage.password.fill("password123");
  await signupPage.confirmPassword.fill("password123");
  await signupPage.submit.click();

  await expectOrganizationOnboarding(page);
});
```

- [ ] **Step 2: Run the app and e2e tests to verify the new expectations fail**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-access.test.ts
pnpm --filter app exec playwright test e2e/auth.test.ts --project=chromium
```

Expected:

- the organization-access tests still pass
- the Playwright auth flow fails because the product does not yet redirect to onboarding

- [ ] **Step 3: Restructure the protected routes so the product area requires org access**

Keep `apps/app/src/routes/_app.tsx` as the authenticated boundary that returns `{ session }`.

Create `apps/app/src/routes/_app._org.tsx`:

```tsx
import { Outlet, createFileRoute } from "@tanstack/react-router";

import { requireOrganizationAccess } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app/_org")({
  beforeLoad: async () => {
    const organizationAccess = await requireOrganizationAccess();

    return {
      activeOrganizationId: organizationAccess.activeOrganizationId,
    };
  },
  component: Outlet,
});
```

Create `apps/app/src/routes/_app._org.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedShellHome } from "#/features/auth/authenticated-shell-home";

export const Route = createFileRoute("/_app/_org/")({
  component: AuthenticatedShellHome,
});
```

Delete `apps/app/src/routes/_app.index.tsx`.

Create `apps/app/e2e/pages/create-organization-page.ts`:

```ts
import { expect, type Locator, type Page } from "@playwright/test";

export class CreateOrganizationPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly name: Locator;
  readonly slug: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", {
      name: "Create your organization",
    });
    this.name = page.getByLabel("Organization name");
    this.slug = page.getByLabel("Organization slug");
    this.submit = page.getByRole("button", { name: /create organization/i });
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }
}
```

Update `apps/app/e2e/auth.test.ts` so signup and seeded login go through onboarding and then reach the app:

```ts
import { CreateOrganizationPage } from "./pages/create-organization-page";

test("signup creates an org before entering the app", async ({ page }) => {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const email = createTestEmail("signup");

  await signupPage.goto();
  await signupPage.name.fill("Taylor Example");
  await signupPage.email.fill(email);
  await signupPage.password.fill("password123");
  await signupPage.confirmPassword.fill("password123");
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill("Acme Field Ops");
  await createOrganizationPage.slug.fill("acme-field-ops");
  await createOrganizationPage.submit.click();

  await expectAuthenticatedHome(page);
});
```

- [ ] **Step 4: Run the app and e2e tests again and verify they pass**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-access.test.ts
pnpm --filter app test -- src/features/organizations/organization-onboarding-page.test.tsx
pnpm --filter app exec playwright test e2e/auth.test.ts --project=chromium
```

Expected:

- organization route and onboarding tests pass
- Playwright covers `sign up -> create organization -> app`

- [ ] **Step 5: Commit the route gating and e2e updates**

```bash
git add \
  apps/app/src/routes/_app._org.tsx \
  apps/app/src/routes/_app._org.index.tsx \
  apps/app/e2e/auth.test.ts \
  apps/app/e2e/pages/create-organization-page.ts
git rm apps/app/src/routes/_app.index.tsx
git commit -m "feat: require organization access for the app"
```

## Task 5: Document Organization Follow-Ups And Run Full Verification

**Files:**

- Create: `docs/architecture/organization-next-steps.md`

- [ ] **Step 1: Write the follow-up org roadmap document**

Create `docs/architecture/organization-next-steps.md`:

```md
# Organization Next Steps

This document tracks follow-up work after the first organizations slice.

## Next Product Steps

1. Invite acceptance
2. Organization switching for users who belong to multiple organizations
3. Workspace and domain data under the active organization

## Invite Acceptance

The first organizations slice intentionally does not implement invitations.
When invitations arrive:

- support both existing-user and new-user invite acceptance
- do not auto-create a personal organization for invited users
- set the invited organization active after acceptance

## Multi-Organization Switching

The first organizations slice assumes one meaningful organization context in the
UI at a time.

When multi-org support arrives:

- add explicit organization switching in the app shell
- stop relying on single-org fallback behavior
- preserve role scoping per organization

## Workspace And Domain Data

The first organizations slice adds the tenant boundary, not the domain model.

Later work can add:

- workspaces under the active organization if product needs it
- organization-owned tasks, projects, or field workflows
- richer authorization once domain actions require it
```

- [ ] **Step 2: Run repo verification before closing the slice**

Run:

```bash
pnpm --filter api test
pnpm --filter app test
pnpm --filter app exec playwright test --project=chromium
pnpm check-types
```

Expected:

- API unit and integration tests pass or keep only the known database skips
- app unit tests pass
- Playwright auth flow passes with onboarding in the middle
- workspace typecheck passes

- [ ] **Step 3: Commit the docs**

```bash
git add docs/architecture/organization-next-steps.md
git commit -m "docs: add organization next steps"
```

## Self-Review

- Spec coverage check:
  - Better Auth organization plugin: Task 1
  - first-login onboarding inside authenticated app boundary: Tasks 3 and 4
  - no personal area / org-required access: Task 4
  - roles `owner`, `admin`, `member`: Task 1 keeps Better Auth defaults and member persistence
  - no invites in v1: Tasks 1 and 5 keep invitation storage but defer flows
  - follow-on org roadmap doc: Task 5
- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” placeholders remain in the plan steps
- Type consistency:
  - `activeOrganizationId`, `organization.create`, and `organization.list` are named consistently across backend, guards, onboarding, and tests
