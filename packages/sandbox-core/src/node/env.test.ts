import { Effect, Either } from "effect";

import {
  SandboxEnvironmentError,
  loadSandboxSharedEnvironment,
} from "./env.js";

const REQUIRED_SHARED_KEYS = ["EMAIL_SENDER", "EMAIL_PROVIDER_TOKEN"] as const;
const OPTIONAL_SHARED_KEYS = ["EMAIL_SENDER_NAME"] as const;

describe("loadSandboxSharedEnvironment()", () => {
  it("fails fast when required shared env is missing", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        requiredKeys: REQUIRED_SHARED_KEYS,
        processEnv: {},
        readFile: () => Effect.succeed(""),
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected sandbox env loading to fail");
    }
    expect(result.left).toBeInstanceOf(SandboxEnvironmentError);
    expect(result.left.missing).toStrictEqual([...REQUIRED_SHARED_KEYS]);
    expect(result.left.reason).toBe("missing_required");
    expect(result.left.cause).toMatch(/EMAIL_SENDER/);
  }, 10_000);

  it("merges repo .env values and lets process env override them", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {
          EMAIL_PROVIDER_TOKEN: "override-token",
        },
        requiredKeys: REQUIRED_SHARED_KEYS,
        readFile: (filePath) => {
          if (filePath.endsWith(".env")) {
            return Effect.succeed(
              [
                "EMAIL_SENDER=auth@example.com",
                'EMAIL_PROVIDER_TOKEN="repo-token"',
                "# trailing comment should be ignored",
              ].join("\n")
            );
          }

          return Effect.succeed("");
        },
      })
    );

    expect(result).toStrictEqual({
      EMAIL_SENDER: "auth@example.com",
      EMAIL_PROVIDER_TOKEN: "override-token",
    });
  }, 10_000);

  it("treats missing env files as optional inputs", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        requiredKeys: REQUIRED_SHARED_KEYS,
        processEnv: {
          EMAIL_SENDER: "auth@example.com",
          EMAIL_PROVIDER_TOKEN: "live-token",
        },
        readFile: () =>
          Effect.fail(
            Object.assign(new Error("missing file"), { code: "ENOENT" })
          ),
      })
    );

    expect(result).toStrictEqual({
      EMAIL_SENDER: "auth@example.com",
      EMAIL_PROVIDER_TOKEN: "live-token",
    });
  }, 10_000);

  it("parses quoted dotenv values from repo env files", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        requiredKeys: REQUIRED_SHARED_KEYS,
        processEnv: {},
        readFile: (filePath) => {
          if (filePath.endsWith(".env")) {
            return Effect.succeed(
              [
                'EMAIL_SENDER="auth@example.com"',
                'EMAIL_PROVIDER_TOKEN="quoted-token"',
              ].join("\n")
            );
          }

          return Effect.succeed("");
        },
      })
    );

    expect(result).toStrictEqual({
      EMAIL_SENDER: "auth@example.com",
      EMAIL_PROVIDER_TOKEN: "quoted-token",
    });
  }, 10_000);

  it("includes optional keys when they are present", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        optionalKeys: OPTIONAL_SHARED_KEYS,
        requiredKeys: REQUIRED_SHARED_KEYS,
        processEnv: {
          EMAIL_SENDER: "auth@example.com",
          EMAIL_PROVIDER_TOKEN: "live-token",
        },
        readFile: (filePath) => {
          if (filePath.endsWith(".env")) {
            return Effect.succeed('EMAIL_SENDER_NAME="Ceird Auth"');
          }

          return Effect.succeed("");
        },
      })
    );

    expect(result).toStrictEqual({
      EMAIL_SENDER: "auth@example.com",
      EMAIL_PROVIDER_TOKEN: "live-token",
      EMAIL_SENDER_NAME: "Ceird Auth",
    });
  }, 10_000);

  it("omits blank optional keys", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        optionalKeys: OPTIONAL_SHARED_KEYS,
        requiredKeys: REQUIRED_SHARED_KEYS,
        processEnv: {
          EMAIL_SENDER: "auth@example.com",
          EMAIL_PROVIDER_TOKEN: "live-token",
          EMAIL_SENDER_NAME: "",
        },
        readFile: (filePath) => {
          if (filePath.endsWith(".env")) {
            return Effect.succeed('EMAIL_SENDER_NAME="Ceird Auth"');
          }

          return Effect.succeed("");
        },
      })
    );

    expect(result).toStrictEqual({
      EMAIL_SENDER: "auth@example.com",
      EMAIL_PROVIDER_TOKEN: "live-token",
    });
  }, 10_000);

  it("fails when an env file cannot be read for reasons other than missing files", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        requiredKeys: REQUIRED_SHARED_KEYS,
        processEnv: {
          EMAIL_SENDER: "auth@example.com",
          EMAIL_PROVIDER_TOKEN: "live-token",
        },
        readFile: () => Effect.fail(new Error("permission denied")),
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected sandbox env loading to fail");
    }
    expect(result.left.message).toMatch(/Failed to read sandbox env file/);
    expect(result.left.reason).toBe("file_read_failed");
    expect(result.left.cause).toBe("permission denied");
    expect(result.left.filePath).toBe("/repo/.env");
  }, 10_000);
});
