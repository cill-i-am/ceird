"use client";

import {
  JobProximityResponseSchema,
  JobRoutePreviewResponseSchema,
} from "@ceird/jobs-core";
import type {
  JobProximityResponse,
  JobRoutePreviewResponse,
} from "@ceird/jobs-core";
import type {
  ProximityOriginSummary,
  RouteSummary,
} from "@ceird/proximity-core";
import {
  SiteProximityResponseSchema,
  SiteRoutePreviewResponseSchema,
} from "@ceird/sites-core";
import type {
  SiteProximityResponse,
  SiteRoutePreviewResponse,
} from "@ceird/sites-core";
import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Option, Schema } from "effect";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { useCanRenderInteractiveMap } from "#/components/ui/use-can-render-interactive-map";
import {
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
} from "#/features/jobs/job-display";
import {
  formatCandidateCapLabel,
  formatRouteComputedAt,
} from "#/features/proximity/proximity-format";
import {
  MapsHandoffButton,
  RankBadge,
  RouteSummaryCluster,
} from "#/features/proximity/proximity-result-row";
import type { ProximityDestination } from "#/features/proximity/proximity-result-row";
import { routeDisplayLineToMapCoordinates } from "#/features/proximity/route-display-line";
import { buildSiteAddressLines } from "#/features/sites/site-location";
import { cn } from "#/lib/utils";

const AgentRoutePreviewMap = React.lazy(async () => {
  const module = await import("./agent-route-preview-map");

  return { default: module.AgentRoutePreviewMap };
});

const decodeJobProximityResponse = Schema.decodeUnknownOption(
  JobProximityResponseSchema
);
const decodeJobRoutePreviewResponse = Schema.decodeUnknownOption(
  JobRoutePreviewResponseSchema
);
const decodeSiteProximityResponse = Schema.decodeUnknownOption(
  SiteProximityResponseSchema
);
const decodeSiteRoutePreviewResponse = Schema.decodeUnknownOption(
  SiteRoutePreviewResponseSchema
);

const PROXIMITY_TOOL_NAMES = new Set([
  "ceird.jobs.proximity",
  "ceird.jobs.route_preview",
  "ceird.sites.proximity",
  "ceird.sites.route_preview",
  "getJobRoutePreview",
  "getSiteRoutePreview",
  "rankNearbyJobs",
  "rankNearbySites",
]);

export function isAgentProximityToolName(toolName: string) {
  return PROXIMITY_TOOL_NAMES.has(toolName);
}

export function AgentProximityToolOutput({
  output,
  toolName,
}: {
  readonly output: unknown;
  readonly toolName: string;
}) {
  return React.useMemo(
    () => renderAgentProximityToolOutput({ output, toolName }),
    [output, toolName]
  );
}

export function renderAgentProximityToolOutput({
  output,
  toolName,
}: {
  readonly output: unknown;
  readonly toolName: string;
}) {
  if (toolName === "rankNearbyJobs" || toolName === "ceird.jobs.proximity") {
    const decoded = decodeJobProximityResponse(output);

    return Option.isSome(decoded) ? (
      <AgentNearbyJobsOutput response={decoded.value} />
    ) : null;
  }

  if (toolName === "rankNearbySites" || toolName === "ceird.sites.proximity") {
    const decoded = decodeSiteProximityResponse(output);

    return Option.isSome(decoded) ? (
      <AgentNearbySitesOutput response={decoded.value} />
    ) : null;
  }

  if (
    toolName === "getJobRoutePreview" ||
    toolName === "ceird.jobs.route_preview"
  ) {
    const decoded = decodeJobRoutePreviewResponse(output);

    return Option.isSome(decoded) ? (
      <AgentJobRoutePreviewOutput response={decoded.value} />
    ) : null;
  }

  if (
    toolName === "getSiteRoutePreview" ||
    toolName === "ceird.sites.route_preview"
  ) {
    const decoded = decodeSiteRoutePreviewResponse(output);

    return Option.isSome(decoded) ? (
      <AgentSiteRoutePreviewOutput response={decoded.value} />
    ) : null;
  }

  return null;
}

function AgentNearbyJobsOutput({
  response,
}: {
  readonly response: JobProximityResponse;
}) {
  return (
    <AgentProximityList
      countLabel={formatCandidateCapLabel(
        response.meta,
        "jobs",
        response.rows.length
      )}
      emptyLabel="No nearby jobs matched that request."
      title="Closest jobs"
    >
      {response.rows.map((row, index) => {
        const destination = makeDestination(
          row.site.name,
          row.site.latitude,
          row.site.longitude,
          row.site.googlePlaceId
        );

        return (
          <AgentNearbyResultRow
            key={row.job.id}
            destination={destination}
            meta={
              <>
                <Badge variant="secondary">
                  {JOB_STATUS_LABELS[row.job.status]}
                </Badge>
                <Badge
                  variant={
                    row.job.priority === "none" ? "outline" : "secondary"
                  }
                >
                  {JOB_PRIORITY_LABELS[row.job.priority]}
                </Badge>
              </>
            }
            origin={response.origin}
            rank={index + 1}
            routeSummary={row.routeSummary}
            subtitle={row.site.name}
            title={row.job.title}
          />
        );
      })}
    </AgentProximityList>
  );
}

