import { SiteId } from "@ceird/sites-core";
import type { SiteIdType } from "@ceird/sites-core";
import { Schema } from "effect";

const decodeSiteId: (siteId: unknown) => SiteIdType =
  Schema.decodeUnknownSync(SiteId);

export function loadSiteDetailRouteData(siteId: unknown): SiteIdType {
  return decodeSiteId(siteId);
}
