"use client";
import type {
  JobListItem,
  JobPriority,
  JobStatus,
  UserIdType,
} from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import {
  Add01Icon,
  ArrowRight01Icon,
  Briefcase01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FilterHorizontalIcon,
  LeftToRightListBulletIcon,
  MapsSquare01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
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
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { useIsMobile } from "#/hooks/use-mobile";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import {
  JOB_PRIORITY_LABELS as PRIORITY_LABELS,
  JOB_STATUS_LABELS as STATUS_LABELS,
} from "./job-display";
import {
  buildJobSavedViews,
  findMatchingJobSavedView,
} from "./jobs-saved-views";
import type { JobSavedView } from "./jobs-saved-views";
import {
  defaultJobsListFilters,
  filterVisibleJobs,
  isJobsAssigneeFilterEqual,
  useJobsListState,
  useJobsLookup,
  useJobsNotice,
  useJobsOptions,
  useRefreshJobsListMutation,
} from "./jobs-state";
import type { JobsAssigneeFilter, JobsListFilters } from "./jobs-state";
import { canUseInternalJobOptions, hasJobsElevatedAccess } from "./jobs-viewer";
import type { JobsViewer } from "./jobs-viewer";

type JobsViewMode = "list" | "map";

type JobsLookup = ReturnType<typeof useJobsLookup>;

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

const relativeDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const JobsCoverageMap = React.lazy(async () => {
  const module = await import("./jobs-coverage-map");

  return { default: module.JobsCoverageMap };
});

// Route-level page coordinates filters, URL state, command actions, and layout.
// react-doctor-disable-next-line
export function JobsPage({
  children,
  listHotkeysEnabled = true,
  onViewModeChange,
  viewMode: controlledViewMode,
  viewer,
}: {
  readonly children?: React.ReactNode;
  readonly listHotkeysEnabled?: boolean;
  readonly onViewModeChange?: (value: JobsViewMode) => void;
  readonly viewMode?: JobsViewMode;
  readonly viewer: JobsViewer;
}) {
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    React.useState<JobsViewMode>("list");
  const viewMode = controlledViewMode ?? uncontrolledViewMode;
  const [filters, setFilters] = React.useState<JobsListFilters>(
    defaultJobsListFilters
  );
  const jobsListState = useJobsListState();
  const [notice, clearNotice] = useJobsNotice();
  const options = useJobsOptions();
  const lookup = useJobsLookup();
  const jobs = React.useMemo(
    () =>
      filterVisibleJobs({
        filters,
        items: jobsListState.items,
        lookup,
      }),
    [filters, jobsListState.items, lookup]
  );
  const statusCounts = React.useMemo(
    () => buildJobStatusCounts(jobsListState.items),
    [jobsListState.items]
  );
  const refreshJobs = useRefreshJobsListMutation();
  const navigate = useNavigate({ from: "/jobs" });
  const canCreateJobs = hasJobsElevatedAccess(viewer.role);
  const canUseInternalOptions = canUseInternalJobOptions(viewer);
  const visibleViewMode = canUseInternalOptions ? viewMode : "list";
  const [savedViewsOpen, setSavedViewsOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const activeFilters = buildActiveFilterBadges(filters, lookup);
  const hasCustomFilters = activeFilters.length > 0;
  const savedViews = React.useMemo(
    () => buildJobSavedViews(viewer.userId),
    [viewer.userId]
  );
  const activeSavedView = findMatchingJobSavedView(filters, savedViews);

  React.useEffect(() => {
    if (canUseInternalOptions) {
      return;
    }

    setFilters((current) => ({
      ...current,
      assigneeId: defaultJobsListFilters.assigneeId,
      coordinatorId: defaultJobsListFilters.coordinatorId,
      labelId: defaultJobsListFilters.labelId,
      priority: defaultJobsListFilters.priority,
      serviceAreaId: defaultJobsListFilters.serviceAreaId,
      siteId: defaultJobsListFilters.siteId,
    }));
  }, [canUseInternalOptions, setFilters]);

  const patchFilters = React.useCallback(
    (patch: Partial<JobsListFilters>) => {
      setFilters((current) => ({
        ...current,
        ...patch,
      }));
    },
    [setFilters]
  );

  const setViewMode = React.useCallback(
    (nextViewMode: JobsViewMode) => {
      if (nextViewMode === viewMode) {
        return;
      }

      if (controlledViewMode === undefined) {
        setUncontrolledViewMode(nextViewMode);
      }

      onViewModeChange?.(nextViewMode);
    },
    [controlledViewMode, onViewModeChange, viewMode]
  );

  const applySavedView = React.useCallback(
    (savedView: JobSavedView) => {
      setFilters(savedView.filters);
    },
    [setFilters]
  );
  const openJob = React.useCallback(
    (jobId: JobListItem["id"]) => {
      navigate({
        params: { jobId },
        to: "/jobs/$jobId",
      });
    },
    [navigate]
  );

  const jobsPageCommandActions = React.useMemo<readonly CommandAction[]>(() => {
    const actions: CommandAction[] = [
      ...(canCreateJobs
        ? [
            {
              group: "Current page",
              icon: Add01Icon,
              id: "jobs-create",
              priority: 90,
              run: () => navigate({ to: "/jobs/new" }),
              scope: "route" as const,
              shortcut: HOTKEYS.jobsCreate,
              title: "Create job",
            },
          ]
        : []),
      ...(canUseInternalOptions
        ? [
            ...savedViews.map((savedView, index) => ({
              disabled: savedView.id === activeSavedView?.id,
              group: "Job views",
              icon: FilterHorizontalIcon,
              id: `jobs-saved-view-${savedView.id}`,
              priority: 65 - index,
              run: () => applySavedView(savedView),
              scope: "route" as const,
              title: `Apply ${savedView.label} view`,
            })),
            {
              disabled: viewMode === "list",
              group: "Current page",
              icon: LeftToRightListBulletIcon,
              id: "jobs-switch-list-view",
              priority: 80,
              run: () => setViewMode("list"),
              scope: "route" as const,
              shortcut: HOTKEYS.jobsListView,
              title: "Switch to list view",
            },
            {
              disabled: viewMode === "map",
              group: "Current page",
              icon: MapsSquare01Icon,
              id: "jobs-switch-map-view",
              priority: 70,
              run: () => setViewMode("map"),
              scope: "route" as const,
              shortcut: HOTKEYS.jobsMapView,
              title: "Switch to map view",
            },
          ]
        : []),
      {
        disabled: filters.status === "active",
        group: "Job filters",
        icon: FilterHorizontalIcon,
        id: "jobs-filter-active",
        priority: 60,
        run: () => patchFilters({ status: "active" }),
        scope: "route",
        title: "Show active jobs",
      },
      {
        disabled: filters.status === "all",
        group: "Job filters",
        icon: FilterHorizontalIcon,
        id: "jobs-filter-all",
        priority: 50,
        run: () => patchFilters({ status: "all" }),
        scope: "route",
        title: "Show all jobs",
      },
    ];

    if (hasCustomFilters) {
      actions.push({
        group: "Job filters",
        icon: Cancel01Icon,
        id: "jobs-clear-filters",
        priority: 90,
        run: () => setFilters(defaultJobsListFilters),
        scope: "route",
        shortcut: HOTKEYS.jobsClearFilters,
        title: "Clear job filters",
      });
    }

    return actions;
  }, [
    activeSavedView?.id,
    applySavedView,
    canCreateJobs,
    canUseInternalOptions,
    filters.status,
    hasCustomFilters,
    navigate,
    patchFilters,
    setFilters,
    savedViews,
    viewMode,
    setViewMode,
  ]);

  useRegisterCommandActions(jobsPageCommandActions);
  useAppHotkey(
    "jobsSearch",
    () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    { enabled: listHotkeysEnabled }
  );
  useAppHotkey(
    "jobsCreate",
    () => {
      navigate({ to: "/jobs/new" });
    },
    { enabled: listHotkeysEnabled && canCreateJobs }
  );
  useAppHotkey(
    "jobsRefresh",
    () => {
      refreshJobs();
    },
    { enabled: listHotkeysEnabled }
  );
  useAppHotkeySequence(
    "jobsListView",
    () => {
      setViewMode("list");
    },
    { enabled: listHotkeysEnabled && canUseInternalOptions }
  );
  useAppHotkeySequence(
    "jobsMapView",
    () => {
      setViewMode("map");
    },
    { enabled: listHotkeysEnabled && canUseInternalOptions }
  );
  useAppHotkeySequence(
    "jobsSavedViews",
    () => {
      setSavedViewsOpen(true);
    },
    { enabled: listHotkeysEnabled && canUseInternalOptions }
  );

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <header className="flex min-w-0 flex-col gap-3 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate font-heading text-xl font-medium text-foreground">
              Jobs
            </h1>
            {canUseInternalOptions && !isMobile ? (
              <SavedViewsControl
                activeSavedView={activeSavedView}
                className="h-8 w-36 shrink-0 bg-background"
                id="jobs-saved-view-desktop"
                onOpenChange={setSavedViewsOpen}
                onSavedViewSelect={applySavedView}
                open={savedViewsOpen}
                savedViews={savedViews}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canUseInternalOptions ? (
              <ViewModeSwitch value={viewMode} onValueChange={setViewMode} />
            ) : null}
            {canCreateJobs ? <NewJobLink /> : null}
          </div>
        </div>
        <JobsCommandToolbar
          filters={filters}
          hasCustomFilters={hasCustomFilters}
          optionsState={options}
          onClearFilters={() => setFilters(defaultJobsListFilters)}
          onFiltersChange={patchFilters}
          savedViewsControl={
            canUseInternalOptions && isMobile ? (
              <SavedViewsControl
                activeSavedView={activeSavedView}
                className="h-8 w-40"
                id="jobs-saved-view-mobile"
                onOpenChange={setSavedViewsOpen}
                onSavedViewSelect={applySavedView}
                open={savedViewsOpen}
                savedViews={savedViews}
              />
            ) : null
          }
          searchInputRef={searchInputRef}
          showInternalFilters={canUseInternalOptions}
        />
        <JobStatusRail
          counts={statusCounts}
          status={filters.status}
          onStatusChange={(status) => patchFilters({ status })}
        />
      </header>

      {notice ? (
        <Alert
          role="status"
          variant="success"
          className="animate-in py-2 pr-24 duration-150 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
        >
          <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
          <AlertTitle className="truncate">{notice.title}</AlertTitle>
          <AlertDescription>Job added to the queue.</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={clearNotice}
            >
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {hasCustomFilters ? (
        <ActiveFilterBar
          filters={activeFilters}
          onClearAll={() => setFilters(defaultJobsListFilters)}
          onRemove={(key) =>
            patchFilters({ [key]: defaultJobsListFilters[key] })
          }
        />
      ) : null}

      {visibleViewMode === "list" ? (
        <JobsListView
          jobs={jobs}
          canCreateJobs={canCreateJobs}
          hasCustomFilters={hasCustomFilters}
          lookup={lookup}
          totalJobs={jobsListState.items.length}
          onClearFilters={() => setFilters(defaultJobsListFilters)}
          onOpenJob={openJob}
        />
      ) : (
        <section data-testid="jobs-coverage-panel" className="min-h-0">
          <React.Suspense fallback={<JobsCoverageMapFallback />}>
            <JobsCoverageMap jobs={jobs} sites={lookup.siteById} />
          </React.Suspense>
        </section>
      )}

      {children}
    </main>
  );
}

function JobsCoverageMapFallback() {
  return (
    <div
      aria-label="Loading map view"
      className="min-h-[420px] rounded-2xl border bg-muted/10"
    />
  );
}

function JobsCommandToolbar({
  filters,
  hasCustomFilters,
  onClearFilters,
  onFiltersChange,
  savedViewsControl,
  optionsState,
  searchInputRef,
  showInternalFilters,
}: {
  readonly filters: JobsListFilters;
  readonly hasCustomFilters: boolean;
  readonly onClearFilters: () => void;
  readonly onFiltersChange: (patch: Partial<JobsListFilters>) => void;
  readonly savedViewsControl?: React.ReactNode;
  readonly optionsState: {
    readonly labels: readonly { readonly id: string; readonly name: string }[];
    readonly members: readonly {
      readonly id: UserIdType;
      readonly name: string;
    }[];
    readonly serviceAreas: readonly {
      readonly id: string;
      readonly name: string;
    }[];
    readonly sites: readonly {
      readonly id: string;
      readonly name: string;
      readonly serviceAreaId?: string | undefined;
    }[];
  };
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly showInternalFilters: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <InputGroup className="h-8 border-border bg-background xl:w-72">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search jobs"
            placeholder="Search jobs"
            ref={searchInputRef}
            value={filters.query}
            onChange={(event) => onFiltersChange({ query: event.target.value })}
          />
        </InputGroup>

        <div className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pb-1 xl:justify-end xl:pb-0">
          {savedViewsControl}
          {showInternalFilters ? (
            <>
              <CommandFilter
                label="Assignee"
                value={formatJobsAssigneeFilterValue(filters.assigneeId)}
                options={[
                  { label: "All assignees", value: "all" },
                  { label: "Unassigned", value: "unassigned" },
                  ...optionsState.members.map((member) => ({
                    label: member.name,
                    value: formatJobsAssigneeFilterValue({
                      kind: "user",
                      userId: member.id,
                    }),
                  })),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    assigneeId: parseJobsAssigneeFilterValue(
                      value,
                      optionsState.members
                    ),
                  })
                }
              />
              <CommandFilter
                label="Priority"
                value={filters.priority}
                options={[
                  { label: "All priorities", value: "all" },
                  ...Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
                    label,
                    value,
                  })),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    priority: value as JobsListFilters["priority"],
                  })
                }
              />
              <CommandFilter
                label="Label"
                value={filters.labelId}
                options={[
                  { label: "All labels", value: "all" },
                  ...optionsState.labels.map((label) => ({
                    label: label.name,
                    value: label.id,
                  })),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    labelId: value as JobsListFilters["labelId"],
                  })
                }
              />
              <CommandFilter
                label="Site"
                value={filters.siteId}
                options={[
                  { label: "All sites", value: "all" },
                  ...buildSiteFilterOptions(
                    optionsState.sites,
                    filters.serviceAreaId
                  ),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    siteId: value as JobsListFilters["siteId"],
                  })
                }
              />
              <CommandFilter
                label="More"
                value="all"
                triggerIcon={FilterHorizontalIcon}
                options={[
                  { label: "All coordinators", value: "coordinator:all" },
                  ...optionsState.members.map((member) => ({
                    label: `Coordinator: ${member.name}`,
                    value: `coordinator:${member.id}`,
                  })),
                  { label: "All service areas", value: "serviceArea:all" },
                  ...optionsState.serviceAreas.map((serviceArea) => ({
                    label: `Service area: ${serviceArea.name}`,
                    value: `serviceArea:${serviceArea.id}`,
                  })),
                ]}
                onValueChange={(value) => {
                  const [kind, nextValue] = value.split(":");

                  if (kind === "coordinator") {
                    onFiltersChange({
                      coordinatorId:
                        nextValue as JobsListFilters["coordinatorId"],
                    });
                    return;
                  }

                  if (kind === "serviceArea") {
                    onFiltersChange({
                      serviceAreaId:
                        nextValue as JobsListFilters["serviceAreaId"],
                      siteId:
                        nextValue === "all"
                          ? filters.siteId
                          : defaultJobsListFilters.siteId,
                    });
                  }
                }}
              />
            </>
          ) : null}

          {hasCustomFilters ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClearFilters}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SavedViewsControl({
  activeSavedView,
  className,
  id = "jobs-saved-view",
  onOpenChange,
  onSavedViewSelect,
  open,
  savedViews,
}: {
  readonly activeSavedView: JobSavedView | undefined;
  readonly className?: string;
  readonly id?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSavedViewSelect: (savedView: JobSavedView) => void;
  readonly open: boolean;
  readonly savedViews: readonly JobSavedView[];
}) {
  const label = activeSavedView?.label ?? "Custom view";
  const groups = React.useMemo(
    () =>
      [
        {
          label: "Saved views",
          options: savedViews.map((savedView) => ({
            label: savedView.label,
            value: savedView.id,
          })),
        },
      ] satisfies readonly CommandSelectGroup[],
    [savedViews]
  );

  return (
    <CommandSelect
      id={id}
      value={activeSavedView?.id ?? ""}
      placeholder="Custom view"
      emptyText="No views."
      groups={groups}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={(value) => {
        const savedView = savedViews.find((view) => view.id === value);

        if (savedView) {
          onSavedViewSelect(savedView);
        }
      }}
      ariaLabel={`Saved view: ${label}`}
      className={cn("h-8 w-full shrink-0 bg-background xl:w-44", className)}
      prefix={<HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} />}
      searchPlaceholder="Switch saved view"
    />
  );
}

