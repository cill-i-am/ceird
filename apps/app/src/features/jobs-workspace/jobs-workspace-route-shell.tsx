"use client";
import * as IdentityCore from "@ceird/identity-core";
import type { JobPriority, JobStatus } from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import {
  Alert01Icon,
  Briefcase01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  DatabaseSync01Icon,
  Message01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cause, Exit, Option } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
import { Textarea } from "#/components/ui/textarea";
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
const PRIORITY_OPTIONS = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const satisfies readonly JobPriority[];
const JOB_STATUS_COMMAND_OPTIONS = [
  "new",
  "triaged",
  "in_progress",
  "blocked",
  "completed",
  "canceled",
] as const satisfies readonly JobStatus[];
const COMMAND_STATUS_CLASSES = {
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  pending: "border-amber-400/50 bg-amber-50 text-amber-700",
  synced: "border-emerald-500/40 bg-emerald-50 text-emerald-700",
} as const;

type JobsWorkspaceCommandStatus = {
  readonly message: string;
  readonly status: "failed" | "pending" | "synced";
  readonly targetJobId?: string | undefined;
  readonly txid?: number | undefined;
} | null;
const PERF_HARNESS_SEARCH_PARAM = "jobs-workspace";

declare global {
  interface Window {
    __CEIRD_JOBS_WORKSPACE_PERF__?:
      | {
          readonly detail?: {
            readonly commentCount?: number | undefined;
            readonly graphCounts: ReturnType<
              typeof useJobsWorkspaceLiveDetail
            >["graphCounts"];
            readonly health: DataPlaneCollectionHealthSnapshot;
            readonly isReady: boolean;
            readonly selectedJobId?: string | undefined;
          };
          readonly list: {
            readonly graphCounts: ReturnType<
              typeof useJobsWorkspaceLiveList
            >["graphCounts"];
            readonly health: DataPlaneCollectionHealthSnapshot;
            readonly isReady: boolean;
            readonly rows: readonly {
              readonly id: string;
              readonly labelCount: number;
              readonly priority: string;
              readonly siteId?: string | undefined;
              readonly status: string;
              readonly title: string;
            }[];
          };
          readonly measuredAt: number;
        }
      | undefined;
  }
}

type CommentWriteStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly message: string }
  | {
      readonly kind: "synced";
      readonly message: string;
      readonly observation: string;
    }
  | {
      readonly error: string;
      readonly kind: "failed";
      readonly message: string;
    };
