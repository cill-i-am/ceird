/* oxlint-disable eslint/max-classes-per-file */
import {
  ConnectedAppGrantAccessDeniedError,
  ConnectedAppGrantListResponseSchema,
  ConnectedAppGrantNotFoundError,
  ConnectedAppGrantStorageError,
  DisconnectConnectedAppGrantResponseSchema,
  OrganizationId,
  UserPreferencesAccessDeniedError,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import type {
  ConnectedAppGrant,
  ConnectedAppGrantId,
  ConnectedAppScopeGroup,
  ConnectedAppScopeGroupKey,
  DisconnectConnectedAppGrantInput,
  UserId,
} from "@ceird/identity-core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { CurrentUser } from "./preferences/current-user.js";

const decodeConnectedAppGrantListResponse = Schema.decodeUnknownSync(
  ConnectedAppGrantListResponseSchema
);
const decodeDisconnectConnectedAppGrantResponse = Schema.decodeUnknownSync(
  DisconnectConnectedAppGrantResponseSchema
);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);

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

export interface ConnectedAppGrantRow {
  readonly active_access_token_count: number | string | bigint;
  readonly active_refresh_token_count: number | string | bigint;
  readonly client_id: string;
  readonly client_name: string | null;
  readonly client_uri: string | null;
  readonly consent_created_at: Date;
  readonly consent_id: string;
  readonly consent_updated_at: Date;
  readonly latest_access_token_expires_at: Date | null;
  readonly latest_refresh_token_expires_at: Date | null;
  readonly organization_id: string | null;
  readonly organization_name: string | null;
  readonly policy_uri: string | null;
  readonly redirect_uris: readonly string[] | null;
  readonly reference_id: string | null;
  readonly scopes: readonly string[];
  readonly tos_uri: string | null;
}

interface ConnectedAppGrantDisconnectRow {
  readonly client_id: string;
  readonly id: string;
  readonly reference_id: string | null;
  readonly scopes: readonly string[];
}

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
        const rows = yield* sql<ConnectedAppGrantRow>`
          select
            oauth_consent.id as consent_id,
            oauth_consent.client_id,
            oauth_consent.reference_id,
            oauth_consent.scopes,
            oauth_consent.created_at as consent_created_at,
            oauth_consent.updated_at as consent_updated_at,
            oauth_client.name as client_name,
            oauth_client.uri as client_uri,
            oauth_client.policy as policy_uri,
            oauth_client.tos as tos_uri,
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

        return rows.map(mapConnectedAppGrantRow);
      });

      const disconnect = Effect.fn("ConnectedAppGrantsRepository.disconnect")(
        function* (input: DisconnectConnectedAppGrantRecordInput) {
          return yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const consentRows = yield* sql<ConnectedAppGrantDisconnectRow>`
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

                yield* sql`
                delete from oauth_consent
                where user_id = ${input.userId}
                  and client_id = ${consent.client_id}
                  and reference_id is not distinct from ${consent.reference_id}
              `;

                yield* sql`
                update oauth_refresh_token
                set revoked = now()
                where user_id = ${input.userId}
                  and client_id = ${consent.client_id}
                  and reference_id is not distinct from ${consent.reference_id}
                  and revoked is null
              `;

                yield* sql`
                delete from oauth_access_token
                where client_id = ${consent.client_id}
                  and reference_id is not distinct from ${consent.reference_id}
                  and (
                    user_id = ${input.userId}
                    or refresh_id in (
                      select id
                      from oauth_refresh_token
                      where user_id = ${input.userId}
                        and client_id = ${consent.client_id}
                        and reference_id is not distinct from ${consent.reference_id}
                    )
                  )
              `;

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
                  'oauth_consent_revoked',
                  ${input.userId},
                  ${consent.reference_id},
                  ${consent.client_id},
                  ${consent.scopes},
                  ${JSON.stringify({
                    consentId: consent.id,
                    referenceId: consent.reference_id,
                  })}::jsonb
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
        const grants = yield* repository.list(userId);

        return decodeConnectedAppGrantListResponse({ grants });
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

export function mapConnectedAppGrantRow(
  row: ConnectedAppGrantRow
): ConnectedAppGrant {
  return {
    activeAccessTokenCount: Number(row.active_access_token_count),
    activeRefreshTokenCount: Number(row.active_refresh_token_count),
    clientId: row.client_id,
    clientName: toOptionalString(row.client_name),
    clientUri: toOptionalString(row.client_uri),
    context: makeConnectedAppContext(row),
    grantId: row.consent_id as ConnectedAppGrantId,
    grantedAt: row.consent_created_at.toISOString(),
    latestAccessTokenExpiresAt:
      row.latest_access_token_expires_at?.toISOString(),
    latestRefreshTokenExpiresAt:
      row.latest_refresh_token_expires_at?.toISOString(),
    offlineAccess: row.scopes.includes("offline_access"),
    policyUri: toOptionalString(row.policy_uri),
    redirectHosts: getRedirectHosts(row.redirect_uris ?? []),
    scopes: [...row.scopes],
    scopeGroups: groupConnectedAppScopes(row.scopes),
    tosUri: toOptionalString(row.tos_uri),
    updatedAt: row.consent_updated_at.toISOString(),
  };
}

function makeConnectedAppContext(row: ConnectedAppGrantRow) {
  if (row.reference_id === null) {
    return { type: "account" as const };
  }

  return {
    organizationId: decodeOrganizationId(
      row.organization_id ?? row.reference_id
    ),
    organizationName: row.organization_name ?? row.reference_id,
    type: "organization" as const,
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

function toOptionalString(value: string | null | undefined) {
  return value === undefined || value === null || value.trim().length === 0
    ? undefined
    : value;
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
    Effect.mapError((error) => {
      if (error instanceof UserPreferencesAccessDeniedError) {
        return new ConnectedAppGrantAccessDeniedError({
          message: "Authentication is required to manage connected apps",
        });
      }

      if (error instanceof UserPreferencesStorageError) {
        return new ConnectedAppGrantStorageError({
          cause: error.cause,
          message: "Connected app session lookup failed",
        });
      }

      return new ConnectedAppGrantStorageError({
        message: "Connected app session lookup failed",
      });
    })
  );
}

function failConnectedAppStorage(error: unknown) {
  return Effect.fail(
    new ConnectedAppGrantStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Connected app storage operation failed",
    })
  );
}
