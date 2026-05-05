"use client";

import type { OrganizationId, OrganizationSummary } from "@ceird/identity-core";
import {
  Building03Icon,
  RefreshIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
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
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SidebarMenuButton } from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";

import {
  listOrganizations,
  setActiveOrganization,
} from "./organization-access";

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

type SwitchState =
  | { readonly status: "idle"; readonly organizationId: null }
  | {
      readonly status: "switching";
      readonly organizationId: OrganizationId;
    }
  | { readonly status: "error"; readonly organizationId: OrganizationId };

export function OrganizationSwitcher({
  activeOrganization,
}: {
  readonly activeOrganization?: OrganizationSummary | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [listState, setListState] = React.useState<ListState>({
    status: "loading",
    organizations: activeOrganization ? [activeOrganization] : [],
  });
  const [switchState, setSwitchState] = React.useState<SwitchState>({
    status: "idle",
    organizationId: null,
  });
  const requestIdRef = React.useRef(0);

  const loadOrganizations = React.useCallback(() => {
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;

    setListState((current) => ({
      status: "loading",
      organizations: current.organizations,
    }));

    void (async () => {
      try {
        const organizations = await listOrganizations();

        if (requestIdRef.current !== requestId) {
          return;
        }

        setListState({
          status: "ready",
          organizations,
        });
      } catch {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setListState((current) => ({
          status: "error",
          organizations: current.organizations,
        }));
      }
    })();
  }, []);

  React.useEffect(() => {
    loadOrganizations();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadOrganizations]);

  const handleSwitchOrganization = React.useCallback(
    async (nextOrganizationId: OrganizationId) => {
      if (activeOrganization?.id === nextOrganizationId) {
        return;
      }

      setSwitchState({
        status: "switching",
        organizationId: nextOrganizationId,
      });

      try {
        await setActiveOrganization(nextOrganizationId);
        await router.invalidate({ sync: true });
        setOpen(false);
        setSwitchState({ status: "idle", organizationId: null });
      } catch {
        setSwitchState({
          status: "error",
          organizationId: nextOrganizationId,
        });
      }
    },
    [activeOrganization?.id, router]
  );

  const { organizations } = listState;
  const canSwitchOrganizations =
    listState.status === "ready" && organizations.length > 1;
  const activeOrganizationName =
    activeOrganization?.name ?? "No active organization";
  const activeOrganizationDescription =
    activeOrganization?.slug ?? "Organization";
  const triggerDisabled =
    listState.status !== "error" &&
    (!activeOrganization ||
      (listState.status === "ready" && organizations.length <= 1));

  useAppHotkeySequence(
    "openOrganizationSwitcher",
    () => {
      setOpen(true);
    },
    { enabled: canSwitchOrganizations && switchState.status !== "switching" }
  );

  let triggerTrailing: React.ReactNode = null;

  if (listState.status === "loading") {
    triggerTrailing = <DotMatrixButtonLoader />;
  } else if (canSwitchOrganizations) {
    triggerTrailing = (
      <HugeiconsIcon
        aria-hidden="true"
        icon={UnfoldMoreIcon}
        strokeWidth={2}
        className="ml-auto size-4 text-muted-foreground"
      />
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
              <span className="truncate text-xs text-muted-foreground">
                {activeOrganizationDescription}
              </span>
            </span>
            {triggerTrailing}
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent align="start" side="right" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <span className="min-w-0 flex-1">Organizations</span>
          {canSwitchOrganizations ? (
            <DropdownMenuShortcut>
              <ShortcutHint
                hotkey={HOTKEYS.openOrganizationSwitcher.hotkey}
                label={HOTKEYS.openOrganizationSwitcher.label}
              />
            </DropdownMenuShortcut>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {renderListContent({
          activeOrganization,
          listState,
          switchState,
          onRetry: loadOrganizations,
          onSwitchOrganization: handleSwitchOrganization,
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function renderListContent({
  activeOrganization,
  listState,
  switchState,
  onRetry,
  onSwitchOrganization,
}: {
  readonly activeOrganization?: OrganizationSummary | null;
  readonly listState: ListState;
  readonly switchState: SwitchState;
  readonly onRetry: () => void;
  readonly onSwitchOrganization: (organizationId: OrganizationId) => void;
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
        <DropdownMenuItem closeOnClick={false} onClick={onRetry}>
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
    <>
      {switchState.status === "error" ? (
        <div
          aria-label="Couldn't switch organizations."
          role="alert"
          className="px-3 py-2 text-sm text-destructive"
        >
          Couldn't switch organizations.
        </div>
      ) : null}
      <DropdownMenuRadioGroup
        value={activeOrganization?.id}
        onValueChange={(selectedValue, eventDetails) => {
          eventDetails.cancel();

          const selectedOrganization = listState.organizations.find(
            (organization) => organization.id === selectedValue
          );

          if (!selectedOrganization) {
            return;
          }

          onSwitchOrganization(selectedOrganization.id);
        }}
      >
        {listState.organizations.map((organization) => (
          <DropdownMenuRadioItem
            key={organization.id}
            value={organization.id}
            disabled={switchState.status === "switching"}
          >
            <span className="min-w-0 truncate">{organization.name}</span>
            {switchState.status === "switching" &&
            switchState.organizationId === organization.id ? (
              <DotMatrixButtonLoader />
            ) : null}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
