"use client";

import {
  ACTIVITY_EVENT_STATUSES,
  ACTIVITY_EVENT_TARGET_TYPES,
  ACTIVITY_EVENT_TYPES,
} from "@ceird/activity-core";
import type {
  ActivityEventStatus,
  ActivityEventTargetType,
  ActivityEventType,
  ProductActivityEvent,
} from "@ceird/activity-core";
import { isAdministrativeOrganizationRole } from "@ceird/identity-core";
import type { OrganizationRole, ProductActor } from "@ceird/identity-core";
import type { WorkItemIdType } from "@ceird/jobs-core";
import type { SiteIdType } from "@ceird/sites-core";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  RadioTower,
  ShieldAlert,
  Slash,
} from "lucide-react";
import * as React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { Select } from "#/components/ui/select";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthSnapshot,
} from "#/data-plane/collection-health";
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import { deriveActivityFeedRows } from "#/features/activity/activity-data-plane";
import type { ActivityFeedRow } from "#/features/activity/activity-data-plane";
import { createWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import type { ActivitySearch } from "./activity-search";

type ActivityFeedShellState =
  | "connecting"
  | "degraded"
  | "empty"
  | "permission-aware"
  | "ready"
  | "stale"
  | "unavailable";

interface ActivityCollectionLike<Item extends object> {
  readonly status: string;
  entries: () => Iterable<[string | number, Item]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot?: (options?: { readonly optimizedOnly?: boolean }) => void;
    unsubscribe: () => void;
  };
}

export interface ActivityCollectionStateLike<Item extends object> {
  readonly collection: ActivityCollectionLike<Item> | null;
  readonly health: DataPlaneCollectionHealth;
}

export interface OrganizationActivityPageProps {
  readonly actorsState?: ActivityCollectionStateLike<ProductActor> | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly eventsState?:
    | ActivityCollectionStateLike<ProductActivityEvent>
    | undefined;
  readonly onSearchChange: (search: ActivitySearch) => void;
  readonly search: ActivitySearch;
  readonly state?: ActivityFeedShellState | undefined;
}

const EVENT_TYPE_LABELS = {
  "agent.product_effect": "Agent product effect",
  "comment.created": "Comment created",
  "job.assignee_changed": "Job assignee changed",
  "job.blocked_reason_changed": "Job blocked reason changed",
  "job.contact_changed": "Job contact changed",
  "job.coordinator_changed": "Job coordinator changed",
  "job.created": "Job created",
  "job.label_added": "Job label added",
  "job.label_removed": "Job label removed",
  "job.priority_changed": "Job priority changed",
  "job.reopened": "Job reopened",
  "job.site_changed": "Job site changed",
  "job.status_changed": "Job status changed",
  "job.visit_logged": "Job visit logged",
  "label.archived": "Label archived",
  "label.created": "Label created",
  "label.restored": "Label restored",
  "label.updated": "Label updated",
  "site.comment_created": "Site comment created",
  "site.created": "Site created",
  "site.label_added": "Site label added",
  "site.label_removed": "Site label removed",
  "site.updated": "Site updated",
} satisfies Record<ActivityEventType, string>;

const TARGET_TYPE_LABELS = {
  agent_action_run: "Agent action",
  comment: "Comment",
  job: "Job",
  label: "Label",
  site: "Site",
} satisfies Record<ActivityEventTargetType, string>;

const STATUS_LABELS = {
  failed: "Failed",
  pending: "Pending",
  synced: "Synced",
} satisfies Record<ActivityEventStatus, string>;

