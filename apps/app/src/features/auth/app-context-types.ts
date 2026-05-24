import {
  OrganizationId,
  OrganizationRole,
  OrganizationSummaryListSchema,
} from "@ceird/identity-core";
import { Schema } from "effect";

const NullableString = Schema.NullOr(Schema.String);
const NullableOrganizationId = Schema.NullOr(OrganizationId);

export const ServerAuthSessionSchema = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
    userId: Schema.String,
    expiresAt: Schema.String,
    token: Schema.NonEmptyString,
    ipAddress: Schema.optional(NullableString),
    userAgent: Schema.optional(NullableString),
    activeOrganizationId: Schema.optional(NullableOrganizationId),
  }),
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(NullableString),
    emailVerified: Schema.Boolean,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});

const appAuthContextSnapshotFields = {
  session: Schema.NullOr(ServerAuthSessionSchema),
  activeOrganizationId: NullableOrganizationId,
  currentOrganizationRole: Schema.optional(OrganizationRole),
  organizations: Schema.optional(OrganizationSummaryListSchema),
};

export const AppAuthContextSnapshotSchema = Schema.Struct(
  appAuthContextSnapshotFields
);

export const AuthenticatedAppContextSnapshotSchema = Schema.Struct({
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

export function decodeServerAuthSession(input: unknown): ServerAuthSession {
  return Schema.decodeUnknownSync(ServerAuthSessionSchema)(input);
}

export function decodeAppAuthContextSnapshot(
  input: unknown
): AppAuthContextSnapshot {
  return Schema.decodeUnknownSync(AppAuthContextSnapshotSchema)(input);
}

export function decodeAuthenticatedAppContextSnapshot(
  input: unknown
): AuthenticatedAppContextSnapshot {
  return Schema.decodeUnknownSync(AuthenticatedAppContextSnapshotSchema)(input);
}
