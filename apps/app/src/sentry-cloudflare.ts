import type { CloudflareOptions } from "@sentry/cloudflare";

import {
  SENTRY_DSN,
  sanitizeSentryEvent,
  sanitizeSentryLog,
  sanitizeSentrySpan,
} from "./sentry-config";

export interface AppCloudflareSentryEnv {
  readonly NODE_ENV?: string;
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
  readonly SENTRY_TRACES_SAMPLE_RATE?: string;
}

export function makeAppCloudflareSentryOptions(
  env?: AppCloudflareSentryEnv
): CloudflareOptions {
  const sentryEnv = env ?? {};

  return {
    beforeSend: (event) => sanitizeSentryEvent(event),
    beforeSendLog: (log) => sanitizeSentryLog(log),
    beforeSendSpan: (span) => sanitizeSentrySpan(span),
    beforeSendTransaction: (event) => sanitizeSentryEvent(event),
    dsn: SENTRY_DSN,
    enableLogs: true,
    environment:
      normalizeSentryString(sentryEnv.SENTRY_ENVIRONMENT) ??
      normalizeSentryString(sentryEnv.NODE_ENV) ??
      "development",
    release: normalizeSentryString(sentryEnv.SENTRY_RELEASE),
    tracesSampleRate: parseSentrySampleRate(
      sentryEnv.SENTRY_TRACES_SAMPLE_RATE
    ),
  };
}

function normalizeSentryString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseSentrySampleRate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 1;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
}
