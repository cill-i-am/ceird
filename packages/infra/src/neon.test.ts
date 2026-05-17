import { describe, expect, it } from "@effect/vitest";

import { makeNeonPostgresLayout } from "./neon.ts";
import { configWithoutCloudflareBootstrapSecrets } from "./stages.contract.ts";
import { apiMigrationsDir } from "./stages.ts";

describe("Neon Postgres layout", () => {
  it("creates the shared project and protected branch for the parent stage", () => {
    const layout = makeNeonPostgresLayout({
      ...configWithoutCloudflareBootstrapSecrets,
      stage: "main",
    });

    expect(layout).toStrictEqual({
      branch: {
        migrationSource: {
          kind: "checked-in-drizzle-sql",
          migrationsDir: apiMigrationsDir,
        },
        name: "main",
        parentBranchName: undefined,
        protected: true,
      },
      project: {
        databaseName: "ceird",
        defaultBranchName: "base",
        kind: "create",
        name: "ceird-main-postgres",
        orgId: undefined,
        pgVersion: 17,
        region: "aws-eu-west-2",
        roleName: "ceird",
      },
    });
  });

  it("references the shared project and forks a branch from main for local stages", () => {
    const layout = makeNeonPostgresLayout({
      ...configWithoutCloudflareBootstrapSecrets,
      stage: "dev_cillian",
    });

    expect(layout).toStrictEqual({
      branch: {
        migrationSource: {
          kind: "checked-in-drizzle-sql",
          migrationsDir: apiMigrationsDir,
        },
        name: "dev-cillian",
        parentBranchName: "main",
        protected: false,
      },
      project: {
        kind: "reference",
        stage: "main",
      },
    });
  });

  it("keeps provider-safe branch names for branch-shaped stages", () => {
    const layout = makeNeonPostgresLayout({
      ...configWithoutCloudflareBootstrapSecrets,
      stage: "codex/Alchemy V2 Native Migration!",
    });

    expect(layout.branch).toMatchObject({
      name: "codex-alchemy-v2-native-migration",
      parentBranchName: "main",
      protected: false,
    });
  });
});
