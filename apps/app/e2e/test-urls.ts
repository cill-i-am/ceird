import {
  API_ORIGIN,
  APP_ORIGIN,
  readOptionalEnv,
  USE_PACKAGE_LOCAL_SERVER,
} from "./test-origins";

export const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5439/ceird";

export function readPlaywrightDatabaseUrl() {
  const stageDatabaseUrl = readOptionalEnv("PLAYWRIGHT_DATABASE_URL");
  if (stageDatabaseUrl) {
    return stageDatabaseUrl;
  }

  if (USE_PACKAGE_LOCAL_SERVER) {
    return readOptionalEnv("DATABASE_URL") ?? DEFAULT_DATABASE_URL;
  }

  throw new Error(
    "PLAYWRIGHT_DATABASE_URL is required for database-backed E2E tests against an existing Alchemy stage. " +
      "Set PLAYWRIGHT_DATABASE_URL to the selected stage database, or set PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1."
  );
}

export { API_ORIGIN, APP_ORIGIN, USE_PACKAGE_LOCAL_SERVER };
