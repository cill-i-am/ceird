import { tsImport } from "tsx/esm/api";

const schemaExportNames = [
  "account",
  "activitySchema",
  "agentActionRun",
  "agentsSchema",
  "agentThread",
  "authSecurityAuditEvent",
  "authSchema",
  "comment",
  "commentsSchema",
  "contact",
  "databaseSchema",
  "identityPreferencesSchema",
  "invitation",
  "jobsSchema",
  "jwks",
  "label",
  "labelsSchema",
  "member",
  "oauthAccessToken",
  "oauthClient",
  "oauthConsent",
  "oauthRefreshToken",
  "organization",
  "productActivityActor",
  "productActivityActorSource",
  "rateLimit",
  "session",
  "site",
  "siteComment",
  "siteContact",
  "siteLabel",
  "sitesSchema",
  "twoFactor",
  "user",
  "userPreferences",
  "verification",
  "workItem",
  "workItemActivity",
  "workItemCollaborator",
  "workItemComment",
  "workItemLabel",
  "workItemVisit",
] as const;

type SchemaExportName = (typeof schemaExportNames)[number];
type DomainDatabaseSchemaModule = Partial<Record<SchemaExportName, unknown>>;

const domainSchemaModule = (await tsImport(
  "../apps/domain/src/platform/database/schema.ts",
  {
    parentURL: import.meta.url,
    tsconfig: "./apps/domain/tsconfig.json",
  }
)) as DomainDatabaseSchemaModule;

function requireSchemaExport(name: SchemaExportName) {
  const value = domainSchemaModule[name];

  if (value === undefined) {
    throw new Error(`Domain database schema export '${name}' is missing`);
  }

  return value;
}

export const account = requireSchemaExport("account");
export const activitySchema = requireSchemaExport("activitySchema");
export const agentActionRun = requireSchemaExport("agentActionRun");
export const agentsSchema = requireSchemaExport("agentsSchema");
export const agentThread = requireSchemaExport("agentThread");
export const authSecurityAuditEvent = requireSchemaExport(
  "authSecurityAuditEvent"
);
export const authSchema = requireSchemaExport("authSchema");
export const comment = requireSchemaExport("comment");
export const commentsSchema = requireSchemaExport("commentsSchema");
export const contact = requireSchemaExport("contact");
export const databaseSchema = requireSchemaExport("databaseSchema");
export const identityPreferencesSchema = requireSchemaExport(
  "identityPreferencesSchema"
);
export const invitation = requireSchemaExport("invitation");
export const jobsSchema = requireSchemaExport("jobsSchema");
export const jwks = requireSchemaExport("jwks");
export const label = requireSchemaExport("label");
export const labelsSchema = requireSchemaExport("labelsSchema");
export const member = requireSchemaExport("member");
export const oauthAccessToken = requireSchemaExport("oauthAccessToken");
export const oauthClient = requireSchemaExport("oauthClient");
export const oauthConsent = requireSchemaExport("oauthConsent");
export const oauthRefreshToken = requireSchemaExport("oauthRefreshToken");
export const organization = requireSchemaExport("organization");
export const productActivityActor = requireSchemaExport("productActivityActor");
export const productActivityActorSource = requireSchemaExport(
  "productActivityActorSource"
);
export const rateLimit = requireSchemaExport("rateLimit");
export const session = requireSchemaExport("session");
export const site = requireSchemaExport("site");
export const siteComment = requireSchemaExport("siteComment");
export const siteContact = requireSchemaExport("siteContact");
export const siteLabel = requireSchemaExport("siteLabel");
export const sitesSchema = requireSchemaExport("sitesSchema");
export const twoFactor = requireSchemaExport("twoFactor");
export const user = requireSchemaExport("user");
export const userPreferences = requireSchemaExport("userPreferences");
export const verification = requireSchemaExport("verification");
export const workItem = requireSchemaExport("workItem");
export const workItemActivity = requireSchemaExport("workItemActivity");
export const workItemCollaborator = requireSchemaExport("workItemCollaborator");
export const workItemComment = requireSchemaExport("workItemComment");
export const workItemLabel = requireSchemaExport("workItemLabel");
export const workItemVisit = requireSchemaExport("workItemVisit");
