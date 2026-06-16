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
  Database01Icon,
  FilterHorizontalIcon,
  LeftToRightListBulletIcon,
  Location01Icon,
  MapsSquare01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import type { DataPlaneCollectionHealthSnapshot } from "#/data-plane/collection-health";
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import { useDataPlaneSession } from "#/data-plane/session";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import {
  deriveSitesWorkspaceVisibleRows,
  getOrCreateSitesWorkspaceReadModelCollectionState,
} from "./sites-workspace-data-plane";
import type {
  SiteActiveJobSummaryElectricRow,
  SiteLabelAssignmentElectricRow,
  SitesWorkspaceVisibleRow,
} from "./sites-workspace-data-plane";
import type {
  SitesWorkspaceFilter,
  SitesWorkspaceSearch,
  SitesWorkspaceShellState,
  SitesWorkspaceSort,
} from "./sites-workspace-search";

type SyncPresentationStatus = "connecting" | "ready" | "stale" | "unavailable";

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
  const prepareSiteCreation = React.useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  useAppHotkey("sitesWorkspaceSearch", focusSearch, {
    enabled: canUseWorkspace,
  });
  useAppHotkey("sitesWorkspaceCreate", prepareSiteCreation, {
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
            {
              group: "Current page",
              icon: Add01Icon,
              id: "sites-workspace-create-placeholder",
              priority: 70,
              run: prepareSiteCreation,
              scope: "route",
              shortcut: HOTKEYS.sitesWorkspaceCreate,
              title: "Prepare site creation",
            },
          ]
        : [],
    [canUseWorkspace, focusSearch, prepareSiteCreation]
  );

  useRegisterCommandActions(commandActions);

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
      <AppPageHeader
        leading={
          <HugeiconsIcon aria-hidden icon={Database01Icon} strokeWidth={2} />
        }
        eyebrow="Electric workspace"
        title="Sites workspace"
        description="Live site directory, labels, related jobs, and active-job summaries from the Electric-backed Sites collection graph."
        actions={
          <>
            <Badge variant="outline">Preview route</Badge>
            <Button
              type="button"
              disabled={!canUseWorkspace}
              onClick={prepareSiteCreation}
            >
              <HugeiconsIcon aria-hidden icon={Add01Icon} strokeWidth={2} />
              New Site
              <ShortcutHint
                decorative
                hotkey={HOTKEYS.sitesWorkspaceCreate.hotkey}
                label={HOTKEYS.sitesWorkspaceCreate.label}
              />
            </Button>
          </>
        }
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
  const readModel = useSitesWorkspaceReadModel();
  const query = workspaceSearch.query ?? "";
  const filter = workspaceSearch.filter ?? "all";
  const sort = workspaceSearch.sort ?? "name";
  const [restoredSelectedSiteId, setRestoredSelectedSiteId] =
    useRestoredSelectedSiteId();
  const selectedSiteId =
    workspaceSearch.selectedSiteId ?? restoredSelectedSiteId;
  const recentSearches = useRecentSitesSearches(query);
  const setQuery = React.useCallback(
    (nextQuery: string) =>
      onWorkspaceSearchChange({
        query: nextQuery.trim().length === 0 ? undefined : nextQuery,
      }),
    [onWorkspaceSearchChange]
  );
  const setFilter = React.useCallback(
    (nextFilter: SitesWorkspaceFilter) =>
      onWorkspaceSearchChange({
        filter: nextFilter === "all" ? undefined : nextFilter,
      }),
    [onWorkspaceSearchChange]
  );
  const setSort = React.useCallback(
    (nextSort: SitesWorkspaceSort) =>
      onWorkspaceSearchChange({
        sort: nextSort === "name" ? undefined : nextSort,
      }),
    [onWorkspaceSearchChange]
  );
  const setSelectedSiteId = React.useCallback(
    (siteId: string | undefined) => {
      setRestoredSelectedSiteId(siteId);
      onWorkspaceSearchChange({ selectedSiteId: siteId });
    },
    [onWorkspaceSearchChange, setRestoredSelectedSiteId]
  );

  const visibleRows = React.useMemo(
    () =>
      deriveSitesWorkspaceVisibleRows({
        activeJobSummaries: readModel.activeJobSummaries,
        filter,
        labels: readModel.labels,
        query,
        relatedJobs: readModel.relatedJobs,
        siteLabelAssignments: readModel.siteLabelAssignments,
        sites: readModel.sites,
        sort,
      }),
    [
      filter,
      query,
      readModel.activeJobSummaries,
      readModel.labels,
      readModel.relatedJobs,
      readModel.siteLabelAssignments,
      readModel.sites,
      sort,
    ]
  );
  const selectedRow = React.useMemo(
    () => visibleRows.find((row) => row.site.id === selectedSiteId),
    [selectedSiteId, visibleRows]
  );

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

  const status = resolveWorkspaceStatus({
    health: readModel.health,
    hasRows: readModel.sites.length > 0,
  });
  const isBusy = status === "connecting";
  const isUnavailable = status === "unavailable";
  const isStale = status === "stale";

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <WorkspaceStatusAlert health={readModel.health} status={status} />

      <section
        aria-label="Sites workspace controls"
        className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
      >
        <label className="relative min-w-0" htmlFor="sites-workspace-search">
          <span className="sr-only">Search sites workspace</span>
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
            onChange={(event) => setQuery(event.currentTarget.value)}
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
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Sort</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              onChange={(event) =>
                setSort(event.currentTarget.value as SitesWorkspaceSort)
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

      <fieldset className="flex flex-wrap gap-2" aria-label="Site filters">
        {FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            onClick={() => setFilter(option.value)}
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
              onClick={() => setQuery(recentSearch)}
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
          row={selectedRow}
          status={status}
          totalRows={visibleRows.length}
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
    ],
    [sitesState]
  );
  const health = useCollectionHealthSnapshots(healthObjects);

  return {
    activeJobSummaries: useHydratedCollectionItems(
      sitesState.activeJobSummaries.collection,
      []
    ) as unknown as readonly SiteActiveJobSummaryElectricRow[],
    health,
    labels: useHydratedCollectionItems(
      sitesState.labels.collection as unknown as Parameters<
        typeof useHydratedCollectionItems<Label>
      >[0],
      []
    ) as readonly Label[],
    relatedJobs: useHydratedCollectionItems(
      sitesState.relatedJobs.collection,
      []
    ) as unknown as readonly JobListItem[],
    siteLabelAssignments: useHydratedCollectionItems(
      sitesState.siteLabelAssignments.collection,
      []
    ) as unknown as readonly SiteLabelAssignmentElectricRow[],
    sites: useHydratedCollectionItems(
      sitesState.sites.collection,
      []
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

function useRestoredSelectedSiteId() {
  const session = useDataPlaneSession();
  const storageKey = `ceird:${session.scope.organizationId}:sites-workspace:selected-site`;
  const [selectedSiteId, setSelectedSiteIdState] = React.useState<
    string | undefined
  >();

  React.useEffect(() => {
    setSelectedSiteIdState(
      window.localStorage.getItem(storageKey) ?? undefined
    );
  }, [storageKey]);

  const setSelectedSiteId = React.useCallback(
    (siteId: string | undefined) => {
      setSelectedSiteIdState(siteId);

      if (siteId === undefined) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, siteId);
      }
    },
    [storageKey]
  );

  return [selectedSiteId, setSelectedSiteId] as const;
}

