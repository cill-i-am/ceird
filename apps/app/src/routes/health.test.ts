import { afterEach, describe, expect, it } from "vitest";

import { getAppHealthResponse } from "./health";

const previousEnvironment = {
  ALCHEMY_STACK_NAME: process.env.ALCHEMY_STACK_NAME,
  ALCHEMY_STAGE: process.env.ALCHEMY_STAGE,
};

async function readHealthResponse(runtimeEnv?: Partial<CloudflareEnv>) {
  const response = await getAppHealthResponse(runtimeEnv);

  expect(response).toBeInstanceOf(Response);

  return response.json();
}

describe("app health route", () => {
  afterEach(() => {
    if (previousEnvironment.ALCHEMY_STACK_NAME === undefined) {
      delete process.env.ALCHEMY_STACK_NAME;
    } else {
      process.env.ALCHEMY_STACK_NAME = previousEnvironment.ALCHEMY_STACK_NAME;
    }

    if (previousEnvironment.ALCHEMY_STAGE === undefined) {
      delete process.env.ALCHEMY_STAGE;
    } else {
      process.env.ALCHEMY_STAGE = previousEnvironment.ALCHEMY_STAGE;
    }
  });

  it("reports the Alchemy stack and stage from the Worker env binding", async () => {
    delete process.env.ALCHEMY_STACK_NAME;
    delete process.env.ALCHEMY_STAGE;

    await expect(
      readHealthResponse({
        ALCHEMY_STACK_NAME: "ceird",
        ALCHEMY_STAGE: "codex-alchemy-v2-native-migration",
      })
    ).resolves.toStrictEqual({
      ok: true,
      service: "app",
      stackName: "ceird",
      stage: "codex-alchemy-v2-native-migration",
    });
  });

  it("falls back to process env for package-local Node runs", async () => {
    process.env.ALCHEMY_STACK_NAME = "ceird";
    process.env.ALCHEMY_STAGE = "package-local";

    await expect(readHealthResponse()).resolves.toStrictEqual({
      ok: true,
      service: "app",
      stackName: "ceird",
      stage: "package-local",
    });
  });
});
