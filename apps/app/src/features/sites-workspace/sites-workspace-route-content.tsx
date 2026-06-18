"use client";
import { isInternalOrganizationRole } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { SiteOption } from "@ceird/sites-core";
import {
  Add01Icon,
  Alert02Icon,
  Briefcase01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Database01Icon,
  FilterHorizontalIcon,
  LeftToRightListBulletIcon,
  Location01Icon,
  MapsSquare01Icon,
  Message01Icon,
  PencilEdit02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cause, Exit } from "effect";
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
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import {
  commitRecentSearch,
  getRecentSearchesForSurface,
  getSelectedEntityForSurface,
  getWorkspacePreferencesForSurface,
  saveSelectedEntity,
  saveWorkspacePreferences,
  useLocalConvenienceRecords,
} from "#/data-plane/local-convenience-collections";
import { useDataPlaneSession } from "#/data-plane/session";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import {
  createSitesWorkspaceCommandRunner,
  deriveSitesWorkspaceVisibleRows,
  getOrCreateSitesWorkspaceReadModelCollectionState,
} from "./sites-workspace-data-plane";
import type {
  SiteActiveJobSummaryElectricRow,
  SiteCommentBodyRow,
  SiteCommentEdgeRow,
  SitesWorkspaceCommentCommandResult,
  SitesWorkspaceDetailCommentItem,
  SiteLabelAssignmentElectricRow,
  SitesWorkspaceProductActorRow,
  SitesWorkspaceCommandCollections,
  SitesWorkspaceCommandResult,
  SitesWorkspaceVisibleRow,
} from "./sites-workspace-data-plane";
import type {
  SitesWorkspaceFilter,
  SitesWorkspaceSearch,
  SitesWorkspaceShellState,
  SitesWorkspaceSort,
} from "./sites-workspace-search";

type SyncPresentationStatus = "connecting" | "ready" | "stale" | "unavailable";
type WorkspaceWriteStatus =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pending";
      readonly message: string;
      readonly siteId?: string | undefined;
    }
  | {
      readonly kind: "synced";
      readonly message: string;
      readonly observation: SitesWorkspaceCommandResult["electricObservation"];
      readonly serverTxid: number;
      readonly siteId?: string | undefined;
    }
  | {
      readonly error: string;
      readonly kind: "failed";
      readonly message: string;
      readonly siteId?: string | undefined;
    };
type CommentWriteStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly message: string }
  | {
      readonly kind: "synced";
      readonly message: string;
      readonly observation: SitesWorkspaceCommentCommandResult["electricObservation"];
    }
  | {
      readonly error: string;
      readonly kind: "failed";
      readonly message: string;
    };
type CommentWriteStatusBySiteId = Readonly<Record<string, CommentWriteStatus>>;

const IDLE_WRITE_STATUS = { kind: "idle" } satisfies WorkspaceWriteStatus;
const IDLE_COMMENT_WRITE_STATUS = {
  kind: "idle",
} satisfies CommentWriteStatus;
const EMPTY_COMMAND_ACTIONS: readonly CommandAction[] = [];
const EMPTY_COLLECTION_ITEMS: readonly never[] = [];

const FILTER_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Active jobs", value: "with-active-jobs" },
  { label: "Needs location", value: "needs-location" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: SitesWorkspaceFilter;
}[];

const SORT_OPTIONS = [
  { label: "Name", value: "name" },
  { label: "Active jobs", value: "active-jobs" },
  { label: "Recently updated", value: "updated" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: SitesWorkspaceSort;
}[];

export function SitesWorkspaceRouteContent({
  currentOrganizationRole,
  shellState: _shellState,
  workspaceSearch,
  onWorkspaceSearchChange,
}: {
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onWorkspaceSearchChange: (
    search: Partial<Omit<SitesWorkspaceSearch, "shell">>
  ) => void;
  readonly shellState: SitesWorkspaceShellState;
  readonly workspaceSearch: SitesWorkspaceSearch;
}) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const canUseWorkspace =
    currentOrganizationRole !== undefined &&
    isInternalOrganizationRole(currentOrganizationRole);

  const focusSearch = React.useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  useAppHotkey("sitesWorkspaceSearch", focusSearch, {
    enabled: canUseWorkspace,
  });

  const commandActions = React.useMemo<readonly CommandAction[]>(
    () =>
      canUseWorkspace
        ? [
            {
              group: "Current page",
              icon: Search01Icon,
              id: "sites-workspace-focus-search",
              priority: 80,
              run: focusSearch,
              scope: "route",
              shortcut: HOTKEYS.sitesWorkspaceSearch,
              title: "Focus workspace search",
            },
          ]
        : EMPTY_COMMAND_ACTIONS,
    [canUseWorkspace, focusSearch]
  );

  useRegisterCommandActions(commandActions);

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
      <AppPageHeader
        leading={
          <HugeiconsIcon aria-hidden icon={Location01Icon} strokeWidth={2} />
        }
        eyebrow="Live workspace"
        title="Sites"
        description="Live site directory, labels, related jobs, comments, and active-job summaries from the Electric-backed Sites collection graph."
      />

      {canUseWorkspace ? (
        <SitesWorkspaceShell
          searchInputRef={searchInputRef}
          workspaceSearch={workspaceSearch}
          onWorkspaceSearchChange={onWorkspaceSearchChange}
        />
      ) : (
        <NoWorkspaceAccess />
      )}
    </main>
  );
}

