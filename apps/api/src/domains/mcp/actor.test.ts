import { SqlClient } from "@effect/sql";
import { Effect, Exit, Layer } from "effect";

import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import {
  makeCurrentOrganizationActorFromMcpSessionLayer,
  resolveCurrentOrganizationActorFromMcpSession,
} from "./actor.js";

describe(resolveCurrentOrganizationActorFromMcpSession, () => {
  it("resolves org actor using session id and user id from MCP auth context", async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentOrganizationActorFromMcpSession({
        session: {
          sessionId: "session_123",
          userId: "user_123",
        },
        loadMembershipRoles: () => Effect.succeed([{ role: "member" }]),
        loadSessionById: () =>
          Effect.succeed({
            activeOrganizationId: "org_123",
            expiresAt: new Date("2999-01-01T00:00:00.000Z"),
            userId: "user_123",
          }),
      })
    );

    expect(exit).toStrictEqual(
      Exit.succeed({
        organizationId: "org_123",
        role: "member",
        userId: "user_123",
      })
    );
  }, 10_000);

  it("fails when session owner differs from MCP subject", async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentOrganizationActorFromMcpSession({
        session: {
          sessionId: "session_123",
          userId: "user_123",
        },
        loadMembershipRoles: () => Effect.succeed([{ role: "member" }]),
        loadSessionById: () =>
          Effect.succeed({
            activeOrganizationId: "org_123",
            expiresAt: new Date("2999-01-01T00:00:00.000Z"),
            userId: "user_999",
          }),
      })
    );

    expect(exit._tag).toBe("Failure");
  }, 10_000);

  it("fails closed when session is expired", async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentOrganizationActorFromMcpSession({
        session: {
          sessionId: "session_123",
          userId: "user_123",
        },
        loadMembershipRoles: () => Effect.succeed([{ role: "member" }]),
        loadSessionById: () =>
          Effect.succeed({
            activeOrganizationId: "org_123",
            expiresAt: new Date("2001-01-01T00:00:00.000Z"),
            userId: "user_123",
          }),
      })
    );

    expect(exit._tag).toBe("Failure");
  }, 10_000);

  it("provides CurrentOrganizationActor from MCP session without HttpServerRequest", async () => {
    const sql = Object.assign(
      (strings: TemplateStringsArray) => {
        const statement = strings.join(" ");

        if (statement.includes("from session")) {
          return Effect.succeed([
            {
              activeOrganizationId: "org_123",
              expiresAt: new Date("2999-01-01T00:00:00.000Z"),
              userId: "user_123",
            },
          ]);
        }

        if (statement.includes("from member")) {
          return Effect.succeed([{ role: "member" }]);
        }

        return Effect.die(
          new Error(`Unexpected SQL in test mock: ${statement}`)
        );
      },
      {
        withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
      }
    );

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const currentActor = yield* CurrentOrganizationActor;
        return yield* currentActor.get();
      }).pipe(
        Effect.provide(
          makeCurrentOrganizationActorFromMcpSessionLayer({
            sessionId: "session_123",
            userId: "user_123",
          })
        ),
        Effect.provide(
          Layer.succeed(
            SqlClient.SqlClient,
            sql as unknown as SqlClient.SqlClient
          )
        )
      ) as unknown as Effect.Effect<
        {
          organizationId: string;
          role: string;
          userId: string;
        },
        unknown,
        never
      >
    );

    expect(exit).toStrictEqual(
      Exit.succeed({
        organizationId: "org_123",
        role: "member",
        userId: "user_123",
      })
    );
  }, 10_000);
});
