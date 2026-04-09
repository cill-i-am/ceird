# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Better Auth email verification with link-based delivery, a non-blocking in-app reminder banner, resend support, and public verification result handling across `apps/api` and `apps/app`.

**Architecture:** Keep Better Auth as the source of truth for verification token generation, verification redirects, and resend endpoints. Extend the existing auth-domain email boundary in `apps/api` to compose verification emails next to password reset, then surface verification state in `apps/app` through a public `/verify-email` result route and a persistent banner inside the authenticated shell instead of adding a second auth gate.

**Tech Stack:** Better Auth, Effect, Effect Schema, TanStack Start, TanStack Router, TanStack Form, shadcn/ui, Resend, Vitest, Testing Library

---

## File Structure

**Create:**

- `apps/app/src/components/ui/alert.tsx` — shadcn alert primitive for the authenticated shell reminder
- `apps/app/src/features/auth/email-verification-banner.tsx` — client-side resend UI for unverified authenticated sessions
- `apps/app/src/features/auth/email-verification-banner.test.tsx` — resend interaction and state tests for the banner
- `apps/app/src/features/auth/email-verification-search.ts` — parser for `/verify-email` result-state query params
- `apps/app/src/features/auth/email-verification-search.test.ts` — unit tests for verification search parsing
- `apps/app/src/features/auth/email-verification-page.tsx` — public verification success and failure result page
- `apps/app/src/features/auth/email-verification-page.test.tsx` — result page rendering tests
- `apps/app/src/routes/verify-email.tsx` — public verification result route

**Modify:**

- `apps/api/src/domains/identity/authentication/auth-email-errors.ts` — add explicit verification-delivery error
- `apps/api/src/domains/identity/authentication/auth-email.ts` — add verified email input schema and `sendEmailVerificationEmail`
- `apps/api/src/domains/identity/authentication/auth-email.test.ts` — cover verification message composition and failure mapping
- `apps/api/src/domains/identity/authentication/auth.ts` — wire Better Auth `emailVerification` hooks into the existing auth email service
- `apps/api/src/domains/identity/authentication/authentication.test.ts` — assert auth config now includes the verification policy
- `apps/api/src/domains/identity/authentication/authentication.integration.test.ts` — cover sign-up-triggered verification email delivery, resend, verification redirect, and session state update
- `apps/api/src/domains/identity/authentication/config.ts` — add the non-blocking verification policy to the Better Auth config
- `apps/app/src/components/app-layout.tsx` — render the verification banner in the authenticated shell
- `apps/app/src/components/app-layout.test.tsx` — assert the banner slot renders correctly
- `apps/app/src/features/auth/auth-form-errors.ts` — add resend-verification-safe error messaging helpers
- `apps/app/src/features/auth/auth-form-errors.test.ts` — cover resend-verification error mapping
- `apps/app/src/features/auth/authenticated-app-layout.tsx` — pass verification props from the route session into `AppLayout`
- `apps/app/src/features/auth/authenticated-app-layout.test.tsx` — assert the new props are forwarded
- `apps/app/src/features/auth/signup-page.tsx` — pass a verification callback URL when creating accounts
- `apps/app/src/features/auth/signup-page.test.tsx` — assert sign-up includes the verification callback URL
- `apps/app/src/lib/auth-client.ts` — add a helper for the verification callback target
- `docs/architecture/auth.md` — document the verification flow, banner policy, and resend behavior
- `docs/architecture/auth-next-steps.md` — move email verification out of “next” and update the remaining roadmap

