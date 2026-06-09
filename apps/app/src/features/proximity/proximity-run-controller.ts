"use client";

import type {
  CurrentLocationOrigin,
  ProximityOriginInput,
  ProximityOriginSuggestion,
} from "@ceird/proximity-core";
import type { Cause } from "effect";
import { Effect, Exit, Fiber } from "effect";
import * as React from "react";

import { requestCurrentLocationOrigin } from "./proximity-location-access";
import type { ProximityOriginControllerServices } from "./proximity-origin-controller";
import { useProximityOriginDialogController } from "./proximity-origin-controller";

export type ProximityRunRequestState<TResponse> =
  | { readonly status: "idle" }
  | {
      readonly includeRouteLines: boolean;
      readonly inputKey: string;
      readonly status: "loading";
    }
  | {
      readonly includeRouteLines: boolean;
      readonly inputKey: string;
      readonly response: TResponse;
      readonly status: "success";
    }
  | {
      readonly includeRouteLines: boolean;
      readonly inputKey: string;
      readonly message: string;
      readonly status: "failed";
    };

export type ProximityOriginRunState =
  | { readonly status: "idle" }
  | { readonly status: "requesting" }
  | { readonly origin: ProximityOriginInput; readonly status: "ready" }
  | {
      readonly reason: "current_location_disabled" | "current_location_failed";
      readonly status: "needs_origin";
    };

interface ProximityRunInputContext {
  readonly includeRouteLines: boolean;
  readonly origin: ProximityOriginInput;
}

interface ProximityRunControllerServices extends ProximityOriginControllerServices {
  readonly requestCurrentOrigin?: () => Effect.Effect<
    CurrentLocationOrigin,
    unknown
  >;
}

export interface UseProximityRunControllerOptions<
  TInput,
  TResponse,
  TSelectedId,
> {
  readonly active: boolean;
  readonly autocompleteDebounceMs?: number;
  readonly buildInput: (context: ProximityRunInputContext) => TInput;
  readonly currentLocationRequestKey: number;
  readonly getFailureMessage: (cause: Cause.Cause<unknown>) => string;
  readonly getFirstSelectionId: (response: TResponse) => TSelectedId | null;
  readonly includeRouteLines: boolean;
  readonly isInputEligible: () => boolean;
  readonly makeInputKey: (input: TInput) => string;
  readonly rank: (input: TInput) => Effect.Effect<TResponse, unknown>;
  readonly rankingDebounceMs?: number;
  readonly routeProximityLocationEnabled: boolean;
  readonly services?: ProximityRunControllerServices | undefined;
  readonly onActiveChange: (active: boolean) => void;
}

export interface UseProximityRunControllerResult<TResponse, TSelectedId> {
  readonly confirmTypedOrigin: (suggestion: ProximityOriginSuggestion) => void;
  readonly disableNearMe: () => void;
  readonly enableNearMe: () => void;
  readonly handleOriginDialogOpen: (open: boolean) => void;
  readonly handleOriginQueryChange: (query: string) => void;
  readonly handleSelectedIdChange: (selectedId: TSelectedId) => void;
  readonly handleSuggestionSelect: (
    suggestion: ProximityOriginSuggestion
  ) => void;
  readonly origin: ProximityOriginRunState;
  readonly originDialogError: string | null;
  readonly originDialogLoading: boolean;
  readonly originDialogOpen: boolean;
  readonly originQuery: string;
  readonly originSuggestions: readonly ProximityOriginSuggestion[];
  readonly rankingInputKey: string | null;
  readonly request: ProximityRunRequestState<TResponse>;
  readonly requestCurrentOrigin: () => void;
  readonly retryRanking: () => void;
  readonly selectedId: TSelectedId | null;
  readonly selectedSuggestion: ProximityOriginSuggestion | null;
}

