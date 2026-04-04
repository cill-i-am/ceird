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

  it("migrates a non-empty rate_limit table and serves sign-up, sign-in, sign-out, session, password reset, and rate limiting", async (context: {
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

    await expect(
      applyMigration(databaseUrl, "0002_slippery_hulk.sql")
    ).resolves.toBeUndefined();

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
      config: makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl,
      }),
      database: drizzle(authPool, { schema: authSchema }),
      sendPasswordResetEmail: async ({ resetUrl }) => {
        capturedResetUrls.push(resetUrl);
        await Effect.runPromise(Deferred.await(passwordResetDelivery));
      },
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
    expect(resetUrl).toContain("http://127.0.0.1:3000/reset-password");

    const resetToken = resetUrl.split("?", 1)[0]?.split("/").pop();
    expect(resetToken).toBe(true);

    const resetPasswordResponse = await auth.handler(
      makeJsonRequest("/reset-password", {
        token: resetToken,
        newPassword: "new horse battery staple",
      })
    );
    expect(resetPasswordResponse.status).toBe(200);

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
  };
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