## Task 1: Extend The Auth Email Boundary For Verification

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/auth-email-errors.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.test.ts`

- [ ] **Step 1: Write the failing verification email service tests**

Append to `apps/api/src/domains/identity/authentication/auth-email.test.ts`:

```ts
it("composes the expected email verification message", async () => {
  const sentMessages: TransportMessage[] = [];

  await Effect.runPromise(
    AuthEmailSender.sendEmailVerificationEmail({
      idempotencyKey: "email-verification/user-123/token-verify123",
      recipientEmail: "alice@example.com",
      recipientName: "Alice",
      verificationUrl:
        "https://app.task-tracker.localhost/verify-email?success=1",
    }).pipe(
      Effect.provide(
        makeAuthEmailSenderTestLayer((message) =>
          Effect.sync(() => {
            sentMessages.push(message);
          })
        )
      )
    )
  );

  expect(sentMessages).toStrictEqual([
    {
      idempotencyKey: "email-verification/user-123/token-verify123",
      to: "alice@example.com",
      subject: "Verify your email",
      text: [
        "Hello Alice,",
        "",
        "Use this link to verify your email:",
        "https://app.task-tracker.localhost/verify-email?success=1",
      ].join("\\n"),
      html: [
        "<p>Hello Alice,</p>",
        '<p><a href="https://app.task-tracker.localhost/verify-email?success=1">Verify your email</a></p>',
      ].join(""),
    },
  ]);
});

it("maps provider failures into EmailVerificationDeliveryError", async () => {
  const result = await Effect.runPromise(
    AuthEmailSender.sendEmailVerificationEmail({
      idempotencyKey: "email-verification/user-123/token-verify123",
      recipientEmail: "alice@example.com",
      recipientName: "Alice",
      verificationUrl:
        "https://app.task-tracker.localhost/verify-email?success=1",
    }).pipe(
      Effect.either,
      Effect.provide(
        makeAuthEmailSenderTestLayer(() =>
          Effect.fail(
            new AuthEmailDeliveryError({
              message: "Provider request failed",
              cause: "upstream timeout",
            })
          )
        )
      )
    )
  );

  expect(result._tag).toBe("Left");
  if (result._tag !== "Left") {
    return;
  }

  expect(result.left).toMatchObject({
    _tag: "EmailVerificationDeliveryError",
    message: "Failed to deliver verification email",
    cause: "Provider request failed",
  });
});
```

- [ ] **Step 2: Run the auth email service tests to confirm the new coverage fails**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts
```

Expected: FAIL because `sendEmailVerificationEmail` and `EmailVerificationDeliveryError` do not exist yet.

- [ ] **Step 3: Add the verification delivery error**

Update `apps/api/src/domains/identity/authentication/auth-email-errors.ts`:

```ts
export class EmailVerificationDeliveryError extends Schema.TaggedError<EmailVerificationDeliveryError>()(
  "EmailVerificationDeliveryError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}
```

- [ ] **Step 4: Extend the auth email service with verification input and message composition**

Update `apps/api/src/domains/identity/authentication/auth-email.ts`:

```ts
import {
  EmailVerificationDeliveryError,
  PasswordResetDeliveryError,
} from "./auth-email-errors.js";

const VerificationUrl = Schema.String.pipe(
  Schema.filter((value) => isValidResetUrl(value), {
    message: () => "Expected a valid http or https URL without credentials",
  })
);

export const EmailVerificationEmailInput = Schema.Struct({
  idempotencyKey: EmailIdempotencyKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  verificationUrl: VerificationUrl,
});

export type EmailVerificationEmailInput = Schema.Schema.Type<
  typeof EmailVerificationEmailInput
>;

const decodeEmailVerificationEmailInput = Schema.decodeUnknown(
  EmailVerificationEmailInput
);

const sendEmailVerificationEmail = Effect.fn(
  "AuthEmailSender.sendEmailVerificationEmail"
)(function* sendEmailVerificationEmail(rawInput: unknown) {
  const input = yield* decodeEmailVerificationEmailInput(rawInput).pipe(
    Effect.mapError(
      (parseError) =>
        new EmailVerificationDeliveryError({
          message: "Invalid verification email input",
          cause: ParseResult.TreeFormatter.formatErrorSync(parseError),
        })
    )
  );

  const subject = "Verify your email";
  const text = [
    `Hello ${input.recipientName},`,
    "",
    "Use this link to verify your email:",
    input.verificationUrl,
  ].join("\\n");
  const html = [
    `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
    `<p><a href="${escapeHtml(input.verificationUrl)}">Verify your email</a></p>`,
  ].join("");

  yield* transport
    .send({
      idempotencyKey: input.idempotencyKey,
      to: input.recipientEmail,
      subject,
      text,
      html,
    })
    .pipe(
      Effect.mapError(
        (error) =>
          new EmailVerificationDeliveryError({
            message: "Failed to deliver verification email",
            cause: error.message,
          })
      )
    );
});

