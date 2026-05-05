# Organization Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight admin-only organization settings page where an organization admin can update the active organization name and see the immutable slug.

**Architecture:** Keep organization mutation on Better Auth's organization plugin instead of adding a parallel app API. Add a shared `UpdateOrganizationInputSchema` in `@ceird/identity-core`, validate Better Auth organization updates with the same boundary schema on the API, and build a focused TanStack Router page under `/_app/_org/settings`. Surface the settings entry point from the account dropdown beside sign out, not from the primary sidebar navigation.

**Tech Stack:** Better Auth organization plugin, Effect Schema, TanStack Start, TanStack Router, TanStack Form, Vitest, Testing Library, Playwright

---

## Scope And Assumptions

- This first slice edits only `organization.name`.
- The settings page displays `organization.slug` as read-only helper text because slugs are durable identifiers and changing them is not required yet.
- Only `owner` and `admin` can access the page, matching the existing members route authorization.
- The page should refresh route context after a successful update so sidebar/header consumers see the new organization name when they start using it later.
- The frontend implementation tasks must use the `$impeccable craft` skill before building UI details.
- The settings entry point belongs in the `NavUser` account dropdown alongside `Sign out`; do not add Settings to `data.navMain` in `AppSidebar`.
- No database migration is needed. The existing `organization` table already has `name`, `slug`, `logo`, and `metadata`.

## File Structure

### Shared Validation

- Modify: `packages/identity-core/src/index.ts`
- Modify: `packages/identity-core/src/index.test.ts`

### API Auth Boundary

- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`

### Frontend Route And UI

- Create: `apps/app/src/features/organizations/organization-settings-page.tsx`
- Create: `apps/app/src/features/organizations/organization-settings-page.test.tsx`
- Create: `apps/app/src/features/organizations/organization-settings-schemas.ts`
- Create: `apps/app/src/routes/_app._org.settings.tsx`
- Modify: `apps/app/src/components/nav-user.tsx`
- Modify: `apps/app/src/components/nav-user.test.tsx`
- Modify: generated route tree through the normal app typecheck/build flow if the router generator updates `apps/app/src/routeTree.gen.ts`.

### End-To-End

- Create: `apps/app/e2e/organization-settings.test.ts`

## Task 1: Add Shared Update Validation

**Files:**

- Modify: `packages/identity-core/src/index.ts`
- Modify: `packages/identity-core/src/index.test.ts`

- [ ] **Step 1: Write failing shared schema tests**

Add these cases to `packages/identity-core/src/index.test.ts`:

```ts
import {
  decodeCreateOrganizationInput,
  decodeUpdateOrganizationInput,
} from "./index.js";

describe("updateOrganizationInputSchema", () => {
  it("trims a valid organization name update", () => {
    expect(
      decodeUpdateOrganizationInput({
        name: "  Northwind Field Ops  ",
      })
    ).toStrictEqual({
      name: "Northwind Field Ops",
    });
  }, 1000);

  it("rejects organization names shorter than the shared minimum", () => {
    expect(() =>
      decodeUpdateOrganizationInput({
        name: " A ",
      })
    ).toThrow(/Expected/);
  }, 1000);
});
```

- [ ] **Step 2: Run the focused identity-core tests and verify they fail**

Run:

```bash
pnpm --filter @ceird/identity-core test -- src/index.test.ts -t updateOrganizationInputSchema
```

Expected: FAIL because `decodeUpdateOrganizationInput` is not exported yet.

- [ ] **Step 3: Implement the update schema**

Update `packages/identity-core/src/index.ts`:

```ts
export const UpdateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
});

export type UpdateOrganizationInput = Schema.Schema.Type<
  typeof UpdateOrganizationInputSchema
>;

export function decodeUpdateOrganizationInput(
  input: unknown
): UpdateOrganizationInput {
  return ParseResult.decodeUnknownSync(UpdateOrganizationInputSchema)(input);
}
```

Keep `CreateOrganizationInputSchema` unchanged so create still requires both `name` and `slug`.

- [ ] **Step 4: Run the focused identity-core tests and verify they pass**

Run:

```bash
pnpm --filter @ceird/identity-core test -- src/index.test.ts -t "organizationInputSchema"
```

Expected: PASS for both create and update schema tests.

- [ ] **Step 5: Commit**

```bash
git add packages/identity-core/src/index.ts packages/identity-core/src/index.test.ts
git commit -m "feat: add organization update validation"
```

## Task 2: Validate Better Auth Organization Updates

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`

