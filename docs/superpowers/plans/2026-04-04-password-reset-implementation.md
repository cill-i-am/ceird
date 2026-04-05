# Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Better Auth password reset support across `apps/api` and `apps/app`, including a swappable Effect-based auth email boundary, Resend as the first adapter, public reset request and completion routes, and regression coverage for the full reset lifecycle.

**Architecture:** Keep Better Auth as the source of truth for `/api/auth/request-password-reset` and `/api/auth/reset-password`. In `apps/api`, introduce a narrow auth-domain email service that composes password reset messages and delegates provider delivery to a Resend-backed transport layer. In `apps/app`, add two public routes outside `/_app`: `/forgot-password` for reset requests and `/reset-password` for reset completion, both using TanStack Form plus `Effect/Schema` and safe, non-enumerating UX copy.

**Tech Stack:** Better Auth, Effect, Effect Schema, TanStack Start, TanStack Router, TanStack Form, Resend, Vitest, Testing Library

---

## File Structure

**Create:**

- `apps/api/src/domains/identity/authentication/auth-email-config.ts` — validated auth-email delivery config loaded through `Config`
- `apps/api/src/domains/identity/authentication/auth-email-errors.ts` — explicit tagged errors for auth email configuration and delivery failures
- `apps/api/src/domains/identity/authentication/auth-email.ts` — auth-domain `AuthEmailSender` service plus the provider transport port and reset email input schema
- `apps/api/src/domains/identity/authentication/auth-email.test.ts` — unit tests for config loading, message composition, and error remapping
- `apps/api/src/domains/identity/authentication/resend-auth-email-transport.ts` — Resend-backed live transport layer
- `apps/api/src/domains/identity/authentication/resend-auth-email-transport.test.ts` — adapter tests for Resend payload shape and failure mapping
- `apps/app/src/features/auth/password-reset-search.ts` — parser for `token` and `error` query parameters on `/reset-password`
- `apps/app/src/features/auth/password-reset-search.test.ts` — unit tests for reset search parsing
- `apps/app/src/features/auth/password-reset-request-page.tsx` — public forgot-password form and generic success state
- `apps/app/src/features/auth/password-reset-request-page.test.tsx` — component tests for request-page validation and generic UX
- `apps/app/src/features/auth/password-reset-page.tsx` — public reset-password completion page
- `apps/app/src/features/auth/password-reset-page.test.tsx` — component tests for completion-page validation and token-state handling
- `apps/app/src/routes/forgot-password.tsx` — public route for the reset-request page
- `apps/app/src/routes/reset-password.tsx` — public route for the reset-completion page

**Modify:**

- `apps/api/package.json` — add the Resend dependency
- `apps/api/src/domains/identity/authentication/auth.ts` — inject password-reset delivery into Better Auth’s native config and wire the live email service at layer construction time
- `apps/api/src/domains/identity/authentication/authentication.integration.test.ts` — verify native reset request and reset completion flows using captured reset URLs
- `apps/app/src/lib/auth-client.ts` — add a typed helper to build the public reset completion redirect target
- `apps/app/src/features/auth/auth-schemas.ts` — add request-reset and reset-completion schemas
- `apps/app/src/features/auth/auth-schema.test.ts` — cover the new schemas
- `apps/app/src/features/auth/auth-form-errors.ts` — add password-reset-safe error mapping helpers
- `apps/app/src/features/auth/login-page.tsx` — add a discoverable “Forgot password?” affordance
- `apps/app/src/features/auth/login-page.test.tsx` — assert the forgot-password affordance is present
- `docs/architecture/auth.md` — document the new password reset flow and auth email boundary
- `docs/architecture/auth-next-steps.md` — update the next-step guidance now that reset is no longer future work

## Task 1: Add The Backend Auth Email Boundary

**Files:**

- Modify: `apps/api/package.json`
- Create: `apps/api/src/domains/identity/authentication/auth-email-config.ts`
- Create: `apps/api/src/domains/identity/authentication/auth-email-errors.ts`
- Create: `apps/api/src/domains/identity/authentication/auth-email.ts`
- Create: `apps/api/src/domains/identity/authentication/auth-email.test.ts`

- [ ] **Step 1: Add the Resend dependency to the API workspace**

Run:

```bash
pnpm --filter api add resend
```

Expected: `apps/api/package.json` gains `resend` only in the API workspace.

