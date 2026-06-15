"use client";

import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import {
  AiChat02Icon,
  Cancel01Icon,
  Clock03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";

export const GLOBAL_AGENT_CHAT_OPEN_EVENT = "ceird:agent-chat-open";

const GlobalAgentChatPanel = React.lazy(async () => {
  const { GlobalAgentChatPanel: Panel } =
    await import("./global-agent-chat-panel");

  return { default: Panel };
});

interface GlobalAgentChatProps {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function requestOpenGlobalAgentChat() {
  window.dispatchEvent(new CustomEvent(GLOBAL_AGENT_CHAT_OPEN_EVENT));
}

export function GlobalAgentChat({
  activeOrganizationId,
  currentOrganizationRole,
  onOpenChange,
  open,
}: GlobalAgentChatProps) {
  const canUseAgent =
    activeOrganizationId !== null &&
    activeOrganizationId !== undefined &&
    currentOrganizationRole !== undefined;

  if (!canUseAgent || !open) {
    return null;
  }

  return (
    <React.Suspense
      fallback={
        <GlobalAgentChatLoadingFallback
          currentOrganizationRole={currentOrganizationRole}
          open={open}
          onOpenChange={onOpenChange}
        />
      }
    >
      <GlobalAgentChatPanel
        activeOrganizationId={activeOrganizationId}
        currentOrganizationRole={currentOrganizationRole}
        open={open}
        onOpenChange={onOpenChange}
      />
    </React.Suspense>
  );
}

function GlobalAgentChatLoadingFallback({
  currentOrganizationRole,
  onOpenChange,
  open,
}: {
  readonly currentOrganizationRole: OrganizationRole;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-0 data-[vaul-drawer-direction=bottom]:min-h-[76vh] data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
        <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground">
                  <AgentIcon icon={AiChat02Icon} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <DrawerTitle className="font-heading text-base">
                    Ask Ceird
                  </DrawerTitle>
                  <DrawerDescription className="truncate">
                    Workspace operator
                  </DrawerDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {formatRoleLabel(currentOrganizationRole)} access
                </Badge>
                <Badge variant="secondary">Preparing</Badge>
              </div>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Close Ask Ceird"
              >
                <AgentIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <AgentIcon icon={Clock03Icon} strokeWidth={2} />
              <output aria-live="polite">Preparing workspace context</output>
            </div>
          </div>
        </div>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function AgentIcon({
  icon,
  ...props
}: Omit<React.ComponentProps<typeof HugeiconsIcon>, "aria-hidden" | "icon"> & {
  readonly icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  return <HugeiconsIcon aria-hidden="true" icon={icon} {...props} />;
}

function formatRoleLabel(role: OrganizationRole) {
  return role
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
