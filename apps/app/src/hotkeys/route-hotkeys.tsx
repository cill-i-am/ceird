"use client";

import { useNavigate } from "@tanstack/react-router";
import { isAdministrativeOrganizationRole } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import * as React from "react";

import { useAppHotkeySequence } from "./use-app-hotkey";

export function RouteHotkeys({
  currentOrganizationRole,
}: {
  currentOrganizationRole?: OrganizationRole;
}) {
  const navigate = useNavigate();
  const canUseAdministratorHotkeys =
    currentOrganizationRole !== undefined &&
    isAdministrativeOrganizationRole(currentOrganizationRole);

  useAppHotkeySequence("goJobs", () => {
    React.startTransition(() => {
      navigate({ to: "/jobs" });
    });
  });

  useAppHotkeySequence("goSites", () => {
    React.startTransition(() => {
      navigate({ to: "/sites" });
    });
  });

  useAppHotkeySequence("goSettings", () => {
    React.startTransition(() => {
      navigate({ to: "/settings" });
    });
  });

  useAppHotkeySequence("goMap", () => {
    React.startTransition(() => {
      navigate({ to: "/jobs", search: { view: "map" } });
    });
  });

  return canUseAdministratorHotkeys ? <AdministratorRouteHotkeys /> : null;
}

function AdministratorRouteHotkeys() {
  const navigate = useNavigate();

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
