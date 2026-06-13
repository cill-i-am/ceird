import { randomUUID } from "node:crypto";

import { JobOptionsResponseSchema } from "@ceird/jobs-core";
import { SiteOptionSchema } from "@ceird/sites-core";
import { NodeHttpServer } from "@effect/platform-node";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";
import type { Pool } from "pg";

import { AppApi } from "../http-api.js";
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "../platform/database/database.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../platform/database/test-database.js";
import { makeApiWebHandler } from "../server.js";
import { configProviderFromMap } from "../test/effect-test-helpers.js";

describe("domain HTTP API", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    for (const step of cleanup.toReversed()) {
      await step();
    }
  }, 30_000);

  it("exposes the narrowed product API groups", () => {
    const spec = OpenApi.fromApi(AppApi);

    expect(spec.paths["/jobs"]?.get?.operationId).toBe("jobs.listJobs");
    expect(spec.paths["/jobs"]?.post?.operationId).toBe("jobs.createJob");
    expect(spec.paths["/home/dashboard-summary"]?.get?.operationId).toBe(
      "jobs.getHomeDashboardSummary"
    );
    expect(spec.paths["/sites"]?.get?.operationId).toBe("sites.listSites");
    expect(spec.paths["/sites"]?.post?.operationId).toBe("sites.createSite");
    expect(spec.paths["/labels"]?.get?.operationId).toBe("labels.listLabels");
    expect(
      spec.paths["/organization/security/activity"]?.get?.operationId
    ).toBe("identity.listOrganizationSecurityActivity");
  });

  it("serves job options with an unverified site location", async () => {
    const group = HttpApiGroup.make("test").add(
      HttpApiEndpoint.get("options", "/options", {
        success: JobOptionsResponseSchema,
      })
    );
    const api = HttpApi.make("TestApi").add(group);
    const site = Schema.decodeUnknownSync(SiteOptionSchema)({
      displayLocation: "D1",
      googlePlaceId: undefined,
      hasUsableCoordinates: false,
      id: "550e8400-e29b-41d4-a716-446655440010",
      labels: [],
      latitude: undefined,
      locationProvider: undefined,
      locationResolvedAt: undefined,
      locationStatus: "unverified",
      longitude: undefined,
      name: "D1",
      rawLocationInput: "D1",
    });
    const handlers = HttpApiBuilder.group(api, "test", (builder) =>
      builder.handle("options", () =>
        Effect.succeed({
          contacts: [],
          labels: [],
          members: [],
          sites: [site],
        })
      )
    );
    const layer = HttpApiBuilder.layer(api).pipe(
      Layer.provide(handlers),
      Layer.provide(NodeHttpServer.layerHttpServices)
    );
    const handler = HttpRouter.toWebHandler(layer, { disableLogger: true });

    try {
      const response = await handler.handler(
        new Request("http://127.0.0.1/options")
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        sites: [
          {
            displayLocation: "D1",
            hasUsableCoordinates: false,
            locationStatus: "unverified",
          },
        ],
      });
    } finally {
      await handler.dispose();
    }
  });

  it("fails closed until a request has a session, active organization, and membership", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_http_auth" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping request-scoped actor coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    await withJobsEnvironment(databaseUrl, async () => {
      const api = makeApiWebHandler(makeTestApiWebHandlerInput(databaseUrl));
      cleanup.push(api.dispose);

      const noSessionResponse = await api.handler(makeRequest("/jobs"));
      expect(noSessionResponse.status).toBe(403);

      const ownerCookieJar = new Map<string, string>();
      const ownerEmail = `owner-${randomUUID()}@example.com`;
      await signUpUser(api, ownerCookieJar, {
        email: ownerEmail,
        name: "Owner User",
      });

      const ownerOrglessResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(ownerOrglessResponse.status).toBe(403);

      await withPool(databaseUrl, async (pool) => {
        await verifyUserEmail(pool, ownerEmail);
      });

      const ownerOrgId = await createOrganization(api, ownerCookieJar, {
        organizationName: "Owner Organization",
        organizationSlug: `owner-org-${randomUUID().slice(0, 8)}`,
      });

      const listResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(listResponse.status).toBe(200);

      const strangerCookieJar = new Map<string, string>();
      const strangerEmail = `stranger-${randomUUID()}@example.com`;
      await signUpUser(api, strangerCookieJar, {
        email: strangerEmail,
        name: "Stranger User",
      });

      const strangerOrglessResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: strangerCookieJar,
        })
      );
      expect(strangerOrglessResponse.status).toBe(403);

      await withPool(databaseUrl, async (pool) => {
        const strangerUserId = await queryUserIdByEmail(pool, strangerEmail);
        const strangerSessionId = await querySessionIdByUserId(
          pool,
          strangerUserId
        );

        await pool.query(
          `update session set active_organization_id = $1 where id = $2`,
          [ownerOrgId, strangerSessionId]
        );
      });

      const foreignMembershipResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: strangerCookieJar,
        })
      );
      expect(foreignMembershipResponse.status).toBe(403);
    });
  }, 30_000);

  it("serves and updates authenticated user preferences without storing coordinates", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "preferences_http",
    });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Preferences integration database unavailable; skipping request-scoped preference coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    await withJobsEnvironment(databaseUrl, async () => {
      const api = makeApiWebHandler(makeTestApiWebHandlerInput(databaseUrl));
      cleanup.push(api.dispose);

      const noSessionResponse = await api.handler(
        makeRequest("/user/preferences")
      );
      expect(noSessionResponse.status).toBe(403);

      const cookieJar = new Map<string, string>();
      const email = `preferences-${randomUUID()}@example.com`;
      await signUpUser(api, cookieJar, {
        email,
        name: "Preferences User",
      });

      const defaultResponse = await api.handler(
        makeRequest("/user/preferences", { cookieJar })
      );
      expect(defaultResponse.status).toBe(200);
      await expect(defaultResponse.json()).resolves.toMatchObject({
        preferences: {
          routeProximityLocationEnabled: false,
        },
      });

      const updateResponse = await api.handler(
        makeJsonRequest(
          "/user/preferences",
          {
            routeProximityLocationEnabled: true,
          },
          {
            cookieJar,
            method: "PATCH",
          }
        )
      );
      expect(updateResponse.status).toBe(200);
      await expect(updateResponse.json()).resolves.toMatchObject({
        preferences: {
          routeProximityLocationEnabled: true,
        },
      });

      const updatedResponse = await api.handler(
        makeRequest("/user/preferences", { cookieJar })
      );
      expect(updatedResponse.status).toBe(200);
      await expect(updatedResponse.json()).resolves.toMatchObject({
        preferences: {
          routeProximityLocationEnabled: true,
        },
      });

      await withPool(databaseUrl, async (pool) => {
        const userId = await queryUserIdByEmail(pool, email);
        const storedPreference = await pool.query<{
          readonly route_proximity_location_enabled: boolean;
        }>(
          `select route_proximity_location_enabled
           from user_preferences
           where user_id = $1`,
          [userId]
        );

        expect(storedPreference.rows).toStrictEqual([
          { route_proximity_location_enabled: true },
        ]);
      });
    });
  }, 30_000);

  it("protects internal Agent routes with the domain bearer secret", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "agents_http" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Agents integration database unavailable; skipping internal route auth coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    await withJobsEnvironment(databaseUrl, async () => {
      const api = makeApiWebHandler(makeTestApiWebHandlerInput(databaseUrl));
      cleanup.push(api.dispose);
      const threadId = "11111111-1111-4111-8111-111111111111";
      const actionBody = {
        input: {},
        name: "ceird.labels.list",
        operationId: "tool-call:1",
        threadId,
      };

      const missingActionAuth = await api.handler(
        makeJsonRequest("/agent/internal/actions", actionBody)
      );
      const wrongActionAuth = await api.handler(
        makeJsonRequest("/agent/internal/actions", actionBody, {
          headers: { authorization: "Bearer wrong-secret" },
        })
      );
      const correctActionAuth = await api.handler(
        makeJsonRequest("/agent/internal/actions", actionBody, {
          headers: { authorization: "Bearer agent-integration-secret" },
        })
      );

      expect(missingActionAuth.status).toBe(403);
      expect(wrongActionAuth.status).toBe(403);
      expect(correctActionAuth.status).toBe(404);

      const missingActivityAuth = await api.handler(
        makeRequest(`/agent/internal/threads/${threadId}/activity`, {
          method: "POST",
        })
      );
      const wrongActivityAuth = await api.handler(
        makeRequest(`/agent/internal/threads/${threadId}/activity`, {
          headers: { authorization: "Bearer wrong-secret" },
          method: "POST",
        })
      );
      const correctActivityAuth = await api.handler(
        makeRequest(`/agent/internal/threads/${threadId}/activity`, {
          headers: { authorization: "Bearer agent-integration-secret" },
          method: "POST",
        })
      );

      expect(missingActivityAuth.status).toBe(403);
      expect(wrongActivityAuth.status).toBe(403);
      expect(correctActivityAuth.status).toBe(404);
    });
  }, 30_000);
});

