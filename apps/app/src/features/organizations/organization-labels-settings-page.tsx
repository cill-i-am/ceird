"use client";

import { isAdministrativeOrganizationRole } from "@ceird/identity-core";
import type {
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import type { Label } from "@ceird/labels-core";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  RadioTower,
  Search,
  ShieldAlert,
  Slash,
} from "lucide-react";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthSnapshot,
} from "#/data-plane/collection-health";
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import { searchSettingsLabels } from "#/features/labels/labels-search";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

type LabelsSettingsShellState =
  | "connecting"
  | "empty"
  | "permission-aware"
  | "ready"
  | "unavailable";

interface LabelsCollectionLike {
  readonly status: string;
  entries: () => Iterable<[string | number, Label]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot?: (options?: { readonly optimizedOnly?: boolean }) => void;
    unsubscribe: () => void;
  };
}

export interface OrganizationLabelsSettingsPageProps {
  readonly collectionState?:
    | {
        readonly collection: LabelsCollectionLike | null;
        readonly health: DataPlaneCollectionHealth;
      }
    | undefined;
  readonly organization: OrganizationSummary;
  readonly organizationRole?: OrganizationRole | undefined;
  readonly state?: LabelsSettingsShellState | undefined;
}

export function OrganizationLabelsSettingsPage({
  collectionState,
  organization,
  organizationRole,
  state,
}: OrganizationLabelsSettingsPageProps) {
  const canManageLabels =
    organizationRole !== undefined &&
    isAdministrativeOrganizationRole(organizationRole);
  const collection = canManageLabels ? collectionState?.collection : null;
  const labels = useHydratedCollectionItems<Label>(collection ?? null, []);
  const health = useCollectionHealthSnapshot(collectionState?.health);
  const shellState =
    state ??
    getLabelsSettingsState({
      canManageLabels,
      health,
      labelCount: labels.length,
    });
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionStatus, setActionStatus] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const visibleLabels = React.useMemo(
    () => searchSettingsLabels(labels, searchQuery),
    [labels, searchQuery]
  );
  const hasSearch = searchQuery.trim().length > 0;

  useAppHotkey(
    "labelsSettingsSearch",
    () => {
      searchInputRef.current?.focus();
    },
    { enabled: canManageLabels, ignoreInputs: true }
  );

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow={organization.name}
        title="Labels"
        description="Manage active organization label definitions from the realtime product data plane."
        className="border-b-0 pb-0"
        actions={
          <a className={buttonVariants()} href="/organization/settings">
            General settings
            <ArrowRight aria-hidden="true" />
          </a>
        }
      />

      <div className="flex max-w-5xl flex-col gap-5">
        <AppUtilityPanel
          id="organization-labels-realtime-list"
          title="Realtime labels"
          description="Active labels are read from the Electric-backed TanStack DB collection for this organization."
        >
          <div className="space-y-4">
            <LabelsHealthBanner health={health} state={shellState} />
            {canManageLabels ? (
              <LabelsSearchField
                disabled={shellState === "unavailable"}
                inputRef={searchInputRef}
                resultCount={visibleLabels.length}
                searchQuery={searchQuery}
                totalCount={labels.length}
                onSearchQueryChange={setSearchQuery}
              />
            ) : null}
            <LabelsStateView
              hasSearch={hasSearch}
              labels={visibleLabels}
              searchQuery={searchQuery}
              state={shellState}
              onDeferredAction={(label, action) => {
                setActionStatus(
                  `${action} for ${label.name} will be handled by the label mutation confirmation flow.`
                );
              }}
            />
            <output className="sr-only">{actionStatus}</output>
          </div>
        </AppUtilityPanel>
      </div>
    </main>
  );
}

function LabelsSearchField({
  disabled,
  inputRef,
  onSearchQueryChange,
  resultCount,
  searchQuery,
  totalCount,
}: {
  readonly disabled: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly onSearchQueryChange: (query: string) => void;
  readonly resultCount: number;
  readonly searchQuery: string;
  readonly totalCount: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="relative block min-w-0">
        <label className="sr-only" htmlFor="organization-labels-search">
          Search labels
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="organization-labels-search"
          ref={inputRef}
          className="pr-20 pl-9"
          disabled={disabled}
          placeholder="Search labels…"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
          <ShortcutHint
            decorative
            hotkey={HOTKEYS.labelsSettingsSearch.hotkey}
            label={HOTKEYS.labelsSettingsSearch.label}
          />
        </span>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {searchQuery.trim().length > 0
          ? `${resultCount} of ${totalCount} labels`
          : `${totalCount} active labels`}
      </p>
    </div>
  );
}

function LabelsHealthBanner({
  health,
  state,
}: {
  readonly health: DataPlaneCollectionHealthSnapshot | null;
  readonly state: LabelsSettingsShellState;
}) {
  const healthCopy = getHealthCopy({ health, state });

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start",
        state === "ready" || state === "empty"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "border-border/70 bg-muted/35"
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          state === "ready" || state === "empty"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100"
            : "bg-background text-muted-foreground"
        )}
      >
        {state === "ready" || state === "empty" ? (
          <CheckCircle2 aria-hidden="true" />
        ) : (
          <RadioTower aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium">{healthCopy.title}</h3>
        <p className="max-w-[72ch] text-sm/6 text-muted-foreground">
          {healthCopy.description}
        </p>
      </div>
    </div>
  );
}