- [ ] **Step 2: Write the failing auth email service tests**

Create `apps/api/src/domains/identity/authentication/auth-email.test.ts`:

```ts
import { Context, Effect, Layer } from "effect";

import {
  AuthEmailConfigurationError,
  AuthEmailDeliveryError,
  PasswordResetDeliveryError,
} from "./auth-email-errors.js";
import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import { loadAuthEmailConfig } from "./auth-email-config.js";

describe("AuthEmailSender", () => {
  it("composes the expected password reset message", async () => {
    const sent: Array<{ subject: string; text: string; to: string }> = [];

    const program = AuthEmailSender.sendPasswordResetEmail({
      recipientEmail: "person@example.com",
      recipientName: "Taylor Example",
      resetUrl:
        "https://app.task-tracker.localhost:1355/reset-password?token=test-token",
    }).pipe(
      Effect.provide(
        Layer.succeed(AuthEmailTransport, {
          send: (message) =>
            Effect.sync(() => {
              sent.push({
                subject: message.subject,
                text: message.text,
                to: message.to,
              });
            }),
        })
      ),
      Effect.provide(AuthEmailSender.Default)
    );

    await Effect.runPromise(program);

    expect(sent).toEqual([
      expect.objectContaining({
        subject: "Reset your password",
        to: "person@example.com",
      }),
    ]);
    expect(sent[0]?.text).toContain("Taylor Example");
    expect(sent[0]?.text).toContain("/reset-password?token=test-token");
  });

  it("maps provider failures into PasswordResetDeliveryError", async () => {
    const program = AuthEmailSender.sendPasswordResetEmail({
      recipientEmail: "person@example.com",
      recipientName: "Taylor Example",
      resetUrl:
        "https://app.task-tracker.localhost:1355/reset-password?token=test-token",
    }).pipe(
      Effect.provide(
        Layer.succeed(AuthEmailTransport, {
          send: () =>
            Effect.fail(
              new AuthEmailDeliveryError({
                message: "Provider rejected the message",
                provider: "resend",
              })
            ),
        })
      ),
      Effect.provide(AuthEmailSender.Default)
    );

    await expect(Effect.runPromise(program)).rejects.toMatchObject({
      _tag: "PasswordResetDeliveryError",
    });
  });

  it("requires auth email config through Config", async () => {
    const result = Effect.runPromise(loadAuthEmailConfig);

    await expect(result).rejects.toThrow(/AUTH_EMAIL_FROM|RESEND_API_KEY/);
  });
});
```

- [ ] **Step 3: Add the auth email error types**

Create `apps/api/src/domains/identity/authentication/auth-email-errors.ts`:

```ts
import { Schema } from "effect";

export class AuthEmailConfigurationError extends Schema.TaggedError<AuthEmailConfigurationError>()(
  "@task-tracker/domains/identity/authentication/AuthEmailConfigurationError",
  {
    message: Schema.String,
    path: Schema.optional(Schema.String),
  }
) {}

export class AuthEmailDeliveryError extends Schema.TaggedError<AuthEmailDeliveryError>()(
  "@task-tracker/domains/identity/authentication/AuthEmailDeliveryError",
  {
    message: Schema.String,
    provider: Schema.String,
    cause: Schema.optional(Schema.String),
  }
) {}

export class PasswordResetDeliveryError extends Schema.TaggedError<PasswordResetDeliveryError>()(
  "@task-tracker/domains/identity/authentication/PasswordResetDeliveryError",
  {
    message: Schema.String,
    recipientEmail: Schema.String,
    cause: Schema.optional(Schema.String),
  }
) {}
```

- [ ] **Step 4: Add the config loader**

Create `apps/api/src/domains/identity/authentication/auth-email-config.ts`:

```ts
import { Config, Effect } from "effect";

export interface AuthEmailConfig {
  readonly from: string;
  readonly fromName: string;
  readonly resendApiKey: string;
}

export const loadAuthEmailConfig = Effect.gen(function* () {
  const from = yield* Config.string("AUTH_EMAIL_FROM").pipe(
    Config.mapError(
      (message) =>
        new AuthEmailConfigurationError({
          message,
          path: "AUTH_EMAIL_FROM",
        })
    )
  );
  const fromName = yield* Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Task Tracker")
  );
  const resendApiKey = yield* Config.string("RESEND_API_KEY").pipe(
    Config.mapError(
      (message) =>
        new AuthEmailConfigurationError({
          message,
          path: "RESEND_API_KEY",
        })
    )
  );

  return { from, fromName, resendApiKey } satisfies AuthEmailConfig;
});
```

