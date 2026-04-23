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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

import { buildGoogleMapsUrl, hasSiteCoordinates } from "./jobs-location";
import type { SiteLocationLike } from "./jobs-location";

type SiteRecord = SiteLocationLike & {
  readonly id: string;
};

interface JobsCoverageMapProps {
  readonly jobs: readonly JobListItem[];
  readonly sites: ReadonlyMap<string, SiteRecord>;
}

export const STATUS_LABELS = {
  blocked: "Blocked",
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  triaged: "Triaged",
} as const;

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

  React.useEffect(() => {
    setCanRenderInteractiveMap(
      typeof window !== "undefined" &&
        typeof window.URL?.createObjectURL === "function"
    );
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
              <CardTitle>Coverage map</CardTitle>
            </div>
            <CardDescription>
              Scan the live queue spatially, then jump straight into the job or
              the site context when something needs action.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {groupedSites.length} mapped site
              {groupedSites.length === 1 ? "" : "s"}
            </Badge>
            <Badge
              variant={unmappedJobs.length === 0 ? "secondary" : "outline"}
            >
              {unmappedJobs.length} without a pin
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-3xl border bg-muted/10">
          {renderMapViewport(groupedSites, canRenderInteractiveMap)}
        </div>

        {unmappedJobs.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-3xl border border-dashed bg-muted/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="font-medium">Jobs still missing a pin</p>
                <p className="text-sm text-muted-foreground">
                  Add a site pin during intake so the map stays useful for
                  dispatch and planning.
                </p>
              </div>
              <Badge variant="outline">{unmappedJobs.length}</Badge>
            </div>
            <ul className="flex flex-col gap-2">
              {unmappedJobs.slice(0, 4).map((job) => {
                const site = job.siteId ? sites.get(job.siteId) : undefined;
                const googleMapsUrl = buildGoogleMapsUrl(site);

                return (
                  <li
                    key={job.id}
                    className="flex flex-col gap-2 rounded-2xl border bg-background/84 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          job.status === "blocked" ? "outline" : "secondary"
                        }
                      >
                        {STATUS_LABELS[job.status]}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {site?.name ?? "No site yet"}
                      </span>
                    </div>
                    <p className="font-medium">{job.title}</p>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to="/jobs/$jobId"
                        params={{ jobId: job.id }}
                        className={buttonVariants({
                          size: "sm",
                          variant: "ghost",
                        })}
                      >
                        Open job
                      </Link>
                      {googleMapsUrl ? (
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                        >
                          <HugeiconsIcon
                            icon={MapsLocation01Icon}
                            strokeWidth={2}
                            data-icon="inline-start"
                          />
                          Google Maps
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function renderMapViewport(
  groupedSites: readonly MappedSiteGroup[],
  canRenderInteractiveMap: boolean
) {
  if (groupedSites.length === 0) {
    return (
      <Empty className="min-h-[420px] bg-muted/10 px-6 py-10">
        <EmptyHeader>
          <EmptyTitle>No mapped jobs yet.</EmptyTitle>
          <EmptyDescription>
            Drop a pin when creating a new site and the queue will start to
            light up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!canRenderInteractiveMap) {
    return (
      <div className="flex min-h-[420px] flex-col justify-between gap-6 bg-muted/10 p-6">
        <div className="flex max-w-[32rem] flex-col gap-2">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Coverage map
          </p>
          <h3 className="font-heading text-2xl font-medium tracking-tight">
            Preparing the live map.
          </h3>
          <p className="text-sm/7 text-muted-foreground">
            Pinned sites are already grouped, so dispatch can switch from the
            queue to geography without losing context.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {groupedSites.slice(0, 4).map((group) => (
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
                  {group.site.name ?? "Pinned site"}
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
    <div className="flex min-h-[420px] flex-col gap-4 bg-muted/10 p-6">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-56 w-full rounded-3xl" />
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
