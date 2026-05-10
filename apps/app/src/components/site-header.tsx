"use client";
import type { OrganizationRole } from "@ceird/identity-core";

import { SidebarTrigger } from "#/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import {
  useCurrentOrganizationRoleFromMatches,
  useIsInOrganizationRoute,
} from "#/features/organizations/organization-route-context";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { RouteHotkeys } from "#/hotkeys/route-hotkeys";
import { ShortcutIntroNotice } from "#/hotkeys/shortcut-intro-notice";

export function SiteHeader({
  currentOrganizationRole: appCurrentOrganizationRole,
}: {
  currentOrganizationRole?: OrganizationRole | undefined;
}) {
  const isInOrganizationRoute = useIsInOrganizationRoute();
  const matchedOrganizationRole = useCurrentOrganizationRoleFromMatches();
  const currentOrganizationRole =
    matchedOrganizationRole ??
    (isInOrganizationRoute ? undefined : appCurrentOrganizationRole);

  return (
    <header className="sticky top-0 z-40 flex w-full items-center border-b border-border/60 bg-background/90 backdrop-blur">
      <RouteHotkeys currentOrganizationRole={currentOrganizationRole} />
      <div className="flex min-h-(--header-height) w-full items-center px-3 py-3 sm:px-5">
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
      </div>
      <ShortcutIntroNotice />
    </header>
  );
}
