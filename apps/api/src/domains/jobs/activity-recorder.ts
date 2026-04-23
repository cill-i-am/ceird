/* oxlint-disable unicorn/no-array-method-this-argument */
import type {
  Job,
  JobActivityPayload,
  VisitIdType as VisitId,
} from "@task-tracker/jobs-core";
import { Effect } from "effect";

import type { JobsActor } from "./current-jobs-actor.js";
import { JobsRepository } from "./repositories.js";

export class JobsActivityRecorder extends Effect.Service<JobsActivityRecorder>()(
  "@task-tracker/domains/jobs/JobsActivityRecorder",
  {
    accessors: true,
    dependencies: [JobsRepository.Default],
    effect: Effect.gen(function* JobsActivityRecorderLive() {
      const repository = yield* JobsRepository;

      const recordCreated = Effect.fn("JobsActivityRecorder.recordCreated")(
        function* (actor: JobsActor, job: Job) {
          yield* repository.addActivity({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
            payload: {
              eventType: "job_created",
              kind: job.kind,
              priority: job.priority,
              title: job.title,
            },
            workItemId: job.id,
          });
        }
      );

      const recordPatched = Effect.fn("JobsActivityRecorder.recordPatched")(
        function* (actor: JobsActor, before: Job, after: Job) {
          const events = collectPatchEvents(before, after);

          yield* Effect.forEach(events, (payload) =>
            repository.addActivity({
              actorUserId: actor.userId,
              organizationId: actor.organizationId,
              payload,
              workItemId: before.id,
            })
          );
        }
      );

      const recordTransition = Effect.fn(
        "JobsActivityRecorder.recordTransition"
      )(function* (actor: JobsActor, before: Job, after: Job) {
        const events = collectTransitionEvents(before, after);

        yield* Effect.forEach(events, (payload) =>
          repository.addActivity({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
            payload,
            workItemId: before.id,
          })
        );
      });

      const recordReopened = Effect.fn("JobsActivityRecorder.recordReopened")(
        function* (actor: JobsActor, job: Job) {
          yield* repository.addActivity({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
            payload: {
              eventType: "job_reopened",
            },
            workItemId: job.id,
          });
        }
      );

      const recordVisitLogged = Effect.fn(
        "JobsActivityRecorder.recordVisitLogged"
      )(function* (
        actor: JobsActor,
        input: {
          readonly visitId: VisitId;
          readonly workItemId: Job["id"];
        }
      ) {
        yield* repository.addActivity({
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          payload: {
            eventType: "visit_logged",
            visitId: input.visitId,
          },
          workItemId: input.workItemId,
        });
      });

      return {
        recordCreated,
        recordPatched,
        recordReopened,
        recordTransition,
        recordVisitLogged,
      };
    }),
  }
) {}

function collectPatchEvents(
  before: Job,
  after: Job
): readonly JobActivityPayload[] {
  const events: JobActivityPayload[] = [];

  if (before.priority !== after.priority) {
    events.push({
      eventType: "priority_changed",
      fromPriority: before.priority,
      toPriority: after.priority,
    });
  }

  if (before.assigneeId !== after.assigneeId) {
    events.push({
      eventType: "assignee_changed",
      fromAssigneeId: before.assigneeId,
      toAssigneeId: after.assigneeId,
    });
  }

  if (before.coordinatorId !== after.coordinatorId) {
    events.push({
      eventType: "coordinator_changed",
      fromCoordinatorId: before.coordinatorId,
      toCoordinatorId: after.coordinatorId,
    });
  }

  if (before.siteId !== after.siteId) {
    events.push({
      eventType: "site_changed",
      fromSiteId: before.siteId,
      toSiteId: after.siteId,
    });
  }

  if (before.contactId !== after.contactId) {
    events.push({
      eventType: "contact_changed",
      fromContactId: before.contactId,
      toContactId: after.contactId,
    });
  }

  return events;
}

function collectTransitionEvents(
  before: Job,
  after: Job
): readonly JobActivityPayload[] {
  const events: JobActivityPayload[] = [];

  if (before.status !== after.status) {
    events.push({
      eventType: "status_changed",
      fromStatus: before.status,
      toStatus: after.status,
    });
  }

  if (before.blockedReason !== after.blockedReason) {
    events.push({
      eventType: "blocked_reason_changed",
      fromBlockedReason: before.blockedReason ?? null,
      toBlockedReason: after.blockedReason ?? null,
    });
  }

  return events;
}
