"use client";
import type { OrganizationRole } from "@ceird/identity-core";
import { AiChat02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouterState } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { SidebarTrigger, useSidebar } from "#/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import {
  useCurrentOrganizationRoleFromMatches,
  useIsInOrganizationRoute,
} from "#/features/organizations/organization-route-context";
import { getActiveShortcutScopes } from "#/hotkeys/active-shortcut-scopes";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { RouteHotkeys } from "#/hotkeys/route-hotkeys";
import { ShortcutHelpOverlay } from "#/hotkeys/shortcut-help-overlay";
import { ShortcutIntroNotice } from "#/hotkeys/shortcut-intro-notice";

export function SiteHeader({
  agentChatOpen = false,
  agentChatControlsReady = true,
  canUseAgent = false,
  currentOrganizationRole: appCurrentOrganizationRole,
  onOpenAgentChat,
}: {
  agentChatOpen?: boolean;
  agentChatControlsReady?: boolean;
  canUseAgent?: boolean;
  currentOrganizationRole?: OrganizationRole | undefined;
  onOpenAgentChat?: () => void;
}) {
  const { isMobile } = useSidebar();
  const activeScopes = useRouterState({
    select: (state) =>
      getActiveShortcutScopes(state.location.pathname, state.location.search),
  });
  const isInOrganizationRoute = useIsInOrganizationRoute();
  const matchedOrganizationRole = useCurrentOrganizationRoleFromMatches();
  const currentOrganizationRole =
    matchedOrganizationRole ??
    (isInOrganizationRoute ? undefined : appCurrentOrganizationRole);

  return (
    <header className="sticky top-0 z-40 flex w-full items-center border-b border-border/60 bg-background/90 backdrop-blur">
      <RouteHotkeys currentOrganizationRole={currentOrganizationRole} />
      <div className="flex min-h-(--header-height) w-full items-center gap-2 px-3 py-3 sm:px-5">
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarTrigger
                className="size-10 rounded-lg border border-border/70 bg-background/80 sm:size-8 sm:rounded-md"
                aria-label="Toggle navigation"
              />
            }
          />
          <TooltipContent>
            <span>Toggle navigation</span>
            <ShortcutHint
              hotkey={HOTKEYS.toggleSidebar.hotkey}
              label={HOTKEYS.toggleSidebar.label}
            />
          </TooltipContent>
        </Tooltip>
        {isMobile ? (
          <ShortcutHelpOverlay
            activeScopes={activeScopes}
            buttonClassName="size-10 gap-0 rounded-lg border-border/70 bg-background/80 px-0 sm:size-8 sm:rounded-md"
            labelClassName="sr-only"
          />
        ) : null}
        {canUseAgent ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="ml-auto h-10 rounded-lg border-border/70 bg-background/80 px-3 sm:h-8 sm:rounded-md"
                  aria-label="Ask Ceird"
                  aria-expanded={agentChatOpen}
                  aria-haspopup="dialog"
                  disabled={!agentChatControlsReady}
                  onClick={onOpenAgentChat}
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={AiChat02Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  <span className="hidden sm:inline">Ask Ceird</span>
                </Button>
              }
            />
            <TooltipContent>
              <span>Ask Ceird</span>
              <ShortcutHint
                hotkey={HOTKEYS.openAgentChat.hotkey}
                label={HOTKEYS.openAgentChat.label}
              />
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <ShortcutIntroNotice />
    </header>
  );
}
