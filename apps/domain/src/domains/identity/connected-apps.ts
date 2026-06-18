/* oxlint-disable eslint/max-classes-per-file */
import {
  ConnectedAppGrantAccessDeniedError,
  ConnectedAppGrantListResponseSchema,
  ConnectedAppGrantSchema,
  ConnectedAppGrantNotFoundError,
  ConnectedAppGrantStorageError,
  DisconnectConnectedAppGrantResponseSchema,
  USER_PREFERENCES_ACCESS_DENIED_ERROR_TAG,
  USER_PREFERENCES_STORAGE_ERROR_TAG,
} from "@ceird/identity-core";
import type {
  ConnectedAppGrant,
  ConnectedAppGrantContext,
  ConnectedAppGrantId,
  ConnectedAppGrantListResponse,
  ConnectedAppScopeGroup,
  ConnectedAppScopeGroupKey,
  DisconnectConnectedAppGrantInput,
  UserPreferencesAccessDeniedError,
  UserPreferencesStorageError,
  UserId,
} from "@ceird/identity-core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import {
  ConnectedAppGrantDisconnectRowSchema,
  ConnectedAppGrantListRowsSchema,
  OAuthConsentRevokedAuditWriteSchema,
} from "./persistence-schemas.js";
import type {
  ConnectedAppGrantDisconnectRow,
  ConnectedAppGrantListRow,
  OAuthConsentRevokedAuditWrite,
} from "./persistence-schemas.js";
import { CurrentUser } from "./preferences/current-user.js";

const decodeConnectedAppGrantListResponse = Schema.decodeUnknownSync(
  ConnectedAppGrantListResponseSchema
);
const decodeConnectedAppGrant = Schema.decodeUnknownSync(
  ConnectedAppGrantSchema
);
const decodeDisconnectConnectedAppGrantResponse = Schema.decodeUnknownSync(
  DisconnectConnectedAppGrantResponseSchema
);
const decodeConnectedAppGrantListRows = Schema.decodeUnknownSync(
  ConnectedAppGrantListRowsSchema
);
const decodeConnectedAppGrantDisconnectRow = Schema.decodeUnknownSync(
  ConnectedAppGrantDisconnectRowSchema
);
const decodeOAuthConsentRevokedAuditWrite = Schema.decodeUnknownSync(
  OAuthConsentRevokedAuditWriteSchema
);

const SCOPE_GROUPS: readonly {
  readonly key: ConnectedAppScopeGroupKey;
  readonly label: string;
  readonly scopes: ReadonlySet<string>;
}[] = [
  {
    key: "identity",
    label: "Identity",
    scopes: new Set(["openid", "profile", "email"]),
  },
  { key: "read", label: "Read", scopes: new Set(["ceird:read"]) },
  { key: "write", label: "Write", scopes: new Set(["ceird:write"]) },
  { key: "admin", label: "Admin", scopes: new Set(["ceird:admin"]) },
  {
    key: "offline",
    label: "Offline access",
    scopes: new Set(["offline_access"]),
  },
];

interface DisconnectConnectedAppGrantRecordInput {
  readonly grantId: ConnectedAppGrantId;
  readonly userId: UserId;
}