- [ ] **Step 5: Add the auth email service**

Create `apps/api/src/domains/identity/authentication/auth-email.ts`:

```ts
import { Context, Effect, Schema } from "effect";

import {
  AuthEmailDeliveryError,
  PasswordResetDeliveryError,
} from "./auth-email-errors.js";

const EmailAddress = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);

const AbsoluteUrl = Schema.String.pipe(Schema.pattern(/^https?:\/\//));

export const PasswordResetEmailInput = Schema.Struct({
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  resetUrl: AbsoluteUrl,
});

export type PasswordResetEmailInput = Schema.Schema.Type<
  typeof PasswordResetEmailInput
>;

export interface TransportMessage {
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

export class AuthEmailTransport extends Context.Tag(
  "@task-tracker/domains/identity/authentication/AuthEmailTransport"
)<
  AuthEmailTransport,
  {
    readonly send: (
      message: TransportMessage
    ) => Effect.Effect<void, AuthEmailDeliveryError>;
  }
>() {}

export class AuthEmailSender extends Effect.Service<AuthEmailSender>()(
  "@task-tracker/domains/identity/authentication/AuthEmailSender",
  {
    effect: Effect.gen(function* () {
      const transport = yield* AuthEmailTransport;

      const sendPasswordResetEmail = Effect.fn(
        "AuthEmailSender.sendPasswordResetEmail"
      )(function* (input: PasswordResetEmailInput) {
        const subject = "Reset your password";
        const text = `Hello ${input.recipientName},\n\nUse this link to reset your password:\n${input.resetUrl}`;

        yield* transport
          .send({
            to: input.recipientEmail,
            subject,
            text,
            html: `<p>Hello ${input.recipientName},</p><p><a href="${input.resetUrl}">Reset your password</a></p>`,
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new PasswordResetDeliveryError({
                  message: "Failed to deliver password reset email",
                  recipientEmail: input.recipientEmail,
                  cause: error.message,
                })
            )
          );
      });

      return { sendPasswordResetEmail };
    }),
  }
) {}
```

- [ ] **Step 6: Run the unit tests to confirm the red-to-green path**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts
```

Expected: PASS after the new service and config files are in place.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/domains/identity/authentication/auth-email-config.ts apps/api/src/domains/identity/authentication/auth-email-errors.ts apps/api/src/domains/identity/authentication/auth-email.ts apps/api/src/domains/identity/authentication/auth-email.test.ts
git commit -m "feat(api): add auth email service boundary"
```

## Task 2: Add The Resend Adapter And Better Auth Reset Wiring

**Files:**

- Create: `apps/api/src/domains/identity/authentication/resend-auth-email-transport.ts`
- Create: `apps/api/src/domains/identity/authentication/resend-auth-email-transport.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`

- [ ] **Step 1: Write the failing Resend adapter and auth wiring tests**

Create `apps/api/src/domains/identity/authentication/resend-auth-email-transport.test.ts`:

```ts
import { Effect } from "effect";

import { AuthEmailDeliveryError } from "./auth-email-errors.js";
import { makeResendAuthEmailTransport } from "./resend-auth-email-transport.js";

describe("makeResendAuthEmailTransport", () => {
  it("formats the resend payload with the configured sender", async () => {
    const sent: unknown[] = [];
    const transport = makeResendAuthEmailTransport({
      config: {
        from: "auth@task-tracker.example.com",
        fromName: "Task Tracker",
        resendApiKey: "test-key",
      },
      resend: {
        emails: {
          send: async (payload: unknown) => {
            sent.push(payload);
            return { data: { id: "email_123" }, error: null };
          },
        },
      },
    });

    await Effect.runPromise(
      transport.send({
        to: "person@example.com",
        subject: "Reset your password",
        text: "reset",
        html: "<p>reset</p>",
      })
    );

    expect(sent).toEqual([
      expect.objectContaining({
        from: "Task Tracker <auth@task-tracker.example.com>",
        to: "person@example.com",
        subject: "Reset your password",
      }),
    ]);
  });

  it("maps resend failures into AuthEmailDeliveryError", async () => {
    const transport = makeResendAuthEmailTransport({
      config: {
        from: "auth@task-tracker.example.com",
        fromName: "Task Tracker",
        resendApiKey: "test-key",
      },
      resend: {
        emails: {
          send: async () => ({
            data: null,
            error: { message: "invalid api key" },
          }),
        },
      },
    });

    await expect(
      Effect.runPromise(
        transport.send({
          to: "person@example.com",
          subject: "Reset your password",
          text: "reset",
          html: "<p>reset</p>",
        })
      )
    ).rejects.toMatchObject({
      _tag: "AuthEmailDeliveryError",
    } satisfies Partial<AuthEmailDeliveryError>);
  });
});
```

