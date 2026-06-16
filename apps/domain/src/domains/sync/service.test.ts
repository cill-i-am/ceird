import {
  ACTIVITY_EVENTS_SYNC_WHERE,
  SYNC_SHAPE_NAMES,
} from "@ceird/domain-core";
import type { SyncShapeName } from "@ceird/domain-core";
import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";

import { effectEither } from "../../test/effect-test-helpers.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import {
  OrganizationActiveOrganizationRequiredError,
  OrganizationActorMembershipNotFoundError,
  OrganizationActorStorageError,
  OrganizationRoleNotSupportedError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "../organizations/errors.js";
import {
  SyncAccessDeniedError,
  SyncAuthorizationService,
  SyncAuthorizationStorageError,
  SyncUnauthorizedError,
} from "./service.js";

const internalActor = {
  organizationId: decodeOrganizationId("org_sync"),
  role: "admin",
  userId: decodeUserId("user_sync"),
} as const;

const externalActor = {
  ...internalActor,
  role: "external",
} as const;

function runWithActor<A, E>(
  effect: Effect.Effect<
    A,
    E,
    SyncAuthorizationService | HttpServerRequest.HttpServerRequest
  >
) {
  return effect.pipe(
    Effect.provide(SyncAuthorizationService.DefaultWithoutDependencies),
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(CurrentOrganizationActor, {
          get: () => Effect.succeed(internalActor),
        }),
        Layer.succeed(
          HttpServerRequest.HttpServerRequest,
          {} as HttpServerRequest.HttpServerRequest
        )
      )
    ),
    Effect.runPromise
  );
}

function authorizeShape(shapeName: SyncShapeName) {
  return Effect.gen(function* () {
    const service = yield* SyncAuthorizationService;

    return yield* service.authorizeShape(shapeName);
  });
}

const expectedShapeDefinitions = {
  "activity-events": {
    scope: "organization",
    table: "activity_events",
    where: ACTIVITY_EVENTS_SYNC_WHERE,
  },
  "agent-action-runs": {
    scope: "organization-user",
    table: "agent_action_runs",
  },
  "agent-threads": {
    scope: "organization-user",
    table: "agent_threads",
  },
  comments: {
    scope: "organization",
    table: "comments",
  },
  contacts: {
    scope: "organization",
    table: "contacts",
  },
  jobs: {
    scope: "organization",
    table: "work_items",
  },
  labels: {
    scope: "organization",
    table: "labels",
    where: "organization_id = $1 AND archived_at IS NULL",
  },
  "product-activity-actors": {
    scope: "organization",
    table: "product_activity_actors",
  },
  "site-active-job-summaries": {
    scope: "organization",
    table: "site_active_job_summaries",
  },
  "site-comments": {
    scope: "organization",
    table: "site_comments",
  },
  "site-contacts": {
    scope: "organization",
    table: "site_contacts",
  },
  "site-labels": {
    scope: "organization",
    table: "site_labels",
  },
  sites: {
    scope: "organization",
    table: "sites",
  },
  "work-item-activity": {
    scope: "organization",
    table: "work_item_activity",
  },
  "work-item-collaborators": {
    scope: "organization",
    table: "work_item_collaborators",
  },
  "work-item-comments": {
    scope: "organization",
    table: "work_item_comments",
  },
  "work-item-labels": {
    scope: "organization",
    table: "work_item_labels",
  },
  "work-item-visits": {
    scope: "organization",
    table: "work_item_visits",
  },
} as const satisfies Record<
  SyncShapeName,
  {
    readonly scope: "organization" | "organization-user";
    readonly table: string;
    readonly where?: string;
  }
>;

