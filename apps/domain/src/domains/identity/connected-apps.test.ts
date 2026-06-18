import { randomUUID } from "node:crypto";

import {
  ConnectedAppGrantNotFoundError,
  ConnectedAppGrantStorageError,
  decodeDisconnectConnectedAppGrantInput,
  decodeOAuthClientId,
  decodeOrganizationId,
  decodeUserId,
} from "@ceird/identity-core";
import type {
  ConnectedAppGrant,
  ConnectedAppGrantId,
  ConnectedAppScopeGroup,
  OAuthClientId,
  OrganizationId,
  UserId,
} from "@ceird/identity-core";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import type { Pool } from "pg";

import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "../../platform/database/database.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import { effectEither } from "../../test/effect-test-helpers.js";
import {
  ConnectedAppGrantsRepository,
  ConnectedAppGrantsService,
} from "./connected-apps.js";
import { CurrentUser } from "./preferences/current-user.js";

const userId = decodeUserId("user_123");
const { grantId } = decodeDisconnectConnectedAppGrantInput({
  grantId: "consent_123",
});
const clientId = decodeOAuthClientId("client_external_mcp");

describe("connected app grants service", () => {
  it("lists grants for the authenticated user", async () => {
    const connectedApp = makeConnectedAppGrant();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* ConnectedAppGrantsService;

        return yield* service.list();
      }).pipe(
        Effect.provide(ConnectedAppGrantsService.DefaultWithoutDependencies),
        Effect.provide(makeCurrentUserLayer()),
        Effect.provide(makeHttpServerRequestLayer()),
        Effect.provide(
          makeRepositoryLayer({
            list: (requestedUserId) => {
              expect(requestedUserId).toBe(userId);

              return Effect.succeed({ grants: [connectedApp] });
            },
          })
        )
      )
    );

    expect(result).toStrictEqual({ grants: [connectedApp] });
  }, 10_000);

  it("disconnects grants for the authenticated user only", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* ConnectedAppGrantsService;

        return yield* service.disconnect({ grantId });
      }).pipe(
        Effect.provide(ConnectedAppGrantsService.DefaultWithoutDependencies),
        Effect.provide(makeCurrentUserLayer()),
        Effect.provide(makeHttpServerRequestLayer()),
        Effect.provide(
          makeRepositoryLayer({
            disconnect: (input) => {
              expect(input).toStrictEqual({
                grantId,
                userId,
              });

              return Effect.succeed({ disconnectedGrantId: grantId });
            },
          })
        )
      )
    );

    expect(result).toStrictEqual({ disconnectedGrantId: grantId });
  }, 10_000);
});