async function createOrganization(
  api: ReturnType<typeof makeApiWebHandler>,
  cookieJar: Map<string, string>,
  input: {
    readonly organizationName: string;
    readonly organizationSlug: string;
  }
) {
  const organizationResponse = await api.handler(
    makeJsonRequest(
      "/api/auth/organization/create",
      {
        name: input.organizationName,
        slug: input.organizationSlug,
      },
      {
        cookieJar,
      }
    )
  );
  updateCookieJar(cookieJar, organizationResponse);
  expect(organizationResponse.status).toBe(200);

  const organization = (await organizationResponse.json()) as {
    readonly id: string;
  };

  return organization.id;
}

async function signUpUser(
  api: ReturnType<typeof makeApiWebHandler>,
  cookieJar: Map<string, string>,
  input: {
    readonly email: string;
    readonly name: string;
  }
) {
  const signUpResponse = await api.handler(
    makeJsonRequest("/api/auth/sign-up/email", {
      email: input.email,
      name: input.name,
      password: "correct horse battery staple",
    })
  );
  updateCookieJar(cookieJar, signUpResponse);
  expect(signUpResponse.status).toBe(200);
}

async function queryUserIdByEmail(pool: Pool, email: string) {
  const result = await pool.query<{ readonly id: string }>(
    `select id from "user" where email = $1 limit 1`,
    [email]
  );
  const userId = result.rows[0]?.id;

  if (userId === undefined) {
    throw new Error(`Unable to find user ${email}`);
  }

  return userId;
}

