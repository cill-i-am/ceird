import * as Cloudflare from "alchemy/Cloudflare";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import type { Resource as ResourceShape } from "alchemy/Resource";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

export interface TenantWorkerRoutePayloadInput {
  readonly pattern: string;
  readonly scriptName: string | undefined;
}

export interface TenantWildcardDnsRecordProps {
  readonly zoneName: string;
}

export interface TenantWildcardDnsRecordAttributes {
  readonly recordId: string;
  readonly zoneId: string;
  readonly zoneName: string;
}

export interface TenantWorkerRouteProps {
  readonly pattern: string;
  readonly scriptName?: string | undefined;
  readonly zoneName: string;
}

export interface TenantWorkerRouteAttributes {
  readonly pattern: string;
  readonly routeId: string;
  readonly scriptName?: string | undefined;
  readonly zoneId: string;
}

export type TenantWildcardDnsRecord = ResourceShape<
  "Ceird.CloudflareTenantWildcardDnsRecord",
  TenantWildcardDnsRecordProps,
  TenantWildcardDnsRecordAttributes
>;

export type TenantWorkerRoute = ResourceShape<
  "Ceird.CloudflareTenantWorkerRoute",
  TenantWorkerRouteProps,
  TenantWorkerRouteAttributes
>;

export const TenantWildcardDnsRecord = Resource<TenantWildcardDnsRecord>(
  "Ceird.CloudflareTenantWildcardDnsRecord"
);

export const TenantWorkerRoute = Resource<TenantWorkerRoute>(
  "Ceird.CloudflareTenantWorkerRoute"
);

export function makeCloudflareTenantDnsRecordPayload(_zoneName: string) {
  return {
    content: "192.0.2.0",
    name: "*",
    proxied: true,
    ttl: 1,
    type: "A",
  } as const;
}

export function makeCloudflareTenantWorkerRoutePayload(
  input: TenantWorkerRoutePayloadInput
) {
  if (input.scriptName === undefined) {
    return { pattern: input.pattern };
  }

  return {
    pattern: input.pattern,
    script: input.scriptName,
  };
}

export function validateTenantRoutePattern(input: {
  readonly pattern: string;
  readonly zoneName: string;
}) {
  const pattern = input.pattern.toLowerCase();
  const zoneName = input.zoneName.toLowerCase();

  if (!pattern.startsWith("*")) {
    return input.pattern;
  }

  const productionWildcardPattern = `*.${zoneName}/*`;
  const stagedWildcardPattern = new RegExp(
    `^\\*--[a-z0-9-]+\\.${escapeRegExp(zoneName)}/\\*$`
  );

  if (
    pattern === productionWildcardPattern ||
    stagedWildcardPattern.test(pattern)
  ) {
    return input.pattern;
  }

  throw new Error(
    `Tenant wildcard route pattern "${input.pattern}" must stay inside zone "${input.zoneName}".`
  );
}

interface CloudflareApiTokenCredentials {
  readonly apiBaseUrl: string;
  readonly apiToken: Redacted.Redacted<string>;
  readonly type: "apiToken";
}

interface CloudflareApiKeyCredentials {
  readonly apiBaseUrl: string;
  readonly apiKey: Redacted.Redacted<string>;
  readonly email: string;
  readonly type: "apiKey";
}

interface CloudflareOAuthCredentials {
  readonly accessToken: Redacted.Redacted<string>;
  readonly apiBaseUrl: string;
  readonly type: "oauth";
}

type CloudflareApiCredentials =
  | CloudflareApiKeyCredentials
  | CloudflareApiTokenCredentials
  | CloudflareOAuthCredentials;

interface CloudflareApiErrorDetails {
  readonly code?: number;
  readonly message?: string;
}

interface CloudflareBaseResponse {
  readonly errors?: readonly CloudflareApiErrorDetails[];
  readonly success: boolean;
}

interface CloudflareItemResponse<T> extends CloudflareBaseResponse {
  readonly result?: T;
}

interface CloudflareListResponse<T> extends CloudflareBaseResponse {
  readonly result?: readonly T[];
}

interface CloudflareZoneResult {
  readonly account?: { readonly id?: string | null } | null;
  readonly id: string;
  readonly name: string;
}

interface CloudflareDnsRecordResult {
  readonly content?: string | null;
  readonly id: string;
  readonly name?: string | null;
  readonly proxied?: boolean | null;
  readonly ttl?: number | null;
  readonly type?: string | null;
}

