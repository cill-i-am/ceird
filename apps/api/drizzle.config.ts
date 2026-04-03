import { defineConfig } from "drizzle-kit";
import { Effect } from "effect";

import { authenticationDatabaseUrlConfig } from "./src/domains/identity/authentication/config";

const databaseUrl = Effect.runSync(authenticationDatabaseUrlConfig);

export default defineConfig({
  schema: "./src/domains/identity/authentication/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
