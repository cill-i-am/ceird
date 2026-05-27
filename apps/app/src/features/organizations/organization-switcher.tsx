"use client";

import type { OrganizationId, OrganizationSummary } from "@ceird/identity-core";
import {
  Add01Icon,
  Building03Icon,
  RefreshIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { DotMatrixButtonLoader } from "#/components/ui/dot-matrix-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";
import { shouldHydrateOrganizationContext } from "#/features/auth/app-context-route-selection";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import type { HotkeyId } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";
import {
  buildOrganizationTenantUrl,
  readTenantHostConfigFromEnv,
} from "#/lib/tenant-host";

import {
  listOrganizations,
  setActiveOrganization,
} from "./organization-access";
import { reloadAfterActiveOrganizationRefreshFailure } from "./organization-refresh-recovery";

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

const ORGANIZATION_SWITCH_HOTKEY_IDS = [
  "switchOrganization1",
  "switchOrganization2",
  "switchOrganization3",
  "switchOrganization4",
  "switchOrganization5",
  "switchOrganization6",
  "switchOrganization7",
  "switchOrganization8",
  "switchOrganization9",
] as const satisfies readonly HotkeyId[];

export function OrganizationSwitcher({
  activeOrganization,
  activeOrganizationId: fallbackActiveOrganizationId = null,
  organizations: initialOrganizations,
}: {
  readonly activeOrganization?: OrganizationSummary | null;
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly organizations?: readonly OrganizationSummary[] | undefined;
}) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const [open, setOpen] = React.useState(false);
  const { listState, loadOrganizations } = useOrganizationListState(
    activeOrganization,
    initialOrganizations
  );
  const [switchState, setSwitchState] = React.useState<SwitchState>({
    status: "idle",
    organizationId: null,
  });
  const currentActiveOrganizationId =
    activeOrganization?.id ?? fallbackActiveOrganizationId;

  const handleSwitchOrganization = React.useCallback(
    async (nextOrganization: OrganizationSummary) => {
      const nextOrganizationId = nextOrganization.id;

      if (currentActiveOrganizationId === nextOrganizationId) {
        return;
      }

      setSwitchState({
        status: "switching",
        organizationId: nextOrganizationId,
      });

      try {
        await setActiveOrganization(nextOrganizationId);
      } catch {
        setSwitchState({
          status: "error",
          organizationId: nextOrganizationId,
        });

        return;
      }

      const tenantUrl = buildOrganizationTenantUrl(
        nextOrganization.slug,
        getCurrentLocationPath(),
        readTenantHostConfigFromEnv()
      );

      if (tenantUrl && tenantUrl !== window.location.href) {
        window.location.assign(tenantUrl);
        return;
      }

      try {
        await router.invalidate({ sync: true });
        setOpen(false);
        setSwitchState({ status: "idle", organizationId: null });
      } catch {
        reloadAfterActiveOrganizationRefreshFailure();
      }
    },
    [currentActiveOrganizationId, router]
  );

  const { organizations } = listState;
  const resolvedActiveOrganization = resolveActiveOrganization({
    activeOrganization,
    fallbackActiveOrganizationId,
    organizations,
  });
  const activeOrganizationId =
    resolvedActiveOrganization?.id ?? fallbackActiveOrganizationId;
  const canSwitchOrganizations =
    listState.status === "ready" && organizations.length > 1;
  const canOpenOrganizationMenu =
    listState.status !== "ready" ||
    organizations.length > 0 ||
    Boolean(resolvedActiveOrganization);
  const activeOrganizationName =
    resolvedActiveOrganization?.name ?? "No active organization";
  const activeOrganizationDescription =
    resolvedActiveOrganization?.slug ?? "Organization";
  const triggerDisabled =
    listState.status === "ready" && !canOpenOrganizationMenu;

  useAppHotkeySequence(
    "openOrganizationSwitcher",
    () => {
      setOpen(true);
    },
    { enabled: canSwitchOrganizations && switchState.status !== "switching" }
  );

  const triggerTrailing = renderTriggerTrailing({
    canOpenOrganizationMenu,
    listState,
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            aria-busy={listState.status === "loading" ? true : undefined}
            disabled={triggerDisabled}
            size="lg"
            className="w-full justify-start gap-2.5"
          />
        }
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
          <span className="truncate font-medium">{activeOrganizationName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {activeOrganizationDescription}
          </span>
        </span>
        {triggerTrailing}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={isMobile ? "bottom" : "right"}
        className="w-64 rounded-xl"
      >
        <DropdownMenuHeader className="px-3 py-2 text-xs font-medium text-muted-foreground">
          Teams
        </DropdownMenuHeader>
        <OrganizationSwitcherListContent
          isOpen={open}
          activeOrganizationId={activeOrganizationId}
          listState={listState}
          switchState={switchState}
          onRetry={loadOrganizations}
          onSwitchOrganization={handleSwitchOrganization}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getCurrentLocationPath() {
  if (!shouldHydrateOrganizationContext(window.location.pathname)) {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function useOrganizationListState(
  activeOrganization: OrganizationSummary | null | undefined,
  initialOrganizations: readonly OrganizationSummary[] | undefined
) {
  const [listState, setListState] = React.useState<ListState>(() =>
    getInitialListState(activeOrganization, initialOrganizations)
  );
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
    if (initialOrganizations) {
      requestIdRef.current += 1;
      setListState({
        status: "ready",
        organizations: initialOrganizations,
      });

      return;
    }

    loadOrganizations();

    return () => {
      requestIdRef.current += 1;
    };
  }, [initialOrganizations, loadOrganizations]);

  return { listState, loadOrganizations };
}

function getInitialListState(
  activeOrganization: OrganizationSummary | null | undefined,
  initialOrganizations: readonly OrganizationSummary[] | undefined
): ListState {
  return {
    status: initialOrganizations ? "ready" : "loading",
    organizations:
      initialOrganizations ?? (activeOrganization ? [activeOrganization] : []),
  };
}

function resolveActiveOrganization({
  activeOrganization,
  fallbackActiveOrganizationId,
  organizations,
}: {
  readonly activeOrganization: OrganizationSummary | null | undefined;
  readonly fallbackActiveOrganizationId: OrganizationId | null;
  readonly organizations: readonly OrganizationSummary[];
}) {
  if (activeOrganization) {
    return activeOrganization;
  }

  if (!fallbackActiveOrganizationId) {
    return null;
  }

  return (
    organizations.find(
      (organization) => organization.id === fallbackActiveOrganizationId
    ) ?? null
  );
}

function renderTriggerTrailing({
  canOpenOrganizationMenu,
  listState,
}: {
  readonly canOpenOrganizationMenu: boolean;
  readonly listState: ListState;
}) {
  if (listState.status === "loading") {
    return <DotMatrixButtonLoader />;
  }

  if (!canOpenOrganizationMenu) {
    return null;
  }

  return (
    <HugeiconsIcon
      aria-hidden="true"
      icon={UnfoldMoreIcon}
      strokeWidth={2}
      className="ml-auto size-4 text-muted-foreground"
    />
  );
}

function OrganizationSwitcherListContent({
  isOpen,
  activeOrganizationId,
  listState,
  switchState,
  onRetry,
  onSwitchOrganization,
}: {
  readonly isOpen: boolean;
  readonly activeOrganizationId: OrganizationId | null;
  readonly listState: ListState;
  readonly switchState: SwitchState;
  readonly onRetry: () => void;
  readonly onSwitchOrganization: (organization: OrganizationSummary) => void;
}) {
  if (listState.status === "loading") {
    return (
      <DropdownMenuGroup>
        <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-muted-foreground">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <span>Loading teams</span>
        </div>
      </DropdownMenuGroup>
    );
  }

  if (listState.status === "error") {
    return (
      <DropdownMenuGroup>
        <div className="px-3 py-2 text-sm text-muted-foreground">
          Couldn't load teams.
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

  return (
    <>
      <OrganizationSwitchHotkeys
        activeOrganizationId={activeOrganizationId}
        enabled={isOpen && switchState.status !== "switching"}
        organizations={listState.organizations}
        onSwitchOrganization={onSwitchOrganization}
      />
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
        value={activeOrganizationId ?? undefined}
        onValueChange={(selectedValue, eventDetails) => {
          eventDetails.cancel();

          const selectedOrganization = listState.organizations.find(
            (organization) => organization.id === selectedValue
          );

          if (!selectedOrganization) {
            return;
          }

          onSwitchOrganization(selectedOrganization);
        }}
      >
        {listState.organizations.map((organization, index) => (
          <DropdownMenuRadioItem
            key={organization.id}
            value={organization.id}
            disabled={switchState.status === "switching"}
            className="h-11 rounded-xl px-3 text-sm focus:bg-accent/70 data-[highlighted]:bg-accent/70 [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden"
          >
            <OrganizationMenuIcon />
            <span className="min-w-0 flex-1 truncate">{organization.name}</span>
            {switchState.status === "switching" &&
            switchState.organizationId === organization.id ? (
              <DotMatrixButtonLoader />
            ) : (
              <OrganizationMenuShortcut
                index={index}
                name={organization.name}
              />
            )}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled
        className="h-11 rounded-xl px-3 text-sm text-muted-foreground data-disabled:opacity-75"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
          <HugeiconsIcon
            aria-hidden="true"
            icon={Add01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </span>
        <span className="whitespace-nowrap">Add team</span>
        <Badge
          variant="secondary"
          className="ml-auto h-6 px-2 text-[0.6875rem] leading-none text-muted-foreground"
        >
          Coming soon
        </Badge>
      </DropdownMenuItem>
    </>
  );
}

function OrganizationSwitchHotkeys({
  activeOrganizationId,
  enabled,
  organizations,
  onSwitchOrganization,
}: {
  readonly activeOrganizationId: OrganizationId | null;
  readonly enabled: boolean;
  readonly organizations: readonly OrganizationSummary[];
  readonly onSwitchOrganization: (organization: OrganizationSummary) => void;
}) {
  return (
    <>
      {ORGANIZATION_SWITCH_HOTKEY_IDS.map((hotkeyId, index) => {
        const organization = organizations[index];

        return organization ? (
          <OrganizationSwitchHotkey
            key={hotkeyId}
            activeOrganizationId={activeOrganizationId}
            enabled={enabled}
            hotkeyId={hotkeyId}
            organization={organization}
            onSwitchOrganization={onSwitchOrganization}
          />
        ) : null;
      })}
    </>
  );
}

function OrganizationSwitchHotkey({
  activeOrganizationId,
  enabled,
  hotkeyId,
  organization,
  onSwitchOrganization,
}: {
  readonly activeOrganizationId: OrganizationId | null;
  readonly enabled: boolean;
  readonly hotkeyId: HotkeyId;
  readonly organization: OrganizationSummary;
  readonly onSwitchOrganization: (organization: OrganizationSummary) => void;
}) {
  useAppHotkey(
    hotkeyId,
    () => {
      if (activeOrganizationId === organization.id) {
        return;
      }

      onSwitchOrganization(organization);
    },
    { enabled, ignoreInputs: true }
  );

  return null;
}

function OrganizationMenuIcon() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
      <HugeiconsIcon
        aria-hidden="true"
        icon={Building03Icon}
        strokeWidth={2}
        className="size-4"
      />
    </span>
  );
}

function OrganizationMenuShortcut({
  index,
  name,
}: {
  readonly index: number;
  readonly name: string;
}) {
  const hotkeyId = ORGANIZATION_SWITCH_HOTKEY_IDS[index];

  if (!hotkeyId) {
    return null;
  }

  return (
    <DropdownMenuShortcut className="pl-2">
      <ShortcutHint
        decorative
        hotkey={HOTKEYS[hotkeyId].hotkey}
        label={`Switch to ${name}`}
      />
    </DropdownMenuShortcut>
  );
}
