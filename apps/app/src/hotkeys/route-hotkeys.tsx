"use client";

import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { useAppHotkeySequence } from "./use-app-hotkey";

export function RouteHotkeys() {
  const navigate = useNavigate();

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

  useAppHotkeySequence("goMembers", () => {
    React.startTransition(() => {
      navigate({ to: "/members" });
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

  return null;
}
