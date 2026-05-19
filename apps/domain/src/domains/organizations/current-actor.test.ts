import { Cause, Effect, Exit, Option } from "effect";

import { resolveCurrentOrganizationActor } from "./current-actor.js";
import {
  OrganizationActorStorageError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "./errors.js";

interface SessionLike {
  readonly session: {
    readonly activeOrganizationId: string | null;
  };
  readonly user: {
    readonly id: string;
  };
}

function runCurrentOrganizationActor(options?: {
  readonly rows?: readonly { readonly role: string }[];
  readonly session?: SessionLike | null | undefined;
  readonly sessionError?: Error;
}) {
  return Effect.runPromiseExit(
    resolveCurrentOrganizationActor({
      getSession: () => {
        if (options?.sessionError) {
          return Promise.reject(options.sessionError);
        }

        return Promise.resolve(
          options !== undefined && "session" in options ? options.session : null
        );
      },
      headers: new Headers(),
      loadMembershipRoles: () =>
        Effect.succeed(options?.rows ?? [{ role: "owner" }]),
    })
  );
}

describe("current organization actor resolution", () => {
  it("resolves the current actor from the active organization session", async () => {
    const exit = await runCurrentOrganizationActor({
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

  it("resolves an external organization membership role", async () => {
    const exit = await runCurrentOrganizationActor({
      rows: [{ role: "external" }],
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
        role: "external",
        userId: "user_123",
      })
    );
  }, 10_000);

  it("fails with a session-required error when no authenticated session exists", async () => {
    const exit = await runCurrentOrganizationActor({
      session: null,
    });

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected organization actor lookup to fail.");
    }

    const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));

    expect(failure).toBeInstanceOf(OrganizationSessionRequiredError);
    expect(failure).toMatchObject({
      message: "Authentication is required to access the organization",
    });
  }, 10_000);

  it("fails with a session-required error when auth returns an undefined session", async () => {
    const exit = await runCurrentOrganizationActor({
      session: undefined,
    });

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected organization actor lookup to fail.");
    }

    const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));

    expect(failure).toBeInstanceOf(OrganizationSessionRequiredError);
    expect(failure).toMatchObject({
      message: "Authentication is required to access the organization",
    });
  }, 10_000);

  it("fails with a typed actor error when the session identity is invalid", async () => {
    const exit = await runCurrentOrganizationActor({
      session: {
        session: {
          activeOrganizationId: "",
        },
        user: {
          id: "user_123",
        },
      },
    });

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected organization actor lookup to fail.");
    }

    const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));

    expect(failure).toBeInstanceOf(OrganizationSessionIdentityInvalidError);
    expect(failure).toMatchObject({
      field: "activeOrganizationId",
      message: "Session active organization id is invalid",
    });
  }, 10_000);

  it("fails with a typed storage error when the auth session lookup throws", async () => {
    const sessionError = new Error("Auth backend unavailable");
    const exit = await runCurrentOrganizationActor({
      sessionError,
    });

    expect(exit._tag).toBe("Failure");

    if (Exit.isSuccess(exit)) {
      throw new Error("Expected organization actor lookup to fail.");
    }

    const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));

    expect(failure).toBeInstanceOf(OrganizationActorStorageError);
    expect(failure).toMatchObject({
      cause: sessionError.message,
      message: "Organization actor session lookup failed",
    });
  }, 10_000);
});