- [ ] **Step 1: Write failing auth update validation tests**

Add this test near the organization plugin coverage in `apps/api/src/domains/identity/authentication/authentication.test.ts`:

```ts
it("normalizes organization update names through the auth boundary", async (context) => {
  const { auth, headers } = await createAuthenticatedOrganizationContext(
    context,
    {
      organizationName: "Acme Field Ops",
      organizationSlug: "acme-field-ops",
    }
  );

  const updated = await auth.api.updateOrganization({
    body: {
      data: {
        name: "  Northwind Field Ops  ",
      },
    },
    headers,
  });

  expect(updated.name).toBe("Northwind Field Ops");
});

it("rejects invalid organization update names through the auth boundary", async (context) => {
  const { auth, headers } = await createAuthenticatedOrganizationContext(
    context,
    {
      organizationName: "Acme Field Ops",
      organizationSlug: "acme-field-ops",
    }
  );

  await expect(
    auth.api.updateOrganization({
      body: {
        data: {
          name: "A",
        },
      },
      headers,
    })
  ).rejects.toMatchObject({
    status: "BAD_REQUEST",
  });
});
```

If `createAuthenticatedOrganizationContext` does not exist in this file, add the helper in the same style as existing Better Auth auth test helpers:

```ts
async function createAuthenticatedOrganizationContext(
  context: { task: { name: string } },
  input: {
    readonly organizationName: string;
    readonly organizationSlug: string;
  }
) {
  const auth = await createTestAuthentication(context);
  const headers = new Headers();
  const email = `${context.task.name.replaceAll(" ", ".")}@example.com`;

  await auth.api.signUpEmail({
    body: {
      email,
      name: "Test User",
      password: "correct horse battery staple",
    },
    headers,
  });

  await auth.api.createOrganization({
    body: {
      name: input.organizationName,
      slug: input.organizationSlug,
    },
    headers,
  });

  return { auth, headers };
}
```

- [ ] **Step 2: Run the focused API tests and verify they fail**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts -t "organization update"
```

Expected: FAIL because `beforeUpdateOrganization` is not wired to the shared schema yet.

- [ ] **Step 3: Implement Better Auth before-update validation**

Update imports in `apps/api/src/domains/identity/authentication/auth.ts`:

```ts
import {
  decodeCreateOrganizationInput,
  decodePublicInvitationPreview,
  decodeUpdateOrganizationInput,
} from "@ceird/identity-core";
```

Add this hook beside the existing `beforeCreateOrganization` hook:

```ts
beforeUpdateOrganization: ({ organization: nextOrganization }) => {
  let input;

  try {
    input = decodeUpdateOrganizationInput(nextOrganization);
  } catch {
    throw APIError.from("BAD_REQUEST", {
      code: "INVALID_ORGANIZATION_INPUT",
      message: "Organization name must be at least 2 characters long.",
    });
  }

  return Promise.resolve({
    data: {
      ...nextOrganization,
      name: input.name,
    },
  });
},
```

- [ ] **Step 4: Run the focused API tests and verify they pass**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts -t "organization update"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/identity/authentication/auth.ts apps/api/src/domains/identity/authentication/authentication.test.ts
git commit -m "feat: validate organization updates"
```

## Task 3: Build The Organization Settings Page

> **Frontend craft handoff:** Before implementing this task, use `$impeccable craft` to shape the settings page UI. Keep the result consistent with the existing work-focused app shell, avoid generic card-heavy settings-page tropes, and preserve the scoped functionality in this plan.

**Files:**

- Create: `apps/app/src/features/organizations/organization-settings-page.tsx`
- Create: `apps/app/src/features/organizations/organization-settings-page.test.tsx`
- Create: `apps/app/src/features/organizations/organization-settings-schemas.ts`

