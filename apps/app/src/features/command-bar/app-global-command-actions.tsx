"use client";
import { isAdministrativeOrganizationRole } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { getPrimaryNavItemsForRole } from "#/components/app-navigation";

import { useRegisterCommandActions } from "./command-bar";
import type { CommandAction } from "./command-bar";

export function AppGlobalCommandActions() {
  const navigate = useNavigate({ from: "/" });
  const actions = React.useMemo<readonly CommandAction[]>(
    () => [
      {
        group: "Settings",
        icon: Settings02Icon,
        id: "global-go-user-settings",
        keywords: ["account", "profile"],
        priority: 40,
        run: () => navigate({ to: "/settings" }),
        scope: "global",
        title: "Open user settings",
      },
    ],
    [navigate]
  );

  useRegisterCommandActions(actions);

  return null;
}

export function AppOrganizationCommandActions({
  currentOrganizationRole,
}: {
  currentOrganizationRole?: OrganizationRole;
}) {
  const navigate = useNavigate({ from: "/" });
  const canUseAdministratorCommands =
    currentOrganizationRole !== undefined &&
    isAdministrativeOrganizationRole(currentOrganizationRole);
  const actions = React.useMemo<readonly CommandAction[]>(
    () => [
      ...getPrimaryNavItemsForRole(currentOrganizationRole).map(
        (item, index) => ({
          group: "Navigation",
          icon: item.icon,
          id: `global-go-${item.id}`,
          keywords: item.keywords,
          priority: 80 - index * 10,
          run: () => navigate({ to: item.url }),
          scope: "org" as const,
          title: `Go to ${item.title}`,
        })
      ),
      ...(canUseAdministratorCommands
        ? [
            {
              group: "Settings",
              icon: Settings02Icon,
              id: "global-go-organization-settings",
              keywords: ["organization", "workspace"],
              priority: 30,
              run: () => navigate({ to: "/organization/settings" }),
              scope: "org" as const,
              title: "Open organization settings",
            },
          ]
        : []),
    ],
    [canUseAdministratorCommands, currentOrganizationRole, navigate]
  );

  useRegisterCommandActions(actions);

  return null;
}
