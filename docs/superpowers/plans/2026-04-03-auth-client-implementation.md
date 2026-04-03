# Auth Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build native Better Auth login and sign-up flows in `apps/app`, add page-object-based e2e coverage for those flows, and capture the next auth milestones in a high-level follow-up doc.

**Architecture:** Keep the API contract native to Better Auth at `/api/auth/*` and add a thin Better Auth client module in the app. Split the current root layout into a document shell plus a pathless app-shell route so `/login` and `/signup` can render outside the sidebar chrome. Use TanStack Form for state, `Effect/Schema` for validation, and only a very small shadcn-friendly field abstraction for reuse. Add Playwright e2e coverage with explicit page objects for login and sign-up flows, then write a short auth roadmap doc covering the next major milestones after this slice.

**Tech Stack:** TanStack Start, TanStack Router, Better Auth React client, TanStack Form, Effect Schema, Vitest, Testing Library, Playwright, shadcn registry blocks/components

---

## File Structure

**Create:**

- `apps/app/vitest.config.ts` — jsdom test config for component and route tests
- `apps/app/src/test/setup.ts` — Testing Library setup and DOM matchers
- `apps/app/src/lib/auth-client.ts` — shared Better Auth React client
- `apps/app/src/features/auth/auth-schemas.ts` — `Effect/Schema` login and sign-up validators
- `apps/app/src/features/auth/auth-schema.test.ts` — validation tests for both auth forms
- `apps/app/src/features/auth/redirect-if-authenticated.ts` — shared session-aware route guard
- `apps/app/src/features/auth/redirect-if-authenticated.test.ts` — unit tests for the session-aware route guard
- `apps/app/src/features/auth/auth-form-field.tsx` — tiny TanStack Form to shadcn `Field` adapter
- `apps/app/src/features/auth/auth-form-field.test.tsx` — unit tests for shadcn field composition
- `apps/app/src/features/auth/login-page.tsx` — reusable login page component outside the route module
- `apps/app/src/features/auth/login-page.test.tsx` — unit tests for the login page component
- `apps/app/src/features/auth/signup-page.tsx` — reusable sign-up page component outside the route module
- `apps/app/src/features/auth/signup-page.test.tsx` — unit tests for the sign-up page component
- `apps/app/src/components/app-layout.tsx` — shared app chrome layout extracted from the route file
- `apps/app/src/components/app-layout.test.tsx` — unit test for the app chrome layout
- `apps/app/src/routes/_app.tsx` — pathless layout route for sidebar/header app chrome
- `apps/app/src/routes/_app.index.tsx` — home route moved under the app shell
- `apps/app/src/routes/_app.about.tsx` — about route moved under the app shell
- `apps/app/src/routes/login.tsx` — standalone login route
- `apps/app/src/routes/signup.tsx` — standalone sign-up route
- `apps/app/playwright.config.ts` — Playwright config for local e2e runs
- `apps/app/e2e/pages/login-page.ts` — page object for the login screen
- `apps/app/e2e/pages/signup-page.ts` — page object for the sign-up screen
- `apps/app/e2e/auth.spec.ts` — auth e2e tests using the page objects
- `docs/architecture/auth-next-steps.md` — high-level follow-up roadmap for auth after login/sign-up

**Modify:**

- `apps/app/package.json` — add auth/form/test dependencies
- `apps/app/src/routes/__root.tsx` — keep only document shell providers and outlet
- `apps/app/src/components/app-sidebar.tsx` — update links after route move if current nav points at `/about`
- `apps/app/src/components/site-header.tsx` — update any hard-coded app links if needed

**Delete or replace during route move:**

- `apps/app/src/routes/index.tsx`
- `apps/app/src/routes/about.tsx`

## Task 1: Add Dependencies And Test Harness

**Files:**

- Modify: `apps/app/package.json`
- Create: `apps/app/vitest.config.ts`
- Create: `apps/app/src/test/setup.ts`

- [ ] **Step 1: Add the app dependencies**

Run:

```bash
pnpm --filter app add better-auth @tanstack/react-form effect
pnpm --filter app add -D @testing-library/jest-dom @testing-library/user-event
```

