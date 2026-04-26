# User Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a lightweight authenticated settings page where users can update their display name, avatar image URL, email address, and password using Better Auth's built-in user account APIs.

**Architecture:** Put the settings page directly under the authenticated `/_app` route, not under `/_app/_org`, so account settings remain available even when organization access is incomplete. Use Better Auth client methods from `apps/app/src/lib/auth-client.ts` for mutations, and only change the API auth config to enable Better Auth's verified email-change flow. Keep validation at the app boundary with Effect `Schema`, matching the existing auth form pattern.

**Tech Stack:** TanStack Router, TanStack Form, Effect Schema, Better Auth 1.5.6, Vitest, Testing Library, existing shadcn-style UI primitives.

**Docs Checked:** Better Auth User & Accounts docs confirm `authClient.updateUser({ name, image })`, `authClient.changeEmail({ newEmail, callbackURL })`, and `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })`. Email change requires `user.changeEmail.enabled: true`; with the existing `emailVerification.sendVerificationEmail`, Better Auth verifies the new address before updating the user email.

**Frontend Craft Handoff:** When implementing the settings page UI in Task 4, invoke `impeccable craft` first. The settings page should feel like a polished product surface, but the entry point belongs in the existing user dropdown beside Sign out, not in the primary sidebar navigation.

---

## File Structure

- Modify: `apps/api/src/domains/identity/authentication/config.ts`
  - Add `user.changeEmail.enabled: true` to `AuthenticationConfig` and `makeAuthenticationConfig()`.
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`
  - Assert the Better Auth config exposes email change support.
- Modify: `apps/app/src/lib/auth-client.ts`
  - Add `buildEmailChangeRedirectTo(origin)` so the page can return to `/settings?emailChange=verified` after Better Auth verifies the new email.
- Modify: `apps/app/src/lib/auth-client.test.ts`
  - Cover the new redirect URL builder.
- Create: `apps/app/src/features/settings/user-settings-schemas.ts`
  - Define Effect schemas and decoders for profile, email, and password forms.
- Create: `apps/app/src/features/settings/user-settings-schemas.test.ts`
  - Cover trimming, email validation, optional image handling, and password confirmation.
- Create: `apps/app/src/features/settings/user-settings-page.tsx`
  - Render the settings UI and call `authClient.updateUser`, `authClient.changeEmail`, and `authClient.changePassword`.
- Create: `apps/app/src/features/settings/user-settings-page.test.tsx`
  - Cover successful profile updates, verified email-change requests, same-email rejection, password changes, and API failures.
- Create: `apps/app/src/routes/_app.settings.tsx`
  - Register `/settings` as an authenticated route with a breadcrumb.
- Modify: `apps/app/src/components/nav-user.tsx`
  - Add a Settings dropdown item in the same user menu group as Sign out.
- Modify: `apps/app/src/components/nav-user.test.tsx`
  - Assert the user dropdown exposes the Settings navigation item.
- Modify: `apps/app/src/routeTree.gen.ts`
  - Accept the generated TanStack Router route tree change after adding `apps/app/src/routes/_app.settings.tsx`.

---

### Task 1: Enable Better Auth Email Changes

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/config.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`

- [x] **Step 1: Write the failing config assertion**

In `apps/api/src/domains/identity/authentication/authentication.test.ts`, extend the `makeAuthenticationConfig()` expected object in `builds the minimal Better Auth configuration for email/password auth`:

```ts
expect(config).toMatchObject({
  user: {
    changeEmail: {
      enabled: true,
    },
  },
});
```

Add a focused test beneath the resend verification rate-limit test:

```ts
it("enables Better Auth's verified email change flow", () => {
  const config = makeAuthenticationConfig({
    baseUrl: "http://127.0.0.1:3001",
    secret: "super-secret-value",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
  });

  expect(config.user.changeEmail).toStrictEqual({
    enabled: true,
  });
}, 10_000);
```

- [x] **Step 2: Run the API auth test and verify it fails**

Run:

```bash
pnpm --dir apps/api test src/domains/identity/authentication/authentication.test.ts
```

Expected: FAIL because `AuthenticationConfig` does not define `user` yet.

