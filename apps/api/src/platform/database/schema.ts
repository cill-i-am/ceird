import { authSchema } from "../../domains/identity/authentication/schema.js";
import { jobsSchema } from "../../domains/jobs/schema.js";

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
  jobLabel,
  jobLabelRelations,
  jobsSchema,
  rateCard,
  rateCardLine,
  rateCardLineRelations,
  rateCardRelations,
  serviceArea,
  serviceAreaRelations,
  site,
  siteContact,
  siteContactRelations,
  siteRelations,
  workItem,
  workItemActivity,
  workItemActivityRelations,
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

export const databaseSchema = {
  ...authSchema,
  ...jobsSchema,
};

export const appSchema = {
  ...jobsSchema,
} as const;

export type AppSchema = typeof appSchema;