describe("connected app grants repository", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    for (const step of [...cleanup].toReversed()) {
      await step();
    }
  });

  it("lists schema-decoded connected-app grants from real Drizzle projections", async (context: {
    skip: (note?: string) => never;
  }) => {
    const databaseUrl = await createConnectedAppTestDatabase(
      context,
      cleanup,
      "connected_apps_list"
    );
    const organizationGrant = makeConnectedAppSeed({
      reference: "organization",
    });
    const accountGrant = makeConnectedAppSeed({
      reference: "account",
      userId: organizationGrant.userId,
    });

    await withPool(databaseUrl, async (pool) => {
      await seedConnectedAppUser(pool, organizationGrant);
      await seedConnectedAppGrant(pool, organizationGrant, {
        organizationName: "Acme Field Ops",
      });
      await seedConnectedAppGrant(pool, accountGrant);
    });

    const result = await runConnectedAppRepositoryEffect(
      databaseUrl,
      ConnectedAppGrantsRepository.list(organizationGrant.userId)
    );

    expect(result.grants).toHaveLength(2);
    expect(result.grants).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activeAccessTokenCount: 1,
          activeRefreshTokenCount: 1,
          clientId: organizationGrant.clientId,
          context: {
            organizationId: organizationGrant.organizationId,
            organizationName: "Acme Field Ops",
            type: "organization",
          },
          grantId: organizationGrant.grantId,
          offlineAccess: true,
          redirectHosts: ["mcp.example.com"],
        }),
        expect.objectContaining({
          activeAccessTokenCount: 1,
          activeRefreshTokenCount: 1,
          clientId: accountGrant.clientId,
          context: { type: "account" },
          grantId: accountGrant.grantId,
          offlineAccess: true,
          redirectHosts: ["com.example.app"],
        }),
      ])
    );
  }, 30_000);

  it("fails at the repository boundary instead of repairing stale organization references", async (context: {
    skip: (note?: string) => never;
  }) => {
    const databaseUrl = await createConnectedAppTestDatabase(
      context,
      cleanup,
      "connected_apps_stale_org"
    );
    const seed = makeConnectedAppSeed({ reference: "organization" });

    await withPool(databaseUrl, async (pool) => {
      await seedConnectedAppUser(pool, seed);
      await seedConnectedAppGrant(pool, seed, { insertOrganization: false });
    });

    const result = await Effect.runPromise(
      runConnectedAppRepository(
        databaseUrl,
        ConnectedAppGrantsRepository.list(seed.userId)
      ).pipe(effectEither)
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: expect.any(ConnectedAppGrantStorageError),
    });
    expect(result._tag === "Left" ? result.left.message : "").toBe(
      "Connected app grant projection decode failed"
    );
  }, 30_000);

  it("disconnects a grant by deleting consent, revoking tokens, deleting access tokens, and auditing in one transaction", async (context: {
    skip: (note?: string) => never;
  }) => {
    const databaseUrl = await createConnectedAppTestDatabase(
      context,
      cleanup,
      "connected_apps_disconnect"
    );
    const seed = makeConnectedAppSeed({ reference: "organization" });

    await withPool(databaseUrl, async (pool) => {
      await seedConnectedAppUser(pool, seed);
      await seedConnectedAppGrant(pool, seed, {
        organizationName: "Acme Field Ops",
      });
    });

    const result = await runConnectedAppRepositoryEffect(
      databaseUrl,
      ConnectedAppGrantsRepository.disconnect({
        grantId: seed.grantId,
        userId: seed.userId,
      })
    );
    const state = await readDisconnectState(databaseUrl, seed);
    const auditRows = await readRevokedAuditRows(databaseUrl, seed);

    expect(result).toStrictEqual({ disconnectedGrantId: seed.grantId });
    expect(state).toStrictEqual({
      access_token_count: "0",
      audit_count: "1",
      consent_count: "0",
      active_refresh_count: "0",
      revoked_refresh_count: "1",
    });
    expect(auditRows).toStrictEqual([
      {
        actor_user_id: seed.userId,
        event_type: "oauth_consent_revoked",
        metadata: {
          consentId: seed.grantId,
          referenceId: seed.organizationId,
        },
        oauth_client_id: seed.clientId,
        organization_id: seed.organizationId,
        scopes: ["ceird:read", "offline_access"],
      },
    ]);
  }, 30_000);

  it("rolls back consent delete, refresh revoke, access-token delete, and audit write when audit insertion fails", async (context: {
    skip: (note?: string) => never;
  }) => {
    const databaseUrl = await createConnectedAppTestDatabase(
      context,
      cleanup,
      "connected_apps_rollback"
    );
    const seed = makeConnectedAppSeed({ reference: "organization" });

    await withPool(databaseUrl, async (pool) => {
      await seedConnectedAppUser(pool, seed);
      await seedConnectedAppGrant(pool, seed, {
        organizationName: "Acme Field Ops",
      });
      await installAuditInsertFailure(pool);
    });

    const result = await Effect.runPromise(
      runConnectedAppRepository(
        databaseUrl,
        ConnectedAppGrantsRepository.disconnect({
          grantId: seed.grantId,
          userId: seed.userId,
        })
      ).pipe(effectEither)
    );
    const state = await readDisconnectState(databaseUrl, seed);

    expect(result).toMatchObject({
      _tag: "Left",
      left: expect.any(ConnectedAppGrantStorageError),
    });
    expect(state).toStrictEqual({
      access_token_count: "2",
      audit_count: "0",
      consent_count: "1",
      active_refresh_count: "1",
      revoked_refresh_count: "0",
    });
  }, 30_000);

  it("does not mutate OAuth records when the grant is missing", async (context: {
    skip: (note?: string) => never;
  }) => {
    const databaseUrl = await createConnectedAppTestDatabase(
      context,
      cleanup,
      "connected_apps_missing"
    );
    const seed = makeConnectedAppSeed({ reference: "organization" });

    await withPool(databaseUrl, async (pool) => {
      await seedConnectedAppUser(pool, seed);
    });

    const result = await Effect.runPromise(
      runConnectedAppRepository(
        databaseUrl,
        ConnectedAppGrantsRepository.disconnect({
          grantId: seed.grantId,
          userId: seed.userId,
        })
      ).pipe(effectEither)
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: expect.any(ConnectedAppGrantNotFoundError),
    });
  }, 30_000);
});

