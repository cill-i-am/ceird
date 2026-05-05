import { CloudflareEnvironment } from "alchemy/Cloudflare";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import type { Resource as AlchemyResource } from "alchemy/Resource";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

type CloudflareCredentials = typeof CloudflareEnvironment.Service;

interface HyperdriveApiConfig {
  readonly id: string;
  readonly name: string;
}

export interface HyperdriveOrigin {
  readonly database: string;
  readonly host: string;
  readonly password: Redacted.Redacted<string>;
  readonly port?: number;
  readonly scheme?: "postgres" | "mysql";
  readonly user: string;
}

export interface HyperdriveProps {
  readonly name: string;
  readonly origin: HyperdriveOrigin;
  readonly caching?: { readonly disabled: true };
  readonly delete?: boolean;
}

export interface HyperdriveAttributes {
  readonly accountId: string;
  readonly hyperdriveId: string;
  readonly name: string;
}

export type Hyperdrive = AlchemyResource<
  "Cloudflare.Hyperdrive",
  HyperdriveProps,
  HyperdriveAttributes
>;

export const Hyperdrive = Resource<Hyperdrive>("Cloudflare.Hyperdrive");

export const HyperdriveProvider = () =>
  Provider.effect(
    Hyperdrive,
    Effect.gen(function* () {
      const credentials = yield* CloudflareEnvironment;
      const { accountId } = credentials;

      return {
        stables: ["accountId", "hyperdriveId"],
        create: ({ news }) =>
          Effect.gen(function* () {
            const existing = yield* findHyperdriveConfig({
              accountId,
              credentials,
              name: news.name,
            });
            if (existing) {
              return {
                accountId,
                hyperdriveId: existing.id,
                name: existing.name,
              };
            }

            const created = yield* createHyperdriveConfig({
              accountId,
              credentials,
              ...hyperdriveBody(news),
            });

            return {
              accountId,
              hyperdriveId: created.id,
              name: created.name,
            };
          }),
        update: ({ news, output }) =>
          Effect.gen(function* () {
            const updated = yield* updateHyperdriveConfig({
              accountId: output.accountId,
              credentials,
              hyperdriveId: output.hyperdriveId,
              ...hyperdriveBody(news),
            });
            return {
              accountId: output.accountId,
              hyperdriveId: updated.id,
              name: updated.name,
            };
          }),
        delete: ({ olds, output }) =>
          Effect.gen(function* () {
            const shouldDelete = yield* shouldDeleteProtectedResource(
              olds.delete
            );
            if (shouldDelete) {
              yield* deleteHyperdriveConfig({
                accountId: output.accountId,
                credentials,
                hyperdriveId: output.hyperdriveId,
              });
            }
          }),
      };
    })
  );

const protectedResourceDestroyEnabled = Config.boolean(
  "CEIRD_DESTROY_PROTECTED_RESOURCES"
).pipe(
  Config.orElse(() => Config.boolean("CEIRD_DESTROY_PROTECTED_RESOURCES")),
  Config.withDefault(false)
);

function shouldDeleteProtectedResource(deleteFlag: boolean | undefined) {
  return Effect.gen(function* () {
    const enabled = yield* protectedResourceDestroyEnabled;
    return deleteFlag === true || enabled;
  });
}

function hyperdriveBody(props: HyperdriveProps) {
  return {
    name: props.name,
    origin: {
      ...props.origin,
      password: Redacted.value(props.origin.password),
      port:
        props.origin.port ?? (props.origin.scheme === "mysql" ? 3306 : 5432),
      scheme: props.origin.scheme ?? "postgres",
    },
    caching: props.caching,
  };
}

