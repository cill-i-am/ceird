"use client";

export interface SiteLocationLike {
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly county?: string;
  readonly eircode?: string;
  readonly accessNotes?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly name?: string;
  readonly serviceAreaName?: string;
  readonly town?: string;
}

export const DEFAULT_JOBS_MAP_CENTER = [-8.243_89, 53.412_91] as const;
export const DEFAULT_JOBS_MAP_ZOOM = 5.8;

function compactLocationParts(parts: readonly (string | undefined)[]) {
  return parts.filter(Boolean).join(", ");
}

export function hasSiteCoordinates(
  site: SiteLocationLike | null | undefined
): site is SiteLocationLike & {
  readonly latitude: number;
  readonly longitude: number;
} {
  return (
    site !== undefined &&
    site !== null &&
    typeof site.latitude === "number" &&
    Number.isFinite(site.latitude) &&
    typeof site.longitude === "number" &&
    Number.isFinite(site.longitude)
  );
}

export function buildSiteAddressLines(
  site: SiteLocationLike | null | undefined
) {
  if (!site) {
    return [];
  }

  const primary = compactLocationParts([site.addressLine1, site.addressLine2]);
  const locality = compactLocationParts([site.town, site.county, site.eircode]);

  return [primary, locality].filter((value) => value.length > 0);
}

export function buildGoogleMapsUrl(site: SiteLocationLike | null | undefined) {
  if (!site) {
    return null;
  }

  const query = hasSiteCoordinates(site)
    ? `${site.latitude},${site.longitude}`
    : compactLocationParts([
        site.name,
        site.addressLine1,
        site.addressLine2,
        site.town,
        site.county,
        site.eircode,
      ]);

  if (query.length === 0) {
    return null;
  }

  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);

  return url.toString();
}
