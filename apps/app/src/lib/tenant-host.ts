import {
  ORGANIZATION_SLUG_MAX_LENGTH,
  ORGANIZATION_SLUG_PATTERN,
} from "@ceird/identity-core";

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

const ORGANIZATION_SLUG_MIN_LENGTH = 2;
const VALID_HOST_PATTERN = /^[a-z0-9.-]+$/;

export function parseTenantHost(
  hostname: string,
  config: TenantHostConfig
): TenantHostResolution {
  if (config.hostMode === "disabled") {
    return { kind: "disabled" };
  }

  const normalizedHostname = normalizeHostname(hostname);
  const baseDomain = normalizeHostname(config.baseDomain);

  if (normalizedHostname === undefined || baseDomain === undefined) {
    return { kind: "system" };
  }

  const reservedHostnames = config.reservedHostnames
    .map(normalizeHostname)
    .filter(
      (reservedHostname): reservedHostname is string =>
        reservedHostname !== undefined
    );

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

  if (baseDomain === undefined) {
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

  if (!path.startsWith("/") || path.startsWith("//")) {
    return;
  }

  return new URL(path, origin).toString();
}

export function readTenantHostConfigFromEnv(): TenantHostConfig {
  return {
    baseDomain: import.meta.env.VITE_TENANT_BASE_DOMAIN ?? "",
    hostMode: decodeTenantHostMode(import.meta.env.VITE_TENANT_HOST_MODE),
    reservedHostnames: (import.meta.env.VITE_TENANT_RESERVED_HOSTNAMES ?? "")
      .split(",")
      .map(normalizeHostname)
      .filter(
        (reservedHostname: string | undefined): reservedHostname is string =>
          reservedHostname !== undefined
      ),
    stageAlias: import.meta.env.VITE_TENANT_STAGE_ALIAS,
  };
}

function normalizeHostname(hostname: string): string | undefined {
  const trimmed = hostname.trim().toLowerCase();

  if (!trimmed || trimmed.includes("://") || /[@/?#]/u.test(trimmed)) {
    return;
  }

  const portSeparatorIndex = trimmed.lastIndexOf(":");
  const hostnameWithoutPort =
    portSeparatorIndex === -1 ? trimmed : trimmed.slice(0, portSeparatorIndex);
  const port =
    portSeparatorIndex === -1
      ? undefined
      : trimmed.slice(portSeparatorIndex + 1);

  if (
    port !== undefined &&
    (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535)
  ) {
    return;
  }

  if (
    !hostnameWithoutPort ||
    hostnameWithoutPort.includes(":") ||
    !VALID_HOST_PATTERN.test(hostnameWithoutPort)
  ) {
    return;
  }

  return hostnameWithoutPort;
}

function decodeTenantHostMode(value: string | undefined): TenantHostMode {
  return value === "production" || value === "stage" || value === "disabled"
    ? value
    : "disabled";
}

function isOrganizationSlug(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    value.length >= ORGANIZATION_SLUG_MIN_LENGTH &&
    value.length <= ORGANIZATION_SLUG_MAX_LENGTH &&
    ORGANIZATION_SLUG_PATTERN.test(value)
  );
}
