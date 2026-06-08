import type { GooglePlacesSessionTokenType } from "@ceird/proximity-core";

export function createProximityOriginSessionToken(
  randomUUID: () => string = () => crypto.randomUUID()
): GooglePlacesSessionTokenType {
  return randomUUID().replaceAll("-", "") as GooglePlacesSessionTokenType;
}
