import { randomUUID } from "node:crypto";

import {
  JobAccessDeniedError,
  JobSchema,
  WorkItemId,
} from "@task-tracker/jobs-core";
import type { Job, UserId } from "@task-tracker/jobs-core";
import { Cause, Effect, Exit, Option, ParseResult, Schema } from "effect";

import { JobsAuthorization } from "./authorization.js";
import type { JobsActor as JobsActorType } from "./current-jobs-actor.js";

const decodeJob = ParseResult.decodeUnknownSync(JobSchema);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);

function makeActor(
  role: JobsActorType["role"],
  overrides: Partial<JobsActorType> = {}
): JobsActorType {
  return {
    organizationId: "org_123" as JobsActorType["organizationId"],
    role,
    userId: "user_123" as UserId,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}) {
  return decodeJob({
    assigneeId: undefined,
    blockedReason: undefined,
    completedAt: undefined,
    completedByUserId: undefined,
    contactId: undefined,
    coordinatorId: undefined,
    createdAt: "2026-04-22T10:00:00.000Z",
    createdByUserId: "user_creator" as UserId,
    id: decodeWorkItemId(randomUUID()),
    kind: "job",
    labels: [],
    priority: "none",
    siteId: undefined,
    status: "in_progress",
    title: "Replace boiler valve",
    updatedAt: "2026-04-22T10:00:00.000Z",
    ...overrides,
  });
}

function runAuthorization<A>(
  effect: Effect.Effect<A, unknown, JobsAuthorization>
) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(JobsAuthorization.Default))
  );
}

function runAuthorizationExit<A>(
  effect: Effect.Effect<A, unknown, JobsAuthorization>
) {
  return Effect.runPromiseExit(
    effect.pipe(Effect.provide(JobsAuthorization.Default))
  );
}

async function expectAccessDeniedForWorkItem(
  effect: Effect.Effect<unknown, unknown, JobsAuthorization>,
  workItemId: ReturnType<typeof decodeWorkItemId>
) {
  const exit = await runAuthorizationExit(effect);

  expect(exit._tag).toBe("Failure");

  if (Exit.isSuccess(exit)) {
    throw new Error("Expected authorization to fail.");
  }

  expect(Option.getOrUndefined(Cause.failureOption(exit.cause))).toMatchObject({
    workItemId,
  });
}

