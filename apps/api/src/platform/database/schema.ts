import { authSchema } from "../../domains/identity/authentication/schema.js";
import { jobsSchema } from "../../domains/jobs/schema.js";
import { labelsSchema } from "../../domains/labels/schema.js";
import { sitesSchema } from "../../domains/sites/schema.js";

export {
  account,
  accountRelations,
  authSchema,
  invitation,
  invitationRelations,
  member,
  memberRelations,
  organization,
  organizationRelations,
  rateLimit,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "../../domains/identity/authentication/schema.js";
export {
  contact,
  contactRelations,
  jobsSchema,
  rateCard,
  rateCardLine,
  rateCardLineRelations,
  rateCardRelations,
  siteContact,
  siteContactRelations,
  workItem,
  workItemActivity,
  workItemActivityRelations,
  workItemCollaborator,
  workItemCollaboratorRelations,
  workItemCostLine,
  workItemCostLineRelations,
  workItemComment,
  workItemCommentRelations,
  workItemLabel,
  workItemLabelRelations,
  workItemRelations,
  workItemVisit,
  workItemVisitRelations,
} from "../../domains/jobs/schema.js";
export {
  label,
  labelRelations,
  labelsSchema,
} from "../../domains/labels/schema.js";
export {
  serviceArea,
  serviceAreaRelations,
  site,
  siteRelations,
  sitesSchema,
} from "../../domains/sites/schema.js";

export const databaseSchema = {
  ...authSchema,
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
};

export const appSchema = {
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
} as const;

export type AppSchema = typeof appSchema;
