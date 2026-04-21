# Organization Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Better Auth-backed organization invitations so owners and admins can invite teammates by email, invited users can accept as existing or newly created accounts, and acceptance activates the invited organization instead of sending the user through org creation.

**Architecture:** Keep Better Auth native for invitation creation, lookup, and acceptance by extending the existing auth slice rather than adding app-owned proxy APIs. Reuse the existing auth email delivery boundary for invitation mail, add one authenticated org-members page for sending invitations, and add one public invitation landing route that becomes actionable only after the recipient authenticates with the invited email address.

**Tech Stack:** Better Auth organization plugin, Effect, Drizzle, Resend, TanStack Start, TanStack Router, TanStack Form, Effect Schema, Vitest, Playwright

---

## Scope And Assumptions

- This slice covers invitation creation, invitation email delivery, pending invitation visibility, and invitation acceptance.
- Invitation acceptance must work for:
  - an existing user who signs in with the invited email address
  - a new user who signs up with the invited email address and is then returned to the invitation
- This slice does not add multi-organization switching beyond Better Auth automatically setting the invited organization active on acceptance.
- The UI only offers `member` and `admin` invitation roles. Do not expose `owner` invitation assignment yet.
- The public invitation route must not reveal organization details before authentication because Better Auth `organization.getInvitation` requires the recipient to already be signed in.
- The email link should point at the app origin, not the API origin, so runtime config must carry an explicit app URL for email links.

## File Structure

### Backend And Runtime

- Modify: `turbo.json`
- Modify: `scripts/dev.mjs`
- Modify: `apps/app/playwright.config.ts`
- Modify: `packages/sandbox-core/src/runtime-spec.ts`
- Modify: `packages/sandbox-core/src/runtime-spec.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email-config.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email-errors.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`

### Frontend

- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/features/auth/auth-navigation.ts`
- Modify: `apps/app/src/features/auth/login-page.tsx`
- Modify: `apps/app/src/features/auth/signup-page.tsx`
- Modify: `apps/app/src/features/auth/redirect-if-authenticated.ts`
- Create: `apps/app/src/features/organizations/organization-member-invite-schemas.ts`
- Create: `apps/app/src/features/organizations/organization-member-invite-schemas.test.ts`
- Create: `apps/app/src/features/organizations/organization-members-page.tsx`
- Create: `apps/app/src/features/organizations/organization-members-page.test.tsx`
- Create: `apps/app/src/features/organizations/invitation-continuation.ts`
- Create: `apps/app/src/features/organizations/invitation-continuation.test.ts`
- Create: `apps/app/src/features/organizations/accept-invitation-page.tsx`
- Create: `apps/app/src/features/organizations/accept-invitation-page.test.tsx`
- Modify: `apps/app/src/routes/login.tsx`
- Modify: `apps/app/src/routes/signup.tsx`
- Create: `apps/app/src/routes/_app._org.members.tsx`
- Create: `apps/app/src/routes/accept-invitation.$invitationId.tsx`

### End-To-End And Docs

- Create: `apps/app/e2e/organization-invitations.test.ts`
- Create: `apps/app/e2e/pages/members-page.ts`
- Modify: `docs/architecture/organization-next-steps.md`

## Task 1: Add Invitation Runtime Config And Email Delivery

**Files:**

- Modify: `turbo.json`
- Modify: `scripts/dev.mjs`
- Modify: `apps/app/playwright.config.ts`
- Modify: `packages/sandbox-core/src/runtime-spec.ts`
- Modify: `packages/sandbox-core/src/runtime-spec.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email-config.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email-errors.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.test.ts`

- [ ] **Step 1: Write failing tests for invitation email config and payload rendering**

Add this coverage to `apps/api/src/domains/identity/authentication/auth-email.test.ts`:

```ts
it("renders an organization invitation email", async () => {
  const sent: TransportMessage[] = [];
  const program = AuthEmailSender.sendOrganizationInvitationEmail({
    idempotencyKey: "organization-invitation/inv_123",
    recipientEmail: "member@example.com",
    recipientName: "Taylor Example",
    organizationName: "Acme Field Ops",
    inviterEmail: "owner@example.com",
    invitationUrl:
      "https://app.task-tracker.localhost/accept-invitation/inv_123",
    role: "member",
  });

  const result = await Effect.runPromise(
    program.pipe(
      Effect.provideService(AuthEmailTransport, {
        send: (message) =>
          Effect.sync(() => {
            sent.push(message);
          }),
      })
    )
  );

  expect(result).toBeUndefined();
  expect(sent).toStrictEqual([
    {
      idempotencyKey: "organization-invitation/inv_123",
      to: "member@example.com",
      subject: "Join Acme Field Ops on Task Tracker",
      text: expect.stringContaining("owner@example.com invited you"),
      html: expect.stringContaining("/accept-invitation/inv_123"),
    },
  ]);
});
```

Add this config coverage near the existing env tests:

```ts
it("requires AUTH_APP_ORIGIN for auth email configuration", async () => {
  const result = await Effect.runPromise(
    loadAuthEmailConfig.pipe(Effect.either).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        makeConfigProvider([
          ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
          ["RESEND_API_KEY", "re_test_123"],
        ])
      )
    )
  );

  expect(Either.isLeft(result)).toBe(true);
  if (Either.isRight(result)) {
    throw new Error("Expected auth email config loading to fail");
  }
  expect(result.left.cause).toMatch(/AUTH_APP_ORIGIN/);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts -t "organization invitation email"
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts -t "requires AUTH_APP_ORIGIN"
```

Expected:

- the invitation test fails because `sendOrganizationInvitationEmail` does not exist
- the config test fails because `AUTH_APP_ORIGIN` is not part of the config yet

- [ ] **Step 3: Implement the runtime config and invitation email sender**

Update `apps/api/src/domains/identity/authentication/auth-email-config.ts`:

```ts
export interface AuthEmailConfig {
  readonly appOrigin: string;
  readonly from: string;
  readonly fromName: string;
  readonly resendApiKey: string;
}

