import { authSchema } from "../../domains/identity/authentication/schema.js";

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

export const databaseSchema = {
  ...authSchema,
};

export const appSchema = {} as const;

export type AppSchema = typeof appSchema;
