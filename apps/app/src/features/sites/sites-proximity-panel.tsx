"use client";

import type {
  CurrentLocationOrigin,
  ProximityLimit,
  ProximityOriginAutocompleteResponse,
  ProximityOriginInput,
  ProximityOriginPlaceDetailsResponse,
  ProximityOriginSuggestion,
} from "@ceird/proximity-core";
import {
  PROXIMITY_ACCESS_DENIED_ERROR_TAG,
  PROXIMITY_COST_GUARD_ERROR_TAG,
  PROXIMITY_ORIGIN_RESOLUTION_ERROR_TAG,
  PROXIMITY_PROVIDER_ERROR_TAG,
  PROXIMITY_ROUTE_UNAVAILABLE_ERROR_TAG,
} from "@ceird/proximity-core";
import type {
  SiteProximityInput,
  SiteProximityResponse,
} from "@ceird/sites-core";
import {
  Cancel01Icon,
  Location01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cause, Effect, Exit, Fiber, Option } from "effect";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  autocompleteProximityOrigin,
  rankNearbySites,
  resolveProximityOriginPlace,
} from "#/features/proximity/proximity-api";
import {
  formatCandidateCapLabel,
  formatRouteComputedAt,
} from "#/features/proximity/proximity-format";
import { ProximityLimitSelect } from "#/features/proximity/proximity-limit-select";
import { requestCurrentLocationOrigin } from "#/features/proximity/proximity-location-access";
import { createProximityOriginSessionToken } from "#/features/proximity/proximity-origin";
import { ProximityOriginDialog } from "#/features/proximity/proximity-origin-dialog";
import type { ProximityResultLimitOption } from "#/features/proximity/proximity-state";
import { ProximityStatusPanel } from "#/features/proximity/proximity-status-panel";
import { cn } from "#/lib/utils";

import type { SitesMapFilter } from "./sites-page";
import { SitesProximityRow } from "./sites-proximity-row";

type ProximityRequestState =
  | { readonly status: "idle" }
  | { readonly inputKey: string; readonly status: "loading" }
  | {
      readonly inputKey: string;
      readonly response: SiteProximityResponse;
      readonly status: "success";
    }
  | {
      readonly inputKey: string;
      readonly message: string;
      readonly status: "failed";
    };

type OriginRunState =
  | { readonly status: "idle" }
  | { readonly status: "requesting" }
  | { readonly origin: ProximityOriginInput; readonly status: "ready" }
  | {
      readonly reason: "current_location_failed";
      readonly status: "needs_origin";
    };

const ORIGIN_AUTOCOMPLETE_MIN_LENGTH = 3;
const ORIGIN_AUTOCOMPLETE_DEBOUNCE_MS = 250;
const ROUTE_RANKING_DEBOUNCE_MS = 300;
const TYPED_ORIGIN_FAILURE_MESSAGE =
  "Ceird could not use that origin. Select another result or try again.";

interface SitesProximityPanelState {
  readonly origin: OriginRunState;
  readonly originDialogError: string | null;
  readonly originDialogLoading: boolean;
  readonly originDialogOpen: boolean;
  readonly originQuery: string;
  readonly originSuggestions: readonly ProximityOriginSuggestion[];
  readonly rankingRetryToken: number;
  readonly request: ProximityRequestState;
  readonly selectedSiteId: string | null;
  readonly selectedSuggestion: ProximityOriginSuggestion | null;
}

type SitesProximityPanelAction =
  | { readonly origin: OriginRunState; readonly type: "origin" }
  | {
      readonly request: ProximityRequestState;
      readonly selectedSiteId?: string | null;
      readonly type: "request";
    }
  | { readonly open: boolean; readonly type: "origin_dialog_open" }
  | { readonly query: string; readonly type: "origin_query" }
  | {
      readonly suggestions: readonly ProximityOriginSuggestion[];
      readonly type: "origin_suggestions";
    }
  | {
      readonly suggestion: ProximityOriginSuggestion | null;
      readonly type: "selected_suggestion";
    }
  | { readonly type: "typed_origin_start" }
  | {
      readonly origin: ProximityOriginInput;
      readonly type: "typed_origin_success";
    }
  | { readonly type: "typed_origin_failure" }
  | { readonly siteId: string | null; readonly type: "selected_site" }
  | { readonly type: "reset_dialog" }
  | { readonly type: "reset_proximity" }
  | { readonly type: "retry_ranking" };

