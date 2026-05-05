# Authenticated Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/app` into a real authenticated application shell by protecting `/` and app-owned routes, keeping only `/login` and `/signup` public, wiring real sign-out behavior, and removing starter placeholder screens and chrome.

**Architecture:** Keep Better Auth native on both API and client. Reuse the existing server-session lookup and auth client, but move the auth decision to the app shell boundary so protected content never renders for logged-out users. Simplify the route tree to a small public auth area plus a protected `/_app` shell, and aggressively delete starter/demo surfaces instead of preserving them.

**Tech Stack:** TanStack Start, TanStack Router, Better Auth React client, Better Auth server contract, Effect Schema, Vitest, Testing Library, existing app shell components

---

## File Structure

**Create:**

- `apps/app/src/features/auth/require-authenticated-session.ts` — shared protected-route guard for the app shell
- `apps/app/src/features/auth/require-authenticated-session.test.ts` — guard tests for redirecting logged-out users
- `apps/app/src/features/auth/sign-out.ts` — shared sign-out action for the user menu
- `apps/app/src/features/auth/sign-out.test.ts` — unit tests for sign-out behavior
- `apps/app/src/features/auth/authenticated-shell-home.tsx` — minimal real signed-in home screen
- `apps/app/src/features/auth/authenticated-shell-home.test.tsx` — test for the signed-in home screen content

**Modify:**

- `apps/app/src/routes/_app.tsx` — add the protected route guard and session-aware shell context
- `apps/app/src/routes/_app.index.tsx` — replace starter hero content with the real minimal home screen
- `apps/app/src/routes/login.tsx` — keep redirect-away behavior for authenticated users
- `apps/app/src/routes/signup.tsx` — keep redirect-away behavior for authenticated users
- `apps/app/src/components/app-layout.tsx` — accept session-aware shell data if needed
- `apps/app/src/components/app-sidebar.tsx` — replace placeholder nav and fake user data
- `apps/app/src/components/nav-user.tsx` — wire a real sign-out action and session-driven user details
- `apps/app/src/components/site-header.tsx` — remove placeholder breadcrumb states and links
- `apps/app/src/components/app-layout.test.tsx` — update for the cleaned-up authenticated shell
- `apps/app/e2e/auth.test.ts` — extend boundary coverage for authenticated and unauthenticated navigation

**Delete:**

- `apps/app/src/routes/_app.about.tsx` — starter placeholder screen that should not survive the real app boundary

## Task 1: Add The Protected App-Shell Guard

**Files:**

- Create: `apps/app/src/features/auth/require-authenticated-session.ts`
- Create: `apps/app/src/features/auth/require-authenticated-session.test.ts`
- Modify: `apps/app/src/routes/_app.tsx`

- [ ] **Step 1: Write the failing protected-route guard tests**

Create `apps/app/src/features/auth/require-authenticated-session.test.ts`:

```tsx
import { isRedirect } from "@tanstack/react-router";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { requireAuthenticatedSession } from "./require-authenticated-session";

const {
  mockedGetServerAuthSession,
  mockedGetSession,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetServerAuthSession: vi.fn<() => Promise<{ id: string } | null>>(),
  mockedGetSession: vi.fn<
    () => Promise<{
      data: { session: { id: string } } | null;
      error: null;
    }>
  >(),
  mockedIsServerEnvironment: vi.fn<() => boolean>(),
}));

vi.mock(import("./server-session"), () => ({
  getCurrentServerSession: mockedGetServerAuthSession,
}));

vi.mock(import("./runtime-environment"), () => ({
  isServerEnvironment: mockedIsServerEnvironment,
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
  } as unknown as typeof AuthClient,
}));

describe("requireAuthenticatedSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws a redirect to /login when there is no session", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerAuthSession.mockResolvedValue(null);

    const result = requireAuthenticatedSession();

    await expect(result).rejects.toMatchObject({
      options: { to: "/login" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  });

  it("resolves with the session when one exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerAuthSession.mockResolvedValue({ id: "session_123" });

    await expect(requireAuthenticatedSession()).resolves.toMatchObject({
      id: "session_123",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/require-authenticated-session.test.ts
```

Expected: FAIL because `require-authenticated-session.ts` does not exist yet.

- [ ] **Step 3: Write the minimal protected-route guard**

Create `apps/app/src/features/auth/require-authenticated-session.ts`:

```ts
import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { isServerEnvironment } from "./runtime-environment";
import { getCurrentServerSession } from "./server-session";

async function getCurrentSession() {
  if (isServerEnvironment()) {
    return await getCurrentServerSession();
  }

  const session = await authClient.getSession();
  return session.data?.session ?? null;
}

export async function requireAuthenticatedSession() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      throw redirect({ to: "/login" });
    }

    return session;
  } catch (error) {
    if (typeof error === "object" && error !== null && "routerCode" in error) {
      throw error;
    }

    throw redirect({ to: "/login" });
  }
}
```

Update `apps/app/src/routes/_app.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireAuthenticatedSession();

    return {
      session,
    };
  },
  component: AppLayout,
});
```

- [ ] **Step 4: Run the tests to verify the green state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/require-authenticated-session.test.ts src/features/auth/redirect-if-authenticated.test.ts
```

Expected: PASS, proving the app shell now has a complementary guard to the existing auth-page redirect guard.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/require-authenticated-session.ts apps/app/src/features/auth/require-authenticated-session.test.ts apps/app/src/routes/_app.tsx
git commit -m "feat(app): protect authenticated shell routes"
```

## Task 2: Replace Starter Screens With A Minimal Real App Surface

**Files:**

- Create: `apps/app/src/features/auth/authenticated-shell-home.tsx`
- Create: `apps/app/src/features/auth/authenticated-shell-home.test.tsx`
- Modify: `apps/app/src/routes/_app.index.tsx`
- Delete: `apps/app/src/routes/_app.about.tsx`
- Modify: `apps/app/src/components/site-header.tsx`

- [ ] **Step 1: Write the failing signed-in home test**

Create `apps/app/src/features/auth/authenticated-shell-home.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { AuthenticatedShellHome } from "./authenticated-shell-home";

describe("AuthenticatedShellHome", () => {
  it("renders a real app home instead of starter marketing content", () => {
    render(<AuthenticatedShellHome />);

    expect(
      screen.getByRole("heading", { name: /your work/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/start simple, ship quickly/i)
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/authenticated-shell-home.test.tsx
```

Expected: FAIL because the new home component does not exist yet.

- [ ] **Step 3: Add the minimal signed-in home and remove the placeholder route**

Create `apps/app/src/features/auth/authenticated-shell-home.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export function AuthenticatedShellHome() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:py-14">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Your work
        </h1>
        <p className="text-muted-foreground">
          The app shell is now protected and ready for real ceird features.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Next product surface</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This screen intentionally stays minimal while auth, onboarding, and
          core workspace flows take shape.
        </CardContent>
      </Card>
    </main>
  );
}
```

Replace `apps/app/src/routes/_app.index.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedShellHome } from "#/features/auth/authenticated-shell-home";

export const Route = createFileRoute("/_app/")({
  component: AuthenticatedShellHome,
});
```

Delete `apps/app/src/routes/_app.about.tsx`.

Update `apps/app/src/components/site-header.tsx` so it no longer recognizes or renders starter breadcrumb states like `About` or `Health`, and instead keeps a minimal breadcrumb rooted at the authenticated app home.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/authenticated-shell-home.test.tsx src/components/app-layout.test.tsx
```

Expected: PASS, confirming the authenticated home exists and the app shell still renders.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/authenticated-shell-home.tsx apps/app/src/features/auth/authenticated-shell-home.test.tsx apps/app/src/routes/_app.index.tsx apps/app/src/components/site-header.tsx
git rm apps/app/src/routes/_app.about.tsx
git commit -m "refactor(app): remove starter screens from authenticated shell"
```

## Task 3: Replace Placeholder Chrome Data With Real Session Data And Sign-Out

**Files:**

- Create: `apps/app/src/features/auth/sign-out.ts`
- Create: `apps/app/src/features/auth/sign-out.test.ts`
- Modify: `apps/app/src/components/app-layout.tsx`
- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/components/nav-user.tsx`

- [ ] **Step 1: Write the failing sign-out unit test**

Create `apps/app/src/features/auth/sign-out.test.ts`:

```ts
import type { authClient as AuthClient } from "#/lib/auth-client";

import { signOut } from "./sign-out";

const { mockedSignOut } = vi.hoisted(() => ({
  mockedSignOut: vi.fn<
    () => Promise<{
      data: { success: boolean } | null;
      error: null | { message: string };
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    signOut: mockedSignOut,
  } as unknown as typeof AuthClient,
}));