function LabelsStateView({
  hasSearch,
  labels,
  onDeferredAction,
  searchQuery,
  state,
}: {
  readonly hasSearch: boolean;
  readonly labels: readonly Label[];
  readonly onDeferredAction: (label: Label, action: "Archive" | "Edit") => void;
  readonly searchQuery: string;
  readonly state: LabelsSettingsShellState;
}) {
  switch (state) {
    case "connecting": {
      return <LabelsLoadingSkeleton />;
    }
    case "empty": {
      return (
        <ShellNotice
          icon={<CheckCircle2 aria-hidden="true" />}
          title="No labels yet"
          description="New labels created by admins will appear here after the Electric labels shape observes them."
        />
      );
    }
    case "unavailable": {
      return (
        <ShellNotice
          icon={<RadioTower aria-hidden="true" />}
          title="Realtime labels unavailable"
          description="The Labels tab is waiting for the Electric labels collection. Check sync configuration or try again when realtime is reachable."
        />
      );
    }
    case "permission-aware": {
      return (
        <ShellNotice
          icon={<ShieldAlert aria-hidden="true" />}
          title="Admin label management"
          description="Owners and admins can manage organization labels from this realtime settings surface."
        />
      );
    }
    case "ready": {
      if (labels.length === 0 && hasSearch) {
        return (
          <ShellNotice
            icon={<Slash aria-hidden="true" />}
            title="No matching labels"
            description={`No active labels match "${searchQuery.trim()}".`}
          />
        );
      }

      return (
        <div className="overflow-hidden rounded-lg border border-border/70">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Label</span>
            <span>Actions</span>
          </div>
          <ul className="divide-y divide-border/70">
            {labels.map((label) => (
              <LabelRow
                key={label.id}
                label={label}
                onDeferredAction={onDeferredAction}
              />
            ))}
          </ul>
        </div>
      );
    }
    default: {
      state satisfies never;
      return null;
    }
  }
}

function LabelRow({
  label,
  onDeferredAction,
}: {
  readonly label: Label;
  readonly onDeferredAction: (label: Label, action: "Archive" | "Edit") => void;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {label.name}
        </p>
        <p className="text-xs text-muted-foreground">Active synced label</p>
      </div>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    aria-label={`Open actions for ${label.name}`}
                    size="icon-sm"
                    title={`Actions for ${label.name}`}
                    variant="ghost"
                  />
                }
              />
            }
          >
            <MoreHorizontal aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Label actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuHeader>{label.name}</DropdownMenuHeader>
          <DropdownMenuItem onClick={() => onDeferredAction(label, "Edit")}>
            <Pencil aria-hidden="true" />
            Edit label
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDeferredAction(label, "Archive")}
          >
            <Archive aria-hidden="true" />
            Archive label
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function LabelsLoadingSkeleton() {
  return (
    <div
      className="grid gap-3 rounded-lg border border-border/60 p-4"
      aria-busy="true"
      aria-label="Loading labels"
    >
      <div className="h-4 w-36 rounded bg-muted" />
      <div className="h-3 w-full max-w-lg rounded bg-muted/70" />
      <div className="h-3 w-4/5 max-w-md rounded bg-muted/70" />
    </div>
  );
}

function ShellNotice({
  icon,
  title,
  description,
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

function getLabelsSettingsState({
  canManageLabels,
  health,
  labelCount,
}: {
  readonly canManageLabels: boolean;
  readonly health: DataPlaneCollectionHealthSnapshot | null;
  readonly labelCount: number;
}): LabelsSettingsShellState {
  if (!canManageLabels) {
    return "permission-aware";
  }

  if (!health || health.status === "connecting") {
    return "connecting";
  }

  if (health.status === "ready") {
    return labelCount === 0 ? "empty" : "ready";
  }

  return "unavailable";
}

function getHealthCopy({
  health,
  state,
}: {
  readonly health: DataPlaneCollectionHealthSnapshot | null;
  readonly state: LabelsSettingsShellState;
}) {
  if (state === "permission-aware") {
    return {
      description:
        "Label management is available to organization owners and admins.",
      title: "Permission-aware access",
    };
  }

  if (state === "ready" || state === "empty") {
    return {
      description:
        "The labels collection is ready and reflects active organization labels from the sync data plane.",
      title: "Realtime ready",
    };
  }

  if (state === "connecting") {
    return {
      description:
        "The Labels tab is subscribing to the named Electric labels shape.",
      title: "Connecting to realtime labels",
    };
  }

  return {
    description:
      health?.lastError?.message ??
      health?.disabledReason ??
      "The Electric labels collection is not available for this browser session.",
    title: "Realtime labels unavailable",
  };
}

function useCollectionHealthSnapshot(
  health: DataPlaneCollectionHealth | undefined
) {
  return React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => health?.subscribe(onStoreChange) ?? (() => null),
      [health]
    ),
    React.useCallback(() => health?.current ?? null, [health]),
    React.useCallback(() => health?.current ?? null, [health])
  );
}
