"use client";

import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  ArrowRight01Icon,
  Briefcase01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FilterHorizontalIcon,
  LeftToRightListBulletIcon,
  Location01Icon,
  MapsSquare01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  JobListItem,
  JobPriority,
  UserIdType,
} from "@task-tracker/jobs-core";
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
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import { JobsCoverageMap } from "./jobs-coverage-map";
import { hasSiteCoordinates } from "./jobs-location";
import {
  buildJobSavedViews,
  findMatchingJobSavedView,
} from "./jobs-saved-views";
import type { JobSavedView } from "./jobs-saved-views";
import {
  defaultJobsListFilters,
  isJobsAssigneeFilterEqual,
  jobsListFiltersAtom,
  jobsLookupAtom,
  jobsNoticeAtom,
  jobsOptionsStateAtom,
  refreshJobsListAtom,
  visibleJobsAtom,
} from "./jobs-state";
import type { JobsAssigneeFilter, JobsListFilters } from "./jobs-state";
import { hasJobsElevatedAccess } from "./jobs-viewer";
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

export function JobsPage({
  children,
  listHotkeysEnabled = true,
  onViewModeChange,
  viewMode: controlledViewMode,
  viewer,
}: {
  readonly activeOrganizationName: string;
  readonly children?: React.ReactNode;
  readonly listHotkeysEnabled?: boolean;
  readonly onViewModeChange?: (value: JobsViewMode) => void;
  readonly viewMode?: JobsViewMode;
  readonly viewer: JobsViewer;
}) {
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    React.useState<JobsViewMode>("list");
  const viewMode = controlledViewMode ?? uncontrolledViewMode;
  const filters = useAtomValue(jobsListFiltersAtom);
  const jobs = useAtomValue(visibleJobsAtom);
  const lookup = useAtomValue(jobsLookupAtom);
  const notice = useAtomValue(jobsNoticeAtom);
  const optionsState = useAtomValue(jobsOptionsStateAtom);
  const refreshJobs = useAtomSet(refreshJobsListAtom);
  const setFilters = useAtomSet(jobsListFiltersAtom);
  const setNotice = useAtomSet(jobsNoticeAtom);
  const navigate = useNavigate({ from: "/jobs" });
  const canCreateJobs = hasJobsElevatedAccess(viewer.role);
  const [savedViewsOpen, setSavedViewsOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeFilters = buildActiveFilterBadges(filters, lookup);
  const hasCustomFilters = activeFilters.length > 0;
  const savedViews = React.useMemo(
    () => buildJobSavedViews(viewer.userId),
    [viewer.userId]
  );
  const activeSavedView = findMatchingJobSavedView(filters, savedViews);

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
              title: "Create job",
            },
          ]
        : []),
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
        scope: "route",
        title: "Switch to list view",
      },
      {
        disabled: viewMode === "map",
        group: "Current page",
        icon: MapsSquare01Icon,
        id: "jobs-switch-map-view",
        priority: 70,
        run: () => setViewMode("map"),
        scope: "route",
        title: "Switch to map view",
      },
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
        title: "Clear job filters",
      });
    }

    return actions;
  }, [
    activeSavedView?.id,
    applySavedView,
    canCreateJobs,
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
    { enabled: listHotkeysEnabled }
  );
  useAppHotkeySequence(
    "jobsMapView",
    () => {
      setViewMode("map");
    },
    { enabled: listHotkeysEnabled }
  );
  useAppHotkeySequence(
    "jobsSavedViews",
    () => {
      setSavedViewsOpen(true);
    },
    { enabled: listHotkeysEnabled }
  );

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <header className="flex min-w-0 flex-col gap-4 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-xl font-medium">
                Jobs
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ViewModeSwitch value={viewMode} onValueChange={setViewMode} />
            {canCreateJobs ? <NewJobLink /> : null}
          </div>
        </div>

        <JobsCommandToolbar
          activeSavedView={activeSavedView}
          filters={filters}
          hasCustomFilters={hasCustomFilters}
          onSavedViewSelect={applySavedView}
          onSavedViewsOpenChange={setSavedViewsOpen}
          optionsState={optionsState.data}
          onClearFilters={() => setFilters(defaultJobsListFilters)}
          onFiltersChange={patchFilters}
          savedViews={savedViews}
          savedViewsOpen={savedViewsOpen}
          searchInputRef={searchInputRef}
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
              onClick={() => setNotice(null)}
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

      {viewMode === "list" ? (
        <JobsListView jobs={jobs} canCreateJobs={canCreateJobs} />
      ) : (
        <section data-testid="jobs-coverage-panel" className="min-h-0">
          <JobsCoverageMap jobs={jobs} sites={lookup.siteById} />
        </section>
      )}

      {children}
    </main>
  );
}

