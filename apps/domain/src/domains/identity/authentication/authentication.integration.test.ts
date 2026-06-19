import { createHash, createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  decodeInvitationId,
  decodePublicInvitationPreview,
} from "@ceird/identity-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConfigProvider, Deferred, Effect } from "effect";
import { Pool } from "pg";

import {
  AppDatabase,
  AppDatabaseLive,
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "../../../platform/database/database.js";
import {
  applyAllMigrations,
  applyMigration,
  canConnect,
  createTestDatabase as createPlatformTestDatabase,
  withPool,
} from "../../../platform/database/test-database.js";
import { makeApiWebHandler } from "../../../server.js";
import { configProviderFromMap } from "../../../test/effect-test-helpers.js";
import type { PasswordResetEmailInput } from "./auth-email.js";
import { createAuthentication, findPublicInvitationPreview } from "./auth.js";
import { DEFAULT_AUTH_BASE_PATH, makeAuthenticationConfig } from "./config.js";

describe("authentication integration", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    for (const step of [...cleanup].toReversed()) {
      await step();
    }
  });

  it("boots authentication on the shared app database runtime", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping shared database runtime coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;

    try {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* verifySharedRuntimeBoot() {
            const { authDb } = yield* AppDatabase;
            const auth = createAuthentication({
              appOrigin: "http://127.0.0.1:4173",
              backgroundTaskHandler: () => {},
              config: makeAuthenticationConfig({
                baseUrl: "http://127.0.0.1:3000",
                secret: "0123456789abcdef0123456789abcdef",
                databaseUrl,
              }),
              database: authDb,
              reportPasswordResetEmailFailure: () => {},
              sendOrganizationInvitationEmail: async () => {},
              reportVerificationEmailFailure: () => {},
              sendPasswordResetEmail: async () => {},
              sendVerificationEmail: async () => {},
            });

            const cookieJar = new Map<string, string>();
            const signUpResponse = yield* Effect.promise(() =>
              auth.handler(
                makeJsonRequest("/sign-up/email", {
                  email: "shared-runtime@example.com",
                  name: "Shared Runtime User",
                  password: "correct horse battery staple",
                })
              )
            );
            updateCookieJar(cookieJar, signUpResponse);

            const sessionResponse = yield* Effect.promise(() =>
              auth.handler(
                makeRequest("/get-session", {
                  cookieJar,
                })
              )
            );

            return {
              sessionResponse,
              signUpResponse,
            };
          }).pipe(Effect.provide(AppDatabaseLive))
        )
      );

      expect(result.signUpResponse.status).toBe(200);
      expect(result.sessionResponse.status).toBe(200);
      const session = (await result.sessionResponse.json()) as SessionResponse;
      expect(session?.user?.email).toBe("shared-runtime@example.com");
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  }, 30_000);

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

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
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
    await verifyUserEmailForTest(adminPool, "org-flow@example.com");

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

  it("rejects organization creation when the user has reached the first-release organization limit", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping organization limit coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const cookieJar = new Map<string, string>();

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "org-limit@example.com",
        name: "Org Limit User",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(cookieJar, signUpResponse);
    expect(signUpResponse.status).toBe(200);
    await verifyUserEmailForTest(adminPool, "org-limit@example.com");

    for (let index = 1; index <= 10; index += 1) {
      const organizationResponse = await auth.handler(
        makeJsonRequest(
          "/organization/create",
          {
            name: `Limit Organization ${index}`,
            slug: `limit-organization-${index}`,
          },
          {
            cookieJar,
          }
        )
      );
      updateCookieJar(cookieJar, organizationResponse);
      expect(organizationResponse.status).toBe(200);
    }

    const blockedResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Limit Organization 11",
          slug: "limit-organization-11",
        },
        {
          cookieJar,
        }
      )
    );

    expect(blockedResponse.status).toBe(403);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
    });

    const userRows = await adminPool.query<{
      id: string;
    }>(`select id from "user" where email = $1`, ["org-limit@example.com"]);
    expect(userRows.rows).toHaveLength(1);
    const organizationRows = await adminPool.query<{
      count: number;
    }>(
      `select count(*)::int as count
       from organization
       where slug like 'limit-organization-%'`
    );
    const membershipRows = await adminPool.query<{
      count: number;
    }>(`select count(*)::int as count from member where user_id = $1`, [
      userRows.rows[0]?.id,
    ]);

    expect(organizationRows.rows[0]?.count).toBe(10);
    expect(membershipRows.rows[0]?.count).toBe(10);
  }, 30_000);

  it("blocks unverified organization create and invite flows before persistence or email side effects", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping unverified organization guard coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());
    const sentInvitations: unknown[] = [];

    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
      backgroundTaskHandler: () => {},
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl,
      }),
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: (input) => {
        sentInvitations.push(input);
        return Promise.resolve();
      },
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const cookieJar = new Map<string, string>();

    const signUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "unverified-org-guard@example.com",
        name: "Unverified Org Guard",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(cookieJar, signUpResponse);
    expect(signUpResponse.status).toBe(200);

    const blockedCreateResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Blocked Organization",
          slug: "blocked-organization",
        },
        {
          cookieJar,
        }
      )
    );

    await expect(blockedCreateResponse.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before creating an organization.",
    });
    expect(blockedCreateResponse.status).toBe(403);
    const blockedOrganizationRows = await adminPool.query<{
      count: number;
    }>(`select count(*)::int as count from organization where slug = $1`, [
      "blocked-organization",
    ]);
    expect(blockedOrganizationRows.rows[0]?.count).toBe(0);

    await verifyUserEmailForTest(adminPool, "unverified-org-guard@example.com");

    const createResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Verified Organization",
          slug: "verified-organization",
        },
        {
          cookieJar,
        }
      )
    );
    updateCookieJar(cookieJar, createResponse);
    expect(createResponse.status).toBe(200);
    const createdOrganization =
      (await createResponse.json()) as CreatedOrganizationResponse;

    await unverifyUserEmailForTest(
      adminPool,
      "unverified-org-guard@example.com"
    );

    const blockedInviteResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "invitee@example.com",
          organizationId: createdOrganization.id,
          role: "member",
        },
        {
          cookieJar,
          forwardedFor: "127.0.0.1",
        }
      )
    );

    await expect(blockedInviteResponse.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before inviting organization members.",
    });
    expect(blockedInviteResponse.status).toBe(403);
    expect(sentInvitations).toStrictEqual([]);
    const invitationRows = await adminPool.query<{
      count: number;
    }>(
      `select count(*)::int as count from invitation where organization_id = $1`,
      [createdOrganization.id]
    );
    expect(invitationRows.rows[0]?.count).toBe(0);
  }, 30_000);

  it("simulates Turnstile verification without binding a local server", async () => {
    await withCaptchaSiteVerifyServer(async ({ requests, url }) => {
      const acceptedResponse = await fetch(url, {
        body: JSON.stringify({
          remoteip: "203.0.113.42",
          response: "captcha-token",
          secret: "turnstile-secret-key",
        }),
        method: "POST",
      });
      const rejectedResponse = await fetch(url, {
        body: JSON.stringify({
          remoteip: "203.0.113.43",
          response: "invalid-captcha-token",
          secret: "turnstile-secret-key",
        }),
        method: "POST",
      });

      await expect(acceptedResponse.json()).resolves.toStrictEqual({
        success: true,
      });
      await expect(rejectedResponse.json()).resolves.toStrictEqual({
        success: false,
      });
      expect(requests).toStrictEqual([
        {
          remoteip: "203.0.113.42",
          response: "captcha-token",
          secret: "turnstile-secret-key",
        },
        {
          remoteip: "203.0.113.43",
          response: "invalid-captcha-token",
          secret: "turnstile-secret-key",
        },
      ]);
    });
  });

  it("enforces Turnstile captcha verification before protected sign-up persistence", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping captcha sign-up verification coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    await withCaptchaSiteVerifyServer(async ({ requests, url }) => {
      const auth = createAuthentication({
        appOrigin: "http://127.0.0.1:4173",
        backgroundTaskHandler: () => {},
        config: makeAuthenticationConfig({
          baseUrl: "http://127.0.0.1:3000",
          captchaEnabled: true,
          captchaSiteVerifyURLOverride: url,
          captchaTurnstileSecretKey: "turnstile-secret-key",
          rateLimitEnabled: false,
          secret: "0123456789abcdef0123456789abcdef",
          databaseUrl,
        }),
        database: drizzle({ client: authPool }),
        reportPasswordResetEmailFailure: () => {},
        sendOrganizationInvitationEmail: async () => {},
        reportVerificationEmailFailure: () => {},
        sendPasswordResetEmail: async () => {},
        sendVerificationEmail: async () => {},
      });

      const cookieJar = new Map<string, string>();
      const acceptedResponse = await auth.handler(
        makeJsonRequest(
          "/sign-up/email",
          {
            email: "captcha-accepted@example.com",
            name: "Captcha Accepted",
            password: "correct horse battery staple",
          },
          {
            forwardedFor: "203.0.113.42",
            headers: {
              "x-captcha-response": "captcha-token",
            },
          }
        )
      );

      updateCookieJar(cookieJar, acceptedResponse);
      expect(acceptedResponse.status).toBe(200);

      const rejectedResponse = await auth.handler(
        makeJsonRequest(
          "/sign-up/email",
          {
            email: "captcha-rejected@example.com",
            name: "Captcha Rejected",
            password: "correct horse battery staple",
          },
          {
            forwardedFor: "203.0.113.43",
            headers: {
              "x-captcha-response": "invalid-captcha-token",
            },
          }
        )
      );

      const passwordResetResponse = await auth.handler(
        makeJsonRequest(
          "/request-password-reset",
          {
            email: "captcha-accepted@example.com",
            redirectTo: "http://127.0.0.1:4173/reset-password",
          },
          {
            forwardedFor: "203.0.113.44",
            headers: {
              "x-captcha-response": "captcha-token",
            },
          }
        )
      );
      expect(passwordResetResponse.status).toBe(200);

      const verificationResendResponse = await auth.handler(
        makeJsonRequest(
          "/send-verification-email",
          {
            email: "captcha-accepted@example.com",
            callbackURL: "http://127.0.0.1:4173/verify-email",
          },
          {
            cookieJar,
            forwardedFor: "203.0.113.45",
            headers: {
              "x-captcha-response": "captcha-token",
            },
          }
        )
      );
      expect(verificationResendResponse.status).toBe(200);

      expect(rejectedResponse.status).toBe(403);
      await expect(rejectedResponse.json()).resolves.toStrictEqual({
        code: "VERIFICATION_FAILED",
        message: "Captcha verification failed",
      });
      expect(requests).toStrictEqual([
        {
          remoteip: "203.0.113.42",
          response: "captcha-token",
          secret: "turnstile-secret-key",
        },
        {
          remoteip: "203.0.113.43",
          response: "invalid-captcha-token",
          secret: "turnstile-secret-key",
        },
        {
          remoteip: "203.0.113.44",
          response: "captcha-token",
          secret: "turnstile-secret-key",
        },
        {
          remoteip: "203.0.113.45",
          response: "captcha-token",
          secret: "turnstile-secret-key",
        },
      ]);

      const userRows = await adminPool.query<{
        count: number;
        email: string;
      }>(
        `select email, count(*)::int as count
         from "user"
         where email in ($1, $2)
         group by email
         order by email`,
        ["captcha-accepted@example.com", "captcha-rejected@example.com"]
      );

      expect(userRows.rows).toStrictEqual([
        {
          count: 1,
          email: "captcha-accepted@example.com",
        },
      ]);
    });
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

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
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

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
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

  it("atomically reserves public auth abuse limits under concurrent password reset bursts", async (context: {
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
        "Auth integration database unavailable; skipping atomic auth abuse rate-limit coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, attempt) =>
        auth.handler(
          makeJsonRequest(
            "/request-password-reset",
            {
              email: `missing-reset-${attempt}@example.com`,
              redirectTo: "http://127.0.0.1:3000/reset-password",
            },
            {
              forwardedFor: "203.0.113.30",
            }
          )
        )
      )
    );
    const statuses = responses.map((response) => response.status).toSorted();

    expect(statuses).toStrictEqual([200, 200, 200, 429]);

    const rateLimitRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        count: number;
        key: string;
      }>(`select key, count from rate_limit where key = $1`, [
        "ceird-auth-abuse:203.0.113.30|/request-password-reset",
      ])
    );

    expect(rateLimitRows.rows).toHaveLength(1);
    expect(rateLimitRows.rows[0]?.count).toBe(4);
  }, 30_000);

  it("persists password reset delivery limits with HMAC target-email keys", async (context: {
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
        "Auth integration database unavailable; skipping password reset delivery key persistence coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const secret = "0123456789abcdef0123456789abcdef";
    const normalizedEmail = "delivery-limit@example.com";
    const auth = createAuthentication({
      appOrigin: "http://127.0.0.1:4173",
      backgroundTaskHandler: async (task) => {
        await task;
      },
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret,
        databaseUrl,
      }),
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const response = await auth.handler(
      makeJsonRequest(
        "/request-password-reset",
        {
          email: normalizedEmail,
          redirectTo: "http://127.0.0.1:4173/reset-password",
        },
        {
          forwardedFor: "203.0.113.31",
        }
      )
    );

    expect(response.status).toBe(200);

    const expectedTargetEmailKey = makeExpectedAuthAbuseEmailKey({
      email: normalizedEmail,
      endpointPath: "/request-password-reset",
      scope: "target-email",
      secret,
    });
    const rateLimitRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        count: number;
        key: string;
      }>(
        `select key, count
         from rate_limit
         where key like 'ceird-auth-abuse:%'
         order by key`
      )
    );

    expect(rateLimitRows.rows).toStrictEqual(
      expect.arrayContaining([
        {
          count: 1,
          key: "ceird-auth-abuse:203.0.113.31|/request-password-reset",
        },
        {
          count: 1,
          key: expectedTargetEmailKey,
        },
      ])
    );
    expect(JSON.stringify(rateLimitRows.rows)).not.toContain("delivery-limit");
    expect(JSON.stringify(rateLimitRows.rows)).not.toContain("example.com");
  }, 30_000);

  it("rejects invalid OAuth dynamic client registration before client persistence", async (context: {
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
        "Auth integration database unavailable; skipping OAuth dynamic client registration persistence coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const response = await auth.handler(
      makeJsonRequest(
        "/oauth2/register",
        {
          redirect_uris: ["https://client.example/oauth/callback"],
          scope: "openid ceird:write",
        },
        {
          forwardedFor: "203.0.113.40",
        }
      )
    );

    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_scope",
    });
    expect(response.status).toBe(400);

    const persistedRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        count: number;
      }>(`select count(*)::int as count from oauth_client`)
    );
    expect(persistedRows.rows[0]?.count).toBe(0);

    const rateLimitRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        count: number;
        key: string;
      }>(`select key, count from rate_limit where key = $1`, [
        "ceird-auth-abuse:203.0.113.40|/oauth2/register",
      ])
    );

    expect(rateLimitRows.rows).toHaveLength(1);
    expect(rateLimitRows.rows[0]?.count).toBe(1);

    const auditRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        event_type: string;
        metadata: {
          dynamicRegistration?: boolean;
          oauthError?: string;
          outcome?: string;
          requestedUnknownScope?: boolean;
          source?: string;
        };
        oauth_client_id: string | null;
        scopes: string[] | null;
        source_ip: string | null;
      }>(
        `select event_type,
                metadata,
                oauth_client_id,
                scopes,
                source_ip
         from auth_security_audit_event
         where event_type = 'oauth_client_registration_rejected'`
      )
    );

    expect(auditRows.rows).toStrictEqual([
      {
        event_type: "oauth_client_registration_rejected",
        metadata: {
          dynamicRegistration: true,
          oauthError: "invalid_scope",
          outcome: "rejected",
          requestedUnknownScope: false,
          source: "better_auth_oauth_endpoint",
        },
        oauth_client_id: null,
        scopes: ["openid", "ceird:write"],
        source_ip: "203.0.113.40",
      },
    ]);
    expect(JSON.stringify(auditRows.rows)).not.toContain(
      "https://client.example/oauth/callback"
    );
  }, 30_000);

  it("persists explicit refresh-token DCR metadata while omitted grants stay authorization-code-only", async (context: {
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
        "Auth integration database unavailable; skipping OAuth dynamic client registration persistence coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });
    const expectedDefaultScopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "ceird:read",
    ];
    const expectedDefaultScope = expectedDefaultScopes.join(" ");

    const refreshResponse = await auth.handler(
      makeJsonRequest(
        "/oauth2/register",
        {
          client_name: "Ceird MCP Runtime Smoke",
          contacts: ["security@example.com"],
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["http://127.0.0.1:9123/oauth/callback"],
          type: "native",
        },
        {
          forwardedFor: "203.0.113.41",
          headers: {
            "user-agent": "Ceird MCP Runtime Smoke",
          },
        }
      )
    );

    expect(refreshResponse.status).toBe(200);
    const refreshRegistration =
      (await refreshResponse.json()) as OAuthClientRegistrationResponse;

    expect(refreshRegistration.client_id).toStrictEqual(expect.any(String));
    expect(refreshRegistration.client_secret).toBeUndefined();
    expect(refreshRegistration.grant_types).toStrictEqual([
      "authorization_code",
      "refresh_token",
    ]);
    expect(refreshRegistration.redirect_uris).toStrictEqual([
      "http://127.0.0.1:9123/oauth/callback",
    ]);
    expect(refreshRegistration.token_endpoint_auth_method).toBe("none");
    expect(refreshRegistration.scope).toBe(expectedDefaultScope);

    const authorizationOnlyResponse = await auth.handler(
      makeJsonRequest(
        "/oauth2/register",
        {
          client_name: "Ceird MCP Runtime Authorization Code",
          redirect_uris: ["http://127.0.0.1:9124/oauth/callback"],
          type: "native",
        },
        {
          forwardedFor: "203.0.113.42",
          headers: {
            "user-agent": "Ceird MCP Authorization Code Smoke",
          },
        }
      )
    );

    expect(authorizationOnlyResponse.status).toBe(200);
    const authorizationOnlyRegistration =
      (await authorizationOnlyResponse.json()) as OAuthClientRegistrationResponse;

    expect(authorizationOnlyRegistration.client_id).toStrictEqual(
      expect.any(String)
    );
    expect(authorizationOnlyRegistration.client_secret).toBeUndefined();
    expect(authorizationOnlyRegistration.grant_types).toStrictEqual([
      "authorization_code",
    ]);
    expect(authorizationOnlyRegistration.redirect_uris).toStrictEqual([
      "http://127.0.0.1:9124/oauth/callback",
    ]);
    expect(authorizationOnlyRegistration.token_endpoint_auth_method).toBe(
      "none"
    );
    expect(authorizationOnlyRegistration.scope).toBe(expectedDefaultScope);

    const persistedRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        client_id: string;
        client_secret: string | null;
        contacts: string[] | null;
        grant_types: string[] | null;
        name: string | null;
        public: boolean | null;
        redirect_uris: string[];
        response_types: string[] | null;
        scopes: string[] | null;
        skip_consent: boolean | null;
        token_endpoint_auth_method: string | null;
        type: string | null;
        user_id: string | null;
      }>(
        `select client_id,
                client_secret,
                contacts,
                grant_types,
                name,
                public,
                redirect_uris,
                response_types,
                scopes,
                skip_consent,
                token_endpoint_auth_method,
                type,
                user_id
         from oauth_client
         order by name`
      )
    );

    expect(persistedRows.rows).toStrictEqual([
      {
        client_id: authorizationOnlyRegistration.client_id,
        client_secret: null,
        contacts: null,
        grant_types: ["authorization_code"],
        name: "Ceird MCP Runtime Authorization Code",
        public: true,
        redirect_uris: ["http://127.0.0.1:9124/oauth/callback"],
        response_types: ["code"],
        scopes: expectedDefaultScopes,
        skip_consent: null,
        token_endpoint_auth_method: "none",
        type: "native",
        user_id: null,
      },
      {
        client_id: refreshRegistration.client_id,
        client_secret: null,
        contacts: ["security@example.com"],
        grant_types: ["authorization_code", "refresh_token"],
        name: "Ceird MCP Runtime Smoke",
        public: true,
        redirect_uris: ["http://127.0.0.1:9123/oauth/callback"],
        response_types: ["code"],
        scopes: expectedDefaultScopes,
        skip_consent: null,
        token_endpoint_auth_method: "none",
        type: "native",
        user_id: null,
      },
    ]);

    const rateLimitRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        count: number;
        key: string;
      }>(
        `select key, count
         from rate_limit
         where key in ($1, $2)
         order by key`,
        [
          "ceird-auth-abuse:203.0.113.41|/oauth2/register",
          "ceird-auth-abuse:203.0.113.42|/oauth2/register",
        ]
      )
    );

    expect(rateLimitRows.rows).toStrictEqual([
      {
        count: 1,
        key: "ceird-auth-abuse:203.0.113.41|/oauth2/register",
      },
      {
        count: 1,
        key: "ceird-auth-abuse:203.0.113.42|/oauth2/register",
      },
    ]);

    const auditRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        actor_user_id: string | null;
        event_type: string;
        metadata: {
          dynamicRegistration?: boolean;
          oauthError?: string | null;
          outcome?: string;
          source?: string;
        };
        oauth_client_id: string | null;
        scopes: string[] | null;
        source_ip: string | null;
        user_agent: string | null;
      }>(
        `select actor_user_id,
                event_type,
                metadata,
                oauth_client_id,
                scopes,
                source_ip,
                user_agent
         from auth_security_audit_event
         where event_type = 'oauth_client_registration_succeeded'
         order by source_ip`
      )
    );

    expect(auditRows.rows).toStrictEqual([
      {
        actor_user_id: null,
        event_type: "oauth_client_registration_succeeded",
        metadata: {
          dynamicRegistration: true,
          oauthError: null,
          outcome: "succeeded",
          source: "better_auth_oauth_endpoint",
        },
        oauth_client_id: refreshRegistration.client_id,
        scopes: expectedDefaultScopes,
        source_ip: "203.0.113.41",
        user_agent: "Ceird MCP Runtime Smoke",
      },
      {
        actor_user_id: null,
        event_type: "oauth_client_registration_succeeded",
        metadata: {
          dynamicRegistration: true,
          oauthError: null,
          outcome: "succeeded",
          source: "better_auth_oauth_endpoint",
        },
        oauth_client_id: authorizationOnlyRegistration.client_id,
        scopes: expectedDefaultScopes,
        source_ip: "203.0.113.42",
        user_agent: "Ceird MCP Authorization Code Smoke",
      },
    ]);
    expect(JSON.stringify(auditRows.rows)).not.toContain("client_secret");
  }, 30_000);

  it("creates the auth security audit event table and indexes through migrations", async (context: {
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
        "Auth integration database unavailable; skipping auth security audit migration coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const auditTableRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        count: number;
      }>(
        `select count(*)::int as count
         from information_schema.tables
         where table_schema = 'public'
           and table_name = 'auth_security_audit_event'`
      )
    );
    const auditIndexRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        indexname: string;
      }>(
        `select indexname
         from pg_indexes
         where schemaname = 'public'
           and tablename = 'auth_security_audit_event'`
      )
    );
    const auditConstraintRows = await withPool(databaseUrl, (adminPool) =>
      adminPool.query<{
        conname: string;
      }>(
        `select conname
         from pg_constraint
         where conname = 'auth_security_audit_event_type_chk'`
      )
    );

    expect(auditTableRows.rows[0]?.count).toBe(1);
    expect(auditConstraintRows.rows).toStrictEqual([
      {
        conname: "auth_security_audit_event_type_chk",
      },
    ]);
    expect(auditIndexRows.rows.map((row) => row.indexname)).toStrictEqual(
      expect.arrayContaining([
        "auth_security_audit_event_created_at_idx",
        "auth_security_audit_event_type_created_at_idx",
        "auth_security_audit_event_actor_created_at_idx",
        "auth_security_audit_event_organization_created_at_idx",
        "auth_security_audit_event_session_created_at_idx",
        "auth_security_audit_event_oauth_client_created_at_idx",
      ])
    );
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

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
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
    await verifyUserEmailForTest(adminPool, "invalid-slug@example.com");

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

  it("rejects multi-role organization writes before persistence", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping organization role validation coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: (input) => {
        sentInvitationEmails.push(input);
        return Promise.resolve();
      },
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async () => {},
      sendVerificationEmail: async () => {},
    });

    const ownerCookieJar = new Map<string, string>();
    const ownerSignUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "role-owner@example.com",
        name: "Role Owner",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(ownerCookieJar, ownerSignUpResponse);
    expect(ownerSignUpResponse.status).toBe(200);
    await verifyUserEmailForTest(adminPool, "role-owner@example.com");

    const organizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Role Contract Organization",
          slug: "role-contract-organization",
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

    const invalidInviteResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "multi-role-invite@example.com",
          role: ["admin", "member"],
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );

    expect(invalidInviteResponse.status).toBe(400);
    await expect(invalidInviteResponse.json()).resolves.toMatchObject({
      code: "INVALID_ORGANIZATION_ROLE",
    });
    expect(sentInvitationEmails).toHaveLength(0);

    const invalidInvitationRows = await adminPool.query<{ count: number }>(
      `select count(*)::int as count from invitation where email = $1`,
      ["multi-role-invite@example.com"]
    );
    expect(invalidInvitationRows.rows[0]?.count).toBe(0);

    const validInviteResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "role-member@example.com",
          role: "member",
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    expect(validInviteResponse.status).toBe(200);
    const validInvitation = (await validInviteResponse.json()) as {
      readonly id: string;
    };

    const memberCookieJar = new Map<string, string>();
    const memberSignUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "role-member@example.com",
        name: "Role Member",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(memberCookieJar, memberSignUpResponse);
    expect(memberSignUpResponse.status).toBe(200);
    await verifyUserEmailForTest(adminPool, "role-member@example.com");

    const acceptInvitationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/accept-invitation",
        {
          invitationId: validInvitation.id,
        },
        {
          cookieJar: memberCookieJar,
        }
      )
    );
    expect(acceptInvitationResponse.status).toBe(200);

    const memberRows = await adminPool.query<{
      id: string;
      role: string;
    }>(
      `select member.id, member.role
       from member
       inner join "user" on "user".id = member.user_id
       where member.organization_id = $1 and "user".email = $2`,
      [createdOrganization.id, "role-member@example.com"]
    );
    expect(memberRows.rows).toStrictEqual([
      {
        id: expect.any(String),
        role: "member",
      },
    ]);

    const invalidMemberRoleResponse = await auth.handler(
      makeJsonRequest(
        "/organization/update-member-role",
        {
          memberId: memberRows.rows[0]?.id,
          organizationId: createdOrganization.id,
          role: ["admin", "member"],
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );

    expect(invalidMemberRoleResponse.status).toBe(400);
    await expect(invalidMemberRoleResponse.json()).resolves.toMatchObject({
      code: "INVALID_ORGANIZATION_ROLE",
    });

    const unchangedMemberRows = await adminPool.query<{ role: string }>(
      `select role from member where id = $1`,
      [memberRows.rows[0]?.id]
    );
    expect(unchangedMemberRows.rows).toStrictEqual([{ role: "member" }]);
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

    await applyAllMigrations(databaseUrl);

    const authPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => authPool.end());

    const sentInvitationEmails: unknown[] = [];
    const database = drizzle({ client: authPool });
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
      database,
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
    await verifyUserEmailForTest(adminPool, "owner@example.com");

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
        deliveryKey: `organization-invitation/${invitation.id}`,
        invitationUrl: `http://127.0.0.1:4173/accept-invitation/${invitation.id}`,
        inviterEmail: "owner@example.com",
        organizationName: "Acme Field Ops",
        recipientEmail: "member@example.com",
        role: "member",
      }),
    ]);

    await expect(
      findPublicInvitationPreview({
        database,
        invitationId: decodeInvitationId(invitation.id),
      })
    ).resolves.toStrictEqual({
      email: "m***@e***.com",
      organizationName: "Acme Field Ops",
      role: "member",
    });

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
    await verifyUserEmailForTest(adminPool, "member@example.com");

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

    await expect(
      findPublicInvitationPreview({
        database,
        invitationId: decodeInvitationId(invitation.id),
      })
    ).resolves.toBeNull();
  }, 30_000);

  it("guards external access across Better Auth organization endpoints", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping external organization endpoint authorization coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
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
        email: "owner-list-members@example.com",
        name: "Owner List Members",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(ownerCookieJar, ownerSignUpResponse);
    expect(ownerSignUpResponse.status).toBe(200);
    await verifyUserEmailForTest(adminPool, "owner-list-members@example.com");

    const organizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Member Listing Guard",
          slug: "member-listing-guard",
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

    const ownerListResponse = await auth.handler(
      makeRequest(
        `/organization/list-members?organizationId=${createdOrganization.id}`,
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    expect(ownerListResponse.status).toBe(200);

    const ownerFullOrganizationResponse = await auth.handler(
      makeRequest(
        `/organization/get-full-organization?organizationId=${createdOrganization.id}`,
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    expect(ownerFullOrganizationResponse.status).toBe(200);

    const ownerInvitationsResponse = await auth.handler(
      makeRequest(
        `/organization/list-invitations?organizationId=${createdOrganization.id}`,
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    expect(ownerInvitationsResponse.status).toBe(200);

    const inviteResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "external-list-members@example.com",
          role: "external",
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    expect(inviteResponse.status).toBe(200);
    const invitation = (await inviteResponse.json()) as {
      readonly id: string;
    };
    const pendingInvitationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "external-pending-action@example.com",
          organizationId: createdOrganization.id,
          role: "member",
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    expect(pendingInvitationResponse.status).toBe(200);
    const pendingInvitation = (await pendingInvitationResponse.json()) as {
      readonly id: string;
    };

    const externalCookieJar = new Map<string, string>();
    const externalSignUpResponse = await auth.handler(
      makeJsonRequest("/sign-up/email", {
        email: "external-list-members@example.com",
        name: "External List Members",
        password: "correct horse battery staple",
      })
    );
    updateCookieJar(externalCookieJar, externalSignUpResponse);
    expect(externalSignUpResponse.status).toBe(200);
    await verifyUserEmailForTest(
      adminPool,
      "external-list-members@example.com"
    );

    const acceptInvitationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/accept-invitation",
        {
          invitationId: invitation.id,
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    updateCookieJar(externalCookieJar, acceptInvitationResponse);
    expect(acceptInvitationResponse.status).toBe(200);

    const externalMemberRows = await adminPool.query<{
      id: string;
      role: string;
    }>(
      `select member.id, member.role
       from member
       inner join "user" on "user".id = member.user_id
       where member.organization_id = $1 and "user".email = $2`,
      [createdOrganization.id, "external-list-members@example.com"]
    );
    expect(externalMemberRows.rows).toStrictEqual([
      {
        id: expect.any(String),
        role: "external",
      },
    ]);

    const clearExternalActiveOrganizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/set-active",
        {
          organizationId: null,
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    updateCookieJar(externalCookieJar, clearExternalActiveOrganizationResponse);
    expect(clearExternalActiveOrganizationResponse.status).toBe(200);

    const setExternalActiveOrganizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/set-active",
        {
          organizationId: createdOrganization.id,
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    updateCookieJar(externalCookieJar, setExternalActiveOrganizationResponse);
    expect(setExternalActiveOrganizationResponse.status).toBe(200);

    const externalSessionResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar: externalCookieJar,
      })
    );
    expect(externalSessionResponse.status).toBe(200);
    const externalSession =
      (await externalSessionResponse.json()) as SessionResponse;
    expect(externalSession.session?.activeOrganizationId).toBe(
      createdOrganization.id
    );

    const unrelatedOrganizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/create",
        {
          name: "Out Of Scope Organization",
          slug: "out-of-scope-organization",
        },
        {
          cookieJar: ownerCookieJar,
        }
      )
    );
    updateCookieJar(ownerCookieJar, unrelatedOrganizationResponse);
    expect(unrelatedOrganizationResponse.status).toBe(200);
    const unrelatedOrganization =
      (await unrelatedOrganizationResponse.json()) as CreatedOrganizationResponse;

    const externalUnrelatedActiveOrganizationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/set-active",
        {
          organizationId: unrelatedOrganization.id,
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    updateCookieJar(
      externalCookieJar,
      externalUnrelatedActiveOrganizationResponse
    );
    expectDeniedResponse(externalUnrelatedActiveOrganizationResponse);

    const externalSessionAfterUnrelatedResponse = await auth.handler(
      makeRequest("/get-session", {
        cookieJar: externalCookieJar,
      })
    );
    expect(externalSessionAfterUnrelatedResponse.status).toBe(200);
    const externalSessionAfterUnrelated =
      (await externalSessionAfterUnrelatedResponse.json()) as SessionResponse;
    expect(
      externalSessionAfterUnrelated.session?.activeOrganizationId
    ).toBeNull();

    const externalInviteResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "external-should-not-invite@example.com",
          organizationId: createdOrganization.id,
          role: "external",
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    expectDeniedResponse(externalInviteResponse);

    const externalInviteResendResponse = await auth.handler(
      makeJsonRequest(
        "/organization/invite-member",
        {
          email: "external-pending-action@example.com",
          organizationId: createdOrganization.id,
          resend: true,
          role: "member",
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    expectDeniedResponse(externalInviteResendResponse);

    const externalCancelInvitationResponse = await auth.handler(
      makeJsonRequest(
        "/organization/cancel-invitation",
        {
          invitationId: pendingInvitation.id,
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    expectDeniedResponse(externalCancelInvitationResponse);

    const externalOrganizationUpdateResponse = await auth.handler(
      makeJsonRequest(
        "/organization/update",
        {
          data: {
            name: "Externally Renamed Organization",
          },
          organizationId: createdOrganization.id,
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    expectDeniedResponse(externalOrganizationUpdateResponse);

    const externalRoleUpdateResponse = await auth.handler(
      makeJsonRequest(
        "/organization/update-member-role",
        {
          memberId: externalMemberRows.rows[0]?.id,
          organizationId: createdOrganization.id,
          role: "member",
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    expectDeniedResponse(externalRoleUpdateResponse);

    const externalRemoveMemberResponse = await auth.handler(
      makeJsonRequest(
        "/organization/remove-member",
        {
          memberIdOrEmail: "external-list-members@example.com",
          organizationId: createdOrganization.id,
        },
        {
          cookieJar: externalCookieJar,
        }
      )
    );
    expectDeniedResponse(externalRemoveMemberResponse);

    const externalListResponse = await auth.handler(
      makeRequest(
        `/organization/list-members?organizationId=${createdOrganization.id}`,
        {
          cookieJar: externalCookieJar,
        }
      )
    );

    expect(externalListResponse.status).toBe(403);

    const externalFullOrganizationResponse = await auth.handler(
      makeRequest(
        `/organization/get-full-organization?organizationId=${createdOrganization.id}`,
        {
          cookieJar: externalCookieJar,
        }
      )
    );

    expect(externalFullOrganizationResponse.status).toBe(403);

    const externalInvitationsResponse = await auth.handler(
      makeRequest(
        `/organization/list-invitations?organizationId=${createdOrganization.id}`,
        {
          cookieJar: externalCookieJar,
        }
      )
    );

    expect(externalInvitationsResponse.status).toBe(403);

    const externalFullOrganizationBySlugResponse = await auth.handler(
      makeRequest(
        "/organization/get-full-organization?organizationSlug=member-listing-guard",
        {
          cookieJar: externalCookieJar,
        }
      )
    );

    expect(externalFullOrganizationBySlugResponse.status).toBe(403);

    const unchangedExternalMemberRows = await adminPool.query<{
      role: string;
    }>(`select role from member where id = $1`, [
      externalMemberRows.rows[0]?.id,
    ]);
    expect(unchangedExternalMemberRows.rows).toStrictEqual([
      { role: "external" },
    ]);

    const unchangedOrganizationRows = await adminPool.query<{ name: string }>(
      `select name from organization where id = $1`,
      [createdOrganization.id]
    );
    expect(unchangedOrganizationRows.rows).toStrictEqual([
      { name: "Member Listing Guard" },
    ]);

    const blockedInvitationRows = await adminPool.query<{ count: number }>(
      `select count(*)::int as count from invitation where email = $1`,
      ["external-should-not-invite@example.com"]
    );
    expect(blockedInvitationRows.rows[0]?.count).toBe(0);

    const unchangedPendingInvitationRows = await adminPool.query<{
      status: string;
    }>(`select status from invitation where id = $1`, [pendingInvitation.id]);
    expect(unchangedPendingInvitationRows.rows).toStrictEqual([
      { status: "pending" },
    ]);
    expect(sentInvitationEmails).toHaveLength(2);
  }, 30_000);

  it("serves the public invitation preview from the mounted api route", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase();
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const adminPool = new Pool({ connectionString: databaseUrl });
    cleanup.push(() => adminPool.end());

    if (!(await canConnect(adminPool))) {
      context.skip(
        "Auth integration database unavailable; skipping public invitation preview route coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      reportVerificationEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
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
    await verifyUserEmailForTest(adminPool, "owner@example.com");

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
    };
    const publicPreviewEnvironment = {
      AGENT_INTERNAL_SECRET: "agent-integration-secret",
      AUTH_APP_ORIGIN: "http://127.0.0.1:4173",
      AUTH_EMAIL_FROM: "no-reply@example.com",
      BETTER_AUTH_BASE_URL: "http://127.0.0.1:3000",
      BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
      DATABASE_URL: databaseUrl,
    } as const;

    await withEnvironment(publicPreviewEnvironment, async () => {
      const webHandler = await makeApiWebHandler(
        makeTestApiWebHandlerInput(databaseUrl, publicPreviewEnvironment)
      );

      try {
        const response = await webHandler.handler(
          new Request(
            `http://127.0.0.1:3000/api/public/invitations/${invitation.id}/preview`
          )
        );

        expect(response.status).toBe(200);
        expect(
          decodePublicInvitationPreview(await response.json())
        ).toStrictEqual({
          email: "m***@e***.com",
          organizationName: "Acme Field Ops",
          role: "member",
        });
      } finally {
        await webHandler.dispose();
      }
    });

    await withEnvironment(publicPreviewEnvironment, async () => {
      const webHandler = await makeApiWebHandler(
        makeTestApiWebHandlerInput(databaseUrl, publicPreviewEnvironment)
      );

      try {
        const response = await webHandler.handler(
          new Request(
            `http://127.0.0.1:3000/api/public/invitations/missing-preview/preview`
          )
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toBeNull();
      } finally {
        await webHandler.dispose();
      }
    });

    await withEnvironment(publicPreviewEnvironment, async () => {
      const webHandler = await makeApiWebHandler(
        makeTestApiWebHandlerInput(databaseUrl, publicPreviewEnvironment)
      );

      try {
        const response = await webHandler.handler(
          new Request(
            `http://127.0.0.1:3000/api/public/invitations/${invitation.id}/preview`,
            {
              method: "POST",
            }
          )
        );

        expect(response.status).toBe(404);
      } finally {
        await webHandler.dispose();
      }
    });
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
    await applyMigration(databaseUrl, "0004_spotty_rick_jones.sql");
    await applyMigration(databaseUrl, "0005_add-site-coordinates.sql");
    await applyMigration(databaseUrl, "0006_careless_william_stryker.sql");
    await applyMigration(databaseUrl, "0007_organization_role_contracts.sql");
    await applyMigration(databaseUrl, "20260607122344_better_auth_two_factor");

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

    const capturedPasswordResetEmails: PasswordResetEmailInput[] = [];
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
      database: drizzle({ client: authPool }),
      reportPasswordResetEmailFailure: () => {},
      sendOrganizationInvitationEmail: async () => {},
      reportVerificationEmailFailure: () => {},
      sendPasswordResetEmail: async (input) => {
        capturedPasswordResetEmails.push(input);
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
    expect(capturedPasswordResetEmails).toHaveLength(1);

    const [capturedPasswordResetEmail] = capturedPasswordResetEmails;
    const resetUrl = capturedPasswordResetEmail?.resetUrl;
    expect(capturedPasswordResetEmail?.deliveryKey).toMatch(
      /^password-reset\/[0-9a-f]{64}$/
    );
    expect(resetUrl).toBeDefined();
    if (resetUrl === undefined) {
      throw new Error("Expected password reset email to include a reset URL");
    }
    const parsedResetUrl = new URL(resetUrl);
    expect(parsedResetUrl.origin).toBe("http://127.0.0.1:3000");
    expect(parsedResetUrl.pathname).toMatch(/^\/api\/auth\/reset-password\/.+/);
    expect(parsedResetUrl.searchParams.get("callbackURL")).toBe(
      "http://127.0.0.1:3000/reset-password"
    );

    const resetToken = resetUrl.split("?", 1)[0]?.split("/").pop();
    expect(resetToken).toBeDefined();
    expect(resetToken).not.toBe("");
    if (!resetToken) {
      throw new Error("Expected Better Auth reset URL to include a token");
    }
    expect(capturedPasswordResetEmail?.deliveryKey).not.toContain(resetToken);

    const userRows = await adminPool.query<{
      id: string;
    }>(`select id from "user" where email = $1`, ["integration@example.com"]);
    expect(userRows.rows).toHaveLength(1);
    expect(capturedPasswordResetEmail?.deliveryKey).toBe(
      `password-reset/${createHash("sha256").update(`password-reset:${userRows.rows[0]?.id}:${resetToken}`).digest("hex")}`
    );

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

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
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

    await applyAllMigrations(databaseUrl);

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
      database: drizzle({ client: authPool }),
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

function createTestDatabase(): Promise<{
  readonly cleanup: () => Promise<void>;
  readonly url: string;
}> {
  return createPlatformTestDatabase({
    baseUrl: process.env.AUTH_TEST_DATABASE_URL,
    prefix: "auth_test",
  });
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

function makeExpectedAuthAbuseEmailKey(input: {
  readonly email: string;
  readonly endpointPath: string;
  readonly scope: "destination-email" | "recipient-email" | "target-email";
  readonly secret: string;
}) {
  const digest = createHmac("sha256", input.secret)
    .update(`${input.scope}:${input.email}`)
    .digest("hex");

  return `ceird-auth-abuse:${input.scope}:${digest}|${input.endpointPath}`;
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

interface OAuthClientRegistrationResponse {
  readonly client_id: string;
  readonly client_secret?: string;
  readonly grant_types?: readonly string[];
  readonly redirect_uris: readonly string[];
  readonly scope?: string;
  readonly token_endpoint_auth_method?: string;
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

interface CaptchaSiteVerifyRequest {
  readonly remoteip?: unknown;
  readonly response?: unknown;
  readonly secret?: unknown;
}

async function withCaptchaSiteVerifyServer(
  run: (input: {
    readonly requests: readonly CaptchaSiteVerifyRequest[];
    readonly url: string;
  }) => Promise<void>
) {
  const requests: CaptchaSiteVerifyRequest[] = [];
  const url = "http://127.0.0.1:49152/siteverify";
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      let requestUrl: string;
      if (input instanceof Request) {
        requestUrl = input.url;
      } else if (input instanceof URL) {
        requestUrl = input.toString();
      } else {
        requestUrl = String(input);
      }

      const { body: initBody, method: initMethod } = init ?? {};
      let method = "GET";
      if (input instanceof Request) {
        const { method: inputMethod } = input;
        method = inputMethod;
      }
      if (initMethod !== undefined) {
        method = initMethod;
      }

      let body: BodyInit | null | undefined;
      if (input instanceof Request) {
        body = await input.clone().text();
      }
      if (initBody !== undefined) {
        body = initBody;
      }
      const requestBody = await readCaptchaSiteVerifyRequestBody(body);
      requests.push(requestBody);

      return Response.json({
        success:
          requestUrl === url &&
          method === "POST" &&
          requestBody.secret === "turnstile-secret-key" &&
          requestBody.response === "captcha-token",
      });
    });

  try {
    await run({
      requests,
      url,
    });
  } finally {
    fetchSpy.mockRestore();
  }
}

async function readCaptchaSiteVerifyRequestBody(
  body: BodyInit | null | undefined
): Promise<CaptchaSiteVerifyRequest> {
  if (body === undefined || body === null) {
    return {};
  }

  const text = await new Response(body).text();

  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as CaptchaSiteVerifyRequest;
  } catch {
    const params = new URLSearchParams(text);

    return Object.fromEntries(params) as CaptchaSiteVerifyRequest;
  }
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

function expectDeniedResponse(response: Response) {
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(response.status).toBeLessThan(500);
}

async function verifyUserEmailForTest(pool: Pool, email: string) {
  await pool.query(`update "user" set email_verified = true where email = $1`, [
    email,
  ]);
}

async function unverifyUserEmailForTest(pool: Pool, email: string) {
  await pool.query(
    `update "user" set email_verified = false where email = $1`,
    [email]
  );
}

async function withEnvironment(
  nextEnvironment: Record<string, string>,
  run: () => Promise<void>
) {
  const managedKeys = [
    "AUTH_APP_ORIGIN",
    "BETTER_AUTH_BASE_URL",
    "BETTER_AUTH_SECRET",
    "DATABASE_URL",
  ] as const;
  const previousEnvironment = snapshotEnv(managedKeys);

  for (const key of managedKeys) {
    Reflect.deleteProperty(process.env, key);
  }

  Object.assign(process.env, nextEnvironment);

  try {
    await run();
  } finally {
    restoreEnv(previousEnvironment);
  }
}

function snapshotEnv<const Keys extends readonly string[]>(keys: Keys) {
  return Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  ) as Record<Keys[number], string | undefined>;
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

function makeTestApiWebHandlerInput(
  databaseUrl: string,
  environment: Readonly<Record<string, string>>
) {
  return {
    baseLive: ConfigProvider.layer(
      configProviderFromMap(new Map(Object.entries(environment)))
    ),
    databaseRuntimeLive: makeAppDatabaseRuntimeLive(
      makeAppDatabaseLive(databaseUrl)
    ),
  };
}
