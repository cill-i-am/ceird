import { describe, expect, it } from "@effect/vitest";

import { makeHealthPayload } from "./health.js";

describe("API health payload", () => {
  it("reports the Alchemy stack and stage identity", () => {
    expect(
      makeHealthPayload({
        stackName: "ceird",
        stage: "codex-alchemy-v2-native-migration",
      })
    ).toStrictEqual({
      ok: true,
      service: "api",
      stackName: "ceird",
      stage: "codex-alchemy-v2-native-migration",
    });
  });

  it("falls back to local identity when Alchemy metadata is blank", () => {
    expect(makeHealthPayload({ stackName: "", stage: "" })).toStrictEqual({
      ok: true,
      service: "api",
      stackName: "local",
      stage: "local",
    });
  });
});