- [ ] **Step 1: Write failing page tests**

Create `apps/app/src/features/organizations/organization-settings-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationSettingsPage } from "./organization-settings-page";

const { mockedUpdateOrganization, mockedInvalidate } = vi.hoisted(() => ({
  mockedUpdateOrganization: vi.fn<
    (input: { data: { name: string }; organizationId: string }) => Promise<{
      data: { id: string; name: string; slug: string } | null;
      error: { message: string; status: number; statusText: string } | null;
    }>
  >(),
  mockedInvalidate: vi.fn<() => Promise<void>>(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      update: mockedUpdateOrganization,
    },
  } as unknown as typeof AuthClient,
}));

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => ({
      invalidate: mockedInvalidate,
    }),
  };
});

describe("organization settings page", () => {
  beforeEach(() => {
    mockedUpdateOrganization.mockResolvedValue({
      data: {
        id: "org_123",
        name: "Northwind Field Ops",
        slug: "acme-field-ops",
      },
      error: null,
    });
    mockedInvalidate.mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders editable name and read-only slug for the active organization", () => {
    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Organization settings" })
    ).toBeVisible();
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Acme Field Ops"
    );
    expect(screen.getByText("acme-field-ops")).toBeVisible();
  });

  it("updates the organization name and refreshes route data", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedUpdateOrganization).toHaveBeenCalledWith({
        data: {
          name: "Northwind",
        },
        organizationId: "org_123",
      });
    });
    await waitFor(() => {
      expect(mockedInvalidate).toHaveBeenCalledTimes(1);
    });
    await expect(
      screen.findByText("Organization updated.")
    ).resolves.toBeVisible();
  });

  it("shows a safe error when the update fails", async () => {
    mockedUpdateOrganization.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await expect(
      screen.findByText(
        "We couldn't update the organization. Please try again."
      )
    ).resolves.toBeVisible();
  });
});
```

- [ ] **Step 2: Run the focused page test and verify it fails**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-settings-page.test.tsx
```

Expected: FAIL because the page component does not exist.

- [ ] **Step 3: Implement the page component**

Create `apps/app/src/features/organizations/organization-settings-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { authClient } from "#/lib/auth-client";

import type { OrganizationSummary } from "./organization-access";
import {
  decodeUpdateOrganizationInput,
  organizationSettingsSchema,
} from "./organization-settings-schemas";

const UPDATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't update the organization. Please try again.";

export function OrganizationSettingsPage({
  organization,
}: {
  readonly organization: OrganizationSummary;
}) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  );

  const form = useForm({
    defaultValues: {
      name: organization.name,
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationSettingsSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });
      setSuccessMessage(null);

      const input = decodeUpdateOrganizationInput(value);
      const result = await authClient.organization.update({
        data: {
          name: input.name,
        },
        organizationId: organization.id,
      });

      if (result.error || !result.data) {
        formApi.setErrorMap({
          onSubmit: {
            form: UPDATE_ORGANIZATION_FAILURE_MESSAGE,
            fields: {},
          },
        });
        return;
      }

      formApi.reset({
        name: result.data.name,
      });
      setSuccessMessage("Organization updated.");
      await router.invalidate();
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow="Organization"
        title="Organization settings"
        description="Keep the workspace name current for everyone on the team."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(18rem,0.45fr)]">
        <AppUtilityPanel
          title="General"
          description="Update the display name your team sees throughout Ceird."
          className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
        >
          <form
            className="flex max-w-xl flex-col gap-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="name">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Organization name"
                      htmlFor="organization-name"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="organization-name"
                        name={field.name}
                        autoComplete="organization"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                    </AuthFormField>
                  );
                }}
              </form.Field>
            </FieldGroup>

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(error) =>
                getFormErrorText(error) ? (
                  <FieldError>{getFormErrorText(error)}</FieldError>
                ) : null
              }
            </form.Subscribe>

            {successMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                {successMessage}
              </p>
            ) : null}

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save changes"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </AppUtilityPanel>

        <AppUtilityPanel
          title="Slug"
          description="This identifier is kept stable for now."
        >
          <p className="break-all rounded-md border border-border/70 bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
            {organization.slug}
          </p>
        </AppUtilityPanel>
      </div>
    </div>
  );
}
```

Create `apps/app/src/features/organizations/organization-settings-schemas.ts`:

```ts
export {
  UpdateOrganizationInputSchema as organizationSettingsSchema,
  decodeUpdateOrganizationInput,
} from "@ceird/identity-core";
export type { UpdateOrganizationInput } from "@ceird/identity-core";
```

- [ ] **Step 4: Run the focused page test and verify it passes**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-settings-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/organizations/organization-settings-page.tsx apps/app/src/features/organizations/organization-settings-page.test.tsx apps/app/src/features/organizations/organization-settings-schemas.ts
git commit -m "feat: add organization settings page"
```