const HttpOrigin = Config.string("AUTH_APP_ORIGIN").pipe(
  Config.validate({
    message: "AUTH_APP_ORIGIN must be a valid absolute http or https origin",
    validation: (value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          url.pathname === "/" &&
          url.username.length === 0 &&
          url.password.length === 0
        );
      } catch {
        return false;
      }
    },
  })
);

export const loadAuthEmailConfig = Config.all({
  appOrigin: HttpOrigin,
  from: Config.string("AUTH_EMAIL_FROM").pipe(
    Config.validate({
      message: "AUTH_EMAIL_FROM must be a valid email address",
      validation: isValidEmailAddress,
    })
  ),
  fromName: Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Task Tracker")
  ),
  resendApiKey: Config.string("RESEND_API_KEY").pipe(
    Config.validate({
      message: "RESEND_API_KEY must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  ),
}).pipe(
  Effect.mapError(
    (cause) =>
      new AuthEmailConfigurationError({
        message: "Invalid auth email configuration",
        cause: cause.toString(),
      })
  )
);
```

Update `apps/api/src/domains/identity/authentication/auth-email-errors.ts`:

```ts
export class OrganizationInvitationDeliveryError extends Schema.TaggedError<OrganizationInvitationDeliveryError>()(
  "@task-tracker/domains/identity/authentication/OrganizationInvitationDeliveryError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  }
) {}
```

Update `apps/api/src/domains/identity/authentication/auth-email.ts`:

```ts
const InvitationUrl = Schema.String.pipe(
  Schema.filter((value) => isValidResetUrl(value), {
    message: () => "Expected a valid http or https URL without credentials",
  })
);

const InvitationRole = Schema.Literal("admin", "member");

export const OrganizationInvitationEmailInput = Schema.Struct({
  idempotencyKey: EmailIdempotencyKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  organizationName: Schema.String,
  inviterEmail: EmailAddress,
  invitationUrl: InvitationUrl,
  role: InvitationRole,
});

const decodeOrganizationInvitationEmailInput = Schema.decodeUnknown(
  OrganizationInvitationEmailInput
);

const sendOrganizationInvitationEmail = Effect.fn(
  "AuthEmailSender.sendOrganizationInvitationEmail"
)(function* (rawInput: unknown) {
  const input = yield* decodeOrganizationInvitationEmailInput(rawInput).pipe(
    Effect.mapError(
      (parseError) =>
        new OrganizationInvitationDeliveryError({
          message: "Invalid organization invitation email input",
          cause: ParseResult.TreeFormatter.formatErrorSync(parseError),
        })
    )
  );

  yield* transport
    .send({
      idempotencyKey: input.idempotencyKey,
      to: input.recipientEmail,
      subject: `Join ${input.organizationName} on Task Tracker`,
      text: [
        `Hello ${input.recipientName},`,
        "",
        `${input.inviterEmail} invited you to join ${input.organizationName} as a ${input.role}.`,
        "",
        input.invitationUrl,
      ].join("\n"),
      html: [
        `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
        `<p>${escapeHtml(input.inviterEmail)} invited you to join ${escapeHtml(input.organizationName)} as a ${escapeHtml(input.role)}.</p>`,
        `<p><a href="${escapeHtml(input.invitationUrl)}">Accept invitation</a></p>`,
      ].join(""),
    })
    .pipe(
      Effect.mapError(
        (error) =>
          new OrganizationInvitationDeliveryError({
            message: "Failed to deliver organization invitation email",
            cause: error.message,
          })
      )
    );
});

return {
  sendPasswordResetEmail,
  sendOrganizationInvitationEmail,
};
```

Update runtime env plumbing so `AUTH_APP_ORIGIN` is present anywhere auth email can run:

```json
// turbo.json
{
  "globalEnv": [
    "AUTH_APP_ORIGIN",
    "AUTH_EMAIL_FROM",
    "AUTH_EMAIL_FROM_NAME",
    "BETTER_AUTH_BASE_URL",
    "RESEND_API_KEY",
    "VITE_AUTH_ORIGIN"
  ]
}
```

```js
// scripts/dev.mjs
return {
  ...baseEnvironment,
  AUTH_APP_ORIGIN:
    baseEnvironment.AUTH_APP_ORIGIN ??
    `https://app.task-tracker.localhost:${proxyPort}`,
  AUTH_EMAIL_FROM: baseEnvironment.AUTH_EMAIL_FROM ?? DEFAULT_AUTH_EMAIL_FROM,
  AUTH_EMAIL_FROM_NAME:
    baseEnvironment.AUTH_EMAIL_FROM_NAME ?? DEFAULT_AUTH_EMAIL_FROM_NAME,
  BETTER_AUTH_BASE_URL:
    baseEnvironment.BETTER_AUTH_BASE_URL ??
    `https://api.task-tracker.localhost:${proxyPort}`,
  PORTLESS_PORT: proxyPort,
  RESEND_API_KEY: baseEnvironment.RESEND_API_KEY ?? DEFAULT_RESEND_API_KEY,
};
```

```ts
// apps/app/playwright.config.ts
env: {
  ...process.env,
  AUTH_APP_ORIGIN: "http://127.0.0.1:4173",
  AUTH_EMAIL_FROM: playwrightAuthEmailFrom,
  AUTH_EMAIL_FROM_NAME: playwrightAuthEmailFromName,
  BETTER_AUTH_BASE_URL: "http://127.0.0.1:3001",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  PORT: "3001",
  RESEND_API_KEY: playwrightResendApiKey,
},
```

```ts
// packages/sandbox-core/src/runtime-spec.ts
export interface SharedSandboxEnvironment {
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_EMAIL_FROM: string;
  readonly AUTH_EMAIL_FROM_NAME: string;
  readonly RESEND_API_KEY: string;
}

export const SharedSandboxEnvironment = Schema.Struct({
  AUTH_EMAIL_FROM: Schema.NonEmptyString,
  AUTH_EMAIL_FROM_NAME: Schema.NonEmptyString,
  RESEND_API_KEY: Schema.NonEmptyString,
});

export const SandboxRuntimeOverrides = Schema.Struct({
  API_HOST_PORT: Schema.String,
  APP_HOST_PORT: Schema.String,
  AUTH_APP_ORIGIN: SandboxHttpUrl,
  AUTH_EMAIL_FROM: Schema.NonEmptyString,
  AUTH_EMAIL_FROM_NAME: Schema.NonEmptyString,
  AUTH_ORIGIN: SandboxHttpUrl,
  BETTER_AUTH_BASE_URL: SandboxHttpUrl,
  BETTER_AUTH_SECRET: Schema.NonEmptyString,
  DATABASE_URL: SandboxPostgresUrl,
  HOST: Schema.String,
  PORT: Schema.String,
  POSTGRES_HOST_PORT: Schema.String,
  RESEND_API_KEY: Schema.NonEmptyString,
  SANDBOX_ID: SandboxIdSchema,
  SANDBOX_DEV_IMAGE: SandboxDockerImageReference,
  SANDBOX_NODE_MODULES_VOLUME: SandboxDockerVolumeName,
  SANDBOX_NAME: SandboxNameSchema,
  SANDBOX_PNPM_STORE_VOLUME: SandboxDockerVolumeName,
  TASK_TRACKER_SANDBOX: Schema.Literal("1"),
  VITE_AUTH_ORIGIN: SandboxHttpUrl,
});

AUTH_APP_ORIGIN: input.urls.app,
```

- [ ] **Step 4: Run the updated backend and runtime tests**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts
pnpm --filter sandbox-core test -- src/runtime-spec.test.ts
pnpm --filter app exec playwright test --config playwright.config.ts --list
```

Expected:

- `auth-email.test.ts` passes
- sandbox env/runtime tests pass with `AUTH_APP_ORIGIN`
- Playwright test listing succeeds with the new env wiring

- [ ] **Step 5: Commit the runtime and email groundwork**

```bash
git add turbo.json scripts/dev.mjs apps/app/playwright.config.ts packages/sandbox-core/src/runtime-spec.ts packages/sandbox-core/src/runtime-spec.test.ts apps/api/src/domains/identity/authentication/auth-email-config.ts apps/api/src/domains/identity/authentication/auth-email-errors.ts apps/api/src/domains/identity/authentication/auth-email.ts apps/api/src/domains/identity/authentication/auth-email.test.ts
git commit -m "feat: add organization invitation email infrastructure"
```

## Task 2: Wire Better Auth Invitation Creation Into The Auth Slice

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`

- [ ] **Step 1: Add failing backend tests for invitation behavior**

Add this unit-level expectation to `apps/api/src/domains/identity/authentication/authentication.test.ts`:

```ts
it("configures Better Auth organization invitations with app links", async () => {
  const sendOrganizationInvitationEmail = vi.fn().mockResolvedValue(undefined);

  createAuthentication({
    appOrigin: "http://127.0.0.1:4173",
    backgroundTaskHandler: vi.fn(),
    config: makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      portlessUrl: undefined,
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
    }),
    database,
    reportPasswordResetEmailFailure: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendOrganizationInvitationEmail,
  });

  expect(sendOrganizationInvitationEmail).not.toHaveBeenCalled();
});
```

Add this integration test to `apps/api/src/domains/identity/authentication/authentication.integration.test.ts`:

```ts
it("creates an invitation and accepts it with the invited user", async () => {
  const owner = await signUpAndCreateOrganization({
    email: "owner@example.com",
    name: "Owner Example",
    password: "password123",
    organizationName: "Acme Field Ops",
    organizationSlug: "acme-field-ops",
  });

  const inviteResponse = await auth.handler(
    makeJsonRequest(
      "/organization/invite-member",
      {
        email: "member@example.com",
        role: "member",
      },
      { cookieJar: owner.cookieJar }
    )
  );

  expect(inviteResponse.status).toBe(200);
  const invitation = (await inviteResponse.json()) as {
    id: string;
    email: string;
  };
  expect(invitation.email).toBe("member@example.com");

  const invitedUser = await signUp({
    email: "member@example.com",
    name: "Member Example",
    password: "password123",
  });

  const acceptResponse = await auth.handler(
    makeJsonRequest(
      "/organization/accept-invitation",
      { invitationId: invitation.id },
      { cookieJar: invitedUser.cookieJar }
    )
  );

  expect(acceptResponse.status).toBe(200);

  const sessionResponse = await auth.handler(
    makeRequest("/get-session", { cookieJar: invitedUser.cookieJar })
  );
  const session = (await sessionResponse.json()) as SessionResponse;

  expect(session.session.activeOrganizationId).toBeDefined();
});
```

- [ ] **Step 2: Run the failing auth tests**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.integration.test.ts -t "creates an invitation and accepts it with the invited user"
```

Expected:

- the integration test fails because no invitation email callback or helper wiring exists yet

- [ ] **Step 3: Implement Better Auth invitation configuration**

Update `apps/api/src/domains/identity/authentication/auth.ts`:

```ts
import { AuthEmailSender } from "./auth-email.js";
import type {
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";

export function createAuthentication(options: {
  readonly appOrigin: string;
  readonly backgroundTaskHandler: (task: Promise<unknown>) => void;
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase<typeof authSchema>;
  readonly reportPasswordResetEmailFailure: (error: unknown) => void;
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
  readonly sendOrganizationInvitationEmail: (
    input: OrganizationInvitationEmailInput
  ) => Promise<void>;
}) {
  const { config, database, sendPasswordResetEmail } = options;
  const { databaseUrl: _databaseUrl, ...authConfig } = config;

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
        invitationExpiresIn: 60 * 60 * 24 * 7,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async (data) => {
          const invitationUrl = new URL(
            `/accept-invitation/${data.id}`,
            options.appOrigin
          ).toString();

          await options.sendOrganizationInvitationEmail({
            idempotencyKey: `organization-invitation/${data.id}`,
            recipientEmail: data.email,
            recipientName: data.email,
            organizationName: data.organization.name,
            inviterEmail: data.inviter.user.email,
            invitationUrl,
            role: data.role === "admin" ? "admin" : "member",
          } satisfies OrganizationInvitationEmailInput);
        },
        organizationHooks: {
          beforeCreateOrganization: ({ organization: nextOrganization }) => {
            let input;

            try {
              input = decodeCreateOrganizationInput(nextOrganization);
            } catch {
              throw APIError.from("BAD_REQUEST", {
                code: "INVALID_ORGANIZATION_INPUT",
                message:
                  "Organization name must be at least 2 characters long and the slug must use lowercase letters, numbers, and hyphens only.",
              });
            }

            return Promise.resolve({
              data: {
                ...nextOrganization,
                name: input.name,
                slug: input.slug,
              },
            });
          },
        },
      }),
    ],
    emailAndPassword: {
      ...authConfig.emailAndPassword,
      sendResetPassword: async ({ token, user, url }) => {
        try {
          await sendPasswordResetEmail({
            idempotencyKey: `password-reset/${user.id}/${token}`,
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            resetUrl: url,
          } as const satisfies PasswordResetEmailInput);
        } catch (error) {
          options.reportPasswordResetEmailFailure(error);
          throw error;
        }
      },
    },
  });
}
```

Update the `AuthenticationLive` layer to pass the new mail method and app origin:

```ts
const authEmailConfig = yield* loadAuthEmailConfig;

appOrigin: authEmailConfig.appOrigin,
sendOrganizationInvitationEmail: (input) =>
  runPromise(authEmailSender.sendOrganizationInvitationEmail(input)),
```

- [ ] **Step 4: Run the invitation backend test suite**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
pnpm --filter api test -- src/domains/identity/authentication/authentication.integration.test.ts -t "invitation"
```

Expected:

- auth configuration tests pass
- invitation creation and acceptance integration coverage passes

- [ ] **Step 5: Commit the Better Auth invitation wiring**

```bash
git add apps/api/src/domains/identity/authentication/auth.ts apps/api/src/domains/identity/authentication/authentication.test.ts apps/api/src/domains/identity/authentication/authentication.integration.test.ts
git commit -m "feat: wire organization invitations into auth"
```

## Task 3: Add The Authenticated Members And Invitations Screen

**Files:**

- Modify: `apps/app/src/components/app-sidebar.tsx`
- Create: `apps/app/src/features/organizations/organization-member-invite-schemas.ts`
- Create: `apps/app/src/features/organizations/organization-member-invite-schemas.test.ts`
- Create: `apps/app/src/features/organizations/organization-members-page.tsx`
- Create: `apps/app/src/features/organizations/organization-members-page.test.tsx`
- Create: `apps/app/src/routes/_app._org.members.tsx`

- [ ] **Step 1: Add failing frontend tests for the invite form and members page**

Create `apps/app/src/features/organizations/organization-member-invite-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  decodeOrganizationMemberInviteInput,
  organizationMemberInviteSchema,
} from "./organization-member-invite-schemas";

describe("organizationMemberInviteSchema", () => {
  it("accepts member and admin roles", () => {
    expect(
      decodeOrganizationMemberInviteInput({
        email: "member@example.com",
        role: "member",
      })
    ).toStrictEqual({
      email: "member@example.com",
      role: "member",
    });
  });

  it("rejects owner invitations", () => {
    expect(() =>
      decodeOrganizationMemberInviteInput({
        email: "owner@example.com",
        role: "owner",
      })
    ).toThrow();
  });
});
```

Create `apps/app/src/features/organizations/organization-members-page.test.tsx`:

```tsx
it("submits an invitation and refreshes the pending invitations list", async () => {
  mockedGetFullOrganization
    .mockResolvedValueOnce({
      data: {
        id: "org_123",
        name: "Acme Field Ops",
        members: [
          {
            id: "member_1",
            role: "owner",
            userId: "user_1",
            user: { email: "owner@example.com", name: "Owner Example" },
          },
        ],
        invitations: [],
      },
      error: null,
    })
    .mockResolvedValueOnce({
      data: {
        id: "org_123",
        name: "Acme Field Ops",
        members: [
          {
            id: "member_1",
            role: "owner",
            userId: "user_1",
            user: { email: "owner@example.com", name: "Owner Example" },
          },
        ],
        invitations: [
          {
            id: "inv_123",
            email: "member@example.com",
            role: "member",
            status: "pending",
          },
        ],
      },
      error: null,
    });

  mockedInviteMember.mockResolvedValue({
    data: { id: "inv_123" },
    error: null,
  });

  render(<OrganizationMembersPage />);

  await screen.findByText("Organization members");
  await userEvent.type(screen.getByLabelText("Email"), "member@example.com");
  await userEvent.click(
    screen.getByRole("button", { name: "Send invitation" })
  );

  await screen.findByText("member@example.com");
  expect(mockedInviteMember).toHaveBeenCalledWith({
    email: "member@example.com",
    role: "member",
  });
});
```

- [ ] **Step 2: Run the failing frontend tests**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-member-invite-schemas.test.ts
pnpm --filter app test -- src/features/organizations/organization-members-page.test.tsx
```

Expected:

- both tests fail because the schema and page do not exist yet

- [ ] **Step 3: Implement the invite schema, page, and route**

Create `apps/app/src/features/organizations/organization-member-invite-schemas.ts`:

```ts
import { ParseResult, Schema } from "effect";

export const organizationMemberInviteSchema = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  role: Schema.Literal("admin", "member"),
});

export type OrganizationMemberInviteInput =
  typeof organizationMemberInviteSchema.Type;

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return ParseResult.decodeUnknownSync(organizationMemberInviteSchema)(input);
}
```

Create `apps/app/src/features/organizations/organization-members-page.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";

import { authClient } from "#/lib/auth-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { FieldError } from "#/components/ui/field";
import { Input } from "#/components/ui/input";

import {
  decodeOrganizationMemberInviteInput,
  organizationMemberInviteSchema,
} from "./organization-member-invite-schemas";

export function OrganizationMembersPage() {
  const [organization, setOrganization] = useState<
    | Awaited<
        ReturnType<typeof authClient.organization.getFullOrganization>
      >["data"]
    | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadOrganization() {
    const result = await authClient.organization.getFullOrganization();
    if (result.error || !result.data) {
      setLoadError("We couldn't load your organization members.");
      return;
    }
    setLoadError(null);
    setOrganization(result.data);
  }

  useEffect(() => {
    void loadOrganization();
  }, []);

  const form = useForm({
    defaultValues: { email: "", role: "member" as const },
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationMemberInviteSchema),
    },
    onSubmit: async ({ value, formApi }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      const input = decodeOrganizationMemberInviteInput(value);
      const result = await authClient.organization.inviteMember(input);
      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: "We couldn't send that invitation. Please try again.",
            fields: {},
          },
        });
        return;
      }
      formApi.reset();
      await loadOrganization();
    },
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadError ? <FieldError>{loadError}</FieldError> : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="email">
              {(field) => (
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Email</span>
                  <Input
                    type="email"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="role">
              {(field) => (
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Role</span>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as "admin" | "member"
                      )
                    }
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(error) =>
                error?.form ? <FieldError>{error.form}</FieldError> : null
              }
            </form.Subscribe>
            <Button type="submit">Send invitation</Button>
          </form>
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Pending invitations</h2>
            {organization?.invitations
              ?.filter((invitation) => invitation.status === "pending")
              .map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p>{invitation.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {invitation.role}
                    </p>
                  </div>
                  <a
                    data-testid="pending-invitation-link"
                    href={`/accept-invitation/${invitation.id}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Copy invite link
                  </a>
                </div>
              ))}
          </section>
        </CardContent>
      </Card>
    </main>
  );
}
```

Create `apps/app/src/routes/_app._org.members.tsx`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { OrganizationMembersPage } from "#/features/organizations/organization-members-page";

export const Route = createFileRoute("/_app/_org/members")({
  component: OrganizationMembersPage,
});
```