interface CloudflareWorkerRouteResult {
  readonly id: string;
  readonly pattern: string;
  readonly script?: string | null | undefined;
}

interface CloudflareTenantRoutingRequestInput {
  readonly body?: unknown;
  readonly credentials: CloudflareApiCredentials;
  readonly method: "DELETE" | "GET" | "POST" | "PUT";
  readonly path: string;
}

class CloudflareTenantRoutingApiError extends Error {
  readonly status: number | undefined;

  constructor(input: {
    readonly body: unknown;
    readonly method: string;
    readonly path: string;
    readonly status: number | undefined;
  }) {
    super(
      makeCloudflareTenantRoutingApiErrorMessage({
        body: input.body,
        method: input.method,
        path: input.path,
        status: input.status,
      })
    );
    this.name = "CloudflareTenantRoutingApiError";
    this.status = input.status;
  }
}

export const TenantWildcardDnsRecordProvider = () =>
  Provider.effect(
    TenantWildcardDnsRecord,
    Effect.succeed(
      TenantWildcardDnsRecord.Provider.of({
        stables: ["recordId", "zoneId"],
        diff: Effect.fn("TenantWildcardDnsRecord.diff")(function* ({
          news,
          output,
        }) {
          if (!output || !isResolved(news)) {
            return;
          }

          const client = yield* makeCloudflareTenantRoutingClient();
          const zoneId = yield* resolveCloudflareZoneId({
            client,
            zoneName: news.zoneName,
          });

          if (zoneId !== output.zoneId) {
            return { action: "replace" } as const;
          }
        }),
        read: Effect.fn("TenantWildcardDnsRecord.read")(function* ({
          olds,
          output,
        }) {
          const zoneName = output?.zoneName ?? olds.zoneName;
          const client = yield* makeCloudflareTenantRoutingClient();
          const zoneId =
            output?.zoneId ??
            (yield* resolveCloudflareZoneId({ client, zoneName }));
          const record =
            output?.recordId === undefined
              ? yield* findCloudflareTenantDnsRecord({
                  client,
                  zoneId,
                  zoneName,
                })
              : yield* readCloudflareDnsRecord({
                  client,
                  recordId: output.recordId,
                  zoneId,
                });

          if (!record) {
            return;
          }

          return {
            recordId: record.id,
            zoneId,
            zoneName,
          };
        }),
        reconcile: Effect.fn("TenantWildcardDnsRecord.reconcile")(function* ({
          news,
          output,
        }) {
          const client = yield* makeCloudflareTenantRoutingClient();
          const zoneId = yield* resolveCloudflareZoneId({
            client,
            zoneName: news.zoneName,
          });
          const payload = makeCloudflareTenantDnsRecordPayload(news.zoneName);
          const savedRecord =
            output?.recordId === undefined
              ? undefined
              : yield* readCloudflareDnsRecord({
                  client,
                  recordId: output.recordId,
                  zoneId,
                });
          const existingRecord =
            savedRecord ??
            (yield* findCloudflareTenantDnsRecord({
              client,
              zoneId,
              zoneName: news.zoneName,
            }));
          const record =
            existingRecord === undefined
              ? yield* createCloudflareDnsRecord({ client, payload, zoneId })
              : yield* updateCloudflareDnsRecord({
                  client,
                  payload,
                  recordId: existingRecord.id,
                  zoneId,
                });

          return {
            recordId: record.id,
            zoneId,
            zoneName: news.zoneName,
          };
        }),
        delete: Effect.fn("TenantWildcardDnsRecord.delete")(function* ({
          output,
        }) {
          const client = yield* makeCloudflareTenantRoutingClient();
          const record = yield* readCloudflareDnsRecord({
            client,
            recordId: output.recordId,
            zoneId: output.zoneId,
          });

          if (
            !record ||
            !isManagedTenantWildcardDnsRecord(record, output.zoneName)
          ) {
            return;
          }

          yield* deleteCloudflareDnsRecord({
            client,
            recordId: record.id,
            zoneId: output.zoneId,
          });
        }),
      })
    )
  );

