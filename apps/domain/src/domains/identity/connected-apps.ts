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
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql as drizzleSql,
} from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { DomainDrizzle } from "../../platform/database/database.js";
import type { DomainDrizzleDatabase } from "../../platform/database/database.js";
import {
  authSecurityAuditEvent,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  organization,
} from "../../platform/database/schema.js";
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

interface ConnectedAppGrantDisconnectMutationInput {
  readonly consent: ConnectedAppGrantDisconnectRow;
  readonly userId: UserId;
}

export interface ConnectedAppGrantsRepositoryShape {
  readonly disconnect: (
    input: DisconnectConnectedAppGrantRecordInput
  ) => Effect.Effect<
    ReturnType<typeof decodeDisconnectConnectedAppGrantResponse>,
    ConnectedAppGrantNotFoundError | ConnectedAppGrantStorageError
  >;
  readonly list: (
    userId: UserId
  ) => Effect.Effect<
    ConnectedAppGrantListResponse,
    ConnectedAppGrantStorageError
  >;
}

export interface ConnectedAppGrantStorage {
  readonly deleteAccessTokens: (
    input: ConnectedAppGrantDisconnectMutationInput
  ) => Effect.Effect<void, ConnectedAppGrantStorageError>;
  readonly deleteConsent: (
    input: ConnectedAppGrantDisconnectMutationInput
  ) => Effect.Effect<void, ConnectedAppGrantStorageError>;
  readonly findDisconnectConsent: (
    input: DisconnectConnectedAppGrantRecordInput
  ) => Effect.Effect<readonly unknown[], ConnectedAppGrantStorageError>;
  readonly insertRevokedAuditEvent: (
    auditWrite: OAuthConsentRevokedAuditWrite
  ) => Effect.Effect<void, ConnectedAppGrantStorageError>;
  readonly listRows: (
    userId: UserId
  ) => Effect.Effect<unknown, ConnectedAppGrantStorageError>;
  readonly revokeRefreshTokens: (
    input: ConnectedAppGrantDisconnectMutationInput
  ) => Effect.Effect<void, ConnectedAppGrantStorageError>;
  readonly withTransaction: <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | ConnectedAppGrantStorageError, R>;
}