function cloudflareHeaders(
  credentials: CloudflareCredentials
): Record<string, string> {
  if (credentials.type === "apiKey") {
    return {
      "Content-Type": "application/json",
      "X-Auth-Email": Redacted.value(credentials.email),
      "X-Auth-Key": Redacted.value(credentials.apiKey),
    };
  }

  const token =
    credentials.type === "oauth"
      ? Redacted.value(credentials.accessToken)
      : Redacted.value(credentials.apiToken);

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function cloudflareRequest<T>(input: {
  readonly accountId: string;
  readonly credentials: CloudflareCredentials;
  readonly method: "DELETE" | "GET" | "PATCH" | "POST";
  readonly path: string;
  readonly body?: unknown;
}) {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${input.accountId}${input.path}`,
        {
          body:
            input.body === undefined ? undefined : JSON.stringify(input.body),
          headers: cloudflareHeaders(input.credentials),
          method: input.method,
        }
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || getCloudflareSuccess(payload) === false) {
        const message =
          getCloudflareFirstErrorMessage(payload) ??
          response.statusText ??
          `Cloudflare request failed with ${response.status}`;
        throw new Error(message);
      }

      return payload as T;
    },
    catch: (error) =>
      error instanceof Error ? error : new Error(String(error)),
  });
}

function getCloudflareSuccess(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("success" in payload)
  ) {
    return null;
  }
  return typeof payload.success === "boolean" ? payload.success : null;
}

function getCloudflareFirstErrorMessage(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("errors" in payload)
  ) {
    return null;
  }
  if (!Array.isArray(payload.errors)) {
    return null;
  }
  const [firstError] = payload.errors;
  if (
    typeof firstError !== "object" ||
    firstError === null ||
    !("message" in firstError)
  ) {
    return null;
  }
  return typeof firstError.message === "string" ? firstError.message : null;
}

function findHyperdriveConfig(input: {
  readonly accountId: string;
  readonly credentials: CloudflareCredentials;
  readonly name: string;
}) {
  return cloudflareRequest<{ readonly result: readonly HyperdriveApiConfig[] }>(
    {
      accountId: input.accountId,
      credentials: input.credentials,
      method: "GET",
      path: "/hyperdrive/configs",
    }
  ).pipe(
    Effect.map((response) =>
      response.result.find((item) => item.name === input.name)
    )
  );
}

function createHyperdriveConfig(input: {
  readonly accountId: string;
  readonly credentials: CloudflareCredentials;
  readonly name: string;
  readonly origin: ReturnType<typeof hyperdriveBody>["origin"];
  readonly caching?: ReturnType<typeof hyperdriveBody>["caching"];
}) {
  return cloudflareRequest<{ readonly result: HyperdriveApiConfig }>({
    accountId: input.accountId,
    body: {
      caching: input.caching,
      name: input.name,
      origin: input.origin,
    },
    credentials: input.credentials,
    method: "POST",
    path: "/hyperdrive/configs",
  }).pipe(Effect.map((response) => response.result));
}

function updateHyperdriveConfig(input: {
  readonly accountId: string;
  readonly credentials: CloudflareCredentials;
  readonly hyperdriveId: string;
  readonly name: string;
  readonly origin: ReturnType<typeof hyperdriveBody>["origin"];
  readonly caching?: ReturnType<typeof hyperdriveBody>["caching"];
}) {
  return cloudflareRequest<{ readonly result: HyperdriveApiConfig }>({
    accountId: input.accountId,
    body: {
      caching: input.caching,
      name: input.name,
      origin: input.origin,
    },
    credentials: input.credentials,
    method: "PATCH",
    path: `/hyperdrive/configs/${input.hyperdriveId}`,
  }).pipe(Effect.map((response) => response.result));
}

function deleteHyperdriveConfig(input: {
  readonly accountId: string;
  readonly credentials: CloudflareCredentials;
  readonly hyperdriveId: string;
}) {
  return cloudflareRequest({
    accountId: input.accountId,
    credentials: input.credentials,
    method: "DELETE",
    path: `/hyperdrive/configs/${input.hyperdriveId}`,
  }).pipe(Effect.asVoid);
}
