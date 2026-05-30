import type { WorkerProps } from "alchemy/Cloudflare";

export const ceirdWorkerCompatibility = {
  date: "2026-04-30",
  flags: ["nodejs_compat"],
} satisfies NonNullable<WorkerProps["compatibility"]>;

export const ceirdWorkerTelemetryHeadSamplingRate = 0.1;

export const ceirdWorkerObservability = {
  enabled: true,
  logs: {
    enabled: true,
    headSamplingRate: ceirdWorkerTelemetryHeadSamplingRate,
    invocationLogs: true,
  },
  traces: {
    enabled: true,
    headSamplingRate: ceirdWorkerTelemetryHeadSamplingRate,
  },
} satisfies NonNullable<WorkerProps["observability"]>;

export const ceirdDomainWorkerPlacement = {
  mode: "smart",
} satisfies NonNullable<WorkerProps["placement"]>;
