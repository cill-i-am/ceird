import {
  FetchHttpClient,
  HttpApiClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { JobsApi } from "@task-tracker/jobs-core";
import { Cause, Effect, Exit, Layer } from "effect";

import { resolveApiOrigin } from "#/lib/api-origin";

import {
  JobsApiOriginResolutionError,
  normalizeJobsError,
} from "./jobs-errors";

export interface JobsClientOptions {
  readonly requestOrigin?: string | undefined;
  readonly apiOrigin?: string | undefined;
  readonly cookie?: string | undefined;
  readonly forwardedHeaders?:
    | {
        readonly "x-forwarded-host": string;
        readonly "x-forwarded-proto": "http" | "https";
      }
    | undefined;
}

export function resolveJobsApiOrigin(
  options: JobsClientOptions = {}
): string | undefined {
  return resolveApiOrigin(options.requestOrigin, options.apiOrigin);
}

export function makeJobsClient(options: JobsClientOptions = {}) {
  const apiOrigin = resolveJobsApiOrigin(options);

  if (!apiOrigin) {
    return Effect.fail(
      new JobsApiOriginResolutionError({
        message: "Cannot resolve the jobs API origin.",
      })
    );
  }

  return HttpApiClient.make(JobsApi, {
    baseUrl: apiOrigin,
    transformClient: (httpClient) => withOptionalCookie(httpClient, options),
  });
}

export type JobsApiClient = Effect.Effect.Success<
  ReturnType<typeof makeJobsClient>
>;

export function makeBrowserJobsClient(origin?: string | undefined) {
  const requestOrigin =
    origin ??
    (typeof window === "undefined" ? undefined : window.location.origin);

  return makeJobsClient({ requestOrigin });
}

export function makeServerJobsClient(options: JobsClientOptions) {
  return makeJobsClient(options);
}

export const BrowserJobsHttpClientLive = Layer.mergeAll(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.RequestInit, {
    credentials: "include" as const,
  })
);

export function provideBrowserJobsHttp<A, E, R>(
  effect: Effect.Effect<A, E, R>
) {
  return effect.pipe(Effect.provide(BrowserJobsHttpClientLive));
}

export async function runJobsClient<Response>(
  options: JobsClientOptions,
  execute: (client: JobsApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  const exit = await Effect.gen(function* () {
    const client = yield* makeJobsClient(options);
    return yield* execute(client);
  }).pipe(
    Effect.mapError(normalizeJobsError),
    Effect.provide(FetchHttpClient.layer),
    Effect.runPromiseExit
  );

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}

function withOptionalCookie(
  httpClient: HttpClient.HttpClient,
  options: JobsClientOptions
): HttpClient.HttpClient {
  if (!options.cookie && !options.forwardedHeaders) {
    return httpClient;
  }

  return httpClient.pipe(
    HttpClient.mapRequest((request) => {
      let nextRequest = request;

      if (options.cookie) {
        nextRequest = HttpClientRequest.setHeader(
          nextRequest,
          "cookie",
          options.cookie
        );
      }

      if (options.forwardedHeaders) {
        nextRequest = HttpClientRequest.setHeader(
          nextRequest,
          "x-forwarded-host",
          options.forwardedHeaders["x-forwarded-host"]
        );
        nextRequest = HttpClientRequest.setHeader(
          nextRequest,
          "x-forwarded-proto",
          options.forwardedHeaders["x-forwarded-proto"]
        );
      }

      return nextRequest;
    })
  );
}
