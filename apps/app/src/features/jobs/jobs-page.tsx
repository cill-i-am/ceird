"use client";

import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  ArrowRight01Icon,
  Briefcase01Icon,
  FilterHorizontalIcon,
  User03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { JobPriority } from "@task-tracker/jobs-core";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
import { Select } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

import { JobsCoverageMap } from "./jobs-coverage-map";
import { hasSiteCoordinates } from "./jobs-location";
import {
  defaultJobsListFilters,
  jobsListFiltersAtom,
  jobsLookupAtom,
  jobsNoticeAtom,
  jobsOptionsStateAtom,
  jobsSummaryAtom,
  visibleJobsAtom,
} from "./jobs-state";
import type { JobsListFilters } from "./jobs-state";
import { hasJobsElevatedAccess } from "./jobs-viewer";
import type { JobsViewer } from "./jobs-viewer";

const STATUS_FILTER_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "All jobs", value: "all" },
  { label: "New", value: "new" },
  { label: "Triaged", value: "triaged" },
  { label: "In progress", value: "in_progress" },
  { label: "Blocked", value: "blocked" },
  { label: "Completed", value: "completed" },
  { label: "Canceled", value: "canceled" },
] as const;

const PRIORITY_LABELS: Record<JobPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const STATUS_LABELS = {
  blocked: "Blocked",
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  triaged: "Triaged",
} as const;
const JOBS_COMPACT_WORKSPACE_BREAKPOINT = 1280;

