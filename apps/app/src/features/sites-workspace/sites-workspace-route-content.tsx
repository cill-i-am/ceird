"use client";
import { isInternalOrganizationRole } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import {
  Add01Icon,
  Alert02Icon,
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
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";

import type { SitesWorkspaceShellState } from "./sites-workspace-search";

export function SitesWorkspaceRouteContent({
  currentOrganizationRole,
  onShellStateChange,
  shellState,
}: {
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onShellStateChange: (state: SitesWorkspaceShellState) => void;
  readonly shellState: SitesWorkspaceShellState;
}) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const canUseWorkspace =
    currentOrganizationRole !== undefined &&
    isInternalOrganizationRole(currentOrganizationRole);

  const focusSearch = React.useCallback(() => {
    searchInputRef.current?.focus();
  }, []);
  const announceCreatePlaceholder = React.useCallback(() => {
    onShellStateChange("ready");
  }, [onShellStateChange]);

  useAppHotkey("sitesWorkspaceSearch", focusSearch, {
    enabled: canUseWorkspace,
  });
  useAppHotkey("sitesWorkspaceCreate", announceCreatePlaceholder, {
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
              run: announceCreatePlaceholder,
              scope: "route",
              shortcut: HOTKEYS.sitesWorkspaceCreate,
              title: "Prepare site creation",
            },
          ]
        : [],
    [announceCreatePlaceholder, canUseWorkspace, focusSearch]
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
        description="A separate route shell for the realtime Sites replacement. It is gated away from the existing Sites route until the Electric data surface has evidence."
        actions={
          <>
            <Badge variant="outline">Preview route</Badge>
            <Button
              type="button"
              disabled={!canUseWorkspace}
              onClick={announceCreatePlaceholder}
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
          onShellStateChange={onShellStateChange}
          searchInputRef={searchInputRef}
          shellState={shellState}
        />
      ) : (
        <NoWorkspaceAccess />
      )}
    </main>
  );
}

function SitesWorkspaceShell({
  onShellStateChange,
  searchInputRef,
  shellState,
}: {
  readonly onShellStateChange: (state: SitesWorkspaceShellState) => void;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly shellState: SitesWorkspaceShellState;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <Alert>
        <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
        <AlertTitle>Not connected to Electric yet</AlertTitle>
        <AlertDescription>
          This shell intentionally renders placeholder states only. Follow-up
          issues will add named shapes, TanStack DB collections, and
          domain-backed writes.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
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
            autoComplete="off"
            className="pl-9"
            id="sites-workspace-search"
            name="sites-workspace-search"
            placeholder="Search live sites…"
          />
        </label>
        <Tabs
          value={shellState}
          onValueChange={(value) =>
            onShellStateChange(value as SitesWorkspaceShellState)
          }
        >
          <TabsList aria-label="Shell state">
            <TabsTrigger value="ready">Ready</TabsTrigger>
            <TabsTrigger value="loading">Loading</TabsTrigger>
            <TabsTrigger value="empty">Empty</TabsTrigger>
            <TabsTrigger value="unavailable">Unavailable</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-[28rem] rounded-lg border border-border/70 bg-background">
          <ShellStateContent shellState={shellState} />
        </div>
        <aside className="flex min-w-0 flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              aria-hidden
              className="size-4 text-muted-foreground"
              icon={FilterHorizontalIcon}
              strokeWidth={2}
            />
            <h2 className="text-sm font-medium">Workspace controls</h2>
          </div>
          <ControlPlaceholder
            icon={LeftToRightListBulletIcon}
            title="List and saved views"
          />
          <ControlPlaceholder icon={MapsSquare01Icon} title="Map readiness" />
          <ControlPlaceholder
            icon={Location01Icon}
            title="Detail and related jobs"
          />
        </aside>
      </div>
    </section>
  );
}

function ShellStateContent({
  shellState,
}: {
  readonly shellState: SitesWorkspaceShellState;
}) {
  if (shellState === "loading") {
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

  if (shellState === "empty") {
    return (
      <Empty className="min-h-[28rem]">
        <EmptyHeader>
          <EmptyMedia>
            <HugeiconsIcon aria-hidden icon={Location01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No realtime sites yet</EmptyTitle>
          <EmptyDescription>
            The Electric workspace will show the organization site directory
            here once the collection graph lands.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (shellState === "unavailable") {
    return (
      <Empty className="min-h-[28rem]">
        <EmptyHeader>
          <EmptyMedia>
            <HugeiconsIcon aria-hidden icon={Alert02Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Realtime sites unavailable</EmptyTitle>
          <EmptyDescription>
            This route will fail closed when the Electric data path is not
            ready, instead of silently falling back to the old Sites route.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-0 divide-y divide-border/60 p-4">
      {["Site name", "Live labels", "Active jobs", "Comments"].map((label) => (
        <div
          className="grid items-center gap-3 py-4 md:grid-cols-[1fr_8rem_7rem]"
          key={label}
        >
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">
              Reserved for Electric-backed rendering
            </p>
          </div>
          <Badge variant="secondary">Live query</Badge>
          <Badge variant="outline">Shell</Badge>
        </div>
      ))}
    </div>
  );
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

function ControlPlaceholder({
  icon,
  title,
}: {
  readonly icon: typeof Location01Icon;
  readonly title: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background p-3">
      <HugeiconsIcon
        aria-hidden
        className="size-4 text-muted-foreground"
        icon={icon}
        strokeWidth={2}
      />
      <span className="text-sm font-medium">{title}</span>
    </div>
  );
}