describe("signOut", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the Better Auth client", async () => {
    mockedSignOut.mockResolvedValue({
      data: { success: true },
      error: null,
    });

    await expect(signOut()).resolves.toEqual({
      data: { success: true },
      error: null,
    });
    expect(mockedSignOut).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/sign-out.test.ts
```

Expected: FAIL because `sign-out.ts` does not exist yet.

- [ ] **Step 3: Implement session-driven shell data and a real sign-out action**

Create `apps/app/src/features/auth/sign-out.ts`:

```ts
import { authClient } from "#/lib/auth-client";

export async function signOut() {
  return await authClient.signOut();
}
```

Update `apps/app/src/components/nav-user.tsx` so the sign-out menu item:

- calls the shared `signOut()` helper
- redirects to `/login` after success
- disables repeat clicks while pending
- can show a small fallback error message if sign-out fails

Update `apps/app/src/components/app-sidebar.tsx` so it no longer uses hard-coded
placeholder user data. Read the guarded session from `Route.useRouteContext()`
or props passed down from `AppLayout`, and reduce the navigation to the minimal
real app items you want to keep now.

Update `apps/app/src/components/app-layout.tsx` so the layout can supply the
authenticated session user to the sidebar and user menu.

- [ ] **Step 4: Run the shell tests**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/sign-out.test.ts src/components/app-layout.test.tsx
```

Expected: PASS, confirming the shell can render with real auth-backed user data and that sign-out is wired.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/sign-out.ts apps/app/src/features/auth/sign-out.test.ts apps/app/src/components/app-layout.tsx apps/app/src/components/app-sidebar.tsx apps/app/src/components/nav-user.tsx
git commit -m "feat(app): wire authenticated shell user menu"
```

## Task 4: Extend Route-Boundary Coverage And Remove Placeholder Exposure

**Files:**

- Modify: `apps/app/e2e/auth.test.ts`
- Modify: `apps/app/src/components/app-layout.test.tsx`

- [ ] **Step 1: Add failing boundary-focused tests**

Update `apps/app/e2e/auth.test.ts` with two new cases:

```ts
test("unauthenticated users are redirected from / to /login", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
});

test("authenticated users do not see removed starter content after sign in", async ({
  page,
  request,
}) => {
  const email = createTestEmail("signed-in-home");
  const password = "password123";

  const response = await request.post(
    "http://127.0.0.1:3001/api/auth/sign-up/email",
    {
      data: {
        email,
        name: "Taylor Example",
        password,
      },
    }
  );

  expect(response.ok()).toBeTruthy();

  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.email.fill(email);
  await loginPage.password.fill(password);
  await loginPage.submit.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Your work")).toBeVisible();
  await expect(page.getByText(/start simple, ship quickly/i)).toHaveCount(0);
});
```

Update `apps/app/src/components/app-layout.test.tsx` to assert the app shell no
longer renders placeholder starter labels you intentionally removed.

- [ ] **Step 2: Run the tests to verify the red state**

Run:

```bash
pnpm --filter app exec vitest run src/components/app-layout.test.tsx
```

Expected: FAIL if the placeholder chrome is still present.

- [ ] **Step 3: Finish the placeholder cleanup**

Remove any remaining starter-only labels, links, and nav items still exposed
from:

- `apps/app/src/components/app-sidebar.tsx`
- `apps/app/src/components/site-header.tsx`
- `apps/app/src/routes/_app.index.tsx`

The signed-in UI should no longer expose starter documentation links, fake
workspace labels, or about-page navigation.

- [ ] **Step 4: Run the full app test suite**

Run:

```bash
pnpm --filter app test
```

Expected: PASS for the Vitest suite in `apps/app`.

Then run:

```bash
pnpm --filter app exec playwright test e2e/auth.test.ts
```

Expected: PASS for login/signup plus the new protected-route boundary cases.

- [ ] **Step 5: Commit**

```bash
git add apps/app/e2e/auth.test.ts apps/app/src/components/app-layout.test.tsx apps/app/src/components/app-sidebar.tsx apps/app/src/components/site-header.tsx apps/app/src/routes/_app.index.tsx
git commit -m "test(app): cover authenticated shell boundaries"
```

## Self-Review

### Spec Coverage

- Protected `/` and app-shell route enforcement: covered in Task 1.
- Keep `/login` and `/signup` public with redirect-away behavior for authenticated users: preserved alongside Task 1.
- Replace starter home and remove placeholder screens: covered in Task 2.
- Replace fake shell data and wire sign-out: covered in Task 3.
- Remove placeholder navigation and add route-boundary coverage: covered in Task 4.

### Placeholder Scan

No `TODO`, `TBD`, or “implement later” placeholders remain in the plan. Each
task names exact files and verification commands.

### Type Consistency

The plan consistently refers to:

- `requireAuthenticatedSession()` for the protected guard
- `redirectIfAuthenticated()` for public auth pages
- `signOut()` for the shared sign-out action

Those names are used consistently across the tasks above.
