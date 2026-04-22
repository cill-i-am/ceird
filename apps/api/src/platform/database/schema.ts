import { authSchema } from "../../domains/identity/authentication/schema.js";

export const appSchema = {
  ...authSchema,
};

export type AppSchema = typeof appSchema;
