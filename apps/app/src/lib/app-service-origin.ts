const DEFAULT_LOCAL_APP_PORTS = new Set(["3000", "4173"]);

interface AppServiceOriginOptions {
  readonly allowRawLocalOrigin?: boolean;
  readonly localAppPorts?: ReadonlySet<string>;
  readonly localServicePort?: string;
  readonly serviceLabel: string;
}

export function toURL(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

export function isLocalAppBrowserOrigin(url: URL): boolean {
  const labels = url.hostname.split(".");

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    labels.length >= 4 &&
    labels[0] === "app" &&
    labels.at(-2) === "ceird" &&
    labels.at(-1) === "localhost"
  );
}

export function isMatchingMappedServiceOrigin(
  appUrl: URL,
  serviceUrl: URL,
  serviceLabel: string
): boolean {
  return (
    mapAppOriginToServiceOrigin(appUrl, { serviceLabel })?.origin ===
    serviceUrl.origin
  );
}

export function mapAppOriginToServiceOrigin(
  url: URL,
  options: AppServiceOriginOptions
): URL | undefined {
  const mapped = new URL(url.toString());
  const localAppPorts = options.localAppPorts ?? DEFAULT_LOCAL_APP_PORTS;

  if (
    (mapped.hostname === "127.0.0.1" || mapped.hostname === "localhost") &&
    localAppPorts.has(mapped.port)
  ) {
    if (options.localServicePort !== undefined) {
      mapped.port = options.localServicePort;
      return mapped;
    }

    return options.allowRawLocalOrigin === true ? mapped : undefined;
  }

  if (mapped.hostname.startsWith("app.")) {
    const [, ...remainingLabels] = mapped.hostname.split(".");

    if (remainingLabels.length >= 2) {
      mapped.hostname = [options.serviceLabel, ...remainingLabels].join(".");
      return mapped;
    }
  }

  if (mapped.hostname.startsWith("app-")) {
    const [appLabel, ...remainingLabels] = mapped.hostname.split(".");
    const stageSlug = appLabel?.slice("app-".length);

    if (stageSlug && remainingLabels.length >= 2) {
      mapped.hostname = [
        `${options.serviceLabel}-${stageSlug}`,
        ...remainingLabels,
      ].join(".");
      return mapped;
    }
  }

  if (mapped.hostname.endsWith(".localhost")) {
    return undefined;
  }

  return undefined;
}