- [ ] **Step 2: Implement the Resend transport**

Create `apps/api/src/domains/identity/authentication/resend-auth-email-transport.ts`:

```ts
import { Effect, Layer } from "effect";
import { Resend } from "resend";

import { AuthEmailTransport } from "./auth-email.js";
import { loadAuthEmailConfig } from "./auth-email-config.js";
import { AuthEmailDeliveryError } from "./auth-email-errors.js";

export function makeResendAuthEmailTransport(options: {
  readonly config: {
    readonly from: string;
    readonly fromName: string;
    readonly resendApiKey: string;
  };
  readonly resend?: Pick<Resend, "emails">;
}) {
  const resend = options.resend ?? new Resend(options.config.resendApiKey);

  return {
    send: (message: {
      readonly html: string;
      readonly subject: string;
      readonly text: string;
      readonly to: string;
    }) =>
      Effect.tryPromise({
        try: async () => {
          const response = await resend.emails.send({
            from: `${options.config.fromName} <${options.config.from}>`,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
          });

          if (response.error) {
            throw new Error(response.error.message);
          }
        },
        catch: (error) =>
          new AuthEmailDeliveryError({
            message: "Resend rejected the auth email",
            provider: "resend",
            cause: error instanceof Error ? error.message : String(error),
          }),
      }),
  };
}

export const ResendAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  Effect.gen(function* () {
    const config = yield* loadAuthEmailConfig;
    return makeResendAuthEmailTransport({ config });
  })
);
```

- [ ] **Step 3: Inject password reset delivery into Better Auth**

Update `apps/api/src/domains/identity/authentication/auth.ts`:

```ts
export function createAuthentication(options: {
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase<typeof authSchema>;
  readonly sendPasswordResetEmail: (input: {
    readonly recipientEmail: string;
    readonly recipientName: string;
    readonly resetUrl: string;
  }) => Promise<void>;
}) {
  const { config, database, sendPasswordResetEmail } = options;
  const { databaseUrl: _databaseUrl, ...authConfig } = config;

  return betterAuth({
    ...authConfig,
    emailAndPassword: {
      ...authConfig.emailAndPassword,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({
          recipientEmail: user.email,
          recipientName: user.name,
          resetUrl: url,
        });
      },
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
  });
}
```

Then update `AuthenticationLive` so the live layer bridges the Effect service once, at construction time:

```ts
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const config = yield* loadAuthenticationConfig;
    const { db } = yield* AuthenticationDatabase;
    const authEmailSender = yield* AuthEmailSender;

    return createAuthentication({
      config,
      database: db,
      sendPasswordResetEmail: (input) =>
        Effect.runPromise(
          AuthEmailSender.sendPasswordResetEmail(input).pipe(
            Effect.provideService(AuthEmailSender, authEmailSender)
          )
        ),
    });
  })
).pipe(
  Layer.provide(AuthenticationDatabaseLive),
  Layer.provideMerge(AuthEmailSender.Default),
  Layer.provideMerge(ResendAuthEmailTransportLive)
);
```

- [ ] **Step 4: Extend the native Better Auth integration test**

Update `apps/api/src/domains/identity/authentication/authentication.integration.test.ts` with a reset lifecycle:

