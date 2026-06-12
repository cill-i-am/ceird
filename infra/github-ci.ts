import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

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
  const repository = {
    owner: config.gitHubOwner,
    repository: config.gitHubRepository,
  };

  // oxlint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-method-this-argument -- Effect.forEach keeps environment secret reconciliation inside the stack Effect.
  yield* Effect.forEach(gitHubCiDeployEnvironments, (environment) =>
    Effect.all(
      [
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
    environments: gitHubCiDeployEnvironments,
    gitHubRepository: `${config.gitHubOwner}/${config.gitHubRepository}`,
    variables: Object.keys(variables) as readonly (keyof typeof variables)[],
  } as const satisfies {
    readonly environments: readonly string[];
    readonly gitHubRepository: string;
    readonly variables: readonly string[];
  };
});
