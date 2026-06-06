"use client";

import type {
  ProximityOriginSummary,
  RouteSummary,
} from "@ceird/proximity-core";

import {
  RankBadge,
  RouteSummaryCluster,
  MapsHandoffButton,
} from "./proximity-result-row";
import type { ProximityDestination } from "./proximity-result-row";

export function ProximityResultCard({
  destination,
  origin,
  rank,
  routeSummary,
  subtitle,
  title,
}: {
  readonly destination: ProximityDestination;
  readonly origin: ProximityOriginSummary;
  readonly rank: number;
  readonly routeSummary: RouteSummary;
  readonly subtitle?: string | undefined;
  readonly title: string;
}) {
  return (
    <article className="grid gap-3 rounded-lg border bg-background p-3 text-sm">
      <div className="flex min-w-0 items-start gap-3">
        <RankBadge rank={rank} selected />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-foreground">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        <RouteSummaryCluster routeSummary={routeSummary} />
      </div>
      <MapsHandoffButton destination={destination} origin={origin} />
    </article>
  );
}
