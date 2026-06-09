"use client";

import type { SiteActiveJobPriority, SiteOption } from "@ceird/sites-core";

import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

const SITE_ACTIVE_JOB_PRIORITY_LABELS: Record<SiteActiveJobPriority, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
  none: "No priority",
  urgent: "Urgent",
};

const SITE_ACTIVE_JOB_PRIORITY_TONES: Record<
  SiteActiveJobPriority,
  { readonly className: string }
> = {
  high: {
    className: "bg-destructive/10 text-destructive",
  },
  low: {
    className: "bg-success/10 text-success",
  },
  medium: {
    className: "bg-warning/10 text-warning",
  },
  none: {
    className: "text-muted-foreground",
  },
  urgent: {
    className: "bg-destructive/10 text-destructive",
  },
};

export function SiteWorkSignal({
  className,
  site,
}: {
  readonly className?: string;
  readonly site: Pick<
    SiteOption,
    "activeJobCount" | "highestActiveJobPriority"
  >;
}) {
  const activeJobCount = site.activeJobCount ?? 0;

  if (activeJobCount === 0) {
    return null;
  }

  return (
    <div
      aria-label={formatSiteActiveJobCount(activeJobCount)}
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      <Badge variant="secondary" className="rounded-full">
        {formatSiteActiveJobCount(activeJobCount)}
      </Badge>
      {site.highestActiveJobPriority ? (
        <SiteWorkPriorityBadge priority={site.highestActiveJobPriority} />
      ) : null}
    </div>
  );
}

export function SiteWorkPriorityBadge({
  priority,
}: {
  readonly priority: SiteActiveJobPriority;
}) {
  const tone = SITE_ACTIVE_JOB_PRIORITY_TONES[priority];

  return (
    <Badge
      variant={priority === "none" ? "outline" : "secondary"}
      className={cn("rounded-full", tone.className)}
    >
      {SITE_ACTIVE_JOB_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function formatSiteActiveJobCount(count: number) {
  return `${count} active job${count === 1 ? "" : "s"}`;
}
