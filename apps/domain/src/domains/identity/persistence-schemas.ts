import {
  ConnectedAppGrantActiveTokenCountSchema,
  ConnectedAppGrantId,
  ConnectedAppScopeSchema,
  OAuthClientId,
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES,
  OrganizationId,
  OrganizationRole,
  OrganizationSecurityActivityEventId,
  UserId,
} from "@ceird/identity-core";
import { Effect, Schema } from "effect";

import { AUTH_SECURITY_AUDIT_EVENT_TYPES } from "./authentication/schema.js";

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

export const AuthSecurityAuditEventTypeSchema = Schema.Literals(
  AUTH_SECURITY_AUDIT_EVENT_TYPES
);
export type AuthSecurityAuditEventType = Schema.Schema.Type<
  typeof AuthSecurityAuditEventTypeSchema
>;

export const OrganizationSecurityActivityCursorTimestampSchema =
  Schema.String.pipe(
    Schema.refine(
      (value): value is string => isUtcMicrosecondTimestamp(value),
      {
        message: "Expected a UTC timestamp cursor",
      }
    ),
    Schema.brand(
      "@ceird/domains/identity/OrganizationSecurityActivityCursorTimestamp"
    )
  );
export type OrganizationSecurityActivityCursorTimestamp = Schema.Schema.Type<
  typeof OrganizationSecurityActivityCursorTimestampSchema
>;

export const OrganizationSecurityActivityCursorStateSchema = Schema.Struct({
  createdAt: OrganizationSecurityActivityCursorTimestampSchema,
  id: OrganizationSecurityActivityEventId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityActivityCursorState = Schema.Schema.Type<
  typeof OrganizationSecurityActivityCursorStateSchema
>;

const AuthSecurityAuditMetadataSourceSchema = Schema.Literals([
  "better_auth_organization_endpoint",
  "better_auth_organization_plugin",
] as const);

const AuthSecurityAuditMetadataBaseFields = {
  outcome: Schema.Literal("succeeded"),
  source: AuthSecurityAuditMetadataSourceSchema,
};
const OrganizationMemberId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/domains/identity/OrganizationMemberId")
);
const RequiredOrganizationAuditWriteBaseFields = {
  actorUserId: UserId,
  organizationId: OrganizationId,
};
const NullableOrganizationAuditTextDbColumn = Schema.NullOr(
  Schema.NonEmptyString
).pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed(null)));
const OrganizationAuditOptionalDbColumns = {
  oauthClientId: Schema.Null.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed(null))
  ),
  scopes: Schema.Null.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed(null))
  ),
  sessionId: NullableOrganizationAuditTextDbColumn,
  sourceIp: NullableOrganizationAuditTextDbColumn,
  userAgent: NullableOrganizationAuditTextDbColumn,
};

export const MaskedInvitationEmailSchema = Schema.String.pipe(
  Schema.refine((value): value is string => isMaskedInvitationEmail(value), {
    message: "Expected a masked invitation email",
  }),
  Schema.brand("@ceird/domains/identity/MaskedInvitationEmail")
);
export type MaskedInvitationEmail = Schema.Schema.Type<
  typeof MaskedInvitationEmailSchema
>;

export const OrganizationUpdatedAuditMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  updatedFields: Schema.Array(Schema.NonEmptyString),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationUpdatedAuditMetadata = Schema.Schema.Type<
  typeof OrganizationUpdatedAuditMetadataSchema
>;

export const OrganizationInvitationAuditMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  invitationEmailMasked: Schema.NullOr(MaskedInvitationEmailSchema),
  role: Schema.NullOr(OrganizationRole),
  targetUserId: Schema.NullOr(UserId),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationInvitationAuditMetadata = Schema.Schema.Type<
  typeof OrganizationInvitationAuditMetadataSchema
>;

export const OrganizationInvitationAcceptedAuditMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  invitationEmailMasked: Schema.NullOr(MaskedInvitationEmailSchema),
  memberId: Schema.NullOr(Schema.NonEmptyString),
  role: Schema.NullOr(OrganizationRole),
  targetUserId: Schema.NullOr(UserId),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationInvitationAcceptedAuditMetadata = Schema.Schema.Type<
  typeof OrganizationInvitationAcceptedAuditMetadataSchema
>;

export const OrganizationMemberAuditMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  memberId: Schema.NullOr(Schema.NonEmptyString),
  previousRole: Schema.NullOr(OrganizationRole),
  role: Schema.NullOr(OrganizationRole),
  targetUserId: Schema.NullOr(UserId),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationMemberAuditMetadata = Schema.Schema.Type<
  typeof OrganizationMemberAuditMetadataSchema