- [x] **Step 3: Add Better Auth user config**

In `apps/api/src/domains/identity/authentication/config.ts`, add this to `AuthenticationConfig`:

```ts
readonly user: {
  readonly changeEmail: {
    readonly enabled: true;
  };
};
```

Add this to the object returned by `makeAuthenticationConfig()`:

```ts
user: {
  changeEmail: {
    enabled: true,
  },
},
```

Do not add `updateEmailWithoutVerification`; keep the default verified-email behavior.

- [x] **Step 4: Run the API auth test and verify it passes**

Run:

```bash
pnpm --dir apps/api test src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/domains/identity/authentication/config.ts apps/api/src/domains/identity/authentication/authentication.test.ts
git commit -m "feat: enable verified email changes"
```

---

### Task 2: Add Settings Form Schemas

**Files:**

- Create: `apps/app/src/features/settings/user-settings-schemas.ts`
- Create: `apps/app/src/features/settings/user-settings-schemas.test.ts`

- [x] **Step 1: Write schema tests**

Create `apps/app/src/features/settings/user-settings-schemas.test.ts`:

```ts
import {
  decodeChangeEmailInput,
  decodeChangePasswordInput,
  decodeProfileSettingsInput,
} from "./user-settings-schemas";

describe("user settings schemas", () => {
  it("trims profile names and converts an empty image URL to null", () => {
    expect(
      decodeProfileSettingsInput({
        name: "  Taylor Example  ",
        image: "   ",
      })
    ).toStrictEqual({
      name: "Taylor Example",
      image: null,
    });
  });

  it("accepts an http avatar image URL", () => {
    expect(
      decodeProfileSettingsInput({
        name: "Taylor Example",
        image: "https://example.com/avatar.png",
      })
    ).toStrictEqual({
      name: "Taylor Example",
      image: "https://example.com/avatar.png",
    });
  });

  it("rejects short profile names", () => {
    expect(() =>
      decodeProfileSettingsInput({
        name: "T",
        image: "",
      })
    ).toThrow(/at least 2/i);
  });

  it("normalizes change email input", () => {
    expect(
      decodeChangeEmailInput({
        email: "  new@example.com  ",
      })
    ).toStrictEqual({
      email: "new@example.com",
    });
  });

  it("rejects invalid change email input", () => {
    expect(() =>
      decodeChangeEmailInput({
        email: "not-an-email",
      })
    ).toThrow(/valid email/i);
  });

  it("accepts matching password changes", () => {
    expect(
      decodeChangePasswordInput({
        currentPassword: "old-password",
        newPassword: "new-password",
        confirmPassword: "new-password",
      })
    ).toStrictEqual({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "new-password",
    });
  });

  it("rejects mismatched password confirmation", () => {
    expect(() =>
      decodeChangePasswordInput({
        currentPassword: "old-password",
        newPassword: "new-password",
        confirmPassword: "different-password",
      })
    ).toThrow(/passwords must match/i);
  });
});
```

- [x] **Step 2: Run schema tests and verify they fail**

Run:

```bash
pnpm --dir apps/app test src/features/settings/user-settings-schemas.test.ts
```

Expected: FAIL because `user-settings-schemas.ts` does not exist.

- [x] **Step 3: Implement settings schemas**

Create `apps/app/src/features/settings/user-settings-schemas.ts`:

```ts
import { ParseResult, Schema } from "effect";

const Email = Schema.Trim.pipe(
  Schema.nonEmptyString({
    message: () => "Enter a valid email address",
  }),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: () => "Enter a valid email address",
  })
);

const Password = Schema.Trim.pipe(
  Schema.minLength(8, {
    message: () => "Use 8 or more characters",
  })
);

const Name = Schema.Trim.pipe(
  Schema.minLength(2, {
    message: () => "Use at least 2 characters",
  })
);

const ImageUrl = Schema.transform(Schema.Trim, Schema.NullOr(Schema.String), {
  strict: true,
  decode: (value) => (value.length === 0 ? null : value),
  encode: (value) => value ?? "",
}).pipe(
  Schema.filter(
    (value) => {
      if (value === null) {
        return true;
      }

      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    {
      message: () => "Enter a valid http or https image URL",
    }
  )
);

const ProfileSettingsInput = Schema.Struct({
  name: Name,
  image: ImageUrl,
});

const ChangeEmailInput = Schema.Struct({
  email: Email,
});

const ChangePasswordInput = Schema.Struct({
  currentPassword: Password,
  newPassword: Password,
  confirmPassword: Password,
}).pipe(
  Schema.filter((input) => input.newPassword === input.confirmPassword, {
    message: () => "Passwords must match",
  })
);

export type ProfileSettingsInput = typeof ProfileSettingsInput.Type;
export type ChangeEmailInput = typeof ChangeEmailInput.Type;
export type ChangePasswordInput = typeof ChangePasswordInput.Type;

export const profileSettingsSchema = ProfileSettingsInput;
export const changeEmailSchema = ChangeEmailInput;
export const changePasswordSchema = ChangePasswordInput;

export function decodeProfileSettingsInput(
  input: unknown
): ProfileSettingsInput {
  return ParseResult.decodeUnknownSync(ProfileSettingsInput)(input);
}

export function decodeChangeEmailInput(input: unknown): ChangeEmailInput {
  return ParseResult.decodeUnknownSync(ChangeEmailInput)(input);
}

export function decodeChangePasswordInput(input: unknown): ChangePasswordInput {
  return ParseResult.decodeUnknownSync(ChangePasswordInput)(input);
}
```

- [x] **Step 4: Run schema tests and verify they pass**

Run:

```bash
pnpm --dir apps/app test src/features/settings/user-settings-schemas.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/app/src/features/settings/user-settings-schemas.ts apps/app/src/features/settings/user-settings-schemas.test.ts
git commit -m "feat: add user settings schemas"
```

---

### Task 3: Add Email Change Redirect Builder

**Files:**

- Modify: `apps/app/src/lib/auth-client.ts`
- Modify: `apps/app/src/lib/auth-client.test.ts`

- [x] **Step 1: Write the failing redirect builder test**

In `apps/app/src/lib/auth-client.test.ts`, import `buildEmailChangeRedirectTo` and add:

```ts
it("builds the email change callback URL for the settings page", () => {
  expect(buildEmailChangeRedirectTo("http://localhost:3000")).toBe(
    "http://localhost:3000/settings?emailChange=verified"
  );
});
```

- [x] **Step 2: Run the auth client test and verify it fails**

Run:

```bash
pnpm --dir apps/app test src/lib/auth-client.test.ts
```

Expected: FAIL because `buildEmailChangeRedirectTo` is not exported.

- [x] **Step 3: Implement the redirect builder**

In `apps/app/src/lib/auth-client.ts`, add:

```ts
export function buildEmailChangeRedirectTo(origin: string): string {
  const redirectURL = new URL("/settings", origin);
  redirectURL.searchParams.set("emailChange", "verified");

  return redirectURL.toString();
}
```

- [x] **Step 4: Run the auth client test and verify it passes**

Run:

```bash
pnpm --dir apps/app test src/lib/auth-client.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/app/src/lib/auth-client.ts apps/app/src/lib/auth-client.test.ts
git commit -m "feat: add email change redirect helper"
```

---

### Task 4: Build the User Settings Page

**Files:**

- Create: `apps/app/src/features/settings/user-settings-page.tsx`
- Create: `apps/app/src/features/settings/user-settings-page.test.tsx`

- [x] **Step 0: Invoke the frontend craft skill**

Before implementing this page, invoke:

```txt
impeccable craft user settings page
```

Follow the skill's context rules. If `.impeccable.md` does not already contain the required design context, run `impeccable teach` before designing the page. Keep the page consistent with the existing app shell, but use the skill to refine spacing, hierarchy, form grouping, feedback states, and mobile behavior so the page feels intentionally crafted rather than a generic account form.

- [x] **Step 1: Write page tests**

Create `apps/app/src/features/settings/user-settings-page.test.tsx` with tests that mock `#/lib/auth-client` and assert:

