import type {
  ComposeProjectNameType as ComposeProjectName,
  SandboxNameType as SandboxName,
  SandboxStatus,
  SandboxUrls,
} from "@task-tracker/sandbox-core";
import { Match } from "effect";

import type {
  SandboxStartupProgressEvent,
  SandboxStartupReadiness,
} from "./startup-progress.js";
import {
  colorizeSandboxDetail,
  colorizeSandboxLabel,
  colorizeSandboxStatus,
  PLAIN_SANDBOX_TERMINAL_STYLE,
} from "./terminal-style.js";
import type { SandboxTerminalStyle } from "./terminal-style.js";

export function formatSandboxViewLines(
  label: string,
  record: {
    readonly sandboxName: SandboxName;
    readonly composeProjectName: ComposeProjectName;
    readonly status: SandboxStatus;
  },
  urls: SandboxUrls
): readonly string[] {
  return [
    label,
    `  sandbox: ${record.sandboxName}`,
    `  compose project: ${record.composeProjectName}`,
    `  status: ${record.status}`,
    `  app url: ${urls.app}`,
    `  api url: ${urls.api}`,
    `  postgres url: ${urls.postgres}`,
    `  app fallback url: ${urls.fallbackApp}`,
    `  api fallback url: ${urls.fallbackApi}`,
    ...(record.status === "degraded"
      ? [
          "  warning: portless aliases were unavailable or services are incomplete; fallback URLs are active.",
        ]
      : []),
  ];
}

export function formatSandboxStartupTimeoutLines(input: {
  readonly sandboxName: SandboxName;
  readonly composeProjectName: ComposeProjectName;
  readonly timeoutMs: number;
  readonly readiness: SandboxStartupReadiness;
  readonly urls: SandboxUrls;
}): readonly string[] {
  let nextService: "postgres" | "api" | "app" = "app";
  if (input.readiness.postgres === false) {
    nextService = "postgres";
  } else if (input.readiness.api === false) {
    nextService = "api";
  }

  return [
    `Sandbox startup timed out after ${Math.round(input.timeoutMs / 1000)} seconds.`,
    `  sandbox: ${input.sandboxName}`,
    `  compose project: ${input.composeProjectName}`,
    `  postgres ready: ${input.readiness.postgres ? "yes" : "no"}`,
    `  api ready: ${input.readiness.api ? "yes" : "no"}`,
    `  app ready: ${input.readiness.app ? "yes" : "no"}`,
    `  postgres url: ${input.urls.postgres}`,
    `  app fallback url: ${input.urls.fallbackApp}`,
    `  api fallback url: ${input.urls.fallbackApi}`,
    `  next step: pnpm sandbox:logs -- --name ${input.sandboxName} --service ${nextService}`,
  ];
}

export function formatSandboxStartupProgressLine(
  event: SandboxStartupProgressEvent,
  style: SandboxTerminalStyle = PLAIN_SANDBOX_TERMINAL_STYLE
): string {
  const marker = colorizeSandboxStatus(
    event.status,
    formatStartupStepMarker(event.status, style),
    style
  );
  const rawLabel = formatStartupStepLabel(event.step);
  const paddedLabel =
    event.detail === undefined ? rawLabel : rawLabel.padEnd(10);
  const label = colorizeSandboxLabel(paddedLabel, style);

  if (event.detail === undefined) {
    return `${marker} ${label}`;
  }

  return `${marker} ${label} ${colorizeSandboxDetail(event.detail, style)}`;
}

function formatStartupStepLabel(
  step: SandboxStartupProgressEvent["step"]
): string {
  return Match.value(step).pipe(
    Match.when("preflight", () => "Preflight"),
    Match.when("ports", () => "Ports"),
    Match.when("portless", () => "Portless"),
    Match.when("compose", () => "Compose"),
    Match.when("migrations", () => "Migrations"),
    Match.when("postgres", () => "Postgres"),
    Match.when("api", () => "API"),
    Match.when("app", () => "App"),
    Match.exhaustive
  );
}

function formatStartupStepMarker(
  status: SandboxStartupProgressEvent["status"],
  style: SandboxTerminalStyle
): string {
  if (style.unicode) {
    return Match.value(status).pipe(
      Match.when("running", () => "●"),
      Match.when("done", () => "✓"),
      Match.when("warning", () => "▲"),
      Match.when("failed", () => "✖"),
      Match.exhaustive
    );
  }

  return Match.value(status).pipe(
    Match.when("running", () => ">"),
    Match.when("done", () => "+"),
    Match.when("warning", () => "!"),
    Match.when("failed", () => "x"),
    Match.exhaustive
  );
}