export function OrganizationActivityPage({
  actorsState,
  currentOrganizationRole,
  eventsState,
  onSearchChange,
  search,
  state,
}: OrganizationActivityPageProps) {
  const navigate = useNavigate({ from: "/activity" });
  const eventsHealth = useCollectionHealthSnapshot(eventsState?.health);
  const actorsHealth = useCollectionHealthSnapshot(actorsState?.health);
  const events = useHydratedCollectionItems(
    eventsState?.collection ?? null,
    []
  );
  const actors = useHydratedCollectionItems(
    actorsState?.collection ?? null,
    []
  );
  const rows = useMemo(
    () =>
      deriveActivityFeedRows({
        actors,
        events,
        filters: search,
      }),
    [actors, events, search]
  );
  const hasFilters = hasActivityFilters(search);
  const feedState =
    state ??
    getActivityFeedState({
      actorsHealth,
      eventsHealth,
      hasEvents: events.length > 0,
    });
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const searchSelectRef = useRef<HTMLSelectElement>(null);
  const rowRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);
  const canShowRows =
    feedState === "ready" || feedState === "degraded" || feedState === "stale";
  const canNavigateLabels =
    currentOrganizationRole !== undefined &&
    isAdministrativeOrganizationRole(currentOrganizationRole);

  useEffect(() => {
    setSelectedRowIndex((current) =>
      rows.length === 0 ? 0 : Math.min(current, rows.length - 1)
    );
  }, [rows.length]);

  useAppHotkey(
    "activitySearch",
    () => {
      searchSelectRef.current?.focus();
    },
    { enabled: true }
  );
  useAppHotkey(
    "activityClearFilters",
    () => {
      onSearchChange({});
    },
    { enabled: hasFilters }
  );
  useAppHotkey(
    "activityNextRow",
    () => {
      const nextIndex = Math.min(
        selectedRowIndex + 1,
        Math.max(rows.length - 1, 0)
      );

      setSelectedRowIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
    },
    { enabled: rows.length > 0 }
  );
  useAppHotkey(
    "activityPreviousRow",
    () => {
      const nextIndex = Math.max(selectedRowIndex - 1, 0);

      setSelectedRowIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
    },
    { enabled: rows.length > 0 }
  );
  useAppHotkey(
    "activityOpenSelectedRow",
    () => {
      const selectedRow = rows[selectedRowIndex];

      if (selectedRow) {
        openActivityRow(selectedRow, navigate, { canNavigateLabels });
      }
    },
    { enabled: rows.length > 0 }
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <AppPageHeader
        title="Activity"
        description="Recent product changes from the realtime activity feed."
        leading={<Activity aria-hidden="true" />}
      />

      <AppUtilityPanel
        id="global-activity-feed"
        title="Live feed"
        description="Activity events and product-safe actor labels are read from Electric-backed TanStack DB collections."
      >
        <div className="space-y-4">
          <ActivityHealthBanner
            actorsHealth={actorsHealth}
            eventsHealth={eventsHealth}
            state={feedState}
          />
          <ActivityFilters
            disabled={feedState === "permission-aware"}
            eventCount={events.length}
            resultCount={rows.length}
            search={search}
            searchSelectRef={searchSelectRef}
            onSearchChange={onSearchChange}
          />
          {hasFilters ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {buildActiveActivityFilterLabels(search).map((label) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => onSearchChange({})}
              >
                Clear filters
                <ShortcutHint
                  decorative
                  hotkey={HOTKEYS.activityClearFilters.hotkey}
                  label={HOTKEYS.activityClearFilters.label}
                />
              </Button>
            </div>
          ) : null}
          <ActivityFeedStateView
            canShowRows={canShowRows}
            canNavigateLabels={canNavigateLabels}
            hasFilters={hasFilters}
            rows={rows}
            selectedRowIndex={selectedRowIndex}
            state={feedState}
            setRowRef={(index, node) => {
              rowRefs.current[index] = node;
            }}
            setSelectedRowIndex={setSelectedRowIndex}
          />
        </div>
      </AppUtilityPanel>
    </main>
  );
}