export const TenantWorkerRouteProvider = () =>
  Provider.effect(
    TenantWorkerRoute,
    Effect.succeed(
      TenantWorkerRoute.Provider.of({
        stables: ["routeId", "zoneId"],
        diff: Effect.fn("TenantWorkerRoute.diff")(function* ({ news, output }) {
          if (!output || !isResolved(news)) {
            return;
          }

          const client = yield* makeCloudflareTenantRoutingClient();
          const zoneId = yield* resolveCloudflareZoneId({
            client,
            zoneName: news.zoneName,
          });

          if (zoneId !== output.zoneId) {
            return { action: "replace" } as const;
          }
        }),
        read: Effect.fn("TenantWorkerRoute.read")(function* ({ olds, output }) {
          const { zoneName } = olds;
          const client = yield* makeCloudflareTenantRoutingClient();
          const zoneId =
            output?.zoneId ??
            (yield* resolveCloudflareZoneId({ client, zoneName }));
          const route =
            output?.routeId === undefined
              ? yield* findCloudflareWorkerRoute({
                  client,
                  pattern: olds.pattern,
                  zoneId,
                })
              : yield* readCloudflareWorkerRoute({
                  client,
                  routeId: output.routeId,
                  zoneId,
                });

          return route === undefined
            ? undefined
            : makeTenantWorkerRouteAttributes({ route, zoneId });
        }),
        reconcile: Effect.fn("TenantWorkerRoute.reconcile")(function* ({
          news,
          output,
        }) {
          validateTenantRoutePattern({
            pattern: news.pattern,
            zoneName: news.zoneName,
          });

          const client = yield* makeCloudflareTenantRoutingClient();
          const zoneId = yield* resolveCloudflareZoneId({
            client,
            zoneName: news.zoneName,
          });
          const payload = makeCloudflareTenantWorkerRoutePayload({
            pattern: news.pattern,
            scriptName: news.scriptName,
          });
          const savedRoute =
            output?.routeId === undefined
              ? undefined
              : yield* readCloudflareWorkerRoute({
                  client,
                  routeId: output.routeId,
                  zoneId,
                });
          const existingRoute =
            savedRoute ??
            (yield* findCloudflareWorkerRoute({
              client,
              pattern: news.pattern,
              zoneId,
            }));
          const route =
            existingRoute === undefined
              ? yield* createCloudflareWorkerRoute({
                  client,
                  payload,
                  zoneId,
                })
              : yield* updateCloudflareWorkerRoute({
                  client,
                  payload,
                  routeId: existingRoute.id,
                  zoneId,
                });

          return makeTenantWorkerRouteAttributes({ route, zoneId });
        }),
        delete: Effect.fn("TenantWorkerRoute.delete")(function* ({ output }) {
          const client = yield* makeCloudflareTenantRoutingClient();
          yield* deleteCloudflareWorkerRoute({
            client,
            routeId: output.routeId,
            zoneId: output.zoneId,
          });
        }),
      })
    )
  );

function makeCloudflareTenantRoutingClient() {
  return Effect.gen(function* () {
    const { accountId } = yield* Cloudflare.CloudflareEnvironment;
    const credentialsEffect = yield* Cloudflare.Credentials;
    const credentials = yield* credentialsEffect;

    return {
      accountId,
      credentials: credentials as CloudflareApiCredentials,
    };
  });
}

type CloudflareTenantRoutingClient = Effect.Success<
  ReturnType<typeof makeCloudflareTenantRoutingClient>
>;

function makeCloudflareTenantRoutingApiErrorMessage(input: {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
  readonly status: number | undefined;
}) {
  const response = input.body as
    | { readonly errors?: readonly CloudflareApiErrorDetails[] }
    | null
    | undefined;
  const details = response?.errors
    ?.map((error) => error.message)
    .filter((message): message is string => typeof message === "string")
    .join(", ");
  const status = input.status === undefined ? "" : ` ${input.status}`;

  return [
    `Cloudflare API ${input.method} ${input.path} failed${status}.`,
    details,
  ]
    .filter(Boolean)
    .join(" ");
}

function makeCloudflareAuthHeaders(
  credentials: CloudflareApiCredentials
): Record<string, string> {
  switch (credentials.type) {
    case "apiKey": {
      return {
        "X-Auth-Email": credentials.email,
        "X-Auth-Key": Redacted.value(credentials.apiKey),
      };
    }
    case "apiToken": {
      return {
        Authorization: `Bearer ${Redacted.value(credentials.apiToken)}`,
      };
    }
    case "oauth": {
      return {
        Authorization: `Bearer ${Redacted.value(credentials.accessToken)}`,
      };
    }
    default: {
      const unsupportedCredentials: never = credentials;
      throw new Error(
        `Unsupported Cloudflare credential type: ${JSON.stringify(unsupportedCredentials)}.`
      );
    }
  }
}

