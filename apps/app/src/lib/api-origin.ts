const LOCAL_APP_PORTS = new Set(["3000", "4173"]);
const LOCAL_API_PORT = "3001";

function toURL(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

function mapAppOriginToApiOrigin(url: URL): URL | undefined {
  const mapped = new URL(url.toString());

  if (mapped.hostname.includes(".app.task-tracker.localhost")) {
    mapped.hostname = mapped.hostname.replace(
      ".app.task-tracker.localhost",
      ".api.task-tracker.localhost"
    );
    return mapped;
  }

  if (mapped.hostname === "app.task-tracker.localhost") {
    mapped.hostname = "api.task-tracker.localhost";
    return mapped;
  }

  if (
    (mapped.hostname === "127.0.0.1" || mapped.hostname === "localhost") &&
    LOCAL_APP_PORTS.has(mapped.port)
  ) {
    mapped.port = LOCAL_API_PORT;
    return mapped;
  }

  if (mapped.hostname.startsWith("app.")) {
    const [, ...remainingLabels] = mapped.hostname.split(".");

    if (remainingLabels.length >= 2) {
      mapped.hostname = ["api", ...remainingLabels].join(".");
      return mapped;
    }
  }

  return undefined;
}

export function resolveApiOrigin(
  origin?: string | undefined,
  explicitApiOrigin?: string | undefined
): string | undefined {
  const configuredOrigin = explicitApiOrigin ?? readConfiguredApiOrigin();
  const configuredUrl =
    typeof configuredOrigin === "string" ? toURL(configuredOrigin) : undefined;

  if (configuredUrl) {
    return configuredUrl.origin;
  }

  const url = typeof origin === "string" ? toURL(origin) : undefined;

  if (!url) {
    return undefined;
  }

  return mapAppOriginToApiOrigin(url)?.origin;
}

export function readConfiguredApiOrigin(): string | undefined {
  const envOrigin = import.meta.env.VITE_API_ORIGIN;
  return typeof envOrigin === "string" ? envOrigin : undefined;
}

export function readConfiguredServerApiOrigin(): string | undefined {
  return typeof __SERVER_API_ORIGIN__ === "string"
    ? __SERVER_API_ORIGIN__
    : undefined;
}