export function JobsPage({
  activeOrganizationName,
  children,
  viewer,
}: {
  readonly activeOrganizationName: string;
  readonly children?: React.ReactNode;
  readonly viewer: JobsViewer;
}) {
  const filters = useAtomValue(jobsListFiltersAtom);
  const jobs = useAtomValue(visibleJobsAtom);
  const lookup = useAtomValue(jobsLookupAtom);
  const notice = useAtomValue(jobsNoticeAtom);
  const optionsState = useAtomValue(jobsOptionsStateAtom);
  const summary = useAtomValue(jobsSummaryAtom);
  const setFilters = useAtomSet(jobsListFiltersAtom);
  const setNotice = useAtomSet(jobsNoticeAtom);
  const isCompactWorkspace = useJobsCompactWorkspace();
  const canCreateJobs = hasJobsElevatedAccess(viewer.role);
  const activeFilters = buildActiveFilterBadges(filters, lookup);
  const hasCustomFilters = activeFilters.length > 0;
  const mappedJobCount = jobs.filter((job) => {
    if (!job.siteId) {
      return false;
    }

    return hasSiteCoordinates(lookup.siteById.get(job.siteId));
  }).length;

  const queuePanel = (
    <Card data-testid="jobs-queue-panel">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} />
            <CardTitle>Queue</CardTitle>
          </div>
          <CardDescription>
            Start with the active view, then narrow down by ownership, site, or
            priority when you need a sharper cut.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-3 xl:grid-cols-6">
          <FilterSelect
            label="Status"
            value={filters.status}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value as typeof current.status,
              }))
            }
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Assignee"
            value={filters.assigneeId}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                assigneeId: value as typeof current.assigneeId,
              }))
            }
          >
            <option value="all">All assignees</option>
            {optionsState.data.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Coordinator"
            value={filters.coordinatorId}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                coordinatorId: value as typeof current.coordinatorId,
              }))
            }
          >
            <option value="all">All coordinators</option>
            {optionsState.data.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Priority"
            value={filters.priority}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                priority: value as typeof current.priority,
              }))
            }
          >
            <option value="all">All priorities</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Region"
            value={filters.regionId}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                regionId: value as typeof current.regionId,
                siteId:
                  value === "all"
                    ? current.siteId
                    : defaultJobsListFilters.siteId,
              }))
            }
          >
            <option value="all">All regions</option>
            {optionsState.data.regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Site"
            value={filters.siteId}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                siteId: value as typeof current.siteId,
              }))
            }
          >
            <option value="all">All sites</option>
            {optionsState.data.sites
              .filter((site) =>
                filters.regionId === "all"
                  ? true
                  : site.regionId === filters.regionId
              )
              .map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
          </FilterSelect>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {jobs.length} job{jobs.length === 1 ? "" : "s"} in this
              view.
            </span>
            {hasCustomFilters ? (
              <ul
                aria-label="Active filters"
                className="flex flex-wrap items-center gap-2"
              >
                {activeFilters.map((filter) => (
                  <li key={filter}>
                    <Badge variant="outline">{filter}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {hasCustomFilters ? (
            <button
              type="button"
              className={buttonVariants({ size: "xs", variant: "ghost" })}
              onClick={() => setFilters(defaultJobsListFilters)}
            >
              Clear all filters
            </button>
          ) : null}
        </div>

        <Separator />

        {jobs.length === 0 ? (
          <Empty className="min-h-[320px] bg-muted/20 px-6 py-10">
            <EmptyHeader>
              <EmptyTitle>No jobs match this view yet.</EmptyTitle>
              <EmptyDescription>
                {canCreateJobs
                  ? "Tighten or clear the filters, or start the queue with a fresh job intake."
                  : "Tighten or clear the filters, or check back once new work lands in the queue."}
              </EmptyDescription>
            </EmptyHeader>
            {canCreateJobs ? (
              <Link to="/jobs/new" className={buttonVariants({ size: "sm" })}>
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Create the first job
              </Link>
            ) : null}
          </Empty>
        ) : (
          <>
            <ul className="flex flex-col gap-3 xl:hidden">
              {jobs.map((job) => {
                const site = job.siteId
                  ? lookup.siteById.get(job.siteId)
                  : undefined;
                const assignee = job.assigneeId
                  ? lookup.memberById.get(job.assigneeId)
                  : undefined;
                const coordinator = job.coordinatorId
                  ? lookup.memberById.get(job.coordinatorId)
                  : undefined;

                return (
                  <li key={job.id}>
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: job.id }}
                      className="block rounded-3xl border bg-background/84 p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={job.status} />
                            <PriorityBadge priority={job.priority} />
                            {site && hasSiteCoordinates(site) ? (
                              <Badge variant="outline">Pinned</Badge>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-2">
                            <p className="font-medium tracking-tight text-foreground">
                              {job.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium text-foreground/85">
                                {site?.name ?? "No site yet"}
                              </span>
                              {site?.regionName ? (
                                <>
                                  <span className="text-muted-foreground">
                                    •
                                  </span>
                                  <span className="text-muted-foreground">
                                    {site.regionName}
                                  </span>
                                </>
                              ) : null}
                            </div>
                            <p className="text-xs tracking-wide text-muted-foreground uppercase">
                              Updated {formatRelativeDate(job.updatedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-[320px]">
                          <MetaLine
                            icon={User03Icon}
                            label="Assignee"
                            value={assignee?.name ?? "Unassigned"}
                          />
                          <MetaLine
                            icon={User03Icon}
                            label="Coordinator"
                            value={coordinator?.name ?? "Not set"}
                          />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-hidden rounded-3xl border bg-background/88 xl:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Coordinator</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const site = job.siteId
                      ? lookup.siteById.get(job.siteId)
                      : undefined;
                    const assignee = job.assigneeId
                      ? lookup.memberById.get(job.assigneeId)
                      : undefined;
                    const coordinator = job.coordinatorId
                      ? lookup.memberById.get(job.coordinatorId)
                      : undefined;

                    return (
                      <TableRow
                        key={job.id}
                        className="group bg-transparent transition-colors hover:bg-muted/20"
                      >
                        <TableCell className="py-3.5">
                          <Link
                            to="/jobs/$jobId"
                            params={{ jobId: job.id }}
                            className="group/link -mx-3 flex items-start justify-between gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-muted/25"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-col gap-1.5">
                                <span className="truncate leading-6 font-medium text-foreground transition-colors group-hover/link:text-foreground/80">
                                  {job.title}
                                </span>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {job.kind === "job" ? "Job" : job.kind}
                                  </span>
                                  {site && hasSiteCoordinates(site) ? (
                                    <Badge variant="outline">Pinned</Badge>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-medium text-muted-foreground transition-colors group-hover/link:text-foreground">
                              Open
                              <HugeiconsIcon
                                icon={ArrowRight01Icon}
                                strokeWidth={2}
                                className="size-4"
                              />
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="py-3.5">
                          <StatusBadge status={job.status} />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <PriorityBadge priority={job.priority} />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="truncate font-medium text-foreground/90">
                              {site?.name ?? "No site yet"}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {site?.regionName ?? "Unassigned region"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 text-muted-foreground">
                          {assignee?.name ?? "Unassigned"}
                        </TableCell>
                        <TableCell className="py-3.5 text-muted-foreground">
                          {coordinator?.name ?? "Not set"}
                        </TableCell>
                        <TableCell className="py-3.5 text-right text-muted-foreground">
                          {formatRelativeDate(job.updatedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  const mapPanel = (
    <div data-testid="jobs-coverage-panel">
      <JobsCoverageMap jobs={jobs} sites={lookup.siteById} />
    </div>
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-3xl flex-col gap-3">
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            Jobs
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl">
              Keep {activeOrganizationName} moving without the admin drag.
            </h1>
            <p className="max-w-[68ch] text-sm/7 text-muted-foreground sm:text-base/7">
              Intake stays light, the queue stays readable, and the whole team
              can scan what needs attention before the day gets noisy.
            </p>
          </div>
        </div>
        {canCreateJobs ? (
          <div className="flex flex-wrap gap-3">
            <Link to="/jobs/new" className={buttonVariants()}>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              New job
            </Link>
          </div>
        ) : null}
      </header>

      {notice ? (
        <Alert>
          <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
          <AlertTitle>{notice.title} added to Jobs</AlertTitle>
          <AlertDescription>
            The new intake is in the queue and ready for the next step.
          </AlertDescription>
          <button
            type="button"
            className={buttonVariants({ size: "xs", variant: "ghost" })}
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Visible jobs"
          value={summary.total}
          description="Based on the current filters."
        />
        <SummaryCard
          label="Active"
          value={summary.active}
          description="New, triaged, in progress, and blocked."
        />
        <SummaryCard
          label="Blocked"
          value={summary.blocked}
          description="Work that needs a true unblock before it moves."
        />
        <SummaryCard
          label="Mapped"
          value={mappedJobCount}
          description="Jobs with a pinned site location ready for the map."
        />
      </section>

      {isCompactWorkspace ? (
        <Tabs defaultValue="queue" className="gap-4">
          <TabsList variant="line">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="map">Coverage map</TabsTrigger>
          </TabsList>
          <TabsContent value="queue">{queuePanel}</TabsContent>
          <TabsContent value="map">{mapPanel}</TabsContent>
        </Tabs>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)] xl:items-start">
          {queuePanel}
          <div className="sticky top-6">{mapPanel}</div>
        </div>
      )}

      {children}
    </main>
  );
}

function useJobsCompactWorkspace() {
  return React.useSyncExternalStore(
    subscribeToJobsCompactWorkspace,
    getJobsCompactWorkspaceSnapshot,
    () => false
  );
}

function subscribeToJobsCompactWorkspace(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => null;
  }

  window.addEventListener("resize", onStoreChange);

  return () => {
    window.removeEventListener("resize", onStoreChange);
  };
}

function getJobsCompactWorkspaceSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth < JOBS_COMPACT_WORKSPACE_BREAKPOINT;
}

function FilterSelect({
  children,
  label,
  onValueChange,
  value,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Select
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        {children}
      </Select>
    </label>
  );
}

function MetaLine({
  icon,
  label,
  value,
}: {
  readonly icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <HugeiconsIcon icon={icon} strokeWidth={2} className="mt-0.5" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
        <span className="truncate text-foreground">{value}</span>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  readonly status: keyof typeof STATUS_LABELS;
}) {
  return (
    <Badge variant={status === "blocked" ? "outline" : "secondary"}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PriorityBadge({ priority }: { readonly priority: JobPriority }) {
  return (
    <Badge variant={priority === "none" ? "outline" : "secondary"}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

function SummaryCard({
  description,
  label,
  value,
}: {
  readonly description: string;
  readonly label: string;
  readonly value: number;
}) {
  return (
    <Card className="border-dashed bg-muted/20 shadow-none">
      <CardContent className="flex items-end justify-between gap-4 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground/90">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="font-heading text-2xl font-medium text-foreground/85 tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return formatter.format(date);
}

function buildActiveFilterBadges(
  filters: JobsListFilters,
  lookup: {
    readonly memberById: ReadonlyMap<string, { readonly name: string }>;
    readonly regionById: ReadonlyMap<string, { readonly name: string }>;
    readonly siteById: ReadonlyMap<string, { readonly name: string }>;
  }
) {
  const badges: string[] = [];

  if (filters.status !== defaultJobsListFilters.status) {
    const selectedStatus = STATUS_FILTER_OPTIONS.find(
      (option) => option.value === filters.status
    );

    badges.push(`Status: ${selectedStatus?.label ?? filters.status}`);
  }

  if (filters.assigneeId !== defaultJobsListFilters.assigneeId) {
    badges.push(
      `Assignee: ${lookup.memberById.get(filters.assigneeId)?.name ?? "Unknown"}`
    );
  }

  if (filters.coordinatorId !== defaultJobsListFilters.coordinatorId) {
    badges.push(
      `Coordinator: ${lookup.memberById.get(filters.coordinatorId)?.name ?? "Unknown"}`
    );
  }

  if (
    filters.priority !== defaultJobsListFilters.priority &&
    filters.priority !== "all"
  ) {
    badges.push(`Priority: ${PRIORITY_LABELS[filters.priority] ?? "Unknown"}`);
  }

  if (filters.regionId !== defaultJobsListFilters.regionId) {
    badges.push(
      `Region: ${lookup.regionById.get(filters.regionId)?.name ?? "Unknown"}`
    );
  }

  if (filters.siteId !== defaultJobsListFilters.siteId) {
    badges.push(
      `Site: ${lookup.siteById.get(filters.siteId)?.name ?? "Unknown"}`
    );
  }

  return badges;
}