>;

export const OrganizationActiveChangedAuditMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  activeOrganizationId: Schema.NullOr(OrganizationId),
  previousOrganizationId: Schema.NullOr(OrganizationId),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationActiveChangedAuditMetadata = Schema.Schema.Type<
  typeof OrganizationActiveChangedAuditMetadataSchema
>;

const OrganizationCreatedAuditWriteMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  memberId: OrganizationMemberId,
  previousRole: Schema.Null.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed(null))
  ),
  role: OrganizationRole,
  targetUserId: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const OrganizationUpdatedAuditWriteMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  updatedFields: Schema.NonEmptyArray(Schema.NonEmptyString),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const OrganizationInvitationAuditWriteMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  invitationEmailMasked: MaskedInvitationEmailSchema,
  role: OrganizationRole,
  targetUserId: Schema.Null.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed(null))
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const OrganizationInvitationAcceptedAuditWriteMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  invitationEmailMasked: MaskedInvitationEmailSchema,
  memberId: OrganizationMemberId,
  role: OrganizationRole,
  targetUserId: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const OrganizationMemberRoleUpdatedAuditWriteMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  memberId: OrganizationMemberId,
  previousRole: OrganizationRole,
  role: OrganizationRole,
  targetUserId: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const OrganizationMemberRemovedAuditWriteMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  memberId: OrganizationMemberId,
  previousRole: Schema.Null.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed(null))
  ),
  role: OrganizationRole,
  targetUserId: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const OrganizationActiveChangedAuditWriteMetadataSchema = Schema.Struct({
  ...AuthSecurityAuditMetadataBaseFields,
  activeOrganizationId: Schema.NullOr(OrganizationId),
  previousOrganizationId: Schema.NullOr(OrganizationId),
})
  .pipe(
    Schema.refine(
      (value): value is typeof value =>
        value.activeOrganizationId !== null ||
        value.previousOrganizationId !== null,
      {
        message:
          "Expected an active or previous organization id for active organization changes",
      }
    )
  )
  .annotate({
    parseOptions: { onExcessProperty: "error" },
  });

export const OrganizationSecurityAuditWriteSchema = Schema.Union([
  Schema.Struct({
    ...RequiredOrganizationAuditWriteBaseFields,
    ...OrganizationAuditOptionalDbColumns,
    eventType: Schema.Literal("organization_created"),
    metadata: OrganizationCreatedAuditWriteMetadataSchema,
  }),
  Schema.Struct({
    ...RequiredOrganizationAuditWriteBaseFields,
    ...OrganizationAuditOptionalDbColumns,
    eventType: Schema.Literal("organization_updated"),
    metadata: OrganizationUpdatedAuditWriteMetadataSchema,
  }),
  Schema.Struct({
    ...RequiredOrganizationAuditWriteBaseFields,
    ...OrganizationAuditOptionalDbColumns,
    eventType: Schema.Literal("organization_active_changed"),
    metadata: OrganizationActiveChangedAuditWriteMetadataSchema,
  }),
  Schema.Struct({
    ...RequiredOrganizationAuditWriteBaseFields,
    ...OrganizationAuditOptionalDbColumns,
    eventType: Schema.Literals([
      "organization_invitation_created",
      "organization_invitation_resent",
      "organization_invitation_canceled",
    ] as const),
    metadata: OrganizationInvitationAuditWriteMetadataSchema,
  }),
  Schema.Struct({
    ...RequiredOrganizationAuditWriteBaseFields,
    ...OrganizationAuditOptionalDbColumns,
    eventType: Schema.Literal("organization_invitation_accepted"),
    metadata: OrganizationInvitationAcceptedAuditWriteMetadataSchema,
  }),
  Schema.Struct({
    ...RequiredOrganizationAuditWriteBaseFields,
    ...OrganizationAuditOptionalDbColumns,
    eventType: Schema.Literal("organization_member_role_updated"),
    metadata: OrganizationMemberRoleUpdatedAuditWriteMetadataSchema,
  }),
  Schema.Struct({
    ...RequiredOrganizationAuditWriteBaseFields,
    ...OrganizationAuditOptionalDbColumns,
    eventType: Schema.Literal("organization_member_removed"),
    metadata: OrganizationMemberRemovedAuditWriteMetadataSchema,
  }),
]).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityAuditWrite = Schema.Schema.Type<
  typeof OrganizationSecurityAuditWriteSchema