const INITIAL_SITES_PROXIMITY_PANEL_STATE: SitesProximityPanelState = {
  origin: { status: "idle" },
  originDialogError: null,
  originDialogLoading: false,
  originDialogOpen: false,
  originQuery: "",
  originSuggestions: [],
  rankingRetryToken: 0,
  request: { status: "idle" },
  selectedSiteId: null,
  selectedSuggestion: null,
};

function sitesProximityPanelReducer(
  state: SitesProximityPanelState,
  action: SitesProximityPanelAction
): SitesProximityPanelState {
  switch (action.type) {
    case "origin": {
      return { ...state, origin: action.origin };
    }
    case "origin_dialog_open": {
      return { ...state, originDialogOpen: action.open };
    }
    case "origin_query": {
      return {
        ...state,
        originDialogError: null,
        originQuery: action.query,
        originSuggestions: [],
        selectedSuggestion: null,
      };
    }
    case "origin_suggestions": {
      return { ...state, originSuggestions: action.suggestions };
    }
    case "request": {
      return {
        ...state,
        request: action.request,
        selectedSiteId:
          action.selectedSiteId === undefined
            ? state.selectedSiteId
            : action.selectedSiteId,
      };
    }
    case "reset_dialog": {
      return {
        ...state,
        originDialogError: null,
        originDialogLoading: false,
        originQuery: "",
        originSuggestions: [],
        selectedSuggestion: null,
      };
    }
    case "reset_proximity": {
      return {
        ...state,
        origin: { status: "idle" },
        originDialogOpen: false,
        request: { status: "idle" },
        selectedSiteId: null,
      };
    }
    case "retry_ranking": {
      return { ...state, rankingRetryToken: state.rankingRetryToken + 1 };
    }
    case "selected_site": {
      return { ...state, selectedSiteId: action.siteId };
    }
    case "selected_suggestion": {
      return { ...state, selectedSuggestion: action.suggestion };
    }
    case "typed_origin_failure": {
      return {
        ...state,
        originDialogError: TYPED_ORIGIN_FAILURE_MESSAGE,
        originDialogLoading: false,
      };
    }
    case "typed_origin_start": {
      return {
        ...state,
        originDialogError: null,
        originDialogLoading: true,
      };
    }
    case "typed_origin_success": {
      return {
        ...state,
        origin: { origin: action.origin, status: "ready" },
        originDialogError: null,
        originDialogLoading: false,
        originDialogOpen: false,
        originQuery: "",
        originSuggestions: [],
        selectedSuggestion: null,
      };
    }
    default: {
      const exhaustiveAction: never = action;

      return exhaustiveAction;
    }
  }
}

export interface SitesProximityPanelProps {
  readonly active: boolean;
  readonly children?: React.ReactNode;
  readonly currentLocationRequestKey?: number | undefined;
  readonly limit: ProximityLimit;
  readonly mapFilter: SitesMapFilter;
  readonly onActiveChange: (active: boolean) => void;
  readonly onClearFilters: () => void;
  readonly onLimitChange: (limit: ProximityResultLimitOption) => void;
  readonly query: string;
}