function cloudflareApiRequest<T extends CloudflareBaseResponse>(
  input: CloudflareTenantRoutingRequestInput
) {
  return Effect.tryPromise({
    try: async () => {
      const headers: Record<string, string> = {
        ...makeCloudflareAuthHeaders(input.credentials),
      };

      if (input.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(
        `${input.credentials.apiBaseUrl}${input.path}`,
        {
          body:
            input.body === undefined ? undefined : JSON.stringify(input.body),
          headers,
          method: input.method,
        }
      );
      const body = (await response.json().catch(() => null)) as T | null;

      if (!response.ok || body?.success !== true) {
        throw new CloudflareTenantRoutingApiError({
          body,
          method: input.method,
          path: input.path,
          status: response.status,
        });
      }

      return body;
    },
    catch: (cause) =>
      cause instanceof Error
        ? cause
        : new Error("Cloudflare tenant routing request failed.", { cause }),
  });
}

function catchCloudflareNotFound<A>(
  effect: Effect.Effect<A, Error>
): Effect.Effect<A | undefined, Error> {
  return Effect.matchEffect(effect, {
    onFailure: (error) =>
      error instanceof CloudflareTenantRoutingApiError && error.status === 404
        ? Effect.succeed(Option.none<A>())
        : Effect.fail(error),
    onSuccess: (value) => Effect.succeed(Option.some(value)),
  }).pipe(Effect.map(Option.getOrUndefined));
}

function resolveCloudflareZoneId(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly zoneName: string;
}) {
  const params = new URLSearchParams({
    "account.id": input.client.accountId,
    name: input.zoneName,
    per_page: "1",
  });

  return cloudflareApiRequest<CloudflareListResponse<CloudflareZoneResult>>({
    credentials: input.client.credentials,
    method: "GET",
    path: `/zones?${params.toString()}`,
  }).pipe(
    Effect.flatMap((response) => {
      const zone = response.result?.find(
        (candidate) =>
          candidate.name === input.zoneName &&
          candidate.account?.id === input.client.accountId
      );

      return zone === undefined
        ? Effect.fail(
            new Error(`Cloudflare zone not found for ${input.zoneName}.`)
          )
        : Effect.succeed(zone.id);
    })
  );
}

function findCloudflareTenantDnsRecord(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly zoneId: string;
  readonly zoneName: string;
}) {
  return Effect.gen(function* () {
    const candidateNames = [`*.${input.zoneName}`, "*"];

    for (const name of candidateNames) {
      const params = new URLSearchParams({
        name,
        per_page: "100",
        type: "A",
      });
      const response = yield* cloudflareApiRequest<
        CloudflareListResponse<CloudflareDnsRecordResult>
      >({
        credentials: input.client.credentials,
        method: "GET",
        path: `/zones/${input.zoneId}/dns_records?${params.toString()}`,
      });
      const record = response.result?.find((candidate) =>
        isTenantWildcardDnsRecord(candidate, input.zoneName)
      );

      if (record) {
        return record;
      }
    }
  });
}

function readCloudflareDnsRecord(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly recordId: string;
  readonly zoneId: string;
}) {
  return catchCloudflareNotFound(
    cloudflareApiRequest<CloudflareItemResponse<CloudflareDnsRecordResult>>({
      credentials: input.client.credentials,
      method: "GET",
      path: `/zones/${input.zoneId}/dns_records/${input.recordId}`,
    }).pipe(Effect.map((response) => response.result))
  );
}

function createCloudflareDnsRecord(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly payload: ReturnType<typeof makeCloudflareTenantDnsRecordPayload>;
  readonly zoneId: string;
}) {
  return cloudflareApiRequest<
    CloudflareItemResponse<CloudflareDnsRecordResult>
  >({
    body: input.payload,
    credentials: input.client.credentials,
    method: "POST",
    path: `/zones/${input.zoneId}/dns_records`,
  }).pipe(Effect.flatMap(requireCloudflareResult("create DNS record")));
}

function updateCloudflareDnsRecord(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly payload: ReturnType<typeof makeCloudflareTenantDnsRecordPayload>;
  readonly recordId: string;
  readonly zoneId: string;
}) {
  return cloudflareApiRequest<
    CloudflareItemResponse<CloudflareDnsRecordResult>
  >({
    body: input.payload,
    credentials: input.client.credentials,
    method: "PUT",
    path: `/zones/${input.zoneId}/dns_records/${input.recordId}`,
  }).pipe(Effect.flatMap(requireCloudflareResult("update DNS record")));
}

