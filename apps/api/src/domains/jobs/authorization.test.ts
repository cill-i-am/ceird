import { randomUUID } from "node:crypto";

import { JobSchema, WorkItemId } from "@task-tracker/jobs-core";
import type { Job, UserId } from "@task-tracker/jobs-core";
import { Effect, ParseResult, Schema } from "effect";

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

describe("jobs authorization", () => {
  it("allows privileged roles and blocks member mutations outside the spec", async () => {
    const owner = makeActor("owner");
    const member = makeActor("member");
    const assignedJob = makeJob({
      assigneeId: member.userId,
    });
    const unassignedJob = makeJob();

    await expect(
      runAuthorization(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanCreate(owner);
          yield* authorization.ensureCanCreateSite(owner);
          yield* authorization.ensureCanPatch(owner, assignedJob.id);
          yield* authorization.ensureCanTransition(
            owner,
            assignedJob,
            "completed"
          );
        })
      )
    ).resolves.toBeUndefined();

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
          yield* authorization.ensureCanAddVisit(member, assignedJob);
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
});