```ts
let capturedResetUrl: string | undefined;

const auth = createAuthentication({
  config: makeAuthenticationConfig({
    baseUrl: "http://127.0.0.1:3001",
    secret: "0123456789abcdef0123456789abcdef",
    databaseUrl,
  }),
  database: drizzle(authPool, { schema: authSchema }),
  sendPasswordResetEmail: async ({ resetUrl }) => {
    capturedResetUrl = resetUrl;
  },
});

const requestResetResponse = await auth.handler(
  makeJsonRequest("/request-password-reset", {
    email: "integration@example.com",
    redirectTo: "http://127.0.0.1:4173/reset-password",
  })
);
expect(requestResetResponse.status).toBe(200);
expect(capturedResetUrl).toContain("/reset-password?token=");

const token = new URL(capturedResetUrl!).searchParams.get("token");
expect(token).toBeTruthy();

const resetPasswordResponse = await auth.handler(
  makeJsonRequest("/reset-password", {
    token,
    newPassword: "new correct horse battery staple",
  })
);
expect(resetPasswordResponse.status).toBe(200);

const oldPasswordResponse = await auth.handler(
  makeJsonRequest("/sign-in/email", {
    email: "integration@example.com",
    password: "correct horse battery staple",
  })
);
expect(oldPasswordResponse.status).toBe(401);

const newPasswordResponse = await auth.handler(
  makeJsonRequest("/sign-in/email", {
    email: "integration@example.com",
    password: "new correct horse battery staple",
  })
);
expect(newPasswordResponse.status).toBe(200);
```

- [ ] **Step 5: Run the API tests**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/resend-auth-email-transport.test.ts src/domains/identity/authentication/auth-email.test.ts src/domains/identity/authentication/authentication.test.ts src/domains/identity/authentication/authentication.integration.test.ts
```

Expected: PASS with native Better Auth reset endpoints and the Resend adapter covered.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/identity/authentication/resend-auth-email-transport.ts apps/api/src/domains/identity/authentication/resend-auth-email-transport.test.ts apps/api/src/domains/identity/authentication/auth.ts apps/api/src/domains/identity/authentication/authentication.integration.test.ts
git commit -m "feat(api): wire native password reset delivery"
```

## Task 3: Add Shared App Validation And Reset Helpers

**Files:**

- Create: `apps/app/src/features/auth/password-reset-search.ts`
- Create: `apps/app/src/features/auth/password-reset-search.test.ts`
- Modify: `apps/app/src/lib/auth-client.ts`
- Modify: `apps/app/src/features/auth/auth-schemas.ts`
- Modify: `apps/app/src/features/auth/auth-schema.test.ts`
- Modify: `apps/app/src/features/auth/auth-form-errors.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `apps/app/src/features/auth/password-reset-search.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parsePasswordResetSearch } from "./password-reset-search";

describe("parsePasswordResetSearch", () => {
  it("returns a valid token when Better Auth redirected with one", () => {
    expect(
      parsePasswordResetSearch({ token: "reset-token", error: undefined })
    ).toEqual({
      error: undefined,
      token: "reset-token",
    });
  });

  it("preserves INVALID_TOKEN state from Better Auth redirects", () => {
    expect(
      parsePasswordResetSearch({ token: undefined, error: "INVALID_TOKEN" })
    ).toEqual({
      error: "INVALID_TOKEN",
      token: undefined,
    });
  });
});
```

Add new expectations to `apps/app/src/features/auth/auth-schema.test.ts`:

```ts
it("rejects short reset passwords", () => {
  expect(() =>
    decodePasswordResetInput({
      password: "short",
      confirmPassword: "short",
    })
  ).toThrow();
});

it("requires password reset confirmation to match", () => {
  expect(() =>
    decodePasswordResetInput({
      password: "password123",
      confirmPassword: "password124",
    })
  ).toThrow(/Passwords must match/);
});
```

- [ ] **Step 2: Add the shared auth schemas and redirect helper**

Update `apps/app/src/features/auth/auth-schemas.ts`:

```ts
const PasswordResetRequestInput = Schema.Struct({
  email: Email,
});

const PasswordResetInput = Schema.Struct({
  password: Password,
  confirmPassword: Password,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword),
  Schema.annotations({
    message: () => "Passwords must match",
  })
);

export type PasswordResetRequestInput = typeof PasswordResetRequestInput.Type;
export type PasswordResetInput = typeof PasswordResetInput.Type;

export const passwordResetRequestSchema = PasswordResetRequestInput;
export const passwordResetSchema = PasswordResetInput;

export function decodePasswordResetRequestInput(
  input: unknown
): PasswordResetRequestInput {
  return ParseResult.decodeUnknownSync(PasswordResetRequestInput)(input);
}