function ActivityFilters({
  disabled,
  eventCount,
  onSearchChange,
  resultCount,
  search,
  searchSelectRef,
}: {
  readonly disabled: boolean;
  readonly eventCount: number;
  readonly onSearchChange: (search: ActivitySearch) => void;
  readonly resultCount: number;
  readonly search: ActivitySearch;
  readonly searchSelectRef: React.RefObject<HTMLSelectElement | null>;
}) {
  return (
    <div
      aria-label="Activity filters"
      className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.7fr)_minmax(9rem,0.6fr)_auto]"
    >
      <FilterField label="Event type">
        <Select
          ref={searchSelectRef}
          aria-label="Event type"
          disabled={disabled}
          value={search.eventType ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              eventType:
                event.currentTarget.value === ""
                  ? undefined
                  : (event.currentTarget.value as ActivityEventType),
            })
          }
        >
          <option value="">All events</option>
          {ACTIVITY_EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {EVENT_TYPE_LABELS[eventType]}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Entity type">
        <Select
          aria-label="Entity type"
          disabled={disabled}
          value={search.targetType ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              targetType:
                event.currentTarget.value === ""
                  ? undefined
                  : (event.currentTarget.value as ActivityEventTargetType),
            })
          }
        >
          <option value="">All entities</option>
          {ACTIVITY_EVENT_TARGET_TYPES.map((targetType) => (
            <option key={targetType} value={targetType}>
              {TARGET_TYPE_LABELS[targetType]}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Status">
        <Select
          aria-label="Status"
          disabled={disabled}
          value={search.status ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              status:
                event.currentTarget.value === ""
                  ? undefined
                  : (event.currentTarget.value as ActivityEventStatus),
            })
          }
        >
          <option value="">All statuses</option>
          {ACTIVITY_EVENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </FilterField>

      <div className="flex items-end">
        <p className="min-h-9 text-sm text-muted-foreground" aria-live="polite">
          {eventCount === resultCount
            ? `${eventCount} ${eventCount === 1 ? "event" : "events"}`
            : `${resultCount} of ${eventCount} events`}
        </p>
      </div>
    </div>
  );
}

