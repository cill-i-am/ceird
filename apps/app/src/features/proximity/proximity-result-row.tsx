"use client";

import type {
  ProximityCoordinates,
  ProximityOriginSummary,
  RouteSummary,
} from "@ceird/proximity-core";
import {
  Clock03Icon,
  MapsSquare01Icon,
  SquareArrowDiagonal01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import { buttonVariants } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

import { buildMapsHandoffUrls } from "./maps-handoff";
import type { MapsHandoffGooglePlaceId } from "./maps-handoff";
import {
  formatRouteComputedAt,
  formatRouteDistance,
  formatRouteDuration,
} from "./proximity-format";

export interface ProximityDestination {
  readonly coordinates: ProximityCoordinates;
  readonly label: string;
  readonly placeId?: MapsHandoffGooglePlaceId | undefined;
}

export function ProximityResultRow({
  destination,
  detailAction,
  meta,
  origin,
  rank,
  routeSummary,
  selected = false,
  subtitle,
  title,
  onSelect,
}: {
  readonly destination: ProximityDestination;
  readonly detailAction?: ReactNode;
  readonly meta?: ReactNode;
  readonly onSelect?: (() => void) | undefined;
  readonly origin: ProximityOriginSummary;
  readonly rank: number;
  readonly routeSummary: RouteSummary;
  readonly selected?: boolean;
  readonly subtitle?: string | undefined;
  readonly title: string;
}) {
  return (
    <article
      className={cn(
        "grid min-w-0 grid-cols-[auto_minmax(0,1.15fr)_minmax(7rem,auto)_minmax(6rem,auto)_auto] items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:bg-muted/20"
      )}
      onFocusCapture={onSelect}
      onPointerEnter={onSelect}
    >
      <RankBadge rank={rank} selected={selected} />
      <div className="min-w-0">
        <h3 className="truncate font-medium text-foreground">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <RouteSummaryCluster routeSummary={routeSummary} />
      <div className="hidden min-w-0 text-xs text-muted-foreground md:block">
        {formatRouteComputedAt(routeSummary.computedAt).replace(
          "Computed at ",
          ""
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {meta}
        <MapsHandoffButton destination={destination} origin={origin} />
        {detailAction}
      </div>
    </article>
  );
}

export function RouteSummaryCluster({
  routeSummary,
}: {
  readonly routeSummary: RouteSummary;
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <div className="flex items-center gap-1.5 font-semibold text-foreground">
        <HugeiconsIcon icon={Clock03Icon} strokeWidth={2} aria-hidden />
        <span>{formatRouteDuration(routeSummary.durationSeconds)}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatRouteDistance(routeSummary.distanceMeters)}</span>
        {routeSummary.trafficAware ? <TrafficAwareLabel /> : null}
      </div>
    </div>
  );
}

export function MapsHandoffButton({
  destination,
  origin,
}: {
  readonly destination: ProximityDestination;
  readonly origin: ProximityOriginSummary;
}) {
  const urls = buildMapsHandoffUrls({
    destination: destination.coordinates,
    destinationLabel: destination.label,
    destinationPlaceId: destination.placeId,
    origin: origin.coordinates,
  });

  return (
    <div className="inline-flex shrink-0 items-center">
      <a
        className={cn(
          buttonVariants({ size: "sm", variant: "outline" }),
          "rounded-r-none"
        )}
        href={urls.default.url}
        rel="noreferrer"
        target="_blank"
      >
        <HugeiconsIcon
          icon={MapsSquare01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        Open in Maps
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "-ml-px rounded-l-none px-2"
          )}
          aria-label="Choose maps app"
        >
          <span aria-hidden>⌄</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            render={
              <a
                href={urls.google.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in Google Maps"
              />
            }
          >
            <HugeiconsIcon icon={SquareArrowDiagonal01Icon} strokeWidth={2} />
            Open in Google Maps
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <a
                href={urls.apple.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in Apple Maps"
              />
            }
          >
            <HugeiconsIcon icon={SquareArrowDiagonal01Icon} strokeWidth={2} />
            Open in Apple Maps
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TrafficAwareLabel() {
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[0.7rem] text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30">
        Traffic-aware
      </TooltipTrigger>
      <TooltipContent>
        Routes and times use current traffic conditions on driving roads.
      </TooltipContent>
    </Tooltip>
  );
}

export function RankBadge({
  rank,
  selected = false,
}: {
  readonly rank: number;
  readonly selected?: boolean;
}) {
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted/40 text-foreground"
      )}
    >
      {rank}
    </span>
  );
}
