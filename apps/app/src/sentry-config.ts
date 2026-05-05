import type { BrowserOptions, NodeOptions } from "@sentry/tanstackstart-react";

export const SENTRY_DSN =
  "https://3917e2b6a24f49a20d625a1e3b2b1674@o368240.ingest.us.sentry.io/4511339367563264";

const SENSITIVE_QUERY_PARAMS = new Set([
  "code",
  "invitation",
  "state",
  "token",
]);

type BrowserIntegration = Extract<
  NonNullable<BrowserOptions["integrations"]>,
  readonly unknown[]
>[number];

export interface ClientSentryOptionsInput {
  readonly environment: string;
  readonly replayIntegration: BrowserIntegration;
  readonly tracingIntegration: BrowserIntegration;
}

export interface ServerSentryOptionsInput {
  readonly environment: string;
}

export function createClientSentryOptions(
  input: ClientSentryOptionsInput
): BrowserOptions {
  const sampleRates = getSentrySampleRates(input.environment);

  return {
    beforeSend: (event) => sanitizeSentryEvent(event),
    beforeSendLog: (log) => sanitizeSentryLog(log),
    beforeSendSpan: (span) => sanitizeSentrySpan(span),
    beforeSendTransaction: (event) => sanitizeSentryEvent(event),
    dsn: SENTRY_DSN,
    enableLogs: true,
    environment: input.environment,
    integrations: [input.tracingIntegration, input.replayIntegration],
    replaysOnErrorSampleRate: sampleRates.replayOnError,
    replaysSessionSampleRate: sampleRates.replaySession,
    tracesSampleRate: sampleRates.traces,
  };
}

export function createServerSentryOptions(
  input: ServerSentryOptionsInput
): NodeOptions {
  const sampleRates = getSentrySampleRates(input.environment);

  return {
    beforeSend: (event) => sanitizeSentryEvent(event),
    beforeSendLog: (log) => sanitizeSentryLog(log),
    beforeSendSpan: (span) => sanitizeSentrySpan(span),
    beforeSendTransaction: (event) => sanitizeSentryEvent(event),
    dsn: SENTRY_DSN,
    enableLogs: true,
    environment: input.environment,
    tracesSampleRate: sampleRates.traces,
  };
}

type SentryEvent =
  | Parameters<NonNullable<BrowserOptions["beforeSend"]>>[0]
  | Parameters<NonNullable<BrowserOptions["beforeSendTransaction"]>>[0];

type SentryLog = Parameters<NonNullable<BrowserOptions["beforeSendLog"]>>[0];
type SentrySpan = Parameters<NonNullable<BrowserOptions["beforeSendSpan"]>>[0];
type QueryString = NonNullable<
  NonNullable<SentryEvent["request"]>["query_string"]
>;

export function sanitizeSentryEvent<TEvent extends SentryEvent>(
  event: TEvent
): TEvent {
  return {
    ...event,
    breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
      ...breadcrumb,
      data: sanitizeRecordValues(breadcrumb.data),
      message: sanitizeUrlText(breadcrumb.message),
    })),
    request: event.request
      ? {
          ...event.request,
          query_string: sanitizeQueryString(event.request.query_string),
          url: sanitizeUrlText(event.request.url),
        }
      : undefined,
    spans: event.spans?.map(sanitizeSentrySpan),
    transaction: sanitizeUrlText(event.transaction),
  };
}

export function sanitizeSentryLog(log: SentryLog): SentryLog {
  return {
    ...log,
    attributes: sanitizeRecordValues(log.attributes),
  };
}

export function sanitizeSentrySpan(span: SentrySpan): SentrySpan {
  return {
    ...span,
    data: sanitizeRecordValues(span.data) ?? {},
    description: sanitizeUrlText(span.description),
  };
}

export function sanitizeReplayRecordingEvent<TEvent>(event: TEvent): TEvent {
  return sanitizeUnknown(event) as TEvent;
}

function sanitizeRecordValues<TRecord extends Record<string, unknown>>(
  record: TRecord | undefined
): TRecord | undefined {
  if (!record) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      sanitizeRecordValue(key, value),
    ])
  ) as TRecord;
}

function sanitizeRecordValue(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase();
  if (typeof value === "string") {
    if (normalizedKey.includes("url") || normalizedKey.includes("target")) {
      return sanitizeUrlText(value);
    }
    if (normalizedKey.includes("query")) {
      return sanitizeQueryText(value);
    }
  }

  return sanitizeUnknown(value);
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeUrlText(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeUnknown);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      sanitizeRecordValue(key, nestedValue),
    ])
  );
}

function sanitizeQueryString(queryString: QueryString | undefined) {
  if (typeof queryString === "string") {
    return sanitizeQueryText(queryString);
  }

  if (Array.isArray(queryString)) {
    return queryString.map(([key, value]) => [
      key,
      shouldRedactQueryParam(key) ? "[Filtered]" : value,
    ]);
  }

  if (queryString) {
    return Object.fromEntries(
      Object.entries(queryString).map(([key, value]) => [
        key,
        shouldRedactQueryParam(key) ? "[Filtered]" : value,
      ])
    );
  }

  return queryString;
}

function sanitizeUrlText(value: string | undefined) {
  if (!value) {
    return value;
  }

  return value.replaceAll(
    /((?:https?:\/\/|\/)[^\s"'<>?#]+)\?([^\s"'<>#]*)(#[^\s"'<>]*)?/g,
    (_match, base: string, query: string, hash: string | undefined) => {
      const sanitizedQuery = sanitizeQueryText(query);
      const sanitizedHash = hash ?? "";
      return sanitizedQuery
        ? `${base}?${sanitizedQuery}${sanitizedHash}`
        : `${base}${sanitizedHash}`;
    }
  );
}

function sanitizeQueryText(queryText: string) {
  const params = new URLSearchParams(
    queryText.startsWith("?") ? queryText.slice(1) : queryText
  );
  for (const key of params.keys()) {
    if (shouldRedactQueryParam(key)) {
      params.set(key, "[Filtered]");
    }
  }
  return params.toString();
}

function shouldRedactQueryParam(key: string) {
  return SENSITIVE_QUERY_PARAMS.has(key.toLowerCase());
}

function getSentrySampleRates(environment: string) {
  const isProduction = environment === "production";
  return {
    replayOnError: 1,
    replaySession: isProduction ? 0.05 : 0.1,
    traces: isProduction ? 0.2 : 1,
  } as const;
}
