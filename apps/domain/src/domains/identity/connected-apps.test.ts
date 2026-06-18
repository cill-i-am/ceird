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
  UserId,
} from "@ceird/identity-core";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";

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
  it("lists schema-decoded connected-app grants from raw SQL projections", async () => {
    const sql = makeConnectedAppsSqlClient({
      consentRows: [],
      listRows: [
        {
          active_access_token_count: 1,
          active_refresh_token_count: 2,
          client_id: "client_external_mcp",
          client_name: "External MCP",
          client_uri: "https://mcp.example.com",
          consent_created_at: new Date("2026-06-08T10:30:00.000Z"),
          consent_id: "consent_123",
          consent_updated_at: new Date("2026-06-08T10:45:00.000Z"),
          latest_access_token_expires_at: new Date("2026-06-08T11:30:00.000Z"),
          latest_refresh_token_expires_at: new Date("2026-07-08T10:30:00.000Z"),
          organization_id: "org_acme",
          organization_name: "Acme Field Ops",
          policy_uri: "https://mcp.example.com/privacy",
          redirect_uris: ["https://mcp.example.com/oauth/callback"],
          reference_id: "org_acme",
          scopes: ["openid", "ceird:read", "offline_access"],
          tos_uri: "https://mcp.example.com/terms",
        },
        {
          active_access_token_count: 0,
          active_refresh_token_count: 0,
          client_id: "client_identity",
          client_name: null,
          client_uri: null,
          consent_created_at: new Date("2026-06-08T12:00:00.000Z"),
          consent_id: "consent_identity",
          consent_updated_at: new Date("2026-06-08T12:00:00.000Z"),
          latest_access_token_expires_at: null,
          latest_refresh_token_expires_at: null,
          organization_id: null,
          organization_name: null,
          policy_uri: null,
          redirect_uris: ["com.example.app:/oauth/callback"],
          reference_id: null,
          scopes: ["openid", "email"],
          tos_uri: null,
        },
      ],
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ConnectedAppGrantsRepository;

        return yield* repository.list(userId);
      }).pipe(
        Effect.provide(ConnectedAppGrantsRepository.DefaultWithoutDependencies),
        Effect.provide(sql.layer)
      )
    );

    expect(result).toStrictEqual({
      grants: [
        expect.objectContaining({
          activeAccessTokenCount: 1,
          activeRefreshTokenCount: 2,
          clientId,
          context: {
            organizationId: "org_acme",
            organizationName: "Acme Field Ops",
            type: "organization",
          },
          grantId,
          offlineAccess: true,
          redirectHosts: ["mcp.example.com"],
        }),
        expect.objectContaining({
          activeAccessTokenCount: 0,
          activeRefreshTokenCount: 0,
          clientId: decodeOAuthClientId("client_identity"),
          clientName: undefined,
          context: { type: "account" },
          grantId: decodeDisconnectConnectedAppGrantInput({
            grantId: "consent_identity",
          }).grantId,
          offlineAccess: false,
          redirectHosts: ["com.example.app"],
        }),
      ],
    });
  }, 10_000);

  it("fails at the repository boundary instead of repairing stale organization references", async () => {
    const sql = makeConnectedAppsSqlClient({
      consentRows: [],
      listRows: [
        {
          active_access_token_count: 0,
          active_refresh_token_count: 0,
          client_id: "client_external_mcp",
          client_name: "External MCP",
          client_uri: null,
          consent_created_at: new Date("2026-06-08T10:30:00.000Z"),
          consent_id: "consent_123",
          consent_updated_at: new Date("2026-06-08T10:45:00.000Z"),
          latest_access_token_expires_at: null,
          latest_refresh_token_expires_at: null,
          organization_id: null,
          organization_name: null,
          policy_uri: null,
          redirect_uris: ["https://mcp.example.com/oauth/callback"],
          reference_id: "org_acme",
          scopes: ["ceird:read"],
          tos_uri: null,
        },
      ],
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ConnectedAppGrantsRepository;

        return yield* repository.list(userId);
      }).pipe(
        Effect.provide(ConnectedAppGrantsRepository.DefaultWithoutDependencies),
        Effect.provide(sql.layer),
        effectEither
      )
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: expect.any(ConnectedAppGrantStorageError),
    });
    expect(result._tag === "Left" ? result.left.message : "").toBe(
      "Connected app grant projection decode failed"
    );
  }, 10_000);

  it("disconnects a grant by deleting consent, revoking tokens, deleting access tokens, and auditing", async () => {
    const sql = makeConnectedAppsSqlClient({
      consentRows: [
        {
          client_id: clientId,
          id: grantId,
          reference_id: "org_acme",
          scopes: ["ceird:read", "offline_access"],
        },
      ],
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ConnectedAppGrantsRepository;

        return yield* repository.disconnect({ grantId, userId });
      }).pipe(
        Effect.provide(ConnectedAppGrantsRepository.DefaultWithoutDependencies),
        Effect.provide(sql.layer)
      )
    );

    expect(result).toStrictEqual({ disconnectedGrantId: grantId });
    expect(sql.statements.map((entry) => entry.statement)).toStrictEqual([
      expect.stringContaining("select id, client_id, reference_id, scopes"),
      expect.stringContaining("delete from oauth_consent"),
      expect.stringContaining("update oauth_refresh_token"),
      expect.stringContaining("delete from oauth_access_token"),
      expect.stringContaining("insert into auth_security_audit_event"),
    ]);
    expect(sql.statements[4]?.values).toStrictEqual(
      expect.arrayContaining([
        userId,
        "org_acme",
        "client_external_mcp",
        ["ceird:read", "offline_access"],
      ])
    );
  }, 10_000);

  it("does not mutate OAuth records when the grant is missing", async () => {
    const sql = makeConnectedAppsSqlClient({ consentRows: [] });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ConnectedAppGrantsRepository;

        return yield* repository.disconnect({ grantId, userId });
      }).pipe(
        Effect.provide(ConnectedAppGrantsRepository.DefaultWithoutDependencies),
        Effect.provide(sql.layer),
        effectEither
      )
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: expect.any(ConnectedAppGrantNotFoundError),
    });
    expect(sql.statements).toHaveLength(1);
  }, 10_000);
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
    {} as HttpServerRequest.HttpServerRequest
  );
}