return { sendPasswordResetEmail, sendEmailVerificationEmail };
```

- [ ] **Step 5: Run the auth email service tests again**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts
```

Expected: PASS for both password reset and the new verification delivery cases.

- [ ] **Step 6: Commit the auth email boundary extension**

Run:

```bash
git add \
  apps/api/src/domains/identity/authentication/auth-email-errors.ts \
  apps/api/src/domains/identity/authentication/auth-email.ts \
  apps/api/src/domains/identity/authentication/auth-email.test.ts
git commit -m "feat(api): add email verification delivery service"
```

## Task 2: Wire Better Auth Verification On The API

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/config.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`

- [ ] **Step 1: Add failing API config assertions for the verification policy**

Update `apps/api/src/domains/identity/authentication/authentication.test.ts`:

```ts
expect(config).toMatchObject({
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendOnSignIn: false,
    sendOnSignUp: true,
  },
});
```

- [ ] **Step 2: Run the auth config tests and confirm they fail**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
```

Expected: FAIL because `makeAuthenticationConfig()` does not include `emailVerification` yet.

- [ ] **Step 3: Add the Better Auth verification policy to the config factory**

Update `apps/api/src/domains/identity/authentication/config.ts`:

```ts
export interface AuthenticationConfig {
  // existing fields
  readonly emailVerification: {
    readonly autoSignInAfterVerification: false;
    readonly expiresIn: 3600;
    readonly sendOnSignIn: false;
    readonly sendOnSignUp: true;
  };
}

export function makeAuthenticationConfig(
  environment: AuthenticationEnvironment
): AuthenticationConfig {
  return {
    // existing fields
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
    },
  };
}
```

- [ ] **Step 4: Wire Better Auth `emailVerification.sendVerificationEmail` through the auth email boundary**

Update `apps/api/src/domains/identity/authentication/auth.ts`:

```ts
import type { EmailVerificationEmailInput } from "./auth-email.js";

export function createAuthentication(options: {
  readonly backgroundTaskHandler: (task: Promise<unknown>) => void;
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase<typeof authSchema>;
  readonly reportPasswordResetEmailFailure: (error: unknown) => void;
  readonly reportVerificationEmailFailure: (error: unknown) => void;
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
  readonly sendVerificationEmail: (
    input: EmailVerificationEmailInput
  ) => Promise<void>;
}) {
  const { config, database, sendPasswordResetEmail, sendVerificationEmail } =
    options;

  return betterAuth({
    ...authConfig,
    emailVerification: {
      ...authConfig.emailVerification,
      sendVerificationEmail: async ({ user, token, url }) => {
        try {
          await sendVerificationEmail({
            idempotencyKey: `email-verification/${user.id}/${token}`,
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            verificationUrl: url,
          } as const satisfies EmailVerificationEmailInput);
        } catch (error) {
          options.reportVerificationEmailFailure(error);
          throw error;
        }
      },
    },
    emailAndPassword: {
      ...authConfig.emailAndPassword,
      sendResetPassword: async ({ token, user, url }) => {
        // existing password reset implementation
      },
    },
  });
}
```

- [ ] **Step 5: Add a verification email failure reporter alongside the existing reset reporter**

In `apps/api/src/domains/identity/authentication/auth.ts`, mirror the current background logging helper:

```ts
function makeVerificationEmailFailureReporter(runtime: Runtime.Runtime<never>) {
  const runFork = Runtime.runFork(runtime);

  return (error: unknown) => {
    runFork(
      Effect.logError("Verification email delivery failed", {
        error: serializeBackgroundTaskError(error),
      })
    );
  };
}
```

Then thread it into the live layer construction where `createAuthentication()` is called:

```ts
const reportVerificationEmailFailure =
  makeVerificationEmailFailureReporter(runtime);

const sendVerificationEmail = (input: EmailVerificationEmailInput) =>
  Runtime.runPromise(runtime)(
    AuthEmailSender.sendEmailVerificationEmail(input)
  );
```

- [ ] **Step 6: Run the API auth unit tests**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS with the new `emailVerification` config assertions.