function makeConnectedAppGrant(): ConnectedAppGrant {
  const scopeGroups: readonly ConnectedAppScopeGroup[] = [
    {
      key: "read",
      label: "Read",
      scopes: ["ceird:read"],
    },
    {
      key: "offline",
      label: "Offline access",
      scopes: ["offline_access"],
    },
  ];

  return {
    activeAccessTokenCount: 1,
    activeRefreshTokenCount: 1,
    clientId,
    clientName: "External MCP",
    context: {
      organizationId: decodeOrganizationId("org_acme"),
      organizationName: "Acme Field Ops",
      type: "organization",
    },
    grantId,
    grantedAt: "2026-06-08T10:30:00.000Z",
    offlineAccess: true,
    redirectHosts: ["mcp.example.com"],
    scopes: ["ceird:read", "offline_access"],
    scopeGroups,
    updatedAt: "2026-06-08T10:45:00.000Z",
  };
}

function makeCurrentUserLayer() {
  return Layer.succeed(
    CurrentUser,
    CurrentUser.of({
      get: () => Effect.succeed(userId),
    })
  );
}

function makeHttpServerRequestLayer() {
  return Layer.succeed(
    HttpServerRequest.HttpServerRequest,
    HttpServerRequest.fromWeb(new Request("https://ceird.test"))
  );
}

interface ConnectedAppRepositoryHandlers {
  readonly disconnect?: Parameters<
    typeof ConnectedAppGrantsRepository.of
  >[0]["disconnect"];
  readonly list?: Parameters<typeof ConnectedAppGrantsRepository.of>[0]["list"];
}

function makeRepositoryLayer(handlers: ConnectedAppRepositoryHandlers) {
  const { disconnect, list } = handlers;

  return Layer.succeed(
    ConnectedAppGrantsRepository,
    ConnectedAppGrantsRepository.of({
      disconnect:
        disconnect ??
        ((input: { readonly grantId: ConnectedAppGrantId }) =>
          Effect.succeed({ disconnectedGrantId: input.grantId })),
      list:
        list ??
        ((_requestedUserId: UserId) =>
          Effect.succeed({ grants: [makeConnectedAppGrant()] })),
    })
  );
}

function runConnectedAppRepository<Value, Error>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, ConnectedAppGrantsRepository>
) {
  return Effect.scoped(
    effect.pipe(
      Effect.provide(ConnectedAppGrantsRepository.DefaultWithoutDependencies),
      Effect.provide(
        makeAppDatabaseRuntimeLive(makeAppDatabaseLive(databaseUrl))
      )
    )
  );
}

