import { describe, expect, it } from "@effect/vitest";

import {
  gitHubCiDeployEnvironments,
  makeCloudflareCiDeployTokenProps,
  makeGitHubCiVariables,
} from "./github-ci.ts";

describe("GitHub CI credentials stack", () => {
  it("scopes the Cloudflare deploy token to the account and managed zone", () => {
    expect(
      makeCloudflareCiDeployTokenProps({
        cloudflareAccountId: "account-id",
        cloudflareZoneId: "zone-id",
      })
    ).toStrictEqual({
      accountId: "account-id",
      name: "ceird-github-actions-deploy",
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "AI Gateway Write",
            "Hyperdrive Write",
            "Queues Write",
            "Workers Scripts Write",
          ],
          resources: {
            "com.cloudflare.api.account.account-id": "*",
          },
        },
        {
          effect: "allow",
          permissionGroups: ["DNS Write", "Workers Routes Write", "Zone Read"],
          resources: {
            "com.cloudflare.api.account.zone.zone-id": "*",
          },
        },
      ],
    });
  });

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