const IDLE_COMMENT_WRITE_STATUS = {
  kind: "idle",
} satisfies CommentWriteStatus;

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
  const createTitleRef = React.useRef<HTMLInputElement>(null);
  const rowActionRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const detailPanelRef = React.useRef<HTMLElement>(null);
  const detailCloseWasRequestedRef = React.useRef(false);
  const focusedDetailJobIdRef = React.useRef<string | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = React.useState(0);
  const [createTitle, setCreateTitle] = React.useState("");
  const [commandStatus, setCommandStatus] =
    React.useState<JobsWorkspaceCommandStatus>(null);
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
  const selectedRow = liveList.isReady
    ? liveList.rows[selectedRowIndex]
    : undefined;
  const commandPending = commandStatus?.status === "pending";

  React.useEffect(() => {
    if (!isPerfHarnessEnabled()) {
      return;
    }

    window.__CEIRD_JOBS_WORKSPACE_PERF__ = {
      ...(detailJobId === undefined
        ? {}
        : {
            detail: {
              commentCount: liveDetail.detail?.commentCount,
              graphCounts: liveDetail.graphCounts,
              health: liveDetail.health,
              isReady: liveDetail.isReady,
              selectedJobId: detailJobId,
            },
          }),
      list: {
        graphCounts: liveList.graphCounts,
        health: liveList.health,
        isReady: liveList.isReady,
        rows: liveList.rows.map((row) => ({
          id: row.job.id,
          labelCount: row.labels.length,
          priority: row.job.priority,
          siteId: row.job.siteId,
          status: row.job.status,
          title: row.job.title,
        })),
      },
      measuredAt: performance.now(),
    };
  }, [
    detailJobId,
    liveDetail.detail?.commentCount,
    liveDetail.graphCounts,
    liveDetail.health,
    liveDetail.isReady,
    liveList.graphCounts,
    liveList.health,
    liveList.isReady,
    liveList.rows,
  ]);

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
  useAppHotkey(
    "jobsWorkspaceCreate",
    () => {
      void handleCreateJob();
    },
    {
      conflictBehavior: "allow",
      enabled:
        hotkeysEnabled &&
        liveList.isReady &&
        !detailOpen &&
        !commandPending &&
        createTitle.trim().length > 0,
    }
  );

  async function runWorkspaceCommand<
    Output extends { readonly mutation: { readonly txid: number } },
  >(
    promise: Promise<Exit.Exit<Output, unknown>>,
    options: {
      readonly pending: string;
      readonly success: (output: Output) => string;
      readonly targetJobId?: string | undefined;
      readonly targetFromOutput?:
        | ((output: Output) => string | undefined)
        | undefined;
    }
  ): Promise<boolean> {
    setCommandStatus({
      message: options.pending,
      status: "pending",
      targetJobId: options.targetJobId,
    });

    const exit = await promise;

    if (Exit.isSuccess(exit)) {
      setCommandStatus({
        message: options.success(exit.value),
        status: "synced",
        targetJobId:
          options.targetFromOutput?.(exit.value) ?? options.targetJobId,
        txid: exit.value.mutation.txid,
      });
      return true;
    }

    setCommandStatus({
      message: formatCommandFailure(exit.cause),
      status: "failed",
      targetJobId: options.targetJobId,
    });
    return false;
  }

  async function handleCreateJob() {
    const title = createTitle.trim();

    if (detailOpen) {
      return;
    }

    if (title.length === 0 || !liveList.isReady || commandPending) {
      createTitleRef.current?.focus();
      return;
    }

    const synced = await runWorkspaceCommand(
      liveList.commands.createJob({ title }),
      {
        pending: "Creating job through the domain command.",
        success: (output) => `Created and synced ${output.job.title}.`,
        targetFromOutput: (output) => output.job.id,
      }
    );
    if (synced) {
      setCreateTitle("");
    }
  }

  async function handleStatusChange(nextStatus: JobStatus) {
    if (!selectedRow || commandPending) {
      return;
    }

    await runWorkspaceCommand(
      liveList.commands.transitionJob(selectedRow.job.id, {
        status: nextStatus,
      }),
      {
        pending: `Updating ${selectedRow.job.title} status.`,
        success: (output) =>
          `${output.job.title} synced as ${formatStatus(output.job.status)}.`,
        targetJobId: selectedRow.job.id,
      }
    );
  }

  async function handlePriorityChange(nextPriority: JobPriority) {
    if (!selectedRow || commandPending) {
      return;
    }

    await runWorkspaceCommand(
      liveList.commands.updateJob(selectedRow.job.id, {
        priority: nextPriority,
      }),
      {
        pending: `Updating ${selectedRow.job.title} priority.`,
        success: (output) =>
          `${output.job.title} priority synced as ${formatPriority(output.job.priority)}.`,
        targetJobId: selectedRow.job.id,
      }
    );
  }

  async function handleClearAssignee() {
    if (!selectedRow || commandPending) {
      return;
    }

    await runWorkspaceCommand(
      liveList.commands.updateJob(selectedRow.job.id, { assigneeId: null }),
      {
        pending: `Clearing ${selectedRow.job.title} assignment.`,
        success: (output) => `${output.job.title} assignment synced.`,
        targetJobId: selectedRow.job.id,
      }
    );
  }

  async function handleAssignLabel(selectedLabelId: string | undefined) {
    if (!selectedRow || commandPending || selectedLabelId === undefined) {
      return;
    }

    await runWorkspaceCommand(
      liveList.commands.assignJobLabel(selectedRow.job.id, {
        labelId: selectedLabelId as LabelIdType,
      }),
      {
        pending: `Assigning label to ${selectedRow.job.title}.`,
        success: (output) =>
          `${output.detail.job.title} label assignment synced.`,
        targetJobId: selectedRow.job.id,
      }
    );
  }

  async function handleRemoveLabel(removedLabelId: string) {
    if (!selectedRow || commandPending) {
      return;
    }

    await runWorkspaceCommand(
      liveList.commands.removeJobLabel(
        selectedRow.job.id,
        removedLabelId as LabelIdType
      ),
      {
        pending: `Removing label from ${selectedRow.job.title}.`,
        success: (output) => `${output.detail.job.title} label removal synced.`,
        targetJobId: selectedRow.job.id,
      }
    );
  }

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
            <Button
              disabled={!liveList.isReady}
              onClick={() => createTitleRef.current?.focus()}
              type="button"
            >
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
            onOpenDetail={(rowIndex) => {
              const row = liveList.rows[rowIndex];
              if (!row) {
                return;
              }

              setSelectedRowIndex(rowIndex);
              onDetailJobChange(row.job.id);
            }}
            commandStatus={commandStatus}
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
              hotkeysEnabled={hotkeysEnabled}
              onClose={closeDetail}
            />
          ) : (
            <HealthPanel
              allRowsCount={liveList.allRowsCount}
              availableLabels={liveList.availableLabels}
              commandPending={commandPending}
              commandStatus={commandStatus}
              createTitle={createTitle}
              createTitleRef={createTitleRef}
              health={liveList.health}
              onAssignLabel={(nextLabelId) =>
                void handleAssignLabel(nextLabelId)
              }
              onClearAssignee={() => void handleClearAssignee()}
              onCreateJob={() => void handleCreateJob()}
              onPriorityChange={(nextPriority) =>
                void handlePriorityChange(nextPriority)
              }
              onRemoveLabel={(nextLabelId) =>
                void handleRemoveLabel(nextLabelId)
              }
              onStatusChange={(nextStatus) =>
                void handleStatusChange(nextStatus)
              }
              onTitleChange={setCreateTitle}
              recentSearch={recentSearch}
              selectedRow={selectedRow}
              visibleRowsCount={liveList.rows.length}
            />
          )}
        </aside>
      </section>
    </main>
  );
}

