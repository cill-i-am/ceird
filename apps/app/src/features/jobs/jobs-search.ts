const JOBS_VIEW_MODES = ["list", "map"] as const;
const JOBS_ROUTE_LIMITS = [10, 15, 20, 25] as const;

type JobsViewMode = (typeof JOBS_VIEW_MODES)[number];
type JobsRouteLimit = (typeof JOBS_ROUTE_LIMITS)[number];

export interface JobsSearch {
  readonly near?: boolean | undefined;
  readonly routeLimit?: JobsRouteLimit | undefined;
  readonly view?: JobsViewMode | undefined;
}

export function decodeJobsSearch(input: unknown): JobsSearch {
  const near = readSearchParam(input, "near");
  const routeLimit = readSearchParam(input, "routeLimit");
  const view = readSearchParam(input, "view");

  return {
    near: decodeJobsNearSearch(near),
    routeLimit: decodeJobsRouteLimit(routeLimit),
    view: isJobsViewMode(view) ? view : undefined,
  };
}

export function isJobsMapViewSearch(search: unknown) {
  if (typeof search !== "object" || search === null) {
    return false;
  }

  return decodeJobsSearch(search).view === "map";
}

function readSearchParam(input: unknown, key: string): unknown {
  if (typeof input !== "object" || input === null) {
    return;
  }

  return (input as Record<string, unknown>)[key];
}

function isJobsViewMode(value: unknown): value is JobsViewMode {
  return value === "list" || value === "map";
}

function decodeJobsNearSearch(value: unknown) {
  if (value === undefined) {
    return;
  }

  return value === true || value === "true";
}

function decodeJobsRouteLimit(value: unknown): JobsRouteLimit | undefined {
  if (typeof value === "number") {
    return JOBS_ROUTE_LIMITS.find((limit) => limit === value);
  }

  if (typeof value !== "string") {
    return;
  }

  const trimmedValue = value.trim();
  if (!/^\d+$/.test(trimmedValue)) {
    return;
  }

  const parsed = Number(trimmedValue);

  return JOBS_ROUTE_LIMITS.find((limit) => limit === parsed);
}
