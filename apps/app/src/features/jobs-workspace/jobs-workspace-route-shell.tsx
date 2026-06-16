"use client";
import * as IdentityCore from "@ceird/identity-core";
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
import type { DataPlaneCollectionHealthSnapshot } from "#/data-plane/collection-health";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import { useJobsWorkspaceLiveDetail } from "./jobs-workspace-live-detail";
import { useJobsWorkspaceLiveList } from "./jobs-workspace-live-list";
import type {
  JobsWorkspaceSort,
  JobsWorkspaceStatus,
  JobsWorkspaceView,
} from "./jobs-workspace-search";

interface JobsWorkspaceRouteShellProps {
  readonly currentOrganizationRole?: IdentityCore.OrganizationRole;
  readonly detailJobId?: string | undefined;
  readonly hotkeysEnabled: boolean;
  readonly labelId?: string | undefined;
  readonly onDetailJobChange: (jobId: string | undefined) => void;
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

function clearedDetailJobId(): undefined {
  return undefined;
}

export function JobsWorkspaceRouteShell({
  currentOrganizationRole,
  ...props
}: JobsWorkspaceRouteShellProps) {
  const canPreviewWorkspace =
    currentOrganizationRole !== undefined &&
    IdentityCore.isInternalOrganizationRole(currentOrganizationRole);

  if (!canPreviewWorkspace) {
    return <JobsWorkspacePermissionState />;
  }

  return <JobsWorkspaceLiveRouteShell {...props} />;
}

function JobsWorkspaceLiveRouteShell({
  detailJobId,
  hotkeysEnabled,
  labelId,
  onDetailJobChange,
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
  const detailPanelRef = React.useRef<HTMLElement>(null);
  const detailCloseWasRequestedRef = React.useRef(false);
  const focusedDetailJobIdRef = React.useRef<string | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = React.useState(0);
  const liveList = useJobsWorkspaceLiveList({
    labelId,
    query,
    sort,
    status: status ?? "active",
  });
  const liveDetail = useJobsWorkspaceLiveDetail(detailJobId);
  const filtersActive =
    Boolean(query) ||
    Boolean(labelId) ||
    status !== undefined ||
    sort !== "updated-desc";
  const detailOpen = detailJobId !== undefined;

  React.useEffect(() => {
    setSelectedRowIndex((current) =>
      liveList.rows.length === 0
        ? 0
        : Math.min(current, liveList.rows.length - 1)
    );
  }, [liveList.rows.length]);

  React.useEffect(() => {
    if (detailJobId === undefined) {
      focusedDetailJobIdRef.current = null;
      if (detailCloseWasRequestedRef.current) {
        detailCloseWasRequestedRef.current = false;
        rowActionRefs.current[selectedRowIndex]?.focus();
      }
      return;
    }

    const detailIndex = liveList.rows.findIndex(
      (row) => row.job.id === detailJobId
    );
    if (detailIndex !== -1) {
      setSelectedRowIndex(detailIndex);
    }
    if (focusedDetailJobIdRef.current !== detailJobId) {
      focusedDetailJobIdRef.current = detailJobId;
      detailPanelRef.current?.focus();
    }
  }, [detailJobId, liveList.rows, selectedRowIndex]);

  const openSelectedDetail = React.useCallback(() => {
    const row = liveList.rows[selectedRowIndex];
    if (!row) {
      return;
    }

    onDetailJobChange(row.job.id);
  }, [liveList.rows, onDetailJobChange, selectedRowIndex]);

  const closeDetail = React.useCallback(() => {
    detailCloseWasRequestedRef.current = true;
    onDetailJobChange(clearedDetailJobId());
  }, [onDetailJobChange]);

  useAppHotkey(
    "jobsWorkspaceSearch",
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
  useAppHotkey("jobsWorkspaceOpenDetail", openSelectedDetail, {
    enabled: hotkeysEnabled && liveList.rows.length > 0,
  });
  useAppHotkey("jobsWorkspaceCloseDetail", closeDetail, {
    enabled: hotkeysEnabled && detailOpen,
  });
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
            onOpenDetail={(rowIndex) => {
              const row = liveList.rows[rowIndex];
              if (!row) {
                return;
              }

              setSelectedRowIndex(rowIndex);
              onDetailJobChange(row.job.id);
            }}
            rowActionRefs={rowActionRefs}
            rows={liveList.rows}
            selectedJobId={detailJobId}
            selectedRowIndex={selectedRowIndex}
            setSelectedRowIndex={setSelectedRowIndex}
          />
        </div>
        <aside className="flex min-w-0 flex-col gap-3 border-t border-border/60 pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
          {detailOpen ? (
            <JobDetailPanel
              ref={detailPanelRef}
              detailState={liveDetail}
              onClose={closeDetail}
            />
          ) : (
            <HealthPanel
              allRowsCount={liveList.allRowsCount}
              health={liveList.health}
              recentSearch={recentSearch}
              visibleRowsCount={liveList.rows.length}
            />
          )}
        </aside>
      </section>
    </main>
  );
}

function ListBody({
  isAvailable,
  isLoading,
  isReady,
  onOpenDetail,
  rowActionRefs,
  rows,
  selectedJobId,
  selectedRowIndex,
  setSelectedRowIndex,
}: {
  readonly isAvailable: boolean;
  readonly isLoading: boolean;
  readonly isReady: boolean;
  readonly onOpenDetail: (rowIndex: number) => void;
  readonly rowActionRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  readonly rows: ReturnType<typeof useJobsWorkspaceLiveList>["rows"];
  readonly selectedJobId?: string | undefined;
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
              selectedRowIndex === index || selectedJobId === row.job.id
                ? "bg-accent text-accent-foreground"
                : "focus-within:bg-muted/60 hover:bg-muted/50"
            )}
            key={row.job.id}
          >
            <button
              aria-pressed={selectedRowIndex === index}
              className="col-span-3 grid grid-cols-[minmax(13rem,1.3fr)_minmax(8rem,0.7fr)_minmax(7rem,0.6fr)] gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => {
                setSelectedRowIndex(index);
                onOpenDetail(index);
              }}
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
                aria-label={`Open detail for ${row.job.title}`}
                onClick={() => onOpenDetail(index)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Open
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const JobDetailPanel = React.forwardRef<
  HTMLElement,
  {
    readonly detailState: ReturnType<typeof useJobsWorkspaceLiveDetail>;
    readonly onClose: () => void;
  }
>(function JobDetailPanel({ detailState, onClose }, ref) {
  const { detail } = detailState;
  const body = renderJobDetailPanelBody(detailState);

  return (
    <section
      ref={ref}
      aria-label="Job detail"
      className="flex min-h-[32rem] min-w-0 flex-col gap-4 outline-none"
      tabIndex={-1}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Job detail
          </p>
          <h2 className="mt-1 truncate font-heading text-lg font-semibold">
            {detail?.job.title ?? "Loading job"}
          </h2>
        </div>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          Close
          <ShortcutHint
            decorative
            hotkey={HOTKEYS.jobsWorkspaceCloseDetail.hotkey}
            label={HOTKEYS.jobsWorkspaceCloseDetail.label}
          />
        </Button>
      </div>

      {body}
    </section>
  );
});

function renderJobDetailPanelBody(
  detailState: ReturnType<typeof useJobsWorkspaceLiveDetail>
) {
  const { detail, health } = detailState;

  if (!detailState.isCollectionGraphAvailable) {
    return <JobsWorkspaceDetailUnavailableState health={health} />;
  }

  if (detailState.isLoading && !detailState.isReady) {
    return (
      <div aria-label="Connecting job detail" className="grid gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton aria-hidden className="h-16 rounded-md" key={index} />
        ))}
      </div>
    );
  }

  if (detailState.isNotFound) {
    return (
      <Empty className="min-h-80 rounded-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon aria-hidden icon={Briefcase01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Job detail is not in the synced graph</EmptyTitle>
          <EmptyDescription>
            The selected job is not available in the Electric workspace.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <>
      <section
        aria-label="Job metadata"
        className="grid gap-3 rounded-md border border-border/70 p-4 text-sm"
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatStatus(detail.job.status)}</Badge>
          <Badge variant="outline">{formatPriority(detail.job.priority)}</Badge>
          {detail.labels.map((label) => (
            <Badge key={label.id} variant="secondary">
              {label.name}
            </Badge>
          ))}
        </div>
        <DetailField
          label="Assignee"
          value={formatAssignmentSummary(
            detail.job.assigneeId,
            detail.assignee
          )}
        />
        <DetailField
          label="Coordinator"
          value={formatAssignmentSummary(
            detail.job.coordinatorId,
            detail.coordinator
          )}
        />
        <DetailField label="Site" value={detail.site?.name ?? "Unassigned"} />
        <DetailField
          label="Location"
          value={detail.site?.displayLocation ?? "No site location"}
        />
        <DetailField
          label="Contact"
          value={detail.contact?.name ?? "No contact"}
        />
        <DetailField
          label="Created"
          value={formatLongDate(detail.job.createdAt)}
        />
        <DetailField
          label="Updated"
          value={formatLongDate(detail.job.updatedAt)}
        />
      </section>

      <JobVisitsSection detail={detail} />
      <JobActivitySection detail={detail} />
    </>
  );
}

