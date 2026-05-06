import type { CloudflareOptions } from "@sentry/cloudflare";
import { Config, Effect, HashMap, Logger, Option } from "effect";

export interface ApiSentryConfig {
  readonly dsn: Option.Option<string>;
  readonly environment: string;
  readonly release: Option.Option<string>;
  readonly tracesSampleRate: number;
}

export type ApiSentryOptions = Pick<
  CloudflareOptions,
  | "beforeSend"
  | "beforeSendLog"
  | "dsn"
  | "enableMetrics"
  | "enableLogs"
  | "environment"
  | "release"
  | "tracesSampleRate"
>;

interface ApiSentryWorkerEnv {
  readonly NODE_ENV?: string;
  readonly SENTRY_DSN?: string;
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
  readonly SENTRY_TRACES_SAMPLE_RATE?: string;
}

interface ApiSentryLoggerSink {
  readonly debug: (
    message: string,
    attributes?: Record<string, unknown>
  ) => void;
  readonly error: (
    message: string,
    attributes?: Record<string, unknown>
  ) => void;
  readonly fatal: (
    message: string,
    attributes?: Record<string, unknown>
  ) => void;
  readonly info: (
    message: string,
    attributes?: Record<string, unknown>
  ) => void;
  readonly trace: (
    message: string,
    attributes?: Record<string, unknown>
  ) => void;
  readonly warn: (
    message: string,
    attributes?: Record<string, unknown>
  ) => void;
}

const rawApiSentryConfig = Config.all({
  dsn: Config.string("SENTRY_DSN").pipe(Config.option),
  environment: Config.string("SENTRY_ENVIRONMENT").pipe(Config.option),
  nodeEnv: Config.string("NODE_ENV").pipe(Config.withDefault("development")),
  release: Config.string("SENTRY_RELEASE").pipe(Config.option),
  tracesSampleRate: Config.number("SENTRY_TRACES_SAMPLE_RATE").pipe(
    Config.withDefault(1),
    Config.validate({
      message: "SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1",
      validation: isValidTracesSampleRate,
    })
  ),
});

export const loadApiSentryConfig = rawApiSentryConfig.pipe(
  Effect.map(({ dsn, environment, nodeEnv, release, tracesSampleRate }) => ({
    dsn: nonEmptyOption(dsn),
    environment: Option.getOrElse(nonEmptyOption(environment), () => nodeEnv),
    release: nonEmptyOption(release),
    tracesSampleRate,
  }))
);

export function makeSentryOptions(config: ApiSentryConfig): ApiSentryOptions {
  return {
    beforeSend: scrubApiSentryEvent,
    beforeSendLog: scrubApiSentryLog,
    dsn: Option.getOrUndefined(config.dsn),
    enableMetrics: true,
    enableLogs: true,
    environment: config.environment,
    release: Option.getOrUndefined(config.release),
    tracesSampleRate: config.tracesSampleRate,
  };
}

export function apiSentryConfigFromWorkerEnv(
  env: ApiSentryWorkerEnv
): ApiSentryConfig {
  return {
    dsn: stringOption(env.SENTRY_DSN),
    environment:
      stringOptionValue(env.SENTRY_ENVIRONMENT) ??
      stringOptionValue(env.NODE_ENV) ??
      "development",
    release: stringOption(env.SENTRY_RELEASE),
    tracesSampleRate: parseTracesSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
  };
}

export function isApiSentryEnabled(config: ApiSentryConfig) {
  return Option.isSome(config.dsn);
}

export function makeApiSentryEffectLogger(logger: ApiSentryLoggerSink) {
  return Logger.make(({ logLevel, message, annotations }) => {
    const formatted = formatApiSentryLogMessage(message);
    const attributes = scrubSentryRecord({
      ...hashMapToRecord(annotations),
      ...formatted.attributes,
    });
    const tag = typeof logLevel === "string" ? logLevel : logLevel._tag;

    switch (tag) {
      case "Fatal": {
        logger.fatal(formatted.message, attributes);
        break;
      }
      case "Error": {
        logger.error(formatted.message, attributes);
        break;
      }
      case "Warning": {
        logger.warn(formatted.message, attributes);
        break;
      }
      case "Info": {
        logger.info(formatted.message, attributes);
        break;
      }
      case "Debug": {
        logger.debug(formatted.message, attributes);
        break;
      }
      case "Trace": {
        logger.trace(formatted.message, attributes);
        break;
      }
      default: {
        break;
      }
    }
  });
}

