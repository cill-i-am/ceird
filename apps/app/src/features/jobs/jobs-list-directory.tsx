import type { JobListItem, JobPriority, JobStatus } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import {
  Add01Icon,
  ArrowRight01Icon,
  Briefcase01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { useIsMobile } from "#/hooks/use-mobile";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { cn } from "#/lib/utils";

import {
  JOB_PRIORITY_LABELS as PRIORITY_LABELS,
  JOB_STATUS_LABELS as STATUS_LABELS,
} from "./job-display";
import { useJobsLookup } from "./jobs-state";

type JobsLookup = ReturnType<typeof useJobsLookup>;

const JOB_QUEUE_STATUS_ORDER: readonly JobStatus[] = [
  "new",
  "triaged",
  "in_progress",
  "blocked",
  "completed",
  "canceled",
];

const JOB_STATUS_TONES: Record<
  JobStatus,
  { readonly className: string; readonly dotClassName: string }
> = {
  blocked: {
    className: "border-destructive/25 bg-destructive/5 text-destructive",
    dotClassName: "bg-destructive",
  },
  canceled: {
    className: "bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
  completed: {
    className: "bg-success/10 text-success",
    dotClassName: "bg-success",
  },
  in_progress: {
    className: "bg-primary/10 text-primary",
    dotClassName: "bg-primary",
  },
  new: {
    className: "bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
  triaged: {
    className: "bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
  },
};

const JOB_PRIORITY_TONES: Record<JobPriority, { readonly className: string }> =
  {
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

type JobStatusCounts = Record<"active" | "all" | JobStatus, number>;

const relativeDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function JobsListView({
  canCreateJobs,
  hasCustomFilters,
  jobs,
  lookup,
  onClearFilters,
  onOpenJob,
  totalJobs,
}: {
  readonly canCreateJobs: boolean;
  readonly hasCustomFilters: boolean;
  readonly jobs: readonly JobListItem[];
  readonly lookup: JobsLookup;
  readonly onClearFilters: () => void;
  readonly onOpenJob: (jobId: JobListItem["id"]) => void;
  readonly totalJobs: number;
}) {
  const isMobile = useIsMobile();
  const jobGroups = React.useMemo(() => buildJobStatusGroups(jobs), [jobs]);

  if (jobs.length === 0) {
    return (
      <JobsEmptyState
        canCreateJobs={canCreateJobs}
        hasCustomFilters={hasCustomFilters}
        totalJobs={totalJobs}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <section
      data-testid="jobs-queue-panel"
      aria-labelledby="jobs-directory-heading"
      className="min-h-0"
    >
      <h2 id="jobs-directory-heading" className="sr-only">
        Job directory
      </h2>
      <div className="overflow-hidden rounded-lg border bg-background">
        {isMobile ? (
          <JobsMobileDirectory
            canCreateJobs={canCreateJobs}
            groups={jobGroups}
            lookup={lookup}
          />
        ) : (
          <JobsDesktopDirectory
            canCreateJobs={canCreateJobs}
            groups={jobGroups}
            lookup={lookup}
            onOpenJob={onOpenJob}
          />
        )}
      </div>
    </section>
  );
}

function JobsMobileDirectory({
  canCreateJobs,
  groups,
  lookup,
}: {
  readonly canCreateJobs: boolean;
  readonly groups: readonly JobStatusGroupData[];
  readonly lookup: JobsLookup;
}) {
  return (
    <div className="divide-y">
      {groups.map((group) => (
        <section
          key={group.status}
          aria-labelledby={`jobs-mobile-status-group-${group.status}`}
        >
          <JobGroupHeading
            id={`jobs-mobile-status-group-${group.status}`}
            status={group.status}
          />
          <ul className="flex flex-col">
            {group.jobs.map((job) => (
              <li key={job.id}>
                <JobIssueRow job={job} lookup={lookup} compact />
              </li>
            ))}
          </ul>
          {canCreateJobs ? <AddJobGroupLink /> : null}
        </section>
      ))}
    </div>
  );
}

function JobsDesktopDirectory({
  canCreateJobs,
  groups,
  lookup,
  onOpenJob,
}: {
  readonly canCreateJobs: boolean;
  readonly groups: readonly JobStatusGroupData[];
  readonly lookup: JobsLookup;
  readonly onOpenJob: (jobId: JobListItem["id"]) => void;
}) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[40%]">Title</TableHead>
          <TableHead className="w-[12%]">Status</TableHead>
          <TableHead className="w-[12%]">Priority</TableHead>
          <TableHead className="w-[15%]">Site</TableHead>
          <TableHead className="w-[12%]">Assignee</TableHead>
          <TableHead className="w-[9%] text-right">Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <React.Fragment key={group.status}>
            <TableRow className="bg-background hover:bg-transparent">
              <TableCell colSpan={6} className="h-9 px-3 py-2">
                <JobGroupHeading
                  id={`jobs-desktop-status-group-${group.status}`}
                  status={group.status}
                />
              </TableCell>
            </TableRow>
            {group.jobs.map((job) => (
              <JobIssueTableRow
                key={job.id}
                job={job}
                lookup={lookup}
                onOpenJob={onOpenJob}
              />
            ))}
            {canCreateJobs ? (
              <TableRow className="hover:bg-muted/30">
                <TableCell colSpan={6} className="px-3 py-2">
                  <AddJobGroupLink />
                </TableCell>
              </TableRow>
            ) : null}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

function JobGroupHeading({
  id,
  status,
}: {
  readonly id: string;
  readonly status: JobStatus;
}) {
  return (
    <h2
      id={id}
      aria-label={`${STATUS_LABELS[status]} jobs`}
      className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground xl:px-0 xl:py-0"
    >
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="size-3 rotate-90 text-muted-foreground"
        aria-hidden
      />
      <span>{STATUS_LABELS[status]}</span>
    </h2>
  );
}

function AddJobGroupLink() {
  return (
    <Link
      to="/jobs/new"
      className="flex w-fit items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden />
      Add job
    </Link>
  );
}

interface JobStatusGroupData {
  readonly jobs: readonly JobListItem[];
  readonly status: JobStatus;
}

function buildJobStatusGroups(jobs: readonly JobListItem[]) {
  return JOB_QUEUE_STATUS_ORDER.flatMap((status) => {
    const statusJobs = jobs.filter((job) => job.status === status);

    return statusJobs.length > 0
      ? [
          {
            jobs: statusJobs,
            status,
          } satisfies JobStatusGroupData,
        ]
      : [];
  });
}

export function buildJobStatusCounts(
  jobs: readonly JobListItem[]
): JobStatusCounts {
  const counts: JobStatusCounts = {
    active: 0,
    all: jobs.length,
    blocked: 0,
    canceled: 0,
    completed: 0,
    in_progress: 0,
    new: 0,
    triaged: 0,
  };

  for (const job of jobs) {
    if (job.status !== "completed" && job.status !== "canceled") {
      counts.active += 1;
    }

    counts[job.status] += 1;
  }

  return counts;
}

function JobIssueTableRow({
  job,
  lookup,
  onOpenJob,
}: {
  readonly job: JobListItem;
  readonly lookup: JobsLookup;
  readonly onOpenJob: (jobId: JobListItem["id"]) => void;
}) {
  const site = job.siteId ? lookup.siteById.get(job.siteId) : undefined;
  const assignee = job.assigneeId
    ? lookup.memberById.get(job.assigneeId)
    : undefined;
  const openJob = React.useCallback(() => {
    onOpenJob(job.id);
  }, [job.id, onOpenJob]);

  return (
    <TableRow
      aria-label={`Open ${job.title}`}
      className="group h-12 cursor-pointer bg-transparent hover:bg-muted/30"
      onClick={openJob}
    >
      <TableCell className="min-w-0">
        <Link
          to="/jobs/$jobId"
          params={{ jobId: job.id }}
          className="flex min-w-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="min-w-0 truncate font-medium">{job.title}</span>
          <LabelBadges labels={job.labels} />
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={job.status} />
      </TableCell>
      <TableCell>
        <PriorityBadge priority={job.priority} />
      </TableCell>
      <TableCell className="min-w-0 text-muted-foreground">
        {site ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{site.name}</span>
            {site.serviceAreaName ? (
              <span className="truncate text-xs">{site.serviceAreaName}</span>
            ) : null}
          </span>
        ) : (
          "No site"
        )}
      </TableCell>
      <TableCell className="truncate text-muted-foreground">
        {assignee?.name ?? "Unassigned"}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {formatRelativeDate(job.updatedAt)}
      </TableCell>
    </TableRow>
  );
}

function JobIssueRow({
  compact = false,
  job,
  lookup,
}: {
  readonly compact?: boolean;
  readonly job: JobListItem;
  readonly lookup: JobsLookup;
}) {
  const site = job.siteId ? lookup.siteById.get(job.siteId) : undefined;
  const assignee = job.assigneeId
    ? lookup.memberById.get(job.assigneeId)
    : undefined;
  const metadata = [{ key: "site", value: site?.name ?? "No site" }];

  if (site?.serviceAreaName) {
    metadata.push({ key: "service-area", value: site.serviceAreaName });
  }

  metadata.push(
    { key: "assignee", value: assignee?.name ?? "Unassigned" },
    { key: "updated-at", value: formatRelativeDate(job.updatedAt) }
  );

  return (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      className={cn(
        "group flex min-w-0 items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/30",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        compact ? "items-start" : "items-center"
      )}
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{job.title}</span>
          <StatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
          <LabelBadges labels={job.labels} />
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {metadata.map((item) => (
            <span
              key={item.key}
              className={cn(
                "min-w-0 truncate",
                item.key !== "site" &&
                  "before:mr-2 before:text-muted-foreground/60 before:content-['/']"
              )}
            >
              {item.value}
            </span>
          ))}
        </div>
      </div>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}

function JobsEmptyState({
  canCreateJobs,
  hasCustomFilters,
  onClearFilters,
  totalJobs,
}: {
  readonly canCreateJobs: boolean;
  readonly hasCustomFilters: boolean;
  readonly onClearFilters: () => void;
  readonly totalJobs: number;
}) {
  const copy = getJobsEmptyStateCopy({
    canCreateJobs,
    hasCustomFilters,
    totalJobs,
  });
  const action = getJobsEmptyStateAction({
    canCreateJobs,
    hasCustomFilters,
    onClearFilters,
    totalJobs,
  });

  return (
    <section data-testid="jobs-queue-panel">
      <Empty className="min-h-[420px] border-transparent bg-transparent p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{copy.title}</EmptyTitle>
          <EmptyDescription>{copy.description}</EmptyDescription>
        </EmptyHeader>
        {action}
      </Empty>
    </section>
  );
}

function getJobsEmptyStateAction({
  canCreateJobs,
  hasCustomFilters,
  onClearFilters,
  totalJobs,
}: {
  readonly canCreateJobs: boolean;
  readonly hasCustomFilters: boolean;
  readonly onClearFilters: () => void;
  readonly totalJobs: number;
}) {
  if (hasCustomFilters) {
    return (
      <EmptyContent>
        <Button type="button" size="sm" onClick={onClearFilters}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Clear filters
        </Button>
      </EmptyContent>
    );
  }

  if (canCreateJobs && totalJobs === 0) {
    return (
      <EmptyContent>
        <Link to="/jobs/new" className={buttonVariants({ size: "sm" })}>
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          New job
          <ShortcutHint
            surface="button"
            hotkey={HOTKEYS.jobsCreate.hotkey}
            label={HOTKEYS.jobsCreate.label}
            decorative
          />
        </Link>
      </EmptyContent>
    );
  }

  return null;
}

function getJobsEmptyStateCopy({
  canCreateJobs,
  hasCustomFilters,
  totalJobs,
}: {
  readonly canCreateJobs: boolean;
  readonly hasCustomFilters: boolean;
  readonly totalJobs: number;
}) {
  if (hasCustomFilters) {
    return {
      description: "Clear filters to return to the full queue.",
      title: "No matching jobs.",
    };
  }

  if (totalJobs === 0) {
    return {
      description: canCreateJobs
        ? "Create the first job when work is ready to schedule."
        : "Jobs will appear here when the team creates them.",
      title: "No jobs yet.",
    };
  }

  return {
    description: "Switch to All jobs to review completed or canceled work.",
    title: "No active jobs.",
  };
}

export function NewJobLink() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link to="/jobs/new" className={buttonVariants({ size: "sm" })} />
        }
      >
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        New job
      </TooltipTrigger>
      <TooltipContent>
        <span>New job</span>
        <ShortcutHint
          hotkey={HOTKEYS.jobsCreate.hotkey}
          label={HOTKEYS.jobsCreate.label}
        />
      </TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({
  status,
}: {
  readonly status: keyof typeof STATUS_LABELS;
}) {
  const tone = JOB_STATUS_TONES[status];

  return (
    <Badge
      variant={status === "blocked" ? "outline" : "secondary"}
      className={cn("rounded-full", tone.className)}
    >
      <span className={cn("size-1.5 rounded-full", tone.dotClassName)} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PriorityBadge({ priority }: { readonly priority: JobPriority }) {
  const tone = JOB_PRIORITY_TONES[priority];

  return (
    <Badge
      variant={priority === "none" ? "outline" : "secondary"}
      className={cn("rounded-full", tone.className)}
    >
      {priority === "none" ? null : (
        <span
          className={cn(
            "relative size-3 text-current before:absolute before:top-0.5 before:left-1.5 before:h-2 before:w-px before:bg-current after:absolute after:top-0.5 after:left-1 after:size-1.5 after:-rotate-45 after:border-t after:border-r after:border-current",
            priority === "low" && "rotate-180"
          )}
          aria-hidden
        />
      )}
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

function LabelBadges({ labels }: { readonly labels: readonly Label[] }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <>
      {labels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="max-w-32 rounded-full text-muted-foreground"
        >
          <span className="truncate">{label.name}</span>
        </Badge>
      ))}
    </>
  );
}

function formatRelativeDate(value: string) {
  const date = new Date(value);

  return relativeDateFormatter.format(date);
}
