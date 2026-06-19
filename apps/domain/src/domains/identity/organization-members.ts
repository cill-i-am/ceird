/* oxlint-disable eslint/max-classes-per-file */
import {
  CancelOrganizationInvitationResponseSchema,
  InvitationId,
  InviteOrganizationMemberResponseSchema,
  InvitableOrganizationRole,
  IsoDateTimeString,
  NonNegativeInteger,
  OrganizationIdentityAccessDeniedError,
  OrganizationIdentityNotFoundError,
  OrganizationIdentityRejectedError,
  OrganizationIdentityStorageError,
  OrganizationId,
  OrganizationInvitationListResponseSchema,
  OrganizationInvitationSchema,
  OrganizationInvitationStatus,
  OrganizationMemberId as OrganizationMemberIdSchema,
  OrganizationMemberListResponseSchema,
  OrganizationMemberSchema,
  OrganizationRole,
  RemoveOrganizationMemberResponseSchema,
  UpdateOrganizationMemberRoleResponseSchema,
  UserId,
} from "@ceird/identity-core";
import type {
  CancelOrganizationInvitationInput,
  InviteOrganizationMemberInput,
  OrganizationId as OrganizationIdType,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMemberId as OrganizationMemberIdType,
  OrganizationMemberListQuery,
  RemoveOrganizationMemberInput,
  UpdateOrganizationMemberRoleInput,
} from "@ceird/identity-core";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";