export class ConnectedAppGrantsRepository extends Context.Service<ConnectedAppGrantsRepository>()(
  "@ceird/domains/identity/ConnectedAppGrantsRepository",
  {
    make: Effect.gen(function* ConnectedAppGrantsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const list = Effect.fn("ConnectedAppGrantsRepository.list")(function* (
        userId: UserId
      ) {
        const rows = yield* sql<Record<string, unknown>>`
          select
            oauth_consent.id as consent_id,
            oauth_consent.client_id,
            oauth_consent.reference_id,
            oauth_consent.scopes,
            oauth_consent.created_at as consent_created_at,
            oauth_consent.updated_at as consent_updated_at,
            nullif(btrim(oauth_client.name), '') as client_name,
            nullif(btrim(oauth_client.uri), '') as client_uri,
            nullif(btrim(oauth_client.policy), '') as policy_uri,
            nullif(btrim(oauth_client.tos), '') as tos_uri,
            oauth_client.redirect_uris,
            organization.id as organization_id,
            organization.name as organization_name,
            coalesce(refresh_tokens.active_refresh_token_count, 0)::integer as active_refresh_token_count,
            refresh_tokens.latest_refresh_token_expires_at,
            coalesce(access_tokens.active_access_token_count, 0)::integer as active_access_token_count,
            access_tokens.latest_access_token_expires_at
          from oauth_consent
          join oauth_client
            on oauth_client.client_id = oauth_consent.client_id
          left join organization
            on organization.id = oauth_consent.reference_id
          left join lateral (
            select
              count(*)::integer as active_refresh_token_count,
              max(oauth_refresh_token.expires_at) as latest_refresh_token_expires_at
            from oauth_refresh_token
            where oauth_refresh_token.user_id = oauth_consent.user_id
              and oauth_refresh_token.client_id = oauth_consent.client_id
              and oauth_refresh_token.reference_id is not distinct from oauth_consent.reference_id
              and oauth_refresh_token.revoked is null
              and oauth_refresh_token.expires_at > now()
          ) refresh_tokens on true
          left join lateral (
            select
              count(*)::integer as active_access_token_count,
              max(oauth_access_token.expires_at) as latest_access_token_expires_at
            from oauth_access_token
            where oauth_access_token.user_id = oauth_consent.user_id
              and oauth_access_token.client_id = oauth_consent.client_id
              and oauth_access_token.reference_id is not distinct from oauth_consent.reference_id
              and oauth_access_token.expires_at > now()
          ) access_tokens on true
          where oauth_consent.user_id = ${userId}
          order by oauth_consent.updated_at desc,
            oauth_consent.created_at desc,
            oauth_consent.id desc
        `.pipe(Effect.catchTag("SqlError", failConnectedAppStorage));

        return yield* decodeConnectedAppGrantList(rows);
      });

      const disconnect = Effect.fn("ConnectedAppGrantsRepository.disconnect")(
        function* (input: DisconnectConnectedAppGrantRecordInput) {
          return yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const consentRows = yield* sql<Record<string, unknown>>`
                select id, client_id, reference_id, scopes
                from oauth_consent
                where id = ${input.grantId}
                  and user_id = ${input.userId}
                limit 1
              `;
                const [consent] = consentRows;

                if (consent === undefined) {
                  return yield* Effect.fail(
                    new ConnectedAppGrantNotFoundError({
                      grantId: input.grantId,
                      message: "Connected app grant was not found",
                    })
                  );
                }
                const decodedConsent =
                  yield* decodeConnectedAppGrantDisconnect(consent);

                yield* sql`
                delete from oauth_consent
                where user_id = ${input.userId}
                  and client_id = ${decodedConsent.client_id}
                  and reference_id is not distinct from ${decodedConsent.reference_id}
              `;

                yield* sql`
                update oauth_refresh_token
                set revoked = now()
                where user_id = ${input.userId}
                  and client_id = ${decodedConsent.client_id}
                  and reference_id is not distinct from ${decodedConsent.reference_id}
                  and revoked is null
              `;

                yield* sql`
                delete from oauth_access_token
                where client_id = ${decodedConsent.client_id}
                  and reference_id is not distinct from ${decodedConsent.reference_id}
                  and (
                    user_id = ${input.userId}
                    or refresh_id in (
                      select id
                      from oauth_refresh_token
                      where user_id = ${input.userId}
                        and client_id = ${decodedConsent.client_id}
                        and reference_id is not distinct from ${decodedConsent.reference_id}
                    )
                  )
              `;
                const auditWrite = yield* makeOAuthConsentRevokedAuditWrite({
                  consent: decodedConsent,
                  userId: input.userId,
                });

                yield* sql`
                insert into auth_security_audit_event (
                  event_type,
                  actor_user_id,
                  organization_id,
                  oauth_client_id,
                  scopes,
                  metadata
                )
                values (
                  ${auditWrite.eventType},
                  ${auditWrite.actorUserId},
                  ${auditWrite.organizationId},
                  ${auditWrite.oauthClientId},
                  ${auditWrite.scopes},
                  ${JSON.stringify(auditWrite.metadata)}::jsonb
                )
              `;

                return decodeDisconnectConnectedAppGrantResponse({
                  disconnectedGrantId: input.grantId,
                });
              })
            )
            .pipe(Effect.catchTag("SqlError", failConnectedAppStorage));
        }
      );

      return { disconnect, list };
    }),
  }
) {
  static readonly disconnect = (
    ...args: Parameters<
      Context.Service.Shape<typeof ConnectedAppGrantsRepository>["disconnect"]
    >
  ) =>
    ConnectedAppGrantsRepository.use((service) => service.disconnect(...args));
  static readonly list = (
    ...args: Parameters<
      Context.Service.Shape<typeof ConnectedAppGrantsRepository>["list"]
    >
  ) => ConnectedAppGrantsRepository.use((service) => service.list(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    ConnectedAppGrantsRepository,
    ConnectedAppGrantsRepository.make
  );
  static readonly Default =
    ConnectedAppGrantsRepository.DefaultWithoutDependencies;
}

export class ConnectedAppGrantsService extends Context.Service<ConnectedAppGrantsService>()(
  "@ceird/domains/identity/ConnectedAppGrantsService",
  {
    make: Effect.gen(function* ConnectedAppGrantsServiceLive() {
      const currentUser = yield* CurrentUser;
      const repository = yield* ConnectedAppGrantsRepository;

      const list = Effect.fn("ConnectedAppGrantsService.list")(function* () {
        const userId = yield* currentUser.get().pipe(mapCurrentUserErrors);
        return yield* repository.list(userId);
      });

      const disconnect = Effect.fn("ConnectedAppGrantsService.disconnect")(
        function* (input: DisconnectConnectedAppGrantInput) {
          const userId = yield* currentUser.get().pipe(mapCurrentUserErrors);

          return yield* repository.disconnect({
            grantId: input.grantId,
            userId,
          });
        }
      );

      return { disconnect, list };
    }),
  }
) {
  static readonly disconnect = (
    ...args: Parameters<
      Context.Service.Shape<typeof ConnectedAppGrantsService>["disconnect"]
    >
  ) => ConnectedAppGrantsService.use((service) => service.disconnect(...args));
  static readonly list = (
    ...args: Parameters<
      Context.Service.Shape<typeof ConnectedAppGrantsService>["list"]
    >
  ) => ConnectedAppGrantsService.use((service) => service.list(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    ConnectedAppGrantsService,
    ConnectedAppGrantsService.make
  );
  static readonly Default =
    ConnectedAppGrantsService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          CurrentUser.Default,
          ConnectedAppGrantsRepository.Default
        )
      )
    );
}