function SitesWorkspaceShell({
  onWorkspaceSearchChange,
  searchInputRef,
  workspaceSearch,
}: {
  readonly onWorkspaceSearchChange: (
    search: Partial<Omit<SitesWorkspaceSearch, "shell">>
  ) => void;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly workspaceSearch: SitesWorkspaceSearch;
}) {
  const session = useDataPlaneSession();
  const mountedRef = React.useRef(true);
  const readModel = useSitesWorkspaceReadModel();
  const createFormRef = React.useRef<HTMLFormElement>(null);
  const editFormRef = React.useRef<HTMLFormElement>(null);
  const commentFormRef = React.useRef<HTMLFormElement>(null);
  const commentInputRef = React.useRef<HTMLTextAreaElement>(null);
  const selectedSiteIdRef = React.useRef<string | null>(null);
  const localState = useSitesWorkspaceLocalConvenienceState({
    onWorkspaceSearchChange,
    workspaceSearch,
  });
  const {
    filter,
    query,
    recentSearches,
    selectedSiteId,
    setSelectedSiteId,
    sort,
  } = localState;
  const [createOpen, setCreateOpen] = React.useState(false);
  const [commentDraft, setCommentDraft] = React.useState("");
  const [commentWriteStatusBySiteId, setCommentWriteStatusBySiteId] =
    React.useState<CommentWriteStatusBySiteId>({});
  const [editingSiteId, setEditingSiteId] = React.useState<string>();
  const [writeStatus, setWriteStatus] =
    React.useState<WorkspaceWriteStatus>(IDLE_WRITE_STATUS);
  const status = resolveWorkspaceStatus(readModel.health);
  const commandRunner = React.useMemo(
    () =>
      createSitesWorkspaceCommandRunner({
        collections: readModel.collections,
        journal: session.mutationJournal,
      }),
    [readModel.collections, session.mutationJournal]
  );
  const canDeriveCompleteRows = status === "ready";
  const visibleRows = React.useMemo(() => {
    if (!canDeriveCompleteRows) {
      return [];
    }

    return deriveSitesWorkspaceVisibleRows({
      activeJobSummaries: readModel.activeJobSummaries,
      actors: readModel.actors,
      commentBodies: readModel.commentBodies,
      filter,
      labels: readModel.labels,
      query,
      relatedJobs: readModel.relatedJobs,
      siteCommentEdges: readModel.siteCommentEdges,
      siteLabelAssignments: readModel.siteLabelAssignments,
      sites: readModel.sites,
      sort,
    });
  }, [
    canDeriveCompleteRows,
    filter,
    query,
    readModel.activeJobSummaries,
    readModel.actors,
    readModel.commentBodies,
    readModel.labels,
    readModel.relatedJobs,
    readModel.siteCommentEdges,
    readModel.siteLabelAssignments,
    readModel.sites,
    sort,
  ]);
  const selectedRow = React.useMemo(
    () => visibleRows.find((row) => row.site.id === selectedSiteId),
    [selectedSiteId, visibleRows]
  );
  const selectedCommentWriteStatus =
    selectedRow === undefined
      ? IDLE_COMMENT_WRITE_STATUS
      : (commentWriteStatusBySiteId[selectedRow.site.id] ??
        IDLE_COMMENT_WRITE_STATUS);
  const formOpen = createOpen || editingSiteId !== undefined;
  const writePending = writeStatus.kind === "pending";
  const commentPending = selectedCommentWriteStatus.kind === "pending";
  const formActionsEnabled = formOpen && !writePending;
  const commentShortcutsEnabled = areSiteCommentShortcutsEnabled({
    formOpen,
    selectedRow,
    status,
  });

  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  React.useEffect(() => {
    setCommentDraft("");
  }, [selectedRow?.site.id]);
  React.useEffect(() => {
    selectedSiteIdRef.current = selectedRow?.site.id ?? null;
  }, [selectedRow?.site.id]);

  const setCommentWriteStatusForSite = React.useCallback(
    (siteId: string, nextStatus: CommentWriteStatus) => {
      setCommentWriteStatusBySiteId((statuses) => ({
        ...statuses,
        [siteId]: nextStatus,
      }));
    },
    []
  );

  const beginCreate = React.useCallback(() => {
    if (writePending) {
      return;
    }

    setCreateOpen(true);
    setEditingSiteId(undefined);
    setWriteStatus(IDLE_WRITE_STATUS);
  }, [writePending]);
  const cancelForm = React.useCallback(() => {
    if (writePending) {
      return;
    }

    setCreateOpen(false);
    setEditingSiteId(undefined);
  }, [writePending]);
  const requestActiveFormSubmit = React.useCallback(() => {
    if (writePending) {
      return;
    }

    if (createOpen) {
      createFormRef.current?.requestSubmit();
      return;
    }

    editFormRef.current?.requestSubmit();
  }, [createOpen, writePending]);
  const cancelComment = React.useCallback(() => {
    if (commentPending) {
      return;
    }

    if (selectedRow) {
      setCommentWriteStatusForSite(
        selectedRow.site.id,
        IDLE_COMMENT_WRITE_STATUS
      );
    }
    setCommentDraft("");
    commentInputRef.current?.focus();
  }, [commentPending, selectedRow, setCommentWriteStatusForSite]);

  React.useEffect(() => {
    if (visibleRows.length === 0) {
      return;
    }

    if (!selectedRow) {
      setSelectedSiteId(visibleRows[0]?.site.id);
    }
  }, [selectedRow, setSelectedSiteId, visibleRows]);

  const selectOffset = React.useCallback(
    (offset: number) => {
      if (visibleRows.length === 0) {
        return;
      }

      const currentIndex = Math.max(
        0,
        visibleRows.findIndex((row) => row.site.id === selectedSiteId)
      );
      const nextIndex = Math.min(
        visibleRows.length - 1,
        Math.max(0, currentIndex + offset)
      );
      setSelectedSiteId(visibleRows[nextIndex]?.site.id);
    },
    [selectedSiteId, setSelectedSiteId, visibleRows]
  );

  useAppHotkey("sitesWorkspaceNextRow", () => selectOffset(1), {
    enabled: visibleRows.length > 0,
  });
  useAppHotkey("sitesWorkspacePreviousRow", () => selectOffset(-1), {
    enabled: visibleRows.length > 0,
  });
  useAppHotkey("sitesWorkspaceCreate", beginCreate, {
    enabled: status === "ready" && !writePending,
  });
  useAppHotkey("sitesWorkspaceSave", requestActiveFormSubmit, {
    enabled: formActionsEnabled,
  });
  useAppHotkey("sitesWorkspaceCancel", cancelForm, {
    enabled: formActionsEnabled,
  });
  useAppHotkey(
    "sitesWorkspaceComment",
    () => {
      commentInputRef.current?.focus();
    },
    {
      conflictBehavior: "allow",
      enabled: commentShortcutsEnabled,
    }
  );
  useAppHotkey(
    "sitesWorkspaceSubmitComment",
    () => {
      commentFormRef.current?.requestSubmit();
    },
    {
      conflictBehavior: "allow",
      enabled:
        commentShortcutsEnabled &&
        commentDraft.trim().length > 0 &&
        !commentPending,
    }
  );
  useAppHotkey("sitesWorkspaceCancelComment", cancelComment, {
    conflictBehavior: "allow",
    enabled:
      commentShortcutsEnabled &&
      commentDraft.trim().length > 0 &&
      !commentPending,
  });

  const submitCreate = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(event.currentTarget);
      const name = String(formData.get("name") ?? "").trim();
      const accessNotes = String(formData.get("accessNotes") ?? "").trim();

      if (name.length === 0) {
        setWriteStatus({
          error: "Site name is required.",
          kind: "failed",
          message: "Create site failed",
        });
        return;
      }

      setWriteStatus({
        kind: "pending",
        message: "Creating site and waiting for Electric confirmation",
      });
      const exit = await commandRunner.createSite({
        ...(accessNotes.length === 0 ? {} : { accessNotes }),
        name,
      });

      if (!mountedRef.current) {
        return;
      }

      if (Exit.isSuccess(exit)) {
        setCreateOpen(false);
        setSelectedSiteId(exit.value.site.id);
        setWriteStatus({
          kind: "synced",
          message: `Site synced: ${exit.value.site.name}`,
          observation: exit.value.electricObservation,
          serverTxid: exit.value.mutation.txid,
          siteId: exit.value.site.id,
        });
        form.reset();
        return;
      }

      setWriteStatus({
        error: getWorkspaceWriteErrorMessage(exit.cause),
        kind: "failed",
        message: "Create site failed",
      });
    },
    [commandRunner, setSelectedSiteId]
  );

  const submitUpdate = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const row = selectedRow;

      if (!row) {
        return;
      }

      const formData = new FormData(event.currentTarget);
      const name = String(formData.get("name") ?? "").trim();
      const accessNotes = String(formData.get("accessNotes") ?? "").trim();

      if (name.length === 0) {
        setWriteStatus({
          error: "Site name is required.",
          kind: "failed",
          message: "Save site failed",
          siteId: row.site.id,
        });
        return;
      }

      setWriteStatus({
        kind: "pending",
        message: `Saving ${row.site.name} and waiting for Electric confirmation`,
        siteId: row.site.id,
      });
      const exit = await commandRunner.updateSite(row.site.id, {
        ...(accessNotes.length === 0 ? {} : { accessNotes }),
        name,
      });

      if (!mountedRef.current) {
        return;
      }

      if (Exit.isSuccess(exit)) {
        setEditingSiteId(undefined);
        setWriteStatus({
          kind: "synced",
          message: `Site synced: ${exit.value.site.name}`,
          observation: exit.value.electricObservation,
          serverTxid: exit.value.mutation.txid,
          siteId: exit.value.site.id,
        });
        return;
      }

      setWriteStatus({
        error: getWorkspaceWriteErrorMessage(exit.cause),
        kind: "failed",
        message: "Save site failed",
        siteId: row.site.id,
      });
    },
    [commandRunner, selectedRow]
  );

  const toggleLabel = React.useCallback(
    async (label: Label, assigned: boolean) => {
      if (!selectedRow) {
        return;
      }

      if (writePending) {
        return;
      }

      const action = assigned ? "Removing" : "Assigning";
      setWriteStatus({
        kind: "pending",
        message: `${action} ${label.name} and waiting for Electric confirmation`,
        siteId: selectedRow.site.id,
      });
      const exit = assigned
        ? await commandRunner.removeSiteLabel(selectedRow.site.id, label.id)
        : await commandRunner.assignSiteLabel(selectedRow.site.id, {
            labelId: label.id,
          });

      if (!mountedRef.current) {
        return;
      }

      if (Exit.isSuccess(exit)) {
        setWriteStatus({
          kind: "synced",
          message: `${label.name} label synced`,
          observation: exit.value.electricObservation,
          serverTxid: exit.value.mutation.txid,
          siteId: selectedRow.site.id,
        });
        return;
      }

      setWriteStatus({
        error: getWorkspaceWriteErrorMessage(exit.cause),
        kind: "failed",
        message: `${assigned ? "Remove" : "Assign"} label failed`,
        siteId: selectedRow.site.id,
      });
    },
    [commandRunner, selectedRow, writePending]
  );
  const submitComment = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!selectedRow) {
        return;
      }

      const body = commentDraft.trim();
      if (body.length === 0) {
        setCommentWriteStatusForSite(selectedRow.site.id, {
          error: "Comment text is required.",
          kind: "failed",
          message: "Comment failed",
        });
        return;
      }

      const siteId = selectedRow.site.id;
      setCommentWriteStatusForSite(siteId, {
        kind: "pending",
        message: "Adding site comment and waiting for realtime sync",
      });
      const exit = await commandRunner.addSiteComment(siteId, {
        body,
      });

      if (!mountedRef.current) {
        return;
      }

      if (Exit.isSuccess(exit)) {
        setCommentWriteStatusForSite(siteId, {
          kind: "synced",
          message: "Comment synced",
          observation: exit.value.electricObservation,
        });
        if (selectedSiteIdRef.current === siteId) {
          setCommentDraft("");
          window.setTimeout(() => commentInputRef.current?.focus(), 0);
        }
        return;
      }

      setCommentWriteStatusForSite(siteId, {
        error: getCommentWriteErrorMessage(exit.cause),
        kind: "failed",
        message: "Comment failed",
      });
    },
    [commandRunner, commentDraft, selectedRow, setCommentWriteStatusForSite]
  );

  const commandActions = React.useMemo<readonly CommandAction[]>(() => {
    if (status !== "ready" || writePending) {
      return EMPTY_COMMAND_ACTIONS;
    }

    const labelActions =
      selectedRow === undefined
        ? []
        : readModel.labels.map((label) => {
            const assigned = selectedRow.site.labels.some(
              (siteLabel) => siteLabel.id === label.id
            );

            return {
              group: "Current page",
              icon: FilterHorizontalIcon,
              id: `sites-workspace-label-${label.id}`,
              priority: assigned ? 55 : 56,
              run: () => {
                void toggleLabel(label, assigned);
              },
              scope: "route",
              title: `${assigned ? "Remove" : "Assign"} ${label.name} label`,
            } satisfies CommandAction;
          });

    return [
      {
        group: "Current page",
        icon: Add01Icon,
        id: "sites-workspace-create",
        priority: 78,
        run: beginCreate,
        scope: "route",
        shortcut: HOTKEYS.sitesWorkspaceCreate,
        title: "Create site",
      },
      ...(selectedRow === undefined
        ? []
        : [
            {
              group: "Current page",
              icon: Message01Icon,
              id: "sites-workspace-focus-comment",
              priority: 72,
              run: () => {
                commentInputRef.current?.focus();
              },
              scope: "route",
              shortcut: HOTKEYS.sitesWorkspaceComment,
              title: `Comment on ${selectedRow.site.name}`,
            } satisfies CommandAction,
            {
              group: "Current page",
              icon: PencilEdit02Icon,
              id: "sites-workspace-edit-site",
              priority: 70,
              run: () => setEditingSiteId(selectedRow.site.id),
              scope: "route",
              title: `Edit ${selectedRow.site.name}`,
            } satisfies CommandAction,
          ]),
      ...labelActions,
    ];
  }, [
    beginCreate,
    commentInputRef,
    readModel.labels,
    selectedRow,
    status,
    toggleLabel,
    writePending,
  ]);

  useRegisterCommandActions(commandActions);

  const isBusy = status === "connecting";
  const isUnavailable = status === "unavailable";
  const isStale = status === "stale";

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <WorkspaceStatusAlert health={readModel.health} status={status} />
      <WorkspaceWriteStatusAlert status={writeStatus} />

      <section
        aria-label="Sites controls"
        className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
      >
        <label className="relative min-w-0" htmlFor="sites-workspace-search">
          <span className="sr-only">Search sites</span>
          <HugeiconsIcon
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
            strokeWidth={2}
          />
          <Input
            ref={searchInputRef}
            aria-describedby="sites-workspace-search-meta"
            autoComplete="off"
            className="pl-9"
            id="sites-workspace-search"
            name="sites-workspace-search"
            onChange={(event) => localState.setQuery(event.currentTarget.value)}
            placeholder="Search live sites, labels, and locations"
            type="search"
            value={query}
          />
          <ShortcutHint
            decorative
            className="absolute top-1/2 right-3 -translate-y-1/2"
            hotkey={HOTKEYS.sitesWorkspaceSearch.hotkey}
            label={HOTKEYS.sitesWorkspaceSearch.label}
          />
          <span id="sites-workspace-search-meta" className="sr-only">
            Searches live site rows, labels, and location text.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={status !== "ready" || writePending}
            onClick={beginCreate}
            type="button"
          >
            <HugeiconsIcon aria-hidden icon={Add01Icon} strokeWidth={2} />
            New Site
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.sitesWorkspaceCreate.hotkey}
              label={HOTKEYS.sitesWorkspaceCreate.label}
            />
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Sort</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              onChange={(event) =>
                localState.setSort(
                  event.currentTarget.value as SitesWorkspaceSort
                )
              }
              value={sort}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {createOpen ? (
        <SiteCreatePanel
          formRef={createFormRef}
          pending={writeStatus.kind === "pending"}
          onCancel={cancelForm}
          onSubmit={submitCreate}
        />
      ) : null}

      <fieldset className="flex flex-wrap gap-2" aria-label="Site filters">
        {FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            onClick={() => localState.setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </fieldset>

      {recentSearches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Recent searches</span>
          {recentSearches.map((recentSearch) => (
            <Button
              key={recentSearch}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => localState.setQuery(recentSearch)}
            >
              {recentSearch}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="grid min-h-[30rem] gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-h-[30rem] rounded-lg border border-border/70 bg-background">
          {renderWorkspaceRows({
            isBusy,
            isStale,
            isUnavailable,
            query,
            selectedSiteId: selectedRow?.site.id,
            setSelectedSiteId,
            visibleRows,
          })}
        </div>
        <SiteDetailPanel
          allLabels={readModel.labels}
          commentDraft={commentDraft}
          commentFormRef={commentFormRef}
          commentInputRef={commentInputRef}
          commentPending={commentPending}
          commentWriteStatus={selectedCommentWriteStatus}
          editing={editingSiteId === selectedRow?.site.id}
          editFormRef={editFormRef}
          pending={writeStatus.kind === "pending"}
          row={selectedRow}
          status={status}
          totalRows={visibleRows.length}
          writeStatus={writeStatus}
          onCancelEdit={cancelForm}
          onCancelComment={cancelComment}
          onCommentDraftChange={setCommentDraft}
          onEdit={() => {
            if (selectedRow) {
              setEditingSiteId(selectedRow.site.id);
              setCreateOpen(false);
            }
          }}
          onSubmitComment={(event) => void submitComment(event)}
          onSubmitEdit={submitUpdate}
          onToggleLabel={toggleLabel}
        />
      </div>

      <WorkspaceControlSummary
        filter={filter}
        health={readModel.health}
        sort={sort}
      />
    </section>
  );
}

function useSitesWorkspaceLocalConvenienceState({
  onWorkspaceSearchChange,
  workspaceSearch,
}: {
  readonly onWorkspaceSearchChange: (
    search: Partial<Omit<SitesWorkspaceSearch, "shell">>
  ) => void;
  readonly workspaceSearch: SitesWorkspaceSearch;
}) {
  const localConvenience = useLocalConvenienceRecords();
  const localPreferences = getWorkspacePreferencesForSurface(
    localConvenience.records,
    "sites"
  );
  const query = workspaceSearch.query ?? "";
  const filter = workspaceSearch.filter ?? localPreferences?.filter ?? "all";
  const sort = workspaceSearch.sort ?? localPreferences?.sort ?? "name";
  const restoredSelectedSiteId = getSelectedEntityForSurface(
    localConvenience.records,
    "sites"
  )?.entityId;
  const selectedSiteId = resolveSelectedSiteId(
    workspaceSearch.selectedSiteId,
    restoredSelectedSiteId
  );
  const recentSearches = getRecentSearchesForSurface(
    localConvenience.records,
    "sites"
  );

  const setQuery = React.useCallback(
    (nextQuery: string) => {
      onWorkspaceSearchChange({
        query: nextQuery.trim().length === 0 ? undefined : nextQuery,
      });
      commitRecentSearch({
        collection: localConvenience.collection,
        query: nextQuery,
        surface: "sites",
      });
    },
    [localConvenience.collection, onWorkspaceSearchChange]
  );
  const setFilter = React.useCallback(
    (nextFilter: SitesWorkspaceFilter) => {
      onWorkspaceSearchChange({
        filter: nextFilter === "all" ? undefined : nextFilter,
      });
      saveWorkspacePreferences({
        collection: localConvenience.collection,
        filter: nextFilter,
        sort,
        surface: "sites",
      });
    },
    [localConvenience.collection, onWorkspaceSearchChange, sort]
  );
  const setSort = React.useCallback(
    (nextSort: SitesWorkspaceSort) => {
      onWorkspaceSearchChange({
        sort: nextSort === "name" ? undefined : nextSort,
      });
      saveWorkspacePreferences({
        collection: localConvenience.collection,
        filter,
        sort: nextSort,
        surface: "sites",
      });
    },
    [filter, localConvenience.collection, onWorkspaceSearchChange]
  );
  const setSelectedSiteId = React.useCallback(
    (siteId: string | undefined) => {
      onWorkspaceSearchChange({ selectedSiteId: siteId });
      saveSelectedEntity({
        collection: localConvenience.collection,
        entityId: siteId,
        surface: "sites",
      });
    },
    [localConvenience.collection, onWorkspaceSearchChange]
  );

  React.useEffect(() => {
    const savedFilter = localPreferences?.filter;
    const savedSort = localPreferences?.sort;

    if (
      workspaceSearch.filter !== undefined ||
      workspaceSearch.sort !== undefined ||
      localPreferences === undefined ||
      ((savedFilter === undefined || savedFilter === "all") &&
        (savedSort === undefined || savedSort === "name"))
    ) {
      return;
    }

    onWorkspaceSearchChange({
      filter:
        savedFilter === undefined || savedFilter === "all"
          ? undefined
          : savedFilter,
      sort:
        savedSort === undefined || savedSort === "name" ? undefined : savedSort,
    });
  }, [
    localPreferences,
    onWorkspaceSearchChange,
    workspaceSearch.filter,
    workspaceSearch.sort,
  ]);

  return {
    filter,
    query,
    recentSearches,
    selectedSiteId,
    setFilter,
    setQuery,
    setSelectedSiteId,
    setSort,
    sort,
  };
}

function useSitesWorkspaceReadModel() {
  const session = useDataPlaneSession();
  const sitesState = React.useMemo(
    () =>
      getOrCreateSitesWorkspaceReadModelCollectionState({
        scope: session.scope,
        session,
      }),
    [session]
  );
  const healthObjects = React.useMemo(
    () => [
      sitesState.sites.health,
      sitesState.siteLabelAssignments.health,
      sitesState.activeJobSummaries.health,
      sitesState.relatedJobs.health,
      sitesState.labels.health,
      sitesState.actors.health,
      sitesState.siteCommentEdges.health,
      sitesState.commentBodies.health,
    ],
    [sitesState]
  );
  const health = useCollectionHealthSnapshots(healthObjects);
  const collections = React.useMemo(
    () =>
      ({
        commentBodies: sitesState.commentBodies
          .collection as unknown as SitesWorkspaceCommandCollections["commentBodies"],
        commentEdges: sitesState.siteCommentEdges
          .collection as unknown as SitesWorkspaceCommandCollections["commentEdges"],
        siteLabelAssignments: sitesState.siteLabelAssignments
          .collection as unknown as SitesWorkspaceCommandCollections["siteLabelAssignments"],
        sites: sitesState.sites
          .collection as unknown as SitesWorkspaceCommandCollections["sites"],
      }) satisfies SitesWorkspaceCommandCollections,
    [
      sitesState.commentBodies.collection,
      sitesState.siteCommentEdges.collection,
      sitesState.siteLabelAssignments.collection,
      sitesState.sites.collection,
    ]
  );

  return {
    activeJobSummaries: useHydratedCollectionItems(
      sitesState.activeJobSummaries.collection,
      EMPTY_COLLECTION_ITEMS
    ) as unknown as readonly SiteActiveJobSummaryElectricRow[],
    actors: useHydratedCollectionItems(
      sitesState.actors.collection,
      EMPTY_COLLECTION_ITEMS
    ) as unknown as readonly SitesWorkspaceProductActorRow[],
    commentBodies: useHydratedCollectionItems(
      sitesState.commentBodies.collection,
      EMPTY_COLLECTION_ITEMS
    ) as unknown as readonly SiteCommentBodyRow[],
    collections,
    health,
    labels: useHydratedCollectionItems(
      sitesState.labels.collection as unknown as Parameters<
        typeof useHydratedCollectionItems<Label>
      >[0],
      EMPTY_COLLECTION_ITEMS
    ) as readonly Label[],
    relatedJobs: useHydratedCollectionItems(
      sitesState.relatedJobs.collection,
      EMPTY_COLLECTION_ITEMS
    ) as unknown as readonly JobListItem[],
    siteLabelAssignments: useHydratedCollectionItems(
      sitesState.siteLabelAssignments.collection,
      EMPTY_COLLECTION_ITEMS
    ) as unknown as readonly SiteLabelAssignmentElectricRow[],
    siteCommentEdges: useHydratedCollectionItems(
      sitesState.siteCommentEdges.collection,
      EMPTY_COLLECTION_ITEMS
    ) as unknown as readonly SiteCommentEdgeRow[],
    sites: useHydratedCollectionItems(
      sitesState.sites.collection,
      EMPTY_COLLECTION_ITEMS
    ) as unknown as readonly SiteOption[],
  };
}

function useCollectionHealthSnapshots(
  healthObjects: readonly {
    readonly current: DataPlaneCollectionHealthSnapshot;
    readonly subscribe: (
      listener: (snapshot: DataPlaneCollectionHealthSnapshot) => void
    ) => () => void;
  }[]
) {
  const [snapshots, setSnapshots] = React.useState(() =>
    healthObjects.map((health) => health.current)
  );

  React.useEffect(() => {
    const updateSnapshots = () =>
      setSnapshots(healthObjects.map((health) => health.current));
    const unsubscribes = healthObjects.map((health) =>
      health.subscribe(updateSnapshots)
    );

    updateSnapshots();

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [healthObjects]);

  return snapshots;
}

function resolveSelectedSiteId(
  routeSelectedSiteId: string | undefined,
  restoredSelectedSiteId: string | undefined
) {
  return routeSelectedSiteId ?? restoredSelectedSiteId;
}

function areSiteCommentShortcutsEnabled({
  formOpen,
  selectedRow,
  status,
}: {
  readonly formOpen: boolean;
  readonly selectedRow: SitesWorkspaceVisibleRow | undefined;
  readonly status: SyncPresentationStatus;
}) {
  return status === "ready" && selectedRow !== undefined && !formOpen;
}

export function resolveWorkspaceStatus(
  health: readonly DataPlaneCollectionHealthSnapshot[]
): SyncPresentationStatus {
  if (health.some((snapshot) => snapshot.status === "unavailable")) {
    return "unavailable";
  }

  if (health.some((snapshot) => snapshot.status === "disabled")) {
    return "unavailable";
  }

  if (health.some((snapshot) => snapshot.status === "connecting")) {
    return "connecting";
  }

  if (health.every((snapshot) => snapshot.status === "ready")) {
    return "ready";
  }

  return "unavailable";
}

function renderWorkspaceRows({
  isBusy,
  isStale,
  isUnavailable,
  query,
  selectedSiteId,
  setSelectedSiteId,
  visibleRows,
}: {
  readonly isBusy: boolean;
  readonly isStale: boolean;
  readonly isUnavailable: boolean;
  readonly query: string;
  readonly selectedSiteId?: string | undefined;
  readonly setSelectedSiteId: (siteId: string | undefined) => void;
  readonly visibleRows: readonly SitesWorkspaceVisibleRow[];
}) {
  if (isBusy) {
    return <LoadingRows />;
  }

  if (isUnavailable) {
    return <UnavailableState />;
  }

  if (visibleRows.length === 0) {
    return <EmptyRows query={query} />;
  }

  return (
    <SitesRows
      rows={visibleRows}
      selectedSiteId={selectedSiteId}
      stale={isStale}
      onSelect={setSelectedSiteId}
    />
  );
}

function getEmptyDetailText({
  status,
  totalRows,
}: {
  readonly status: SyncPresentationStatus;
  readonly totalRows: number;
}) {
  if (status === "unavailable") {
    return "Detail stays unavailable until the live Sites read model is connected.";
  }

  if (totalRows === 0) {
    return "Select a matching site once rows are available.";
  }

  return "Restoring the last selected site.";
}

function WorkspaceStatusAlert({
  health,
  status,
}: {
  readonly health: readonly DataPlaneCollectionHealthSnapshot[];
  readonly status: SyncPresentationStatus;
}) {
  if (status === "ready") {
    return (
      <Alert>
        <HugeiconsIcon aria-hidden icon={Database01Icon} strokeWidth={2} />
        <AlertTitle>Live Sites read model ready</AlertTitle>
        <AlertDescription>
          Sites, labels, site-label assignments, active-job summaries, and
          related jobs are rendered from Electric-backed collections.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "stale") {
    return (
      <Alert>
        <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
        <AlertTitle>Realtime Sites are degraded</AlertTitle>
        <AlertDescription>
          Existing rows are shown while one or more Electric collections
          recover.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "connecting") {
    return (
      <Alert>
        <HugeiconsIcon aria-hidden icon={Database01Icon} strokeWidth={2} />
        <AlertTitle>Connecting to live Sites</AlertTitle>
        <AlertDescription>
          Waiting for Electric collections to reach their initial ready point.
        </AlertDescription>
      </Alert>
    );
  }

  const disabledReason =
    health.find((snapshot) => snapshot.disabledReason !== undefined)
      ?.disabledReason ?? "sync-unavailable";

  return (
    <Alert variant="destructive">
      <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
      <AlertTitle>Realtime sites unavailable</AlertTitle>
      <AlertDescription>
        Electric sync is not available for this workspace
        {disabledReason ? ` (${disabledReason})` : ""}. The route fails closed
        instead of reading the legacy Sites list.
      </AlertDescription>
    </Alert>
  );
}

function LoadingRows() {
  return (
    <div
      aria-label="Sites loading"
      className="grid gap-0 divide-y divide-border/60 p-4"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="grid gap-3 py-4 md:grid-cols-[1fr_8rem_7rem]"
          key={index}
        >
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyRows({ query }: { readonly query: string }) {
  return (
    <Empty className="min-h-[28rem]">
      <EmptyHeader>
        <EmptyMedia>
          <HugeiconsIcon aria-hidden icon={Location01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>
          {query.trim() ? "No sites match this view" : "No realtime sites yet"}
        </EmptyTitle>
        <EmptyDescription>
          {query.trim()
            ? "Try a different search, filter, or sort order."
            : "When the organization has synced sites, they will appear here with labels and active-job summaries."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function UnavailableState() {
  return (
    <Empty className="min-h-[28rem]">
      <EmptyHeader>
        <EmptyMedia>
          <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>Realtime sites unavailable</EmptyTitle>
        <EmptyDescription>
          Configure the Electric sync origin and collection authorization to use
          this workspace.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function SiteCreatePanel({
  formRef,
  onCancel,
  onSubmit,
  pending,
}: {
  readonly formRef: React.RefObject<HTMLFormElement | null>;
  readonly onCancel: () => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly pending: boolean;
}) {
  return (
    <form
      ref={formRef}
      aria-label="Create site"
      className="grid gap-3 rounded-lg border border-border/70 bg-background p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      onSubmit={onSubmit}
    >
      <label
        className="grid gap-1 text-sm"
        htmlFor="sites-workspace-create-name"
      >
        <span className="font-medium">Name</span>
        <Input
          autoComplete="off"
          autoFocus
          id="sites-workspace-create-name"
          name="name"
          placeholder="Dublin Port"
          required
        />
      </label>
      <label
        className="grid gap-1 text-sm"
        htmlFor="sites-workspace-create-access-notes"
      >
        <span className="font-medium">Access notes</span>
        <Input
          autoComplete="off"
          id="sites-workspace-create-access-notes"
          name="accessNotes"
          placeholder="Gate, parking, or entry notes"
        />
      </label>
      <div className="flex items-end gap-2">
        <Button disabled={pending} type="submit">
          <HugeiconsIcon
            aria-hidden
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
          />
          Save
          <ShortcutHint
            decorative
            hotkey={HOTKEYS.sitesWorkspaceSave.hotkey}
            label={HOTKEYS.sitesWorkspaceSave.label}
          />
        </Button>
        <Button
          disabled={pending}
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          <HugeiconsIcon aria-hidden icon={Cancel01Icon} strokeWidth={2} />
          Cancel
          <ShortcutHint
            decorative
            hotkey={HOTKEYS.sitesWorkspaceCancel.hotkey}
            label={HOTKEYS.sitesWorkspaceCancel.label}
          />
        </Button>
      </div>
    </form>
  );
}

function SitesRows({
  onSelect,
  rows,
  selectedSiteId,
  stale,
}: {
  readonly onSelect: (siteId: string) => void;
  readonly rows: readonly SitesWorkspaceVisibleRow[];
  readonly selectedSiteId?: string | undefined;
  readonly stale: boolean;
}) {
  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => {
        const selected = row.site.id === selectedSiteId;

        return (
          <button
            aria-pressed={selected}
            className={cn(
              "grid w-full min-w-0 gap-3 px-4 py-4 text-left transition-colors md:grid-cols-[minmax(0,1fr)_10rem_8rem]",
              selected ? "bg-muted/70" : "hover:bg-muted/40"
            )}
            key={row.site.id}
            onClick={() => onSelect(row.site.id)}
            type="button"
          >
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {row.site.name}
                </span>
                {stale ? <Badge variant="outline">Stale</Badge> : null}
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {row.site.displayLocation}
              </span>
              <LabelChips labels={row.site.labels} />
            </span>
            <span className="text-sm text-muted-foreground">
              {formatActiveJobs(row.site)}
            </span>
            <span className="text-sm text-muted-foreground">
              {row.relatedJobs.length} related
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WorkspaceWriteStatusAlert({
  status,
}: {
  readonly status: WorkspaceWriteStatus;
}) {
  if (status.kind === "idle") {
    return null;
  }

  if (status.kind === "failed") {
    return (
      <Alert variant="destructive">
        <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
        <AlertTitle>{status.message}</AlertTitle>
        <AlertDescription>{status.error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <HugeiconsIcon
        aria-hidden
        icon={
          status.kind === "pending" ? Database01Icon : CheckmarkCircle02Icon
        }
        strokeWidth={2}
      />
      <AlertTitle>
        {status.kind === "pending" ? "Site mutation pending" : "Site synced"}
      </AlertTitle>
      <AlertDescription>
        {status.message}
        {status.kind === "synced"
          ? ` (${formatWorkspaceWriteObservation(status)})`
          : ""}
      </AlertDescription>
    </Alert>
  );
}

function MutationInlineStatus({
  status,
}: {
  readonly status: Exclude<WorkspaceWriteStatus, { readonly kind: "idle" }>;
}) {
  return (
    <Badge variant={status.kind === "failed" ? "destructive" : "outline"}>
      {getMutationInlineStatusLabel(status)}
    </Badge>
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
        <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
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
          status.kind === "pending" ? Database01Icon : CheckmarkCircle02Icon
        }
        strokeWidth={2}
      />
      <AlertTitle>
        {status.kind === "pending" ? "Comment pending" : "Comment synced"}
      </AlertTitle>
      <AlertDescription>
        {status.message}
        {status.kind === "synced"
          ? ` (${formatCommentObservation(status.observation)})`
          : ""}
      </AlertDescription>
    </Alert>
  );
}

function SiteDetailPanel({
  allLabels,
  commentDraft,
  commentFormRef,
  commentInputRef,
  commentPending,
  commentWriteStatus,
  editing,
  editFormRef,
  pending,
  row,
  status,
  totalRows,
  writeStatus,
  onCancelComment,
  onCancelEdit,
  onCommentDraftChange,
  onEdit,
  onSubmitComment,
  onSubmitEdit,
  onToggleLabel,
}: {
  readonly allLabels: readonly Label[];
  readonly commentDraft: string;
  readonly commentFormRef: React.RefObject<HTMLFormElement | null>;
  readonly commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly commentPending: boolean;
  readonly commentWriteStatus: CommentWriteStatus;
  readonly editing: boolean;
  readonly editFormRef: React.RefObject<HTMLFormElement | null>;
  readonly onCancelComment: () => void;
  readonly onCancelEdit: () => void;
  readonly onCommentDraftChange: (draft: string) => void;
  readonly onEdit: () => void;
  readonly onSubmitComment: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly onSubmitEdit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly onToggleLabel: (label: Label, assigned: boolean) => void;
  readonly pending: boolean;
  readonly row: SitesWorkspaceVisibleRow | undefined;
  readonly status: SyncPresentationStatus;
  readonly totalRows: number;
  readonly writeStatus: WorkspaceWriteStatus;
}) {
  if (!row) {
    const emptyDetailText = getEmptyDetailText({ status, totalRows });

    return (
      <aside className="flex min-w-0 flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
        <SectionHeading icon={Location01Icon} title="Site detail" />
        <p className="text-sm/6 text-muted-foreground">{emptyDetailText}</p>
      </aside>
    );
  }

  return (
    <aside className="flex min-w-0 flex-col gap-4 rounded-lg border border-border/70 bg-muted/20 p-4">
      {editing ? (
        <form ref={editFormRef} className="grid gap-3" onSubmit={onSubmitEdit}>
          <SectionHeading icon={PencilEdit02Icon} title="Edit site" />
          <label
            className="grid gap-1 text-sm"
            htmlFor="sites-workspace-edit-name"
          >
            <span className="font-medium">Name</span>
            <Input
              autoComplete="off"
              defaultValue={row.site.name}
              id="sites-workspace-edit-name"
              name="name"
              required
            />
          </label>
          <label
            className="grid gap-1 text-sm"
            htmlFor="sites-workspace-edit-access-notes"
          >
            <span className="font-medium">Access notes</span>
            <Textarea
              defaultValue={row.site.accessNotes ?? ""}
              id="sites-workspace-edit-access-notes"
              name="accessNotes"
              placeholder="Gate codes, safe entry notes, or parking details"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} type="submit">
              <HugeiconsIcon
                aria-hidden
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
              />
              Save
              <ShortcutHint
                decorative
                hotkey={HOTKEYS.sitesWorkspaceSave.hotkey}
                label={HOTKEYS.sitesWorkspaceSave.label}
              />
            </Button>
            <Button
              disabled={pending}
              type="button"
              variant="outline"
              onClick={onCancelEdit}
            >
              <HugeiconsIcon aria-hidden icon={Cancel01Icon} strokeWidth={2} />
              Cancel
              <ShortcutHint
                decorative
                hotkey={HOTKEYS.sitesWorkspaceCancel.hotkey}
                label={HOTKEYS.sitesWorkspaceCancel.label}
              />
            </Button>
          </div>
        </form>
      ) : (
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <SectionHeading icon={Location01Icon} title="Site detail" />
              <h2 className="mt-3 truncate font-heading text-lg font-semibold">
                {row.site.name}
              </h2>
              <p className="mt-1 text-sm/6 text-muted-foreground">
                {row.site.displayLocation}
              </p>
            </div>
            <Button
              disabled={pending}
              size="sm"
              type="button"
              variant="outline"
              onClick={onEdit}
            >
              <HugeiconsIcon
                aria-hidden
                icon={PencilEdit02Icon}
                strokeWidth={2}
              />
              Edit
            </Button>
          </div>
        </div>
      )}

      {writeStatus.kind !== "idle" && writeStatus.siteId === row.site.id ? (
        <MutationInlineStatus status={writeStatus} />
      ) : null}

      <DetailStat
        icon={Briefcase01Icon}
        label="Active jobs"
        value={formatActiveJobs(row.site)}
      />
      <DetailStat
        icon={MapsSquare01Icon}
        label="Map readiness"
        value={
          row.site.hasUsableCoordinates
            ? "Usable coordinates"
            : "Needs location"
        }
      />

      <section className="min-w-0">
        <SectionHeading icon={FilterHorizontalIcon} title="Labels" />
        <LabelChips labels={row.site.labels} />
        {allLabels.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {allLabels.map((label) => {
              const assigned = row.site.labels.some(
                (siteLabel) => siteLabel.id === label.id
              );

              return (
                <Button
                  disabled={pending}
                  key={label.id}
                  size="sm"
                  type="button"
                  variant={assigned ? "default" : "outline"}
                  onClick={() => onToggleLabel(label, assigned)}
                >
                  {assigned ? "Remove" : "Assign"} {label.name}
                </Button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="min-w-0">
        <SectionHeading icon={LeftToRightListBulletIcon} title="Related jobs" />
        {row.relatedJobs.length === 0 ? (
          <p className="mt-2 text-sm/6 text-muted-foreground">
            No related jobs are synced for this site.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {row.relatedJobs.slice(0, 5).map((job) => (
              <li
                className="rounded-md border border-border/60 bg-background p-3"
                key={job.id}
              >
                <p className="truncate text-sm font-medium">{job.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {job.status.replaceAll("_", " ")} · {job.priority}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SiteCommentsSection
        commentDraft={commentDraft}
        commentInputRef={commentInputRef}
        commentPending={commentPending}
        commentWriteStatus={commentWriteStatus}
        comments={row.comments}
        formRef={commentFormRef}
        siteName={row.site.name}
        onCancelComment={onCancelComment}
        onCommentDraftChange={onCommentDraftChange}
        onSubmitComment={onSubmitComment}
      />
    </aside>
  );
}

function SiteCommentsSection({
  commentDraft,
  commentInputRef,
  commentPending,
  commentWriteStatus,
  comments,
  formRef,
  onCancelComment,
  onCommentDraftChange,
  onSubmitComment,
  siteName,
}: {
  readonly commentDraft: string;
  readonly commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly commentPending: boolean;
  readonly commentWriteStatus: CommentWriteStatus;
  readonly comments: readonly SitesWorkspaceDetailCommentItem[];
  readonly formRef: React.RefObject<HTMLFormElement | null>;
  readonly onCancelComment: () => void;
  readonly onCommentDraftChange: (draft: string) => void;
  readonly onSubmitComment: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly siteName: string;
}) {
  return (
    <section className="min-w-0 rounded-md border border-border/60 bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading icon={Message01Icon} title="Comments" />
        <Badge variant="outline">{comments.length}</Badge>
      </div>
      <CommentWriteStatusAlert status={commentWriteStatus} />
      {comments.length === 0 ? (
        <p className="mt-3 text-sm/6 text-muted-foreground">
          No comments are synced for this site yet.
        </p>
      ) : (
        <ul aria-label="Synced site comments" className="mt-3 grid gap-2">
          {comments.map(({ actor, comment }) => (
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
        aria-label={`Add comment to ${siteName}`}
        className="mt-4 grid gap-2"
        onSubmit={onSubmitComment}
      >
        <label className="sr-only" htmlFor="sites-workspace-comment">
          Comment
        </label>
        <Textarea
          ref={commentInputRef}
          autoComplete="off"
          disabled={commentPending}
          id="sites-workspace-comment"
          name="comment"
          onChange={(event) => onCommentDraftChange(event.currentTarget.value)}
          placeholder="Add a site update…"
          value={commentDraft}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            aria-label="Submit comment"
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
              hotkey={HOTKEYS.sitesWorkspaceSubmitComment.hotkey}
              label={HOTKEYS.sitesWorkspaceSubmitComment.label}
            />
          </Button>
          <Button
            aria-label="Cancel comment"
            disabled={commentPending || commentDraft.trim().length === 0}
            onClick={onCancelComment}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon aria-hidden icon={Cancel01Icon} strokeWidth={2} />
            Cancel
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.sitesWorkspaceCancelComment.hotkey}
              label={HOTKEYS.sitesWorkspaceCancelComment.label}
            />
          </Button>
        </div>
      </form>
    </section>
  );
}

function WorkspaceControlSummary({
  filter,
  health,
  sort,
}: {
  readonly filter: SitesWorkspaceFilter;
  readonly health: readonly DataPlaneCollectionHealthSnapshot[];
  readonly sort: SitesWorkspaceSort;
}) {
  return (
    <aside className="grid gap-3 border-t border-border/60 pt-4 md:grid-cols-3">
      <ControlSummaryItem
        icon={FilterHorizontalIcon}
        title="Saved view hook"
        value={`${filter} · ${sort}`}
      />
      <ControlSummaryItem
        icon={Database01Icon}
        title="Collection health"
        value={health.map((snapshot) => snapshot.status).join(", ")}
      />
      <ControlSummaryItem
        icon={LeftToRightListBulletIcon}
        title="Keyboard"
        value={`${HOTKEYS.sitesWorkspaceNextRow.hotkey} / ${HOTKEYS.sitesWorkspacePreviousRow.hotkey}`}
      />
    </aside>
  );
}

function ControlSummaryItem({
  icon,
  title,
  value,
}: {
  readonly icon: typeof Location01Icon;
  readonly title: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background p-3">
      <SectionHeading icon={icon} title={title} />
      <p className="mt-2 truncate text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

function DetailStat({
  icon,
  label,
  value,
}: {
  readonly icon: typeof Location01Icon;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background p-3">
      <SectionHeading icon={icon} title={label} />
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  readonly icon: typeof Location01Icon;
  readonly title: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs font-medium tracking-normal text-muted-foreground uppercase">
      <HugeiconsIcon
        aria-hidden
        className="size-4"
        icon={icon}
        strokeWidth={2}
      />
      <span className="truncate">{title}</span>
    </div>
  );
}

function LabelChips({ labels }: { readonly labels: readonly Label[] }) {
  if (labels.length === 0) {
    return (
      <span className="mt-2 inline-flex text-xs text-muted-foreground">
        No labels
      </span>
    );
  }

  return (
    <span className="mt-2 flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge key={label.id} variant="secondary">
          {label.name}
        </Badge>
      ))}
    </span>
  );
}

function formatActiveJobs(site: SiteOption) {
  const activeJobCount = site.activeJobCount ?? 0;

  if (activeJobCount === 0) {
    return "No active jobs";
  }

  const priority = site.highestActiveJobPriority
    ? ` · ${site.highestActiveJobPriority}`
    : "";

  return `${activeJobCount} active${priority}`;
}

function getWorkspaceWriteErrorMessage(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause);

  if (error instanceof Error) {
    return error.message;
  }

  return "The site command could not be confirmed.";
}

function getCommentWriteErrorMessage(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause);

  if (error instanceof Error) {
    return error.message;
  }

  return "The site comment could not be confirmed by realtime sync.";
}

function getMutationInlineStatusLabel(
  status: Exclude<WorkspaceWriteStatus, { readonly kind: "idle" }>
) {
  if (status.kind === "pending") {
    return "Pending";
  }

  if (status.kind === "synced") {
    return "Synced";
  }

  return "Failed";
}

function formatWorkspaceWriteObservation(
  status: Extract<WorkspaceWriteStatus, { readonly kind: "synced" }>
) {
  const collection =
    status.observation.collection === "sites" ? "site row" : "site label row";

  if (status.observation.kind === "already-reflected") {
    return `${collection} already reflected in live data; server txid ${status.serverTxid}`;
  }

  return `${collection} observed in live data after server txid ${status.serverTxid}`;
}

function formatProductActor(actor: SitesWorkspaceProductActorRow): string {
  return actor.displayDetail
    ? `${actor.displayName} · ${actor.displayDetail}`
    : actor.displayName;
}

function formatCommentObservation(
  observation: SitesWorkspaceCommentCommandResult["electricObservation"]
) {
  const body = formatObservationKind(observation.commentBody);
  const edge = formatObservationKind(observation.commentEdge);

  return body === edge ? `${body} by Electric` : `body ${body}, edge ${edge}`;
}

function formatObservationKind(value: "already-reflected" | "observed-change") {
  return value === "already-reflected" ? "already reflected" : "observed";
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function NoWorkspaceAccess() {
  return (
    <Empty className="min-h-[28rem] rounded-lg border border-border/70">
      <EmptyHeader>
        <EmptyMedia>
          <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>Sites is internal-only</EmptyTitle>
        <EmptyDescription>
          External collaborators keep using their job-scoped workspace until
          collaborator-safe realtime site shapes are designed.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