- [ ] **Step 7: Commit the Better Auth verification wiring**

Run:

```bash
git add \
  apps/api/src/domains/identity/authentication/config.ts \
  apps/api/src/domains/identity/authentication/auth.ts \
  apps/api/src/domains/identity/authentication/authentication.test.ts
git commit -m "feat(api): wire better auth email verification"
```

## Task 3: Add API Integration Coverage For Verification Delivery And Redirects

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`

- [ ] **Step 1: Add failing integration coverage for sign-up delivery, resend, verification, and session update**

Append to `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`:

```ts
it("sends verification mail on sign-up, supports resend, and marks the session user verified after the verification redirect", async (context: {
  skip: (note?: string) => never;
}) => {
  const testDatabase = await createTestDatabase();
  cleanup.push(testDatabase.cleanup);

  const databaseUrl = testDatabase.url;
  const adminPool = new Pool({ connectionString: databaseUrl });
  cleanup.push(() => adminPool.end());

  if (!(await canConnect(adminPool))) {
    context.skip(
      "Auth integration database unavailable; skipping email verification coverage"
    );
  }

  await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
  await applyMigration(databaseUrl, "0001_giant_speedball.sql");
  await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
  await applyMigration(databaseUrl, "0003_organizations.sql");

  const authPool = new Pool({ connectionString: databaseUrl });
  cleanup.push(() => authPool.end());

  const deliveredVerificationUrls: string[] = [];
  const auth = createAuthentication({
    backgroundTaskHandler: async (task) => {
      await task;
    },
    config: makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl,
    }),
    database: drizzle(authPool, { schema: authSchema }),
    reportPasswordResetEmailFailure: () => {},
    reportVerificationEmailFailure: () => {},
    sendPasswordResetEmail: async () => {},
    sendVerificationEmail: async ({ verificationUrl }) => {
      deliveredVerificationUrls.push(verificationUrl);
    },
  });

  const cookieJar = new Map<string, string>();

  const signUpResponse = await auth.handler(
    makeJsonRequest("/sign-up/email", {
      email: "verify-flow@example.com",
      name: "Verify Flow User",
      password: "correct horse battery staple",
      callbackURL: "http://127.0.0.1:4173/verify-email",
    })
  );
  updateCookieJar(cookieJar, signUpResponse);
  expect(signUpResponse.status).toBe(200);
  expect(deliveredVerificationUrls).toHaveLength(1);
  expect(deliveredVerificationUrls[0]).toContain("/verify-email?token=");
  expect(deliveredVerificationUrls[0]).toContain(
    "callbackURL=http%3A%2F%2F127.0.0.1%3A4173%2Fverify-email"
  );

  const resendResponse = await auth.handler(
    makeJsonRequest(
      "/send-verification-email",
      {
        email: "verify-flow@example.com",
        callbackURL: "http://127.0.0.1:4173/verify-email",
      },
      { cookieJar }
    )
  );
  expect(resendResponse.status).toBe(200);
  expect(deliveredVerificationUrls).toHaveLength(2);

  const verificationUrl = new URL(deliveredVerificationUrls.at(-1) ?? "");
  const verifyResponse = await auth.handler(
    makeRequest(`${verificationUrl.pathname}${verificationUrl.search}`, {
      cookieJar,
    })
  );

  expect(verifyResponse.status).toBe(302);
  expect(verifyResponse.headers.get("location")).toBe(
    "http://127.0.0.1:4173/verify-email"
  );

  const sessionResponse = await auth.handler(
    makeRequest("/get-session", { cookieJar })
  );
  const session = (await sessionResponse.json()) as SessionResponse;
  expect(session?.user.emailVerified).toBe(true);
});
```

- [ ] **Step 2: Run the integration test and confirm it fails before implementation is complete**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.integration.test.ts -t "sends verification mail on sign-up, supports resend, and marks the session user verified after the verification redirect"
```

Expected: FAIL until the auth wiring from Task 2 is in place.

