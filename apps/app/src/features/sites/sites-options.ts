import type { SiteOption, SitesOptionsResponse } from "@ceird/sites-core";

export function deriveServiceAreasFromSites(
  sites: readonly SiteOption[]
): SitesOptionsResponse["serviceAreas"] {
  const serviceAreasById = new Map<
    NonNullable<SiteOption["serviceAreaId"]>,
    SitesOptionsResponse["serviceAreas"][number]
  >();

  for (const site of sites) {
    if (
      site.serviceAreaId !== undefined &&
      site.serviceAreaName !== undefined
    ) {
      serviceAreasById.set(site.serviceAreaId, {
        id: site.serviceAreaId,
        name: site.serviceAreaName,
      });
    }
  }

  return [...serviceAreasById.values()].toSorted((left, right) => {
    const nameComparison = left.name.localeCompare(right.name);

    return nameComparison === 0
      ? left.id.localeCompare(right.id)
      : nameComparison;
  });
}
