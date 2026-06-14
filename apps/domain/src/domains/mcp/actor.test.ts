import {
  decodeOrganizationId,
  decodeSessionId,
  decodeUserId,
} from "@ceird/identity-core";
import { Effect, Exit, Layer } from "effect";
import type { Context } from "effect";

import { DomainDrizzle } from "../../platform/database/database.js";
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
          sessionId: decodeSessionId("session_123"),
          userId: decodeUserId("user_123"),
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

  it("uses the OAuth token organization over the mutable session active organization", async () => {
    const loadedOrganizationIds: string[] = [];
    const exit = await Effect.runPromiseExit(
      resolveCurrentOrganizationActorFromMcpSession({
        session: {
          organizationId: decodeOrganizationId("org_consent"),
          sessionId: decodeSessionId("session_123"),
          userId: decodeUserId("user_123"),
        },
        loadMembershipRoles: (organizationId) => {
          loadedOrganizationIds.push(organizationId);
          return Effect.succeed([{ role: "member" }]);
        },
        loadSessionById: () =>
          Effect.succeed({
            activeOrganizationId: "org_live_session",
            expiresAt: new Date("2999-01-01T00:00:00.000Z"),
            userId: "user_123",
          }),
      })
    );

    expect(exit).toStrictEqual(
      Exit.succeed({
        organizationId: "org_consent",
        role: "member",
        userId: "user_123",
      })
    );
    expect(loadedOrganizationIds).toStrictEqual(["org_consent"]);
  }, 10_000);

  it("fails when session owner differs from MCP subject", async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentOrganizationActorFromMcpSession({
        session: {
          sessionId: decodeSessionId("session_123"),
          userId: decodeUserId("user_123"),
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
          sessionId: decodeSessionId("session_123"),
          userId: decodeUserId("user_123"),
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
    let selectCount = 0;
    const db = {
      select: () => {
        const selectedIndex = selectCount;
        selectCount += 1;
        const rows =
          selectedIndex === 0
            ? [
                {
                  activeOrganizationId: "org_123",
                  expiresAt: new Date("2999-01-01T00:00:00.000Z"),
                  userId: "user_123",
                },
              ]
            : [{ role: "member" }];

        return {
          from: () => ({
            where: () => ({
              limit: () => Effect.succeed(rows),
            }),
          }),
        };
      },
    };

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const currentActor = yield* CurrentOrganizationActor;
        return yield* currentActor.get();
      }).pipe(
        Effect.provide(
          makeCurrentOrganizationActorFromMcpSessionLayer({
            sessionId: decodeSessionId("session_123"),
            userId: decodeUserId("user_123"),
          })
        ),
        Effect.provide(
          Layer.succeed(
            DomainDrizzle,
            DomainDrizzle.of({ db } as unknown as Context.Service.Shape<
              typeof DomainDrizzle
            >)
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
