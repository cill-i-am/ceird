"use client";

import type { JobProximityRow } from "@ceird/jobs-core";
import type { ProximityOriginSummary } from "@ceird/proximity-core";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { ProximityResultRow } from "#/features/proximity/proximity-result-row";
import { openWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";

import {
  JOB_PRIORITY_LABELS as PRIORITY_LABELS,
  JOB_STATUS_LABELS as STATUS_LABELS,
} from "./job-display";

export function JobsProximityRow({
  origin,
  rank,
  row,
  selected = false,
  onSelect,
}: {
  readonly origin: ProximityOriginSummary;
  readonly rank: number;
  readonly row: JobProximityRow;
  readonly selected?: boolean;
  readonly onSelect?: (() => void) | undefined;
}) {
  const destination =
    row.site.latitude === undefined || row.site.longitude === undefined
      ? undefined
      : {
          coordinates: {
            latitude: row.site.latitude,
            longitude: row.site.longitude,
          },
          label: row.site.name,
        };

  if (destination === undefined) {
    return null;
  }

  return (
    <ProximityResultRow
      destination={destination}
      origin={origin}
      rank={rank}
      routeSummary={row.routeSummary}
      selected={selected}
      subtitle={row.site.name}
      title={row.job.title}
      onSelect={onSelect}
      meta={
        <div className="hidden items-center gap-1 lg:flex">
          <Badge variant="secondary">{STATUS_LABELS[row.job.status]}</Badge>
          <Badge
            variant={row.job.priority === "none" ? "outline" : "secondary"}
          >
            {PRIORITY_LABELS[row.job.priority]}
          </Badge>
        </div>
      }
      detailAction={
        <Link
          to="/jobs"
          search={(current) =>
            openWorkspaceSheetSearch(current, {
              jobId: row.job.id,
              kind: "job.detail",
            })
          }
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Open ${row.job.title}`}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Link>
      }
    />
  );
}
