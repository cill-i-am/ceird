import { describe, expect, it } from "@effect/vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { readCloudflareAccountId } from "./cloudflare-environment.ts";

describe("Cloudflare environment", () => {
  it("reads accountId from resolved profile credentials", async () => {
    await expect(
      runWithCloudflareEnvironment(
        Effect.succeed({ accountId: "profile-account-id" })
      )
    ).resolves.toBe("profile-account-id");
  });

  it("reads account from the env provider shape", async () => {
    await expect(
      runWithCloudflareEnvironment({ account: "env-account-id" })
    ).resolves.toBe("env-account-id");
  });

  it("fails clearly when the provider shape has no account id", async () => {
    await expect(runWithCloudflareEnvironment({})).rejects.toThrow(
      /did not provide a Cloudflare account id/
    );
  });
});

async function runWithCloudflareEnvironment(environment: unknown) {
  return await Effect.runPromise(
    readCloudflareAccountId().pipe(
      Effect.provideService(
        Cloudflare.CloudflareEnvironment,
        environment as never
      )
    )
  );
}
