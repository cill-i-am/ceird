"use client";
import { isInternalOrganizationRole } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import {
  Alert01Icon,
  Briefcase01Icon,
  CheckmarkCircle02Icon,
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

import type {
  JobsWorkspaceStatus,
  JobsWorkspaceView,
} from "./jobs-workspace-search";

interface JobsWorkspaceRouteShellProps {
  readonly currentOrganizationRole?: OrganizationRole;
  readonly hotkeysEnabled: boolean;
  readonly onStatusChange: (status: JobsWorkspaceStatus | undefined) => void;
  readonly onViewChange: (view: JobsWorkspaceView) => void;
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
const ALL_STATUSES: JobsWorkspaceStatus | undefined = undefined;

export function JobsWorkspaceRouteShell({
  currentOrganizationRole,
  hotkeysEnabled,
  onStatusChange,
  onViewChange,
  status,
  view,
}: JobsWorkspaceRouteShellProps) {
  const searchRef = React.useRef<HTMLInputElement>(null);
  const canPreviewWorkspace =
    currentOrganizationRole !== undefined &&
    isInternalOrganizationRole(currentOrganizationRole);

  useAppHotkey(
    "jobsWorkspaceSearch",
    () => {
      searchRef.current?.focus();
    },
    { enabled: hotkeysEnabled && canPreviewWorkspace }
  );
  useAppHotkeySequence("jobsWorkspaceListView", () => onViewChange("list"), {
    enabled: hotkeysEnabled && canPreviewWorkspace,
  });
  useAppHotkeySequence("jobsWorkspaceBoardView", () => onViewChange("board"), {
    enabled: hotkeysEnabled && canPreviewWorkspace,
  });

  if (!canPreviewWorkspace) {
    return <JobsWorkspacePermissionState />;
  }

  return (
    <main className="flex min-h-full min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
      <AppPageHeader
        eyebrow="Preview route"
        leading={<HugeiconsIcon icon={DatabaseSync01Icon} strokeWidth={2} />}
        title="Jobs Workspace"
        description="A separate Electric-native workspace shell for the next jobs surface. The current Jobs route remains the production route until realtime evidence passes."
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
              aria-describedby="jobs-workspace-search-hint"
              aria-label="Search jobs workspace"
              autoComplete="off"
              className="pl-9"
              id="jobs-workspace-search"
              name="jobs-workspace-search"
              placeholder="Search future live jobs…"
              type="search"
            />
            <span id="jobs-workspace-search-hint" className="sr-only">
              Search input shell only. Live results are not connected yet.
            </span>
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
        <ul className="flex flex-wrap gap-2" aria-label="Status filters">
          <li>
            <StatusButton
              active={status === undefined}
              onClick={() => onStatusChange(ALL_STATUSES)}
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
      </section>

      <section
        aria-label="Jobs workspace shell states"
        className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="flex min-h-[28rem] min-w-0 flex-col gap-3">
          <ShellStateHeader
            icon={DatabaseSync01Icon}
            label="Loading"
            title="Electric collection handshake"
          />
          <div className="grid gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton aria-hidden className="h-16 rounded-lg" key={index} />
            ))}
          </div>
          <Empty className="mt-2 min-h-56 rounded-lg">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  aria-hidden
                  icon={Briefcase01Icon}
                  strokeWidth={2}
                />
              </EmptyMedia>
              <EmptyTitle>No live jobs connected yet</EmptyTitle>
              <EmptyDescription>
                The workspace is ready for Electric-backed list and detail
                modules, but this issue intentionally stops before rendering job
                data.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
        <aside className="flex min-w-0 flex-col gap-3 border-t border-border/60 pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
          <ShellStateHeader
            icon={CheckmarkCircle02Icon}
            label="Ready"
            title="Selection and detail shell"
          />
          <div className="rounded-lg border border-border/70 p-4">
            <h2 className="font-heading text-base font-medium">Detail panel</h2>
            <p className="mt-2 text-sm/6 text-muted-foreground">
              Future row selection, record-local comments, activity, and command
              feedback will mount here without replacing the existing jobs
              route.
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-border p-4">
            <ShellStateHeader
              icon={Alert01Icon}
              label="Unavailable"
              title="Sync route unavailable"
            />
            <p className="mt-3 text-sm/6 text-muted-foreground">
              If Electric health is disabled or degraded, this workspace should
              show an explicit unavailable state instead of silently falling
              back to the old jobs list.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function JobsWorkspacePermissionState() {
  return (
    <main className="flex min-h-full min-w-0 flex-1 p-4 md:p-6">
      <Empty className="min-h-[32rem] rounded-lg">
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

function ShellStateHeader({
  icon,
  label,
  title,
}: {
  readonly icon: typeof Alert01Icon;
  readonly label: string;
  readonly title: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          "bg-muted text-muted-foreground"
        )}
      >
        <HugeiconsIcon aria-hidden icon={icon} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          {label}
        </p>
        <h2 className="truncate font-heading text-sm font-medium">{title}</h2>
      </div>
    </div>
  );
}