>;

const OrganizationSecurityActivityMemberTargetFields = {
  target_email: NullableNonEmptyString,
  target_member_id: Schema.NullOr(Schema.NonEmptyString),
  target_name: NullableNonEmptyString,
  target_user_id: Schema.NullOr(UserId),
};

const OrganizationSecurityActivityBaseRowFields = {
  actor_email: NullableNonEmptyString,
  actor_name: NullableNonEmptyString,
  actor_user_id: Schema.NullOr(UserId),
  created_at: Schema.DateValid,
  created_at_cursor: OrganizationSecurityActivityCursorTimestampSchema,
  id: OrganizationSecurityActivityEventId,
  organization_id: OrganizationId,
};

const OrganizationSecurityActivityOrganizationCreatedRowSchema = Schema.Struct({
  ...OrganizationSecurityActivityBaseRowFields,
  event_type: Schema.Literal("organization_created"),
  metadata: OrganizationMemberAuditMetadataSchema,
  organization_name: Schema.NonEmptyString,
  target_email: Schema.Null,
  target_member_id: Schema.Null,
  target_name: Schema.Null,
  target_user_id: Schema.Null,
});

const OrganizationSecurityActivityOrganizationUpdatedRowSchema = Schema.Struct({
  ...OrganizationSecurityActivityBaseRowFields,
  event_type: Schema.Literal("organization_updated"),
  metadata: OrganizationUpdatedAuditMetadataSchema,
  organization_name: Schema.NonEmptyString,
  target_email: Schema.Null,
  target_member_id: Schema.Null,
  target_name: Schema.Null,
  target_user_id: Schema.Null,
});

const OrganizationSecurityActivityInvitationRowSchema = Schema.Struct({
  ...OrganizationSecurityActivityBaseRowFields,
  event_type: Schema.Literals([
    "organization_invitation_created",
    "organization_invitation_resent",
    "organization_invitation_canceled",
  ] as const),
  metadata: OrganizationInvitationAuditMetadataSchema,
  organization_name: Schema.NonEmptyString,
  target_email: Schema.Null,
  target_member_id: Schema.Null,
  target_name: Schema.Null,
  target_user_id: Schema.Null,
});

const OrganizationSecurityActivityInvitationAcceptedRowSchema = Schema.Struct({
  ...OrganizationSecurityActivityBaseRowFields,
  event_type: Schema.Literal("organization_invitation_accepted"),
  metadata: OrganizationInvitationAcceptedAuditMetadataSchema,
  organization_name: Schema.NonEmptyString,
  ...OrganizationSecurityActivityMemberTargetFields,
});

const OrganizationSecurityActivityMemberRowSchema = Schema.Struct({
  ...OrganizationSecurityActivityBaseRowFields,
  event_type: Schema.Literals([
    "organization_member_role_updated",
    "organization_member_removed",
  ] as const),
  metadata: OrganizationMemberAuditMetadataSchema,
  organization_name: Schema.NonEmptyString,
  ...OrganizationSecurityActivityMemberTargetFields,
});

export const OrganizationSecurityActivityRowSchema = Schema.Union([
  OrganizationSecurityActivityOrganizationCreatedRowSchema,
  OrganizationSecurityActivityOrganizationUpdatedRowSchema,
  OrganizationSecurityActivityInvitationRowSchema,
  OrganizationSecurityActivityInvitationAcceptedRowSchema,
  OrganizationSecurityActivityMemberRowSchema,
]).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityActivityRow = Schema.Schema.Type<
  typeof OrganizationSecurityActivityRowSchema
>;

export const OrganizationSecurityActivityRowsSchema = Schema.Array(
  OrganizationSecurityActivityRowSchema
);
export type OrganizationSecurityActivityRows = Schema.Schema.Type<
  typeof OrganizationSecurityActivityRowsSchema
>;

export const OrganizationSecurityActivityVisibleEventTypeSchema =
  Schema.Literals(ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES);
export type OrganizationSecurityActivityVisibleEventType = Schema.Schema.Type<
  typeof OrganizationSecurityActivityVisibleEventTypeSchema
>;

function isUtcMicrosecondTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/u.exec(value);

  if (match === null) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function isMaskedInvitationEmail(value: string): boolean {
  return (
    value === "***" ||
    /^[^@\s]\*\*\*@[^@\s.]\*\*\*(?:\.[^@\s.]+)*$/u.test(value)
  );
}