export function decodePasswordResetInput(input: unknown): PasswordResetInput {
  return ParseResult.decodeUnknownSync(PasswordResetInput)(input);
}
```

Update `apps/app/src/lib/auth-client.ts`:

```ts
export function buildPasswordResetRedirectTo(origin: string): string {
  return new URL("/reset-password", origin).toString();
}
```

Create `apps/app/src/features/auth/password-reset-search.ts`:

```ts
export function parsePasswordResetSearch(input: {
  readonly error?: string | undefined;
  readonly token?: string | undefined;
}) {
  return {
    error: input.error === "INVALID_TOKEN" ? "INVALID_TOKEN" : undefined,
    token:
      typeof input.token === "string" && input.token.length > 0
        ? input.token
        : undefined,
  } as const;
}
```

- [ ] **Step 3: Add safe reset-specific error copy**

Update `apps/app/src/features/auth/auth-form-errors.ts`:

```ts
export function getPasswordResetRequestFailureMessage(error: unknown): string {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
  }

  return "We couldn't process that request right now. Please try again.";
}

export function getPasswordResetFailureMessage(error: unknown): string {
  const authFailureError = isAuthFailureError(error) ? error : undefined;

  if (authFailureError?.status === 400 || authFailureError?.status === 401) {
    return "That reset link is invalid or expired. Request a new one.";
  }

  if (authFailureError?.status === 429) {
    return "Too many attempts. Please wait and try again.";
  }

  return "We couldn't reset your password. Please try again.";
}
```

- [ ] **Step 4: Run the shared app tests**

Run:

```bash
pnpm --filter app test -- src/features/auth/auth-schema.test.ts src/features/auth/password-reset-search.test.ts
```

Expected: PASS with request/reset schemas and reset search parsing covered.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/auth-client.ts apps/app/src/features/auth/auth-schemas.ts apps/app/src/features/auth/auth-schema.test.ts apps/app/src/features/auth/auth-form-errors.ts apps/app/src/features/auth/password-reset-search.ts apps/app/src/features/auth/password-reset-search.test.ts
git commit -m "feat(app): add password reset form primitives"
```

## Task 4: Add The Public Forgot-Password Page

**Files:**

- Create: `apps/app/src/features/auth/password-reset-request-page.tsx`
- Create: `apps/app/src/features/auth/password-reset-request-page.test.tsx`
- Create: `apps/app/src/routes/forgot-password.tsx`
- Modify: `apps/app/src/features/auth/login-page.tsx`
- Modify: `apps/app/src/features/auth/login-page.test.tsx`

- [ ] **Step 1: Write the failing forgot-password page tests**

Create `apps/app/src/features/auth/password-reset-request-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PasswordResetRequestPage } from "./password-reset-request-page";

const { mockedRequestPasswordReset } = vi.hoisted(() => ({
  mockedRequestPasswordReset: vi.fn(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    requestPasswordReset: mockedRequestPasswordReset,
  },
  buildPasswordResetRedirectTo: (origin: string) =>
    new URL("/reset-password", origin).toString(),
}));

describe("PasswordResetRequestPage", () => {
  beforeEach(() => {
    mockedRequestPasswordReset.mockResolvedValue({ data: {}, error: null });
  });

  it("submits the email and redirect target to Better Auth", async () => {
    const user = userEvent.setup();
    render(<PasswordResetRequestPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockedRequestPasswordReset).toHaveBeenCalledWith({
        email: "person@example.com",
        redirectTo: expect.stringContaining("/reset-password"),
      });
    });
  });

  it("shows the generic success state after submit", async () => {
    const user = userEvent.setup();
    render(<PasswordResetRequestPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await expect(
      screen.findByText(
        "If an account exists for that email, a reset link will be sent."
      )
    ).resolves.toBeInTheDocument();
  });
});
```

Update `apps/app/src/features/auth/login-page.test.tsx` with:

```tsx
it("renders a forgot-password link", () => {
  render(<LoginPage />);

  expect(
    screen.getByRole("link", { name: /forgot password/i })
  ).toHaveAttribute("href", "/forgot-password");
});
```

- [ ] **Step 2: Implement the request page and route**

