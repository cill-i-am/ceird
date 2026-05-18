import { tsImport } from "tsx/esm/api";

const schemaExportNames = [
  "account",
  "authSchema",
  "comment",
  "commentsSchema",
  "contact",
  "databaseSchema",
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
  "rateCard",
  "rateCardLine",
  "rateLimit",
  "serviceArea",
  "session",
  "site",
  "siteComment",
  "siteContact",
  "siteLabel",
  "sitesSchema",
  "user",
  "verification",
  "workItem",
  "workItemActivity",
  "workItemCollaborator",
  "workItemComment",
  "workItemCostLine",
  "workItemLabel",
  "workItemVisit",
] as const;

type SchemaExportName = (typeof schemaExportNames)[number];
type ApiDatabaseSchemaModule = Partial<Record<SchemaExportName, unknown>>;

const apiSchemaModule = (await tsImport(
  "../apps/api/src/platform/database/schema.ts",
  {
    parentURL: import.meta.url,
    tsconfig: "./apps/api/tsconfig.json",
  }
)) as ApiDatabaseSchemaModule;

function requireSchemaExport(name: SchemaExportName) {
  const value = apiSchemaModule[name];

  if (value === undefined) {
    throw new Error(`API database schema export '${name}' is missing`);
  }

  return value;
}

export const account = requireSchemaExport("account");
export const authSchema = requireSchemaExport("authSchema");
export const comment = requireSchemaExport("comment");
export const commentsSchema = requireSchemaExport("commentsSchema");
export const contact = requireSchemaExport("contact");
export const databaseSchema = requireSchemaExport("databaseSchema");
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
export const rateCard = requireSchemaExport("rateCard");
export const rateCardLine = requireSchemaExport("rateCardLine");
export const rateLimit = requireSchemaExport("rateLimit");
export const serviceArea = requireSchemaExport("serviceArea");
export const session = requireSchemaExport("session");
export const site = requireSchemaExport("site");
export const siteComment = requireSchemaExport("siteComment");
export const siteContact = requireSchemaExport("siteContact");
export const siteLabel = requireSchemaExport("siteLabel");
export const sitesSchema = requireSchemaExport("sitesSchema");
export const user = requireSchemaExport("user");
export const verification = requireSchemaExport("verification");
export const workItem = requireSchemaExport("workItem");
export const workItemActivity = requireSchemaExport("workItemActivity");
export const workItemCollaborator = requireSchemaExport("workItemCollaborator");
export const workItemComment = requireSchemaExport("workItemComment");
export const workItemCostLine = requireSchemaExport("workItemCostLine");
export const workItemLabel = requireSchemaExport("workItemLabel");
export const workItemVisit = requireSchemaExport("workItemVisit");