export class ConnectedAppGrantsRepository extends Context.Service<ConnectedAppGrantsRepository>()(
  "@ceird/domains/identity/ConnectedAppGrantsRepository",
  {
    make: Effect.gen(function* ConnectedAppGrantsRepositoryLive() {
      const rawSql = yield* SqlClient.SqlClient;
      const { db } = yield* DomainDrizzle;

      return makeConnectedAppGrantsRepository(
        makeConnectedAppGrantStorage({ db, rawSql })
      );
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

export function makeConnectedAppGrantsRepository(
  storage: ConnectedAppGrantStorage
): ConnectedAppGrantsRepositoryShape {
  const list = Effect.fn("ConnectedAppGrantsRepository.list")(function* (
    userId: UserId
  ) {
    const rows = yield* storage.listRows(userId);

    return yield* decodeConnectedAppGrantList(rows);
  });

  const disconnect = Effect.fn("ConnectedAppGrantsRepository.disconnect")(
    function* (input: DisconnectConnectedAppGrantRecordInput) {
      return yield* storage.withTransaction(
        Effect.gen(function* () {
          const consentRows = yield* storage.findDisconnectConsent(input);
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

          yield* storage.deleteConsent({
            consent: decodedConsent,
            userId: input.userId,
          });

          yield* storage.revokeRefreshTokens({
            consent: decodedConsent,
            userId: input.userId,
          });

          yield* storage.deleteAccessTokens({
            consent: decodedConsent,
            userId: input.userId,
          });
          const auditWrite = yield* makeOAuthConsentRevokedAuditWrite({
            consent: decodedConsent,
            userId: input.userId,
          });

          yield* storage.insertRevokedAuditEvent(auditWrite);

          return decodeDisconnectConnectedAppGrantResponse({
            disconnectedGrantId: input.grantId,
          });
        })
      );
    }
  );

  return { disconnect, list };
}

function makeConnectedAppGrantStorage(input: {
  readonly db: DomainDrizzleDatabase;
  readonly rawSql: SqlClient.SqlClient;
}): ConnectedAppGrantStorage {
  const { db, rawSql } = input;

  return {
    deleteAccessTokens: ({ consent, userId }) =>
      db
        .delete(oauthAccessToken)
        .where(
          and(
            eq(oauthAccessToken.clientId, consent.client_id),
            drizzleSql`${oauthAccessToken.referenceId} is not distinct from ${consent.reference_id}`,
            or(
              eq(oauthAccessToken.userId, userId),
              inArray(
                oauthAccessToken.refreshId,
                db
                  .select({ id: oauthRefreshToken.id })
                  .from(oauthRefreshToken)
                  .where(
                    and(
                      eq(oauthRefreshToken.userId, userId),
                      eq(oauthRefreshToken.clientId, consent.client_id),
                      drizzleSql`${oauthRefreshToken.referenceId} is not distinct from ${consent.reference_id}`
                    )
                  )
              )
            )
          )
        )
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", failConnectedAppStorage),
          Effect.asVoid
        ),
    deleteConsent: ({ consent, userId }) =>
      db
        .delete(oauthConsent)
        .where(
          and(
            eq(oauthConsent.userId, userId),
            eq(oauthConsent.clientId, consent.client_id),
            drizzleSql`${oauthConsent.referenceId} is not distinct from ${consent.reference_id}`
          )
        )
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", failConnectedAppStorage),
          Effect.asVoid
        ),
    findDisconnectConsent: (storageInput) =>
      db
        .select({
          client_id: oauthConsent.clientId,
          id: oauthConsent.id,
          reference_id: oauthConsent.referenceId,
          scopes: oauthConsent.scopes,
        })
        .from(oauthConsent)
        .where(
          and(
            eq(oauthConsent.id, storageInput.grantId),
            eq(oauthConsent.userId, storageInput.userId)
          )
        )
        .limit(1)
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", failConnectedAppStorage)
        ),
    insertRevokedAuditEvent: (auditWrite) =>
      db
        .insert(authSecurityAuditEvent)
        .values({
          actorUserId: auditWrite.actorUserId,
          eventType: auditWrite.eventType,
          metadata: auditWrite.metadata,
          oauthClientId: auditWrite.oauthClientId,
          organizationId: auditWrite.organizationId,
          scopes: [...auditWrite.scopes],
        })
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", failConnectedAppStorage),
          Effect.asVoid
        ),
    listRows: (userId) =>
      db
        .select({
          active_access_token_count: drizzleSql<number>`coalesce((
              select count(*)::integer
              from ${oauthAccessToken}
              where ${oauthAccessToken.userId} = ${oauthConsent.userId}
                and ${oauthAccessToken.clientId} = ${oauthConsent.clientId}
                and ${oauthAccessToken.referenceId} is not distinct from ${oauthConsent.referenceId}
                and ${oauthAccessToken.expiresAt} > now()
            ), 0)::integer`,
          active_refresh_token_count: drizzleSql<number>`coalesce((
              select count(*)::integer
              from ${oauthRefreshToken}
              where ${oauthRefreshToken.userId} = ${oauthConsent.userId}
                and ${oauthRefreshToken.clientId} = ${oauthConsent.clientId}
                and ${oauthRefreshToken.referenceId} is not distinct from ${oauthConsent.referenceId}
                and ${oauthRefreshToken.revoked} is null
                and ${oauthRefreshToken.expiresAt} > now()
            ), 0)::integer`,
          client_id: oauthConsent.clientId,
          client_name: drizzleSql<
            string | null
          >`nullif(btrim(${oauthClient.name}), '')`,
          client_uri: drizzleSql<
            string | null
          >`nullif(btrim(${oauthClient.uri}), '')`,
          consent_created_at: oauthConsent.createdAt,
          consent_id: oauthConsent.id,
          consent_updated_at: oauthConsent.updatedAt,
          latest_access_token_expires_at: drizzleSql<Date | null>`(
              select max(${oauthAccessToken.expiresAt})
              from ${oauthAccessToken}
              where ${oauthAccessToken.userId} = ${oauthConsent.userId}
                and ${oauthAccessToken.clientId} = ${oauthConsent.clientId}
                and ${oauthAccessToken.referenceId} is not distinct from ${oauthConsent.referenceId}
                and ${oauthAccessToken.expiresAt} > now()
            )`,
          latest_refresh_token_expires_at: drizzleSql<Date | null>`(
              select max(${oauthRefreshToken.expiresAt})
              from ${oauthRefreshToken}
              where ${oauthRefreshToken.userId} = ${oauthConsent.userId}
                and ${oauthRefreshToken.clientId} = ${oauthConsent.clientId}
                and ${oauthRefreshToken.referenceId} is not distinct from ${oauthConsent.referenceId}
                and ${oauthRefreshToken.revoked} is null
                and ${oauthRefreshToken.expiresAt} > now()
            )`,
          organization_id: organization.id,
          organization_name: organization.name,
          policy_uri: drizzleSql<
            string | null
          >`nullif(btrim(${oauthClient.policy}), '')`,
          redirect_uris: oauthClient.redirectUris,
          reference_id: oauthConsent.referenceId,
          scopes: oauthConsent.scopes,
          tos_uri: drizzleSql<
            string | null
          >`nullif(btrim(${oauthClient.tos}), '')`,
        })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .leftJoin(organization, eq(organization.id, oauthConsent.referenceId))
        .where(eq(oauthConsent.userId, userId))
        .orderBy(
          desc(oauthConsent.updatedAt),
          desc(oauthConsent.createdAt),
          desc(oauthConsent.id)
        )
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", failConnectedAppStorage)
        ),
    revokeRefreshTokens: ({ consent, userId }) =>
      db
        .update(oauthRefreshToken)
        .set({ revoked: drizzleSql`now()` })
        .where(
          and(
            eq(oauthRefreshToken.userId, userId),
            eq(oauthRefreshToken.clientId, consent.client_id),
            drizzleSql`${oauthRefreshToken.referenceId} is not distinct from ${consent.reference_id}`,
            isNull(oauthRefreshToken.revoked)
          )
        )
        .pipe(
          Effect.catchTag("EffectDrizzleQueryError", failConnectedAppStorage),
          Effect.asVoid
        ),
    withTransaction: (effect) =>
      rawSql
        .withTransaction(effect)
        .pipe(Effect.catchTag("SqlError", failConnectedAppStorage)),
  };
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
