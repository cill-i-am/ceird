import {
  ConnectedAppGrantNotFoundError,
  decodeDisconnectConnectedAppGrantInput,
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
  mapConnectedAppGrantRow,
} from "./connected-apps.js";
import { CurrentUser } from "./preferences/current-user.js";

const userId = decodeUserId("user_123");
const { grantId } = decodeDisconnectConnectedAppGrantInput({
  grantId: "consent_123",
});

describe("connected app grant mapping", () => {
  it("maps OAuth consent rows into a safe connected-app read model", () => {
    expect(
      mapConnectedAppGrantRow({
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
        redirect_uris: [
          "https://mcp.example.com/oauth/callback",
          "https://mcp.example.com/alternate/callback",
        ],
        reference_id: "org_acme",
        scopes: ["openid", "profile", "ceird:read", "offline_access"],
        tos_uri: "https://mcp.example.com/terms",
      })
    ).toStrictEqual({
      activeAccessTokenCount: 1,
      activeRefreshTokenCount: 2,
      clientId: "client_external_mcp",
      clientName: "External MCP",
      clientUri: "https://mcp.example.com",
      context: {
        organizationId: "org_acme",
        organizationName: "Acme Field Ops",
        type: "organization",
      },
      grantId: "consent_123",
      grantedAt: "2026-06-08T10:30:00.000Z",
      latestAccessTokenExpiresAt: "2026-06-08T11:30:00.000Z",
      latestRefreshTokenExpiresAt: "2026-07-08T10:30:00.000Z",
      offlineAccess: true,
      policyUri: "https://mcp.example.com/privacy",
      redirectHosts: ["mcp.example.com"],
      scopes: ["openid", "profile", "ceird:read", "offline_access"],
      scopeGroups: [
        {
          key: "identity",
          label: "Identity",
          scopes: ["openid", "profile"],
        },
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
      ],
      tosUri: "https://mcp.example.com/terms",
      updatedAt: "2026-06-08T10:45:00.000Z",
    });
  });

  it("maps consents without an organization reference as account-level grants", () => {
    const grant = mapConnectedAppGrantRow({
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
    });

    expect(grant).toMatchObject({
      clientId: "client_identity",
      clientName: undefined,
      context: { type: "account" },
      offlineAccess: false,
      redirectHosts: ["com.example.app"],
    });
  });
});

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

              return Effect.succeed([connectedApp]);
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
  it("disconnects a grant by deleting consent, revoking tokens, deleting access tokens, and auditing", async () => {
    const sql = makeConnectedAppsSqlClient({
      consentRows: [
        {
          client_id: "client_external_mcp",
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
    clientId: "client_external_mcp",
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
          Effect.succeed([makeConnectedAppGrant()])),
    })
  );
}

function makeConnectedAppsSqlClient(options: {
  readonly consentRows: readonly {
    readonly client_id: string;
    readonly id: ConnectedAppGrantId;
    readonly reference_id: string | null;
    readonly scopes: readonly string[];
  }[];
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