import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import {
  ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG,
  ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG,
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
  ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG,
  ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG,
  ORGANIZATION_SESSION_REQUIRED_ERROR_TAG,
} from "../organizations/errors.js";
import type {
  OrganizationActiveOrganizationRequiredError,
  OrganizationActorMembershipNotFoundError,
  OrganizationActorStorageError,
  OrganizationAuthorizationDeniedError,
  OrganizationRoleNotSupportedError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "../organizations/errors.js";
import { Authentication } from "./authentication/auth.js";

const decodeOrganizationMember = Schema.decodeUnknownSync(
  OrganizationMemberSchema
);
const decodeOrganizationInvitation = Schema.decodeUnknownSync(
  OrganizationInvitationSchema
);
const decodeOrganizationMemberListResponse = Schema.decodeUnknownSync(
  OrganizationMemberListResponseSchema
);
const decodeOrganizationInvitationListResponse = Schema.decodeUnknownSync(
  OrganizationInvitationListResponseSchema
);
const decodeInviteOrganizationMemberResponse = Schema.decodeUnknownSync(
  InviteOrganizationMemberResponseSchema
);
const decodeCancelOrganizationInvitationResponse = Schema.decodeUnknownSync(
  CancelOrganizationInvitationResponseSchema
);
const decodeUpdateOrganizationMemberRoleResponse = Schema.decodeUnknownSync(
  UpdateOrganizationMemberRoleResponseSchema
);
const decodeRemoveOrganizationMemberResponse = Schema.decodeUnknownSync(
  RemoveOrganizationMemberResponseSchema
);
const SqlDate = Schema.Unknown.pipe(
  Schema.refine(
    (value): value is Date =>
      value instanceof Date && !Number.isNaN(value.getTime()),
    { message: "Expected a valid SQL date" }
  )
);
const OrganizationMemberRowSchema = Schema.Struct({
  created_at: SqlDate,
  email: Schema.NonEmptyString,
  id: OrganizationMemberIdSchema,
  name: Schema.NonEmptyString,
  organization_id: OrganizationId,
  role: OrganizationRole,
  user_id: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const OrganizationInvitationRowSchema = Schema.Struct({
  created_at: SqlDate,
  email: Schema.NonEmptyString,
  expires_at: SqlDate,
  id: InvitationId,
  organization_id: OrganizationId,
  role: InvitableOrganizationRole,
  status: OrganizationInvitationStatus,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const CountRowSchema = Schema.Struct({
  count: NonNegativeInteger,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const OrganizationInvitationPayloadDateSchema = Schema.Union([
  IsoDateTimeString,
  SqlDate,
]);
const OrganizationInvitationPayloadSchema = Schema.Struct({
  createdAt: OrganizationInvitationPayloadDateSchema,
  email: Schema.NonEmptyString,
  expiresAt: OrganizationInvitationPayloadDateSchema,
  id: InvitationId,
  inviterId: UserId,
  organizationId: OrganizationId,
  role: InvitableOrganizationRole,
  status: OrganizationInvitationStatus,
  teamId: Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const OrganizationMemberRemovalPayloadDateSchema = Schema.Union([
  IsoDateTimeString,
  SqlDate,
]);
const OrganizationMemberRemovalPayloadSchema = Schema.Struct({
  member: Schema.Struct({
    createdAt: OrganizationMemberRemovalPayloadDateSchema,
    id: OrganizationMemberIdSchema,
    organizationId: OrganizationId,
    role: OrganizationRole,
    teamId: Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
    userId: UserId,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const AuthenticationFailureBodySchema = Schema.Struct({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  statusText: Schema.optional(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "ignore" },
});
const SYNTHETIC_ORGANIZATION_AUTH_TRANSPORT_HEADER_NAMES = [
  "accept-encoding",
  "cdn-loop",
  "cf-connecting-ip",
  "cf-ew-via",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "connection",
  "content-encoding",
  "content-length",
  "content-md5",
  "host",
  "transfer-encoding",
] as const;
type OrganizationMemberRow = Schema.Schema.Type<
  typeof OrganizationMemberRowSchema
>;
type OrganizationInvitationRow = Schema.Schema.Type<
  typeof OrganizationInvitationRowSchema
>;
type CountRow = Schema.Schema.Type<typeof CountRowSchema>;
type OrganizationAccessError =
  | OrganizationActiveOrganizationRequiredError
  | OrganizationActorMembershipNotFoundError
  | OrganizationActorStorageError
  | OrganizationAuthorizationDeniedError
  | OrganizationRoleNotSupportedError
  | OrganizationSessionIdentityInvalidError
  | OrganizationSessionRequiredError;
const decodeCountRow = Schema.decodeUnknownSync(CountRowSchema);
const decodeOrganizationMemberRow = Schema.decodeUnknownSync(
  OrganizationMemberRowSchema
);
const decodeOrganizationInvitationRow = Schema.decodeUnknownSync(
  OrganizationInvitationRowSchema
);
const decodeOrganizationInvitationPayload = Schema.decodeUnknownSync(
  OrganizationInvitationPayloadSchema
);
const decodeOrganizationMemberRemovalPayload = Schema.decodeUnknownSync(
  OrganizationMemberRemovalPayloadSchema
);
const isAuthenticationFailureBody = Schema.is(AuthenticationFailureBodySchema);

export class OrganizationMembersRepository extends Context.Service<OrganizationMembersRepository>()(
  "@ceird/domains/identity/OrganizationMembersRepository",
  {
    make: Effect.gen(function* OrganizationMembersRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const listMembers = Effect.fn(
        "OrganizationMembersRepository.listMembers"
      )(function* (
        organizationId: OrganizationIdType,
        query: OrganizationMemberListQuery
      ) {
        return yield* Effect.gen(function* () {
          const rows = yield* sql<OrganizationMemberRow>`
            select
              member.id,
              member.organization_id,
              member.user_id,
              member.role,
              member.created_at,
              "user".name,
              "user".email
            from member
            join "user"
              on "user".id = member.user_id
            where member.organization_id = ${organizationId}
            order by member.created_at asc, member.id asc
            limit ${query.limit}
            offset ${query.offset}
          `;
          const [countRow] = yield* sql<CountRow>`
            select count(*)::integer as count
            from member
            where member.organization_id = ${organizationId}
          `;

          if (countRow === undefined) {
            return yield* Effect.fail(
              new OrganizationIdentityStorageError({
                message: "Organization member count was not returned",
              })
            );
          }

          const members = yield* Effect.all(
            rows.map((row) =>
              decodeStorageBoundary(
                () => mapOrganizationMemberRow(row),
                "Organization member row was invalid"
              )
            )
          );
          const count = yield* decodeStorageBoundary(
            () => decodeCountRow(countRow),
            "Organization member count row was invalid"
          );

          return yield* decodeStorageBoundary(
            () =>
              decodeOrganizationMemberListResponse({
                members,
                total: count.count,
              }),
            "Organization member list response was invalid"
          );
        }).pipe(Effect.catchTag("SqlError", failOrganizationIdentityStorage));
      });

      const getMember = Effect.fn("OrganizationMembersRepository.getMember")(
        function* (
          organizationId: OrganizationIdType,
          memberId: OrganizationMemberIdType
        ) {
          return yield* Effect.gen(function* () {
            const rows = yield* sql<OrganizationMemberRow>`
              select
                member.id,
                member.organization_id,
                member.user_id,
                member.role,
                member.created_at,
                "user".name,
                "user".email
              from member
              join "user"
                on "user".id = member.user_id
              where member.organization_id = ${organizationId}
                and member.id = ${memberId}
              limit 1
            `;
            const [row] = rows;

            if (row === undefined) {
              return yield* Effect.fail(
                new OrganizationIdentityNotFoundError({
                  message: "Organization member was not found",
                })
              );
            }

            return yield* decodeStorageBoundary(
              () => mapOrganizationMemberRow(row),
              "Organization member row was invalid"
            );
          }).pipe(Effect.catchTag("SqlError", failOrganizationIdentityStorage));
        }
      );

      const listInvitations = Effect.fn(
        "OrganizationMembersRepository.listInvitations"
      )(function* (organizationId: OrganizationIdType) {
        return yield* Effect.gen(function* () {
          const rows = yield* sql<OrganizationInvitationRow>`
            select
              id,
              organization_id,
              email,
              role,
              status,
              expires_at,
              created_at
            from invitation
            where organization_id = ${organizationId}
              and status = 'pending'
              and expires_at > now()
            order by expires_at asc, created_at asc, id asc
          `;

          const invitations = yield* Effect.all(
            rows.map((row) =>
              decodeStorageBoundary(
                () => mapOrganizationInvitationRow(row),
                "Organization invitation row was invalid"
              )
            )
          );

          return yield* decodeStorageBoundary(
            () =>
              decodeOrganizationInvitationListResponse({
                invitations,
              }),
            "Organization invitation list response was invalid"
          );
        }).pipe(Effect.catchTag("SqlError", failOrganizationIdentityStorage));
      });

      return { getMember, listInvitations, listMembers };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    OrganizationMembersRepository,
    OrganizationMembersRepository.make
  );
  static readonly Default =
    OrganizationMembersRepository.DefaultWithoutDependencies;
}

export class OrganizationMembersService extends Context.Service<OrganizationMembersService>()(
  "@ceird/domains/identity/OrganizationMembersService",
  {
    make: Effect.gen(function* OrganizationMembersServiceLive() {
      const auth = yield* Authentication;
      const authorization = yield* OrganizationAuthorization;
      const currentActor = yield* CurrentOrganizationActor;
      const repository = yield* OrganizationMembersRepository;

      const getAdministrativeActor = Effect.fn(
        "OrganizationMembersService.getAdministrativeActor"
      )(function* () {
        const actor = yield* currentActor
          .get()
          .pipe(mapOrganizationAccessError);

        yield* authorization
          .ensureCanManageConfiguration(actor)
          .pipe(mapOrganizationAccessError);

        return actor;
      });

      const listMembers = Effect.fn("OrganizationMembersService.listMembers")(
        function* (query: OrganizationMemberListQuery) {
          const actor = yield* getAdministrativeActor();

          return yield* repository.listMembers(actor.organizationId, query);
        }
      );

      const listInvitations = Effect.fn(
        "OrganizationMembersService.listInvitations"
      )(function* () {
        const actor = yield* getAdministrativeActor();

        return yield* repository.listInvitations(actor.organizationId);
      });

      const invite = Effect.fn("OrganizationMembersService.invite")(function* (
        input: InviteOrganizationMemberInput
      ) {
        const actor = yield* getAdministrativeActor();
        const response = yield* dispatchOrganizationAuthRequest(
          auth.handler,
          "/organization/invite-member",
          {
            email: input.email,
            organizationId: actor.organizationId,
            ...(input.resend === undefined ? {} : { resend: input.resend }),
            role: input.role,
          }
        );

        const invitation = yield* decodeStorageBoundary(
          () => mapOrganizationInvitationPayload(response),
          "Organization invitation response was invalid"
        );

        return yield* decodeStorageBoundary(
          () => decodeInviteOrganizationMemberResponse({ invitation }),
          "Organization invite response was invalid"
        );
      });

      const cancelInvitation = Effect.fn(
        "OrganizationMembersService.cancelInvitation"
      )(function* (input: CancelOrganizationInvitationInput) {
        yield* getAdministrativeActor();
        const response = yield* dispatchOrganizationAuthRequest(
          auth.handler,
          "/organization/cancel-invitation",
          {
            invitationId: input.invitationId,
          }
        );

        const invitation = yield* decodeStorageBoundary(
          () => mapOrganizationInvitationPayload(response),
          "Organization invitation response was invalid"
        );

        return yield* decodeStorageBoundary(
          () => decodeCancelOrganizationInvitationResponse({ invitation }),
          "Organization invitation cancel response was invalid"
        );
      });

      const updateMemberRole = Effect.fn(
        "OrganizationMembersService.updateMemberRole"
      )(function* (input: UpdateOrganizationMemberRoleInput) {
        const actor = yield* getAdministrativeActor();

        yield* dispatchOrganizationAuthRequest(
          auth.handler,
          "/organization/update-member-role",
          {
            memberId: input.memberId,
            role: input.role,
          }
        );

        const member = yield* repository.getMember(
          actor.organizationId,
          input.memberId
        );

        return yield* decodeStorageBoundary(
          () => decodeUpdateOrganizationMemberRoleResponse({ member }),
          "Organization member role response was invalid"
        );
      });

      const removeMember = Effect.fn("OrganizationMembersService.removeMember")(
        function* (input: RemoveOrganizationMemberInput) {
          yield* getAdministrativeActor();
          const response = yield* dispatchOrganizationAuthRequest(
            auth.handler,
            "/organization/remove-member",
            {
              memberIdOrEmail: input.memberId,
            }
          );
          const removedMemberId = yield* decodeStorageBoundary(
            () => mapOrganizationMemberRemovalPayload(response),
            "Organization member removal payload was invalid"
          );

          return yield* decodeStorageBoundary(
            () =>
              decodeRemoveOrganizationMemberResponse({
                removedMemberId,
              }),
            "Organization member removal response was invalid"
          );
        }
      );

      return {
        cancelInvitation,
        invite,
        listInvitations,
        listMembers,
        removeMember,
        updateMemberRole,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    OrganizationMembersService,
    OrganizationMembersService.make
  );
  static readonly Default =
    OrganizationMembersService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          Authentication.Default,
          CurrentOrganizationActor.Default,
          OrganizationAuthorization.Default,
          OrganizationMembersRepository.Default
        )
      )
    );
}

export function mapOrganizationMemberRow(row: unknown): OrganizationMember {
  const decodedRow = decodeOrganizationMemberRow(row);

  return decodeOrganizationMember({
    createdAt: decodedRow.created_at.toISOString(),
    email: decodedRow.email,
    id: decodedRow.id,
    name: decodedRow.name,
    organizationId: decodedRow.organization_id,
    role: decodedRow.role,
    userId: decodedRow.user_id,
  });
}

export function mapOrganizationInvitationRow(
  row: unknown
): OrganizationInvitation {
  const decodedRow = decodeOrganizationInvitationRow(row);

  return decodeOrganizationInvitation({
    createdAt: decodedRow.created_at.toISOString(),
    email: decodedRow.email,
    expiresAt: decodedRow.expires_at.toISOString(),
    id: decodedRow.id,
    organizationId: decodedRow.organization_id,
    role: decodedRow.role,
    status: decodedRow.status,
  });
}

export function mapOrganizationInvitationPayload(
  payload: unknown
): OrganizationInvitation {
  const decodedPayload = decodeOrganizationInvitationPayload(payload);

  return decodeOrganizationInvitation({
    createdAt: formatOrganizationInvitationPayloadDate(
      decodedPayload.createdAt
    ),
    email: decodedPayload.email,
    expiresAt: formatOrganizationInvitationPayloadDate(
      decodedPayload.expiresAt
    ),
    id: decodedPayload.id,
    organizationId: decodedPayload.organizationId,
    role: decodedPayload.role,
    status: decodedPayload.status,
  });
}

function formatOrganizationInvitationPayloadDate(
  value: Schema.Schema.Type<typeof OrganizationInvitationPayloadDateSchema>
) {
  return value instanceof Date ? value.toISOString() : value;
}

export function mapOrganizationMemberRemovalPayload(
  payload: unknown
): OrganizationMemberIdType {
  return decodeOrganizationMemberRemovalPayload(payload).member.id;
}

export function makeOrganizationAuthRequestHeaders(input: HeadersInit) {
  const headers = new Headers(input);

  for (const name of SYNTHETIC_ORGANIZATION_AUTH_TRANSPORT_HEADER_NAMES) {
    headers.delete(name);
  }

  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  return headers;
}

function dispatchOrganizationAuthRequest(
  handler: (request: Request) => Promise<Response>,
  path: string,
  payload: Record<string, unknown>
) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(`/api/auth${path}`, request.url);
    const headers = makeOrganizationAuthRequestHeaders(request.headers);

    const response = yield* Effect.tryPromise({
      catch: (cause) =>
        new OrganizationIdentityStorageError({
          cause: formatUnknownCause(cause),
          message: "Organization identity mutation failed",
        }),
      try: () =>
        handler(
          new Request(url, {
            body: JSON.stringify(payload),
            headers,
            method: "POST",
          })
        ),
    });

    const body = yield* readResponseBody(response);

    if (!response.ok) {
      return yield* Effect.fail(mapAuthenticationFailure(response, body));
    }

    return body;
  });
}

function readResponseBody(response: Response) {
  return Effect.tryPromise({
    catch: (cause) =>
      new OrganizationIdentityStorageError({
        cause: formatUnknownCause(cause),
        message: "Organization identity response could not be read",
      }),
    try: async () => {
      const text = await response.text();

      if (text.trim().length === 0) {
        return null;
      }

      const body: unknown = JSON.parse(text);

      return body;
    },
  });
}

function mapAuthenticationFailure(response: Response, body: unknown) {
  const parsedBody = isAuthenticationFailureBody(body) ? body : undefined;
  const message =
    parsedBody?.message ??
    `Organization identity request failed with status ${response.status}.`;
  const code = parsedBody?.code;
  const statusText = parsedBody?.statusText ?? response.statusText;

  if (response.status === 401 || response.status === 403) {
    return new OrganizationIdentityAccessDeniedError({ message });
  }

  if (response.status === 404) {
    return new OrganizationIdentityNotFoundError({ message });
  }

  if (response.status >= 500) {
    return new OrganizationIdentityStorageError({
      message,
    });
  }

  return new OrganizationIdentityRejectedError({
    ...(code === undefined ? {} : { code }),
    message,
    status: response.status,
    ...(statusText === undefined ? {} : { statusText }),
  });
}

function mapOrganizationAccessError<A, R>(
  effect: Effect.Effect<A, OrganizationAccessError, R>
): Effect.Effect<
  A,
  OrganizationIdentityAccessDeniedError | OrganizationIdentityStorageError,
  R
> {
  return effect.pipe(
    Effect.catchTags({
      [ORGANIZATION_ACTOR_STORAGE_ERROR_TAG]: (error) =>
        Effect.fail(
          new OrganizationIdentityStorageError({
            cause: error.cause,
            message: error.message,
          })
        ),
      [ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG]: (error) =>
        failOrganizationIdentityAccessDenied(error.message),
      [ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG]: (error) =>
        failOrganizationIdentityAccessDenied(error.message),
      [ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG]: (error) =>
        failOrganizationIdentityAccessDenied(error.message),
      [ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG]: (error) =>
        failOrganizationIdentityAccessDenied(error.message),
      [ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG]: (error) =>
        failOrganizationIdentityAccessDenied(error.message),
      [ORGANIZATION_SESSION_REQUIRED_ERROR_TAG]: (error) =>
        failOrganizationIdentityAccessDenied(error.message),
    })
  );
}

function failOrganizationIdentityAccessDenied(message: string) {
  return Effect.fail(new OrganizationIdentityAccessDeniedError({ message }));
}

function failOrganizationIdentityStorage(error: unknown) {
  return Effect.fail(
    new OrganizationIdentityStorageError({
      cause: formatUnknownCause(error),
      message: "Organization identity storage operation failed",
    })
  );
}

function decodeStorageBoundary<A>(tryDecode: () => A, message: string) {
  return Effect.try({
    catch: (cause) =>
      new OrganizationIdentityStorageError({
        cause: formatUnknownCause(cause),
        message,
      }),
    try: tryDecode,
  });
}

function formatUnknownCause(cause: unknown) {
  return cause instanceof Error ? cause.message : undefined;
}