## Task 4: Add Route And Account Dropdown Entry

> **Frontend craft handoff:** Before implementing the account dropdown change, use `$impeccable craft` for the interaction and menu composition details. The Settings entry should feel native to the existing account menu and sit near `Sign out`.

**Files:**

- Create: `apps/app/src/routes/_app._org.settings.tsx`
- Modify: `apps/app/src/components/nav-user.tsx`
- Modify: `apps/app/src/components/nav-user.test.tsx`

- [ ] **Step 1: Write failing account-menu coverage**

Update the router mock in `apps/app/src/components/nav-user.test.tsx`:

```tsx
import { isValidElement } from "react";
import type { ComponentProps, MouseEventHandler, ReactNode } from "react";

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: ComponentProps<"a"> & { to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
  };
});
```

Update the `DropdownMenuItem` test mock so it can render menu links:

```tsx
DropdownMenuItem: (({
  children,
  onSelect,
  render: renderSlot,
  ...props
}: {
  children?: ReactNode;
  onSelect?: (event: Event) => void | Promise<void>;
  render?: ReactNode;
  disabled?: boolean;
}) => {
  if (isValidElement<{ href?: string; to?: string }>(renderSlot)) {
    const href = renderSlot.props.to ?? renderSlot.props.href;

    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      {...props}
      onClick={() => {
        const event = new Event("select", {
          cancelable: true,
        });

        void onSelect?.(event);
      }}
    >
      {children}
    </button>
  );
}) as typeof actual.DropdownMenuItem,
```

Add this test to `apps/app/src/components/nav-user.test.tsx`:

```tsx
it("links to organization settings from the account menu", () => {
  renderNavUser();

  expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
    "href",
    "/settings"
  );
});
```

- [ ] **Step 2: Run the focused account-menu test and verify it fails**

Run:

```bash
pnpm --filter app test -- src/components/nav-user.test.tsx -t "organization settings"
```

Expected: FAIL because the Settings menu item is not present.

- [ ] **Step 3: Add the settings route**

Create `apps/app/src/routes/_app._org.settings.tsx`:

```tsx
import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { requireOrganizationAdministrationAccess } from "#/features/organizations/organization-access";
import { OrganizationSettingsPage } from "#/features/organizations/organization-settings-page";

export const Route = createFileRoute("/_app/_org/settings")({
  staticData: {
    breadcrumb: {
      label: "Settings",
      to: "/settings",
    },
  },
  beforeLoad: async () => {
    await requireOrganizationAdministrationAccess();
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  return <OrganizationSettingsPage organization={activeOrganization} />;
}
```

- [ ] **Step 4: Add account dropdown navigation**

Update imports in `apps/app/src/components/nav-user.tsx`:

```ts
import {
  LogoutIcon,
  Settings02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
```

Add this menu item before the separator that precedes `Sign out`:

```tsx
<DropdownMenuGroup>
  <DropdownMenuItem render={<Link to="/settings" />}>
    <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
    Settings
  </DropdownMenuItem>
</DropdownMenuGroup>
<DropdownMenuSeparator />
```

- [ ] **Step 5: Run the focused account-menu test and app typecheck**

Run:

```bash
pnpm --filter app test -- src/components/nav-user.test.tsx
pnpm --filter app check-types
```

