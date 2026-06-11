import { describe, expect, it } from "@effect/vitest";

import {
  gitHubCiDeployEnvironments,
  makeGitHubCiVariables,
} from "./github-ci.ts";

describe("GitHub CI credentials stack", () => {
  it("keeps non-secret GitHub Actions values as variables", () => {
    expect(
      makeGitHubCiVariables({
        cloudflareZoneId: "zone-id",
        cloudflareZoneName: "ceird.app",
      })
    ).toStrictEqual({
      CEIRD_CLOUDFLARE_ZONE_ID: "zone-id",
      CEIRD_ZONE_NAME: "ceird.app",
    });
  });

  it("scopes deploy secrets to the GitHub environments used by workflows", () => {
    expect(gitHubCiDeployEnvironments).toStrictEqual([
      "main",
      "preview-deploy",
      "preview-cleanup",
    ]);
  });
});
