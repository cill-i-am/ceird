import { Effect } from "effect";

export interface SandboxStartupReadiness {
  readonly postgres: boolean;
  readonly api: boolean;
  readonly app: boolean;
}

export type SandboxStartupStep =
  | "preflight"
  | "ports"
  | "portless"
  | "compose"
  | "migrations"
  | "postgres"
  | "api"
  | "app";

export type SandboxStartupStepStatus =
  | "running"
  | "done"
  | "warning"
  | "failed";

export interface SandboxStartupProgressEvent {
  readonly step: SandboxStartupStep;
  readonly status: SandboxStartupStepStatus;
  readonly detail?: string;
}

export interface SandboxHealthProgressListener {
  readonly onReadinessChanged: (
    readiness: SandboxStartupReadiness
  ) => Effect.Effect<void, never, never>;
}

export type SandboxStartupProgressReporter = (
  event: SandboxStartupProgressEvent
) => Effect.Effect<void, never, never>;

export const noopSandboxStartupProgressReporter: SandboxStartupProgressReporter =
  () => Effect.void;

export function sandboxStartupReadinessEquals(
  left: SandboxStartupReadiness | undefined,
  right: SandboxStartupReadiness
): boolean {
  return (
    left?.postgres === right.postgres &&
    left?.api === right.api &&
    left?.app === right.app
  );
}

export function toSandboxStartupProgressEvents(
  previous: SandboxStartupReadiness | undefined,
  current: SandboxStartupReadiness
): readonly SandboxStartupProgressEvent[] {
  const events: SandboxStartupProgressEvent[] = [];

  for (const step of ["postgres", "api", "app"] as const) {
    const wasReady = previous?.[step] ?? false;
    const isReady = current[step];

    if (wasReady === isReady && previous !== undefined) {
      continue;
    }

    events.push({
      step,
      status: isReady ? "done" : "running",
      detail:
        isReady || step !== "app" ? undefined : "waiting for dev server...",
    });
  }

  return events;
}