function ListBody({
  commandStatus,
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
  readonly commandStatus: JobsWorkspaceCommandStatus;
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
                  {commandStatus?.targetJobId === row.job.id ? (
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-medium",
                        COMMAND_STATUS_CLASSES[commandStatus.status]
                      )}
                    >
                      {formatCommandStatusLabel(commandStatus.status)}
                    </span>
                  ) : null}
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
    readonly hotkeysEnabled: boolean;
    readonly onClose: () => void;
  }
>(function JobDetailPanel({ detailState, hotkeysEnabled, onClose }, ref) {
  const { detail } = detailState;
  const commentFormRef = React.useRef<HTMLFormElement>(null);
  const commentInputRef = React.useRef<HTMLTextAreaElement>(null);
  const mountedRef = React.useRef(true);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [commentWriteStatus, setCommentWriteStatus] =
    React.useState<CommentWriteStatus>(IDLE_COMMENT_WRITE_STATUS);
  const commentPending = commentWriteStatus.kind === "pending";

  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  React.useEffect(() => {
    setCommentDraft("");
    setCommentWriteStatus(IDLE_COMMENT_WRITE_STATUS);
  }, [detail?.job.id]);

  const cancelComment = React.useCallback(() => {
    if (commentPending) {
      return;
    }

    setCommentDraft("");
    setCommentWriteStatus(IDLE_COMMENT_WRITE_STATUS);
    commentInputRef.current?.focus();
  }, [commentPending]);
  const submitComment = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!detail) {
        return;
      }

      const bodyText = commentDraft.trim();
      if (bodyText.length === 0) {
        setCommentWriteStatus({
          error: "Comment text is required.",
          kind: "failed",
          message: "Comment failed",
        });
        return;
      }

      setCommentWriteStatus({
        kind: "pending",
        message: "Adding comment and waiting for realtime sync",
      });
      const exit = await detailState.addComment(detail.job.id, {
        body: bodyText,
      });

      if (!mountedRef.current) {
        return;
      }

      if (Exit.isSuccess(exit)) {
        setCommentDraft("");
        setCommentWriteStatus({
          kind: "synced",
          message: "Comment synced",
          observation: formatCommentObservation(exit.value.electricObservation),
        });
        commentInputRef.current?.focus();
        return;
      }

      setCommentWriteStatus({
        error: getCommentWriteErrorMessage(exit.cause),
        kind: "failed",
        message: "Comment failed",
      });
    },
    [commentDraft, detail, detailState]
  );

  useAppHotkey(
    "jobsWorkspaceComment",
    () => {
      commentInputRef.current?.focus();
    },
    {
      conflictBehavior: "allow",
      enabled: hotkeysEnabled && detail !== undefined,
    }
  );
  useAppHotkey(
    "jobsWorkspaceSubmitComment",
    () => {
      commentFormRef.current?.requestSubmit();
    },
    {
      enabled:
        hotkeysEnabled &&
        detail !== undefined &&
        commentDraft.trim().length > 0 &&
        !commentPending,
    }
  );
  useAppHotkey("jobsWorkspaceCloseDetail", onClose, {
    conflictBehavior: "allow",
    enabled:
      hotkeysEnabled && commentDraft.trim().length === 0 && !commentPending,
  });
  useAppHotkey(
    "jobsWorkspaceCancelComment",
    () => {
      cancelComment();
    },
    {
      conflictBehavior: "allow",
      enabled:
        hotkeysEnabled && commentDraft.trim().length > 0 && !commentPending,
    }
  );
  const body = renderJobDetailPanelBody({
    commentDraft,
    commentInputRef,
    commentPending,
    commentWriteStatus,
    detailState,
    formRef: commentFormRef,
    onCancelComment: cancelComment,
    onCommentDraftChange: setCommentDraft,
    onSubmitComment: (event) => void submitComment(event),
  });

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

