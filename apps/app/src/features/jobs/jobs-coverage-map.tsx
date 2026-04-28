/* oxlint-disable unicorn/no-array-sort */
"use client";

import { Location01Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { JobListItem } from "@task-tracker/jobs-core";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

import { JOB_STATUS_LABELS as STATUS_LABELS } from "./job-display";
import { buildGoogleMapsUrl, hasSiteCoordinates } from "./jobs-location";
import type { SiteLocationLike } from "./jobs-location";

type SiteRecord = SiteLocationLike & {
  readonly id: string;
};

interface JobsCoverageMapProps {
  readonly jobs: readonly JobListItem[];
  readonly sites: ReadonlyMap<string, SiteRecord>;
}

export { STATUS_LABELS };

const JobsCoverageMapCanvas = React.lazy(async () => {
  const module = await import("./jobs-coverage-map-canvas");

  return { default: module.JobsCoverageMapCanvas };
});

export function JobsCoverageMap({ jobs, sites }: JobsCoverageMapProps) {
  const groupedSites = React.useMemo(
    () => groupJobsByMappedSite(jobs, sites),
    [jobs, sites]
  );
  const unmappedJobs = React.useMemo(
    () =>
      jobs.filter((job) => {
        if (!job.siteId) {
          return true;
        }

        return !hasSiteCoordinates(sites.get(job.siteId));
      }),
    [jobs, sites]
  );
  const [canRenderInteractiveMap, setCanRenderInteractiveMap] =
    React.useState(false);
  const hasUnmappedJobs = unmappedJobs.length > 0;

  React.useEffect(() => {
    setCanRenderInteractiveMap(
      typeof window !== "undefined" &&
        typeof window.URL?.createObjectURL === "function"
    );
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-2xl border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
          <span>Map</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{groupedSites.length} mapped</Badge>
          <Badge variant={unmappedJobs.length === 0 ? "secondary" : "outline"}>
            {unmappedJobs.length} unmapped
          </Badge>
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1",
          hasUnmappedJobs
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]"
            : "lg:grid-cols-1"
        )}
      >
        <div className="min-h-[520px] overflow-hidden bg-muted/10">
          {renderMapViewport(groupedSites, canRenderInteractiveMap)}
        </div>

        {hasUnmappedJobs ? (
          <aside className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
            <div className="border-b px-3 py-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Needs location
              </p>
            </div>
            <ul className="flex min-h-0 flex-col overflow-y-auto">
              {unmappedJobs.slice(0, 8).map((job) => {
                const site = job.siteId ? sites.get(job.siteId) : undefined;
                const googleMapsUrl = buildGoogleMapsUrl(site);

                return (
                  <li key={job.id} className="border-b last:border-b-0">
                    <div className="flex flex-col gap-2 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            job.status === "blocked" ? "outline" : "secondary"
                          }
                        >
                          {STATUS_LABELS[job.status]}
                        </Badge>
                        <span className="truncate text-xs text-muted-foreground">
                          {site?.name ?? "No site"}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm font-medium">
                        {job.title}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to="/jobs/$jobId"
                          params={{ jobId: job.id }}
                          className={buttonVariants({
                            size: "xs",
                            variant: "ghost",
                          })}
                        >
                          Open
                        </Link>
                        {googleMapsUrl ? (
                          <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={buttonVariants({
                              size: "xs",
                              variant: "outline",
                            })}
                          >
                            <HugeiconsIcon
                              icon={MapsLocation01Icon}
                              strokeWidth={2}
                              data-icon="inline-start"
                            />
                            Maps
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function renderMapViewport(
  groupedSites: readonly MappedSiteGroup[],
  canRenderInteractiveMap: boolean
) {
  if (groupedSites.length === 0) {
    return (
      <Empty className="h-full min-h-[520px] rounded-none border-0 bg-muted/10 px-6 py-10">
        <EmptyHeader>
          <EmptyTitle>No mapped jobs.</EmptyTitle>
          <EmptyDescription>
            Add a geocoded site address to make this view useful.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!canRenderInteractiveMap) {
    return (
      <div className="flex h-full min-h-[520px] flex-col justify-between gap-6 bg-muted/10 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groupedSites.slice(0, 6).map((group) => (
            <div
              key={group.site.id}
              className="rounded-2xl border bg-background/84 p-4"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {group.jobs.length} job{group.jobs.length === 1 ? "" : "s"}
                  </Badge>
                  {group.statuses.slice(0, 2).map((status) => (
                    <Badge key={status.status} variant="outline">
                      {status.count} {STATUS_LABELS[status.status]}
                    </Badge>
                  ))}
                </div>
                <p className="font-medium">
                  {group.site.name ?? "Mapped site"}
                </p>
                {group.site.regionName ? (
                  <p className="text-sm text-muted-foreground">
                    {group.site.regionName}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<CoverageMapLoadingState />}>
      <JobsCoverageMapCanvas groups={groupedSites} />
    </React.Suspense>
  );
}

function CoverageMapLoadingState() {
  return (
    <div className="flex min-h-[520px] flex-col gap-4 bg-muted/10 p-4">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-80 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export interface MappedSiteGroup {
  readonly jobs: readonly JobListItem[];
  readonly site: SiteRecord & {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly statuses: readonly {
    readonly count: number;
    readonly status: JobListItem["status"];
  }[];
  readonly tone: "active" | "blocked" | "done";
}

export function groupJobsByMappedSite(
  jobs: readonly JobListItem[],
  sites: ReadonlyMap<string, SiteRecord>
) {
  const groups = new Map<
    string,
    { jobs: JobListItem[]; site: MappedSiteGroup["site"] }
  >();

  for (const job of jobs) {
    if (!job.siteId) {
      continue;
    }

    const site = sites.get(job.siteId);

    if (!hasSiteCoordinates(site)) {
      continue;
    }

    const current = groups.get(site.id);

    if (current) {
      current.jobs.push(job);
      continue;
    }

    groups.set(site.id, {
      jobs: [job],
      site: {
        ...site,
        latitude: site.latitude,
        longitude: site.longitude,
      },
    });
  }

  return [...groups.values()]
    .map(({ jobs: groupedJobs, site }) => {
      const statusCounts = new Map<JobListItem["status"], number>();

      for (const job of groupedJobs) {
        statusCounts.set(job.status, (statusCounts.get(job.status) ?? 0) + 1);
      }

      const statuses = [...statusCounts.entries()].map(([status, count]) => ({
        count,
        status,
      }));

      return {
        jobs: groupedJobs,
        site,
        statuses,
        tone: resolveGroupTone(groupedJobs),
      } satisfies MappedSiteGroup;
    })
    .sort((left, right) => {
      const leftBlocked = left.jobs.some((job) => job.status === "blocked");
      const rightBlocked = right.jobs.some((job) => job.status === "blocked");

      if (leftBlocked !== rightBlocked) {
        return leftBlocked ? -1 : 1;
      }

      return (left.site.name ?? "").localeCompare(right.site.name ?? "");
    });
}

export function markerToneClassName(tone: MappedSiteGroup["tone"]) {
  switch (tone) {
    case "blocked": {
      return cn(
        "flex min-w-10 items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold shadow-lg",
        "text-destructive-foreground border-destructive/30 bg-destructive"
      );
    }
    case "done": {
      return cn(
        "flex min-w-10 items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold shadow-lg",
        "border-border bg-secondary text-secondary-foreground"
      );
    }
    default: {
      return cn(
        "flex min-w-10 items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold shadow-lg",
        "border-primary/30 bg-primary text-primary-foreground"
      );
    }
  }
}

function resolveGroupTone(
  jobs: readonly JobListItem[]
): MappedSiteGroup["tone"] {
  if (jobs.some((job) => job.status === "blocked")) {
    return "blocked";
  }

  if (
    jobs.every((job) => job.status === "completed" || job.status === "canceled")
  ) {
    return "done";
  }

  return "active";
}
