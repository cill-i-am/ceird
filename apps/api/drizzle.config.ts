import { defineConfig } from "drizzle-kit";
import { Effect } from "effect";

import { appDatabaseUrlConfig } from "./src/platform/database/config";

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
