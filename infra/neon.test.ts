import { describe, expect, it } from "@effect/vitest";

import { makeNeonPostgresLayout } from "./neon.ts";
import { configWithoutCloudflareBootstrapSecrets } from "./stages.contract.ts";
import {
  apiAlchemyDrizzleMigrationsDir,
  apiDrizzleMigrationsDir,
  apiDrizzleSchemaPath,
} from "./stages.ts";

describe("Neon Postgres layout", () => {
  it("creates the shared project and unprotected branch for the parent stage by default", () => {
    const layout = makeNeonPostgresLayout({
      ...configWithoutCloudflareBootstrapSecrets,
      stage: "main",
    });

    expect(layout).toStrictEqual({
      branch: {
        migrationSource: {
          appliedMigrationsDir: apiDrizzleMigrationsDir,
          dialect: "postgres",
          generatedMigrationsDir: apiAlchemyDrizzleMigrationsDir,
          kind: "alchemy-drizzle-schema",
          schema: apiDrizzleSchemaPath,
        },
        name: "main",
        parentBranchName: undefined,
        protected: false,
      },
      project: {
        databaseName: "ceird",
        defaultBranchName: "base",
        kind: "create",
        name: "ceird-main-postgres",
        historyRetentionSeconds: 21_600,
        orgId: undefined,
        pgVersion: 17,
        region: "aws-eu-west-2",
        roleName: "ceird",
      },
    });
  });

  it("protects the parent stage branch only when explicitly configured", () => {
    const layout = makeNeonPostgresLayout({
      ...configWithoutCloudflareBootstrapSecrets,
      neonParentBranchProtected: true,
      stage: "main",
    });

    expect(layout.branch).toMatchObject({
      name: "main",
      parentBranchName: undefined,
      protected: true,
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
          appliedMigrationsDir: apiDrizzleMigrationsDir,
          dialect: "postgres",
          generatedMigrationsDir: apiAlchemyDrizzleMigrationsDir,
          kind: "alchemy-drizzle-schema",
          schema: apiDrizzleSchemaPath,
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
