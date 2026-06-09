"use client";

import type { ProximityOriginSummary } from "@ceird/proximity-core";
import type { SiteProximityRow } from "@ceird/sites-core";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import { ProximityResultRow } from "#/features/proximity/proximity-result-row";
import { openWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";
import { cn } from "#/lib/utils";

import { buildSiteAddressLines } from "./site-location";
import {
  formatSiteActiveJobCount,
  SiteWorkPriorityBadge,
} from "./site-work-signal";

export function SitesProximityRow({
  origin,
  rank,
  row,
  selected,
  onSelect,
}: {
  readonly origin: ProximityOriginSummary;
  readonly rank: number;
  readonly row: SiteProximityRow;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  if (row.site.latitude === undefined || row.site.longitude === undefined) {
    return null;
  }

  const addressSummary = buildSiteAddressLines(row.site).join(", ");

  return (
    <ProximityResultRow
      destination={{
        coordinates: {
          latitude: row.site.latitude,
          longitude: row.site.longitude,
        },
        label: row.site.name,
        placeId: row.site.googlePlaceId,
      }}
      detailAction={
        <Link
          to="/sites"
          search={(current) =>
            openWorkspaceSheetSearch(current, {
              kind: "site.detail",
              siteId: row.site.id,
            })
          }
          aria-label={`Open ${row.site.name}`}
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "px-2"
          )}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Link>
      }
      meta={<SiteProximityMeta row={row} />}
      origin={origin}
      rank={rank}
      routeSummary={row.routeSummary}
      selected={selected}
      subtitle={addressSummary || row.site.displayLocation}
      title={row.site.name}
      onSelect={onSelect}
    />
  );
}

function SiteProximityMeta({ row }: { readonly row: SiteProximityRow }) {
  if (row.activeJobCount === 0) {
    return (
      <Badge variant="outline" className="hidden rounded-full md:inline-flex">
        No active jobs
      </Badge>
    );
  }

  return (
    <div className="hidden items-center gap-1.5 md:flex">
      <Badge variant="secondary" className="rounded-full">
        {formatSiteActiveJobCount(row.activeJobCount)}
      </Badge>
      {row.highestActiveJobPriority ? (
        <SiteWorkPriorityBadge priority={row.highestActiveJobPriority} />
      ) : null}
    </div>
  );
}