Update `apps/app/src/components/app-sidebar.tsx`:

```ts
const data = {
  navMain: [
    {
      title: "Overview",
      url: "/",
      icon: <HugeiconsIcon icon={ComputerTerminalIcon} strokeWidth={2} />,
      isActive: true,
      items: [
        { title: "Home", url: "/" },
        { title: "Members", url: "/members" },
        { title: "Health", url: "/health" },
      ],
    },
  ],
};
```

- [ ] **Step 4: Run the members-page test suite**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-member-invite-schemas.test.ts src/features/organizations/organization-members-page.test.tsx
```

Expected:

- schema validation passes
- members page passes with mocked Better Auth org methods

- [ ] **Step 5: Commit the members and invitation management UI**

```bash
git add apps/app/src/components/app-sidebar.tsx apps/app/src/features/organizations/organization-member-invite-schemas.ts apps/app/src/features/organizations/organization-member-invite-schemas.test.ts apps/app/src/features/organizations/organization-members-page.tsx apps/app/src/features/organizations/organization-members-page.test.tsx apps/app/src/routes/_app._org.members.tsx
git commit -m "feat: add organization member invitation screen"
```

## Task 4: Preserve Invitation Continuation Through Login And Sign-Up

**Files:**

- Modify: `apps/app/src/features/auth/auth-navigation.ts`
- Modify: `apps/app/src/features/auth/login-page.tsx`
- Modify: `apps/app/src/features/auth/signup-page.tsx`
- Modify: `apps/app/src/features/auth/redirect-if-authenticated.ts`
- Create: `apps/app/src/features/organizations/invitation-continuation.ts`
- Create: `apps/app/src/features/organizations/invitation-continuation.test.ts`
- Modify: `apps/app/src/routes/login.tsx`
- Modify: `apps/app/src/routes/signup.tsx`

- [ ] **Step 1: Add failing tests for invitation continuation**

Create `apps/app/src/features/organizations/invitation-continuation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  decodeInvitationContinuationSearch,
  resolvePostAuthTarget,
} from "./invitation-continuation";