- [ ] **Step 3: Re-run the targeted integration test after Task 2 is complete**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.integration.test.ts -t "sends verification mail on sign-up, supports resend, and marks the session user verified after the verification redirect"
```

Expected: PASS with captured verification URLs and `emailVerified: true` after the redirect.

- [ ] **Step 4: Commit the API integration coverage**

Run:

```bash
git add apps/api/src/domains/identity/authentication/authentication.integration.test.ts
git commit -m "test(api): cover email verification lifecycle"
```

## Task 4: Add The Public Verification Result Route

**Files:**

- Create: `apps/app/src/features/auth/email-verification-search.ts`
- Create: `apps/app/src/features/auth/email-verification-search.test.ts`
- Create: `apps/app/src/features/auth/email-verification-page.tsx`
- Create: `apps/app/src/features/auth/email-verification-page.test.tsx`
- Create: `apps/app/src/routes/verify-email.tsx`
- Modify: `apps/app/src/lib/auth-client.ts`
- Modify: `apps/app/src/features/auth/signup-page.tsx`
- Modify: `apps/app/src/features/auth/signup-page.test.tsx`

- [ ] **Step 1: Write the failing verification search parser tests**

Create `apps/app/src/features/auth/email-verification-search.test.ts`:

```ts
import { decodeEmailVerificationSearch } from "./email-verification-search";

describe("email verification search", () => {
  it("keeps the route in the success state when no error is present", () => {
    expect(decodeEmailVerificationSearch({})).toStrictEqual({
      status: "success",
    });
  });

  it("normalizes Better Auth invalid-token errors", () => {
    expect(
      decodeEmailVerificationSearch({ error: "invalid_token" })
    ).toStrictEqual({
      status: "invalid-token",
    });
  });
});
```

- [ ] **Step 2: Add the verification search parser**

Create `apps/app/src/features/auth/email-verification-search.ts`:

```ts
import { ParseResult, Schema } from "effect";

const INVALID_TOKEN = "invalid_token" as const;

const RawEmailVerificationSearch = Schema.Struct({
  error: Schema.optional(Schema.Unknown),
});

const EmailVerificationSearch = Schema.transform(
  RawEmailVerificationSearch,
  Schema.Union(
    Schema.Struct({ status: Schema.Literal("success") }),
    Schema.Struct({ status: Schema.Literal("invalid-token") })
  ),
  {
    strict: true,
    decode: ({ error }) =>
      error === INVALID_TOKEN
        ? { status: "invalid-token" as const }
        : { status: "success" as const },
    encode: (search) =>
      search.status === "invalid-token" ? { error: INVALID_TOKEN } : {},
  }
);

export type EmailVerificationSearch = typeof EmailVerificationSearch.Type;

export function decodeEmailVerificationSearch(
  input: unknown
): EmailVerificationSearch {
  return ParseResult.decodeUnknownSync(EmailVerificationSearch)(input);
}
```

- [ ] **Step 3: Add a helper for the verification callback target and use it in sign-up**

Update `apps/app/src/lib/auth-client.ts`:

```ts
export function buildEmailVerificationRedirectTo(origin: string): string {
  return new URL("/verify-email", origin).toString();
}
```

Update `apps/app/src/features/auth/signup-page.tsx`:

```ts
import {
  authClient,
  buildEmailVerificationRedirectTo,
} from "#/lib/auth-client";

const result = await authClient.signUp.email({
  name: credentials.name,
  email: credentials.email,
  password: credentials.password,
  callbackURL: buildEmailVerificationRedirectTo(window.location.origin),
});
```

Update `apps/app/src/features/auth/signup-page.test.tsx`:

```ts
await waitFor(() => {
  expect(mockedSignUpEmail).toHaveBeenCalledWith({
    name: "Taylor Example",
    email: "person@example.com",
    password: "password123",
    callbackURL: "http://localhost:3000/verify-email",
  });
});
```

Before rendering `SignupPage` in the test, stub the browser origin:

```ts
vi.stubGlobal("window", {
  location: {
    origin: "http://localhost:3000",
  },
});
```

- [ ] **Step 4: Add the public verification result page and route**

Create `apps/app/src/features/auth/email-verification-page.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";

import { decodeEmailVerificationSearch } from "./email-verification-search";

