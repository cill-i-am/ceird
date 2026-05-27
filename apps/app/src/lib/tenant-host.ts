import { isOrganizationSlug } from "@ceird/identity-core";

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

const VALID_HOST_PATTERN = /^[a-z0-9.-]+$/;
const DNS_LABEL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DNS_LABEL_MAX_LENGTH = 63;
const ASCII_UNIT_SEPARATOR_CODE_POINT = 31;
const ASCII_DELETE_CODE_POINT = 127;

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

  const baseDomainSuffix = `.${baseDomain}`;

  if (!normalizedHostname.endsWith(baseDomainSuffix)) {
    return { kind: "system" };
  }

  const label = normalizedHostname.slice(0, -baseDomainSuffix.length);

  if (label.includes(".")) {
    return { kind: "system" };
  }

  if (isReservedHostname(normalizedHostname, config)) {
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
  const normalizedStageAlias = normalizeStageAlias(stageAlias);

  if (normalizedStageAlias === undefined) {
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
    return buildTenantOrigin(`${organizationSlug}.${baseDomain}`, config);
  }

  if (config.hostMode === "stage") {
    const normalizedStageAlias = normalizeStageAlias(config.stageAlias);

    if (normalizedStageAlias !== undefined) {
      return buildTenantOrigin(
        `${organizationSlug}--${normalizedStageAlias}.${baseDomain}`,
        config
      );
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

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    hasControlCharacter(path)
  ) {
    return;
  }

  const url = new URL(path, origin);

  if (url.origin !== origin) {
    return;
  }

  return url.toString();
}

export function readTenantHostConfigFromEnv(): TenantHostConfig {
  return {
    baseDomain: import.meta.env.VITE_TENANT_BASE_DOMAIN ?? "",
    hostMode: decodeTenantHostMode(import.meta.env.VITE_TENANT_HOST_MODE),
    reservedHostnames: normalizeHostnames(
      (import.meta.env.VITE_TENANT_RESERVED_HOSTNAMES ?? "").split(",")
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

function buildTenantOrigin(
  hostname: string,
  config: TenantHostConfig
): string | undefined {
  const normalizedHostname = normalizeHostname(hostname);

  if (
    normalizedHostname === undefined ||
    isReservedHostname(normalizedHostname, config)
  ) {
    return;
  }

  return `https://${normalizedHostname}`;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= ASCII_UNIT_SEPARATOR_CODE_POINT ||
        codePoint === ASCII_DELETE_CODE_POINT)
    );
  });
}

function normalizeStageAlias(
  stageAlias: string | undefined
): string | undefined {
  const normalized =
    typeof stageAlias === "string" ? stageAlias.trim().toLowerCase() : "";

  if (
    normalized.length === 0 ||
    normalized.length > DNS_LABEL_MAX_LENGTH ||
    !DNS_LABEL_PATTERN.test(normalized)
  ) {
    return;
  }

  return normalized;
}

function isReservedHostname(
  normalizedHostname: string,
  config: TenantHostConfig
): boolean {
  return config.reservedHostnames.some(
    (reservedHostname) =>
      normalizeHostname(reservedHostname) === normalizedHostname
  );
}

function normalizeHostnames(hostnames: readonly string[]): string[] {
  return hostnames
    .map(normalizeHostname)
    .filter(
      (reservedHostname): reservedHostname is string =>
        reservedHostname !== undefined
    );
}
