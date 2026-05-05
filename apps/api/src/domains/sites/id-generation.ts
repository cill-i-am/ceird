import { ServiceAreaId, SiteId } from "@ceird/sites-core";
import type { ServiceAreaIdType, SiteIdType } from "@ceird/sites-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeServiceAreaId = Schema.decodeUnknownSync(ServiceAreaId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);

export function generateServiceAreaId(): ServiceAreaIdType {
  return decodeServiceAreaId(uuidv7());
}

export function generateSiteId(): SiteIdType {
  return decodeSiteId(uuidv7());
}
