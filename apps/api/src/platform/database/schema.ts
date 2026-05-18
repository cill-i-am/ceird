import {
  commentsSchema,
  jobsSchema,
  labelsSchema,
  sitesSchema,
} from "@ceird/backend-core/database";

import { authSchema } from "../../domains/identity/authentication/schema.js";

export {
  comment,
  commentsSchema,
  contact,
  jobsSchema,
  label,
  labelsSchema,
  rateCard,
  rateCardLine,
  serviceArea,
  site,
  siteComment,
  siteContact,
  siteLabel,
  sitesSchema,
  workItem,
  workItemActivity,
  workItemCollaborator,
  workItemComment,
  workItemCostLine,
  workItemLabel,
  workItemVisit,
} from "@ceird/backend-core/database";
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

export const databaseSchema = {
  ...authSchema,
  ...commentsSchema,
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
};
