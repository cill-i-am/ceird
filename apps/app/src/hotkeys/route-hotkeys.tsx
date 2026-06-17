"use client";
import type { OrganizationRole } from "@ceird/identity-core";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { getPrimaryNavItemsForRole } from "#/components/app-navigation";

import { useAppHotkeySequence } from "./use-app-hotkey";

export function RouteHotkeys({
  currentOrganizationRole,
}: {
  currentOrganizationRole?: OrganizationRole;
}) {
  const navigate = useNavigate({ from: "/" });
  const primaryNavigationUrls = React.useMemo(
    () =>
      new Set(
        getPrimaryNavItemsForRole(currentOrganizationRole).map(
          (item) => item.url
        )
      ),
    [currentOrganizationRole]
  );
  const canUseAdministratorHotkeys = primaryNavigationUrls.has(
    "/organization/security"
  );
  const canUseActivityHotkey = primaryNavigationUrls.has("/activity");
  const canUseInternalHotkeys = primaryNavigationUrls.has("/");

  useAppHotkeySequence(
    "goJobs",
    () => {
      React.startTransition(() => {
        navigate({ to: "/jobs" });
      });
    },
    { enabled: canUseInternalHotkeys }
  );

  useAppHotkeySequence(
    "goHome",
    () => {
      React.startTransition(() => {
        navigate({ to: "/" });
      });
    },
    { enabled: canUseInternalHotkeys }
  );

  useAppHotkeySequence(
    "goSites",
    () => {
      React.startTransition(() => {
        navigate({ to: "/sites" });
      });
    },
    { enabled: canUseInternalHotkeys }
  );

  useAppHotkeySequence(
    "goSitesWorkspace",
    () => {
      React.startTransition(() => {
        navigate({ to: "/sites-workspace" });
      });
    },
    { enabled: canUseInternalHotkeys }
  );

  useAppHotkeySequence("goSettings", () => {
    React.startTransition(() => {
      navigate({ to: "/settings" });
    });
  });

  useAppHotkeySequence(
    "goActivity",
    () => {
      React.startTransition(() => {
        navigate({
          search: {
            eventType: undefined,
            status: undefined,
            targetType: undefined,
          },
          to: "/activity",
        });
      });
    },
    { enabled: canUseActivityHotkey }
  );

  return canUseAdministratorHotkeys ? <AdministratorRouteHotkeys /> : null;
}

function AdministratorRouteHotkeys() {
  const navigate = useNavigate({ from: "/" });

  useAppHotkeySequence("goMembers", () => {
    React.startTransition(() => {
      navigate({ to: "/members" });
    });
  });

  useAppHotkeySequence("goOrganizationSecurity", () => {
    React.startTransition(() => {
      navigate({
        to: "/organization/security",
        search: {
          actorUserId: undefined,
          cursor: undefined,
          eventType: undefined,
          fromDate: undefined,
          targetSearch: undefined,
          targetType: undefined,
          toDate: undefined,
        },
      });
    });
  });

  useAppHotkeySequence("goOrganizationSettings", () => {
    React.startTransition(() => {
      navigate({ to: "/organization/settings" });
    });
  });

  useAppHotkeySequence("goOrganizationLabels", () => {
    React.startTransition(() => {
      navigate({ to: "/organization/settings/labels" });
    });
  });

  return null;
}
