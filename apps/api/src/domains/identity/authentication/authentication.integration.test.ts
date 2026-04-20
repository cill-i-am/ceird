import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { Deferred, Effect } from "effect";
import { Pool } from "pg";

import { createAuthentication } from "./auth.js";
import {
  DEFAULT_AUTH_DATABASE_URL,
  DEFAULT_AUTH_BASE_PATH,
  makeAuthenticationConfig,
} from "./config.js";
import { authSchema } from "./schema.js";

describe("authentication integration", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("creates an organization after sign-up and stores it as the active organization in the session", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping organization flow coverage"
      );
    }

    await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
    await applyMigration(databaseUrl, "0001_giant_speedball.sql");
    await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
    await applyMigration(databaseUrl, "0003_organizations.sql");

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
      backgroundTaskHandler: () => {},
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl,
      }),
      database: drizzle(authPool, { schema: authSchema }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const cookieJar = new Map<string, string>();

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "org-flow@example.com",
        name: "Org Flow User",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(cookieJar, signUpResponse);
    expect(signUpResponse.status).toBe(200);

    const organizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Org Flow Organization",
          slug: "org-flow-organization",
        },
        {
          cookieJar,
        }
      )
    );
    updateCookieJar(cookieJar, organizationResponse);
    expect(organizationResponse.status).toBe(200);
    const createdOrganization =
      (await organizationResponse.json()) as CreatedOrganizationResponse;
    expect(createdOrganization.id).toStrictEqual(expect.any(String));
    expect(createdOrganization.name).toBe("Org Flow Organization");
    expect(createdOrganization.slug).toBe("org-flow-organization");
    expect(createdOrganization.members).toHaveLength(1);
    expect(createdOrganization.members[0]?.organizationId).toBe(
      createdOrganization.id
    );
    expect(createdOrganization.members[0]?.role).toBe("owner");

    const sessionAfterOrganizationCreateResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterOrganizationCreateResponse.status).toBe(200);
    const sessionAfterOrganizationCreate =
      (await sessionAfterOrganizationCreateResponse.json()) as SessionResponse;
    expect(sessionAfterOrganizationCreate?.user?.email).toBe(
      "org-flow@example.com"
    );
    expect(sessionAfterOrganizationCreate?.session?.activeOrganizationId).toBe(
      createdOrganization.id
    );

    const organizationRows = await adminPool.query<{
      id: string;
      name: string;
      slug: string;
    }>(`select id, name, slug from organization where id = $1`, [
      createdOrganization.id,
    ]);
    expect(organizationRows.rows).toStrictEqual([
      {
        id: createdOrganization.id,
        name: "Org Flow Organization",
        slug: "org-flow-organization",
      },
    ]);

    const creatorRows = await adminPool.query<{
      id: string;
    }>(`select id from "user" where email = $1`, ["org-flow@example.com"]);
    expect(creatorRows.rows).toHaveLength(1);

    const memberRows = await adminPool.query<{
      organization_id: string;
      role: string;
      user_id: string;
    }>(
      `select organization_id, role, user_id from member where organization_id = $1 and user_id = $2`,
      [createdOrganization.id, creatorRows.rows[0]?.id]
    );
    expect(memberRows.rows).toStrictEqual([
      {
        organization_id: createdOrganization.id,
        role: "owner",
        user_id: creatorRows.rows[0]?.id as string,
      },
    ]);

    const listedOrganizationsResponse = await auth.handler(
      makeRequest("/organization/list", {
        cookieJar,
      })
    );
    expect(listedOrganizationsResponse.status).toBe(200);
    const listedOrganizations =
      (await listedOrganizationsResponse.json()) as readonly {
        readonly id: string;
        readonly slug: string;
      }[];
    expect(listedOrganizations).toContainEqual(
      expect.objectContaining({
        id: createdOrganization.id,
        slug: "org-flow-organization",
      })
    );

    const clearedActiveOrganizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/set-active",
        {
          organizationId: null,
        },
        {
          cookieJar,
        }
      )
    );
    updateCookieJar(cookieJar, clearedActiveOrganizationResponse);
    expect(clearedActiveOrganizationResponse.status).toBe(200);

    const sessionAfterClearResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterClearResponse.status).toBe(200);
    const sessionAfterClear =
      (await sessionAfterClearResponse.json()) as SessionResponse;
    expect(sessionAfterClear?.session?.activeOrganizationId).toBeNull();

    const restoredActiveOrganizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/set-active",
        {
          organizationId: createdOrganization.id,
        },
        {
          cookieJar,
        }
      )
    );
    updateCookieJar(cookieJar, restoredActiveOrganizationResponse);
    expect(restoredActiveOrganizationResponse.status).toBe(200);

    const sessionAfterRestoreResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterRestoreResponse.status).toBe(200);
    const sessionAfterRestore =
      (await sessionAfterRestoreResponse.json()) as SessionResponse;
    expect(sessionAfterRestore?.session?.activeOrganizationId).toBe(
      createdOrganization.id
    );
  }, 30_000);

  it("sends verification mail on sign-up, supports resend, and marks the session user verified after the verification redirect", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (adminPool) => await canConnect(adminPool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Auth integration database unavailable; skipping email verification flow coverage"
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
      appOrigin: "http://127.0.0.1:4173",
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
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async ({ verificationUrl }) => {
        deliveredVerificationUrls.push(verificationUrl);
        await Promise.resolve();
      },
    });

    const cookieJar = new Map<string, string>();
    const callbackURL = "http://127.0.0.1:4173/verify-email";

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "verify-flow@example.com",
        name: "Verify Flow User",
        password: "correct horse battery staple",
        callbackURL,
      })
    );
    updateCookieJar(cookieJar, signUpResponse);
    expect(signUpResponse.status).toBe(200);
    expect(deliveredVerificationUrls).toHaveLength(1);
    expect(deliveredVerificationUrls[0]).toContain("/verify-email?token=");
    expect(deliveredVerificationUrls[0]).toContain(
      "callbackURL=http%3A%2F%2F127.0.0.1%3A4173%2Fverify-email"
    );

    const resendVerificationResponse = await auth.handler(
      makeJsonRequest(
        "/send-verification-email",
        {
          email: "verify-flow@example.com",
          callbackURL,
        },
        {
          cookieJar,
        }
      )
    );
    updateCookieJar(cookieJar, resendVerificationResponse);
    expect(resendVerificationResponse.status).toBe(200);
    expect(deliveredVerificationUrls).toHaveLength(2);

    const latestVerificationUrl = deliveredVerificationUrls.at(-1);
    expect(latestVerificationUrl).toBeDefined();
    const parsedVerificationUrl = new URL(latestVerificationUrl as string);

    const verifyHeaders = new Headers();
    if (cookieJar.size > 0) {
      verifyHeaders.set(
        "cookie",
        [...cookieJar.entries()]
          .map(([name, value]) => `${name}=${value}`)
          .join("; ")
      );
    }

    const verifyResponse = await auth.handler(
      new Request(
        `http://127.0.0.1:3000${parsedVerificationUrl.pathname}${parsedVerificationUrl.search}`,
        {
          headers: verifyHeaders,
        }
      )
    );
    updateCookieJar(cookieJar, verifyResponse);
    expect(verifyResponse.status).toBe(302);
    expect(verifyResponse.headers.get("location")).toBe(callbackURL);

    const sessionAfterVerifyResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterVerifyResponse.status).toBe(200);
    const sessionAfterVerify =
      (await sessionAfterVerifyResponse.json()) as SessionResponse;
    expect(sessionAfterVerify).toMatchObject({
      user: {
        emailVerified: true,
      },
    });
  }, 30_000);

  it("rate limits repeated verification email resend requests", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (adminPool) => await canConnect(adminPool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Auth integration database unavailable; skipping resend verification rate-limit coverage"
      );
    }

    await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
    await applyMigration(databaseUrl, "0001_giant_speedball.sql");
    await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
    await applyMigration(databaseUrl, "0003_organizations.sql");

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
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
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const cookieJar = new Map<string, string>();
    const callbackURL = "http://127.0.0.1:4173/verify-email";

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "verify-rate-limit@example.com",
        name: "Verify Rate Limit User",
        password: "correct horse battery staple",
        callbackURL,
      })
    );
    updateCookieJar(cookieJar, signUpResponse);
    expect(signUpResponse.status).toBe(200);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const resendResponse = await auth.handler(
        makeJsonRequest(
          "/send-verification-email",
          {
            email: "verify-rate-limit@example.com",
            callbackURL,
          },
          {
            cookieJar,
            forwardedFor: "203.0.113.25",
          }
        )
      );
      updateCookieJar(cookieJar, resendResponse);
      expect(resendResponse.status).toBe(200);
    }

    const limitedResponse = await auth.handler(
      makeJsonRequest(
        "/send-verification-email",
        {
          email: "verify-rate-limit@example.com",
          callbackURL,
        },
        {
          cookieJar,
          forwardedFor: "203.0.113.25",
        }
      )
    );

    expect(limitedResponse.status).toBe(429);

    const rateLimitRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        count: number;
        key: string;
      }>(`select key, count from rate_limit where key = $1`, [
        "203.0.113.25|/send-verification-email",
      ])
    );
    expect(rateLimitRows.rows).toHaveLength(1);
    expect(rateLimitRows.rows[0]?.count).toBe(3);
  }, 30_000);

  it("rejects organization creation when the slug violates the app contract", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping organization slug validation coverage"
      );
    }

    await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
    await applyMigration(databaseUrl, "0001_giant_speedball.sql");
    await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
    await applyMigration(databaseUrl, "0003_organizations.sql");

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
      backgroundTaskHandler: () => {},
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl,
      }),
      database: drizzle(authPool, { schema: authSchema }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const cookieJar = new Map<string, string>();

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "invalid-slug@example.com",
        name: "Invalid Slug User",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(cookieJar, signUpResponse);
    expect(signUpResponse.status).toBe(200);

    const organizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Invalid Slug Organization",
          slug: "Invalid Slug",
        },
        {
          cookieJar,
        }
      )
    );

    expect(organizationResponse.status).toBe(400);
    await expect(organizationResponse.json()).resolves.toMatchObject({
      code: "INVALID_ORGANIZATION_INPUT",
    });
  }, 30_000);

  it("sends an invitation email and activates the invited organization on acceptance", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping invitation flow coverage"
      );
    }

    await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
    await applyMigration(databaseUrl, "0001_giant_speedball.sql");
    await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
    await applyMigration(databaseUrl, "0003_organizations.sql");

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const sentInvitationEmails: unknown[] = [];
    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
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
      sendOrganizationInvitationEmail: (input) => {
        sentInvitationEmails.push(input);
        return Promise.resolve();
      },
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const ownerCookieJar = new Map<string, string>();
    const ownerSignUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "owner@example.com",
        name: "Owner Example",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(ownerCookieJar, ownerSignUpResponse);
    expect(ownerSignUpResponse.status).toBe(200);

    const organizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    updateCookieJar(ownerCookieJar, organizationResponse);
    expect(organizationResponse.status).toBe(200);
    const createdOrganization =
      (await organizationResponse.json()) as CreatedOrganizationResponse;

    const inviteResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "member@example.com",
          role: "member",
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    expect(inviteResponse.status).toBe(200);
    const invitation = (await inviteResponse.json()) as {
      readonly id: string;
      readonly email: string;
      readonly organizationId: string;
      readonly role: string;
      readonly status: string;
    };
    expect(invitation.email).toBe("member@example.com");
    expect(invitation.organizationId).toBe(createdOrganization.id);
    expect(sentInvitationEmails).toStrictEqual([
      expect.objectContaining({
        idempotencyKey: `organization-invitation/${invitation.id}`,
        invitationUrl: `http://127.0.0.1:4173/accept-invitation/${invitation.id}`,
        inviterEmail: "owner@example.com",
        organizationName: "Acme Field Ops",
        recipientEmail: "member@example.com",
        role: "member",
      }),
    ]);

    const invitedCookieJar = new Map<string, string>();
    const invitedSignUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "member@example.com",
        name: "Member Example",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(invitedCookieJar, invitedSignUpResponse);
    expect(invitedSignUpResponse.status).toBe(200);

    const acceptInvitationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/accept-invitation",
        {
          invitationId: invitation.id,
        },
        {
          cookieJar: invitedCookieJar,
        }
      )
    );
    updateCookieJar(invitedCookieJar, acceptInvitationResponse);
    expect(acceptInvitationResponse.status).toBe(200);

    const invitedSessionResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar: invitedCookieJar,
      })
    );
    expect(invitedSessionResponse.status).toBe(200);
    const invitedSession =
      (await invitedSessionResponse.json()) as SessionResponse;
    expect(invitedSession.session?.activeOrganizationId).toBe(
      createdOrganization.id
    );
  }, 30_000);

  it("migrates a non-empty rate_limit table and serves sign-up, sign-in, sign-out, session, password reset, reset callback handoff, session revocation, and rate limiting", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping native password reset flow coverage"
      );
    }

    await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
    await applyMigration(databaseUrl, "0001_giant_speedball.sql");

    await adminPool.query(
      `insert into rate_limit (key, count, last_request) values ($1, $2, $3)`,
      ["203.0.113.9|/sign-in/email", 2, Date.now()]
    );

    await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
    await applyMigration(databaseUrl, "0003_organizations.sql");

    const migrationRows = await adminPool.query<{
      id: string;
      key: string;
    }>(`select id, key from rate_limit where key = $1`, [
      "203.0.113.9|/sign-in/email",
    ]);
    expect(migrationRows.rows).toHaveLength(1);
    expect(migrationRows.rows[0]?.id.length).toBeGreaterThan(0);

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const capturedResetUrls: string[] = [];
    const passwordResetDelivery = await Effect.runPromise(
      Deferred.make<boolean>()
    );
    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
      backgroundTaskHandler: () => {},
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl,
      }),
      database: drizzle(authPool, { schema: authSchema }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async ({ resetUrl }) => {
        capturedResetUrls.push(resetUrl);
        await Effect.runPromise(Deferred.await(passwordResetDelivery));
      },
      sendVerificationEmail: async () => {},
    });

    const cookieJar = new Map<string, string>();

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "integration@example.com",
        name: "Integration User",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(cookieJar, signUpResponse);
    expect(signUpResponse.status).toBe(200);

    const sessionAfterSignUpResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterSignUpResponse.status).toBe(200);
    const sessionAfterSignUp =
      (await sessionAfterSignUpResponse.json()) as SessionResponse;
    expect(sessionAfterSignUp?.user?.email).toBe("integration@example.com");

    const signOutResponse = await auth.handler(
      makeRequest("/sign-out", {
        cookieJar,
        method: "POST",
      })
    );
    updateCookieJar(cookieJar, signOutResponse);
    expect(signOutResponse.status).toBe(200);

    const sessionAfterSignOutResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterSignOutResponse.status).toBe(200);
    await expect(sessionAfterSignOutResponse.json()).resolves.toBeNull();

    const signInResponse = await auth.handler(
      makeJsonRequest("/sign-in/email", {
        email: "integration@example.com",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(cookieJar, signInResponse);
    expect(signInResponse.status).toBe(200);

    const sessionAfterSignInResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterSignInResponse.status).toBe(200);
    const sessionAfterSignIn =
      (await sessionAfterSignInResponse.json()) as SessionResponse;
    expect(sessionAfterSignIn?.user?.email).toBe("integration@example.com");

    const resetRequestPromise = auth.handler(
      makeJsonRequest("/request-password-reset", {
        email: "integration@example.com",
        redirectTo: "http://127.0.0.1:3000/reset-password",
      })
    );

    await expect(
      Promise.race([
        resetRequestPromise.then((response) => response.status),
        wait(100).then(() => "timed-out" as const),
      ])
    ).resolves.toBe(200);

    await Effect.runPromise(
      Deferred.completeWith(passwordResetDelivery, Effect.succeed(true))
    );

    const resetRequestResponse = await resetRequestPromise;
    expect(resetRequestResponse.status).toBe(200);
    expect(capturedResetUrls).toHaveLength(1);

    const [resetUrl] = capturedResetUrls;
    const parsedResetUrl = new URL(resetUrl);
    expect(parsedResetUrl.origin).toBe("http://127.0.0.1:3000");
    expect(parsedResetUrl.pathname).toMatch(/^\/api\/auth\/reset-password\/.+/);
    expect(parsedResetUrl.searchParams.get("callbackURL")).toBe(
      "http://127.0.0.1:3000/reset-password"
    );

    const resetToken = resetUrl.split("?", 1)[0]?.split("/").pop();
    expect(resetToken).toBeDefined();
    expect(resetToken).not.toBe("");

    const resetCallbackResponse = await auth.handler(
      makeRequest(
        `/reset-password/${resetToken}?callbackURL=${encodeURIComponent("http://127.0.0.1:3000/reset-password")}`
      )
    );
    expect(resetCallbackResponse.status).toBe(302);
    expect(resetCallbackResponse.headers.get("location")).toBe(
      `http://127.0.0.1:3000/reset-password?token=${resetToken}`
    );

    const resetPasswordResponse = await auth.handler(
      makeJsonRequest("/reset-password", {
        token: resetToken,
        newPassword: "new horse battery staple",
      })
    );
    expect(resetPasswordResponse.status).toBe(200);

    const sessionAfterResetResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar,
      })
    );
    expect(sessionAfterResetResponse.status).toBe(200);
    await expect(sessionAfterResetResponse.json()).resolves.toBeNull();

    const oldPasswordResponse = await auth.handler(
      makeJsonRequest(
        "/sign-in/email",
        {
          email: "integration@example.com",
          password: "correct horse battery staple",
        },
        {
          forwardedFor: "203.0.113.20",
        }
      )
    );
    expect(oldPasswordResponse.status).toBe(401);

    const newPasswordResponse = await auth.handler(
      makeJsonRequest("/sign-in/email", {
        email: "integration@example.com",
        password: "new horse battery staple",
      })
    );
    expect(newPasswordResponse.status).toBe(200);

    const invalidResetCallbackResponse = await auth.handler(
      makeRequest(
        `/reset-password/${resetToken}?callbackURL=${encodeURIComponent("http://127.0.0.1:3000/reset-password")}`
      )
    );
    expect(invalidResetCallbackResponse.status).toBe(302);
    expect(invalidResetCallbackResponse.headers.get("location")).toBe(
      "http://127.0.0.1:3000/reset-password?error=INVALID_TOKEN"
    );

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await auth.handler(
        makeJsonRequest(
          "/sign-in/email",
          {
            email: "integration@example.com",
            password: "wrong-password",
          },
          {
            forwardedFor: "203.0.113.10",
          }
        )
      );
      expect(response.status).toBe(401);
    }

    const limitedResponse = await auth.handler(
      makeJsonRequest(
        "/sign-in/email",
        {
          email: "integration@example.com",
          password: "wrong-password",
        },
        {
          forwardedFor: "203.0.113.10",
        }
      )
    );
    expect(limitedResponse.status).toBe(429);

    const rateLimitRows = await adminPool.query<{
      count: number;
      key: string;
    }>(`select key, count from rate_limit where key = $1`, [
      "203.0.113.10|/sign-in/email",
    ]);
    expect(rateLimitRows.rows).toHaveLength(1);
    expect(rateLimitRows.rows[0]?.count).toBe(5);
  }, 30_000);

  it("reports password reset delivery failures even when Better Auth runs them in background mode", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping background delivery failure reporting coverage"
      );
    }

    await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
    await applyMigration(databaseUrl, "0001_giant_speedball.sql");
    await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
    await applyMigration(databaseUrl, "0003_organizations.sql");

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const reportedFailures: unknown[] = [];

    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
      backgroundTaskHandler: () => {},
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl,
      }),
      database: drizzle(authPool, { schema: authSchema }),
      reportPasswordResetEmailFailure: (error) => {
        reportedFailures.push(error);
      },
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: () => {
        throw new Error("upstream timeout");
      },
      sendVerificationEmail: async () => {},
    });

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "delivery-failure@example.com",
        name: "Delivery Failure User",
        password: "correct horse battery staple",
      })
    );
    expect(signUpResponse.status).toBe(200);

    const resetRequestResponse = await auth.handler(
      makeJsonRequest("/request-password-reset", {
        email: "delivery-failure@example.com",
        redirectTo: "http://127.0.0.1:3000/reset-password",
      })
    );

    expect(resetRequestResponse.status).toBe(200);
    expect(reportedFailures).toHaveLength(1);
    expect(reportedFailures[0]).toBeInstanceOf(Error);
    expect(reportedFailures[0]).toMatchObject({
      message: "upstream timeout",
    });
  }, 30_000);

  it("reports verification email delivery failures even when Better Auth runs them in background mode", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (adminPool) => await canConnect(adminPool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Auth integration database unavailable; skipping verification delivery failure reporting coverage"
      );
    }

    await applyMigration(databaseUrl, "0000_careless_anita_blake.sql");
    await applyMigration(databaseUrl, "0001_giant_speedball.sql");
    await applyMigration(databaseUrl, "0002_slippery_hulk.sql");
    await applyMigration(databaseUrl, "0003_organizations.sql");

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const reportedFailures: unknown[] = [];

    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
      backgroundTaskHandler: () => {},
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl,
      }),
      database: drizzle(authPool, { schema: authSchema }),
      reportPasswordResetEmailFailure: () => {},
      reportVerificationEmailFailure: (error) => {
        reportedFailures.push(error);
      },
      sendOrganizationInvitationEmail: async () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: () => {
        throw new Error("upstream timeout");
      },
    });

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "verification-delivery-failure@example.com",
        name: "Verification Delivery Failure User",
        password: "correct horse battery staple",
      })
    );

    expect(signUpResponse.status).toBe(200);
    expect(reportedFailures).toHaveLength(1);
    expect(reportedFailures[0]).toBeInstanceOf(Error);
    expect(reportedFailures[0]).toMatchObject({
      message: "upstream timeout",
    });
  }, 30_000);
});