function deleteCloudflareDnsRecord(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly recordId: string;
  readonly zoneId: string;
}) {
  return catchCloudflareNotFound(
    cloudflareApiRequest<CloudflareItemResponse<Record<string, never>>>({
      credentials: input.client.credentials,
      method: "DELETE",
      path: `/zones/${input.zoneId}/dns_records/${input.recordId}`,
    })
  ).pipe(Effect.asVoid);
}

function isTenantWildcardDnsRecord(
  record: CloudflareDnsRecordResult,
  zoneName: string
) {
  return (
    record.type === "A" &&
    (record.name === `*.${zoneName}` || record.name === "*")
  );
}

function isManagedTenantWildcardDnsRecord(
  record: CloudflareDnsRecordResult,
  zoneName: string
) {
  const payload = makeCloudflareTenantDnsRecordPayload(zoneName);

  return (
    isTenantWildcardDnsRecord(record, zoneName) &&
    record.content === payload.content &&
    record.proxied === payload.proxied &&
    record.ttl === payload.ttl
  );
}

function findCloudflareWorkerRoute(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly pattern: string;
  readonly zoneId: string;
}) {
  const params = new URLSearchParams({ per_page: "100" });

  return cloudflareApiRequest<
    CloudflareListResponse<CloudflareWorkerRouteResult>
  >({
    credentials: input.client.credentials,
    method: "GET",
    path: `/zones/${input.zoneId}/workers/routes?${params.toString()}`,
  }).pipe(
    Effect.map((response) =>
      response.result?.find((route) => route.pattern === input.pattern)
    )
  );
}

function readCloudflareWorkerRoute(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly routeId: string;
  readonly zoneId: string;
}) {
  return catchCloudflareNotFound(
    cloudflareApiRequest<CloudflareItemResponse<CloudflareWorkerRouteResult>>({
      credentials: input.client.credentials,
      method: "GET",
      path: `/zones/${input.zoneId}/workers/routes/${input.routeId}`,
    }).pipe(Effect.map((response) => response.result))
  );
}

function createCloudflareWorkerRoute(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly payload: ReturnType<typeof makeCloudflareTenantWorkerRoutePayload>;
  readonly zoneId: string;
}) {
  return cloudflareApiRequest<
    CloudflareItemResponse<CloudflareWorkerRouteResult>
  >({
    body: input.payload,
    credentials: input.client.credentials,
    method: "POST",
    path: `/zones/${input.zoneId}/workers/routes`,
  }).pipe(Effect.flatMap(requireCloudflareResult("create Worker route")));
}

function updateCloudflareWorkerRoute(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly payload: ReturnType<typeof makeCloudflareTenantWorkerRoutePayload>;
  readonly routeId: string;
  readonly zoneId: string;
}) {
  return cloudflareApiRequest<
    CloudflareItemResponse<CloudflareWorkerRouteResult>
  >({
    body: input.payload,
    credentials: input.client.credentials,
    method: "PUT",
    path: `/zones/${input.zoneId}/workers/routes/${input.routeId}`,
  }).pipe(Effect.flatMap(requireCloudflareResult("update Worker route")));
}

function deleteCloudflareWorkerRoute(input: {
  readonly client: CloudflareTenantRoutingClient;
  readonly routeId: string;
  readonly zoneId: string;
}) {
  return catchCloudflareNotFound(
    cloudflareApiRequest<CloudflareItemResponse<Record<string, never>>>({
      credentials: input.client.credentials,
      method: "DELETE",
      path: `/zones/${input.zoneId}/workers/routes/${input.routeId}`,
    })
  ).pipe(Effect.asVoid);
}

function requireCloudflareResult<T>(operation: string) {
  return (response: CloudflareItemResponse<T>) =>
    response.result === undefined
      ? Effect.fail(new Error(`Cloudflare API did not return ${operation}.`))
      : Effect.succeed(response.result);
}

function makeTenantWorkerRouteAttributes(input: {
  readonly route: CloudflareWorkerRouteResult;
  readonly zoneId: string;
}): TenantWorkerRouteAttributes {
  return {
    pattern: input.route.pattern,
    routeId: input.route.id,
    ...(typeof input.route.script === "string"
      ? { scriptName: input.route.script }
      : {}),
    zoneId: input.zoneId,
  };
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
