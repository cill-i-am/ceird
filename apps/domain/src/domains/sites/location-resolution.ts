import type {
  SiteLocationInput,
  SiteLocationStatusType,
} from "@ceird/sites-core";
import type { Context } from "effect";
import { Effect } from "effect";

import type {
  ResolvedSiteLocation,
  SiteLocationProvider,
} from "./location-provider.js";

type SiteLocationProviderService = Context.Service.Shape<
  typeof SiteLocationProvider
>;

interface EmptyUnverifiedLocationRecord {
  readonly displayLocation: string;
  readonly locationStatus: Extract<SiteLocationStatusType, "unverified">;
}

interface ManualUnverifiedLocationRecord extends EmptyUnverifiedLocationRecord {
  readonly country?: Extract<SiteLocationInput, { kind: "manual" }>["country"];
  readonly rawLocationInput: string;
}

export type ResolvedSiteLocationRecord =
  | EmptyUnverifiedLocationRecord
  | ManualUnverifiedLocationRecord
  | ResolvedSiteLocation;

function emptyUnverifiedLocation(): EmptyUnverifiedLocationRecord {
  return {
    displayLocation: "",
    locationStatus: "unverified",
  };
}

function manualUnverifiedLocation(
  input: Extract<SiteLocationInput, { kind: "manual" }>
): ManualUnverifiedLocationRecord {
  return {
    country: input.country,
    displayLocation: input.rawInput,
    locationStatus: "unverified",
    rawLocationInput: input.rawInput,
  };
}

export const resolveCreateSiteLocation = Effect.fn("resolveCreateSiteLocation")(
  function* (
    input: SiteLocationInput | undefined,
    provider: SiteLocationProviderService
  ) {
    if (input === undefined) {
      return emptyUnverifiedLocation();
    }

    if (input.kind === "manual") {
      return manualUnverifiedLocation(input);
    }

    return yield* provider.resolvePlace({
      placeId: input.placeId,
      rawInput: input.rawInput,
      sessionToken: input.sessionToken,
    });
  }
);

export const resolveUpdateSiteLocation = Effect.fn("resolveUpdateSiteLocation")(
  function* (
    input: SiteLocationInput | null,
    provider: SiteLocationProviderService
  ) {
    if (input === null) {
      return emptyUnverifiedLocation();
    }

    return yield* resolveCreateSiteLocation(input, provider);
  }
);