Create `apps/app/src/features/auth/password-reset-request-page.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
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
import { authClient, buildPasswordResetRedirectTo } from "#/lib/auth-client";

import {
  getErrorText,
  getFormErrorText,
  getPasswordResetRequestFailureMessage,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import {
  decodePasswordResetRequestInput,
  passwordResetRequestSchema,
} from "./auth-schemas";

export function PasswordResetRequestPage() {
  const form = useForm({
    defaultValues: { email: "" },
    validators: {
      onSubmit: Schema.standardSchemaV1(passwordResetRequestSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });

      const input = decodePasswordResetRequestInput(value);
      const result = await authClient.requestPasswordReset({
        email: input.email,
        redirectTo: buildPasswordResetRedirectTo(window.location.origin),
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getPasswordResetRequestFailureMessage(result.error),
            fields: {},
          },
        });
        return;
      }

      formApi.reset();
      formApi.setErrorMap({
        onSubmit: {
          form: "If an account exists for that email, a reset link will be sent.",
          fields: {},
        },
      });
    },
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset link if an account
            exists.
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
              <form.Field name="email">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Email"
                      htmlFor="email"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="email"
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        placeholder="m@example.com"
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
                    {isSubmitting ? "Sending reset link..." : "Send reset link"}
                  </Button>
                )}
              </form.Subscribe>

              <div className="text-center text-sm">
                <Link to="/login" className="underline underline-offset-4">
                  Back to sign in
                </Link>
              </div>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `apps/app/src/routes/forgot-password.tsx`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { PasswordResetRequestPage } from "#/features/auth/password-reset-request-page";

export const Route = createFileRoute("/forgot-password")({
  component: PasswordResetRequestPage,
});
```

Update `apps/app/src/features/auth/login-page.tsx` by adding a secondary footer link:

```tsx
<div className="text-center text-sm">
  <Link to="/forgot-password" className="underline underline-offset-4">
    Forgot password?
  </Link>
</div>
```

- [ ] **Step 3: Run the forgot-password tests**

Run:

```bash
pnpm --filter app test -- src/features/auth/password-reset-request-page.test.tsx src/features/auth/login-page.test.tsx
```

Expected: PASS with the request page and login affordance covered.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/auth/password-reset-request-page.tsx apps/app/src/features/auth/password-reset-request-page.test.tsx apps/app/src/routes/forgot-password.tsx apps/app/src/features/auth/login-page.tsx apps/app/src/features/auth/login-page.test.tsx
git commit -m "feat(app): add forgot password page"
```

## Task 5: Add The Public Reset-Password Completion Page

**Files:**

- Create: `apps/app/src/features/auth/password-reset-page.tsx`
- Create: `apps/app/src/features/auth/password-reset-page.test.tsx`
- Create: `apps/app/src/routes/reset-password.tsx`

- [ ] **Step 1: Write the failing reset-completion page tests**

Create `apps/app/src/features/auth/password-reset-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PasswordResetPage } from "./password-reset-page";

const { mockedNavigate, mockedResetPassword } = vi.hoisted(() => ({
  mockedNavigate: vi.fn(),
  mockedResetPassword: vi.fn(),
}));

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    resetPassword: mockedResetPassword,
  },
}));