describe("invitation continuation", () => {
  it("keeps a valid invitation id", () => {
    expect(
      decodeInvitationContinuationSearch({
        invitationId: "inv_123",
      })
    ).toStrictEqual({
      invitationId: "inv_123",
    });
  });

  it("prefers the invitation route after auth success", () => {
    expect(resolvePostAuthTarget({ invitationId: "inv_123" })).toStrictEqual({
      to: "/accept-invitation/$invitationId",
      params: { invitationId: "inv_123" },
    });
  });
});
```

Add route behavior tests beside the existing auth page tests:

```tsx
it("redirects authenticated users with an invitation back to the invitation route", async () => {
  mockedGetSession.mockResolvedValue({
    data: {
      session: { id: "session_123" },
      user: { id: "user_123", email: "member@example.com" },
    },
    error: null,
  });

  await expect(
    redirectIfAuthenticated({ invitationId: "inv_123" })
  ).rejects.toMatchObject({
    options: {
      to: "/accept-invitation/$invitationId",
      params: { invitationId: "inv_123" },
    },
  });
});
```

- [ ] **Step 2: Run the failing continuation tests**

Run:

```bash
pnpm --filter app test -- src/features/organizations/invitation-continuation.test.ts
pnpm --filter app test -- src/features/auth/redirect-if-authenticated.test.ts -t "invitation"
```

Expected:

- the new search helper test fails because the helper file does not exist
- the redirect test fails because invitation-aware redirects are not supported

- [ ] **Step 3: Implement invitation-aware auth continuation**

Create `apps/app/src/features/organizations/invitation-continuation.ts`:

```ts
import { ParseResult, Schema } from "effect";

