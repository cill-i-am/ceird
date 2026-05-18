export const DEFAULT_APP_ORIGIN = "http://127.0.0.1:4173";
export const DEFAULT_API_ORIGIN = "http://127.0.0.1:3001";

export const USE_PACKAGE_LOCAL_SERVER =
  process.env.PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER === "1";

export const readOptionalEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const readPlaywrightOrigin = (name: string, packageLocalFallback: string) => {
  const value = readOptionalEnv(name);
  if (value) {
    return value;
  }

  if (USE_PACKAGE_LOCAL_SERVER) {
    return packageLocalFallback;
  }

  throw new Error(
    `${name} is required when Playwright targets an existing Alchemy stage. ` +
      `Set ${name}, or set PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 to start package-local test servers.`
  );
};

export const APP_ORIGIN = readPlaywrightOrigin(
  "PLAYWRIGHT_BASE_URL",
  DEFAULT_APP_ORIGIN
);

export const API_ORIGIN = readPlaywrightOrigin(
  "PLAYWRIGHT_API_URL",
  DEFAULT_API_ORIGIN
);