function makeRepositoryLayer(
  handlers: Partial<{
    readonly disconnect: Parameters<
      typeof ConnectedAppGrantsRepository.of
    >[0]["disconnect"];
    readonly list: Parameters<
      typeof ConnectedAppGrantsRepository.of
    >[0]["list"];
  }>
) {
  return Layer.succeed(
    ConnectedAppGrantsRepository,
    ConnectedAppGrantsRepository.of({
      disconnect:
        handlers.disconnect ??
        ((input: { readonly grantId: ConnectedAppGrantId }) =>
          Effect.succeed({ disconnectedGrantId: input.grantId })),
      list:
        handlers.list ??
        ((_requestedUserId: UserId) =>
          Effect.succeed({ grants: [makeConnectedAppGrant()] })),
    })
  );
}

function makeConnectedAppsSqlClient(options: {
  readonly consentRows: readonly unknown[];
  readonly listRows?: readonly unknown[];
}) {
  const statements: {
    readonly statement: string;
    readonly values: readonly unknown[];
  }[] = [];
  const sql = ((
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => {
    const statement = strings.join(" ");
    statements.push({ statement, values });

    if (
      statement.includes("from oauth_consent") &&
      statement.includes("join oauth_client")
    ) {
      return Effect.succeed(options.listRows ?? []);
    }

    if (statement.includes("from oauth_consent")) {
      return Effect.succeed(options.consentRows);
    }

    return Effect.succeed([]);
  }) as unknown as SqlClient.SqlClient;

  Object.assign(sql, {
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  });

  return {
    layer: Layer.succeed(SqlClient.SqlClient, sql),
    statements,
  };
}
