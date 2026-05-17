import { describe, expect, it } from "@effect/vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import type { ApiWorkerBindingEnv } from "./cloudflare-stack.ts";
import { makeApiWorkerBindings } from "./cloudflare-stack.ts";
import { configWithoutCloudflareBootstrapSecrets } from "./stages.contract.ts";

const apiWorkerBindingKeys = [
  "AUTH_EMAIL",
  "AUTH_EMAIL_QUEUE",
  "DATABASE",
] as const satisfies readonly (keyof ApiWorkerBindingEnv)[];

describe("Cloudflare stack", () => {
  it("declares the API Worker cloud resources as typed Alchemy bindings", () => {
    const authEmailQueue = {
      accountId: "account-id",
      queueId: "queue-id",
      queueName: "ceird-test-auth-email",
    } as unknown as Cloudflare.Queue;
    const hyperdrive = {
      accountId: "account-id",
      hyperdriveId: "hyperdrive-id",
      name: "ceird-test-postgres",
    } as unknown as Cloudflare.Hyperdrive;

    const bindings = makeApiWorkerBindings({
      authEmailQueue,
      config: configWithoutCloudflareBootstrapSecrets,
      hyperdrive,
    });
    const authEmail = Effect.runSync(bindings.AUTH_EMAIL);

    expect(Object.keys(bindings)).toStrictEqual([...apiWorkerBindingKeys]);
    expect(bindings.AUTH_EMAIL_QUEUE).toBe(authEmailQueue);
    expect(bindings.DATABASE).toBe(hyperdrive);
    expect(Cloudflare.isSendEmail(authEmail)).toBe(true);
    expect(authEmail).toMatchObject({
      allowedSenderAddresses: ["no-reply@example.com"],
      name: "AuthEmailBinding",
    });
  });
});
