"use client";
import type { JobListItem } from "@ceird/jobs-core";
import {
  Add01Icon,
  Briefcase01Icon,
  Cancel01Icon,
  FilterHorizontalIcon,
  LeftToRightListBulletIcon,
  MapsSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { useIsMobile } from "#/hooks/use-mobile";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";

import {
  buildJobStatusCounts,
  JobsListView,
  NewJobLink,
} from "./jobs-list-directory";
import {
  ActiveFilterBar,
  buildActiveFilterBadges,
  JobsCommandToolbar,
  JobStatusRail,
  SavedViewsControl,
  ViewModeSwitch,
} from "./jobs-list-filters";
import type { JobsViewMode } from "./jobs-list-filters";
import {
  buildJobSavedViews,
  findMatchingJobSavedView,
} from "./jobs-saved-views";
import type { JobSavedView } from "./jobs-saved-views";
import {
  defaultJobsListFilters,
  filterVisibleJobs,
  useJobsListState,
  useJobsLookup,
  useJobsNotice,
  useJobsOptions,
  useRefreshJobsListMutation,
} from "./jobs-state";
import type { JobsListFilters } from "./jobs-state";
import { canUseInternalJobOptions, hasJobsElevatedAccess } from "./jobs-viewer";
import type { JobsViewer } from "./jobs-viewer";

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
