import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import type { Input, InputProps } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { makeR2SecretAccessKey } from "./cloudflare-r2.ts";

export const gitHubCiDeployEnvironments = [
  "main",
  "preview-deploy",
  "preview-cleanup",
] as const;

export interface GitHubCiConfig {
  readonly cloudflareAccountId: string;
  readonly cloudflareZoneId: string;
  readonly cloudflareZoneName: string;
  readonly gitHubOwner: string;
  readonly gitHubRepository: string;
  readonly stateStoreCredentials: Redacted.Redacted<string>;
}

export function makeCloudflareCiDeployTokenProps(
  config: Pick<GitHubCiConfig, "cloudflareAccountId" | "cloudflareZoneId">
) {
  return {
    accountId: config.cloudflareAccountId,
    name: "ceird-github-actions-deploy",
    policies: [
      {
        effect: "allow",
        permissionGroups: [
          "AI Gateway Read",
          "AI Gateway Write",
          "Hyperdrive Read",
          "Hyperdrive Write",
          "Queues Read",
          "Queues Write",
          "Secrets Store Read",
          "Secrets Store Write",
          "Workers Containers Read",
          "Workers Containers Write",
          "Workers R2 Storage Read",
          "Workers R2 Storage Write",
          "Workers Scripts Read",
          "Workers Scripts Write",
        ],
        resources: {
          [`com.cloudflare.api.account.${config.cloudflareAccountId}`]: "*",
        },
      },
      {
        effect: "allow",
        permissionGroups: [
          "DNS Read",
          "DNS Write",
          "Workers Routes Read",
          "Workers Routes Write",
          "Zone Read",
        ],
        resources: {
          [`com.cloudflare.api.account.zone.${config.cloudflareZoneId}`]: "*",
        },
      },
    ],
  } satisfies InputProps<Cloudflare.ApiTokenProps>;
}

export function makeCloudflareElectricStorageTokenProps(
  config: Pick<GitHubCiConfig, "cloudflareAccountId">
) {
  return {
    accountId: config.cloudflareAccountId,
    name: "ceird-electric-storage-r2",
    policies: [
      {
        effect: "allow",
        permissionGroups: [
          "Workers R2 Storage Read",
          "Workers R2 Storage Write",
        ],
        resources: {
          [`com.cloudflare.api.account.${config.cloudflareAccountId}`]: "*",
        },
      },
    ],
  } satisfies InputProps<Cloudflare.ApiTokenProps>;
}

export function makeGitHubCiVariables(
  config: Pick<GitHubCiConfig, "cloudflareZoneId" | "cloudflareZoneName">
) {
  return {
    CEIRD_CLOUDFLARE_ZONE_ID: config.cloudflareZoneId,
    CEIRD_ZONE_NAME: config.cloudflareZoneName,
  } as const;
}

export const makeGitHubCiStack = Effect.fn("GitHubCiStack.make")(function* (
  config: GitHubCiConfig
) {
  const deployToken = yield* Cloudflare.AccountApiToken(
    "CloudflareCiDeployToken",
    makeCloudflareCiDeployTokenProps(config)
  );
  const electricStorageToken = yield* Cloudflare.AccountApiToken(
    "CloudflareElectricStorageToken",
    makeCloudflareElectricStorageTokenProps(config)
  );
  const electricStorageSecretAccessKey = electricStorageToken.value.pipe(
    Output.map((value) => Redacted.make(makeR2SecretAccessKey(value)))
  );
  const electricStorageAccessKeyId = electricStorageToken.tokenId.pipe(
    Output.map(Redacted.make)
  );
  const repository = {
    owner: config.gitHubOwner,
    repository: config.gitHubRepository,
  };

  // oxlint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-method-this-argument -- Effect.forEach keeps environment secret reconciliation inside the stack Effect.
  yield* Effect.forEach(gitHubCiDeployEnvironments, (environment) =>
    Effect.all(
      [
        GitHub.Secret(`GitHubCloudflareApiToken${environment}`, {
          ...repository,
          environment,
          name: "CLOUDFLARE_API_TOKEN",
          value: deployToken.value,
        }),
        GitHub.Secret(`GitHubCloudflareAccountId${environment}`, {
          ...repository,
          environment,
          name: "CLOUDFLARE_ACCOUNT_ID",
          value: Redacted.make(config.cloudflareAccountId),
        }),
        GitHub.Secret(`GitHubAlchemyStateStoreCredentials${environment}`, {
          ...repository,
          environment,
          name: "ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS",
          value: config.stateStoreCredentials,
        }),
        GitHub.Secret(`GitHubElectricStorageAccessKeyId${environment}`, {
          ...repository,
          environment,
          name: "CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID",
          value: electricStorageAccessKeyId,
        }),
        GitHub.Secret(`GitHubElectricStorageSecretAccessKey${environment}`, {
          ...repository,
          environment,
          name: "CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY",
          value: electricStorageSecretAccessKey,
        }),
      ],
      { discard: true }
    )
  );

  const variables = makeGitHubCiVariables(config);

  // oxlint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-method-this-argument -- Effect.forEach keeps variable reconciliation inside the stack Effect.
  yield* Effect.forEach(Object.entries(variables), ([name, value]) =>
    GitHub.Variable(`GitHub${name}`, {
      ...repository,
      name,
      value,
    })
  );

  return {
    cloudflareApiTokenName: deployToken.name,
    environments: gitHubCiDeployEnvironments,
    gitHubRepository: `${config.gitHubOwner}/${config.gitHubRepository}`,
    variables: Object.keys(variables) as readonly (keyof typeof variables)[],
  } as const satisfies {
    readonly cloudflareApiTokenName: Input<string>;
    readonly environments: readonly string[];
    readonly gitHubRepository: string;
    readonly variables: readonly string[];
  };
});