function CommandFilter({
  label,
  onValueChange,
  options,
  triggerIcon,
  value,
}: {
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly triggerIcon?: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly value: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);
  const Icon = triggerIcon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 bg-background"
            aria-label={`${label} filter: ${selected?.label ?? label}`}
          />
        }
      >
        {Icon ? (
          <HugeiconsIcon icon={Icon} strokeWidth={2} data-icon="inline-start" />
        ) : null}
        <span>{selected?.label ?? label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Filter ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading={label}>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  data-checked={option.value === value ? "true" : undefined}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ViewModeSwitch({
  onValueChange,
  value,
}: {
  readonly onValueChange: (value: JobsViewMode) => void;
  readonly value: JobsViewMode;
}) {
  const nextView = value === "list" ? "map" : "list";
  const label = nextView === "map" ? "Map" : "List";
  const icon =
    nextView === "map" ? MapsSquare01Icon : LeftToRightListBulletIcon;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="bg-background"
      onClick={() => onValueChange(nextView)}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} data-icon="inline-start" />
      {label}
    </Button>
  );
}

type JobStatusFilterValue = (typeof STATUS_FILTER_OPTIONS)[number]["value"];

type JobStatusCounts = Record<JobStatusFilterValue, number>;

function JobStatusRail({
  counts,
  onStatusChange,
  status,
}: {
  readonly counts: JobStatusCounts;
  readonly onStatusChange: (status: JobsListFilters["status"]) => void;
  readonly status: JobsListFilters["status"];
}) {
  return (
    <div
      aria-label="Job status views"
      className="no-scrollbar flex min-w-0 items-center gap-4 overflow-x-auto border-t pt-2"
    >
      {STATUS_FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "-mb-3 flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-0 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            status === option.value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          aria-label={`${option.label} ${counts[option.value]}`}
          aria-pressed={status === option.value}
          onClick={() => onStatusChange(option.value)}
        >
          <span>{option.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            {counts[option.value]}
          </span>
        </button>
      ))}
    </div>
  );
}