function mapConnectedAppGrantRow(
  row: ConnectedAppGrantListRow
): ConnectedAppGrant {
  return decodeConnectedAppGrant({
    activeAccessTokenCount: row.active_access_token_count,
    activeRefreshTokenCount: row.active_refresh_token_count,
    clientId: row.client_id,
    clientName: row.client_name ?? undefined,
    clientUri: row.client_uri ?? undefined,
    context: makeConnectedAppContext(row),
    grantId: row.consent_id,
    grantedAt: row.consent_created_at.toISOString(),
    latestAccessTokenExpiresAt:
      row.latest_access_token_expires_at?.toISOString(),
    latestRefreshTokenExpiresAt:
      row.latest_refresh_token_expires_at?.toISOString(),
    offlineAccess: row.scopes.includes("offline_access"),
    policyUri: row.policy_uri ?? undefined,
    redirectHosts: getRedirectHosts(row.redirect_uris),
    scopes: [...row.scopes],
    scopeGroups: groupConnectedAppScopes(row.scopes),
    tosUri: row.tos_uri ?? undefined,
    updatedAt: row.consent_updated_at.toISOString(),
  });
}

function makeConnectedAppContext(
  row: ConnectedAppGrantListRow
): ConnectedAppGrantContext {
  if (row.reference_id === null) {
    return { type: "account" };
  }

  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    type: "organization",
  };
}

