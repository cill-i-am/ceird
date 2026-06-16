"use client";
import { isInternalOrganizationRole } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import {
  Alert01Icon,
  Briefcase01Icon,
  DatabaseSync01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import { useJobsWorkspaceLiveList } from "./jobs-workspace-live-list";
import type {
  JobsWorkspaceSort,
  JobsWorkspaceStatus,
  JobsWorkspaceView,
} from "./jobs-workspace-search";

interface JobsWorkspaceRouteShellProps {
  readonly currentOrganizationRole?: OrganizationRole;
  readonly hotkeysEnabled: boolean;
  readonly labelId?: string | undefined;
  readonly onLabelChange: (labelId: string | undefined) => void;
  readonly onQueryChange: (query: string | undefined) => void;
  readonly onRecentSearchCommit: (query: string | undefined) => void;
  readonly onSortChange: (sort: JobsWorkspaceSort | undefined) => void;
  readonly onStatusChange: (status: JobsWorkspaceStatus | undefined) => void;
  readonly onViewChange: (view: JobsWorkspaceView) => void;
  readonly query?: string | undefined;
  readonly recentSearch?: string | undefined;
  readonly sort: JobsWorkspaceSort;
  readonly status?: JobsWorkspaceStatus;
  readonly view: JobsWorkspaceView;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Blocked", value: "blocked" },
  { label: "Completed", value: "completed" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: JobsWorkspaceStatus;
}[];
const SORT_OPTIONS = [
  { label: "Recently updated", value: "updated-desc" },
  { label: "Oldest updated", value: "updated-asc" },
  { label: "Priority", value: "priority" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: JobsWorkspaceSort;
}[];

function clearedSearchParam(): undefined {
  return undefined;
}

export function JobsWorkspaceRouteShell({
  currentOrganizationRole,
  ...props
}: JobsWorkspaceRouteShellProps) {
  const canPreviewWorkspace =
    currentOrganizationRole !== undefined &&
    isInternalOrganizationRole(currentOrganizationRole);

  if (!canPreviewWorkspace) {
    return <JobsWorkspacePermissionState />;
  }

  return <JobsWorkspaceLiveRouteShell {...props} />;
}

function JobsWorkspaceLiveRouteShell({
  hotkeysEnabled,
  labelId,
  onLabelChange,
  onQueryChange,
  onRecentSearchCommit,
  onSortChange,
  onStatusChange,
  onViewChange,
  query,
  recentSearch,
  sort,
  status,
  view,
}: Omit<JobsWorkspaceRouteShellProps, "currentOrganizationRole">) {
  const searchRef = React.useRef<HTMLInputElement>(null);
  const rowActionRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = React.useState(0);
  const liveList = useJobsWorkspaceLiveList({
    labelId,
    query,
    sort,
    status: status ?? "active",
  });
  const filtersActive =
    Boolean(query) ||
    Boolean(labelId) ||
    status !== undefined ||
    sort !== "updated-desc";

  React.useEffect(() => {
    setSelectedRowIndex((current) =>
      liveList.rows.length === 0
        ? 0
        : Math.min(current, liveList.rows.length - 1)
    );
  }, [liveList.rows.length]);

  useAppHotkey(
    "jobsWorkspaceSearch",
    () => {
      searchRef.current?.focus();
    },
    { enabled: hotkeysEnabled }
  );
  useAppHotkey(
    "jobsWorkspaceCreate",
    () => {
      searchRef.current?.focus();
    },
    { enabled: hotkeysEnabled }
  );
  useAppHotkey(
    "jobsWorkspaceNextRow",
    () => {
      setSelectedRowIndex((current) =>
        Math.min(current + 1, Math.max(liveList.rows.length - 1, 0))
      );
    },
    {
      enabled: hotkeysEnabled && liveList.rows.length > 0,
    }
  );
  useAppHotkey(
    "jobsWorkspacePreviousRow",
    () => {
      setSelectedRowIndex((current) => Math.max(current - 1, 0));
    },
    {
      enabled: hotkeysEnabled && liveList.rows.length > 0,
    }
  );
  useAppHotkey(
    "jobsWorkspaceRowActions",
    () => {
      rowActionRefs.current[selectedRowIndex]?.focus();
    },
    {
      enabled: hotkeysEnabled && liveList.rows.length > 0,
    }
  );
  useAppHotkey("jobsWorkspaceCycleSort", () => onSortChange(nextSort(sort)), {
    enabled: hotkeysEnabled,
  });
  useAppHotkey(
    "jobsWorkspaceClearFilters",
    () => {
      onLabelChange(clearedSearchParam());
      onQueryChange(clearedSearchParam());
      onSortChange(clearedSearchParam());
      onStatusChange(clearedSearchParam());
    },
    { enabled: hotkeysEnabled && filtersActive }
  );
  useAppHotkeySequence("jobsWorkspaceListView", () => onViewChange("list"), {
    enabled: hotkeysEnabled,
  });
  useAppHotkeySequence("jobsWorkspaceBoardView", () => onViewChange("board"), {
    enabled: hotkeysEnabled,
  });

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
      <AppPageHeader
        eyebrow="Preview route"
        leading={<HugeiconsIcon icon={DatabaseSync01Icon} strokeWidth={2} />}
        title="Jobs Workspace"
        description="Electric-backed live jobs list for the replacement workspace. The current Jobs route remains the production route until realtime evidence passes."
        actions={
          <>
            <Badge variant="outline">Not the active Jobs route</Badge>
            <Button disabled type="button">
              <HugeiconsIcon
                aria-hidden
                icon={Briefcase01Icon}
                strokeWidth={2}
              />
              New job
              <ShortcutHint
                decorative
                hotkey={HOTKEYS.jobsWorkspaceCreate.hotkey}
                label={HOTKEYS.jobsWorkspaceCreate.label}
              />
            </Button>
          </>
        }
      />

      <section
        aria-label="Jobs workspace controls"
        className="flex flex-col gap-3 border-b border-border/60 pb-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label
            className="relative flex min-w-0 flex-1 items-center"
            htmlFor="jobs-workspace-search"
          >
            <HugeiconsIcon
              aria-hidden
              className="absolute left-3 size-4 text-muted-foreground"
              icon={Search01Icon}
              strokeWidth={2}
            />
            <Input
              ref={searchRef}
              aria-label="Search live jobs"
              autoComplete="off"
              className="pl-9"
              id="jobs-workspace-search"
              name="jobs-workspace-search"
              onBlur={(event) =>
                onRecentSearchCommit(normalizeInput(event.currentTarget.value))
              }
              onChange={(event) =>
                onQueryChange(normalizeInput(event.currentTarget.value))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onRecentSearchCommit(
                    normalizeInput(event.currentTarget.value)
                  );
                }
              }}
              placeholder="Search title, labels, site, contact…"
              type="search"
              value={query ?? ""}
            />
            <ShortcutHint
              decorative
              className="absolute right-3"
              hotkey={HOTKEYS.jobsWorkspaceSearch.hotkey}
              label={HOTKEYS.jobsWorkspaceSearch.label}
            />
          </label>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ViewButton
              active={view === "list"}
              onClick={() => onViewChange("list")}
              shortcut={HOTKEYS.jobsWorkspaceListView.hotkey}
            >
              List
            </ViewButton>
            <ViewButton
              active={view === "board"}
              onClick={() => onViewChange("board")}
              shortcut={HOTKEYS.jobsWorkspaceBoardView.hotkey}
            >
              Board
            </ViewButton>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ul className="flex flex-wrap gap-2" aria-label="Status filters">
            <li>
              <StatusButton
                active={status === undefined}
                onClick={() => onStatusChange(clearedSearchParam())}
              >
                Default
              </StatusButton>
            </li>
            <li>
              <StatusButton
                active={status === "all"}
                onClick={() => onStatusChange("all")}
              >
                All
              </StatusButton>
            </li>
            {STATUS_OPTIONS.map((option) => (
              <li key={option.value}>
                <StatusButton
                  active={status === option.value}
                  onClick={() => onStatusChange(option.value)}
                >
                  {option.label}
                </StatusButton>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by label"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) =>
                onLabelChange(normalizeInput(event.currentTarget.value))
              }
              value={labelId ?? ""}
            >
              <option value="">All labels</option>
              {liveList.availableLabels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort jobs"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) =>
                onSortChange(event.currentTarget.value as JobsWorkspaceSort)
              }
              value={sort}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              disabled={!filtersActive}
              onClick={() => {
                onLabelChange(clearedSearchParam());
                onQueryChange(clearedSearchParam());
                onSortChange(clearedSearchParam());
                onStatusChange(clearedSearchParam());
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
              <ShortcutHint
                decorative
                hotkey={HOTKEYS.jobsWorkspaceClearFilters.hotkey}
                label={HOTKEYS.jobsWorkspaceClearFilters.label}
              />
            </Button>
          </div>
        </div>
      </section>

      <section
        aria-label="Jobs workspace live list"
        className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-h-[28rem] min-w-0 flex-col gap-3">
          <ListBody
            isAvailable={liveList.isCollectionGraphAvailable}
            isLoading={liveList.isLoading}
            isReady={liveList.isReady}
            rowActionRefs={rowActionRefs}
            rows={liveList.rows}
            selectedRowIndex={selectedRowIndex}
            setSelectedRowIndex={setSelectedRowIndex}
          />
        </div>
        <aside className="flex min-w-0 flex-col gap-3 border-t border-border/60 pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
          <HealthPanel
            allRowsCount={liveList.allRowsCount}
            health={liveList.health}
            recentSearch={recentSearch}
            visibleRowsCount={liveList.rows.length}
          />
        </aside>
      </section>
    </main>
  );
}

function ListBody({
  isAvailable,
  isLoading,
  isReady,
  rowActionRefs,
  rows,
  selectedRowIndex,
  setSelectedRowIndex,
}: {
  readonly isAvailable: boolean;
  readonly isLoading: boolean;
  readonly isReady: boolean;
  readonly rowActionRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  readonly rows: ReturnType<typeof useJobsWorkspaceLiveList>["rows"];
  readonly selectedRowIndex: number;
  readonly setSelectedRowIndex: (index: number) => void;
}) {
  if (!isAvailable) {
    return <JobsWorkspaceUnavailableState />;
  }

  if (isLoading && !isReady) {
    return (
      <div className="grid gap-2" aria-label="Connecting live jobs">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton aria-hidden className="h-20 rounded-md" key={index} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <JobsWorkspaceEmptyState />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <div className="grid grid-cols-[minmax(13rem,1.3fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_8rem] gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground uppercase">
        <span>Job</span>
        <span>Site</span>
        <span>Labels</span>
        <span>Updated</span>
      </div>
      <ul aria-label="Live jobs" className="divide-y divide-border/70">
        {rows.map((row, index) => (
          <li
            className={cn(
              "grid grid-cols-[minmax(13rem,1.3fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)_8rem] gap-3 px-4 py-3 text-sm transition-colors",
              selectedRowIndex === index
                ? "bg-accent text-accent-foreground"
                : "focus-within:bg-muted/60 hover:bg-muted/50"
            )}
            key={row.job.id}
          >
            <button
              aria-pressed={selectedRowIndex === index}
              className="col-span-3 grid grid-cols-[minmax(13rem,1.3fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)] gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => setSelectedRowIndex(index)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {row.job.title}
                </span>
                <span className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {formatStatus(row.job.status)}
                  </Badge>
                  <Badge variant="outline">
                    {formatPriority(row.job.priority)}
                  </Badge>
                  {row.contact ? <span>{row.contact.name}</span> : null}
                </span>
              </span>
              <span className="min-w-0 truncate text-muted-foreground">
                {row.site?.name ?? "Unassigned"}
              </span>
              <span className="min-w-0">
                {row.labels.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {row.labels.slice(0, 2).map((label) => (
                      <Badge key={label.id} variant="secondary">
                        {label.name}
                      </Badge>
                    ))}
                    {row.labels.length > 2 ? (
                      <Badge variant="outline">+{row.labels.length - 2}</Badge>
                    ) : null}
                  </span>
                )}
              </span>
            </button>
            <span className="flex items-center justify-between gap-2 text-muted-foreground">
              <time dateTime={row.job.updatedAt}>
                {formatShortDate(row.job.updatedAt)}
              </time>
              <Button
                ref={(node) => {
                  rowActionRefs.current[index] = node;
                }}
                aria-label={`Open actions for ${row.job.title}`}
                aria-disabled="true"
                onClick={(event) => {
                  event.preventDefault();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Actions
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HealthPanel({
  allRowsCount,
  health,
  recentSearch,
  visibleRowsCount,
}: {
  readonly allRowsCount: number;
  readonly health: ReturnType<typeof useJobsWorkspaceLiveList>["health"];
  readonly recentSearch?: string | undefined;
  readonly visibleRowsCount: number;
}) {
  const degraded =
    health.status === "unavailable" || health.status === "disabled";

  return (
    <>
      <div className="rounded-md border border-border/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-sm font-medium">
            Collection health
          </h2>
          <Badge variant={degraded ? "destructive" : "outline"}>
            {health.status}
          </Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Visible rows</dt>
            <dd>{visibleRowsCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Synced jobs</dt>
            <dd>{allRowsCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Shape</dt>
            <dd>{health.subscriptionName ?? "jobs"}</dd>
          </div>
        </dl>
        {health.lastError ? (
          <p className="mt-3 text-sm/6 text-destructive">
            {health.lastError.message}
          </p>
        ) : null}
      </div>
      <div className="rounded-md border border-border/70 p-4">
        <h2 className="font-heading text-sm font-medium">Saved-view hooks</h2>
        <p className="mt-2 text-sm/6 text-muted-foreground">
          Recent search: {recentSearch ?? "None"}
        </p>
      </div>
      <div className="rounded-md border border-dashed border-border p-4 text-sm/6 text-muted-foreground">
        Use{" "}
        <ShortcutHint hotkey={HOTKEYS.jobsWorkspaceNextRow.hotkey} label="" />{" "}
        and{" "}
        <ShortcutHint
          hotkey={HOTKEYS.jobsWorkspacePreviousRow.hotkey}
          label=""
        />{" "}
        to move through rows, then{" "}
        <ShortcutHint
          hotkey={HOTKEYS.jobsWorkspaceRowActions.hotkey}
          label=""
        />{" "}
        to focus row actions.
      </div>
    </>
  );
}

function JobsWorkspacePermissionState() {
  return (
    <main className="flex min-h-full min-w-0 flex-1 p-4 md:p-6">
      <Empty className="min-h-[32rem] rounded-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon aria-hidden icon={Alert01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Jobs workspace preview is internal only</EmptyTitle>
          <EmptyDescription>
            External collaborator access remains on the current Jobs route until
            collaborator-safe realtime shapes are designed and approved.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}

function JobsWorkspaceUnavailableState() {
  return (
    <Empty className="min-h-80 rounded-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon
            aria-hidden
            icon={DatabaseSync01Icon}
            strokeWidth={2}
          />
        </EmptyMedia>
        <EmptyTitle>Realtime jobs are unavailable</EmptyTitle>
        <EmptyDescription>
          Electric sync is disabled or unavailable for this workspace. This
          preview does not fall back to the old Jobs route data path.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function JobsWorkspaceEmptyState() {
  return (
    <Empty className="min-h-80 rounded-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon aria-hidden icon={Briefcase01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>No jobs match this live view</EmptyTitle>
        <EmptyDescription>
          The Electric-backed workspace is connected, but there are no visible
          rows for the current search and filters.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ViewButton({
  active,
  children,
  onClick,
  shortcut,
}: {
  readonly active: boolean;
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly shortcut: string;
}) {
  return (
    <Button
      aria-pressed={active}
      onClick={onClick}
      type="button"
      variant={active ? "secondary" : "outline"}
    >
      {children}
      <ShortcutHint decorative hotkey={shortcut} label={`${children} view`} />
    </Button>
  );
}

function StatusButton({
  active,
  children,
  onClick,
}: {
  readonly active: boolean;
  readonly children: React.ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className="rounded-md"
      onClick={onClick}
      size="sm"
      type="button"
      variant={active ? "secondary" : "ghost"}
    >
      {children}
    </Button>
  );
}

function normalizeInput(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

function nextSort(sort: JobsWorkspaceSort): JobsWorkspaceSort {
  if (sort === "updated-desc") {
    return "updated-asc";
  }

  if (sort === "updated-asc") {
    return "priority";
  }

  return "updated-desc";
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatPriority(priority: string): string {
  return priority === "none" ? "No priority" : priority;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
