import { Context, Effect, Layer } from "effect";

export const defaultWorkerAnalyticsSampleRate = 0.1;

export interface WorkerAnalyticsDataPoint {
  readonly indexes?: string[];
  readonly blobs?: string[];
  readonly doubles?: number[];
}

export interface WorkerAnalyticsDataset {
  writeDataPoint(dataPoint: WorkerAnalyticsDataPoint): void;
}

export interface WorkerAnalyticsEnv {
  readonly ALCHEMY_STACK_NAME?: string | undefined;
  readonly ALCHEMY_STAGE?: string | undefined;
  readonly ANALYTICS?: WorkerAnalyticsDataset | undefined;
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE?: string | undefined;
}

export interface WorkerRequestAnalyticsInput {
  readonly adapter: string;
  readonly durationMs?: number | undefined;
  readonly env: WorkerAnalyticsEnv;
  readonly method: string;
  readonly path: string;
  readonly requestId?: string | undefined;
  readonly sampleSeed?: string | undefined;
  readonly status: number;
}

export type WorkerRequestAnalyticsEvent = Omit<
  WorkerRequestAnalyticsInput,
  "env"
>;

export interface WorkerObservabilityService {
  readonly recordRequest: (
    input: WorkerRequestAnalyticsEvent
  ) => Effect.Effect<void>;
}

export class WorkerObservability extends Context.Service<
  WorkerObservability,
  WorkerObservabilityService
>()("@ceird/worker-observability/WorkerObservability") {
  static recordRequest(input: WorkerRequestAnalyticsEvent) {
    return WorkerObservability.use((service) => service.recordRequest(input));
  }
}

export function makeWorkerObservabilityLive(env: WorkerAnalyticsEnv) {
  return Layer.succeed(
    WorkerObservability,
    WorkerObservability.of({
      recordRequest: Effect.fn("WorkerObservability.recordRequest")((input) => {
        const analyticsInput = {
          ...input,
          env,
          sampleSeed: input.sampleSeed ?? makeWorkerAnalyticsSampleEntropy(),
        };
        const dataPoint = makeWorkerRequestAnalyticsDataPoint(analyticsInput);

        return dataPoint === undefined || env.ANALYTICS === undefined
          ? Effect.void
          : Effect.try({
              catch: (cause) => cause,
              try: () => {
                env.ANALYTICS?.writeDataPoint(dataPoint);
              },
            }).pipe(Effect.ignore);
      }),
    })
  );
}

export function writeWorkerRequestAnalytics(
  input: WorkerRequestAnalyticsInput
) {
  const dataPoint = makeWorkerRequestAnalyticsDataPoint(input);

  if (input.env.ANALYTICS === undefined || dataPoint === undefined) {
    return false;
  }

  try {
    input.env.ANALYTICS.writeDataPoint(dataPoint);
    return true;
  } catch {
    return false;
  }
}

export function makeWorkerRequestAnalyticsDataPoint(
  input: WorkerRequestAnalyticsInput
) {
  const sampleRate = parseWorkerAnalyticsSampleRate(
    input.env.CEIRD_WORKER_ANALYTICS_SAMPLE_RATE
  );

  if (
    !shouldSampleWorkerAnalytics({
      sampleRate,
      seed: makeWorkerAnalyticsSampleSeed(input),
    })
  ) {
    return;
  }

  const stage = runtimeIdentity(input.env.ALCHEMY_STAGE);
  const stackName = runtimeIdentity(input.env.ALCHEMY_STACK_NAME);
  const analyticsPath = normalizeWorkerAnalyticsPath(input.path);

  return {
    indexes: [`${stage}:${input.adapter}`],
    blobs: [
      stage,
      input.adapter,
      input.method,
      analyticsPath,
      statusClass(input.status),
      stackName,
    ],
    doubles:
      input.durationMs === undefined
        ? [input.status]
        : [input.status, normalizeDurationMs(input.durationMs)],
  } satisfies WorkerAnalyticsDataPoint;
}

export function parseWorkerAnalyticsSampleRate(value?: string | undefined) {
  if (value === undefined) {
    return defaultWorkerAnalyticsSampleRate;
  }

  const trimmed = value.trim();
  const parsed = trimmed.length > 0 ? Number(trimmed) : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : defaultWorkerAnalyticsSampleRate;
}

export function shouldSampleWorkerAnalytics(input: {
  readonly sampleRate: number;
  readonly seed: string;
}) {
  if (input.sampleRate <= 0) {
    return false;
  }

  if (input.sampleRate >= 1) {
    return true;
  }

  return hashToUnitInterval(input.seed) < input.sampleRate;
}

export function normalizeWorkerAnalyticsPath(path: string) {
  const pathname = safePathname(path);

  if (
    pathname.startsWith("/agents/ceird-agent/") ||
    pathname.startsWith("/agents/CeirdAgent/")
  ) {
    return "/agents/:agent/:instance";
  }

  const normalized = pathname
    .split("/")
    .map((segment) => normalizePathSegment(segment))
    .join("/");

  return normalized.length <= 120
    ? normalized
    : `${normalized.slice(0, 117)}...`;
}

function makeWorkerAnalyticsSampleSeed(input: WorkerRequestAnalyticsInput) {
  return [
    runtimeIdentity(input.env.ALCHEMY_STAGE),
    input.adapter,
    input.method,
    normalizeWorkerAnalyticsPath(input.path),
    input.requestId ?? input.sampleSeed ?? "",
  ].join(":");
}

function makeWorkerAnalyticsSampleEntropy() {
  const { crypto } = globalThis as { readonly crypto?: Crypto };

  return crypto?.randomUUID?.() ?? String(Math.random());
}

function hashToUnitInterval(value: string) {
  const modulus = 2_147_483_647;
  const multiplier = 48_271;
  let hash = 1;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * multiplier + (value.codePointAt(index) ?? 0)) % modulus;
  }

  return hash / modulus;
}

function normalizeDurationMs(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function runtimeIdentity(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "local";
}

function statusClass(status: number) {
  return `${Math.trunc(status / 100)}xx`;
}

function safePathname(path: string) {
  try {
    return new URL(path).pathname;
  } catch {
    return path.startsWith("/") ? path : `/${path}`;
  }
}

function normalizePathSegment(segment: string) {
  if (segment.length === 0) {
    return "";
  }

  if (
    segment.length > 48 ||
    segment.includes("%") ||
    segment.includes(":") ||
    segment.includes("@") ||
    /^[0-9]+$/.test(segment) ||
    /^[0-9a-f]{8,}$/i.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
    /^(org|user|thread|job|site|session|token)_[A-Za-z0-9_-]+$/.test(segment)
  ) {
    return ":param";
  }

  return segment;
}
