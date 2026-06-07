const SITES_VIEW_MODES = ["list", "map"] as const;

export type SitesViewMode = (typeof SITES_VIEW_MODES)[number];

export interface SitesSearch {
  readonly view?: SitesViewMode | undefined;
}

export function decodeSitesSearch(input: unknown): SitesSearch {
  const view = readSearchParam(input, "view");

  return {
    view: isSitesViewMode(view) ? view : undefined,
  };
}

export function isSitesMapViewSearch(search: unknown) {
  if (typeof search !== "object" || search === null) {
    return false;
  }

  return decodeSitesSearch(search).view === "map";
}

function readSearchParam(input: unknown, key: string) {
  if (typeof input !== "object" || input === null) {
    return;
  }

  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}

function isSitesViewMode(value: string | undefined): value is SitesViewMode {
  return value === "list" || value === "map";
}