export function SitesProximityPanel({
  active,
  children,
  currentLocationRequestKey = 0,
  limit,
  mapFilter,
  onActiveChange,
  onClearFilters,
  onLimitChange,
  query,
}: SitesProximityPanelProps) {
  const {
    confirmTypedOrigin,
    disableNearMe,
    enableNearMe,
    handleOriginDialogOpen,
    handleOriginQueryChange,
    handleSelectedSiteIdChange,
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
    selectedSiteId,
    selectedSuggestion,
  } = useSitesProximityPanelController({
    active,
    currentLocationRequestKey,
    limit,
    mapFilter,
    onActiveChange,
    query,
  });
  return (
    <>
      <section
        aria-label="Route-aware site proximity"
        className={cn(
          "grid gap-3 rounded-lg border bg-muted/10 p-3",
          active ? "border-primary/25" : "border-border"
        )}
      >
        <SitesProximityToolbar
          active={active}
          currentInputKey={rankingInputKey}
          limit={limit}
          originState={origin}
          requestCurrentOrigin={requestCurrentOrigin}
          requestState={request}
          retryRanking={retryRanking}
          onDisableNearMe={disableNearMe}
          onEnableNearMe={enableNearMe}
          onLimitChange={onLimitChange}
          onOriginDialogOpen={handleOriginDialogOpen}
        />

        {active ? (
          <SitesProximityContent
            currentInputKey={rankingInputKey}
            mapFilter={mapFilter}
            originState={origin}
            requestCurrentOrigin={requestCurrentOrigin}
            requestState={request}
            retryRanking={retryRanking}
            selectedSiteId={selectedSiteId}
            onClearFilters={onClearFilters}
            onOriginDialogOpen={handleOriginDialogOpen}
            onSelectedSiteIdChange={handleSelectedSiteIdChange}
          />
        ) : null}

        <ProximityOriginDialog
          error={originDialogError}
          loading={originDialogLoading}
          onConfirm={confirmTypedOrigin}
          onOpenChange={handleOriginDialogOpen}
          onQueryChange={handleOriginQueryChange}
          onSuggestionSelect={handleSuggestionSelect}
          open={originDialogOpen}
          query={originQuery}
          selectedSuggestion={selectedSuggestion}
          suggestions={originSuggestions}
        />
      </section>
      {children}
    </>
  );
}