function renderJobDetailPanelBody({
  commentDraft,
  commentInputRef,
  commentPending,
  commentWriteStatus,
  detailState,
  formRef,
  onCancelComment,
  onCommentDraftChange,
  onSubmitComment,
}: {
  readonly commentDraft: string;
  readonly commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly commentPending: boolean;
  readonly commentWriteStatus: CommentWriteStatus;
  readonly detailState: ReturnType<typeof useJobsWorkspaceLiveDetail>;
  readonly formRef: React.RefObject<HTMLFormElement | null>;
  readonly onCancelComment: () => void;
  readonly onCommentDraftChange: (draft: string) => void;
  readonly onSubmitComment: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
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
      <JobCommentsSection
        commentDraft={commentDraft}
        commentInputRef={commentInputRef}
        commentPending={commentPending}
        commentWriteStatus={commentWriteStatus}
        detail={detail}
        formRef={formRef}
        onCancelComment={onCancelComment}
        onCommentDraftChange={onCommentDraftChange}
        onSubmitComment={onSubmitComment}
      />
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

function JobCommentsSection({
  commentDraft,
  commentInputRef,
  commentPending,
  commentWriteStatus,
  detail,
  formRef,
  onCancelComment,
  onCommentDraftChange,
  onSubmitComment,
}: {
  readonly commentDraft: string;
  readonly commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly commentPending: boolean;
  readonly commentWriteStatus: CommentWriteStatus;
  readonly detail: ReadyJobDetail;
  readonly formRef: React.RefObject<HTMLFormElement | null>;
  readonly onCancelComment: () => void;
  readonly onCommentDraftChange: (draft: string) => void;
  readonly onSubmitComment: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section
      aria-label="Job comments"
      className="rounded-md border border-border/70 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-heading text-sm font-medium">
          <HugeiconsIcon aria-hidden icon={Message01Icon} strokeWidth={2} />
          Comments
        </h3>
        <Badge variant="outline">{detail.commentCount}</Badge>
      </div>
      <CommentWriteStatusAlert status={commentWriteStatus} />
      {detail.comments.length === 0 ? (
        <p className="mt-3 text-sm/6 text-muted-foreground">
          No comments are synced for this job yet.
        </p>
      ) : (
        <ul aria-label="Synced job comments" className="mt-3 grid gap-2">
          {detail.comments.map(({ actor, comment }) => (
            <li className="rounded-md bg-muted/50 p-3 text-sm" key={comment.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">
                  {actor ? formatProductActor(actor) : "Unknown actor"}
                </span>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={comment.createdAt}
                >
                  {formatShortDate(comment.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-sm/6 whitespace-pre-wrap">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form
        ref={formRef}
        aria-label={`Add comment to ${detail.job.title}`}
        className="mt-4 grid gap-2"
        onSubmit={onSubmitComment}
      >
        <label className="sr-only" htmlFor="jobs-workspace-comment">
          Comment
        </label>
        <Textarea
          ref={commentInputRef}
          autoComplete="off"
          id="jobs-workspace-comment"
          name="comment"
          onChange={(event) => onCommentDraftChange(event.currentTarget.value)}
          placeholder="Add a job update…"
          value={commentDraft}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={commentPending || commentDraft.trim().length === 0}
            type="submit"
          >
            <HugeiconsIcon
              aria-hidden
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
            />
            Submit
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.jobsWorkspaceSubmitComment.hotkey}
              label={HOTKEYS.jobsWorkspaceSubmitComment.label}
            />
          </Button>
          <Button
            disabled={commentPending || commentDraft.trim().length === 0}
            onClick={onCancelComment}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon aria-hidden icon={Cancel01Icon} strokeWidth={2} />
            Cancel
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.jobsWorkspaceCancelComment.hotkey}
              label={HOTKEYS.jobsWorkspaceCancelComment.label}
            />
          </Button>
        </div>
      </form>
    </section>
  );
}

function CommentWriteStatusAlert({
  status,
}: {
  readonly status: CommentWriteStatus;
}) {
  if (status.kind === "idle") {
    return null;
  }

  if (status.kind === "failed") {
    return (
      <Alert className="mt-3" liveRegion="polite" variant="destructive">
        <HugeiconsIcon aria-hidden icon={Alert01Icon} strokeWidth={2} />
        <AlertTitle>{status.message}</AlertTitle>
        <AlertDescription>{status.error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mt-3" liveRegion="polite">
      <HugeiconsIcon
        aria-hidden
        icon={
          status.kind === "pending" ? DatabaseSync01Icon : CheckmarkCircle02Icon
        }
        strokeWidth={2}
      />
      <AlertTitle>
        {status.kind === "pending" ? "Comment pending" : "Comment synced"}
      </AlertTitle>
      <AlertDescription>
        {status.message}
        {status.kind === "synced" ? ` (${status.observation})` : ""}
      </AlertDescription>
    </Alert>
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
  availableLabels,
  commandPending,
  commandStatus,
  createTitle,
  createTitleRef,
  health,
  onAssignLabel,
  onClearAssignee,
  onCreateJob,
  onPriorityChange,
  onRemoveLabel,
  onStatusChange,
  onTitleChange,
  recentSearch,
  selectedRow,
  visibleRowsCount,
}: {
  readonly allRowsCount: number;
  readonly availableLabels: ReturnType<
    typeof useJobsWorkspaceLiveList
  >["availableLabels"];
  readonly commandPending: boolean;
  readonly commandStatus: JobsWorkspaceCommandStatus;
  readonly createTitle: string;
  readonly createTitleRef: React.RefObject<HTMLInputElement | null>;
  readonly health: ReturnType<typeof useJobsWorkspaceLiveList>["health"];
  readonly onAssignLabel: (labelId: string | undefined) => void;
  readonly onClearAssignee: () => void;
  readonly onCreateJob: () => void;
  readonly onPriorityChange: (priority: JobPriority) => void;
  readonly onRemoveLabel: (labelId: string) => void;
  readonly onStatusChange: (status: JobStatus) => void;
  readonly onTitleChange: (title: string) => void;
  readonly recentSearch?: string | undefined;
  readonly selectedRow:
    | ReturnType<typeof useJobsWorkspaceLiveList>["rows"][number]
    | undefined;
  readonly visibleRowsCount: number;
}) {
  const degraded =
    health.status === "unavailable" || health.status === "disabled";
  const assignedLabelIds =
    selectedRow === undefined
      ? new Set<LabelIdType>()
      : new Set(selectedRow.labels.map((label) => label.id));
  const assignableLabels = availableLabels.filter(
    (label) => !assignedLabelIds.has(label.id)
  );

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
        <h2 className="font-heading text-sm font-medium">Domain commands</h2>
        <div className="mt-3 grid gap-2">
          <Input
            ref={createTitleRef}
            aria-label="New job title"
            autoComplete="off"
            disabled={commandPending}
            name="new-job-title"
            onChange={(event) => onTitleChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCreateJob();
              }
            }}
            placeholder="e.g. Inspect boiler…"
            value={createTitle}
          />
          <Button
            disabled={commandPending || createTitle.trim().length === 0}
            onClick={onCreateJob}
            size="sm"
            type="button"
          >
            Create job
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.jobsWorkspaceCreate.hotkey}
              label={HOTKEYS.jobsWorkspaceCreate.label}
            />
          </Button>
        </div>

        {selectedRow ? (
          <div className="mt-4 grid gap-3 border-t border-border/70 pt-3">
            <div>
              <p className="truncate text-sm font-medium">
                {selectedRow.job.title}
              </p>
              <p className="text-xs text-muted-foreground">Selected live row</p>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                aria-label="Update selected job status"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                disabled={commandPending}
                name="selected-job-status"
                onChange={(event) =>
                  onStatusChange(event.currentTarget.value as JobStatus)
                }
                value={selectedRow.job.status}
              >
                {JOB_STATUS_COMMAND_OPTIONS.map((nextStatus) => (
                  <option key={nextStatus} value={nextStatus}>
                    {formatStatus(nextStatus)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Priority</span>
              <select
                aria-label="Update selected job priority"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                disabled={commandPending}
                name="selected-job-priority"
                onChange={(event) =>
                  onPriorityChange(event.currentTarget.value as JobPriority)
                }
                value={selectedRow.job.priority}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {formatPriority(priority)}
                  </option>
                ))}
              </select>
            </label>
            {selectedRow.job.assigneeId ? (
              <Button
                disabled={commandPending}
                onClick={onClearAssignee}
                size="sm"
                type="button"
                variant="outline"
              >
                Clear assignee
              </Button>
            ) : null}
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Assign label</span>
              <select
                aria-label="Assign label to selected job"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                disabled={commandPending}
                name="selected-job-label"
                onChange={(event) => {
                  onAssignLabel(normalizeInput(event.currentTarget.value));
                  event.currentTarget.value = "";
                }}
                value=""
              >
                <option value="">Choose label</option>
                {assignableLabels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedRow.labels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedRow.labels.map((label) => (
                  <Button
                    disabled={commandPending}
                    key={label.id}
                    onClick={() => onRemoveLabel(label.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove {label.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {commandStatus ? (
          <output
            aria-live="polite"
            className={cn(
              "mt-3 rounded-md border px-3 py-2 text-sm/6",
              COMMAND_STATUS_CLASSES[commandStatus.status]
            )}
          >
            {commandStatus.message}
            {commandStatus.txid === undefined
              ? null
              : ` Txid ${commandStatus.txid}.`}
          </output>
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

function isPerfHarnessEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("perfHarness") ===
      PERF_HARNESS_SEARCH_PARAM
  );
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

function formatCommentObservation(observation: {
  readonly commentBody: "already-reflected" | "observed-change";
  readonly commentEdge: "already-reflected" | "observed-change";
}): string {
  const body = formatObservationKind(observation.commentBody);
  const edge = formatObservationKind(observation.commentEdge);

  return body === edge ? `${body} by Electric` : `body ${body}, edge ${edge}`;
}

function formatObservationKind(value: "already-reflected" | "observed-change") {
  return value === "already-reflected" ? "already reflected" : "observed";
}

function getCommentWriteErrorMessage(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);

  return error instanceof Error
    ? error.message
    : "The comment could not be confirmed by realtime sync.";
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

function formatCommandFailure(cause: Cause.Cause<unknown>): string {
  const failure = Cause.findErrorOption(cause);
  const error = Option.isSome(failure) ? failure.value : Cause.squash(cause);

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.length > 0
  ) {
    return error.message;
  }

  return "The job command failed before Electric confirmation completed.";
}

function formatCommandStatusLabel(
  status: Exclude<JobsWorkspaceCommandStatus, null>["status"]
): string {
  switch (status) {
    case "failed": {
      return "Failed";
    }
    case "pending": {
      return "Pending";
    }
    case "synced": {
      return "Synced";
    }
    default: {
      return "Pending";
    }
  }
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
