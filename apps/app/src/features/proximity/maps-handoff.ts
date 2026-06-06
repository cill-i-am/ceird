import type {
  GooglePlaceIdType,
  ProximityCoordinates,
} from "@ceird/proximity-core";

export type MapsHandoffProvider = "default" | "google" | "apple";

export interface MapsHandoffInput {
  readonly destination: ProximityCoordinates;
  readonly destinationLabel?: string | undefined;
  readonly destinationPlaceId?: GooglePlaceIdType | undefined;
  readonly origin: ProximityCoordinates;
  readonly platformUserAgent?: string | undefined;
}

export interface MapsHandoffLink {
  readonly label: string;
  readonly provider: MapsHandoffProvider;
  readonly url: string;
}

export function buildMapsHandoffUrls(input: MapsHandoffInput) {
  return {
    apple: {
      label: "Open in Apple Maps",
      provider: "apple",
      url: buildMapsHandoffUrl({ ...input, provider: "apple" }),
    },
    default: {
      label: "Open in Maps",
      provider: "default",
      url: buildMapsHandoffUrl({ ...input, provider: "default" }),
    },
    google: {
      label: "Open in Google Maps",
      provider: "google",
      url: buildMapsHandoffUrl({ ...input, provider: "google" }),
    },
  } satisfies Record<MapsHandoffProvider, MapsHandoffLink>;
}

export function buildMapsHandoffUrl(
  input: MapsHandoffInput & { readonly provider: MapsHandoffProvider }
) {
  if (input.provider === "default") {
    const platform = detectMapsHandoffPlatform(input.platformUserAgent);

    if (platform === "apple") {
      return buildAppleMapsUrl(input, "maps://");
    }

    if (platform === "android") {
      return buildAndroidGeoUrl(input);
    }
  }

  if (input.provider === "apple") {
    return buildAppleMapsUrl(input, "https://maps.apple.com/");
  }

  return buildGoogleMapsUrl(input);
}

function buildGoogleMapsUrl(input: MapsHandoffInput) {
  const params = new URLSearchParams({
    api: "1",
    destination: formatCoordinatePair(input.destination),
    origin: formatCoordinatePair(input.origin),
    travelmode: "driving",
  });

  if (input.destinationPlaceId !== undefined) {
    params.set("destination_place_id", input.destinationPlaceId);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildAppleMapsUrl(input: MapsHandoffInput, baseUrl: string) {
  const params = new URLSearchParams({
    daddr: formatCoordinatePair(input.destination),
    dirflg: "d",
    saddr: formatCoordinatePair(input.origin),
  });

  if (input.destinationLabel !== undefined) {
    params.set("q", input.destinationLabel);
  }

  return `${baseUrl}?${params.toString()}`;
}

function buildAndroidGeoUrl(input: MapsHandoffInput) {
  const destination = formatCoordinatePair(input.destination);
  const query =
    input.destinationLabel === undefined
      ? destination
      : `${destination}(${input.destinationLabel})`;

  return `geo:0,0?q=${encodeURIComponent(query)}`;
}

function formatCoordinatePair(coordinates: ProximityCoordinates) {
  return `${coordinates.latitude},${coordinates.longitude}`;
}

function detectMapsHandoffPlatform(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
): "android" | "apple" | "web" {
  if (/android/i.test(userAgent)) {
    return "android";
  }

  if (/(iphone|ipad|ipod|macintosh|mac os x)/i.test(userAgent)) {
    return "apple";
  }

  return "web";
}