```ts
expect(mockedUpdateUser).toHaveBeenCalledWith({
  name: "Taylor Updated",
  image: null,
});

expect(mockedChangeEmail).toHaveBeenCalledWith({
  newEmail: "new@example.com",
  callbackURL: "http://localhost:3000/settings?emailChange=verified",
});

expect(mockedChangePassword).toHaveBeenCalledWith({
  currentPassword: "old-password",
  newPassword: "new-password",
  revokeOtherSessions: true,
});
```

Also cover:

```ts
expect(screen.getByText("Use a different email address.")).toBeInTheDocument();
expect(mockedChangeEmail).not.toHaveBeenCalled();
expect(mockedRouterInvalidate).toHaveBeenCalledOnce();
```

Use these default mocked Better Auth responses:

```ts
mockedUpdateUser.mockResolvedValue({ data: { ok: true }, error: null });
mockedChangeEmail.mockResolvedValue({ data: { ok: true }, error: null });
mockedChangePassword.mockResolvedValue({ data: { ok: true }, error: null });
```

- [x] **Step 2: Run page tests and verify they fail**

Run:

```bash
pnpm --dir apps/app test src/features/settings/user-settings-page.test.tsx
```

Expected: FAIL because `user-settings-page.tsx` does not exist.

- [x] **Step 3: Implement the page component**

Create `apps/app/src/features/settings/user-settings-page.tsx` with:

```tsx
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getErrorText } from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { authClient, buildEmailChangeRedirectTo } from "#/lib/auth-client";

import {
  changeEmailSchema,
  changePasswordSchema,
  decodeChangeEmailInput,
  decodeChangePasswordInput,
  decodeProfileSettingsInput,
  profileSettingsSchema,
} from "./user-settings-schemas";

export interface UserSettingsAccount {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly image?: string | null;
  readonly name: string;
}

function getSettingsFailureMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return "We couldn't save that change. Please try again.";
}

export function UserSettingsPage({
  user,
  emailChangeStatus,
}: {
  readonly user: UserSettingsAccount;
  readonly emailChangeStatus?: string | undefined;
}) {
  const router = useRouter();
  const [profileMessage, setProfileMessage] = React.useState<string | null>(
    null
  );
  const [emailMessage, setEmailMessage] = React.useState<string | null>(
    emailChangeStatus === "verified"
      ? "Your email address has been updated."
      : null
  );
  const [passwordMessage, setPasswordMessage] = React.useState<string | null>(
    null
  );

  const profileForm = useForm({
    defaultValues: {
      name: user.name,
      image: user.image ?? "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(profileSettingsSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      setProfileMessage(null);

      const input = decodeProfileSettingsInput(value);
      const result = await authClient.updateUser({
        name: input.name,
        image: input.image,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getSettingsFailureMessage(result.error),
            fields: {},
          },
        });
        return;
      }

      setProfileMessage("Profile updated.");
      await router.invalidate();
    },
  });

  const emailForm = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(changeEmailSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      setEmailMessage(null);

      const input = decodeChangeEmailInput(value);
      if (input.email.toLowerCase() === user.email.toLowerCase()) {
        formApi.setErrorMap({
          onSubmit: {
            form: "Use a different email address.",
            fields: {},
          },
        });
        return;
      }

      const result = await authClient.changeEmail({
        newEmail: input.email,
        callbackURL: buildEmailChangeRedirectTo(window.location.origin),
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getSettingsFailureMessage(result.error),
            fields: {},
          },
        });
        return;
      }

      formApi.reset();
      setEmailMessage("Check the new email address to confirm this change.");
    },
  });

  const passwordForm = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(changePasswordSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      setPasswordMessage(null);

      const input = decodeChangePasswordInput(value);
      const result = await authClient.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getSettingsFailureMessage(result.error),
            fields: {},
          },
        });
        return;
      }

      formApi.reset();
      setPasswordMessage("Password updated.");
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow="Account"
        title="Settings"
        description="Update the account details Task Tracker uses for sign in, invitations, and recovery."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AppUtilityPanel title="Profile">
          <form aria-label="Profile settings" noValidate>
            <FieldGroup>
              <AuthFormField label="Display name" htmlFor="settings-name">
                <Input id="settings-name" name="name" autoComplete="name" />
              </AuthFormField>
              <AuthFormField label="Avatar image URL" htmlFor="settings-image">
                <Input
                  id="settings-image"
                  name="image"
                  type="url"
                  autoComplete="url"
                />
              </AuthFormField>
            </FieldGroup>
            <Button type="submit">Save profile</Button>
          </form>
        </AppUtilityPanel>

        <AppUtilityPanel title="Email">
          <p className="text-sm text-muted-foreground">
            Current email: {user.email}
          </p>
          <form aria-label="Email settings" noValidate>
            <FieldGroup>
              <AuthFormField label="New email" htmlFor="settings-email">
                <Input
                  id="settings-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                />
              </AuthFormField>
            </FieldGroup>
            <Button type="submit">Send verification email</Button>
          </form>
        </AppUtilityPanel>

        <AppUtilityPanel title="Password">
          <form aria-label="Password settings" noValidate>
            <FieldGroup>
              <AuthFormField
                label="Current password"
                htmlFor="settings-current-password"
              >
                <Input
                  id="settings-current-password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                />
              </AuthFormField>
              <AuthFormField
                label="New password"
                htmlFor="settings-new-password"
              >
                <Input
                  id="settings-new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                />
              </AuthFormField>
              <AuthFormField
                label="Confirm new password"
                htmlFor="settings-confirm-password"
              >
                <Input
                  id="settings-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                />
              </AuthFormField>
            </FieldGroup>
            <Button type="submit">Update password</Button>
          </form>
        </AppUtilityPanel>
      </div>
    </div>
  );
}
```

