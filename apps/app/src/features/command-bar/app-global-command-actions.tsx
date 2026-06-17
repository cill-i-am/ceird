"use client";
import { isAdministrativeOrganizationRole } from "@ceird/identity-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { AiGenerativeIcon, Settings02Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import {
  getPrimaryNavItemsForRole,
  getPrimaryNavShortcut,
} from "#/components/app-navigation";
import { requestOpenGlobalAgentChat } from "#/features/agent/global-agent-chat-events";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";

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
        shortcut: HOTKEYS.goSettings,
        title: "Open user settings",
      },
    ],
    [navigate]
  );

  useRegisterCommandActions(actions);

  return null;
}

export function AppAgentCommandActions({
  activeOrganizationId,
  currentOrganizationRole,
}: {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  const canUseAgent =
    activeOrganizationId !== null &&
    activeOrganizationId !== undefined &&
    currentOrganizationRole !== undefined;
  const actions = React.useMemo<readonly CommandAction[]>(
    () =>
      canUseAgent
        ? [
            {
              group: "Agent",
              icon: AiGenerativeIcon,
              id: "app-open-agent-chat",
              keywords: ["assistant", "chat", "action"],
              priority: 90,
              run: requestOpenGlobalAgentChat,
              scope: "global" as const,
              shortcut: HOTKEYS.openAgentChat,
              title: "Ask Ceird",
            },
          ]
        : [],
    [canUseAgent]
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
          shortcut: getPrimaryNavShortcut(item.url),
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
              shortcut: HOTKEYS.goOrganizationSettings,
              title: "Open organization settings",
            },
            {
              group: "Settings",
              icon: Settings02Icon,
              id: "global-go-organization-labels",
              keywords: ["organization", "labels", "tags", "realtime"],
              priority: 29,
              run: () => navigate({ to: "/organization/settings/labels" }),
              scope: "org" as const,
              shortcut: HOTKEYS.goOrganizationLabels,
              title: "Open Labels settings",
            },
          ]
        : []),
    ],
    [canUseAdministratorCommands, currentOrganizationRole, navigate]
  );

  useRegisterCommandActions(actions);

  return null;
}
