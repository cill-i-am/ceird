const SITES_ROUTE_LIMITS = [10, 15, 20, 25] as const;

type SitesRouteLimit = (typeof SITES_ROUTE_LIMITS)[number];

export interface SitesSearch {
  readonly near?: boolean | undefined;
  readonly routeLimit?: SitesRouteLimit | undefined;
}

export function decodeSitesSearch(input: unknown): SitesSearch {
  const near = readSearchParam(input, "near");
  const routeLimit = readSearchParam(input, "routeLimit");

  return {
    near: decodeSitesNearSearch(near),
    routeLimit: decodeSitesRouteLimit(routeLimit),
  };
}

function readSearchParam(input: unknown, key: string): unknown {
  if (typeof input !== "object" || input === null) {
    return;
  }

  return (input as Record<string, unknown>)[key];
}

function decodeSitesNearSearch(value: unknown) {
  if (value === undefined) {
    return;
  }

  return value === true || value === "true";
}

function decodeSitesRouteLimit(value: unknown): SitesRouteLimit | undefined {
  if (typeof value === "number") {
    return SITES_ROUTE_LIMITS.find((limit) => limit === value);
  }

  if (typeof value !== "string") {
    return;
  }

  const trimmedValue = value.trim();
  if (!/^\d+$/.test(trimmedValue)) {
    return;
  }

  const parsed = Number(trimmedValue);

  return SITES_ROUTE_LIMITS.find((limit) => limit === parsed);
}