function useRecentSitesSearches(query: string) {
  const session = useDataPlaneSession();
  const storageKey = `ceird:${session.scope.organizationId}:sites-workspace:recent-searches`;
  const [recentSearches, setRecentSearches] = React.useState<readonly string[]>(
    []
  );

  React.useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    setRecentSearches(parseStoredRecentSearches(stored));
  }, [storageKey]);

  React.useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRecentSearches((current) => {
        const next = [
          trimmed,
          ...current.filter((search) => search !== trimmed),
        ].slice(0, 3);
        window.localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [query, storageKey]);

  return recentSearches;
}

function parseStoredRecentSearches(stored: string | null): readonly string[] {
  if (stored === null) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);

    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function resolveWorkspaceStatus({
  hasRows,
  health,
}: {
  readonly hasRows: boolean;
  readonly health: readonly DataPlaneCollectionHealthSnapshot[];
}): SyncPresentationStatus {
  if (health.some((snapshot) => snapshot.status === "unavailable")) {
    return hasRows ? "stale" : "unavailable";
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
      aria-label="Sites workspace loading"
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

function SiteDetailPanel({
  row,
  status,
  totalRows,
}: {
  readonly row: SitesWorkspaceVisibleRow | undefined;
  readonly status: SyncPresentationStatus;
  readonly totalRows: number;
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
      <div className="min-w-0">
        <SectionHeading icon={Location01Icon} title="Site detail" />
        <h2 className="mt-3 truncate font-heading text-lg font-semibold">
          {row.site.name}
        </h2>
        <p className="mt-1 text-sm/6 text-muted-foreground">
          {row.site.displayLocation}
        </p>
      </div>

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
    </aside>
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

function NoWorkspaceAccess() {
  return (
    <Empty className="min-h-[28rem] rounded-lg border border-border/70">
      <EmptyHeader>
        <EmptyMedia>
          <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>Sites workspace is internal-only</EmptyTitle>
        <EmptyDescription>
          External collaborators keep using their job-scoped workspace until
          collaborator-safe realtime site shapes are designed.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