describe("jobs authorization", () => {
  it("allows owner and admin elevated job access", async () => {
    const owner = makeActor("owner");
    const admin = makeActor("admin");
    const job = makeJob();

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanCreate(owner);
          yield* authorization.ensureCanCreateSite(owner);
          yield* authorization.ensureCanManageLabels(owner);
          yield* authorization.ensureCanManageCollaborators(owner, job.id);
          yield* authorization.ensureCanAssignLabels(admin, job);
          yield* authorization.ensureCanPatch(admin, job.id);
          yield* authorization.ensureCanTransition(admin, job, "completed");
          yield* authorization.ensureCanViewJobDetail(admin, job.id);
          yield* authorization.ensureCanComment(admin, job.id);
          yield* authorization.ensureCanViewOrganizationActivity(owner);
        })
      )
    ).resolves.toBeUndefined();
  }, 10_000);

  it("keeps internal member assigned-job behavior", async () => {
    const member = makeActor("member");
    const assignedJob = makeJob({
      assigneeId: member.userId,
    });
    const unassignedJob = makeJob();

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanView(member);
          yield* authorization.ensureCanViewJobDetail(member, assignedJob.id);
          yield* authorization.ensureCanComment(member, assignedJob.id);
          yield* authorization.ensureCanAssignLabels(member, assignedJob);
          yield* authorization.ensureCanAddVisit(member, assignedJob);
          yield* authorization.ensureCanAddCostLine(member, assignedJob);
          yield* authorization.ensureCanTransition(
            member,
            assignedJob,
            "blocked"
          );
          yield* authorization.ensureCanReopen(member, assignedJob);
        })
      )
    ).resolves.toBeUndefined();

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanManageLabels(member);
        })
      )
    ).rejects.toMatchObject({
      message: "Only organization owners and admins can manage job labels",
    });

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanAssignLabels(member, unassignedJob);
        })
      )
    ).rejects.toMatchObject({
      message: "Members can only assign labels on jobs assigned to them",
    });

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanViewOrganizationActivity(member);
        })
      )
    ).rejects.toMatchObject({
      message:
        "Only organization owners and admins can view organization activity",
    });

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanCreateSite(member);
        })
      )
    ).rejects.toMatchObject({
      message: "Only organization owners and admins can create sites",
    });

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanPatch(member, assignedJob.id);
        })
      )
    ).rejects.toMatchObject({
      message: "Only organization owners and admins can edit jobs",
    });

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanTransition(
            member,
            makeJob({
              assigneeId: member.userId,
              blockedReason: "Awaiting access",
              status: "blocked",
            }),
            "completed"
          );
        })
      )
    ).rejects.toMatchObject({
      message: "Members cannot make that status change on the job",
    });

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanTransition(
            member,
            unassignedJob,
            "blocked"
          );
        })
      )
    ).rejects.toMatchObject({
      message: "Members can only change status on jobs assigned to them",
    });
  }, 10_000);

  it("allows external actors to enter jobs but requires grants for job detail", async () => {
    const external = makeActor("external");
    const workItemId = decodeWorkItemId(randomUUID());

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanView(external);
          yield* authorization.ensureCanViewJobDetail(external, workItemId, {
            accessLevel: "read",
          });
        })
      )
    ).resolves.toBeUndefined();

    await expectAccessDeniedForWorkItem(
      JobsAuthorization.ensureCanViewJobDetail(external, workItemId),
      workItemId
    );
  }, 10_000);

  it("allows external comments only with a comment grant", async () => {
    const external = makeActor("external");
    const workItemId = decodeWorkItemId(randomUUID());

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanComment(external, workItemId, {
            accessLevel: "comment",
          });
        })
      )
    ).resolves.toBeUndefined();

    await expectAccessDeniedForWorkItem(
      JobsAuthorization.ensureCanComment(external, workItemId, {
        accessLevel: "read",
      }),
      workItemId
    );
  }, 10_000);

  it("fails closed for external mutation paths except comment", async () => {
    const external = makeActor("external");
    const job = makeJob({
      assigneeId: external.userId,
    });

    const authorizationChecks = await Promise.all([
      runAuthorizationExit(JobsAuthorization.ensureCanCreate(external)),
      runAuthorizationExit(JobsAuthorization.ensureCanCreateSite(external)),
      runAuthorizationExit(
        JobsAuthorization.ensureCanManageConfiguration(external)
      ),
      runAuthorizationExit(JobsAuthorization.ensureCanManageLabels(external)),
      runAuthorizationExit(
        JobsAuthorization.ensureCanManageCollaborators(external, job.id)
      ),
      runAuthorizationExit(JobsAuthorization.ensureCanPatch(external, job.id)),
      runAuthorizationExit(
        JobsAuthorization.ensureCanAssignLabels(external, job)
      ),
      runAuthorizationExit(JobsAuthorization.ensureCanAddVisit(external, job)),
      runAuthorizationExit(
        JobsAuthorization.ensureCanAddCostLine(external, job)
      ),
      runAuthorizationExit(
        JobsAuthorization.ensureCanTransition(external, job, "completed")
      ),
      runAuthorizationExit(JobsAuthorization.ensureCanReopen(external, job)),
      runAuthorizationExit(
        JobsAuthorization.ensureCanViewOrganizationActivity(external)
      ),
    ]);

    expect([
      authorizationChecks
        .map((exit) =>
          Exit.isFailure(exit)
            ? Option.getOrUndefined(Cause.failureOption(exit.cause))
            : undefined
        )
        .every((check) => check instanceof JobAccessDeniedError),
    ]).toStrictEqual([true]);
    expect(authorizationChecks).toHaveLength(12);
  }, 10_000);
});
