"use client";

import { Settings02Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { APP_PRIMARY_NAV_ITEMS } from "#/components/app-navigation";

import { useRegisterCommandActions } from "./command-bar";
import type { CommandAction } from "./command-bar";

export function AppGlobalCommandActions() {
  const navigate = useNavigate();
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

export function AppOrganizationCommandActions() {
  const navigate = useNavigate({ from: "/" });
  const actions = React.useMemo<readonly CommandAction[]>(
    () => [
      ...APP_PRIMARY_NAV_ITEMS.map((item, index) => ({
        group: "Navigation",
        icon: item.icon,
        id: `global-go-${item.id}`,
        keywords: item.keywords,
        priority: 80 - index * 10,
        run: () => navigate({ to: item.url }),
        scope: "org" as const,
        title: `Go to ${item.title}`,
      })),
      {
        group: "Settings",
        icon: Settings02Icon,
        id: "global-go-organization-settings",
        keywords: ["organization", "workspace"],
        priority: 30,
        run: () => navigate({ to: "/organization/settings" }),
        scope: "org",
        title: "Open organization settings",
      },
    ],
    [navigate]
  );

  useRegisterCommandActions(actions);

  return null;
}
