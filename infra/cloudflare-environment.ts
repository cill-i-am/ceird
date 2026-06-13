import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

type CloudflareAccountIdKey = "accountId" | "account";

export const readCloudflareAccountId = Effect.fn(
  "CloudflareEnvironment.readAccountId"
)(function* () {
  const environment = (yield* Cloudflare.CloudflareEnvironment) as unknown;
  const resolvedEnvironment = yield* resolveCloudflareEnvironment(environment);

  return yield* resolveCloudflareAccountId(resolvedEnvironment);
});

function resolveCloudflareEnvironment(environment: unknown) {
  return Effect.isEffect(environment)
    ? (environment as Effect.Effect<unknown, never, never>)
    : Effect.succeed(environment);
}

function resolveCloudflareAccountId(environment: unknown) {
  const accountId =
    readStringProperty(environment, "accountId") ??
    readStringProperty(environment, "account");

  return accountId === undefined
    ? Effect.die(
        new Error(
          "Alchemy CloudflareEnvironment did not provide a Cloudflare account id."
        )
      )
    : Effect.succeed(accountId);
}

function readStringProperty(value: unknown, property: CloudflareAccountIdKey) {
  if (typeof value !== "object" || value === null) {
    return;
  }

  const propertyValue = (value as Record<CloudflareAccountIdKey, unknown>)[
    property
  ];

  return typeof propertyValue === "string" && propertyValue.length > 0
    ? propertyValue
    : undefined;
}
