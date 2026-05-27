export type TenantHostMode = "disabled" | "production" | "stage";

export interface TenantHostConfig {
  readonly baseDomain: string;
  readonly hostMode: TenantHostMode;
  readonly reservedHostnames: readonly string[];
  readonly stageAlias?: string | undefined;
}

export type TenantHostResolution =
  | { readonly kind: "disabled" }
  | { readonly kind: "system" }
  | { readonly kind: "tenant"; readonly organizationSlug: string };

const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseTenantHost(
  hostname: string,
  config: TenantHostConfig
): TenantHostResolution {
  if (config.hostMode === "disabled") {
    return { kind: "disabled" };
  }

  const normalizedHostname = normalizeHostname(hostname);
  const baseDomain = normalizeHostname(config.baseDomain);

  if (!normalizedHostname || !baseDomain) {
    return { kind: "system" };
  }

  const reservedHostnames = config.reservedHostnames.map(normalizeHostname);

  if (reservedHostnames.includes(normalizedHostname)) {
    return { kind: "system" };
  }

  const baseDomainSuffix = `.${baseDomain}`;

  if (!normalizedHostname.endsWith(baseDomainSuffix)) {
    return { kind: "system" };
  }

  const label = normalizedHostname.slice(0, -baseDomainSuffix.length);

  if (label.includes(".")) {
    return { kind: "system" };
  }

  const organizationSlug =
    config.hostMode === "production"
      ? label
      : readStageOrganizationSlug(label, config.stageAlias);

  if (!isOrganizationSlug(organizationSlug)) {
    return { kind: "system" };
  }

  return { kind: "tenant", organizationSlug };
}

function readStageOrganizationSlug(
  label: string,
  stageAlias: string | undefined
) {
  const normalizedStageAlias =
    typeof stageAlias === "string" ? stageAlias.trim().toLowerCase() : "";

  if (!normalizedStageAlias) {
    return;
  }

  const suffix = `--${normalizedStageAlias}`;

  if (!label.endsWith(suffix)) {
    return;
  }

  return label.slice(0, -suffix.length);
}

export function buildOrganizationTenantOrigin(
  organizationSlug: string,
  config: TenantHostConfig
) {
  if (!isOrganizationSlug(organizationSlug)) {
    return;
  }

  const baseDomain = normalizeHostname(config.baseDomain);

  if (!baseDomain) {
    return;
  }

  if (config.hostMode === "production") {
    return `https://${organizationSlug}.${baseDomain}`;
  }

  if (config.hostMode === "stage") {
    const normalizedStageAlias =
      typeof config.stageAlias === "string"
        ? config.stageAlias.trim().toLowerCase()
        : "";

    if (normalizedStageAlias) {
      return `https://${organizationSlug}--${normalizedStageAlias}.${baseDomain}`;
    }
  }

  const disabledOrigin: string | undefined = undefined;
  return disabledOrigin;
}

export function buildOrganizationTenantUrl(
  organizationSlug: string,
  path: string,
  config: TenantHostConfig
) {
  const origin = buildOrganizationTenantOrigin(organizationSlug, config);

  if (!origin) {
    return;
  }

  return new URL(path, origin).toString();
}

export function readTenantHostConfigFromEnv(): TenantHostConfig {
  return {
    baseDomain: import.meta.env.VITE_TENANT_BASE_DOMAIN ?? "",
    hostMode:
      (import.meta.env.VITE_TENANT_HOST_MODE as TenantHostMode | undefined) ??
      "disabled",
    reservedHostnames: (import.meta.env.VITE_TENANT_RESERVED_HOSTNAMES ?? "")
      .split(",")
      .map(normalizeHostname)
      .filter((hostname: string) => hostname.length > 0),
    stageAlias: import.meta.env.VITE_TENANT_STAGE_ALIAS,
  };
}

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase();
  const parsed = toUrl(
    trimmed.includes("://") ? trimmed : `https://${trimmed}`
  );

  return parsed?.hostname ?? trimmed.replace(/:\d+$/, "");
}

function toUrl(value: string) {
  const parsed: URL | undefined = URL.canParse(value)
    ? new URL(value)
    : undefined;
  return parsed;
}

function isOrganizationSlug(value: string | undefined): value is string {
  return typeof value === "string" && ORGANIZATION_SLUG_PATTERN.test(value);
}
