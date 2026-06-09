import { describe, expect, it } from "@effect/vitest";

import {
  gitHubCiDeployEnvironments,
  gitHubCiElectricStorageRuntimeEnvironment,
  gitHubCiProductionElectricStorageBucketName,
  makeCloudflareCiDeployTokenProps,
  makeCloudflareElectricStorageTokenProps,
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
            "com.cloudflare.api.account.account-id": "*",
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
            "com.cloudflare.api.account.zone.zone-id": "*",
          },
        },
      ],
    });
  });

  it("keeps Electric runtime R2 credentials in a separate production bucket token", () => {
    expect(
      makeCloudflareElectricStorageTokenProps({
        cloudflareAccountId: "account-id",
      })
    ).toStrictEqual({
      accountId: "account-id",
      name: "ceird-electric-storage-r2",
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers R2 Storage Bucket Item Read",
            "Workers R2 Storage Bucket Item Write",
          ],
          resources: {
            "com.cloudflare.edge.r2.bucket.account-id_default_ceird-main-electric-storage":
              "*",
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
    expect(gitHubCiElectricStorageRuntimeEnvironment).toBe("main");
    expect(gitHubCiProductionElectricStorageBucketName).toBe(
      "ceird-main-electric-storage"
    );
  });
});