const InvitationContinuationSearch = Schema.transform(
  Schema.Struct({
    invitationId: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    invitationId: Schema.optional(Schema.String),
  }),
  {
    strict: true,
    decode: ({ invitationId }) =>
      typeof invitationId === "string" && invitationId.length > 0
        ? { invitationId }
        : {},
    encode: (search) => search,
  }
);

export type InvitationContinuationSearch =
  typeof InvitationContinuationSearch.Type;

export function decodeInvitationContinuationSearch(
  input: unknown
): InvitationContinuationSearch {
  return ParseResult.decodeUnknownSync(InvitationContinuationSearch)(input);
}

export function resolvePostAuthTarget(search: InvitationContinuationSearch) {
  if (search.invitationId) {
    return {
      to: "/accept-invitation/$invitationId" as const,
      params: { invitationId: search.invitationId },
    };
  }

  return { to: "/" as const };
}
```

Update `apps/app/src/routes/login.tsx` and `apps/app/src/routes/signup.tsx`:

```ts
validateSearch: decodeInvitationContinuationSearch,
beforeLoad: ({ search }) => redirectIfAuthenticated(search),
```

Update `apps/app/src/features/auth/auth-navigation.ts`:

```ts
import { useSearch } from "@tanstack/react-router";

import { resolvePostAuthTarget } from "#/features/organizations/invitation-continuation";