function useSitesProximityPanelController({
  active,
  currentLocationRequestKey,
  limit,
  mapFilter,
  onActiveChange,
  query,
}: {
  readonly active: boolean;
  readonly currentLocationRequestKey: number;
  readonly limit: ProximityLimit;
  readonly mapFilter: SitesMapFilter;
  readonly onActiveChange: (active: boolean) => void;
  readonly query: string;
}) {
  const [state, dispatch] = React.useReducer(
    sitesProximityPanelReducer,
    INITIAL_SITES_PROXIMITY_PANEL_STATE
  );
  const sessionTokenRef = React.useRef(createProximityOriginSessionToken());
  const activeRef = React.useRef(active);
  const pendingActivationRef = React.useRef(false);
  const originRequestIdRef = React.useRef(0);
  const rankRequestIdRef = React.useRef(0);
  const typedOriginRequestIdRef = React.useRef(0);
  const currentLocationRequestKeyRef = React.useRef(currentLocationRequestKey);
  const currentOriginFiberRef = React.useRef<Fiber.Fiber<
    CurrentLocationOrigin,
    unknown
  > | null>(null);
  const removeCurrentOriginObserverRef = React.useRef<(() => void) | null>(
    null
  );
  const typedOriginFiberRef = React.useRef<Fiber.Fiber<
    ProximityOriginPlaceDetailsResponse,
    unknown
  > | null>(null);
  const removeTypedOriginObserverRef = React.useRef<(() => void) | null>(null);
  activeRef.current = active;

  const {
    origin,
    originDialogError,
    originDialogLoading,
    originDialogOpen,
    originQuery,
    originSuggestions,
    rankingRetryToken,
    request,
    selectedSiteId,
    selectedSuggestion,
  } = state;
  const rankingInput = React.useMemo(() => {
    if (!active || origin.status !== "ready" || mapFilter === "unmapped") {
      return null;
    }

    return buildSiteProximityInput({ limit, origin: origin.origin, query });
  }, [active, limit, mapFilter, origin, query]);
  const rankingInputKey = React.useMemo(
    () =>
      rankingInput === null ? null : makeSiteProximityInputKey(rankingInput),
    [rankingInput]
  );

  const cancelCurrentOriginRequest = React.useCallback(() => {
    removeCurrentOriginObserverRef.current?.();
    removeCurrentOriginObserverRef.current = null;
    if (currentOriginFiberRef.current !== null) {
      void Effect.runFork(Fiber.interrupt(currentOriginFiberRef.current));
      currentOriginFiberRef.current = null;
    }
  }, []);

  const cancelTypedOriginRequest = React.useCallback(() => {
    removeTypedOriginObserverRef.current?.();
    removeTypedOriginObserverRef.current = null;
    if (typedOriginFiberRef.current !== null) {
      void Effect.runFork(Fiber.interrupt(typedOriginFiberRef.current));
      typedOriginFiberRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      activeRef.current = false;
      pendingActivationRef.current = false;
      originRequestIdRef.current += 1;
      rankRequestIdRef.current += 1;
      typedOriginRequestIdRef.current += 1;
      cancelCurrentOriginRequest();
      cancelTypedOriginRequest();
    },
    [cancelCurrentOriginRequest, cancelTypedOriginRequest]
  );

  const requestCurrentOrigin = React.useCallback(() => {
    cancelCurrentOriginRequest();
    const requestId = originRequestIdRef.current + 1;
    originRequestIdRef.current = requestId;
    dispatch({ origin: { status: "requesting" }, type: "origin" });

    const originFiber = Effect.runFork(requestCurrentLocationOrigin());
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
        dispatch({
          origin: { origin: exit.value, status: "ready" },
          type: "origin",
        });
        return;
      }

      dispatch({
        origin: { reason: "current_location_failed", status: "needs_origin" },
        type: "origin",
      });
    });
  }, [cancelCurrentOriginRequest]);

  React.useEffect(() => {
    if (!active || rankingInput === null || rankingInputKey === null) {
      return;
    }

    const currentRankingInput = rankingInput;
    const currentRankingInputKey = rankingInputKey;
    const requestId = rankRequestIdRef.current + 1;
    rankRequestIdRef.current = requestId;
    dispatch({
      request: { inputKey: currentRankingInputKey, status: "loading" },
      selectedSiteId: null,
      type: "request",
    });
    let rankingFiber: Fiber.Fiber<SiteProximityResponse, unknown> | null = null;
    let removeRankingObserver: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      runRankingRequest();
    }, ROUTE_RANKING_DEBOUNCE_MS);

    function runRankingRequest() {
      if (rankRequestIdRef.current !== requestId || !activeRef.current) {
        return;
      }
      rankingFiber = Effect.runFork(rankNearbySites(currentRankingInput));
      removeRankingObserver = rankingFiber.addObserver((exit) => {
        if (rankRequestIdRef.current !== requestId || !activeRef.current) {
          return;
        }

        if (Exit.isSuccess(exit)) {
          dispatch({
            request: {
              inputKey: currentRankingInputKey,
              response: exit.value,
              status: "success",
            },
            selectedSiteId: exit.value.rows[0]?.site.id ?? null,
            type: "request",
          });
          return;
        }

        dispatch({
          request: {
            inputKey: currentRankingInputKey,
            message: getRouteRequestFailureMessage(exit.cause),
            status: "failed",
          },
          type: "request",
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
  }, [active, rankingInput, rankingInputKey, rankingRetryToken]);

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
    typedOriginRequestIdRef.current += 1;
    pendingActivationRef.current = false;
    cancelCurrentOriginRequest();
    cancelTypedOriginRequest();
    dispatch({ type: "reset_proximity" });
  }, [active, cancelCurrentOriginRequest, cancelTypedOriginRequest]);

  const trimmedOriginQuery = originQuery.trim();

  React.useEffect(() => {
    if (
      !originDialogOpen ||
      trimmedOriginQuery.length < ORIGIN_AUTOCOMPLETE_MIN_LENGTH
    ) {
      dispatch({ suggestions: [], type: "origin_suggestions" });
      return;
    }

    let requestActive = true;
    let autocompleteFiber: Fiber.Fiber<
      ProximityOriginAutocompleteResponse,
      unknown
    > | null = null;
    let removeAutocompleteObserver: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      runAutocompleteRequest();
    }, ORIGIN_AUTOCOMPLETE_DEBOUNCE_MS);

    function runAutocompleteRequest() {
      if (!requestActive) {
        return;
      }

      autocompleteFiber = Effect.runFork(
        autocompleteProximityOrigin({
          country: "IE",
          input: trimmedOriginQuery,
          sessionToken: sessionTokenRef.current,
        })
      );
      removeAutocompleteObserver = autocompleteFiber.addObserver((exit) => {
        if (!requestActive || !Exit.isSuccess(exit)) {
          return;
        }

        dispatch({
          suggestions: exit.value.suggestions,
          type: "origin_suggestions",
        });
      });
    }

    return () => {
      requestActive = false;
      window.clearTimeout(timeoutId);
      removeAutocompleteObserver?.();
      if (autocompleteFiber !== null) {
        void Effect.runFork(Fiber.interrupt(autocompleteFiber));
      }
    };
  }, [originDialogOpen, trimmedOriginQuery]);

  React.useEffect(() => {
    if (originDialogOpen) {
      return;
    }

    typedOriginRequestIdRef.current += 1;
    cancelTypedOriginRequest();
    sessionTokenRef.current = createProximityOriginSessionToken();
    dispatch({ type: "reset_dialog" });
  }, [cancelTypedOriginRequest, originDialogOpen]);

  const retryRanking = React.useCallback(() => {
    dispatch({ type: "retry_ranking" });
  }, []);

  const handleOriginDialogOpen = React.useCallback((open: boolean) => {
    dispatch({ open, type: "origin_dialog_open" });
  }, []);

  const handleOriginQueryChange = React.useCallback(
    (nextQuery: string) => {
      if (originQuery.trim().length > 0 && nextQuery.trim().length === 0) {
        sessionTokenRef.current = createProximityOriginSessionToken();
      }

      dispatch({ query: nextQuery, type: "origin_query" });
    },
    [originQuery]
  );

  const handleSuggestionSelect = React.useCallback(
    (suggestion: ProximityOriginSuggestion) => {
      dispatch({ suggestion, type: "selected_suggestion" });
    },
    []
  );

  const handleSelectedSiteIdChange = React.useCallback((siteId: string) => {
    dispatch({ siteId, type: "selected_site" });
  }, []);

  const confirmTypedOrigin = React.useCallback(
    (suggestion: ProximityOriginSuggestion) => {
      cancelTypedOriginRequest();
      const requestId = typedOriginRequestIdRef.current + 1;
      typedOriginRequestIdRef.current = requestId;
      dispatch({ type: "typed_origin_start" });

      const originFiber = Effect.runFork(
        resolveProximityOriginPlace({
          placeId: suggestion.placeId,
          rawInput: originQuery.trim() || suggestion.displayText,
          sessionToken: sessionTokenRef.current,
        })
      );
      typedOriginFiberRef.current = originFiber;
      removeTypedOriginObserverRef.current = originFiber.addObserver((exit) => {
        if (typedOriginFiberRef.current === originFiber) {
          removeTypedOriginObserverRef.current = null;
          typedOriginFiberRef.current = null;
        }

        if (
          typedOriginRequestIdRef.current !== requestId ||
          !activeRef.current
        ) {
          return;
        }

        if (Exit.isSuccess(exit)) {
          sessionTokenRef.current = createProximityOriginSessionToken();
          dispatch({
            origin: exit.value.origin,
            type: "typed_origin_success",
          });
          return;
        }

        dispatch({ type: "typed_origin_failure" });
      });
    },
    [cancelTypedOriginRequest, originQuery]
  );

  const enableNearMe = React.useCallback(() => {
    pendingActivationRef.current = true;
    onActiveChange(true);
    requestCurrentOrigin();
  }, [onActiveChange, requestCurrentOrigin]);

  const disableNearMe = React.useCallback(() => {
    originRequestIdRef.current += 1;
    rankRequestIdRef.current += 1;
    typedOriginRequestIdRef.current += 1;
    pendingActivationRef.current = false;
    cancelCurrentOriginRequest();
    cancelTypedOriginRequest();
    dispatch({ type: "reset_proximity" });
    onActiveChange(false);
  }, [cancelCurrentOriginRequest, cancelTypedOriginRequest, onActiveChange]);

  return {
    confirmTypedOrigin,
    disableNearMe,
    enableNearMe,
    handleOriginDialogOpen,
    handleOriginQueryChange,
    handleSelectedSiteIdChange,
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
    selectedSiteId,
    selectedSuggestion,
  };
}