function groupConnectedAppScopes(
  scopes: readonly string[]
): readonly ConnectedAppScopeGroup[] {
  const seenScopes = new Set<string>();
  const groups: ConnectedAppScopeGroup[] = [];

  for (const group of SCOPE_GROUPS) {
    const matchedScopes = scopes.filter((scope) => group.scopes.has(scope));

    if (matchedScopes.length === 0) {
      continue;
    }

    for (const scope of matchedScopes) {
      seenScopes.add(scope);
    }

    groups.push({
      key: group.key,
      label: group.label,
      scopes: matchedScopes,
    });
  }

  const otherScopes = scopes.filter((scope) => !seenScopes.has(scope));

  if (otherScopes.length > 0) {
    groups.push({
      key: "other",
      label: "Other",
      scopes: otherScopes,
    });
  }

  return groups;
}

function getRedirectHosts(redirectUris: readonly string[]) {
  return [...new Set(redirectUris.map(getRedirectHost).filter(isNonEmpty))];
}

function getRedirectHost(redirectUri: string) {
  try {
    const url = new URL(redirectUri);

    if (url.host.length > 0) {
      return url.host;
    }
  } catch {
    // Fall through to custom-scheme handling below.
  }

  const customSchemeMatch = /^([a-z][a-z0-9+.-]*):/iu.exec(redirectUri);

  return customSchemeMatch?.[1];
}

function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function mapCurrentUserErrors<A, R>(
  effect: Effect.Effect<
    A,
    UserPreferencesAccessDeniedError | UserPreferencesStorageError,
    R
  >
): Effect.Effect<
  A,
  ConnectedAppGrantAccessDeniedError | ConnectedAppGrantStorageError,
  R
> {
  return effect.pipe(
    Effect.catchTags({
      [USER_PREFERENCES_ACCESS_DENIED_ERROR_TAG]: () =>
        Effect.fail(
          new ConnectedAppGrantAccessDeniedError({
            message: "Authentication is required to manage connected apps",
          })
        ),
      [USER_PREFERENCES_STORAGE_ERROR_TAG]: (error) =>
        Effect.fail(
          new ConnectedAppGrantStorageError({
            cause: error.cause,
            message: "Connected app session lookup failed",
          })
        ),
    })
  );
}

function failConnectedAppStorage(error: unknown) {
  return Effect.fail(
    makeConnectedAppStorageError(
      error,
      "Connected app storage operation failed"
    )
  );
}

function decodeConnectedAppGrantList(
  rows: unknown
): Effect.Effect<ConnectedAppGrantListResponse, ConnectedAppGrantStorageError> {
  return Effect.try({
    catch: (error) =>
      makeConnectedAppStorageError(
        error,
        "Connected app grant projection decode failed"
      ),
    try: () =>
      decodeConnectedAppGrantListResponse({
        grants: decodeConnectedAppGrantListRows(rows).map(
          mapConnectedAppGrantRow
        ),
      }),
  });
}

function decodeConnectedAppGrantDisconnect(
  row: unknown
): Effect.Effect<
  ConnectedAppGrantDisconnectRow,
  ConnectedAppGrantStorageError
> {
  return Effect.try({
    catch: (error) =>
      makeConnectedAppStorageError(
        error,
        "Connected app grant disconnect row decode failed"
      ),
    try: () => decodeConnectedAppGrantDisconnectRow(row),
  });
}

function makeOAuthConsentRevokedAuditWrite(input: {
  readonly consent: ConnectedAppGrantDisconnectRow;
  readonly userId: UserId;
}): Effect.Effect<
  OAuthConsentRevokedAuditWrite,
  ConnectedAppGrantStorageError
> {
  return Effect.try({
    catch: (error) =>
      makeConnectedAppStorageError(
        error,
        "Connected app grant audit write decode failed"
      ),
    try: () =>
      decodeOAuthConsentRevokedAuditWrite({
        actorUserId: input.userId,
        eventType: "oauth_consent_revoked",
        metadata: {
          consentId: input.consent.id,
          referenceId: input.consent.reference_id,
        },
        oauthClientId: input.consent.client_id,
        organizationId: input.consent.reference_id,
        scopes: input.consent.scopes,
      }),
  });
}

function makeConnectedAppStorageError(error: unknown, message: string) {
  return new ConnectedAppGrantStorageError({
    cause: error instanceof Error ? error.message : undefined,
    message,
  });
}