Wire the forms in that JSX to `profileForm`, `emailForm`, and `passwordForm` using the same field pattern as `OrganizationMembersPage`: `form.Field`, `AuthFormField`, `Input`, `FieldGroup`, form-level `FieldError`, and a submit `Button` wrapped in `form.Subscribe`. Preserve these user-visible labels:

```txt
Page wrapper: className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8"
Header: <AppPageHeader eyebrow="Account" title="Settings" description="Update the account details Task Tracker uses for sign in, invitations, and recovery." />
Grid: className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
Panel 1 title: Profile
Panel 1 fields: Display name, Avatar image URL
Panel 1 submit: Save profile
Panel 2 title: Email
Panel 2 static text: Current email
Panel 2 field: New email
Panel 2 submit: Send verification email
Panel 3 title: Password
Panel 3 fields: Current password, New password, Confirm new password
Panel 3 submit: Update password
```

Render `profileMessage`, `emailMessage`, and `passwordMessage` as `<p role="status" className="text-sm text-muted-foreground">`.

- [x] **Step 4: Run page tests and verify they pass**

Run:

```bash
pnpm --dir apps/app test src/features/settings/user-settings-page.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/app/src/features/settings/user-settings-page.tsx apps/app/src/features/settings/user-settings-page.test.tsx
git commit -m "feat: add user settings page"
```

---

### Task 5: Register Route and Navigation

**Files:**

- Create: `apps/app/src/routes/_app.settings.tsx`
- Modify: `apps/app/src/components/nav-user.tsx`
- Modify: `apps/app/src/components/nav-user.test.tsx`
- Modify: `apps/app/src/routeTree.gen.ts`

- [x] **Step 1: Write user dropdown test**

In `apps/app/src/components/nav-user.test.tsx`, mock TanStack Router's `Link` so the dropdown item can render as an anchor:

```tsx
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

Update the `DropdownMenuItem` test double to honor its `render` slot:

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
    return (
      <a href={renderSlot.props.to ?? renderSlot.props.href} {...props}>
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

Add a test that verifies Settings appears in the same dropdown menu as Sign out:

```tsx
it(
  "links to settings from the user dropdown",
  {
    timeout: 10_000,
  },
  () => {
    renderNavUser();

    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings"
    );
    expect(
      screen.getByRole("button", {
        name: /sign out/i,
      })
    ).toBeInTheDocument();
  }
);
```

- [x] **Step 2: Run user dropdown test and verify it fails**

Run:

```bash
pnpm --dir apps/app test src/components/nav-user.test.tsx
```

Expected: FAIL because Settings is not in the user dropdown yet.

- [x] **Step 3: Create the authenticated settings route**

Create `apps/app/src/routes/_app.settings.tsx`:

```tsx
import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { UserSettingsPage } from "#/features/settings/user-settings-page";