function ActivityFeedStateView({
  canShowRows,
  canNavigateLabels,
  hasFilters,
  rows,
  selectedRowIndex,
  setRowRef,
  setSelectedRowIndex,
  state,
}: {
  readonly canShowRows: boolean;
  readonly canNavigateLabels: boolean;
  readonly hasFilters: boolean;
  readonly rows: readonly ActivityFeedRow[];
  readonly selectedRowIndex: number;
  readonly setRowRef: (
    index: number,
    node: HTMLAnchorElement | HTMLButtonElement | null
  ) => void;
  readonly setSelectedRowIndex: (index: number) => void;
  readonly state: ActivityFeedShellState;
}) {
  if (canShowRows && rows.length > 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-border/70">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Event</span>
          <span className="flex items-center gap-1">
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.activityPreviousRow.hotkey}
              label={HOTKEYS.activityPreviousRow.label}
            />
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.activityNextRow.hotkey}
              label={HOTKEYS.activityNextRow.label}
            />
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.activityOpenSelectedRow.hotkey}
              label={HOTKEYS.activityOpenSelectedRow.label}
            />
          </span>
        </div>
        <ul className="divide-y divide-border/70">
          {rows.map((row, index) => (
            <ActivityRow
              key={row.event.id}
              canNavigateLabels={canNavigateLabels}
              row={row}
              selected={index === selectedRowIndex}
              setActionRef={(node) => setRowRef(index, node)}
              onSelect={() => setSelectedRowIndex(index)}
            />
          ))}
        </ul>
      </div>
    );
  }

  if (state === "connecting") {
    return <ActivityLoadingSkeleton />;
  }

  if (state === "permission-aware") {
    return (
      <ActivityNotice
        icon={<ShieldAlert aria-hidden="true" />}
        title="Internal activity"
        description="The global Activity feed is available to organization owners, admins, and members."
      />
    );
  }

  if (state === "unavailable") {
    return (
      <ActivityNotice
        icon={<RadioTower aria-hidden="true" />}
        title="Realtime activity unavailable"
        description="The Activity feed is waiting for the Electric activity collections. Check sync configuration or try again when realtime is reachable."
      />
    );
  }

  if (hasFilters) {
    return (
      <ActivityNotice
        icon={<Slash aria-hidden="true" />}
        title="No matching activity"
        description="Clear filters or adjust the event and entity type filters to widen the live feed."
      />
    );
  }

  return (
    <Empty className="min-h-72 border-transparent bg-transparent p-8">
      <EmptyHeader>
        <EmptyTitle>No activity recorded yet</EmptyTitle>
        <EmptyDescription>
          Product events from labels, jobs, sites, comments, and agent actions
          will appear here after the activity shape observes them.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ActivityRow({
  canNavigateLabels,
  onSelect,
  row,
  selected,
  setActionRef,
}: {
  readonly canNavigateLabels: boolean;
  readonly onSelect: () => void;
  readonly row: ActivityFeedRow;
  readonly selected: boolean;
  readonly setActionRef: (
    node: HTMLAnchorElement | HTMLButtonElement | null
  ) => void;
}) {
  const { actor, event } = row;
  const link = getActivityTargetLink(event, { canNavigateLabels });

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-background px-4 py-3 transition-colors",
        selected ? "bg-primary/5 ring-1 ring-primary/25" : "hover:bg-muted/35"
      )}
      onFocus={onSelect}
      onMouseEnter={onSelect}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline">{EVENT_TYPE_LABELS[event.eventType]}</Badge>
          <StatusBadge status={event.status} />
          <span className="text-xs text-muted-foreground">
            {formatActivityDateTime(event.createdAt)}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground">
          {event.display.summary}
        </p>
        {event.display.detail ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {event.display.detail}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="min-w-0 truncate">
            {actor ? formatActorLabel(actor) : "Unknown actor"}
          </span>
          <span>{TARGET_TYPE_LABELS[event.targetType]}</span>
        </div>
      </div>
      {link ? (
        <ActivityTargetLink actionRef={setActionRef} link={link} />
      ) : (
        <Button
          ref={setActionRef}
          size="icon-sm"
          type="button"
          variant="ghost"
          aria-label={`No supported destination for ${event.display.summary}`}
          disabled
        >
          <ExternalLink aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

type ActivityTargetLink =
  | {
      readonly kind: "href";
      readonly href: string;
      readonly label: string;
    }
  | {
      readonly kind: "job";
      readonly jobId: WorkItemIdType;
      readonly label: string;
    }
  | {
      readonly kind: "label";
      readonly label: string;
    }
  | {
      readonly kind: "site";
      readonly label: string;
      readonly siteId: SiteIdType;
    };

function ActivityTargetLink({
  actionRef,
  link,
}: {
  readonly actionRef: (node: HTMLAnchorElement | null) => void;
  readonly link: ActivityTargetLink;
}) {
  const className = buttonVariants({ size: "icon-sm", variant: "ghost" });

  switch (link.kind) {
    case "job": {
      return (
        <Link
          ref={actionRef}
          aria-label={`Open ${link.label}`}
          className={className}
          to="/jobs"
          search={createWorkspaceSheetSearch({
            jobId: link.jobId,
            kind: "job.detail",
          })}
        >
          <ArrowRight aria-hidden="true" />
        </Link>
      );
    }
    case "site": {
      return (
        <Link
          ref={actionRef}
          aria-label={`Open ${link.label}`}
          className={className}
          to="/sites"
          search={createWorkspaceSheetSearch({
            kind: "site.detail",
            siteId: link.siteId,
          })}
        >
          <ArrowRight aria-hidden="true" />
        </Link>
      );
    }
    case "label": {
      return (
        <Link
          ref={actionRef}
          aria-label={`Open ${link.label}`}
          className={className}
          to="/organization/settings/labels"
        >
          <ArrowRight aria-hidden="true" />
        </Link>
      );
    }
    case "href": {
      return (
        <a
          ref={actionRef}
          aria-label={`Open ${link.label}`}
          className={className}
          href={link.href}
        >
          <ArrowRight aria-hidden="true" />
        </a>
      );
    }
    default: {
      link satisfies never;
      return null;
    }
  }
}

function StatusBadge({ status }: { readonly status: ActivityEventStatus }) {
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }

  if (status === "pending") {
    return <Badge variant="secondary">Pending</Badge>;
  }

  return <Badge variant="outline">Synced</Badge>;
}

function ActivityHealthBanner({
  actorsHealth,
  eventsHealth,
  state,
}: {
  readonly actorsHealth: DataPlaneCollectionHealthSnapshot | null;
  readonly eventsHealth: DataPlaneCollectionHealthSnapshot | null;
  readonly state: ActivityFeedShellState;
}) {
  const copy = getHealthCopy({ actorsHealth, eventsHealth, state });
  const isReadyState =
    state === "ready" || state === "empty" || state === "degraded";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start",
        isReadyState
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "border-border/70 bg-muted/35"
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          isReadyState
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100"
            : "bg-background text-muted-foreground"
        )}
      >
        {getStateIcon(state)}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium">{copy.title}</h3>
        <p className="max-w-[72ch] text-sm/6 text-muted-foreground">
          {copy.description}
        </p>
      </div>
    </div>
  );
}