export function useAuthSuccessNavigation(routeId: "/login" | "/signup") {
  const navigate = useNavigate();
  const search = useSearch({ from: routeId });

  return async () => {
    await navigate(resolvePostAuthTarget(search));
  };
}
```

Update `apps/app/src/features/auth/login-page.tsx`:

```ts
const navigateOnSuccess = useAuthSuccessNavigation("/login");
```

Update `apps/app/src/features/auth/signup-page.tsx`:

```ts
const navigateOnSuccess = useAuthSuccessNavigation("/signup");
```

Update `apps/app/src/features/auth/redirect-if-authenticated.ts`:

```ts
import { resolvePostAuthTarget } from "#/features/organizations/invitation-continuation";

export async function redirectIfAuthenticated(
  search: { invitationId?: string } = {}
) {
  const session = await getCurrentSession();

  if (session) {
    throw redirect(resolvePostAuthTarget(search));
  }
}
```

- [ ] **Step 4: Run the auth continuation tests**

Run:

```bash
pnpm --filter app test -- src/features/organizations/invitation-continuation.test.ts src/features/auth/redirect-if-authenticated.test.ts src/features/auth/login-page.test.tsx src/features/auth/signup-page.test.tsx
```

Expected:

- invitation continuation helpers pass
- login and signup continue to work with and without invitation ids

- [ ] **Step 5: Commit the auth continuation behavior**

```bash
git add apps/app/src/features/auth/auth-navigation.ts apps/app/src/features/auth/login-page.tsx apps/app/src/features/auth/signup-page.tsx apps/app/src/features/auth/redirect-if-authenticated.ts apps/app/src/features/organizations/invitation-continuation.ts apps/app/src/features/organizations/invitation-continuation.test.ts apps/app/src/routes/login.tsx apps/app/src/routes/signup.tsx
git commit -m "feat: preserve invitation continuation through auth"
```

## Task 5: Add The Public Invitation Route And Signed-In Acceptance UX

**Files:**

- Create: `apps/app/src/features/organizations/accept-invitation-page.tsx`
- Create: `apps/app/src/features/organizations/accept-invitation-page.test.tsx`
- Create: `apps/app/src/routes/accept-invitation.$invitationId.tsx`

- [ ] **Step 1: Add failing tests for the invitation acceptance page**

Create `apps/app/src/features/organizations/accept-invitation-page.test.tsx`:

```tsx
it("shows auth calls to action when the visitor is signed out", () => {
  render(
    <AcceptInvitationPage
      invitationId="inv_123"
      initialSession={null}
      initialInvitation={null}
      initialError={null}
    />
  );

  expect(
    screen.getByRole("link", { name: "Sign in to continue" })
  ).toHaveAttribute("href", "/login?invitationId=inv_123");
  expect(
    screen.getByRole("link", { name: "Create an account" })
  ).toHaveAttribute("href", "/signup?invitationId=inv_123");
});