Expected: `apps/app/package.json` gains the new runtime and test dependencies without touching other workspace packages.

- [ ] **Step 2: Add Vitest config for jsdom tests**

Create `apps/app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 3: Add the test setup file**

Create `apps/app/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Run a smoke check for the harness**

Run:

```bash
pnpm --filter app exec vitest run --passWithNoTests
```

Expected: exit code `0`, confirming the test harness boots even before the first spec exists.

- [ ] **Step 5: Commit**

```bash
git add apps/app/package.json apps/app/vitest.config.ts apps/app/src/test/setup.ts
git commit -m "test(app): add auth testing harness"
```

## Task 1B: Add Playwright E2E Harness

**Files:**

- Modify: `apps/app/package.json`
- Create: `apps/app/playwright.config.ts`

- [ ] **Step 1: Add Playwright as a dev dependency**

Run:

```bash
pnpm --filter app add -D @playwright/test
```

Expected: `apps/app/package.json` gains the Playwright test runner only in the app workspace.

- [ ] **Step 2: Add the Playwright config**

Create `apps/app/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev:raw",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 3: Install the Playwright browser binary**

Run:

```bash
pnpm --filter app exec playwright install chromium
```

Expected: Chromium is installed for local e2e runs.

- [ ] **Step 4: Smoke-check the e2e harness**

Run:

```bash
pnpm --filter app exec playwright test --list --pass-with-no-tests
```

Expected: exit code `0`, confirming Playwright can boot even before the first spec exists.

- [ ] **Step 5: Commit**

```bash
git add apps/app/package.json apps/app/playwright.config.ts
git commit -m "test(app): add playwright harness"
```

## Task 2: Move The Sidebar Chrome Into A Pathless App Layout

**Files:**

- Modify: `apps/app/src/routes/__root.tsx`
- Create: `apps/app/src/components/app-layout.tsx`
- Create: `apps/app/src/components/app-layout.test.tsx`
- Create: `apps/app/src/routes/_app.tsx`
- Create: `apps/app/src/routes/_app.index.tsx`
- Create: `apps/app/src/routes/_app.about.tsx`
- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/components/site-header.tsx`
- Delete: `apps/app/src/routes/index.tsx`
- Delete: `apps/app/src/routes/about.tsx`

- [ ] **Step 1: Write the failing app-shell layout test**

Create `apps/app/src/components/app-layout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppLayout } from "./app-layout";

describe("AppLayout", () => {
  it("renders the shared app chrome", () => {
    render(<AppLayout />);

    expect(screen.getByText(/task tracker/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/components/app-layout.test.tsx
```

Expected: FAIL because `app-layout.tsx` does not exist yet.

- [ ] **Step 3: Write the minimal layout refactor**

Update `apps/app/src/routes/__root.tsx` so it keeps only the document shell:

```tsx
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans [overflow-wrap:anywhere] antialiased selection:bg-primary/20">
        <TooltipProvider>
          {children}
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
          <Scripts />
        </TooltipProvider>
      </body>
    </html>
  );
}
```

Create `apps/app/src/components/app-layout.tsx`:

```tsx
import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "#/components/app-sidebar";
import { SiteHeader } from "#/components/site-header";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";

export function AppLayout() {
  return (
    <SidebarProvider className="flex flex-col [--header-height:calc(--spacing(14))]">
      <SiteHeader />
      <div className="flex flex-1">
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
```

Create `apps/app/src/routes/_app.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
```

Move the current route components into:

```bash
git mv apps/app/src/routes/index.tsx apps/app/src/routes/_app.index.tsx
git mv apps/app/src/routes/about.tsx apps/app/src/routes/_app.about.tsx
```

Then update the route declarations in the moved files:

```tsx
// apps/app/src/routes/_app.index.tsx
export const Route = createFileRoute("/_app/")({
  component: App,
});
```

```tsx
// apps/app/src/routes/_app.about.tsx
export const Route = createFileRoute("/_app/about")({
  component: About,
});
```

- [ ] **Step 4: Run the route-layout test again**

Run:

```bash
pnpm --filter app exec vitest run src/components/app-layout.test.tsx
pnpm --filter app check-types
```