Expected: PASS. If the TanStack Router generator updates `apps/app/src/routeTree.gen.ts`, include that generated change.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/routes/_app._org.settings.tsx apps/app/src/components/nav-user.tsx apps/app/src/components/nav-user.test.tsx apps/app/src/routeTree.gen.ts
git commit -m "feat: route organization settings from account menu"
```

## Task 5: Add End-To-End Coverage

**Files:**

- Create: `apps/app/e2e/organization-settings.test.ts`

- [ ] **Step 1: Write the e2e test**

Create `apps/app/e2e/organization-settings.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CreateOrganizationPage } from "./pages/create-organization-page";
import { LoginPage } from "./pages/login-page";
import { SignupPage } from "./pages/signup-page";

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function createTestSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function openSettingsFromAccountMenu(page: Page) {
  await page.getByRole("button", { name: /settings owner/i }).click();
  await page.getByRole("link", { name: "Settings" }).click();
}

test("an organization admin can update the organization name", async ({
  page,
}) => {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const loginPage = new LoginPage(page);
  const email = createTestEmail("org-settings");
  const password = "password123";

  await signupPage.goto();
  await signupPage.name.fill("Settings Owner");
  await signupPage.email.fill(email);
  await signupPage.password.fill(password);
  await signupPage.confirmPassword.fill(password);
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill("Acme Field Ops");
  await createOrganizationPage.slug.fill(createTestSlug("acme-field-ops"));
  await createOrganizationPage.submit.click();

  await openSettingsFromAccountMenu(page);
  await expect(
    page.getByRole("heading", { name: "Organization settings" })
  ).toBeVisible();
  await page.getByLabel("Organization name").fill("Northwind Field Ops");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Organization updated.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Organization name")).toHaveValue(
    "Northwind Field Ops"
  );

  await page.getByRole("button", { name: /settings owner/i }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await loginPage.goto();
  await loginPage.email.fill(email);
  await loginPage.password.fill(password);
  await loginPage.submit.click();
  await openSettingsFromAccountMenu(page);
  await expect(page.getByLabel("Organization name")).toHaveValue(
    "Northwind Field Ops"
  );
});
```

- [ ] **Step 2: Boot the sandbox for the worktree**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Expected: app, api, and Postgres endpoints are printed for this worktree.

- [ ] **Step 3: Run the focused e2e test**

Run:

```bash
pnpm --filter app e2e -- organization-settings.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/app/e2e/organization-settings.test.ts
git commit -m "test: cover organization settings"
```

## Task 6: Final Verification

**Files:**

- Verify all changed files.

- [ ] **Step 1: Run package checks**

Run:

```bash
pnpm --filter @ceird/identity-core test
pnpm --filter api test
pnpm --filter app test
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 2: Run focused e2e again**

Run:

```bash
pnpm --filter app e2e -- organization-settings.test.ts
```

Expected: PASS.

- [ ] **Step 3: Review the diff**

Run:

```bash
git diff --stat HEAD
git diff HEAD -- packages/identity-core/src/index.ts apps/api/src/domains/identity/authentication/auth.ts apps/app/src/features/organizations/organization-settings-page.tsx apps/app/src/routes/_app._org.settings.tsx apps/app/src/components/nav-user.tsx
```

Expected:

- no unrelated files changed
- no slug mutation UI or API behavior added
- organization name validation uses `@ceird/identity-core`
- settings route is admin-gated with `requireOrganizationAdministrationAccess`

- [ ] **Step 4: Commit generated route tree changes if present**

If final verification produced a route tree change, commit it:

```bash
git add apps/app/src/routeTree.gen.ts
git commit -m "chore: finish organization settings"
```

Skip this commit if there are no remaining changes.

## Self-Review Notes

- Spec coverage: the plan creates a page where organization details can start growing, supports editing the organization name, displays the slug, and keeps slug mutation out of scope for now.
- Placeholder scan: no `TBD`, `TODO`, or unspecified validation steps remain.
- Type consistency: `OrganizationSummary`, `UpdateOrganizationInputSchema`, and `authClient.organization.update` are used consistently across tasks.