describe("SyncAuthorizationService", () => {
  it("authorizes every public shape with the expected table and scope", async () => {
    for (const shapeName of SYNC_SHAPE_NAMES) {
      const definition = expectedShapeDefinitions[shapeName];
      const authorization = await runWithActor(authorizeShape(shapeName));

      expect(authorization).toMatchObject({
        organizationId: "org_sync",
        shape: shapeName,
        scope: definition.scope,
        table: definition.table,
        userId: "user_sync",
      });

      if (definition.scope === "organization-user") {
        expect(authorization.params).toStrictEqual({
          "1": "org_sync",
          "2": "user_sync",
        });
        expect(authorization.where).toBe(
          "organization_id = $1 AND user_id = $2"
        );
      } else {
        if (shapeName === "activity-events") {
          expect(authorization.params).toMatchObject({
            "1": "org_sync",
          });
          expect(
            Date.parse(readRequiredActivityRetainedAfter(authorization.params))
          ).not.toBeNaN();
        } else {
          expect(authorization.params).toStrictEqual({
            "1": "org_sync",
          });
        }
        expect(authorization.where).toBe(
          "where" in definition ? definition.where : "organization_id = $1"
        );
      }
    }
  });

  it("authorizes broad organization shapes with parameterized filters", async () => {
    const authorization = await runWithActor(authorizeShape("jobs"));

    expect(authorization).toStrictEqual({
      organizationId: "org_sync",
      params: {
        "1": "org_sync",
      },
      shape: "jobs",
      scope: "organization",
      table: "work_items",
      userId: "user_sync",
      where: "organization_id = $1",
    });
  });

  it("authorizes the labels shape as active organization labels", async () => {
    const authorization = await runWithActor(authorizeShape("labels"));

    expect(authorization).toStrictEqual({
      organizationId: "org_sync",
      params: {
        "1": "org_sync",
      },
      shape: "labels",
      scope: "organization",
      table: "labels",
      userId: "user_sync",
      where: "organization_id = $1 AND archived_at IS NULL",
    });
  });

  it("authorizes the activity events shape as a bounded retained projection", async () => {
    const before = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const authorization = await runWithActor(authorizeShape("activity-events"));
    const after = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const retainedAfterMs = Date.parse(
      readRequiredActivityRetainedAfter(authorization.params)
    );

    expect(authorization).toMatchObject({
      organizationId: "org_sync",
      params: {
        "1": "org_sync",
      },
      shape: "activity-events",
      scope: "organization",
      table: "activity_events",
      userId: "user_sync",
      where: ACTIVITY_EVENTS_SYNC_WHERE,
    });
    expect(retainedAfterMs).toBeGreaterThanOrEqual(before);
    expect(retainedAfterMs).toBeLessThanOrEqual(after);
  });

  it("limits per-user agent shapes to the current user", async () => {
    const authorization = await runWithActor(
      authorizeShape("agent-action-runs")
    );

    expect(authorization).toMatchObject({
      params: {
        "1": "org_sync",
        "2": "user_sync",
      },
      scope: "organization-user",
      table: "agent_action_runs",
      where: "organization_id = $1 AND user_id = $2",
    });
  });

  it("denies broad sync to external organization actors", async () => {
    const result = await authorizeShape("jobs").pipe(
      Effect.provide(SyncAuthorizationService.DefaultWithoutDependencies),
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(CurrentOrganizationActor, {
            get: () => Effect.succeed(externalActor),
          }),
          Layer.succeed(
            HttpServerRequest.HttpServerRequest,
            {} as HttpServerRequest.HttpServerRequest
          )
        )
      ),
      effectEither,
      Effect.runPromise
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(SyncAccessDeniedError);
    }
  });

  it("maps current organization actor failures to stable sync errors", async () => {
    const actorErrorCases = [
      {
        error: new OrganizationSessionRequiredError({
          message: "Session required",
        }),
        expected: SyncUnauthorizedError,
      },
      {
        error: new OrganizationSessionIdentityInvalidError({
          field: "userId",
          message: "Invalid session user",
        }),
        expected: SyncUnauthorizedError,
      },
      {
        error: new OrganizationActiveOrganizationRequiredError({
          message: "Active organization required",
          userId: decodeUserId("user_sync"),
        }),
        expected: SyncUnauthorizedError,
      },
      {
        error: new OrganizationActorStorageError({
          message: "Storage failed",
        }),
        expected: SyncAuthorizationStorageError,
      },
      {
        error: new OrganizationActorMembershipNotFoundError({
          message: "Membership not found",
          organizationId: decodeOrganizationId("org_sync"),
          userId: decodeUserId("user_sync"),
        }),
        expected: SyncAccessDeniedError,
      },
      {
        error: new OrganizationRoleNotSupportedError({
          membershipRole: "legacy",
          message: "Role not supported",
          organizationId: decodeOrganizationId("org_sync"),
          userId: decodeUserId("user_sync"),
        }),
        expected: SyncAccessDeniedError,
      },
    ] as const;

    for (const actorErrorCase of actorErrorCases) {
      const result = await authorizeShape("jobs").pipe(
        Effect.provide(SyncAuthorizationService.DefaultWithoutDependencies),
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(CurrentOrganizationActor, {
              get: () => Effect.fail(actorErrorCase.error),
            }),
            Layer.succeed(
              HttpServerRequest.HttpServerRequest,
              {} as HttpServerRequest.HttpServerRequest
            )
          )
        ),
        effectEither,
        Effect.runPromise
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(actorErrorCase.expected);
      }
    }
  });
});

function readRequiredActivityRetainedAfter(params: unknown) {
  const retainedAfter =
    params !== null && typeof params === "object" && "2" in params
      ? (params as { readonly "2"?: unknown })["2"]
      : undefined;

  expect(retainedAfter).toBeTypeOf("string");

  return typeof retainedAfter === "string" ? retainedAfter : "";
}
