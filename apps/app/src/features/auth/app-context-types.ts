import {
  IsoDateTimeString,
  OrganizationId,
  OrganizationRole,
  OrganizationSummaryListSchema,
  SessionId,
  UserId,
} from "@ceird/identity-core";
import { Schema } from "effect";

const NullableString = Schema.NullOr(Schema.String);
const NullableOrganizationId = Schema.NullOr(OrganizationId);

const AppAuthSessionFields = {
  id: SessionId,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
  userId: UserId,
  expiresAt: IsoDateTimeString,
  ipAddress: Schema.optional(NullableString),
  userAgent: Schema.optional(NullableString),
  activeOrganizationId: Schema.optional(NullableOrganizationId),
};

const AppAuthUserFields = {
  id: UserId,
  name: Schema.String,
  email: Schema.String,
  image: Schema.optional(NullableString),
  emailVerified: Schema.Boolean,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
};

const BetterAuthServerSessionSchema = Schema.Struct({
  session: Schema.Struct({
    ...AppAuthSessionFields,
    token: Schema.NonEmptyString,
  }),
  user: Schema.Struct(AppAuthUserFields),
});

export const ServerAuthSessionSchema = Schema.Struct({
  session: Schema.Struct(AppAuthSessionFields),
  user: Schema.Struct(AppAuthUserFields),
});

const appAuthContextSnapshotFields = {
  session: Schema.NullOr(ServerAuthSessionSchema),
  activeOrganizationId: NullableOrganizationId,
  currentOrganizationRole: Schema.optional(OrganizationRole),
  organizations: Schema.optional(OrganizationSummaryListSchema),
};

const AppAuthContextSnapshotSchema = Schema.Struct(
  appAuthContextSnapshotFields
);

const AuthenticatedAppContextSnapshotSchema = Schema.Struct({
  ...appAuthContextSnapshotFields,
  session: ServerAuthSessionSchema,
});

export type ServerAuthSession = Schema.Schema.Type<
  typeof ServerAuthSessionSchema
>;

export type AppAuthContextSnapshot = Schema.Schema.Type<
  typeof AppAuthContextSnapshotSchema
>;

export type AuthenticatedAppContextSnapshot = Schema.Schema.Type<
  typeof AuthenticatedAppContextSnapshotSchema
>;

type ServerAuthSessionWithOptionalToken = ServerAuthSession & {
  readonly session: ServerAuthSession["session"] & {
    readonly token?: unknown;
  };
};

export function decodeServerAuthSession(input: unknown): ServerAuthSession {
  return stripServerAuthSessionToken(
    Schema.decodeUnknownSync(BetterAuthServerSessionSchema)(input)
  );
}

export function decodeAppAuthContextSnapshot(
  input: unknown
): AppAuthContextSnapshot {
  return stripAppAuthContextSnapshotSessionToken(
    Schema.decodeUnknownSync(AppAuthContextSnapshotSchema)(input)
  );
}

export function decodeAuthenticatedAppContextSnapshot(
  input: unknown
): AuthenticatedAppContextSnapshot {
  const snapshot = Schema.decodeUnknownSync(
    AuthenticatedAppContextSnapshotSchema
  )(input);

  return {
    ...snapshot,
    session: stripOptionalServerAuthSessionToken(snapshot.session),
  };
}

function stripServerAuthSessionToken(
  input: Schema.Schema.Type<typeof BetterAuthServerSessionSchema>
): ServerAuthSession {
  return stripOptionalServerAuthSessionToken(input);
}

function stripAppAuthContextSnapshotSessionToken(
  input: AppAuthContextSnapshot
): AppAuthContextSnapshot {
  if (!input.session) {
    return input;
  }

  return {
    ...input,
    session: stripOptionalServerAuthSessionToken(input.session),
  };
}

function stripOptionalServerAuthSessionToken(
  input: ServerAuthSessionWithOptionalToken
): ServerAuthSession {
  const { token: _token, ...session } = input.session;

  return {
    session,
    user: input.user,
  };
}