export const Route = createFileRoute("/_app/settings")({
  staticData: {
    breadcrumb: {
      label: "Settings",
      to: "/settings",
    },
  },
  validateSearch: (search: Record<string, unknown>) => ({
    emailChange: search.emailChange === "verified" ? "verified" : undefined,
  }),
  component: SettingsRouteComponent,
});

function SettingsRouteComponent() {
  const { session } = useRouteContext({ from: "/_app" });
  const { emailChange } = Route.useSearch();

  return (
    <UserSettingsPage user={session.user} emailChangeStatus={emailChange} />
  );
}
```

- [x] **Step 4: Add Settings to the user dropdown**

In `apps/app/src/components/nav-user.tsx`, import `Link` from TanStack Router and a settings icon:

```ts
import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
```

Keep passing the existing `navigate` prop into `NavUser` for sign-out navigation. Add this `DropdownMenuItem` before Sign out in the existing dropdown group that currently contains Sign out:

```tsx
<DropdownMenuItem render={<Link to="/settings" />}>
  <SettingsIcon className="size-4" aria-hidden="true" />
  Settings
</DropdownMenuItem>
```

Do not add Settings to `data.navMain` in `apps/app/src/components/app-sidebar.tsx`.

- [x] **Step 5: Generate the route tree**

Run:

```bash
pnpm --dir apps/app build
```

Expected: PASS and `apps/app/src/routeTree.gen.ts` includes the settings route.

- [x] **Step 6: Run user dropdown test and verify it passes**

Run:

```bash
pnpm --dir apps/app test src/components/nav-user.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add apps/app/src/routes/_app.settings.tsx apps/app/src/components/nav-user.tsx apps/app/src/components/nav-user.test.tsx apps/app/src/routeTree.gen.ts
git commit -m "feat: route user settings"
```

---

### Task 6: Verify the Settings Flow

**Files:**

- No new files. This task verifies the full feature.

- [x] **Step 1: Run focused app tests**

Run:

```bash
pnpm --dir apps/app test src/features/settings/user-settings-schemas.test.ts src/features/settings/user-settings-page.test.tsx src/lib/auth-client.test.ts src/components/nav-user.test.tsx
```

Expected: PASS.

- [x] **Step 2: Run focused API tests**

Run:

```bash
pnpm --dir apps/api test src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS.

- [x] **Step 3: Run type checks**

Run:

```bash
pnpm check-types
```

Expected: PASS.

- [x] **Step 4: Run lint/check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [x] **Step 5: Smoke test in the sandbox**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Open the app URL, sign in, open the user dropdown, choose Settings, update the display name, and confirm the user dropdown shows the new name after the save completes. Change email should show "Check the new email address to confirm this change." without immediately changing the displayed current email.

- [x] **Step 6: Commit verification fixes if needed**

If verification exposes small fixes, commit them:

```bash
git add apps/api/src/domains/identity/authentication/config.ts apps/api/src/domains/identity/authentication/authentication.test.ts apps/app/src/lib/auth-client.ts apps/app/src/lib/auth-client.test.ts apps/app/src/features/settings apps/app/src/routes/_app.settings.tsx apps/app/src/components/nav-user.tsx apps/app/src/components/nav-user.test.tsx apps/app/src/routeTree.gen.ts
git commit -m "test: verify user settings"
```

If there are no fixes, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan covers editable name, avatar image URL, email address with verification, password change, a user-dropdown Settings entry point, and an explicit `impeccable craft` handoff for frontend implementation. It intentionally excludes account deletion, 2FA, sessions management, and custom user fields because the request asked for a lightweight page using what Better Auth already allows easily.
- Placeholder scan: The implementation tasks name exact files, commands, expected outcomes, and the user-visible labels for the page. The only large UI JSX is summarized by an existing local pattern, with exact required fields and messages.
- Type consistency: The plan uses `ProfileSettingsInput`, `ChangeEmailInput`, `ChangePasswordInput`, `UserSettingsPage`, `buildEmailChangeRedirectTo`, `NavUser`, and Better Auth client method names consistently across tasks.