function ActivityLoadingSkeleton() {
  return (
    <div
      className="grid gap-3 rounded-lg border border-border/60 p-4"
      aria-busy="true"
      aria-label="Loading activity"
    >
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="h-3 w-full max-w-xl rounded bg-muted/70" />
      <div className="h-3 w-5/6 max-w-lg rounded bg-muted/70" />
    </div>
  );
}

function ActivityNotice({
  description,
  icon,
  title,
}: {
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly title: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-start">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="max-w-[64ch] text-sm/6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function FilterField({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <label className="min-w-0 space-y-1 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function getActivityFeedState({
  actorsHealth,
  eventsHealth,
  hasEvents,
}: {
  readonly actorsHealth: DataPlaneCollectionHealthSnapshot | null;
  readonly eventsHealth: DataPlaneCollectionHealthSnapshot | null;
  readonly hasEvents: boolean;
}): ActivityFeedShellState {
  const healthSnapshots = [eventsHealth, actorsHealth];

  if (healthSnapshots.some((health) => !health)) {
    return "connecting";
  }

  if (healthSnapshots.some((health) => health?.status === "connecting")) {
    return "connecting";
  }

  if (healthSnapshots.some((health) => health?.status === "unavailable")) {
    return hasEvents ? "stale" : "unavailable";
  }

  if (healthSnapshots.some((health) => health?.status !== "ready")) {
    return hasEvents ? "stale" : "unavailable";
  }

  if (
    healthSnapshots.some(
      (health) =>
        (health?.recoveryAttempts ?? 0) > 0 || health?.lastError !== undefined
    )
  ) {
    return hasEvents ? "degraded" : "empty";
  }

  return hasEvents ? "ready" : "empty";
}

function getHealthCopy({
  actorsHealth,
  eventsHealth,
  state,
}: {
  readonly actorsHealth: DataPlaneCollectionHealthSnapshot | null;
  readonly eventsHealth: DataPlaneCollectionHealthSnapshot | null;
  readonly state: ActivityFeedShellState;
}) {
  switch (state) {
    case "ready":
    case "empty": {
      return {
        description:
          "The Activity feed is reading live events and actor labels from the named Electric shapes.",
        title: "Realtime ready",
      };
    }
    case "degraded": {
      return {
        description:
          "The feed is live again after a sync interruption. Rows stay usable while the collection catches up.",
        title: "Realtime recovered",
      };
    }
    case "stale": {
      return {
        description:
          getHealthProblem(eventsHealth, actorsHealth) ??
          "Existing activity rows are shown while realtime sync reconnects.",
        title: "Showing last synced activity",
      };
    }
    case "permission-aware": {
      return {
        description:
          "External collaborators stay on scoped Jobs experiences until collaborator-safe activity shapes are designed.",
        title: "Permission-aware access",
      };
    }
    case "connecting": {
      return {
        description:
          "The Activity route is subscribing to activity events and product-safe actor labels.",
        title: "Connecting to realtime activity",
      };
    }
    case "unavailable": {
      return {
        description:
          getHealthProblem(eventsHealth, actorsHealth) ??
          "The Electric activity collections are not available for this browser session.",
        title: "Realtime activity unavailable",
      };
    }
    default: {
      state satisfies never;
      return {
        description: "Activity feed state is unavailable.",
        title: "Activity unavailable",
      };
    }
  }
}

function getHealthProblem(
  eventsHealth: DataPlaneCollectionHealthSnapshot | null,
  actorsHealth: DataPlaneCollectionHealthSnapshot | null
) {
  return (
    eventsHealth?.lastError?.message ??
    actorsHealth?.lastError?.message ??
    eventsHealth?.disabledReason ??
    actorsHealth?.disabledReason
  );
}

function getStateIcon(state: ActivityFeedShellState) {
  switch (state) {
    case "ready":
    case "empty":
    case "degraded": {
      return <CheckCircle2 aria-hidden="true" />;
    }
    case "stale": {
      return <AlertCircle aria-hidden="true" />;
    }
    case "connecting": {
      return <CircleDashed aria-hidden="true" />;
    }
    case "permission-aware": {
      return <ShieldAlert aria-hidden="true" />;
    }
    case "unavailable": {
      return <RadioTower aria-hidden="true" />;
    }
    default: {
      state satisfies never;
      return null;
    }
  }
}

function hasActivityFilters(search: ActivitySearch) {
  return (
    search.eventType !== undefined ||
    search.targetType !== undefined ||
    search.status !== undefined
  );
}

function buildActiveActivityFilterLabels(search: ActivitySearch) {
  const labels: string[] = [];

  if (search.eventType !== undefined) {
    labels.push(`Event: ${EVENT_TYPE_LABELS[search.eventType]}`);
  }

  if (search.targetType !== undefined) {
    labels.push(`Entity: ${TARGET_TYPE_LABELS[search.targetType]}`);
  }

  if (search.status !== undefined) {
    labels.push(`Status: ${STATUS_LABELS[search.status]}`);
  }

  return labels;
}

function getActivityTargetLink(
  event: ProductActivityEvent,
  options: { readonly canNavigateLabels: boolean }
): ActivityTargetLink | null {
  if (event.targetType === "job") {
    return {
      jobId: event.targetId as WorkItemIdType,
      kind: "job",
      label: event.display.route?.label ?? event.display.summary,
    };
  }

  if (event.targetType === "site") {
    return {
      kind: "site",
      label: event.display.route?.label ?? event.display.summary,
      siteId: event.targetId as SiteIdType,
    };
  }

  if (event.targetType === "label") {
    if (!options.canNavigateLabels) {
      return null;
    }

    return {
      kind: "label",
      label: event.display.route?.label ?? event.display.summary,
    };
  }

  if (event.display.route?.href) {
    return {
      href: event.display.route.href,
      kind: "href",
      label: event.display.route.label,
    };
  }

  return null;
}

function openActivityRow(
  row: ActivityFeedRow,
  navigate: ReturnType<typeof useNavigate>,
  options: { readonly canNavigateLabels: boolean }
) {
  const link = getActivityTargetLink(row.event, options);

  if (!link) {
    return;
  }

  switch (link.kind) {
    case "job": {
      navigate({
        search: createWorkspaceSheetSearch({
          jobId: link.jobId,
          kind: "job.detail",
        }),
        to: "/jobs",
      });
      return;
    }
    case "site": {
      navigate({
        search: createWorkspaceSheetSearch({
          kind: "site.detail",
          siteId: link.siteId,
        }),
        to: "/sites",
      });
      return;
    }
    case "label": {
      navigate({ to: "/organization/settings/labels" });
      return;
    }
    case "href": {
      globalThis.location.assign(link.href);
      return;
    }
    default: {
      link satisfies never;
    }
  }
}

function formatActorLabel(actor: ProductActor) {
  return actor.displayDetail
    ? `${actor.displayName} (${actor.displayDetail})`
    : actor.displayName;
}

function formatActivityDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function useCollectionHealthSnapshot(
  health: DataPlaneCollectionHealth | undefined
) {
  return useSyncExternalStore(
    useCallback(
      (onStoreChange) => health?.subscribe(onStoreChange) ?? (() => null),
      [health]
    ),
    useCallback(() => health?.current ?? null, [health]),
    useCallback(() => health?.current ?? null, [health])
  );
}
