import {
  ConnectedAppGrantActiveTokenCountSchema,
  ConnectedAppGrantId,
  ConnectedAppScopeSchema,
  OAuthClientId,
  OrganizationId,
  UserId,
} from "@ceird/identity-core";
import { Schema } from "effect";

const NullableNonEmptyString = Schema.NullOr(Schema.NonEmptyString);
const NullableDate = Schema.NullOr(Schema.DateValid);
const ConnectedAppScopesSchema = Schema.Array(ConnectedAppScopeSchema);

const ConnectedAppGrantListRowFields = {
  active_access_token_count: ConnectedAppGrantActiveTokenCountSchema,
  active_refresh_token_count: ConnectedAppGrantActiveTokenCountSchema,
  client_id: OAuthClientId,
  client_name: NullableNonEmptyString,
  client_uri: NullableNonEmptyString,
  consent_created_at: Schema.DateValid,
  consent_id: ConnectedAppGrantId,
  consent_updated_at: Schema.DateValid,
  latest_access_token_expires_at: NullableDate,
  latest_refresh_token_expires_at: NullableDate,
  policy_uri: NullableNonEmptyString,
  redirect_uris: Schema.Array(Schema.NonEmptyString),
  scopes: ConnectedAppScopesSchema,
  tos_uri: NullableNonEmptyString,
};

export const ConnectedAppGrantAccountListRowSchema = Schema.Struct({
  ...ConnectedAppGrantListRowFields,
  organization_id: Schema.Null,
  organization_name: Schema.Null,
  reference_id: Schema.Null,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const ConnectedAppGrantOrganizationListRowSchema = Schema.Struct({
  ...ConnectedAppGrantListRowFields,
  organization_id: OrganizationId,
  organization_name: Schema.NonEmptyString,
  reference_id: OrganizationId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const ConnectedAppGrantListRowSchema = Schema.Union([
  ConnectedAppGrantAccountListRowSchema,
  ConnectedAppGrantOrganizationListRowSchema,
]);
export type ConnectedAppGrantListRow = Schema.Schema.Type<
  typeof ConnectedAppGrantListRowSchema
>;

export const ConnectedAppGrantListRowsSchema = Schema.Array(
  ConnectedAppGrantListRowSchema
);
export type ConnectedAppGrantListRows = Schema.Schema.Type<
  typeof ConnectedAppGrantListRowsSchema
>;

export const ConnectedAppGrantDisconnectRowSchema = Schema.Struct({
  client_id: OAuthClientId,
  id: ConnectedAppGrantId,
  reference_id: Schema.NullOr(OrganizationId),
  scopes: ConnectedAppScopesSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ConnectedAppGrantDisconnectRow = Schema.Schema.Type<
  typeof ConnectedAppGrantDisconnectRowSchema
>;

export const OAuthConsentRevokedAuditWriteSchema = Schema.Struct({
  actorUserId: UserId,
  eventType: Schema.Literal("oauth_consent_revoked"),
  metadata: Schema.Struct({
    consentId: ConnectedAppGrantId,
    referenceId: Schema.NullOr(OrganizationId),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  oauthClientId: OAuthClientId,
  organizationId: Schema.NullOr(OrganizationId),
  scopes: ConnectedAppScopesSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OAuthConsentRevokedAuditWrite = Schema.Schema.Type<
  typeof OAuthConsentRevokedAuditWriteSchema
>;