const ORIGIN_AUTOCOMPLETE_DEBOUNCE_MS = 250;
const ROUTE_RANKING_DEBOUNCE_MS = 300;
const TYPED_ORIGIN_FAILURE_MESSAGE =
  "Ceird could not use that origin. Select another result or try again.";

export function useProximityRunController<TInput, TResponse, TSelectedId>({
  active,
  autocompleteDebounceMs = ORIGIN_AUTOCOMPLETE_DEBOUNCE_MS,
  buildInput,
  currentLocationRequestKey,
  getFailureMessage,
  getFirstSelectionId,
  includeRouteLines,
  isInputEligible,
  makeInputKey,
  rank,
  rankingDebounceMs = ROUTE_RANKING_DEBOUNCE_MS,
  routeProximityLocationEnabled,
  services,
  onActiveChange,
}: UseProximityRunControllerOptions<
  TInput,
  TResponse,
  TSelectedId
>): UseProximityRunControllerResult<TResponse, TSelectedId> {
  const [origin, setOrigin] = React.useState<ProximityOriginRunState>({
    status: "idle",
  });
  const [rankingRetryToken, setRankingRetryToken] = React.useState(0);
  const [request, setRequest] = React.useState<
    ProximityRunRequestState<TResponse>
  >({ status: "idle" });
  const [selectedId, setSelectedId] = React.useState<TSelectedId | null>(null);

  const activeRef = React.useRef(active);
  const pendingActivationRef = React.useRef(false);
  const originRequestIdRef = React.useRef(0);
  const rankRequestIdRef = React.useRef(0);
  const currentLocationRequestKeyRef = React.useRef(currentLocationRequestKey);
  const currentOriginFiberRef = React.useRef<Fiber.Fiber<
    CurrentLocationOrigin,
    unknown
  > | null>(null);
  const removeCurrentOriginObserverRef = React.useRef<(() => void) | null>(
    null
  );
  const requestRef = React.useRef(request);
  const rankingRetryTokenRef = React.useRef(rankingRetryToken);

  activeRef.current = active;
  requestRef.current = request;

  const requestCurrentOriginService =
    services?.requestCurrentOrigin ?? requestCurrentLocationOrigin;

  const handleTypedOriginResolved = React.useCallback(
    ({ origin: nextOrigin }: { readonly origin: ProximityOriginInput }) => {
      setOrigin({ origin: nextOrigin, status: "ready" });
      return "reset" as const;
    },
    []
  );
  const {
    confirmSelectedOrigin,
    error: originDialogError,
    handleOpenChange: handleOriginDialogOpen,
    handleQueryChange: handleOriginQueryChange,
    handleSuggestionSelect,
    loading: originDialogLoading,
    open: originDialogOpen,
    query: originQuery,
    reset: resetOriginDialog,
    selectedSuggestion,
    suggestions: originSuggestions,
  } = useProximityOriginDialogController({
    autocompleteDebounceMs,
    resolveFailureMessage: TYPED_ORIGIN_FAILURE_MESSAGE,
    services,
    onOriginResolved: handleTypedOriginResolved,
  });

  const rankingInput = React.useMemo(() => {
    if (!active || origin.status !== "ready" || !isInputEligible()) {
      return null;
    }

    return buildInput({
      includeRouteLines,
      origin: origin.origin,
    });
  }, [active, buildInput, includeRouteLines, isInputEligible, origin]);

  const rankingInputKey = React.useMemo(
    () => (rankingInput === null ? null : makeInputKey(rankingInput)),
    [makeInputKey, rankingInput]
  );

  const cancelCurrentOriginRequest = React.useCallback(() => {
    removeCurrentOriginObserverRef.current?.();
    removeCurrentOriginObserverRef.current = null;
    if (currentOriginFiberRef.current !== null) {
      void Effect.runFork(Fiber.interrupt(currentOriginFiberRef.current));
      currentOriginFiberRef.current = null;
    }
  }, []);

  const resetProximity = React.useCallback(() => {
    setOrigin({ status: "idle" });
    setRequest({ status: "idle" });
    setSelectedId(null);
  }, []);

  React.useEffect(
    () => () => {
      activeRef.current = false;
      pendingActivationRef.current = false;
      originRequestIdRef.current += 1;
      rankRequestIdRef.current += 1;
      cancelCurrentOriginRequest();
    },
    [cancelCurrentOriginRequest]
  );

  React.useEffect(() => {
    if (routeProximityLocationEnabled || !active) {
      return;
    }

    const shouldClearCurrentLocationOrigin =
      origin.status === "requesting" ||
      (origin.status === "ready" && origin.origin.mode === "current_location");

    if (!shouldClearCurrentLocationOrigin) {
      return;
    }

    originRequestIdRef.current += 1;
    rankRequestIdRef.current += 1;
    pendingActivationRef.current = false;
    cancelCurrentOriginRequest();
    setOrigin({
      reason: "current_location_disabled",
      status: "needs_origin",
    });
    handleOriginDialogOpen(true);
  }, [
    active,
    cancelCurrentOriginRequest,
    handleOriginDialogOpen,
    origin,
    routeProximityLocationEnabled,
  ]);

  const requestCurrentOrigin = React.useCallback(() => {
    cancelCurrentOriginRequest();
    const requestId = originRequestIdRef.current + 1;
    originRequestIdRef.current = requestId;

    if (!routeProximityLocationEnabled) {
      pendingActivationRef.current = false;
      setOrigin({
        reason: "current_location_disabled",
        status: "needs_origin",
      });
      handleOriginDialogOpen(true);
      return;
    }

    setOrigin({ status: "requesting" });

    const originFiber = Effect.runFork(requestCurrentOriginService());
    currentOriginFiberRef.current = originFiber;
    removeCurrentOriginObserverRef.current = originFiber.addObserver((exit) => {
      if (currentOriginFiberRef.current === originFiber) {
        removeCurrentOriginObserverRef.current = null;
        currentOriginFiberRef.current = null;
      }

      if (
        originRequestIdRef.current !== requestId ||
        (!activeRef.current && !pendingActivationRef.current)
      ) {
        return;
      }

      pendingActivationRef.current = false;

      if (Exit.isSuccess(exit)) {
        setOrigin({ origin: exit.value, status: "ready" });
        return;
      }

      setOrigin({ reason: "current_location_failed", status: "needs_origin" });
    });
  }, [
    cancelCurrentOriginRequest,
    handleOriginDialogOpen,
    requestCurrentOriginService,
    routeProximityLocationEnabled,
  ]);

  React.useEffect(() => {
    if (!active || rankingInput === null || rankingInputKey === null) {
      return;
    }

    const needsRouteLines = includeRouteLines;
    const retryRequested = rankingRetryTokenRef.current !== rankingRetryToken;
    rankingRetryTokenRef.current = rankingRetryToken;
    const reusableRequest = requestRef.current;
    if (
      !retryRequested &&
      reusableRequest.status === "success" &&
      isReusableProximityResponse({
        currentInputKey: rankingInputKey,
        needsRouteLines,
        requestState: reusableRequest,
      })
    ) {
      return;
    }

    const currentRankingInput = rankingInput;
    const currentRankingInputKey = rankingInputKey;
    const requestId = rankRequestIdRef.current + 1;
    rankRequestIdRef.current = requestId;
    setRequest({
      includeRouteLines: needsRouteLines,
      inputKey: currentRankingInputKey,
      status: "loading",
    });
    setSelectedId(null);
    let rankingFiber: Fiber.Fiber<TResponse, unknown> | null = null;
    let removeRankingObserver: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      runRankingRequest();
    }, rankingDebounceMs);

    function runRankingRequest() {
      if (rankRequestIdRef.current !== requestId || !activeRef.current) {
        return;
      }
      rankingFiber = Effect.runFork(rank(currentRankingInput));
      removeRankingObserver = rankingFiber.addObserver((exit) => {
        if (rankRequestIdRef.current !== requestId || !activeRef.current) {
          return;
        }

        if (Exit.isSuccess(exit)) {
          setRequest({
            includeRouteLines: needsRouteLines,
            inputKey: currentRankingInputKey,
            response: exit.value,
            status: "success",
          });
          setSelectedId(getFirstSelectionId(exit.value));
          return;
        }

        setRequest({
          includeRouteLines: needsRouteLines,
          inputKey: currentRankingInputKey,
          message: getFailureMessage(exit.cause),
          status: "failed",
        });
      });
    }

    return () => {
      window.clearTimeout(timeoutId);
      removeRankingObserver?.();
      if (rankingFiber !== null) {
        void Effect.runFork(Fiber.interrupt(rankingFiber));
      }
      if (rankRequestIdRef.current === requestId) {
        rankRequestIdRef.current += 1;
      }
    };
  }, [
    active,
    getFailureMessage,
    getFirstSelectionId,
    includeRouteLines,
    rank,
    rankingDebounceMs,
    rankingInput,
    rankingInputKey,
    rankingRetryToken,
  ]);

  React.useEffect(() => {
    if (
      !active ||
      currentLocationRequestKey === currentLocationRequestKeyRef.current
    ) {
      return;
    }

    currentLocationRequestKeyRef.current = currentLocationRequestKey;
    requestCurrentOrigin();
  }, [active, currentLocationRequestKey, requestCurrentOrigin]);

  React.useEffect(() => {
    if (active) {
      return;
    }

    originRequestIdRef.current += 1;
    rankRequestIdRef.current += 1;
    pendingActivationRef.current = false;
    cancelCurrentOriginRequest();
    resetOriginDialog();
    resetProximity();
  }, [active, cancelCurrentOriginRequest, resetOriginDialog, resetProximity]);

  const retryRanking = React.useCallback(() => {
    setRankingRetryToken((current) => current + 1);
  }, []);

  const handleSelectedIdChange = React.useCallback(
    (nextSelectedId: TSelectedId) => {
      setSelectedId(nextSelectedId);
    },
    []
  );

  const enableNearMe = React.useCallback(() => {
    pendingActivationRef.current = true;
    onActiveChange(true);
    requestCurrentOrigin();
  }, [onActiveChange, requestCurrentOrigin]);

  const disableNearMe = React.useCallback(() => {
    originRequestIdRef.current += 1;
    rankRequestIdRef.current += 1;
    pendingActivationRef.current = false;
    cancelCurrentOriginRequest();
    resetOriginDialog();
    resetProximity();
    onActiveChange(false);
  }, [
    cancelCurrentOriginRequest,
    onActiveChange,
    resetOriginDialog,
    resetProximity,
  ]);

  return {
    confirmTypedOrigin: confirmSelectedOrigin,
    disableNearMe,
    enableNearMe,
    handleOriginDialogOpen,
    handleOriginQueryChange,
    handleSelectedIdChange,
    handleSuggestionSelect,
    origin,
    originDialogError,
    originDialogLoading,
    originDialogOpen,
    originQuery,
    originSuggestions,
    rankingInputKey,
    request,
    requestCurrentOrigin,
    retryRanking,
    selectedId,
    selectedSuggestion,
  };
}

export function isReusableProximityResponse<TResponse>({
  currentInputKey,
  needsRouteLines,
  requestState,
}: {
  readonly currentInputKey: string | null;
  readonly needsRouteLines: boolean;
  readonly requestState: Exclude<
    ProximityRunRequestState<TResponse>,
    { status: "idle" }
  >;
}) {
  return (
    currentInputKey !== null &&
    requestState.inputKey === currentInputKey &&
    (!needsRouteLines || requestState.includeRouteLines)
  );
}