function ActiveFilterBar({
  filters,
  onClearAll,
  onRemove,
}: {
  readonly filters: readonly ActiveFilterBadge[];
  readonly onClearAll: () => void;
  readonly onRemove: (key: keyof JobsListFilters) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Active filters"
    >
      {filters.map((filter) => (
        <Badge
          key={filter.label}
          variant="outline"
          className="gap-1 rounded-full"
        >
          {filter.label}
          <button
            type="button"
            className="inline-flex rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Remove ${filter.label}`}
            onClick={() => onRemove(filter.key)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </button>
        </Badge>
      ))}
      <Button type="button" size="xs" variant="ghost" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

function JobsListView({
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
    <div>
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
    </div>
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

function buildJobStatusCounts(jobs: readonly JobListItem[]): JobStatusCounts {
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

function NewJobLink() {
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

function buildSiteFilterOptions(
  sites: readonly {
    readonly id: string;
    readonly name: string;
    readonly serviceAreaId?: string;
  }[],
  serviceAreaId: JobsListFilters["serviceAreaId"]
) {
  const options: { readonly label: string; readonly value: string }[] = [];

  for (const site of sites) {
    if (serviceAreaId !== "all" && site.serviceAreaId !== serviceAreaId) {
      continue;
    }

    options.push({
      label: site.name,
      value: site.id,
    });
  }

  return options;
}

interface ActiveFilterBadge {
  readonly key: keyof JobsListFilters;
  readonly label: string;
}

function buildActiveFilterBadges(
  filters: JobsListFilters,
  lookup: {
    readonly labelById: ReadonlyMap<string, { readonly name: string }>;
    readonly memberById: ReadonlyMap<string, { readonly name: string }>;
    readonly serviceAreaById: ReadonlyMap<string, { readonly name: string }>;
    readonly siteById: ReadonlyMap<string, { readonly name: string }>;
  }
): readonly ActiveFilterBadge[] {
  const badges: ActiveFilterBadge[] = [];

  if (filters.query.trim().length > 0) {
    badges.push({ key: "query", label: `Search: ${filters.query.trim()}` });
  }

  if (filters.status !== defaultJobsListFilters.status) {
    const selectedStatus = STATUS_FILTER_OPTIONS.find(
      (option) => option.value === filters.status
    );

    badges.push({
      key: "status",
      label: `Status: ${selectedStatus?.label ?? filters.status}`,
    });
  }

  if (
    !isJobsAssigneeFilterEqual(
      filters.assigneeId,
      defaultJobsListFilters.assigneeId
    )
  ) {
    badges.push({
      key: "assigneeId",
      label: buildAssigneeFilterBadgeLabel(filters.assigneeId, lookup),
    });
  }

  if (filters.coordinatorId !== defaultJobsListFilters.coordinatorId) {
    badges.push({
      key: "coordinatorId",
      label: `Coordinator: ${lookup.memberById.get(filters.coordinatorId)?.name ?? "Unknown"}`,
    });
  }

  if (
    filters.priority !== defaultJobsListFilters.priority &&
    filters.priority !== "all"
  ) {
    badges.push({
      key: "priority",
      label: `Priority: ${PRIORITY_LABELS[filters.priority] ?? "Unknown"}`,
    });
  }

  addLookupFilterBadge(
    badges,
    "labelId",
    filters.labelId,
    defaultJobsListFilters.labelId,
    "Label",
    lookup.labelById
  );
  addLookupFilterBadge(
    badges,
    "serviceAreaId",
    filters.serviceAreaId,
    defaultJobsListFilters.serviceAreaId,
    "Service area",
    lookup.serviceAreaById
  );
  addLookupFilterBadge(
    badges,
    "siteId",
    filters.siteId,
    defaultJobsListFilters.siteId,
    "Site",
    lookup.siteById
  );

  return badges;
}

function addLookupFilterBadge(
  badges: ActiveFilterBadge[],
  key: keyof JobsListFilters,
  value: string,
  defaultValue: string,
  labelPrefix: string,
  lookup: ReadonlyMap<string, { readonly name: string }>
) {
  if (value === defaultValue) {
    return;
  }

  badges.push({
    key,
    label: `${labelPrefix}: ${lookup.get(value)?.name ?? "Unknown"}`,
  });
}

function buildAssigneeFilterBadgeLabel(
  assigneeId: JobsAssigneeFilter,
  lookup: {
    readonly memberById: ReadonlyMap<string, { readonly name: string }>;
  }
) {
  if (assigneeId.kind === "unassigned") {
    return "Assignee: Unassigned";
  }

  if (assigneeId.kind === "all") {
    return "Assignee: All";
  }

  return `Assignee: ${lookup.memberById.get(assigneeId.userId)?.name ?? "Unknown"}`;
}

function formatJobsAssigneeFilterValue(filter: JobsAssigneeFilter): string {
  if (filter.kind === "user") {
    return `user:${filter.userId}`;
  }

  return filter.kind;
}

function parseJobsAssigneeFilterValue(
  value: string,
  members: readonly { readonly id: UserIdType }[]
): JobsAssigneeFilter {
  if (value === "all") {
    return { kind: "all" };
  }

  if (value === "unassigned") {
    return { kind: "unassigned" };
  }

  const member = members.find(
    (candidate) =>
      formatJobsAssigneeFilterValue({
        kind: "user",
        userId: candidate.id,
      }) === value
  );

  return member ? { kind: "user", userId: member.id } : { kind: "all" };
}
