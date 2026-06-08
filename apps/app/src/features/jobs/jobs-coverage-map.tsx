"use client";
import type { JobListItem } from "@ceird/jobs-core";
import type { SiteIdType } from "@ceird/sites-core";
import { Location01Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { useCanRenderInteractiveMap } from "#/components/ui/use-can-render-interactive-map";
import {
  buildGoogleMapsUrl,
  hasSiteCoordinates,
} from "#/features/sites/site-location";
import type { SiteLocationLike } from "#/features/sites/site-location";
import {
  createWorkspaceSheetSearch,
  openWorkspaceSheetSearch,
} from "#/features/workspace-sheets/workspace-sheet-search";
import { cn } from "#/lib/utils";

import { JOB_STATUS_LABELS as STATUS_LABELS } from "./job-display";

type SiteRecord = SiteLocationLike & {
  readonly id: SiteIdType;
};

interface JobsCoverageMapProps {
  readonly jobs: readonly JobListItem[];
  readonly sites: ReadonlyMap<SiteIdType, SiteRecord>;
}

export { STATUS_LABELS };

const JobsCoverageMapCanvas = React.lazy(async () => {
  const module = await import("./jobs-coverage-map-canvas");

  return { default: module.JobsCoverageMapCanvas };
});

const MAX_VISIBLE_SITE_RAIL_JOBS = 4;

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
  const canRenderInteractiveMap = useCanRenderInteractiveMap();
  const hasUnmappedJobs = unmappedJobs.length > 0;
  const showSiteRail = groupedSites.length > 0 || hasUnmappedJobs;

  return (
    <div
      aria-label="Jobs coverage map"
      className="flex h-[clamp(20rem,calc(100vh-24rem),42rem)] flex-col overflow-hidden rounded-2xl border bg-background"
    >
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
          showSiteRail
            ? "grid-rows-[minmax(0,1fr)_minmax(0,18rem)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:grid-rows-1"
            : "lg:grid-cols-1"
        )}
      >
        <div className="min-h-0 overflow-hidden bg-muted/10">
          <MapViewport
            canRenderInteractiveMap={canRenderInteractiveMap}
            groupedSites={groupedSites}
          />
        </div>

        {showSiteRail ? (
          <JobsMapSiteRail
            groupedSites={groupedSites}
            sites={sites}
            unmappedJobs={unmappedJobs}
          />
        ) : null}
      </div>
    </div>
  );
}

function JobsMapSiteRail({
  groupedSites,
  sites,
  unmappedJobs,
}: {
  readonly groupedSites: readonly MappedSiteGroup[];
  readonly sites: ReadonlyMap<SiteIdType, SiteRecord>;
  readonly unmappedJobs: readonly JobListItem[];
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-t lg:border-t-0 lg:border-l">
      <ScrollArea
        className="min-h-0 flex-1"
        data-testid="jobs-map-site-rail-scroll"
      >
        <div className="flex min-h-full flex-col">
          {groupedSites.length > 0 ? (
            <section className="flex flex-col">
              <div className="border-b px-3 py-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Mapped sites
                </h2>
              </div>
              <ul className="flex flex-col">
                {groupedSites.map((group) => (
                  <JobsMapSiteRailItem key={group.site.id} group={group} />
                ))}
              </ul>
            </section>
          ) : null}

          {unmappedJobs.length > 0 ? (
            <section className="flex flex-col">
              <div className="border-b px-3 py-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Unverified location
                </h2>
              </div>
              <ul className="flex flex-col">
                {unmappedJobs.slice(0, 8).map((job) => {
                  const site = job.siteId ? sites.get(job.siteId) : undefined;
                  const googleMapsUrl = buildGoogleMapsUrl(site);

                  return (
                    <li key={job.id} className="border-b last:border-b-0">
                      <div className="flex flex-col gap-2 p-3">
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
                            to="/jobs"
                            search={(current) =>
                              openWorkspaceSheetSearch(current, {
                                jobId: job.id,
                                kind: "job.detail",
                              })
                            }
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
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}

function JobsMapSiteRailItem({ group }: { readonly group: MappedSiteGroup }) {
  const visibleJobs = group.jobs.slice(0, MAX_VISIBLE_SITE_RAIL_JOBS);
  const hiddenJobCount = group.jobs.length - visibleJobs.length;

  return (
    <li className="border-b last:border-b-0">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/sites"
              search={createWorkspaceSheetSearch({
                kind: "site.detail",
                siteId: group.site.id,
              })}
              className="block truncate rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {group.site.name ?? "Mapped site"}
            </Link>
          </div>
          <Badge variant="secondary">
            {group.jobs.length} job
            {group.jobs.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {group.statuses.slice(0, 3).map((status) => (
            <Badge key={status.status} variant="outline">
              {status.count} {STATUS_LABELS[status.status]}
            </Badge>
          ))}
        </div>

        <ul className="flex flex-col gap-1">
          {visibleJobs.map((job) => (
            <li key={job.id}>
              <Link
                to="/jobs"
                search={(current) =>
                  openWorkspaceSheetSearch(current, {
                    jobId: job.id,
                    kind: "job.detail",
                  })
                }
                className="block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="line-clamp-1">{job.title}</span>
              </Link>
            </li>
          ))}
          {hiddenJobCount > 0 ? (
            <li>
              <Link
                to="/sites"
                search={createWorkspaceSheetSearch({
                  kind: "site.detail",
                  siteId: group.site.id,
                })}
                className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                View {hiddenJobCount} more on site
              </Link>
            </li>
          ) : null}
        </ul>
      </div>
    </li>
  );
}

function MapViewport({
  canRenderInteractiveMap,
  groupedSites,
}: {
  readonly canRenderInteractiveMap: boolean;
  readonly groupedSites: readonly MappedSiteGroup[];
}) {
  if (groupedSites.length === 0) {
    return (
      <Empty className="h-full min-h-0 rounded-none border-0 bg-muted/10 px-6 py-10">
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
      <div className="flex h-full min-h-0 flex-col justify-between gap-6 overflow-y-auto bg-muted/10 p-4">
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
    <div className="flex h-full min-h-0 flex-col gap-4 bg-muted/10 p-4">
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

function groupJobsByMappedSite(
  jobs: readonly JobListItem[],
  sites: ReadonlyMap<SiteIdType, SiteRecord>
) {
  const groups = new Map<
    SiteIdType,
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
    .toSorted((left, right) => {
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
