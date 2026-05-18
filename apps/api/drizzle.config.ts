import { appDatabaseUrlConfig } from "@ceird/backend-core/database";
import { defineConfig } from "drizzle-kit";
import { Effect } from "effect";

const databaseUrl = Effect.runSync(appDatabaseUrlConfig);

export default defineConfig({
  schema: "./src/platform/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