async function runConnectedAppRepositoryEffect<Value, Error>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, ConnectedAppGrantsRepository>
): Promise<Value> {
  return await Effect.runPromise(
    runConnectedAppRepository(databaseUrl, effect)
  );
}

async function createConnectedAppTestDatabase(
  context: { skip: (note?: string) => never },
  cleanup: { push: (step: () => Promise<void>) => void },
  prefix: string
): Promise<string> {
  const testDatabase = await createTestDatabase({ prefix });
  cleanup.push(testDatabase.cleanup);

  const canReachDatabase = await withPool(
    testDatabase.url,
    async (pool) => await canConnect(pool)
  );

  if (!canReachDatabase) {
    context.skip(
      "Postgres integration database unavailable; skipping connected-app repository coverage"
    );
  }

  await applyAllMigrations(testDatabase.url);

  return testDatabase.url;
}

interface ConnectedAppSeed {
  readonly accessTokenIds: readonly [string, string];
  readonly clientId: OAuthClientId;
  readonly clientRowId: string;
  readonly email: string;
  readonly grantId: ConnectedAppGrantId;
  readonly organizationId: OrganizationId | null;
  readonly redirectUris: readonly string[];
  readonly refreshTokenId: string;
  readonly scopes: readonly string[];
  readonly slug: string;
  readonly userId: UserId;
}

function makeConnectedAppSeed(options: {
  readonly reference: "account" | "organization";
  readonly userId?: UserId;
}): ConnectedAppSeed {
  const slug = randomUUID().replaceAll("-", "");
  const { grantId: generatedGrantId } = decodeDisconnectConnectedAppGrantInput({
    grantId: `consent_${slug}`,
  });

  return {
    accessTokenIds: [`access_direct_${slug}`, `access_refresh_${slug}`],
    clientId: decodeOAuthClientId(`client_${slug}`),
    clientRowId: `oauth_client_${slug}`,
    email: `connected-app-${slug}@example.com`,
    grantId: generatedGrantId,
    organizationId:
      options.reference === "organization"
        ? decodeOrganizationId(randomUUID())
        : null,
    redirectUris:
      options.reference === "organization"
        ? ["https://mcp.example.com/oauth/callback"]
        : ["com.example.app:/oauth/callback"],
    refreshTokenId: `refresh_${slug}`,
    scopes: ["ceird:read", "offline_access"],
    slug,
    userId: options.userId ?? decodeUserId(`user_${slug}`),
  };
}

async function seedConnectedAppUser(
  pool: Pool,
  seed: ConnectedAppSeed
): Promise<void> {
  await pool.query(
    `insert into "user" (id, name, email)
     values ($1, $2, $3)
     on conflict (id) do nothing`,
    [seed.userId, "Connected App Owner", seed.email]
  );
}