async function verifyUserEmail(pool: Pool, email: string) {
  const result = await pool.query(
    `update "user" set email_verified = true where email = $1`,
    [email]
  );

  if (result.rowCount !== 1) {
    throw new Error(`Unable to verify user ${email}`);
  }
}

async function querySessionIdByUserId(pool: Pool, userId: string) {
  const result = await pool.query<{ readonly id: string }>(
    `select id from session where user_id = $1 order by created_at desc limit 1`,
    [userId]
  );
  const sessionId = result.rows[0]?.id;

  if (sessionId === undefined) {
    throw new Error(`Unable to find session for ${userId}`);
  }

  return sessionId;
}

async function withJobsEnvironment<Result>(
  databaseUrl: string,
  operation: () => Promise<Result>
) {
  const previous = {
    AGENT_INTERNAL_SECRET: process.env.AGENT_INTERNAL_SECRET,
    AUTH_APP_ORIGIN: process.env.AUTH_APP_ORIGIN,
    AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    AUTH_EMAIL_FROM_NAME: process.env.AUTH_EMAIL_FROM_NAME,
    BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  Object.assign(process.env, makeJobsEnvironment(databaseUrl));

  try {
    return await operation();
  } finally {
    restoreEnv(previous);
  }
}

function makeTestApiWebHandlerInput(databaseUrl: string) {
  return {
    baseLive: ConfigProvider.layer(
      configProviderFromMap(
        new Map(Object.entries(makeJobsEnvironment(databaseUrl)))
      )
    ),
    databaseRuntimeLive: makeAppDatabaseRuntimeLive(
      makeAppDatabaseLive(databaseUrl)
    ),
  };
}

function makeJobsEnvironment(databaseUrl: string) {
  return {
    AGENT_INTERNAL_SECRET: "agent-integration-secret",
    AUTH_APP_ORIGIN: "http://127.0.0.1:4173",
    AUTH_EMAIL_FROM: "noreply@example.com",
    AUTH_EMAIL_FROM_NAME: "Ceird Test",
    BETTER_AUTH_BASE_URL: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    DATABASE_URL: databaseUrl,
  };
}

function makeRequest(
  routePath: string,
  options?: {
    readonly cookieJar?: Map<string, string>;
    readonly headers?: ConstructorParameters<typeof Headers>[0];
    readonly method?: string;
  }
) {
  const headers = new Headers(options?.headers);

  if (options?.cookieJar !== undefined && options.cookieJar.size > 0) {
    headers.set(
      "cookie",
      [...options.cookieJar.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    );
  }

  return new Request(`http://127.0.0.1:3000${routePath}`, {
    headers,
    method: options?.method ?? "GET",
  });
}

function makeJsonRequest(
  routePath: string,
  body: unknown,
  options?: {
    readonly cookieJar?: Map<string, string>;
    readonly headers?: ConstructorParameters<typeof Headers>[0];
    readonly method?: string;
  }
) {
  const headers = new Headers({
    "content-type": "application/json",
    ...Object.fromEntries(new Headers(options?.headers).entries()),
  });

  if (options?.cookieJar !== undefined && options.cookieJar.size > 0) {
    headers.set(
      "cookie",
      [...options.cookieJar.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    );
  }

  return new Request(`http://127.0.0.1:3000${routePath}`, {
    body: JSON.stringify(body),
    headers,
    method: options?.method ?? "POST",
  });
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

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}
