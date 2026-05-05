"use client";

import type { OrganizationSummary } from "@ceird/identity-core";
import {
  Building03Icon,
  RefreshIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { DotMatrixButtonLoader } from "#/components/ui/dot-matrix-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SidebarMenuButton } from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";

import { listOrganizations } from "./organization-access";

type ListState =
  | {
      readonly status: "loading";
      readonly organizations: readonly OrganizationSummary[];
    }
  | {
      readonly status: "ready";
      readonly organizations: readonly OrganizationSummary[];
    }
  | {
      readonly status: "error";
      readonly organizations: readonly OrganizationSummary[];
    };

export function OrganizationSwitcher({
  activeOrganization,
}: {
  readonly activeOrganization?: OrganizationSummary | null;
}) {
  const [listState, setListState] = React.useState<ListState>({
    status: "loading",
    organizations: activeOrganization ? [activeOrganization] : [],
  });
  const requestIdRef = React.useRef(0);

  const loadOrganizations = React.useCallback(() => {
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;

    setListState((current) => ({
      status: "loading",
      organizations: current.organizations,
    }));

    void listOrganizations()
      .then((organizations) => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setListState({
          status: "ready",
          organizations,
        });
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setListState((current) => ({
          status: "error",
          organizations: current.organizations,
        }));
      });
  }, []);

  React.useEffect(() => {
    loadOrganizations();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadOrganizations]);

  const organizations = listState.organizations;
  const activeOrganizationName =
    activeOrganization?.name ?? "No active organization";
  const triggerDisabled =
    listState.status !== "error" &&
    (!activeOrganization ||
      (listState.status === "ready" && organizations.length <= 1));
  const triggerDescription =
    listState.status === "ready" && organizations.length === 1
      ? "Only organization"
      : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            aria-busy={listState.status === "loading" ? true : undefined}
            disabled={triggerDisabled}
            size="lg"
            className="w-full justify-start gap-2.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground">
              <HugeiconsIcon
                aria-hidden="true"
                icon={Building03Icon}
                strokeWidth={2}
                className="size-4"
              />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5 text-left leading-tight">
              <span className="truncate font-medium">
                {activeOrganizationName}
              </span>
              {triggerDescription ? (
                <span className="truncate text-xs text-muted-foreground">
                  {triggerDescription}
                </span>
              ) : null}
            </span>
            {listState.status === "loading" ? (
              <DotMatrixButtonLoader />
            ) : organizations.length > 1 ? (
              <HugeiconsIcon
                aria-hidden="true"
                icon={UnfoldMoreIcon}
                strokeWidth={2}
                className="ml-auto size-4 text-muted-foreground"
              />
            ) : null}
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent align="start" side="right" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {renderListContent({
          activeOrganization,
          listState,
          onRetry: loadOrganizations,
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function renderListContent({
  activeOrganization,
  listState,
  onRetry,
}: {
  readonly activeOrganization?: OrganizationSummary | null;
  readonly listState: ListState;
  readonly onRetry: () => void;
}) {
  if (listState.status === "loading") {
    return (
      <DropdownMenuGroup>
        <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-muted-foreground">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <span>Loading organizations</span>
        </div>
      </DropdownMenuGroup>
    );
  }

  if (listState.status === "error") {
    return (
      <DropdownMenuGroup>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          Couldn't load organizations.
        </div>
        <DropdownMenuItem onSelect={onRetry}>
          <HugeiconsIcon
            aria-hidden="true"
            icon={RefreshIcon}
            strokeWidth={2}
            className="size-4"
          />
          <span>Retry</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    );
  }

  if (listState.organizations.length === 0) {
    return (
      <DropdownMenuGroup>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          No organizations
        </div>
      </DropdownMenuGroup>
    );
  }

  if (listState.organizations.length === 1) {
    return (
      <DropdownMenuGroup>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          Only organization
        </div>
      </DropdownMenuGroup>
    );
  }

  return (
    <DropdownMenuRadioGroup value={activeOrganization?.id}>
      {listState.organizations.map((organization) => (
        <DropdownMenuRadioItem key={organization.id} value={organization.id}>
          <span className="min-w-0 truncate">{organization.name}</span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
