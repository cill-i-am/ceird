export const DEFAULT_APP_ORIGIN = "http://127.0.0.1:4173";
export const DEFAULT_API_ORIGIN = "http://127.0.0.1:3001";
export const DEFAULT_AGENT_ORIGIN = DEFAULT_APP_ORIGIN;

export const USE_PACKAGE_LOCAL_SERVER =
  process.env.PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER === "1";

export const readOptionalEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function deriveTenantOrganizationSlug(tenantOrigin: string) {
  let tenantUrl: URL;

  try {
    tenantUrl = new URL(tenantOrigin);
  } catch {
    throw new Error("PLAYWRIGHT_TENANT_URL must be an absolute tenant URL.");
  }

  if (tenantUrl.protocol !== "https:" && tenantUrl.protocol !== "http:") {
    throw new Error("PLAYWRIGHT_TENANT_URL must use an http or https origin.");
  }

  const [tenantLabel] = tenantUrl.hostname.toLowerCase().split(".");
  const stageSeparatorIndex = tenantLabel?.lastIndexOf("--") ?? -1;
  const organizationSlug =
    stageSeparatorIndex === -1
      ? tenantLabel
      : tenantLabel?.slice(0, stageSeparatorIndex);

  if (!organizationSlug || !ORGANIZATION_SLUG_PATTERN.test(organizationSlug)) {
    throw new Error(
      `PLAYWRIGHT_TENANT_URL must start with a tenant organization slug; received ${tenantOrigin}.`
    );
  }

  return organizationSlug;
}

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

export const AGENT_ORIGIN = readPlaywrightOrigin(
  "PLAYWRIGHT_AGENT_URL",
  DEFAULT_AGENT_ORIGIN
);

export const TENANT_ORIGIN = readOptionalEnv("PLAYWRIGHT_TENANT_URL");
