"use client";

import type {
  JobProximityFilters,
  JobProximityInput,
  JobProximityResponse,
} from "@ceird/jobs-core";
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
import { rankNearbyJobs } from "#/features/proximity/proximity-api";
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

import { JobsProximityRow } from "./jobs-proximity-row";
import type { JobsListFilters } from "./jobs-state";

type JobsViewMode = "list" | "map";

type JobsProximityRequestState = ProximityRunRequestState<JobProximityResponse>;

const LazyJobsProximityMap = React.lazy(async () => {
  const module = await import("./jobs-proximity-map");

  return { default: module.JobsProximityMap };
});

export interface JobsProximityPanelProps {
  readonly active: boolean;
  readonly children?: React.ReactNode;
  readonly currentLocationRequestKey?: number | undefined;
  readonly filters: JobsListFilters;
  readonly limit: ProximityLimit;
  readonly onActiveChange: (active: boolean) => void;
  readonly onClearFilters: () => void;
  readonly onLimitChange: (limit: ProximityResultLimitOption) => void;
  readonly routeProximityLocationEnabled: boolean;
  readonly showToolbar?: boolean;
  readonly viewMode: JobsViewMode;
}

export function JobsProximityPanel({
  active,
  children,
  currentLocationRequestKey = 0,
  filters,
  limit,
  onActiveChange,
  onClearFilters,
  onLimitChange,
  routeProximityLocationEnabled,
  showToolbar = true,
  viewMode,
}: JobsProximityPanelProps) {
  const {
    origin,
    originDialogError,
    originDialogLoading,
    originDialogOpen,
    originQuery,
    originSuggestions,
    request,
    selectedJobId,
    selectedSuggestion,
    rankingInputKey,
    requestCurrentOrigin,
    retryRanking,
    handleOriginDialogOpen,
    handleOriginQueryChange,
    handleSuggestionSelect,
    handleSelectedJobIdChange,
    confirmTypedOrigin,
    enableNearMe,
    disableNearMe,
  } = useJobsProximityPanelController({
    active,
    currentLocationRequestKey,
    filters,
    limit,
    onActiveChange,
    routeProximityLocationEnabled,
    viewMode,
  });
  const hasCurrentRouteResults = hasCurrentJobsProximityRouteResults({
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
          aria-label="Route-aware job proximity"
          className={cn(
            "grid gap-3 rounded-lg border bg-muted/10 p-3",
            active ? "border-primary/25" : "border-border"
          )}
        >
          {showToolbar ? (
            <JobsProximityToolbar
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
            <JobsProximityContent
              onClearFilters={onClearFilters}
              currentInputKey={rankingInputKey}
              originState={origin}
              requestCurrentOrigin={requestCurrentOrigin}
              requestState={request}
              retryRanking={retryRanking}
              routeProximityLocationEnabled={routeProximityLocationEnabled}
              selectedJobId={selectedJobId}
              onOriginDialogOpen={handleOriginDialogOpen}
              onSelectedJobIdChange={handleSelectedJobIdChange}
              viewMode={viewMode}
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

function useJobsProximityPanelController({
  active,
  currentLocationRequestKey,
  filters,
  limit,
  onActiveChange,
  routeProximityLocationEnabled,
  viewMode,
}: {
  readonly active: boolean;
  readonly currentLocationRequestKey: number;
  readonly filters: JobsListFilters;
  readonly limit: ProximityLimit;
  readonly onActiveChange: (active: boolean) => void;
  readonly routeProximityLocationEnabled: boolean;
  readonly viewMode: JobsViewMode;
}) {
  const buildInput = React.useCallback(
    ({
      includeRouteLines,
      origin,
    }: {
      readonly includeRouteLines: boolean;
      readonly origin: ProximityOriginInput;
    }) =>
      buildJobProximityInput({
        filters,
        includeRouteLines,
        limit,
        origin,
      }),
    [filters, limit]
  );
  const isInputEligible = React.useCallback(() => true, []);
  const getFirstSelectionId = React.useCallback(
    (response: JobProximityResponse) => response.rows[0]?.job.id ?? null,
    []
  );

  const controller = useProximityRunController<
    JobProximityInput,
    JobProximityResponse,
    string
  >({
    active,
    buildInput,
    currentLocationRequestKey,
    getFailureMessage: getRouteRequestFailureMessage,
    getFirstSelectionId,
    includeRouteLines: viewMode === "map",
    isInputEligible,
    makeInputKey: makeJobProximityInputKey,
    rank: rankNearbyJobs,
    routeProximityLocationEnabled,
    onActiveChange,
  });

  return {
    confirmTypedOrigin: controller.confirmTypedOrigin,
    disableNearMe: controller.disableNearMe,
    enableNearMe: controller.enableNearMe,
    handleOriginDialogOpen: controller.handleOriginDialogOpen,
    handleOriginQueryChange: controller.handleOriginQueryChange,
    handleSelectedJobIdChange: controller.handleSelectedIdChange,
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
    selectedJobId: controller.selectedId,
    selectedSuggestion: controller.selectedSuggestion,
  };
}

function JobsProximityToolbar({
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
  readonly requestState: JobsProximityRequestState;
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
          id="jobs-proximity-route-limit"
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

function JobsProximityContent({
  onClearFilters,
  currentInputKey,
  originState,
  requestCurrentOrigin,
  requestState,
  retryRanking,
  routeProximityLocationEnabled,
  selectedJobId,
  onOriginDialogOpen,
  onSelectedJobIdChange,
  viewMode,
}: {
  readonly onClearFilters: () => void;
  readonly currentInputKey: string | null;
  readonly originState: ProximityOriginRunState;
  readonly requestCurrentOrigin: () => void;
  readonly requestState: JobsProximityRequestState;
  readonly retryRanking: () => void;
  readonly routeProximityLocationEnabled: boolean;
  readonly selectedJobId: string | null;
  readonly onOriginDialogOpen: (open: boolean) => void;
  readonly onSelectedJobIdChange: (jobId: string) => void;
  readonly viewMode: JobsViewMode;
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

  if (
    requestState.status !== "idle" &&
    !isReusableJobProximityResponse({
      currentInputKey,
      needsRouteLines: viewMode === "map",
      requestState,
    })
  ) {
    return null;
  }

  if (requestState.status === "loading") {
    return (
      <ProximityStatusPanel
        state={{ kind: "loading", title: "Ranking nearby jobs" }}
      />
    );
  }

  if (requestState.status === "failed") {
    return (
      <ProximityStatusPanel
        state={{
          description: requestState.message,
          kind: "provider_unavailable",
          title: "Nearby jobs could not be ranked",
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
            "No mapped jobs match the selected filters with a driving route from this origin.",
          kind: "empty",
          title: "No nearby jobs match these filters",
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
            "jobs",
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
          <LazyJobsProximityMap
            origin={requestState.response.origin}
            rows={requestState.response.rows}
            selectedJobId={selectedJobId}
            onSelectedJobIdChange={onSelectedJobIdChange}
          />
        </React.Suspense>
      ) : null}
      <div className="grid gap-2">
        {requestState.response.rows.map((row, index) => (
          <JobsProximityRow
            key={row.job.id}
            origin={requestState.response.origin}
            rank={index + 1}
            row={row}
            selected={selectedJobId === row.job.id}
            onSelect={() => onSelectedJobIdChange(row.job.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function buildJobProximityInput({
  filters,
  includeRouteLines,
  limit,
  origin,
}: {
  readonly filters: JobsListFilters;
  readonly includeRouteLines: boolean;
  readonly limit: ProximityLimit;
  readonly origin: ProximityOriginInput;
}): JobProximityInput {
  return {
    filters: buildJobProximityFilters(filters),
    includeRouteLines,
    limit,
    origin,
  };
}

function makeJobProximityInputKey(input: JobProximityInput) {
  return JSON.stringify({
    filters: input.filters,
    limit: input.limit,
    origin: input.origin,
  });
}

function hasCurrentJobsProximityRouteResults({
  active,
  currentInputKey,
  needsRouteLines,
  requestState,
}: {
  readonly active: boolean;
  readonly currentInputKey: string | null;
  readonly needsRouteLines: boolean;
  readonly requestState: JobsProximityRequestState;
}) {
  return (
    active &&
    requestState.status === "success" &&
    isReusableJobProximityResponse({
      currentInputKey,
      needsRouteLines,
      requestState,
    })
  );
}

function isReusableJobProximityResponse({
  currentInputKey,
  needsRouteLines,
  requestState,
}: {
  readonly currentInputKey: string | null;
  readonly needsRouteLines: boolean;
  readonly requestState: Exclude<JobsProximityRequestState, { status: "idle" }>;
}) {
  return isReusableProximityResponse({
    currentInputKey,
    needsRouteLines,
    requestState,
  });
}

function buildJobProximityFilters(
  filters: JobsListFilters
): JobProximityFilters {
  return {
    ...(filters.assigneeId.kind === "all"
      ? {}
      : { assigneeId: filters.assigneeId }),
    ...(filters.coordinatorId === "all"
      ? {}
      : { coordinatorId: filters.coordinatorId }),
    ...(filters.labelId === "all" ? {} : { labelId: filters.labelId }),
    ...(filters.priority === "all" ? {} : { priority: filters.priority }),
    ...(filters.query.trim().length === 0
      ? {}
      : { query: filters.query.trim() }),
    ...(filters.siteId === "all" ? {} : { siteId: filters.siteId }),
    status: filters.status,
  };
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
      return "Ceird could not find driving routes for the selected jobs.";
    }
    if (tag === PROXIMITY_PROVIDER_ERROR_TAG) {
      return "The route provider could not calculate traffic-aware driving times.";
    }
    if (tag === PROXIMITY_ORIGIN_RESOLUTION_ERROR_TAG) {
      return "Ceird could not use that origin for route ranking.";
    }
  }

  return "The route provider could not calculate traffic-aware driving times. Ordinary jobs are still available.";
}

function readErrorTag(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error)) {
    return;
  }

  return typeof error._tag === "string" ? error._tag : undefined;
}