function SitesProximityToolbar({
  active,
  currentInputKey,
  limit,
  originState,
  requestCurrentOrigin,
  requestState,
  retryRanking,
  onDisableNearMe,
  onEnableNearMe,
  onLimitChange,
  onOriginDialogOpen,
}: {
  readonly active: boolean;
  readonly currentInputKey: string | null;
  readonly limit: ProximityLimit;
  readonly originState: OriginRunState;
  readonly requestCurrentOrigin: () => void;
  readonly requestState: ProximityRequestState;
  readonly retryRanking: () => void;
  readonly onDisableNearMe: () => void;
  readonly onEnableNearMe: () => void;
  readonly onLimitChange: (limit: ProximityResultLimitOption) => void;
  readonly onOriginDialogOpen: (open: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={active ? "default" : "outline"}
          aria-pressed={active}
          onClick={active ? onDisableNearMe : onEnableNearMe}
        >
          <HugeiconsIcon
            icon={active ? Cancel01Icon : Location01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Near me
        </Button>
        {active ? (
          <Badge variant="outline" className="rounded-full">
            Mapped only
          </Badge>
        ) : null}
        <ProximityLimitSelect
          disabled={!active}
          id="sites-proximity-route-limit"
          value={limit}
          onLimitChange={onLimitChange}
        />
      </div>
      {active ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {requestState.status === "success" &&
          requestState.inputKey === currentInputKey ? (
            <span>
              {formatRouteComputedAt(requestState.response.origin.computedAt)}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (originState.status === "ready") {
                retryRanking();
                return;
              }

              requestCurrentOrigin();
            }}
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onOriginDialogOpen(true)}
          >
            Change origin
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SitesProximityContent({
  currentInputKey,
  mapFilter,
  originState,
  requestCurrentOrigin,
  requestState,
  retryRanking,
  selectedSiteId,
  onClearFilters,
  onOriginDialogOpen,
  onSelectedSiteIdChange,
}: {
  readonly currentInputKey: string | null;
  readonly mapFilter: SitesMapFilter;
  readonly originState: OriginRunState;
  readonly requestCurrentOrigin: () => void;
  readonly requestState: ProximityRequestState;
  readonly retryRanking: () => void;
  readonly selectedSiteId: string | null;
  readonly onClearFilters: () => void;
  readonly onOriginDialogOpen: (open: boolean) => void;
  readonly onSelectedSiteIdChange: (siteId: string) => void;
}) {
  if (originState.status === "idle") {
    return (
      <ProximityStatusPanel
        state={{
          description:
            "Use current location or choose an origin before calculating traffic-aware driving routes.",
          kind: "origin_required",
          title: "Choose where routes start",
        }}
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={requestCurrentOrigin}>
              Use current location
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onOriginDialogOpen(true)}
            >
              Change origin
            </Button>
          </div>
        }
      />
    );
  }

  if (originState.status === "requesting") {
    return (
      <ProximityStatusPanel
        state={{ kind: "loading", title: "Getting current location" }}
      />
    );
  }

  if (originState.status === "needs_origin") {
    return (
      <ProximityStatusPanel
        state={{
          description:
            "Ceird could not get your current location. Choose an origin to calculate driving routes without sharing current location.",
          kind: "location_blocked",
          title: "Current location unavailable",
        }}
        action={
          <Button
            type="button"
            size="sm"
            onClick={() => onOriginDialogOpen(true)}
          >
            Change origin
          </Button>
        }
      />
    );
  }

  if (mapFilter === "unmapped") {
    return (
      <ProximityStatusPanel
        state={{
          description:
            "Route-aware proximity can only rank sites with mapped coordinates. Switch to all or mapped sites to rank nearby sites.",
          kind: "empty",
          title: "Nearby sites are mapped sites",
        }}
      />
    );
  }

  if (
    currentInputKey !== null &&
    requestState.status !== "idle" &&
    requestState.inputKey !== currentInputKey
  ) {
    return null;
  }

  if (requestState.status === "loading") {
    return (
      <ProximityStatusPanel
        state={{ kind: "loading", title: "Ranking nearby sites" }}
      />
    );
  }

  if (requestState.status === "failed") {
    return (
      <ProximityStatusPanel
        state={{
          description: requestState.message,
          kind: "provider_unavailable",
          title: "Nearby sites could not be ranked",
        }}
        action={
          <Button type="button" size="sm" onClick={retryRanking}>
            Try again
          </Button>
        }
      />
    );
  }

  if (requestState.status !== "success") {
    return null;
  }

  if (requestState.response.rows.length === 0) {
    return (
      <ProximityStatusPanel
        state={{
          description:
            "No mapped sites match the selected filters with a driving route from this origin.",
          kind: "empty",
          title: "No nearby sites match these filters",
        }}
        action={
          <Button type="button" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {formatCandidateCapLabel(
            requestState.response.meta,
            "sites",
            requestState.response.rows.length
          )}
        </span>
      </div>
      <div className="grid gap-2">
        {requestState.response.rows.map((row, index) => (
          <SitesProximityRow
            key={row.site.id}
            origin={requestState.response.origin}
            rank={index + 1}
            row={row}
            selected={selectedSiteId === row.site.id}
            onSelect={() => onSelectedSiteIdChange(row.site.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function buildSiteProximityInput({
  limit,
  origin,
  query,
}: {
  readonly limit: ProximityLimit;
  readonly origin: ProximityOriginInput;
  readonly query: string;
}): SiteProximityInput {
  const trimmedQuery = query.trim();

  return {
    ...(trimmedQuery.length === 0 ? {} : { filters: { query: trimmedQuery } }),
    includeRouteLines: false,
    limit,
    origin,
  };
}

function makeSiteProximityInputKey(input: SiteProximityInput) {
  return JSON.stringify({
    filters: input.filters,
    limit: input.limit,
    origin: input.origin,
  });
}

function getRouteRequestFailureMessage(cause: Cause.Cause<unknown>) {
  const failure = Cause.findErrorOption(cause);

  if (Option.isSome(failure)) {
    const tag = readErrorTag(failure.value);

    if (tag === PROXIMITY_COST_GUARD_ERROR_TAG) {
      return "Route ranking is temporarily limited. Try again shortly.";
    }
    if (tag === PROXIMITY_ACCESS_DENIED_ERROR_TAG) {
      return "Ceird cannot calculate routes for this workspace.";
    }
    if (tag === PROXIMITY_ROUTE_UNAVAILABLE_ERROR_TAG) {
      return "Ceird could not find driving routes for the selected sites.";
    }
    if (tag === PROXIMITY_PROVIDER_ERROR_TAG) {
      return "The route provider could not calculate traffic-aware driving times.";
    }
    if (tag === PROXIMITY_ORIGIN_RESOLUTION_ERROR_TAG) {
      return "Ceird could not use that origin for route ranking.";
    }
  }

  return "The route provider could not calculate traffic-aware driving times. Ordinary sites are still available.";
}

function readErrorTag(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return;
  }

  return typeof error._tag === "string" ? error._tag : undefined;
}
