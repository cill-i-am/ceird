import * as Sentry from "@sentry/cloudflare";
import type { Register } from "@tanstack/react-router";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import type { RequestHandler } from "@tanstack/react-start/server";

import type { AppCloudflareSentryEnv } from "./sentry-cloudflare";
import { makeAppCloudflareSentryOptions } from "./sentry-cloudflare";

const startFetch = createStartHandler<Register>(defaultStreamHandler);
type FetchOptions = Parameters<typeof startFetch>[1];
const SENTRY_BROWSER_PROFILING_DOCUMENT_POLICY = "js-profiling";

export interface ServerEntry {
  readonly fetch: RequestHandler<Register>;
}

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return withSentryBrowserProfilingPolicy(await entry.fetch(...args));
    },
  };
}

const serverEntry = createServerEntry({
  fetch(request, opts) {
    return startFetch(request, isFetchOptions(opts) ? opts : undefined);
  },
});

const appWorkerHandler = {
  fetch(request: Request) {
    return serverEntry.fetch(request);
  },
};

export default Sentry.withSentry<AppCloudflareSentryEnv>(
  makeAppCloudflareSentryOptions,
  appWorkerHandler
);

function isFetchOptions(opts: unknown): opts is FetchOptions {
  return opts === undefined || (typeof opts === "object" && opts !== null);
}

function withSentryBrowserProfilingPolicy(response: Response) {
  const nextResponse = new Response(response.body, response);
  nextResponse.headers.set(
    "Document-Policy",
    SENTRY_BROWSER_PROFILING_DOCUMENT_POLICY
  );
  return nextResponse;
}