async function createTestDatabase(): Promise<{
  readonly cleanup: () => Promise<void>;
  readonly url: string;
}> {
  const baseUrl = new URL(
    process.env.AUTH_TEST_DATABASE_URL ?? DEFAULT_AUTH_DATABASE_URL
  );
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres";

  const databaseName = `auth_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const adminPool = new Pool({ connectionString: adminUrl.toString() });

  if (!(await canConnect(adminPool))) {
    await adminPool.end();
    return {
      cleanup: async () => {},
      url: baseUrl.toString(),
    };
  }

  await adminPool.query(`create database "${databaseName}"`);
  await adminPool.end();

  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;

  return {
    cleanup: async () => {
      const dropPool = new Pool({ connectionString: adminUrl.toString() });

      try {
        await dropPool.query(
          `select pg_terminate_backend(pid)
           from pg_stat_activity
           where datname = $1 and pid <> pg_backend_pid()`,
          [databaseName]
        );
        await dropPool.query(`drop database if exists "${databaseName}"`);
      } finally {
        await dropPool.end();
      }
    },
    url: databaseUrl.toString(),
  };
}

async function canConnect(pool: Pool): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function withPool<Result>(
  connectionString: string,
  operation: (pool: Pool) => Promise<Result>
): Promise<Result> {
  const pool = new Pool({ connectionString });

  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}

async function applyMigration(
  databaseUrl: string,
  migrationFileName: string
): Promise<void> {
  const migrationPath = path.resolve(
    process.cwd(),
    "drizzle",
    migrationFileName
  );
  const migrationSql = await fs.readFile(migrationPath, "utf8");
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    for (const statement of statements) {
      await pool.query(statement);
    }
  } finally {
    await pool.end();
  }
}

function wait(milliseconds: number) {
  return delay(milliseconds);
}

function makeJsonRequest(
  routePath: string,
  body: Record<string, unknown>,
  options?: RequestOptions
): Request {
  return makeRequest(routePath, {
    ...options,
    body: JSON.stringify(body),
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
}

interface RequestOptions {
  readonly body?: string;
  readonly cookieJar?: Map<string, string>;
  readonly forwardedFor?: string;
  readonly headers?: Record<string, string>;
  readonly method?: string;
}

interface SessionResponse {
  readonly user?: {
    readonly email?: string;
    readonly emailVerified?: boolean;
  };
  readonly session?: {
    readonly activeOrganizationId?: string;
  };
}

interface CreatedOrganizationResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly members: readonly {
    readonly organizationId: string;
    readonly role: string;
  }[];
}

function makeRequest(routePath: string, options?: RequestOptions): Request {
  const headers = new Headers(options?.headers);

  if (options?.cookieJar && options.cookieJar.size > 0) {
    headers.set(
      "cookie",
      [...options.cookieJar.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    );
  }

  if (options?.forwardedFor) {
    headers.set("x-forwarded-for", options.forwardedFor);
  }

  return new Request(
    `http://127.0.0.1:3000${DEFAULT_AUTH_BASE_PATH}${routePath}`,
    {
      body: options?.body,
      headers,
      method: options?.method ?? "GET",
    }
  );
}

function updateCookieJar(
  cookieJar: Map<string, string>,
  response: Response
): void {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieHeaders =
    headers.getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);

  for (const header of setCookieHeaders) {
    const [cookie] = header.split(";", 1);
    if (!cookie) {
      continue;
    }

    const separatorIndex = cookie.indexOf("=");
    const name = cookie.slice(0, separatorIndex);
    const value = cookie.slice(separatorIndex + 1);

    if (value.length === 0) {
      cookieJar.delete(name);
    } else {
      cookieJar.set(name, value);
    }
  }
}
