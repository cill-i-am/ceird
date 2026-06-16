/* oxlint-disable unicorn/no-array-method-this-argument */
import type {
  Job,
  JobActivityPayload,
  JobComment,
  VisitIdType as VisitId,
} from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import { Context, Effect, Layer } from "effect";

import { ActivityEventsRepository } from "../activity/repository.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { JobsRepository } from "./repositories.js";

const ACTIVITY_DETAIL_MAX_LENGTH = 280;

export class JobsActivityRecorder extends Context.Service<JobsActivityRecorder>()(
  "@ceird/domains/jobs/JobsActivityRecorder",
  {
    make: Effect.gen(function* JobsActivityRecorderLive() {
      const activityEvents = yield* ActivityEventsRepository;
      const repository = yield* JobsRepository;

      const recordCreated = Effect.fn("JobsActivityRecorder.recordCreated")(
        function* (actor: OrganizationActor, job: Job) {
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
        function* (actor: OrganizationActor, before: Job, after: Job) {
          yield* recordActivities(
            actor,
            before.id,
            collectPatchEvents(before, after)
          );
        }
      );

      const recordTransition = Effect.fn(
        "JobsActivityRecorder.recordTransition"
      )(function* (actor: OrganizationActor, before: Job, after: Job) {
        yield* recordActivities(
          actor,
          before.id,
          collectTransitionEvents(before, after)
        );
      });

      const recordActivities = Effect.fn(
        "JobsActivityRecorder.recordActivities"
      )(function* (
        actor: OrganizationActor,
        workItemId: Job["id"],
        events: readonly JobActivityPayload[]
      ) {
        yield* Effect.forEach(events, (payload) =>
          repository.addActivity({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
            payload,
            workItemId,
          })
        );
      });

      const recordReopened = Effect.fn("JobsActivityRecorder.recordReopened")(
        function* (actor: OrganizationActor, job: Job) {
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

      const recordLabelAssigned = Effect.fn(
        "JobsActivityRecorder.recordLabelAssigned"
      )(function* (actor: OrganizationActor, job: Job, label: Label) {
        yield* repository.addActivity({
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          payload: {
            eventType: "label_added",
            labelId: label.id,
            labelName: label.name,
          },
          workItemId: job.id,
        });
      });

      const recordLabelRemoved = Effect.fn(
        "JobsActivityRecorder.recordLabelRemoved"
      )(function* (actor: OrganizationActor, job: Job, label: Label) {
        yield* recordLabelRemovedFromWorkItem(actor, job.id, label);
      });

      const recordLabelRemovedFromWorkItem = Effect.fn(
        "JobsActivityRecorder.recordLabelRemovedFromWorkItem"
      )(function* (
        actor: OrganizationActor,
        workItemId: Job["id"],
        label: Label
      ) {
        yield* repository.addActivity({
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          payload: {
            eventType: "label_removed",
            labelId: label.id,
            labelName: label.name,
          },
          workItemId,
        });
      });

      const recordVisitLogged = Effect.fn(
        "JobsActivityRecorder.recordVisitLogged"
      )(function* (
        actor: OrganizationActor,
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

      const recordCommentCreated = Effect.fn(
        "JobsActivityRecorder.recordCommentCreated"
      )(function* (actor: OrganizationActor, job: Job, comment: JobComment) {
        if (comment.actor === undefined) {
          return;
        }

        yield* activityEvents.recordEvent({
          actorId: comment.actor.id,
          display: {
            detail: summarizeCommentActivityDetail(comment.body),
            route: {
              href: `/jobs-workspace?detailJobId=${job.id}`,
              label: job.title,
            },
            summary: `Commented on ${job.title}`,
          },
          eventType: "comment.created",
          organizationId: actor.organizationId,
          sourceId: comment.id,
          sourceType: "comment",
          status: "synced",
          targetId: comment.id,
          targetType: "comment",
        });
      });

      return {
        recordCommentCreated,
        recordCreated,
        recordLabelAssigned,
        recordLabelRemoved,
        recordLabelRemovedFromWorkItem,
        recordPatched,
        recordReopened,
        recordTransition,
        recordVisitLogged,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    JobsActivityRecorder,
    JobsActivityRecorder.make
  );
  static readonly Default =
    JobsActivityRecorder.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(ActivityEventsRepository.Default, JobsRepository.Default)
      )
    );
}

function summarizeCommentActivityDetail(body: string): string {
  if (body.length <= ACTIVITY_DETAIL_MAX_LENGTH) {
    return body;
  }

  return `${body.slice(0, ACTIVITY_DETAIL_MAX_LENGTH - 3)}...`;
}

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