function JobsCommandToolbar({
  activeSavedView,
  filters,
  hasCustomFilters,
  onClearFilters,
  onFiltersChange,
  onSavedViewSelect,
  onSavedViewsOpenChange,
  optionsState,
  savedViews,
  savedViewsOpen,
  searchInputRef,
}: {
  readonly activeSavedView: JobSavedView | undefined;
  readonly filters: JobsListFilters;
  readonly hasCustomFilters: boolean;
  readonly onClearFilters: () => void;
  readonly onFiltersChange: (patch: Partial<JobsListFilters>) => void;
  readonly onSavedViewSelect: (savedView: JobSavedView) => void;
  readonly onSavedViewsOpenChange: (open: boolean) => void;
  readonly optionsState: {
    readonly members: readonly {
      readonly id: UserIdType;
      readonly name: string;
    }[];
    readonly regions: readonly { readonly id: string; readonly name: string }[];
    readonly sites: readonly {
      readonly id: string;
      readonly name: string;
      readonly regionId?: string | undefined;
    }[];
  };
  readonly savedViews: readonly JobSavedView[];
  readonly savedViewsOpen: boolean;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <SavedViewsControl
          activeSavedView={activeSavedView}
          onOpenChange={onSavedViewsOpenChange}
          onSavedViewSelect={onSavedViewSelect}
          open={savedViewsOpen}
          savedViews={savedViews}
        />
        <InputGroup className="h-8 bg-background xl:max-w-72">
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
          <CommandFilter
            label="Status"
            value={filters.status}
            options={STATUS_FILTER_OPTIONS}
            onValueChange={(value) =>
              onFiltersChange({ status: value as JobsListFilters["status"] })
            }
          />
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
            label="Site"
            value={filters.siteId}
            options={[
              { label: "All sites", value: "all" },
              ...optionsState.sites
                .filter((site) =>
                  filters.regionId === "all"
                    ? true
                    : site.regionId === filters.regionId
                )
                .map((site) => ({
                  label: site.name,
                  value: site.id,
                })),
            ]}
            onValueChange={(value) =>
              onFiltersChange({ siteId: value as JobsListFilters["siteId"] })
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
              { label: "All regions", value: "region:all" },
              ...optionsState.regions.map((region) => ({
                label: `Region: ${region.name}`,
                value: `region:${region.id}`,
              })),
            ]}
            onValueChange={(value) => {
              const [kind, nextValue] = value.split(":");

              if (kind === "coordinator") {
                onFiltersChange({
                  coordinatorId: nextValue as JobsListFilters["coordinatorId"],
                });
                return;
              }

              if (kind === "region") {
                onFiltersChange({
                  regionId: nextValue as JobsListFilters["regionId"],
                  siteId:
                    nextValue === "all"
                      ? filters.siteId
                      : defaultJobsListFilters.siteId,
                });
              }
            }}
          />

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
  onOpenChange,
  onSavedViewSelect,
  open,
  savedViews,
}: {
  readonly activeSavedView: JobSavedView | undefined;
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
      id="jobs-saved-view"
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
      className="h-8 w-full shrink-0 bg-background xl:w-44"
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
  return (
    <Tabs
      className="w-fit"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === "list" || nextValue === "map") {
          onValueChange(nextValue);
        }
      }}
    >
      <TabsList
        aria-label="Jobs view"
        className="h-8 rounded-full border bg-background p-0.5"
      >
        <TabsTrigger className="h-7" value="list">
          <HugeiconsIcon
            icon={LeftToRightListBulletIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          List
        </TabsTrigger>
        <TabsTrigger className="h-7" value="map">
          <HugeiconsIcon
            icon={MapsSquare01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Map
        </TabsTrigger>
      </TabsList>
    </Tabs>
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
  jobs,
}: {
  readonly canCreateJobs: boolean;
  readonly jobs: readonly JobListItem[];
}) {
  const lookup = useAtomValue(jobsLookupAtom);

  if (jobs.length === 0) {
    return <JobsEmptyState canCreateJobs={canCreateJobs} />;
  }

  return (
    <section
      data-testid="jobs-queue-panel"
      className="overflow-hidden rounded-2xl border bg-background"
    >
      <div className="border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full bg-primary" />
          <span>Backlog</span>
          <span className="text-muted-foreground tabular-nums">
            {jobs.length}
          </span>
        </div>
      </div>

      <ul className="flex flex-col xl:hidden">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobIssueRow job={job} lookup={lookup} compact />
          </li>
        ))}
      </ul>

      <div className="hidden xl:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[48%]">Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <JobIssueTableRow key={job.id} job={job} lookup={lookup} />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function useJobsLookup() {
  return useAtomValue(jobsLookupAtom);
}

