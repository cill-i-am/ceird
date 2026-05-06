import type { BrowserOptions, NodeOptions } from "@sentry/tanstackstart-react";

export const SENTRY_DSN =
  "https://a6db1d95f474e8443fa3435bb95eed76@o368240.ingest.us.sentry.io/4511339382964224";

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
  readonly apiOrigin?: string | undefined;
  readonly environment: string;
  readonly feedbackIntegration: BrowserIntegration;
  readonly profilingIntegration: BrowserIntegration;
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
    integrations: [
      input.tracingIntegration,
      input.replayIntegration,
      input.feedbackIntegration,
      input.profilingIntegration,
    ],
    profilesSampleRate: sampleRates.profiles,
    replaysOnErrorSampleRate: sampleRates.replayOnError,
    replaysSessionSampleRate: sampleRates.replaySession,
    tracePropagationTargets: createSentryTracePropagationTargets(
      input.apiOrigin
    ),
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

export function createSentryTracePropagationTargets(apiOrigin?: string) {
  const targets: (string | RegExp)[] = [
    "https://api.ceird.app",
    /^https:\/\/(?:[a-z0-9-]+\.)?api\.ceird\.localhost(?::\d+)?(?:\/|$)/,
    /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/,
  ];
  const normalizedApiOrigin = normalizeOrigin(apiOrigin);

  if (
    normalizedApiOrigin &&
    !targets.some(
      (target) => typeof target === "string" && target === normalizedApiOrigin
    )
  ) {
    targets.unshift(normalizedApiOrigin);
  }

  return targets;
}

interface SentryRouteContextInput {
  readonly activeOrganizationId?: string | null | undefined;
  readonly currentOrganizationRole?: string | undefined;
  readonly userId: string;
}

interface SentryRouteContextSink {
  readonly setTag: (key: string, value: string | undefined) => void;
  readonly setUser: (user: { readonly id: string }) => void;
}

export function applySentryRouteContext(
  sentry: SentryRouteContextSink,
  context: SentryRouteContextInput
) {
  sentry.setUser({ id: context.userId });
  sentry.setTag(
    "ceird.organization_id",
    context.activeOrganizationId ?? undefined
  );
  sentry.setTag("ceird.organization_role", context.currentOrganizationRole);
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

function normalizeOrigin(origin: string | undefined) {
  if (!origin) {
    return;
  }

  try {
    return new URL(origin).origin;
  } catch {
    // Invalid configured origins are ignored; static production/local targets remain.
  }
}

function getSentrySampleRates(environment: string) {
  const isProduction = environment === "production";
  return {
    profiles: 1,
    replayOnError: 1,
    replaySession: isProduction ? 0.05 : 0.1,
    traces: 1,
  } as const;
}
