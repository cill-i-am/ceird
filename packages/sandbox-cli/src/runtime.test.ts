import { makeNodeServiceEnvironmentEntries } from "./runtime.js";

describe("makeNodeServiceEnvironmentEntries()", () => {
  it("includes the Better Auth secret for the api container only", () => {
    const apiEnv = makeNodeServiceEnvironmentEntries({
      databaseUrl: "postgresql://postgres:postgres@postgres:5432/task_tracker",
      filter: "api",
      publishedPort: 4301,
      sandboxId: "abc123def456",
      betterAuthSecret: "super-secret",
    });
    const appEnv = makeNodeServiceEnvironmentEntries({
      databaseUrl: "postgresql://postgres:postgres@postgres:5432/task_tracker",
      filter: "app",
      publishedPort: 4300,
      sandboxId: "abc123def456",
      betterAuthSecret: "super-secret",
    });

    expect(apiEnv).toContain("BETTER_AUTH_SECRET=super-secret");
    expect(appEnv).not.toContain("BETTER_AUTH_SECRET=super-secret");
  }, 10_000);
});