function nonEmptyOption(option: Option.Option<string>) {
  return Option.isSome(option) ? stringOption(option.value) : Option.none();
}

function stringOption(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? Option.some(trimmed) : Option.none<string>();
}

function stringOptionValue(value: string | undefined) {
  return Option.getOrUndefined(stringOption(value));
}

function parseTracesSampleRate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 1;
  }
  const rate = Number(trimmed);
  return isValidTracesSampleRate(rate) ? rate : 1;
}

function isValidTracesSampleRate(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

type ApiSentryEvent = Parameters<
  NonNullable<CloudflareOptions["beforeSend"]>
>[0];
type ApiSentryLog = Parameters<
  NonNullable<CloudflareOptions["beforeSendLog"]>
>[0];

export function scrubApiSentryEvent(event: ApiSentryEvent): ApiSentryEvent {
  if (event.request?.url) {
    event.request.url = stripUrlQuery(event.request.url);
  }
  if (event.request) {
    delete event.request.query_string;
    delete event.request.cookies;
  }

  event.extra = scrubSentryRecord(event.extra);
  event.tags = scrubSentryRecord(event.tags);
  event.contexts = scrubSentryRecord(event.contexts);

  return event;
}

export function scrubApiSentryLog(log: ApiSentryLog): ApiSentryLog {
  log.message = scrubSentryMessage(log.message);

  if (log.attributes) {
    log.attributes = scrubSentryRecord(log.attributes);
  }

  return log;
}

function scrubSentryRecord<T extends Record<string, unknown> | undefined>(
  record: T
): T {
  if (!record) {
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      scrubSentryKeyValue(key, value),
    ])
  ) as T;
}

function scrubSentryKeyValue(key: string, value: unknown): unknown {
  if (isSensitiveSentryKey(key)) {
    return "[Filtered]";
  }
  return scrubSentryValue(value);
}

function scrubSentryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubSentryValue);
  }
  if (isRecord(value)) {
    return scrubSentryRecord(value);
  }
  if (typeof value === "string") {
    return stripUrlQuery(value);
  }
  return value;
}

function isSensitiveSentryKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized === "deliverykey" ||
    normalized.endsWith("deliverykey") ||
    normalized === "authemailqueuedeliverykey" ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password")
  );
}

function stripUrlQuery(value: string) {
  if (!value.includes("?")) {
    return value;
  }

  try {
    const url = new URL(value);
    url.search = "";
    return url.toString();
  } catch {
    return value.split("?")[0] ?? value;
  }
}

export function formatApiSentryLogMessage(message: unknown) {
  if (typeof message === "string") {
    return { attributes: {}, message: scrubSentryMessage(message) };
  }

  if (Array.isArray(message) && typeof message[0] === "string") {
    const attributes = Object.assign(
      {},
      ...message.slice(1).filter(isRecord).map(scrubSentryRecord)
    ) as Record<string, unknown>;
    return { attributes, message: scrubSentryMessage(message[0]) };
  }

  return {
    attributes: {},
    message: stringifySentryMessage(scrubSentryValue(message)),
  };
}

function scrubSentryMessage(message: string) {
  const parsed = parseJsonMessage(message);
  if (Option.isSome(parsed)) {
    return stringifySentryMessage(scrubSentryValue(parsed.value));
  }
  return stripUrlQuery(message);
}

function parseJsonMessage(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return Option.none<unknown>();
  }

  try {
    return Option.some(JSON.parse(trimmed) as unknown);
  } catch {
    return Option.none<unknown>();
  }
}

function stringifySentryMessage(value: unknown) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hashMapToRecord(hashMap: HashMap.HashMap<string, unknown>) {
  return Object.fromEntries(HashMap.toEntries(hashMap));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
