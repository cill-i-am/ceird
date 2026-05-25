import { agentsSchema } from "../../domains/agents/schema.js";
import { commentsSchema } from "../../domains/comments/schema.js";
import { authSchema } from "../../domains/identity/authentication/schema.js";
import { jobsSchema } from "../../domains/jobs/schema.js";
import { labelsSchema } from "../../domains/labels/schema.js";
import { sitesSchema } from "../../domains/sites/schema.js";

export {
  agentActionRun,
  agentsSchema,
  agentThread,
} from "../../domains/agents/schema.js";
export {
  comment,
  commentsSchema,
  siteComment,
  workItemComment,
} from "../../domains/comments/schema.js";
export {
  account,
  authSchema,
  invitation,
  jwks,
  member,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  organization,
  rateLimit,
  session,
  user,
  verification,
} from "../../domains/identity/authentication/schema.js";
export {
  contact,
  jobsSchema,
  siteContact,
  workItem,
  workItemActivity,
  workItemCollaborator,
  workItemLabel,
  workItemVisit,
} from "../../domains/jobs/schema.js";
export { label, labelsSchema } from "../../domains/labels/schema.js";
export { site, siteLabel, sitesSchema } from "../../domains/sites/schema.js";

export const databaseSchema = {
  ...agentsSchema,
  ...authSchema,
  ...commentsSchema,
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
};
