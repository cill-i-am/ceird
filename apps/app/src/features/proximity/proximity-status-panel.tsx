"use client";

import { AlertCircleIcon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";

export type ProximityOperationalState =
  | {
      readonly description: string;
      readonly kind:
        | "cost_guard"
        | "empty"
        | "location_blocked"
        | "no_route"
        | "origin_required"
        | "provider_unavailable";
      readonly title: string;
    }
  | {
      readonly kind: "loading";
      readonly title?: string | undefined;
    };

export function ProximityStatusPanel({
  action,
  state,
}: {
  readonly action?: ReactNode;
  readonly state: ProximityOperationalState;
}) {
  if (state.kind === "loading") {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="grid gap-2 rounded-lg border bg-muted/20 p-3"
      >
        <output className="sr-only">{state.title}</output>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3 w-64 max-w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const icon =
    state.kind === "origin_required" || state.kind === "location_blocked"
      ? Location01Icon
      : AlertCircleIcon;

  return (
    <Alert
      liveRegion="polite"
      variant={state.kind === "empty" ? "default" : "warning"}
      className="items-start"
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} />
      <AlertTitle>{state.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{state.description}</span>
        {action}
      </AlertDescription>
    </Alert>
  );
}
