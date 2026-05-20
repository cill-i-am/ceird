import type { WorkerProps } from "alchemy/Cloudflare";

export const ceirdWorkerCompatibility = {
  date: "2026-04-30",
  flags: ["nodejs_compat"],
} satisfies NonNullable<WorkerProps["compatibility"]>;

export const ceirdWorkerObservability = {
  enabled: true,
  logs: {
    enabled: true,
    invocationLogs: true,
  },
  traces: {
    enabled: true,
  },
} satisfies NonNullable<WorkerProps["observability"]>;