Expected: the app-shell test now passes, and TypeScript passes after the route move.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/routes/__root.tsx apps/app/src/components/app-layout.tsx apps/app/src/components/app-layout.test.tsx apps/app/src/routes/_app.tsx apps/app/src/routes/_app.index.tsx apps/app/src/routes/_app.about.tsx apps/app/src/components/app-sidebar.tsx apps/app/src/components/site-header.tsx
git commit -m "refactor(app): split auth routes from app shell"
```

## Task 3: Add Better Auth Client And Effect Schema Validation

**Files:**

- Create: `apps/app/src/lib/auth-client.ts`
- Create: `apps/app/src/features/auth/auth-schemas.ts`
- Create: `apps/app/src/features/auth/auth-schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `apps/app/src/features/auth/auth-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { decodeLoginInput, decodeSignupInput } from "./auth-schemas";

describe("auth schemas", () => {
  it("rejects an invalid login email", () => {
    expect(() =>
      decodeLoginInput({
        email: "not-an-email",
        password: "supersecret",
      })
    ).toThrow(/email/i);
  });

  it("rejects mismatched signup passwords", () => {
    expect(() =>
      decodeSignupInput({
        name: "Cillian",
        email: "cillian@example.com",
        password: "supersecret",
        confirmPassword: "different-secret",
      })
    ).toThrow(/match/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/auth-schema.test.ts
```

Expected: FAIL because `auth-schemas.ts` does not exist yet.

- [ ] **Step 3: Write the minimal auth client and schema code**

Create `apps/app/src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
});
```

Create `apps/app/src/features/auth/auth-schemas.ts`:

```ts
import { ParseResult, Schema } from "effect";

const Email = Schema.String.pipe(
  Schema.trimmed(),
  Schema.nonEmptyString(),
  Schema.pattern(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)
);
const Password = Schema.String.pipe(Schema.minLength(8));
const Name = Schema.String.pipe(Schema.trimmed(), Schema.minLength(2));

const LoginInput = Schema.Struct({
  email: Email,
  password: Password,
});

const SignupInput = Schema.Struct({
  name: Name,
  email: Email,
  password: Password,
  confirmPassword: Password,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword, {
    message: () => "Passwords must match",
  })
);

export type LoginInput = typeof LoginInput.Type;
export type SignupInput = typeof SignupInput.Type;

export const loginSchema = LoginInput;
export const signupSchema = SignupInput;

export function decodeLoginInput(input: unknown): LoginInput {
  return ParseResult.decodeUnknownSync(LoginInput)(input);
}

export function decodeSignupInput(input: unknown): SignupInput {
  return ParseResult.decodeUnknownSync(SignupInput)(input);
}
```

- [ ] **Step 4: Run the schema tests again**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/auth-schema.test.ts
```

Expected: PASS with both schema tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/auth-client.ts apps/app/src/features/auth/auth-schemas.ts apps/app/src/features/auth/auth-schema.test.ts
git commit -m "feat(app): add auth client and validation schemas"
```

## Task 4: Add A Minimal shadcn Field Adapter For TanStack Form

**Files:**

- Create: `apps/app/src/features/auth/auth-form-field.tsx`
- Create: `apps/app/src/features/auth/auth-form-field.test.tsx`
- Modify: `apps/app/package.json`

- [ ] **Step 1: Add the registry blocks**

Run:

```bash
cd apps/app
pnpm dlx shadcn@latest add @shadcn/login-03 @shadcn/signup-03
```

Expected: the registry files land in `src/components` and `src/components/ui` without overwriting the app shell.

- [ ] **Step 2: Write the failing adapter test**

Create `apps/app/src/features/auth/auth-form-field.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthFormField } from "./auth-form-field";

describe("AuthFormField", () => {
  it("renders the label and error state with shadcn field primitives", () => {
    render(
      <AuthFormField
        label="Email"
        htmlFor="email"
        invalid
        errorText="Email is required"
      >
        <input id="email" aria-invalid />
      </AuthFormField>
    );

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid");
  });
});
```

- [ ] **Step 3: Run the adapter test to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/auth-form-field.test.tsx
```

Expected: FAIL because `auth-form-field.tsx` does not exist yet.

- [ ] **Step 4: Write the minimal adapter**

Create `apps/app/src/features/auth/auth-form-field.tsx`:

```tsx
import type { ReactNode } from "react";

