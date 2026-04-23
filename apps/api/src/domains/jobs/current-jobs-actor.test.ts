import { Cause, Effect, Exit, Option } from "effect";

import { resolveCurrentJobsActor } from "./current-jobs-actor.js";
import { JobsSessionRequiredError } from "./errors.js";

interface SessionLike {
  readonly session: {
    readonly activeOrganizationId: string | null;
  };
  readonly user: {
    readonly id: string;
  };
}

function runCurrentJobsActor(options?: {
  readonly rows?: readonly { readonly role: string }[];
  readonly session?: SessionLike | null;
  readonly sessionError?: Error;
}) {
  return Effect.runPromiseExit(
    resolveCurrentJobsActor({
      getSession: () => {
        if (options?.sessionError) {
          return Promise.reject(options.sessionError);
        }

        return Promise.resolve(options?.session ?? null);
      },
      headers: new Headers(),
      loadMembershipRoles: () =>
        Effect.succeed(options?.rows ?? [{ role: "owner" }]),
    })
  );
}

describe("current jobs actor resolution", () => {
  it("resolves the current actor from the active organization session", async () => {
    const exit = await runCurrentJobsActor({
      session: {
        session: {
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
        },
      },
    });

    expect(exit).toStrictEqual(
      Exit.succeed({
        organizationId: "org_123",
        role: "owner",
        userId: "user_123",
      })
    );
  }, 10_000);

  it("fails with a session-required error when no authenticated session exists", async () => {
    const exit = await runCurrentJobsActor({
      session: null,
    });

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected jobs actor lookup to fail.");
    }

    const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));

    expect(failure).toBeInstanceOf(JobsSessionRequiredError);
    expect(failure).toMatchObject({
      message: "Authentication is required to access jobs",
    });
  }, 10_000);

  it("defects when the auth session lookup throws unexpectedly", async () => {
    const sessionError = new Error("Auth backend unavailable");
    const exit = await runCurrentJobsActor({
      sessionError,
    });

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected jobs actor lookup to fail.");
    }

    expect(Cause.failureOption(exit.cause)._tag).toBe("None");
    expect(Option.getOrUndefined(Cause.dieOption(exit.cause))).toMatchObject({
      message: sessionError.message,
    });
  }, 10_000);
});
