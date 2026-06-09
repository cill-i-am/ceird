import { randomUUID } from "node:crypto";

import {
  ORGANIZATION_ROLES,
  ORGANIZATION_SLUG_MAX_LENGTH,
  RESERVED_ORGANIZATION_SLUGS,
} from "@ceird/identity-core";
import { sql } from "drizzle-orm";
import {
  check,
  bigint,
  boolean,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const organizationRoleValuesSql = sql.raw(
  ORGANIZATION_ROLES.map((value) => `'${value}'`).join(", ")
);
const reservedOrganizationSlugValuesSql = sql.raw(
  RESERVED_ORGANIZATION_SLUGS.map((value) => `'${value}'`).join(", ")
);
export const AUTH_SECURITY_AUDIT_EVENT_TYPES = [
  "oauth_client_registration_succeeded",
  "oauth_client_registration_rejected",
  "oauth_consent_granted",
  "oauth_consent_denied",
  "oauth_consent_revoked",
  "oauth_token_refreshed",
  "oauth_token_revoked",
  "organization_created",
  "organization_updated",
  "organization_active_changed",
  "organization_invitation_created",
  "organization_invitation_resent",
  "organization_invitation_canceled",
  "organization_invitation_accepted",
  "organization_member_role_updated",
  "organization_member_removed",
] as const;
export type AuthSecurityAuditEventType =
  (typeof AUTH_SECURITY_AUDIT_EVENT_TYPES)[number];
export type AuthSecurityAuditEventMetadata = Record<string, unknown>;
const authSecurityAuditEventTypeValuesSql = sql.raw(
  AUTH_SECURITY_AUDIT_EVENT_TYPES.map((value) => `'${value}'`).join(", ")
);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true).notNull(),
  },
  (table) => [
    index("two_factor_secret_idx").on(table.secret),
    uniqueIndex("two_factor_user_id_idx").on(table.userId),
  ]
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_slug_idx").on(table.slug),
    check(
      "organization_slug_format_chk",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(${table.slug}) <= ${ORGANIZATION_SLUG_MAX_LENGTH} and ${table.slug} not in (${reservedOrganizationSlugValuesSql})`
    ),
  ]
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ORGANIZATION_ROLES }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "member_role_chk",
      sql`${table.role} in (${organizationRoleValuesSql})`
    ),
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
    uniqueIndex("member_organization_id_user_id_idx").on(
      table.organizationId,
      table.userId
    ),
  ]
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ORGANIZATION_ROLES }).notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    check(
      "invitation_role_chk",
      sql`${table.role} in (${organizationRoleValuesSql})`
    ),
    index("invitation_organization_id_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ]
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrganizationId: text("active_organization_id").references(
      () => organization.id,
      { onDelete: "set null" }
    ),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_active_organization_id_idx").on(table.activeOrganizationId),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_id_idx").on(
      table.providerId,
      table.accountId
    ),
  ]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("rate_limit_key_idx").on(table.key),
    index("rate_limit_last_request_id_idx").on(table.lastRequest, table.id),
  ]
);

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at"),
});

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    userId: text("user_id").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    public: boolean("public"),
    type: text("type"),
    requirePKCE: boolean("require_pkce"),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [index("oauth_client_user_id_idx").on(table.userId)]
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    referenceId: text("reference_id"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revoked: timestamp("revoked"),
    authTime: timestamp("auth_time"),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("oauth_refresh_token_client_id_idx").on(table.clientId),
    index("oauth_refresh_token_session_id_idx").on(table.sessionId),
    index("oauth_refresh_token_user_id_idx").on(table.userId),
    index("oauth_refresh_token_user_client_reference_active_idx")
      .on(table.userId, table.clientId, table.referenceId, table.expiresAt)
      .where(sql`${table.revoked} is null`),
  ]
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id),
    referenceId: text("reference_id"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("oauth_access_token_client_id_idx").on(table.clientId),
    index("oauth_access_token_session_id_idx").on(table.sessionId),
    index("oauth_access_token_user_id_idx").on(table.userId),
    index("oauth_access_token_refresh_id_idx").on(table.refreshId),
    index("oauth_access_token_user_client_reference_expires_idx").on(
      table.userId,
      table.clientId,
      table.referenceId,
      table.expiresAt
    ),
  ]
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    userId: text("user_id").references(() => user.id),
    referenceId: text("reference_id"),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_consent_client_id_idx").on(table.clientId),
    index("oauth_consent_user_id_idx").on(table.userId),
    index("oauth_consent_user_client_reference_idx").on(
      table.userId,
      table.clientId,
      table.referenceId
    ),
    uniqueIndex("oauth_consent_user_client_account_unique_idx")
      .on(table.userId, table.clientId)
      .where(sql`${table.userId} is not null and ${table.referenceId} is null`),
    uniqueIndex("oauth_consent_user_client_reference_unique_idx")
      .on(table.userId, table.clientId, table.referenceId)
      .where(
        sql`${table.userId} is not null and ${table.referenceId} is not null`
      ),
  ]
);

export const authSecurityAuditEvent = pgTable(
  "auth_security_audit_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    eventType: text("event_type", {
      enum: AUTH_SECURITY_AUDIT_EVENT_TYPES,
    }).notNull(),
    actorUserId: text("actor_user_id"),
    organizationId: text("organization_id"),
    sessionId: text("session_id"),
    oauthClientId: text("oauth_client_id"),
    scopes: text("scopes").array(),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata")
      .$type<AuthSecurityAuditEventMetadata>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "auth_security_audit_event_type_chk",
      sql`${table.eventType} in (${authSecurityAuditEventTypeValuesSql})`
    ),
    index("auth_security_audit_event_created_at_idx").on(
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("auth_security_audit_event_type_created_at_idx").on(
      table.eventType,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("auth_security_audit_event_actor_created_at_idx").on(
      table.actorUserId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("auth_security_audit_event_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("auth_security_audit_event_session_created_at_idx").on(
      table.sessionId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("auth_security_audit_event_oauth_client_created_at_idx").on(
      table.oauthClientId,
      table.createdAt.desc(),
      table.id.desc()
    ),
  ]
);

export const authSchema = {
  user,
  organization,
  member,
  invitation,
  session,
  account,
  verification,
  twoFactor,
  rateLimit,
  jwks,
  oauthClient,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  authSecurityAuditEvent,
};