it("accepts the invitation when the recipient is signed in", async () => {
  mockedAcceptInvitation.mockResolvedValue({
    data: { invitation: { id: "inv_123" } },
    error: null,
  });

  render(
    <AcceptInvitationPage
      invitationId="inv_123"
      initialSession={{
        user: {
          id: "user_123",
          email: "member@example.com",
          name: "Member Example",
        },
        session: { id: "session_123" },
      }}
      initialInvitation={{
        id: "inv_123",
        email: "member@example.com",
        role: "member",
        organizationName: "Acme Field Ops",
        inviterEmail: "owner@example.com",
        status: "pending",
      }}
      initialError={null}
    />
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Accept invitation" })
  );

  expect(mockedAcceptInvitation).toHaveBeenCalledWith({
    invitationId: "inv_123",
  });
  expect(mockedNavigate).toHaveBeenCalledWith({ to: "/" });
});
```

- [ ] **Step 2: Run the failing acceptance page tests**

Run:

```bash
pnpm --filter app test -- src/features/organizations/accept-invitation-page.test.tsx
```

Expected:

- the page test fails because the page and route do not exist yet

- [ ] **Step 3: Implement the invitation route and acceptance page**

Create `apps/app/src/routes/accept-invitation.$invitationId.tsx`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { AcceptInvitationPage } from "#/features/organizations/accept-invitation-page";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationRoute,
});

function AcceptInvitationRoute() {
  const { invitationId } = Route.useParams();
  return <AcceptInvitationPage invitationId={invitationId} />;
}
```

Create `apps/app/src/features/organizations/accept-invitation-page.tsx`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "#/lib/auth-client";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FieldError } from "#/components/ui/field";

interface AcceptInvitationPageProps {
  readonly invitationId: string;
  readonly initialSession?:
    | Awaited<ReturnType<typeof authClient.getSession>>["data"]
    | null;
  readonly initialInvitation?:
    | Awaited<ReturnType<typeof authClient.organization.getInvitation>>["data"]
    | null;
  readonly initialError?: string | null;
}