function AgentNearbySitesOutput({
  response,
}: {
  readonly response: SiteProximityResponse;
}) {
  return (
    <AgentProximityList
      countLabel={formatCandidateCapLabel(
        response.meta,
        "sites",
        response.rows.length
      )}
      emptyLabel="No nearby sites matched that request."
      title="Closest sites"
    >
      {response.rows.map((row, index) => {
        const destination = makeDestination(
          row.site.name,
          row.site.latitude,
          row.site.longitude,
          row.site.googlePlaceId
        );
        const addressSummary = buildSiteAddressLines(row.site).join(", ");

        return (
          <AgentNearbyResultRow
            key={row.site.id}
            destination={destination}
            meta={<SiteResultMeta response={row} />}
            origin={response.origin}
            rank={index + 1}
            routeSummary={row.routeSummary}
            subtitle={addressSummary || row.site.displayLocation}
            title={row.site.name}
          />
        );
      })}
    </AgentProximityList>
  );
}

function AgentJobRoutePreviewOutput({
  response,
}: {
  readonly response: JobRoutePreviewResponse;
}) {
  const destination = makeDestination(
    response.site.name,
    response.site.latitude,
    response.site.longitude,
    response.site.googlePlaceId
  );

  return (
    <AgentRoutePreview
      destination={destination}
      origin={response.origin}
      routeLine={response.routeLine}
      routeSummary={response.routeSummary}
      subtitle={response.site.name}
      title={response.job.title}
    />
  );
}

function AgentSiteRoutePreviewOutput({
  response,
}: {
  readonly response: SiteRoutePreviewResponse;
}) {
  const destination = makeDestination(
    response.site.name,
    response.site.latitude,
    response.site.longitude,
    response.site.googlePlaceId
  );
  const addressSummary = buildSiteAddressLines(response.site).join(", ");

  return (
    <AgentRoutePreview
      destination={destination}
      meta={<SiteResultMeta response={response} />}
      origin={response.origin}
      routeLine={response.routeLine}
      routeSummary={response.routeSummary}
      subtitle={addressSummary || response.site.displayLocation}
      title={response.site.name}
    />
  );
}

function AgentProximityList({
  children,
  countLabel,
  emptyLabel,
  title,
}: {
  readonly children: React.ReactNode;
  readonly countLabel: string;
  readonly emptyLabel: string;
  readonly title: string;
}) {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{countLabel}</span>
      </div>
      {hasChildren ? (
        <div className="grid gap-2">{children}</div>
      ) : (
        <p className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

function AgentNearbyResultRow({
  destination,
  meta,
  origin,
  rank,
  routeSummary,
  subtitle,
  title,
}: {
  readonly destination: ProximityDestination | null;
  readonly meta?: React.ReactNode;
  readonly origin: ProximityOriginSummary;
  readonly rank: number;
  readonly routeSummary: RouteSummary;
  readonly subtitle?: string | undefined;
  readonly title: string;
}) {
  return (
    <article className="grid min-w-0 gap-3 rounded-md border bg-background px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <RankBadge rank={rank} />
        <div className="min-w-0">
          <h3 className="truncate font-medium">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <RouteSummaryCluster routeSummary={routeSummary} />
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {meta}
        {destination ? (
          <MapsHandoffButton destination={destination} origin={origin} />
        ) : null}
      </div>
    </article>
  );
}

function AgentRoutePreview({
  destination,
  meta,
  origin,
  routeLine,
  routeSummary,
  subtitle,
  title,
}: {
  readonly destination: ProximityDestination | null;
  readonly meta?: React.ReactNode;
  readonly origin: ProximityOriginSummary;
  readonly routeLine?: Parameters<typeof routeDisplayLineToMapCoordinates>[0];
  readonly routeSummary: RouteSummary;
  readonly subtitle?: string | undefined;
  readonly title: string;
}) {
  const canRenderInteractiveMap = useCanRenderInteractiveMap();
  const routeCoordinates = React.useMemo(
    () => routeDisplayLineToMapCoordinates(routeLine),
    [routeLine]
  );
  const showMap =
    canRenderInteractiveMap &&
    destination !== null &&
    routeCoordinates.length >= 2;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium">Route preview</span>
          <h3 className="mt-1 truncate text-sm font-medium">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        <RouteSummaryCluster routeSummary={routeSummary} />
      </div>
      {showMap ? (
        <React.Suspense
          fallback={<div className="h-52 rounded-md border bg-muted/20" />}
        >
          <AgentRoutePreviewMap
            destination={destination.coordinates}
            origin={origin.coordinates}
            routeCoordinates={routeCoordinates}
          />
        </React.Suspense>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={MapsLocation01Icon}
            strokeWidth={2}
            aria-hidden
          />
          Route map appears when route geometry is available.
        </div>
      )}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
          destination ? "justify-between" : "justify-start"
        )}
      >
        <span>{formatRouteComputedAt(routeSummary.computedAt)}</span>
        <span className="flex flex-wrap items-center gap-1.5">{meta}</span>
        {destination ? (
          <MapsHandoffButton destination={destination} origin={origin} />
        ) : null}
      </div>
    </div>
  );
}

function SiteResultMeta({
  response,
}: {
  readonly response:
    | SiteProximityResponse["rows"][number]
    | SiteRoutePreviewResponse;
}) {
  if (response.activeJobCount === 0) {
    return <Badge variant="outline">No active jobs</Badge>;
  }

  return (
    <>
      <Badge variant="secondary">{response.activeJobCount} active</Badge>
      {response.highestActiveJobPriority ? (
        <Badge variant="outline" className="capitalize">
          {response.highestActiveJobPriority}
        </Badge>
      ) : null}
    </>
  );
}

function makeDestination(
  label: string,
  latitude: number | undefined,
  longitude: number | undefined,
  placeId: ProximityDestination["placeId"]
): ProximityDestination | null {
  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  return {
    coordinates: { latitude, longitude },
    label,
    placeId,
  };
}