import { Field, FieldError, FieldLabel } from "#/components/ui/field";

export function AuthFormField(props: {
  readonly label: string;
  readonly htmlFor: string;
  readonly invalid: boolean;
  readonly errorText?: string;
  readonly children: ReactNode;
}) {
  const { children, errorText, htmlFor, invalid, label } = props;

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {errorText ? <FieldError errors={[errorText]} /> : null}
    </Field>
  );
}
```

- [ ] **Step 5: Run the adapter test and typecheck**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/auth-form-field.test.tsx
pnpm --filter app check-types
```

Expected: PASS, confirming the helper is ready for the route work.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/auth/auth-form-field.tsx apps/app/src/features/auth/auth-form-field.test.tsx apps/app/package.json apps/app/src/components
git commit -m "feat(app): add shadcn auth form primitives"
```

## Task 5: Implement The Login Route With TDD

**Files:**

- Create: `apps/app/src/features/auth/login-page.tsx`
- Create: `apps/app/src/features/auth/login-page.test.tsx`
- Create: `apps/app/src/routes/login.tsx`

- [ ] **Step 1: Write the failing login interaction tests**

Create `apps/app/src/features/auth/login-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
    },
    getSession: vi.fn(),
  },
}));

import { authClient } from "#/lib/auth-client";
import { LoginPage } from "./login-page";

describe("login route", () => {
  beforeEach(() => {
    vi.mocked(authClient.getSession).mockResolvedValue({ data: null });
  });

  it("submits valid credentials to Better Auth", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { session: { id: "session_1" } },
    });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText("Email"), "cillian@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(authClient.signIn.email).toHaveBeenCalledWith({
        email: "cillian@example.com",
        password: "supersecret",
      })
    );
  });

  it("shows a server error when sign-in fails", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: "Invalid email or password" },
    });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText("Email"), "cillian@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText("Invalid email or password")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the login tests to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/login-page.test.tsx
```

Expected: FAIL because `login-page.tsx` does not exist yet.

- [ ] **Step 3: Write the minimal login page and route**

Create `apps/app/src/features/auth/login-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { useState } from "react";

import { AuthFormField } from "#/features/auth/auth-form-field";
import { decodeLoginInput, loginSchema } from "#/features/auth/auth-schemas";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";

export function LoginPage() {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: Schema.standardSchemaV1(loginSchema) },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const payload = decodeLoginInput(value);
      const result = await authClient.signIn.email(payload);

      if (result.error) {
        setFormError(result.error.message ?? "Unable to sign in");
      }
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Use your email and password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => (
                  <AuthFormField
                    label="Email"
                    htmlFor={field.name}
                    invalid={
                      field.state.meta.isTouched && !field.state.meta.isValid
                    }
                    errorText={field.state.meta.errors[0]?.message}
                  >
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </AuthFormField>
                )}
              </form.Field>
              <form.Field name="password">
                {(field) => (
                  <AuthFormField
                    label="Password"
                    htmlFor={field.name}
                    invalid={
                      field.state.meta.isTouched && !field.state.meta.isValid
                    }
                    errorText={field.state.meta.errors[0]?.message}
                  >
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
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
            {formError ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <Button type="submit" className="mt-6 w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">Welcome back.</p>
        </CardFooter>
      </Card>
    </main>
  );
}
```

Create `apps/app/src/routes/login.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "#/features/auth/login-page";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});
```

- [ ] **Step 4: Run the login tests again**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/login-page.test.tsx
pnpm --filter app check-types
```

Expected: PASS for the login tests and TypeScript.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/login-page.tsx apps/app/src/features/auth/login-page.test.tsx apps/app/src/routes/login.tsx
git commit -m "feat(app): add login route"
```

## Task 6: Implement The Sign-Up Route With TDD

**Files:**

- Create: `apps/app/src/features/auth/signup-page.tsx`
- Create: `apps/app/src/features/auth/signup-page.test.tsx`
- Create: `apps/app/src/routes/signup.tsx`

- [ ] **Step 1: Write the failing sign-up tests**

Create `apps/app/src/features/auth/signup-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("#/lib/auth-client", () => ({
  authClient: {
    signUp: {
      email: vi.fn(),
    },
    getSession: vi.fn(),
  },
}));