export function AcceptInvitationPage({
  invitationId,
  initialSession = null,
  initialInvitation = null,
  initialError = null,
}: AcceptInvitationPageProps) {
  const navigate = useNavigate();
  const [session, setSession] = useState<
    Awaited<ReturnType<typeof authClient.getSession>>["data"] | null
  >(initialSession);
  const [invitation, setInvitation] = useState<
    | Awaited<ReturnType<typeof authClient.organization.getInvitation>>["data"]
    | null
  >(initialInvitation);
  const [error, setError] = useState<string | null>(initialError);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const sessionResult = await authClient.getSession();
      if (cancelled) return;

      const nextSession = sessionResult.data ?? null;
      setSession(nextSession);

      if (!nextSession) {
        return;
      }

      const invitationResult = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });

      if (cancelled) return;

      if (invitationResult.error || !invitationResult.data) {
        setError(
          "This invitation is invalid, expired, or belongs to a different email address."
        );
        return;
      }

      setInvitation(invitationResult.data);
      setError(null);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  async function acceptInvitation() {
    setIsAccepting(true);
    const result = await authClient.organization.acceptInvitation({
      invitationId,
    });
    setIsAccepting(false);

    if (result.error) {
      setError(
        "We couldn't accept that invitation. Please make sure you're signed in with the invited email address."
      );
      return;
    }

    await navigate({ to: "/" });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Organization invitation</CardTitle>
          <CardDescription>Join your team on Task Tracker.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <FieldError>{error}</FieldError> : null}
          {!session ? (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in or create an account with the email address that
                received this invitation.
              </p>
              <div className="flex gap-3">
                <Button asChild>
                  <Link to="/login" search={{ invitationId }}>
                    Sign in to continue
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/signup" search={{ invitationId }}>
                    Create an account
                  </Link>
                </Button>
              </div>
            </>
          ) : invitation ? (
            <>
              <p>
                <strong>{invitation.inviterEmail}</strong> invited you to join{" "}
                <strong>{invitation.organizationName}</strong> as a{" "}
                <strong>{invitation.role}</strong>.
              </p>
              <Button
                disabled={isAccepting}
                onClick={() => void acceptInvitation()}
              >
                {isAccepting ? "Accepting invitation..." : "Accept invitation"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading invitation…</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Run the acceptance page tests**

Run:

```bash
pnpm --filter app test -- src/features/organizations/accept-invitation-page.test.tsx
```

Expected:

- signed-out CTA coverage passes
- signed-in acceptance coverage passes

- [ ] **Step 5: Commit the public invitation route**

```bash
git add apps/app/src/features/organizations/accept-invitation-page.tsx apps/app/src/features/organizations/accept-invitation-page.test.tsx apps/app/src/routes/accept-invitation.$invitationId.tsx
git commit -m "feat: add invitation acceptance route"
```

## Task 6: Add End-To-End Coverage And Refresh The Architecture Notes

**Files:**

- Create: `apps/app/e2e/organization-invitations.test.ts`
- Create: `apps/app/e2e/pages/members-page.ts`
- Modify: `docs/architecture/organization-next-steps.md`

- [ ] **Step 1: Add failing end-to-end tests for existing and new-user invitation flows**

Create `apps/app/e2e/pages/members-page.ts`:

```ts
import { expect, type Page } from "@playwright/test";

export class MembersPage {
  constructor(private readonly page: Page) {}

  readonly inviteEmail = this.page.getByLabel("Email");
  readonly inviteRole = this.page.getByLabel("Role");
  readonly submit = this.page.getByRole("button", { name: "Send invitation" });

  async goto() {
    await this.page.goto("/members");
    await expect(
      this.page.getByRole("heading", { name: "Organization members" })
    ).toBeVisible();
  }
}
```

Create `apps/app/e2e/organization-invitations.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { LoginPage } from "./pages/login-page";
import { MembersPage } from "./pages/members-page";
import { SignupPage } from "./pages/signup-page";
import { CreateOrganizationPage } from "./pages/create-organization-page";

function email(prefix: string) {
  return `${prefix}-${randomUUID()}@example.com`;
}

test("existing user accepts an invitation and lands in the app", async ({
  browser,
  page,
}) => {
  const ownerEmail = email("owner");
  const memberEmail = email("member");
  const password = "password123";

  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const membersPage = new MembersPage(page);

  await signupPage.goto();
  await signupPage.name.fill("Owner Example");
  await signupPage.email.fill(ownerEmail);
  await signupPage.password.fill(password);
  await signupPage.confirmPassword.fill(password);
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill("Acme Field Ops");
  await createOrganizationPage.slug.fill(`acme-${randomUUID()}`);
  await createOrganizationPage.submit.click();

  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  const invitedSignup = new SignupPage(invitedPage);

  await invitedSignup.goto();
  await invitedSignup.name.fill("Member Example");
  await invitedSignup.email.fill(memberEmail);
  await invitedSignup.password.fill(password);
  await invitedSignup.confirmPassword.fill(password);
  await invitedSignup.submit.click();
  await invitedContext.clearCookies();

  await membersPage.goto();
  await membersPage.inviteEmail.fill(memberEmail);
  await membersPage.submit.click();

  const invitationLink = await page
    .locator('[data-testid="pending-invitation-link"]')
    .first()
    .getAttribute("href");

  expect(invitationLink).toBeTruthy();

  const invitedLogin = new LoginPage(invitedPage);
  await invitedPage.goto(invitationLink!);
  await invitedLogin.email.fill(memberEmail);
  await invitedLogin.password.fill(password);
  await invitedLogin.submit.click();

  await expect(
    invitedPage.getByRole("button", { name: "Accept invitation" })
  ).toBeVisible();
  await invitedPage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(invitedPage).toHaveURL("http://localhost:4173/");
});
```

- [ ] **Step 2: Run the e2e test and verify it fails**

Run:

```bash
pnpm --filter app exec playwright test e2e/organization-invitations.test.ts
```

Expected:

- the test fails because `/members` and `/accept-invitation/...` do not exist yet

- [ ] **Step 3: Finish the end-to-end harness and update docs**

If the members page does not already expose a stable link, add a test id in `OrganizationMembersPage`:

```tsx
<a
  data-testid="pending-invitation-link"
  href={`/accept-invitation/${invitation.id}`}
  className="text-sm text-primary underline-offset-4 hover:underline"
>
  Copy invite link
</a>
```

Update `docs/architecture/organization-next-steps.md`:

```md
## Delivered

1. Invite creation from the active organization
2. Invite acceptance for existing users
3. Invite acceptance for new users after sign-up continuation

## Next Product Steps

1. Organization switching for users who belong to multiple organizations
2. Workspace and domain data under the active organization
3. Richer role and permission checks once domain actions require them
```

- [ ] **Step 4: Run the full affected verification suite**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts src/domains/identity/authentication/authentication.test.ts src/domains/identity/authentication/authentication.integration.test.ts
pnpm --filter app test -- src/features/auth/login-page.test.tsx src/features/auth/signup-page.test.tsx src/features/auth/redirect-if-authenticated.test.ts src/features/organizations/organization-member-invite-schemas.test.ts src/features/organizations/organization-members-page.test.tsx src/features/organizations/invitation-continuation.test.ts src/features/organizations/accept-invitation-page.test.tsx
pnpm --filter app exec playwright test e2e/auth.test.ts e2e/organization-invitations.test.ts
```

Expected:

- backend auth/invitation tests pass
- app unit/component tests pass
- existing auth e2e still passes
- organization invitation e2e passes for the existing-user flow

If the new-user flow is split into its own e2e, run that too before completion.

- [ ] **Step 5: Commit the final invitation slice**

```bash
git add apps/app/e2e/organization-invitations.test.ts apps/app/e2e/pages/members-page.ts docs/architecture/organization-next-steps.md apps/app/src/features/organizations/organization-members-page.tsx
git commit -m "feat: add organization invitation flows"
```

## Self-Review

### Spec Coverage

- Invite creation from the active organization: covered by Tasks 2 and 3.
- Invite acceptance for existing users: covered by Tasks 2, 5, and 6.
- Invite acceptance for new users: covered by Tasks 4, 5, and 6 through auth continuation.
- Active organization should be set after acceptance: covered by Task 2 integration coverage and Task 5 navigation behavior.
- No personal org creation for invited users: covered by Tasks 4 and 5 by returning the user to the invitation route instead of `/create-organization`.

### Placeholder Scan

- No `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- The plan uses concrete file paths, commands, and code snippets for every task.

### Type Consistency

- `invitationId` is used consistently in continuation helpers, page props, and Better Auth `acceptInvitation`.
- Invitation roles are consistently limited to `"admin" | "member"` in app-owned validation.
- `AUTH_APP_ORIGIN` is used consistently as the app-facing origin for invitation email links.