describe("PasswordResetPage", () => {
  beforeEach(() => {
    mockedResetPassword.mockResolvedValue({ data: {}, error: null });
    mockedNavigate.mockResolvedValue();
  });

  it("shows an invalid-link message when Better Auth redirected with INVALID_TOKEN", () => {
    render(<PasswordResetPage search={{ error: "INVALID_TOKEN" }} />);

    expect(
      screen.getByText(
        "That reset link is invalid or expired. Request a new one."
      )
    ).toBeInTheDocument();
  });

  it("submits the token and new password", async () => {
    const user = userEvent.setup();
    render(<PasswordResetPage search={{ token: "reset-token" }} />);

    await user.type(screen.getByLabelText("New password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockedResetPassword).toHaveBeenCalledWith({
        token: "reset-token",
        newPassword: "password123",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });
});
```

- [ ] **Step 2: Implement the reset-completion page and route**

Create `apps/app/src/features/auth/password-reset-page.tsx`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
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
import { authClient } from "#/lib/auth-client";

import {
  getErrorText,
  getFormErrorText,
  getPasswordResetFailureMessage,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { decodePasswordResetInput, passwordResetSchema } from "./auth-schemas";
import { parsePasswordResetSearch } from "./password-reset-search";

export function PasswordResetPage(props: {
  readonly search: {
    readonly error?: string | undefined;
    readonly token?: string | undefined;
  };
}) {
  const navigate = useNavigate();
  const search = parsePasswordResetSearch(props.search);

  if (!search.token) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Reset link unavailable</CardTitle>
            <CardDescription>
              That reset link is invalid or expired. Request a new one.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col items-stretch gap-4">
            <Button asChild>
              <Link to="/forgot-password">Request a new reset link</Link>
            </Button>
            <Link
              to="/login"
              className="text-center text-sm underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(passwordResetSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      const input = decodePasswordResetInput(value);
      const result = await authClient.resetPassword({
        token: search.token,
        newPassword: input.password,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getPasswordResetFailureMessage(result.error),
            fields: {},
          },
        });
        return;
      }

      await navigate({ to: "/login" });
    },
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          <CardDescription>
            Enter your new password to finish resetting your account.
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
              <form.Field name="password">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="New password"
                      htmlFor="password"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="password"
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
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

              <form.Field name="confirmPassword">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Confirm password"
                      htmlFor="confirmPassword"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="confirmPassword"
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
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
                    {isSubmitting ? "Resetting password..." : "Reset password"}
                  </Button>
                )}
              </form.Subscribe>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `apps/app/src/routes/reset-password.tsx`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { PasswordResetPage } from "#/features/auth/password-reset-page";

function ResetPasswordRouteComponent() {
  return <PasswordResetPage search={Route.useSearch()} />;
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search) => ({
    error: typeof search.error === "string" ? search.error : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordRouteComponent,
});
```

Important rule for this task: do **not** add `redirectIfAuthenticated` to `/forgot-password` or `/reset-password`. They remain public auth recovery routes, even if a signed-in user opens them.

- [ ] **Step 3: Run the reset-completion tests**

Run:

```bash
pnpm --filter app test -- src/features/auth/password-reset-page.test.tsx
```

Expected: PASS with invalid-token handling and successful reset submission covered.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/features/auth/password-reset-page.tsx apps/app/src/features/auth/password-reset-page.test.tsx apps/app/src/routes/reset-password.tsx
git commit -m "feat(app): add reset password page"
```

## Task 6: Update Docs And Run The Full Verification Pass

**Files:**

- Modify: `docs/architecture/auth.md`
- Modify: `docs/architecture/auth-next-steps.md`

- [ ] **Step 1: Update the auth architecture docs**

Update `docs/architecture/auth.md` to document:

```md
- Better Auth remains the native owner of `/api/auth/request-password-reset` and `/api/auth/reset-password`.
- `apps/api` now provides `AuthEmailSender`, a narrow auth-domain Effect service for password reset delivery.
- `ResendAuthEmailTransport` is the first provider adapter behind that service boundary.
- `/forgot-password` and `/reset-password` are public routes outside `/_app`.
- reset request responses remain generic and non-enumerating
- reset completion failures may specifically call out invalid or expired links
```

Update `docs/architecture/auth-next-steps.md` so password reset moves from “next” to “done”, and email verification becomes the next auth extension that should reuse the same auth email boundary.

- [ ] **Step 2: Run typechecks and the focused auth suite**

Run:

```bash
pnpm --filter api check-types
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts src/domains/identity/authentication/resend-auth-email-transport.test.ts src/domains/identity/authentication/authentication.test.ts src/domains/identity/authentication/authentication.integration.test.ts
pnpm --filter app check-types
pnpm --filter app test -- src/features/auth/auth-schema.test.ts src/features/auth/password-reset-search.test.ts src/features/auth/password-reset-request-page.test.tsx src/features/auth/password-reset-page.test.tsx src/features/auth/login-page.test.tsx
```

Expected: PASS across API and app auth coverage with the new password reset path in place.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/auth.md docs/architecture/auth-next-steps.md
git commit -m "docs(auth): record password reset architecture"
```

## Self-Review

- **Spec coverage:** Backend auth email service is covered by Tasks 1-2. Public reset request and completion routes are covered by Tasks 4-5. Resend swappability is covered by Task 2’s transport layer. Safe request UX and more specific invalid-link UX are covered by Tasks 4-5. Docs updates are covered by Task 6.
- **Placeholder scan:** The plan includes exact file paths, concrete test cases, commands, and commit points. No `TBD`/`TODO` placeholders or deferred implementation notes remain.
- **Type consistency:** The plan uses one shared set of names across tasks: `AuthEmailSender`, `AuthEmailTransport`, `PasswordResetEmailInput`, `PasswordResetRequestPage`, `PasswordResetPage`, `passwordResetRequestSchema`, `passwordResetSchema`, and `parsePasswordResetSearch`.
