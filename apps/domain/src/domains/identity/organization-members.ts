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
  OrganizationIdentityRateLimitError,
  OrganizationIdentityRejectedError,
  OrganizationIdentityStorageError,
  OrganizationId,
  OrganizationInvitationNotFoundError,
  OrganizationInvitationListResponseSchema,
  OrganizationInvitationSchema,
  OrganizationInvitationStatus,
  OrganizationMemberNotFoundError,
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
  OrganizationIdentityMutationOperation,
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
                new OrganizationMemberNotFoundError({
                  memberId,
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

      const getInvitation = Effect.fn(
        "OrganizationMembersRepository.getInvitation"
      )(function* (
        organizationId: OrganizationIdType,
        invitationId: InvitationId
      ) {
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
              and id = ${invitationId}
            limit 1
          `;
          const [row] = rows;

          if (row === undefined) {
            return yield* Effect.fail(
              new OrganizationInvitationNotFoundError({
                invitationId,
                message: "Organization invitation was not found",
              })
            );
          }

          return yield* decodeStorageBoundary(
            () => mapOrganizationInvitationRow(row),
            "Organization invitation row was invalid"
          );
        }).pipe(Effect.catchTag("SqlError", failOrganizationIdentityStorage));
      });

      return { getInvitation, getMember, listInvitations, listMembers };
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
          },
          (failureResponse, body) =>
            mapAuthenticationFailure(
              failureResponse,
              body,
              "inviteOrganizationMember",
              (message) => new OrganizationIdentityNotFoundError({ message })
            )
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
        const actor = yield* getAdministrativeActor();

        yield* repository.getInvitation(
          actor.organizationId,
          input.invitationId
        );
        const response = yield* dispatchOrganizationAuthRequest(
          auth.handler,
          "/organization/cancel-invitation",
          {
            invitationId: input.invitationId,
          },
          (failureResponse, body) =>
            mapAuthenticationFailure(
              failureResponse,
              body,
              "cancelOrganizationInvitation",
              (message) =>
                new OrganizationInvitationNotFoundError({
                  invitationId: input.invitationId,
                  message,
                })
            )
        );

        const invitation = yield* decodeStorageBoundary(
          () => mapOrganizationInvitationPayload(response),
          "Organization invitation response was invalid"
        );

        if (invitation.organizationId !== actor.organizationId) {
          return yield* Effect.fail(
            new OrganizationIdentityStorageError({
              message:
                "Organization invitation cancel response belonged to a different organization",
            })
          );
        }

        return yield* decodeStorageBoundary(
          () => decodeCancelOrganizationInvitationResponse({ invitation }),
          "Organization invitation cancel response was invalid"
        );
      });

      const updateMemberRole = Effect.fn(
        "OrganizationMembersService.updateMemberRole"
      )(function* (input: UpdateOrganizationMemberRoleInput) {
        const actor = yield* getAdministrativeActor();

        yield* repository.getMember(actor.organizationId, input.memberId);
        yield* dispatchOrganizationAuthRequest(
          auth.handler,
          "/organization/update-member-role",
          {
            memberId: input.memberId,
            role: input.role,
          },
          (failureResponse, body) =>
            mapAuthenticationFailure(
              failureResponse,
              body,
              "updateOrganizationMemberRole",
              (message) =>
                new OrganizationMemberNotFoundError({
                  memberId: input.memberId,
                  message,
                })
            )
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
          const actor = yield* getAdministrativeActor();

          yield* repository.getMember(actor.organizationId, input.memberId);
          const response = yield* dispatchOrganizationAuthRequest(
            auth.handler,
            "/organization/remove-member",
            {
              memberIdOrEmail: input.memberId,
            },
            (failureResponse, body) =>
              mapAuthenticationFailure(
                failureResponse,
                body,
                "removeOrganizationMember",
                (message) =>
                  new OrganizationMemberNotFoundError({
                    memberId: input.memberId,
                    message,
                  })
              )
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
  const incomingHeaders = new Headers(input);
  const headers = new Headers();

  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  setSyntheticOrganizationAuthHeader(
    headers,
    "authorization",
    incomingHeaders.get("authorization")
  );
  setSyntheticOrganizationAuthHeader(
    headers,
    "cookie",
    incomingHeaders.get("cookie")
  );
  setSyntheticOrganizationAuthHeader(
    headers,
    "origin",
    incomingHeaders.get("origin")
  );
  setSyntheticOrganizationAuthHeader(
    headers,
    "user-agent",
    incomingHeaders.get("user-agent")
  );
  setSyntheticOrganizationAuthHeader(
    headers,
    "cf-connecting-ip",
    readNonEmptyHeader(incomingHeaders, "cf-connecting-ip")
  );
  setSyntheticOrganizationAuthHeader(
    headers,
    "x-forwarded-for",
    readNonEmptyHeader(incomingHeaders, "x-forwarded-for")
  );

  return headers;
}

function setSyntheticOrganizationAuthHeader(
  headers: Headers,
  name: string,
  value: string | null
) {
  if (value !== null && value.length > 0) {
    headers.set(name, value);
  }
}

function readNonEmptyHeader(headers: Headers, name: string) {
  const value = headers.get(name);

  return value === null || value.length === 0 ? null : value;
}

function dispatchOrganizationAuthRequest<AuthenticationFailure>(
  handler: (request: Request) => Promise<Response>,
  path: string,
  payload: Record<string, unknown>,
  mapFailure: (response: Response, body: unknown) => AuthenticationFailure
) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = yield* makeOrganizationAuthRequestUrl(request, path);
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
      return yield* Effect.fail(mapFailure(response, body));
    }

    return body;
  });
}

function makeOrganizationAuthRequestUrl(
  request: HttpServerRequest.HttpServerRequest,
  path: string
) {
  return Effect.try({
    catch: (cause) =>
      new OrganizationIdentityStorageError({
        cause: formatUnknownCause(cause),
        message: "Organization identity request URL was invalid",
      }),
    try: () => {
      const baseUrl = resolveOrganizationAuthRequestBaseUrl(request);

      return new URL(`/api/auth${path}`, baseUrl);
    },
  });
}

function resolveOrganizationAuthRequestBaseUrl(
  request: HttpServerRequest.HttpServerRequest
) {
  const headers = new Headers(request.headers);
  const originalUrl = parseAbsoluteHttpUrl(request.originalUrl);

  if (originalUrl !== null) {
    return originalUrl;
  }

  const requestUrl = parseAbsoluteHttpUrl(request.url);

  if (requestUrl !== null) {
    return requestUrl;
  }

  const host =
    readNonEmptyHeader(headers, "x-forwarded-host") ??
    readNonEmptyHeader(headers, "host");

  if (host === null) {
    throw new TypeError("Organization identity request host was unavailable.");
  }

  const protocol = resolveOrganizationAuthRequestProtocol(headers);

  if (protocol === null) {
    throw new TypeError(
      "Organization identity request protocol was unavailable."
    );
  }

  return new URL(`${protocol}//${host}`);
}

function resolveOrganizationAuthRequestProtocol(headers: Headers) {
  const forwardedProtocol = parseHttpProtocol(
    readNonEmptyHeader(headers, "x-forwarded-proto")
  );

  if (forwardedProtocol !== null) {
    return forwardedProtocol;
  }

  return (
    parseAbsoluteHttpUrl(readNonEmptyHeader(headers, "origin"))?.protocol ??
    null
  );
}

function parseAbsoluteHttpUrl(value: string | null | undefined) {
  if (value === null || value === undefined || value.length === 0) {
    return null;
  }

  if (!isAbsoluteHttpUrlInput(value)) {
    return null;
  }

  const url = new URL(value);

  return isHttpProtocol(url.protocol) ? url : null;
}

function isAbsoluteHttpUrlInput(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function parseHttpProtocol(value: string | null) {
  if (value === null) {
    return null;
  }

  const protocol = value.endsWith(":") ? value : `${value}:`;

  return isHttpProtocol(protocol) ? protocol : null;
}

function isHttpProtocol(protocol: string) {
  return protocol === "http:" || protocol === "https:";
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

function mapAuthenticationFailure<NotFoundError>(
  response: Response,
  body: unknown,
  operation: OrganizationIdentityMutationOperation,
  makeNotFoundError: (message: string) => NotFoundError
) {
  const parsedBody = isAuthenticationFailureBody(body) ? body : undefined;
  const message =
    parsedBody?.message ??
    `Organization identity request failed with status ${response.status}.`;
  const code = parsedBody?.code;
  const statusText = parsedBody?.statusText ?? response.statusText;

  if (response.status === 401 || response.status === 403) {
    return new OrganizationIdentityAccessDeniedError({ message });
  }

  if (response.status === 429) {
    return new OrganizationIdentityRateLimitError({
      ...(code === undefined ? {} : { code }),
      message,
      operation,
      ...(statusText === undefined ? {} : { statusText }),
    });
  }

  if (response.status === 404) {
    return makeNotFoundError(message);
  }

  if (response.status >= 500) {
    return new OrganizationIdentityStorageError({
      message,
    });
  }

  return new OrganizationIdentityRejectedError({
    ...(code === undefined ? {} : { code }),
    message,
    operation,
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
