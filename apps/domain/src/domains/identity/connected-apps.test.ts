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

import { effectEither } from "../../test/effect-test-helpers.js";
import {
  ConnectedAppGrantsRepository,
  ConnectedAppGrantsService,
  makeConnectedAppGrantsRepository,
} from "./connected-apps.js";
import type { ConnectedAppGrantStorage } from "./connected-apps.js";
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
  it("lists schema-decoded connected-app grants from Drizzle projections", async () => {
    const storage = makeConnectedAppsStorage({
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
      }).pipe(Effect.provide(storage.layer))
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
    const storage = makeConnectedAppsStorage({
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
      }).pipe(Effect.provide(storage.layer), effectEither)
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
    const storage = makeConnectedAppsStorage({
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
      }).pipe(Effect.provide(storage.layer))
    );

    expect(result).toStrictEqual({ disconnectedGrantId: grantId });
    expect(storage.operations.map((entry) => entry.operation)).toStrictEqual([
      "begin_transaction",
      "select_disconnect_consent",
      "delete_oauth_consent",
      "update_oauth_refresh_token",
      "delete_oauth_access_token",
      "insert_auth_security_audit_event",
      "commit_transaction",
    ]);
    expect(storage.operations[5]?.values).toMatchObject({
      actorUserId: userId,
      eventType: "oauth_consent_revoked",
      oauthClientId: clientId,
      organizationId: "org_acme",
      scopes: ["ceird:read", "offline_access"],
    });
  }, 10_000);

  it("does not mutate OAuth records when the grant is missing", async () => {
    const storage = makeConnectedAppsStorage({ consentRows: [] });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* ConnectedAppGrantsRepository;

        return yield* repository.disconnect({ grantId, userId });
      }).pipe(Effect.provide(storage.layer), effectEither)
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: expect.any(ConnectedAppGrantNotFoundError),
    });
    expect(storage.operations).toStrictEqual([
      { operation: "begin_transaction" },
      { operation: "select_disconnect_consent" },
      { operation: "rollback_transaction" },
    ]);
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

function makeConnectedAppsStorage(options: {
  readonly consentRows: readonly unknown[];
  readonly listRows?: readonly unknown[];
}) {
  const operations: {
    readonly operation: string;
    readonly values?: unknown;
  }[] = [];
  const storage = {
    deleteAccessTokens: (input) =>
      recordOperation(operations, {
        operation: "delete_oauth_access_token",
        values: input,
      }),
    deleteConsent: (input) =>
      recordOperation(operations, {
        operation: "delete_oauth_consent",
        values: input,
      }),
    findDisconnectConsent: () =>
      recordOperation(operations, {
        operation: "select_disconnect_consent",
      }).pipe(Effect.as(options.consentRows)),
    insertRevokedAuditEvent: (values) =>
      recordOperation(operations, {
        operation: "insert_auth_security_audit_event",
        values,
      }),
    listRows: () =>
      recordOperation(operations, {
        operation: "select_connected_app_grants",
      }).pipe(Effect.as(options.listRows ?? [])),
    revokeRefreshTokens: (input) =>
      recordOperation(operations, {
        operation: "update_oauth_refresh_token",
        values: input,
      }),
    withTransaction: (effect) =>
      Effect.gen(function* () {
        yield* recordOperation(operations, { operation: "begin_transaction" });

        return yield* effect.pipe(
          Effect.tap(() =>
            recordOperation(operations, { operation: "commit_transaction" })
          ),
          Effect.tapError(() =>
            recordOperation(operations, { operation: "rollback_transaction" })
          )
        );
      }),
  } satisfies ConnectedAppGrantStorage;

  return {
    layer: Layer.succeed(
      ConnectedAppGrantsRepository,
      ConnectedAppGrantsRepository.of(makeConnectedAppGrantsRepository(storage))
    ),
    operations,
  };
}

function recordOperation(
  operations: {
    readonly operation: string;
    readonly values?: unknown;
  }[],
  entry: {
    readonly operation: string;
    readonly values?: unknown;
  }
) {
  return Effect.sync(() => {
    operations.push(entry);
  });
}
