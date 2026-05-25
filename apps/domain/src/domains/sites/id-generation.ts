import { SiteId } from "@ceird/sites-core";
import type { SiteIdType } from "@ceird/sites-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeSiteId = Schema.decodeUnknownSync(SiteId);

export function generateSiteId(): SiteIdType {
  return decodeSiteId(uuidv7());
}
