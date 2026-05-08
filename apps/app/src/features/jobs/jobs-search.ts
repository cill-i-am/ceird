const JOBS_VIEW_MODES = ["list", "map"] as const;

type JobsViewMode = (typeof JOBS_VIEW_MODES)[number];

export interface JobsSearch {
  readonly view?: JobsViewMode | undefined;
}

export function decodeJobsSearch(input: unknown): JobsSearch {
  const view = readSearchParam(input, "view");

  return {
    view: isJobsViewMode(view) ? view : undefined,
  };
}

export function isJobsMapViewSearch(search: unknown) {
  if (typeof search !== "object" || search === null) {
    return false;
  }

  return decodeJobsSearch(search).view === "map";
}

function readSearchParam(input: unknown, key: string) {
  if (typeof input !== "object" || input === null) {
    return;
  }

  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}

function isJobsViewMode(value: string | undefined): value is JobsViewMode {
  return value === "list" || value === "map";
}
