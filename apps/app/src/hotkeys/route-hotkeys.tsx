"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  isAdministrativeOrganizationRole,
  isInternalOrganizationRole,
} from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import * as React from "react";

import { useAppHotkeySequence } from "./use-app-hotkey";

export function RouteHotkeys({
  currentOrganizationRole,
}: {
  currentOrganizationRole?: OrganizationRole;
}) {
  const navigate = useNavigate({ from: "/" });
  const canUseAdministratorHotkeys =
    currentOrganizationRole !== undefined &&
    isAdministrativeOrganizationRole(currentOrganizationRole);
  const canUseInternalHotkeys =
    currentOrganizationRole !== undefined &&
    isInternalOrganizationRole(currentOrganizationRole);

  useAppHotkeySequence("goJobs", () => {
    React.startTransition(() => {
      navigate({ to: "/jobs" });
    });
  });

  useAppHotkeySequence(
    "goSites",
    () => {
      React.startTransition(() => {
        navigate({ to: "/sites" });
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
    "goMap",
    () => {
      React.startTransition(() => {
        navigate({ to: "/jobs", search: { view: "map" } });
      });
    },
    { enabled: canUseInternalHotkeys }
  );

  return canUseAdministratorHotkeys ? <AdministratorRouteHotkeys /> : null;
}

function AdministratorRouteHotkeys() {
  const navigate = useNavigate({ from: "/" });

  useAppHotkeySequence("goActivity", () => {
    React.startTransition(() => {
      navigate({
        to: "/activity",
        search: {
          actorUserId: undefined,
          eventType: undefined,
          fromDate: undefined,
          jobTitle: undefined,
          toDate: undefined,
        },
      });
    });
  });

  useAppHotkeySequence("goMembers", () => {
    React.startTransition(() => {
      navigate({ to: "/members" });
    });
  });

  return null;
}
