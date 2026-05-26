import { JobSchema } from "@ceird/jobs-core";
import type { Job } from "@ceird/jobs-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import type { OrganizationActor } from "../organizations/current-actor.js";
import { JobsAuthorization } from "./authorization.js";

const owner = {
  organizationId: "org_123",
  role: "owner",
  userId: "user_owner",
} as OrganizationActor;
const member = {
  organizationId: "org_123",
  role: "member",
  userId: "user_member",
} as OrganizationActor;
const external = {
  organizationId: "org_123",
  role: "external",
  userId: "user_external",
} as OrganizationActor;
const decodeJob = Schema.decodeUnknownSync(JobSchema);
const assignedJob = decodeJob({
  assigneeId: member.userId,
  createdAt: "2026-05-20T09:00:00.000Z",
  createdByUserId: owner.userId,
  id: "11111111-1111-4111-8111-111111111111",
  kind: "job",
  labels: [],
  priority: "none",
  status: "new",
  title: "Inspect boiler",
  updatedAt: "2026-05-20T09:00:00.000Z",
}) satisfies Job;

describe("JobsAuthorization", () => {
  it("allows owners to create and patch jobs", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanCreate(owner);
          yield* authorization.ensureCanPatch(owner, assignedJob.id);
        }).pipe(Effect.provide(JobsAuthorization.Default))
      )
    ).resolves.toBeUndefined();
  });

  it("allows assigned members to add visits and transition within member rules", async () => {
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const authorization = yield* JobsAuthorization;
          yield* authorization.ensureCanAddVisit(member, assignedJob);
          yield* authorization.ensureCanTransition(
            member,
            assignedJob,
            "in_progress"
          );
        }).pipe(Effect.provide(JobsAuthorization.Default))
      )
    ).resolves.toBeUndefined();
  });

  it("requires grants for external job detail access", async () => {
    const denied = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanViewJobDetail(external, assignedJob.id).pipe(
        Effect.provide(JobsAuthorization.Default)
      )
    );
    const granted = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanViewJobDetail(external, assignedJob.id, {
        accessLevel: "comment",
      }).pipe(Effect.provide(JobsAuthorization.Default))
    );

    expect(denied._tag).toBe("Failure");
    expect(granted._tag).toBe("Success");
  });

  it("requires comment-level grants for external comments", async () => {
    const readOnly = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanComment(external, assignedJob.id, {
        accessLevel: "read",
      }).pipe(Effect.provide(JobsAuthorization.Default))
    );
    const comment = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanComment(external, assignedJob.id, {
        accessLevel: "comment",
      }).pipe(Effect.provide(JobsAuthorization.Default))
    );

    expect(readOnly._tag).toBe("Failure");
    expect(comment._tag).toBe("Success");
  });

  it("denies retained organization-wide and mutation actions to non-elevated actors", async () => {
    const create = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanCreate(member).pipe(
        Effect.provide(JobsAuthorization.Default)
      )
    );
    const patch = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanPatch(member, assignedJob.id).pipe(
        Effect.provide(JobsAuthorization.Default)
      )
    );
    const activity = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanViewOrganizationActivity(member).pipe(
        Effect.provide(JobsAuthorization.Default)
      )
    );
    const externalTransition = await Effect.runPromiseExit(
      JobsAuthorization.ensureCanTransition(
        external,
        assignedJob,
        "in_progress"
      ).pipe(Effect.provide(JobsAuthorization.Default))
    );

    expect(create._tag).toBe("Failure");
    expect(patch._tag).toBe("Failure");
    expect(activity._tag).toBe("Failure");
    expect(externalTransition._tag).toBe("Failure");
  });
});