type ReadyJobDetail = NonNullable<
  ReturnType<typeof useJobsWorkspaceLiveDetail>["detail"]
>;

function JobVisitsSection({ detail }: { readonly detail: ReadyJobDetail }) {
  return (
    <section
      aria-label="Job visits"
      className="rounded-md border border-border/70 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-medium">Visits</h3>
        <Badge variant="outline">{detail.visits.length}</Badge>
      </div>
      {detail.visits.length === 0 ? (
        <p className="mt-3 text-sm/6 text-muted-foreground">
          No visits are synced for this job.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 text-sm">
          {detail.visits.slice(0, 3).map((visit) => (
            <li key={visit.id} className="rounded-md bg-muted/50 p-3">
              <div className="font-medium">{visit.visitDate}</div>
              <div className="text-muted-foreground">
                {visit.durationMinutes} min · {visit.note}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JobActivitySection({ detail }: { readonly detail: ReadyJobDetail }) {
  return (
    <section
      aria-label="Job activity and comments"
      className="rounded-md border border-border/70 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-medium">
          Activity and comments
        </h3>
        <Badge variant="outline">{detail.commentCount} comments</Badge>
      </div>
      {detail.activity.length === 0 ? (
        <p className="mt-3 text-sm/6 text-muted-foreground">
          No synced activity is available for this job.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 text-sm">
          {detail.activity.slice(0, 4).map((item) => (
            <li key={item.activity.id} className="rounded-md bg-muted/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {formatActivityEvent(item.activity.eventType)}
                </span>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={item.activity.createdAt}
                >
                  {formatShortDate(item.activity.createdAt)}
                </time>
              </div>
              <div className="mt-1 text-muted-foreground">
                {formatActor(item.actor, item.activity.actorUserId)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DetailField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

function JobsWorkspaceDetailUnavailableState({
  health,
}: {
  readonly health: DataPlaneCollectionHealthSnapshot;
}) {
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
        <EmptyTitle>Realtime job detail is unavailable</EmptyTitle>
        <EmptyDescription>
          Detail sync status: {health.status}
          {health.lastError ? `, ${health.lastError.message}` : ""}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
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
          hotkey={HOTKEYS.jobsWorkspaceOpenDetail.hotkey}
          label=""
        />{" "}
        to open job detail.
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

function formatActivityEvent(eventType: string): string {
  return eventType.replaceAll("_", " ");
}

function formatAssignmentSummary(
  memberId: string | undefined,
  actor: IdentityCore.ProductActor | undefined
): string {
  if (memberId === undefined) {
    return "Unassigned";
  }

  return actor === undefined
    ? "Member summary unavailable"
    : formatProductActor(actor);
}

function formatActor(
  actor: IdentityCore.ProductActor | undefined,
  actorUserId: string | undefined
): string {
  if (actor) {
    return formatProductActor(actor);
  }

  return actorUserId === undefined
    ? "System activity"
    : "Actor summary unavailable";
}

function formatProductActor(actor: IdentityCore.ProductActor): string {
  return actor.displayDetail
    ? `${actor.displayName} · ${actor.displayDetail}`
    : actor.displayName;
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