export function EmailVerificationPage(props: { search?: { error?: string } }) {
  const search = decodeEmailVerificationSearch(props.search ?? {});

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {search.status === "success"
              ? "Email verified"
              : "Verification link invalid"}
          </CardTitle>
          <CardDescription>
            {search.status === "success"
              ? "Your email address is verified. You can continue in the app or sign in again if needed."
              : "This verification link is invalid or has expired. Request a fresh verification email from the app."}
          </CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="flex-col items-stretch gap-4">
          <Link
            to="/"
            className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Go to the app
          </Link>
          <Link
            to="/login"
            className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
```

Create `apps/app/src/routes/verify-email.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { EmailVerificationPage } from "#/features/auth/email-verification-page";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: VerifyEmailRoute,
});

function VerifyEmailRoute() {
  return <EmailVerificationPage search={Route.useSearch()} />;
}
```

- [ ] **Step 5: Add the public result page tests**

Create `apps/app/src/features/auth/email-verification-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { EmailVerificationPage } from "./email-verification-page";

describe("email verification page", () => {
  it("shows the success state by default", () => {
    render(<EmailVerificationPage />);

    expect(screen.getByText("Email verified")).toBeInTheDocument();
    expect(screen.getByText("Go to the app")).toBeInTheDocument();
  });

  it("shows the invalid-link state when Better Auth redirects with invalid_token", () => {
    render(<EmailVerificationPage search={{ error: "invalid_token" }} />);

    expect(screen.getByText("Verification link invalid")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This verification link is invalid or has expired. Request a fresh verification email from the app."
      )
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the app tests for the public verification route**

Run:

```bash
pnpm --filter app test -- \
  src/features/auth/email-verification-search.test.ts \
  src/features/auth/email-verification-page.test.tsx \
  src/features/auth/signup-page.test.tsx
```

Expected: PASS with the callback URL included in sign-up requests and the new public route covered.

- [ ] **Step 7: Commit the public verification result route**

Run:

```bash
git add \
  apps/app/src/lib/auth-client.ts \
  apps/app/src/features/auth/email-verification-search.ts \
  apps/app/src/features/auth/email-verification-search.test.ts \
  apps/app/src/features/auth/email-verification-page.tsx \
  apps/app/src/features/auth/email-verification-page.test.tsx \
  apps/app/src/routes/verify-email.tsx \
  apps/app/src/features/auth/signup-page.tsx \
  apps/app/src/features/auth/signup-page.test.tsx
git commit -m "feat(app): add public email verification result route"
```

## Task 5: Add The In-App Verification Banner And Resend Flow

**Files:**

- Create: `apps/app/src/components/ui/alert.tsx`
- Create: `apps/app/src/features/auth/email-verification-banner.tsx`
- Create: `apps/app/src/features/auth/email-verification-banner.test.tsx`
- Modify: `apps/app/src/components/app-layout.tsx`
- Modify: `apps/app/src/components/app-layout.test.tsx`
- Modify: `apps/app/src/features/auth/auth-form-errors.ts`
- Modify: `apps/app/src/features/auth/auth-form-errors.test.ts`
- Modify: `apps/app/src/features/auth/authenticated-app-layout.tsx`
- Modify: `apps/app/src/features/auth/authenticated-app-layout.test.tsx`

- [ ] **Step 1: Add the shadcn alert primitive**

Run:

```bash
pnpm dlx shadcn@latest add alert
```

Working directory:

```bash
cd /Users/cillianbarron/Documents/Development/task-tracker/apps/app
```

Expected: `apps/app/src/components/ui/alert.tsx` is created using the project’s `base-luma` shadcn config.

- [ ] **Step 2: Add a shared resend-verification error helper**

Update `apps/app/src/features/auth/auth-form-errors.ts`:

```ts
export function getEmailVerificationFailureMessage(error: unknown): string {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
  }

  return "We couldn't send a verification email. Please try again.";
}
```

Append to `apps/app/src/features/auth/auth-form-errors.test.ts`:

```ts
it("preserves the shared rate-limit copy for verification emails", () => {
  expect(
    getEmailVerificationFailureMessage({
      status: 429,
    })
  ).toBe("Too many attempts. Please wait and try again.");
});
```

- [ ] **Step 3: Write the failing banner tests**

Create `apps/app/src/features/auth/email-verification-banner.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { EmailVerificationBanner } from "./email-verification-banner";

const { mockedSendVerificationEmail } = vi.hoisted(() => ({
  mockedSendVerificationEmail: vi.fn(),
}));

vi.mock("#/lib/auth-client", async () => {
  const actual =
    await vi.importActual<typeof import("#/lib/auth-client")>(
      "#/lib/auth-client"
    );

  return {
    ...actual,
    authClient: {
      sendVerificationEmail: mockedSendVerificationEmail,
    } as unknown as typeof AuthClient,
  };
});

describe("email verification banner", () => {
  beforeEach(() => {
    mockedSendVerificationEmail.mockResolvedValue({
      data: { status: true },
      error: null,
    });
  });

  it("does not render for verified users", () => {
    const { container } = render(
      <EmailVerificationBanner email="person@example.com" emailVerified />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("sends a verification email for unverified users", async () => {
    const user = userEvent.setup();
    render(
      <EmailVerificationBanner
        email="person@example.com"
        emailVerified={false}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Resend verification email" })
    );

    await waitFor(() => {
      expect(mockedSendVerificationEmail).toHaveBeenCalledWith({
        email: "person@example.com",
        callbackURL: "http://localhost:3000/verify-email",
      });
    });
  });
});
```

- [ ] **Step 4: Implement the resend banner**

Create `apps/app/src/features/auth/email-verification-banner.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  authClient,
  buildEmailVerificationRedirectTo,
} from "#/lib/auth-client";

import { getEmailVerificationFailureMessage } from "./auth-form-errors";

export function EmailVerificationBanner(props: {
  email: string;
  emailVerified: boolean;
}) {
  const [errorText, setErrorText] = useState<string>();
  const [successText, setSuccessText] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (props.emailVerified) {
    return null;
  }

  return (
    <Alert>
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription className="flex flex-col gap-4">
        <p>
          {props.email} is not verified yet. Check your inbox for the
          verification link, or request another email.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={async () => {
              setErrorText(undefined);
              setSuccessText(undefined);
              setIsSubmitting(true);

              const result = await authClient.sendVerificationEmail({
                email: props.email,
                callbackURL: buildEmailVerificationRedirectTo(
                  window.location.origin
                ),
              });

              if (result.error) {
                setErrorText(getEmailVerificationFailureMessage(result.error));
                setIsSubmitting(false);
                return;
              }

              setSuccessText("A new verification email is on the way.");
              setIsSubmitting(false);
            }}
          >
            {isSubmitting
              ? "Sending verification email..."
              : "Resend verification email"}
          </Button>
          {successText ? (
            <p className="text-sm text-muted-foreground">{successText}</p>
          ) : null}
          {errorText ? (
            <p className="text-sm text-destructive">{errorText}</p>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 5: Render the banner in the authenticated shell**

Update `apps/app/src/components/app-layout.tsx`:

```tsx
import { EmailVerificationBanner } from "#/features/auth/email-verification-banner";

export interface AppLayoutProps {
  user: NavUserAccount | null;
  email?: string;
  emailVerified?: boolean;
}

export function AppLayout({ user, email, emailVerified }: AppLayoutProps) {
  return (
    <SidebarProvider className="flex flex-col [--header-height:calc(--spacing(14))]">
      <SiteHeader />
      <div className="flex flex-1">
        <AppSidebar user={user} />
        <SidebarInset>
          <div className="flex flex-1 flex-col gap-4 p-4">
            {email ? (
              <EmailVerificationBanner
                email={email}
                emailVerified={Boolean(emailVerified)}
              />
            ) : null}
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
```

Update `apps/app/src/features/auth/authenticated-app-layout.tsx`:

```tsx
return (
  <AppLayout
    user={session.user}
    email={session.user.email}
    emailVerified={session.user.emailVerified}
  />
);
```

- [ ] **Step 6: Update the shell tests**

Update `apps/app/src/components/app-layout.test.tsx`:

```tsx
vi.mock("#/features/auth/email-verification-banner", () => ({
  EmailVerificationBanner: ({
    email,
    emailVerified,
  }: {
    email: string;
    emailVerified: boolean;
  }) => (
    <div data-testid="email-verification-banner">
      {email}:{String(emailVerified)}
    </div>
  ),
}));

expect(mockedAppSidebar.mock.calls[0]?.[0]).toStrictEqual({
  user: {
    name: "Taylor Example",
    email: "person@example.com",
    image: null,
  },
});
expect(screen.getByTestId("email-verification-banner")).toHaveTextContent(
  "person@example.com:false"
);
```

Update `apps/app/src/features/auth/authenticated-app-layout.test.tsx`:

```tsx
expect(mockedAppLayout.mock.calls[0]?.[0]).toStrictEqual({
  user: {
    name: "Taylor Example",
    email: "person@example.com",
    image: null,
  },
  email: "person@example.com",
  emailVerified: false,
});
```

- [ ] **Step 7: Run the app shell and banner tests**

Run:

```bash
pnpm --filter app test -- \
  src/features/auth/auth-form-errors.test.ts \
  src/features/auth/email-verification-banner.test.tsx \
  src/components/app-layout.test.tsx \
  src/features/auth/authenticated-app-layout.test.tsx
```

Expected: PASS with the reminder visible for unverified sessions and hidden for verified ones.

- [ ] **Step 8: Commit the banner flow**

Run:

```bash
git add \
  apps/app/src/components/ui/alert.tsx \
  apps/app/src/features/auth/auth-form-errors.ts \
  apps/app/src/features/auth/auth-form-errors.test.ts \
  apps/app/src/features/auth/email-verification-banner.tsx \
  apps/app/src/features/auth/email-verification-banner.test.tsx \
  apps/app/src/components/app-layout.tsx \
  apps/app/src/components/app-layout.test.tsx \
  apps/app/src/features/auth/authenticated-app-layout.tsx \
  apps/app/src/features/auth/authenticated-app-layout.test.tsx
git commit -m "feat(app): add email verification reminder banner"
```

## Task 6: Update Architecture Docs And Run Final Verification

**Files:**

- Modify: `docs/architecture/auth.md`
- Modify: `docs/architecture/auth-next-steps.md`

- [ ] **Step 1: Update the auth architecture document**

In `docs/architecture/auth.md`, add:

```md
- email verification link delivery through `AuthEmailSender`
- a public `/verify-email` result route outside `/_app`
- a non-blocking authenticated-shell reminder when `session.user.emailVerified`
  is false
- resend verification mail from the app shell
```

Also remove the outdated line that says the auth slice does not support email verification yet.

- [ ] **Step 2: Update the auth roadmap document**

In `docs/architecture/auth-next-steps.md`, replace:

```md
1. email verification
2. transactional auth email polish on the shared delivery boundary
3. organization or workspace-aware identity, if the product needs it
```

with:

```md
1. transactional auth email polish on the shared delivery boundary
2. organization or workspace-aware identity, if the product needs it
3. role and permission checks
```

and update the email verification section so it describes the now-implemented
policy:

```md
- verification is link-based
- verification is non-blocking for app access
- the authenticated shell shows a resend reminder until verification completes
```

- [ ] **Step 3: Run the focused API and app suites**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication
pnpm --filter app test -- src/features/auth src/components/app-layout.test.tsx
pnpm --filter api check-types
pnpm --filter app check-types
```

Expected: PASS across auth API tests, auth app tests, and workspace type checks.

- [ ] **Step 4: Run the monorepo verification commands**

Run:

```bash
pnpm run check-types
pnpm run build
```

Expected: PASS for the full workspace.

- [ ] **Step 5: Commit the docs and verification pass**

Run:

```bash
git add \
  docs/architecture/auth.md \
  docs/architecture/auth-next-steps.md
git commit -m "docs(auth): document email verification flow"
```

- [ ] **Step 6: Summarize completion evidence in the work log or PR body**

Capture:

```md
- `pnpm --filter api test -- src/domains/identity/authentication`
- `pnpm --filter app test -- src/features/auth src/components/app-layout.test.tsx`
- `pnpm --filter api check-types`
- `pnpm --filter app check-types`
- `pnpm run check-types`
- `pnpm run build`
```

Use that summary in the final handoff or PR description.
