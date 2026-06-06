import type {
  ProximityLimit,
  ProximityOriginInput,
  TypedOrigin,
  CurrentLocationOrigin,
} from "@ceird/proximity-core";

export const DEFAULT_PROXIMITY_RESULT_LIMIT = 10 as ProximityLimit;
export const PROXIMITY_RESULT_LIMIT_OPTIONS = [10, 15, 20, 25] as const;
export type ProximityResultLimitOption =
  (typeof PROXIMITY_RESULT_LIMIT_OPTIONS)[number];

export type ProximityOriginState =
  | { readonly status: "idle" }
  | { readonly status: "requesting_current_location" }
  | {
      readonly origin: CurrentLocationOrigin;
      readonly status: "current_location_ready";
    }
  | {
      readonly query: string;
      readonly status: "typed_origin_searching";
    }
  | {
      readonly origin: TypedOrigin;
      readonly status: "typed_origin_selected";
    }
  | {
      readonly reason:
        | "permission_denied"
        | "position_unavailable"
        | "timeout"
        | "unavailable";
      readonly status: "blocked";
    }
  | {
      readonly message: string;
      readonly status: "failed";
    };

export interface ProximityRunRequest {
  readonly includeRouteLines: boolean;
  readonly limit: ProximityLimit;
  readonly origin: ProximityOriginInput;
}

export function normalizeProximityResultLimit(
  value: number | string | undefined
): ProximityLimit {
  const numericValue =
    typeof value === "string" ? Number.parseInt(value, 10) : value;

  return isProximityResultLimitOption(numericValue)
    ? (numericValue as ProximityLimit)
    : DEFAULT_PROXIMITY_RESULT_LIMIT;
}

export function getResolvedProximityOrigin(
  state: ProximityOriginState
): ProximityOriginInput | null {
  if (
    state.status === "current_location_ready" ||
    state.status === "typed_origin_selected"
  ) {
    return state.origin;
  }

  return null;
}

export function buildProximityRunRequest(input: {
  readonly includeRouteLines: boolean;
  readonly limit?: number | string | undefined;
  readonly originState: ProximityOriginState;
}): ProximityRunRequest | null {
  const origin = getResolvedProximityOrigin(input.originState);

  if (origin === null) {
    return null;
  }

  return {
    includeRouteLines: input.includeRouteLines,
    limit: normalizeProximityResultLimit(input.limit),
    origin,
  };
}

function isProximityResultLimitOption(
  value: number | undefined
): value is ProximityResultLimitOption {
  return PROXIMITY_RESULT_LIMIT_OPTIONS.some((option) => option === value);
}
