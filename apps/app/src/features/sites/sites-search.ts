const SITES_VIEW_MODES = ["list", "map"] as const;
const SITES_ROUTE_LIMITS = [10, 15, 20, 25] as const;

export type SitesViewMode = (typeof SITES_VIEW_MODES)[number];
type SitesRouteLimit = (typeof SITES_ROUTE_LIMITS)[number];

export interface SitesSearch {
  readonly near?: boolean | undefined;
  readonly routeLimit?: SitesRouteLimit | undefined;
  readonly view?: SitesViewMode | undefined;
}

export function decodeSitesSearch(input: unknown): SitesSearch {
  const near = readSearchParam(input, "near");
  const routeLimit = readSearchParam(input, "routeLimit");
  const view = readSearchParam(input, "view");

  return {
    near: decodeSitesNearSearch(near),
    routeLimit: decodeSitesRouteLimit(routeLimit),
    view: isSitesViewMode(view) ? view : undefined,
  };
}

export function isSitesMapViewSearch(search: unknown) {
  if (typeof search !== "object" || search === null) {
    return false;
  }

  return decodeSitesSearch(search).view === "map";
}

function readSearchParam(input: unknown, key: string): unknown {
  if (typeof input !== "object" || input === null) {
    return;
  }

  return (input as Record<string, unknown>)[key];
}

function isSitesViewMode(value: unknown): value is SitesViewMode {
  return value === "list" || value === "map";
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