async function seedConnectedAppGrant(
  pool: Pool,
  seed: ConnectedAppSeed,
  options: {
    readonly insertOrganization?: boolean;
    readonly organizationName?: string;
  } = {}
): Promise<void> {
  if (seed.organizationId !== null && options.insertOrganization !== false) {
    await pool.query(
      `insert into organization (id, name, slug)
       values ($1, $2, $3)`,
      [
        seed.organizationId,
        options.organizationName ?? "Connected App Organization",
        `connected-app-${seed.slug}`,
      ]
    );
  }

  await pool.query(
    `insert into oauth_client (
       id,
       client_id,
       name,
       uri,
       tos,
       policy,
       redirect_uris,
       scopes
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      seed.clientRowId,
      seed.clientId,
      "External MCP",
      "https://mcp.example.com",
      "https://mcp.example.com/terms",
      "https://mcp.example.com/privacy",
      seed.redirectUris,
      seed.scopes,
    ]
  );

  await pool.query(
    `insert into oauth_consent (
       id,
       client_id,
       user_id,
       reference_id,
       scopes,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      seed.grantId,
      seed.clientId,
      seed.userId,
      seed.organizationId,
      seed.scopes,
      new Date("2026-06-08T10:30:00.000Z"),
      new Date("2026-06-08T10:45:00.000Z"),
    ]
  );

  await pool.query(
    `insert into oauth_refresh_token (
       id,
       token,
       client_id,
       user_id,
       reference_id,
       expires_at,
       scopes
     )
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      seed.refreshTokenId,
      `refresh-token-${seed.slug}`,
      seed.clientId,
      seed.userId,
      seed.organizationId,
      new Date("2026-07-08T10:30:00.000Z"),
      seed.scopes,
    ]
  );

  await pool.query(
    `insert into oauth_access_token (
       id,
       token,
       client_id,
       user_id,
       reference_id,
       refresh_id,
       expires_at,
       scopes
     )
     values
       ($1, $2, $3, $4, $5, null, $6, $7),
       ($8, $9, $3, null, $5, $10, $6, $7)`,
    [
      seed.accessTokenIds[0],
      `access-token-direct-${seed.slug}`,
      seed.clientId,
      seed.userId,
      seed.organizationId,
      new Date("2026-06-08T11:30:00.000Z"),
      seed.scopes,
      seed.accessTokenIds[1],
      `access-token-refresh-${seed.slug}`,
      seed.refreshTokenId,
    ]
  );
}

async function installAuditInsertFailure(pool: Pool): Promise<void> {
  await pool.query(`
    create function fail_connected_app_audit_insert()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.event_type = 'oauth_consent_revoked' then
        raise exception 'forced connected app audit failure';
      end if;

      return new;
    end;
    $$;

    create trigger fail_connected_app_audit_insert
    before insert on auth_security_audit_event
    for each row execute function fail_connected_app_audit_insert();
  `);
}

async function readDisconnectState(
  databaseUrl: string,
  seed: ConnectedAppSeed
) {
  return await withPool(databaseUrl, async (pool) => {
    const result = await pool.query<{
      readonly access_token_count: string;
      readonly active_refresh_count: string;
      readonly audit_count: string;
      readonly consent_count: string;
      readonly revoked_refresh_count: string;
    }>(
      `select
         (
           select count(*)::text
           from oauth_consent
           where id = $1
         ) as consent_count,
         (
           select count(*)::text
           from oauth_refresh_token
           where id = $2
             and revoked is null
         ) as active_refresh_count,
         (
           select count(*)::text
           from oauth_refresh_token
           where id = $2
             and revoked is not null
         ) as revoked_refresh_count,
         (
           select count(*)::text
           from oauth_access_token
           where id = any($3::text[])
         ) as access_token_count,
         (
           select count(*)::text
           from auth_security_audit_event
           where event_type = 'oauth_consent_revoked'
             and metadata->>'consentId' = $1
         ) as audit_count`,
      [seed.grantId, seed.refreshTokenId, seed.accessTokenIds]
    );

    return expectSingleRow(result.rows);
  });
}

async function readRevokedAuditRows(
  databaseUrl: string,
  seed: ConnectedAppSeed
) {
  return await withPool(databaseUrl, async (pool) => {
    const result = await pool.query<{
      readonly actor_user_id: string | null;
      readonly event_type: string;
      readonly metadata: {
        readonly consentId: string;
        readonly referenceId: string | null;
      };
      readonly oauth_client_id: string | null;
      readonly organization_id: string | null;
      readonly scopes: readonly string[] | null;
    }>(
      `select
         actor_user_id,
         event_type,
         metadata,
         oauth_client_id,
         organization_id,
         scopes
       from auth_security_audit_event
       where event_type = 'oauth_consent_revoked'
         and metadata->>'consentId' = $1
       order by created_at desc, id desc`,
      [seed.grantId]
    );

    return result.rows;
  });
}

function expectSingleRow<Row>(rows: readonly Row[]): Row {
  const [row] = rows;

  if (row === undefined) {
    throw new Error("Expected one database row");
  }

  return row;
}