import { authClient } from "#/lib/auth-client";
import { SignupPage } from "./signup-page";

describe("signup route", () => {
  it("submits valid signup data to Better Auth", async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({
      data: { user: { id: "user_1" } },
    });

    render(<SignupPage />);

    await userEvent.type(screen.getByLabelText("Name"), "Cillian");
    await userEvent.type(screen.getByLabelText("Email"), "cillian@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "supersecret"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /create account/i })
    );

    await waitFor(() =>
      expect(authClient.signUp.email).toHaveBeenCalledWith({
        name: "Cillian",
        email: "cillian@example.com",
        password: "supersecret",
      })
    );
  });

  it("shows the password mismatch error inline", async () => {
    render(<SignupPage />);

    await userEvent.type(screen.getByLabelText("Name"), "Cillian");
    await userEvent.type(screen.getByLabelText("Email"), "cillian@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "different"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /create account/i })
    );

    expect(await screen.findByText("Passwords must match")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the sign-up tests to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/signup-page.test.tsx
```

Expected: FAIL because `signup-page.tsx` does not exist yet.

- [ ] **Step 3: Write the minimal sign-up page and route**

Create `apps/app/src/features/auth/signup-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { useState } from "react";

import { AuthFormField } from "#/features/auth/auth-form-field";
import { decodeSignupInput, signupSchema } from "#/features/auth/auth-schemas";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";

export function SignupPage() {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    validators: { onSubmit: Schema.standardSchemaV1(signupSchema) },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const payload = decodeSignupInput(value);
      const result = await authClient.signUp.email({
        name: payload.name,
        email: payload.email,
        password: payload.password,
      });

      if (result.error) {
        setFormError(result.error.message ?? "Unable to create account");
      }
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>
            Use your email and password to create an account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
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
                    label="Name"
                    htmlFor={field.name}
                    invalid={
                      field.state.meta.isTouched && !field.state.meta.isValid
                    }
                    errorText={field.state.meta.errors[0]?.message}
                  >
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </AuthFormField>
                )}
              </form.Field>
              <form.Field name="email">
                {(field) => (
                  <AuthFormField
                    label="Email"
                    htmlFor={field.name}
                    invalid={
                      field.state.meta.isTouched && !field.state.meta.isValid
                    }
                    errorText={field.state.meta.errors[0]?.message}
                  >
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </AuthFormField>
                )}
              </form.Field>
              <form.Field name="password">
                {(field) => (
                  <AuthFormField
                    label="Password"
                    htmlFor={field.name}
                    invalid={
                      field.state.meta.isTouched && !field.state.meta.isValid
                    }
                    errorText={field.state.meta.errors[0]?.message}
                  >
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </AuthFormField>
                )}
              </form.Field>
              <form.Field name="confirmPassword">
                {(field) => (
                  <AuthFormField
                    label="Confirm password"
                    htmlFor={field.name}
                    invalid={
                      field.state.meta.isTouched && !field.state.meta.isValid
                    }
                    errorText={field.state.meta.errors[0]?.message}
                  >
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
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
            {formError ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <Button type="submit" className="mt-6 w-full">
              Create account
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">Create your account.</p>
        </CardFooter>
      </Card>
    </main>
  );
}
```

Create `apps/app/src/routes/signup.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { SignupPage } from "#/features/auth/signup-page";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});
```

- [ ] **Step 4: Run the sign-up tests again**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/signup-page.test.tsx
pnpm --filter app check-types
```

Expected: PASS for the sign-up tests and TypeScript.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/signup-page.tsx apps/app/src/features/auth/signup-page.test.tsx apps/app/src/routes/signup.tsx
git commit -m "feat(app): add signup route"
```

## Task 7: Add Session-Aware Redirects For Auth Routes

**Files:**

- Create: `apps/app/src/features/auth/redirect-if-authenticated.ts`
- Create: `apps/app/src/features/auth/redirect-if-authenticated.test.ts`
- Modify: `apps/app/src/routes/login.tsx`
- Modify: `apps/app/src/routes/signup.tsx`
- Modify: `apps/app/src/features/auth/login-page.test.tsx`
- Modify: `apps/app/src/features/auth/signup-page.test.tsx`

- [ ] **Step 1: Write the failing redirect tests**

Create `apps/app/src/features/auth/redirect-if-authenticated.test.ts`:

```tsx
import { describe, expect, it, vi } from "vitest";

vi.mock("#/lib/auth-client", () => ({
  authClient: {
    getSession: vi.fn(),
  },
}));

import { authClient } from "#/lib/auth-client";
import { redirectIfAuthenticated } from "./redirect-if-authenticated";

describe("redirectIfAuthenticated", () => {
  it("throws a router redirect when a session exists", async () => {
    vi.mocked(authClient.getSession).mockResolvedValue({
      data: {
        session: { id: "session_1" },
        user: { id: "user_1", email: "cillian@example.com", name: "Cillian" },
      },
    });

    await expect(redirectIfAuthenticated()).rejects.toMatchObject({
      to: "/",
    });
  });
});
```

- [ ] **Step 2: Run the redirect tests to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/redirect-if-authenticated.test.ts
```

Expected: FAIL because `redirect-if-authenticated.ts` does not exist yet.

- [ ] **Step 3: Write the minimal shared redirect helper**

Create `apps/app/src/features/auth/redirect-if-authenticated.ts`:

```ts
import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

export async function redirectIfAuthenticated() {
  const session = await authClient.getSession();

  if (session.data?.session) {
    throw redirect({ to: "/" });
  }
}
```

Then update both auth routes:

```tsx
export const Route = createFileRoute("/login")({
  beforeLoad: redirectIfAuthenticated,
  component: LoginPage,
});
```

and

```tsx
export const Route = createFileRoute("/signup")({
  beforeLoad: redirectIfAuthenticated,
  component: SignupPage,
});
```

- [ ] **Step 4: Run the redirect and full app tests**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/auth-schema.test.ts src/features/auth/auth-form-field.test.tsx src/features/auth/redirect-if-authenticated.test.ts src/routes/login.test.tsx src/routes/signup.test.tsx
pnpm --filter app build
pnpm --filter app check-types
```

Expected: PASS across the auth test suite, app build, and app typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/redirect-if-authenticated.ts apps/app/src/features/auth/redirect-if-authenticated.test.ts apps/app/src/routes/login.tsx apps/app/src/routes/signup.tsx
git commit -m "feat(app): redirect authenticated users from auth routes"
```

## Task 8: Add Auth E2E Tests With Page Objects

**Files:**

- Create: `apps/app/e2e/pages/login-page.ts`
- Create: `apps/app/e2e/pages/signup-page.ts`
- Create: `apps/app/e2e/auth.spec.ts`

- [ ] **Step 1: Write the failing e2e spec first**

Create `apps/app/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { LoginPage } from "./pages/login-page";
import { SignupPage } from "./pages/signup-page";

test.describe("auth flows", () => {
  test("shows inline validation on login", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.submit();

    await expect(loginPage.emailError).toContainText(/email/i);
  });

  test("shows password mismatch on signup", async ({ page }) => {
    const signupPage = new SignupPage(page);

    await signupPage.goto();
    await signupPage.fill({
      name: "Cillian",
      email: "cillian@example.com",
      password: "supersecret",
      confirmPassword: "different-secret",
    });
    await signupPage.submit();

    await expect(signupPage.confirmPasswordError).toContainText(
      "Passwords must match"
    );
  });
});
```

- [ ] **Step 2: Run the e2e test to verify the red state**

Run:

```bash
pnpm --filter app exec playwright test e2e/auth.spec.ts
```

Expected: FAIL because the page object files do not exist yet.

- [ ] **Step 3: Add the page objects**

Create `apps/app/e2e/pages/login-page.ts`:

```ts
import type { Locator, Page } from "@playwright/test";

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly emailError: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.submitButton = page.getByRole("button", { name: /sign in/i });
    this.emailError = page.getByText(/email/i).last();
  }

  async goto() {
    await this.page.goto("/login");
  }

  async fill(input: { email: string; password: string }) {
    await this.emailInput.fill(input.email);
    await this.passwordInput.fill(input.password);
  }

  async submit() {
    await this.submitButton.click();
  }
}
```

Create `apps/app/e2e/pages/signup-page.ts`:

```ts
import type { Locator, Page } from "@playwright/test";

export class SignupPage {
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly confirmPasswordError: Locator;

  constructor(private readonly page: Page) {
    this.nameInput = page.getByLabel("Name");
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.confirmPasswordInput = page.getByLabel("Confirm password");
    this.submitButton = page.getByRole("button", {
      name: /create account/i,
    });
    this.confirmPasswordError = page.getByText("Passwords must match");
  }

  async goto() {
    await this.page.goto("/signup");
  }

  async fill(input: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) {
    await this.nameInput.fill(input.name);
    await this.emailInput.fill(input.email);
    await this.passwordInput.fill(input.password);
    await this.confirmPasswordInput.fill(input.confirmPassword);
  }

  async submit() {
    await this.submitButton.click();
  }
}
```

- [ ] **Step 4: Run the e2e spec again**

Run:

```bash
pnpm --filter app exec playwright test e2e/auth.spec.ts
```

Expected: PASS, confirming the auth forms work in the browser and the page object model is wired correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/app/e2e apps/app/playwright.config.ts
git commit -m "test(app): add auth e2e coverage"
```

## Task 9: Write The High-Level Auth Next Steps Doc

**Files:**

- Create: `docs/architecture/auth-next-steps.md`

- [ ] **Step 1: Write the high-level auth roadmap**

Create `docs/architecture/auth-next-steps.md` with sections for:

```md
# Auth Next Steps

## Purpose

This document captures the next major auth milestones after email/password login and sign-up are working in the app.

## Near-Term

- app-level auth enforcement for protected routes
- authenticated shell behavior and redirect strategy
- sign-out entry points in app chrome
- session-aware loading states

## Medium-Term

- password reset flow
- email verification flow
- auth-related transactional email integration
- better error and success states across auth screens

## Later

- social auth providers
- organization-aware auth and role/permission hooks
- app-facing session or viewer helpers only if native Better Auth APIs become insufficient
```

- [ ] **Step 2: Review the roadmap doc for scope clarity**

Run:

```bash
sed -n '1,220p' docs/architecture/auth-next-steps.md
```

Expected: the doc reads as a concise roadmap, not an implementation plan.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/auth-next-steps.md
git commit -m "docs: add auth next steps roadmap"
```

## Task 10: Final Verification And Cleanup

**Files:**

- Modify: any auth route copy or nav text discovered during verification

- [ ] **Step 1: Run the full app verification**

Run:

```bash
pnpm --filter app exec vitest run
pnpm --filter app check-types
pnpm --filter app build
pnpm --filter app exec playwright test e2e/auth.spec.ts
```

Expected: all four commands pass.

- [ ] **Step 2: Run workspace-level verification**

Run:

```bash
pnpm check-types
pnpm exec oxlint apps/app/src
```

Expected: workspace typecheck and app lint both pass.

- [ ] **Step 3: Sanity-check the auth screens in the running app**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Expected: a working app URL and API URL for manually checking `/login` and `/signup` against the native Better Auth server.

- [ ] **Step 4: Commit the final polish if verification changed anything**

```bash
git add apps/app
git commit -m "chore(app): polish auth flows"
```

## Self-Review

- Spec coverage check: the plan covers standalone auth routes, Better Auth native client usage, TanStack Form, `Effect/Schema`, shadcn registry UI, session-aware auth redirects, and TDD.
- Spec coverage check: the plan covers standalone auth routes, Better Auth native client usage, TanStack Form, `Effect/Schema`, shadcn registry UI, session-aware auth redirects, page-object e2e tests, the roadmap doc, and TDD.
- Placeholder scan: no `TODO`, `TBD`, comments standing in for code, or unresolved ownership remains in the tasks.
- Type consistency check: the plan uses the same `authClient`, `loginSchema`, `signupSchema`, `AuthFormField`, and `redirectIfAuthenticated` names throughout.
