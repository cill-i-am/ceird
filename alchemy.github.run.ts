import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import type { StackServices } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { makeGitHubCiStack } from "./infra/github-ci.ts";

const stackName = "ceird-github";

const providers = Layer.mergeAll(
  Cloudflare.providers(),
  GitHub.providers()
).pipe(Layer.orDie) as Layer.Layer<unknown, never, StackServices>;

export default Alchemy.Stack(
  stackName,
  {
    providers,
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const githubRepository = yield* Config.string("GITHUB_REPOSITORY").pipe(
      Config.withDefault("cillianbarron/ceird")
    );
    const [defaultOwner, defaultRepository] = githubRepository.split("/", 2);
    const gitHubOwner = yield* Config.string("CEIRD_GITHUB_OWNER").pipe(
      Config.withDefault(defaultOwner ?? "cillianbarron")
    );
    const gitHubRepository = yield* Config.string(
      "CEIRD_GITHUB_REPOSITORY"
    ).pipe(Config.withDefault(defaultRepository ?? "ceird"));

    return yield* makeGitHubCiStack({
      cloudflareAccountId: yield* Config.string("CLOUDFLARE_ACCOUNT_ID"),
      cloudflareZoneId: yield* Config.string("CEIRD_CLOUDFLARE_ZONE_ID"),
      cloudflareZoneName: yield* Config.string("CEIRD_ZONE_NAME").pipe(
        Config.withDefault("ceird.app")
      ),
      gitHubOwner,
      gitHubRepository,
      stateStoreCredentials: yield* Config.redacted(
        "CEIRD_ALCHEMY_STATE_STORE_CREDENTIALS"
      ),
    });
  }).pipe(
    Effect.withSpan("GitHubCiStack.deploy", {
      attributes: { stackName },
    }),
    Effect.orDie
  )
);