function JobIssueTableRow({
  job,
  lookup,
}: {
  readonly job: JobListItem;
  readonly lookup: JobsLookup;
}) {
  const site = job.siteId ? lookup.siteById.get(job.siteId) : undefined;
  const assignee = job.assigneeId
    ? lookup.memberById.get(job.assigneeId)
    : undefined;

  return (
    <TableRow className="group h-12 bg-transparent hover:bg-muted/30">
      <TableCell>
        <Link
          to="/jobs/$jobId"
          params={{ jobId: job.id }}
          className="flex min-w-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex size-5 items-center justify-center text-muted-foreground">
            <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
          </span>
          <span className="min-w-0 truncate font-medium">{job.title}</span>
          {site && hasSiteCoordinates(site) ? (
            <HugeiconsIcon
              icon={Location01Icon}
              strokeWidth={2}
              className="text-muted-foreground"
            />
          ) : null}
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={job.status} />
      </TableCell>
      <TableCell>
        <PriorityBadge priority={job.priority} />
      </TableCell>
      <TableCell className="max-w-48 truncate text-muted-foreground">
        {site?.name ?? "No site"}
      </TableCell>
      <TableCell className="max-w-40 truncate text-muted-foreground">
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
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{site?.name ?? "No site"}</span>
          <span>/</span>
          <span>{assignee?.name ?? "Unassigned"}</span>
          <span>/</span>
          <span>{formatRelativeDate(job.updatedAt)}</span>
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
}: {
  readonly canCreateJobs: boolean;
}) {
  return (
    <section data-testid="jobs-queue-panel">
      <Empty className="min-h-[420px] border-transparent bg-transparent p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No jobs here.</EmptyTitle>
          <EmptyDescription>
            Clear filters or add the next piece of work.
          </EmptyDescription>
        </EmptyHeader>
        {canCreateJobs ? (
          <EmptyContent>
            <NewJobLink />
          </EmptyContent>
        ) : null}
      </Empty>
    </section>
  );
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
  return (
    <Badge
      variant={status === "blocked" ? "outline" : "secondary"}
      className="rounded-full"
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PriorityBadge({ priority }: { readonly priority: JobPriority }) {
  return (
    <Badge
      variant={priority === "none" ? "outline" : "secondary"}
      className="rounded-full"
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
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

interface ActiveFilterBadge {
  readonly key: keyof JobsListFilters;
  readonly label: string;
}

function buildActiveFilterBadges(
  filters: JobsListFilters,
  lookup: {
    readonly memberById: ReadonlyMap<string, { readonly name: string }>;
    readonly regionById: ReadonlyMap<string, { readonly name: string }>;
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

  if (filters.regionId !== defaultJobsListFilters.regionId) {
    badges.push({
      key: "regionId",
      label: `Region: ${lookup.regionById.get(filters.regionId)?.name ?? "Unknown"}`,
    });
  }

  if (filters.siteId !== defaultJobsListFilters.siteId) {
    badges.push({
      key: "siteId",
      label: `Site: ${lookup.siteById.get(filters.siteId)?.name ?? "Unknown"}`,
    });
  }

  return badges;
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
