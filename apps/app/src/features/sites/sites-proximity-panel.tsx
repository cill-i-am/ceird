"use client";

import type {
  ProximityLimit,
  ProximityOriginInput,
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
import { Cause, Option } from "effect";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { rankNearbySites } from "#/features/proximity/proximity-api";
import {
  formatCandidateCapLabel,
  formatRouteComputedAt,
} from "#/features/proximity/proximity-format";
import { ProximityLimitSelect } from "#/features/proximity/proximity-limit-select";
import { ProximityOriginDialog } from "#/features/proximity/proximity-origin-dialog";
import type {
  ProximityOriginRunState,
  ProximityRunRequestState,
} from "#/features/proximity/proximity-run-controller";
import {
  isReusableProximityResponse,
  useProximityRunController,
} from "#/features/proximity/proximity-run-controller";
import type { ProximityResultLimitOption } from "#/features/proximity/proximity-state";
import { ProximityStatusPanel } from "#/features/proximity/proximity-status-panel";
import { cn } from "#/lib/utils";

import type { SitesMapFilter } from "./sites-page";
import { SitesProximityRow } from "./sites-proximity-row";
import type { SitesViewMode } from "./sites-search";

const LazySitesProximityMap = React.lazy(async () => {
  const module = await import("./sites-proximity-map");

  return { default: module.SitesProximityMap };
});

type SitesProximityRequestState =
  ProximityRunRequestState<SiteProximityResponse>;

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
  readonly routeProximityLocationEnabled: boolean;
  readonly showToolbar?: boolean;
  readonly viewMode?: SitesViewMode | undefined;
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
  routeProximityLocationEnabled,
  showToolbar = true,
  viewMode = "list",
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
    routeProximityLocationEnabled,
    viewMode,
  });
  const hasCurrentRouteResults = hasCurrentSitesProximityRouteResults({
    active,
    currentInputKey: rankingInputKey,
    needsRouteLines: viewMode === "map",
    requestState: request,
  });
  const shouldRenderProximityShell = showToolbar || active;
  return (
    <>
      {shouldRenderProximityShell ? (
        <section
          aria-label="Route-aware site proximity"
          className={cn(
            "grid gap-3 rounded-lg border bg-muted/10 p-3",
            active ? "border-primary/25" : "border-border"
          )}
        >
          {showToolbar ? (
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
          ) : null}

          {active ? (
            <SitesProximityContent
              currentInputKey={rankingInputKey}
              mapFilter={mapFilter}
              originState={origin}
              requestCurrentOrigin={requestCurrentOrigin}
              requestState={request}
              retryRanking={retryRanking}
              routeProximityLocationEnabled={routeProximityLocationEnabled}
              selectedSiteId={selectedSiteId}
              viewMode={viewMode}
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
      ) : null}
      {hasCurrentRouteResults ? null : children}
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
  routeProximityLocationEnabled,
  viewMode,
}: {
  readonly active: boolean;
  readonly currentLocationRequestKey: number;
  readonly limit: ProximityLimit;
  readonly mapFilter: SitesMapFilter;
  readonly onActiveChange: (active: boolean) => void;
  readonly query: string;
  readonly routeProximityLocationEnabled: boolean;
  readonly viewMode: SitesViewMode;
}) {
  const buildInput = React.useCallback(
    ({
      includeRouteLines,
      origin,
    }: {
      readonly includeRouteLines: boolean;
      readonly origin: ProximityOriginInput;
    }) =>
      buildSiteProximityInput({
        includeRouteLines,
        limit,
        origin,
        query,
      }),
    [limit, query]
  );
  const isInputEligible = React.useCallback(
    () => mapFilter !== "unmapped",
    [mapFilter]
  );
  const getFirstSelectionId = React.useCallback(
    (response: SiteProximityResponse) => response.rows[0]?.site.id ?? null,
    []
  );

  const controller = useProximityRunController<
    SiteProximityInput,
    SiteProximityResponse,
    string
  >({
    active,
    buildInput,
    currentLocationRequestKey,
    getFailureMessage: getRouteRequestFailureMessage,
    getFirstSelectionId,
    includeRouteLines: viewMode === "map",
    isInputEligible,
    makeInputKey: makeSiteProximityInputKey,
    rank: rankNearbySites,
    routeProximityLocationEnabled,
    onActiveChange,
  });

  return {
    confirmTypedOrigin: controller.confirmTypedOrigin,
    disableNearMe: controller.disableNearMe,
    enableNearMe: controller.enableNearMe,
    handleOriginDialogOpen: controller.handleOriginDialogOpen,
    handleOriginQueryChange: controller.handleOriginQueryChange,
    handleSelectedSiteIdChange: controller.handleSelectedIdChange,
    handleSuggestionSelect: controller.handleSuggestionSelect,
    origin: controller.origin,
    originDialogError: controller.originDialogError,
    originDialogLoading: controller.originDialogLoading,
    originDialogOpen: controller.originDialogOpen,
    originQuery: controller.originQuery,
    originSuggestions: controller.originSuggestions,
    rankingInputKey: controller.rankingInputKey,
    request: controller.request,
    requestCurrentOrigin: controller.requestCurrentOrigin,
    retryRanking: controller.retryRanking,
    selectedSiteId: controller.selectedId,
    selectedSuggestion: controller.selectedSuggestion,
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
  readonly originState: ProximityOriginRunState;
  readonly requestCurrentOrigin: () => void;
  readonly requestState: SitesProximityRequestState;
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
  routeProximityLocationEnabled,
  selectedSiteId,
  viewMode,
  onClearFilters,
  onOriginDialogOpen,
  onSelectedSiteIdChange,
}: {
  readonly currentInputKey: string | null;
  readonly mapFilter: SitesMapFilter;
  readonly originState: ProximityOriginRunState;
  readonly requestCurrentOrigin: () => void;
  readonly requestState: SitesProximityRequestState;
  readonly retryRanking: () => void;
  readonly routeProximityLocationEnabled: boolean;
  readonly selectedSiteId: string | null;
  readonly viewMode: SitesViewMode;
  readonly onClearFilters: () => void;
  readonly onOriginDialogOpen: (open: boolean) => void;
  readonly onSelectedSiteIdChange: (siteId: string) => void;
}) {
  if (originState.status === "idle") {
    const currentLocationDisabled = !routeProximityLocationEnabled;

    return (
      <ProximityStatusPanel
        state={{
          description: currentLocationDisabled
            ? "Current location access is off. Choose an origin before calculating traffic-aware driving routes."
            : "Use current location or choose an origin before calculating traffic-aware driving routes.",
          kind: "origin_required",
          title: "Choose where routes start",
        }}
        action={
          <div className="flex flex-wrap gap-2">
            {currentLocationDisabled ? null : (
              <Button type="button" size="sm" onClick={requestCurrentOrigin}>
                Use current location
              </Button>
            )}
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
    const currentLocationDisabled =
      originState.reason === "current_location_disabled";

    return (
      <ProximityStatusPanel
        state={{
          description: currentLocationDisabled
            ? "Current location access is off. Choose an origin to calculate driving routes without sharing current location."
            : "Ceird could not get your current location. Choose an origin to calculate driving routes without sharing current location.",
          kind: "location_blocked",
          title: currentLocationDisabled
            ? "Current location access is off"
            : "Current location unavailable",
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
      {viewMode === "map" ? (
        <React.Suspense
          fallback={
            <div
              aria-hidden
              className="min-h-[360px] rounded-lg border bg-muted/20"
            />
          }
        >
          <LazySitesProximityMap
            origin={requestState.response.origin}
            rows={requestState.response.rows}
            selectedSiteId={selectedSiteId}
            onSelectedSiteIdChange={onSelectedSiteIdChange}
          />
        </React.Suspense>
      ) : null}
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
  includeRouteLines,
  limit,
  origin,
  query,
}: {
  readonly includeRouteLines: boolean;
  readonly limit: ProximityLimit;
  readonly origin: ProximityOriginInput;
  readonly query: string;
}): SiteProximityInput {
  const trimmedQuery = query.trim();

  return {
    ...(trimmedQuery.length === 0 ? {} : { filters: { query: trimmedQuery } }),
    includeRouteLines,
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

function hasCurrentSitesProximityRouteResults({
  active,
  currentInputKey,
  needsRouteLines,
  requestState,
}: {
  readonly active: boolean;
  readonly currentInputKey: string | null;
  readonly needsRouteLines: boolean;
  readonly requestState: SitesProximityRequestState;
}) {
  return (
    active &&
    needsRouteLines &&
    requestState.status === "success" &&
    isReusableSiteProximityResponse({
      currentInputKey,
      needsRouteLines,
      requestState,
    })
  );
}

function isReusableSiteProximityResponse({
  currentInputKey,
  needsRouteLines,
  requestState,
}: {
  readonly currentInputKey: string | null;
  readonly needsRouteLines: boolean;
  readonly requestState: Exclude<
    SitesProximityRequestState,
    { status: "idle" }
  >;
}) {
  return isReusableProximityResponse({
    currentInputKey,
    needsRouteLines,
    requestState,
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
