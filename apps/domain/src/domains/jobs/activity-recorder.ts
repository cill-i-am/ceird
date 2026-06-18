/* oxlint-disable unicorn/no-array-method-this-argument */
import type {
  ActivityEventType,
  ProductActivityEventDisplayPayload,
} from "@ceird/activity-core";
import type {
  JobActivityEventType,
  Job,
  JobActivity,
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
const ACTIVITY_ROUTE_LABEL_MAX_LENGTH = 80;
const ACTIVITY_SUMMARY_MAX_LENGTH = 160;
const JOB_COMMENT_ACTIVITY_SUMMARY_PREFIX = "Commented on ";
type JobActivityTarget = Pick<Job, "id" | "title">;
const JOB_ACTIVITY_EVENT_TYPES = {
  assignee_changed: "job.assignee_changed",
  blocked_reason_changed: "job.blocked_reason_changed",
  contact_changed: "job.contact_changed",
  coordinator_changed: "job.coordinator_changed",
  job_created: "job.created",
  job_reopened: "job.reopened",
  label_added: "job.label_added",
  label_removed: "job.label_removed",
  priority_changed: "job.priority_changed",
  site_changed: "job.site_changed",
  status_changed: "job.status_changed",
  visit_logged: "job.visit_logged",
} satisfies Record<JobActivityEventType, ActivityEventType>;
const JOB_ACTIVITY_SUMMARY_PREFIXES = {
  assignee_changed: "Changed assignee on",
  blocked_reason_changed: "Changed blocked reason on",
  contact_changed: "Changed contact on",
  coordinator_changed: "Changed coordinator on",
  job_created: "Created",
  job_reopened: "Reopened",
  label_added: "Added label to",
  label_removed: "Removed label from",
  priority_changed: "Changed priority on",
  site_changed: "Changed site on",
  status_changed: "Changed status on",
  visit_logged: "Logged visit on",
} satisfies Record<JobActivityEventType, string>;

export class JobsActivityRecorder extends Context.Service<JobsActivityRecorder>()(
  "@ceird/domains/jobs/JobsActivityRecorder",
  {
    make: Effect.gen(function* JobsActivityRecorderLive() {
      const activityEvents = yield* ActivityEventsRepository;
      const repository = yield* JobsRepository;

      const recordCreated = Effect.fn("JobsActivityRecorder.recordCreated")(
        function* (actor: OrganizationActor, job: Job) {
          const activity = yield* repository.addActivity({
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

          yield* recordJobActivityEvent(actor, job, activity, activityEvents);
        }
      );

      const recordPatched = Effect.fn("JobsActivityRecorder.recordPatched")(
        function* (actor: OrganizationActor, before: Job, after: Job) {
          yield* recordActivities(
            actor,
            after,
            collectPatchEvents(before, after)
          );
        }
      );

      const recordTransition = Effect.fn(
        "JobsActivityRecorder.recordTransition"
      )(function* (actor: OrganizationActor, before: Job, after: Job) {
        yield* recordActivities(
          actor,
          after,
          collectTransitionEvents(before, after)
        );
      });

      const recordActivities = Effect.fn(
        "JobsActivityRecorder.recordActivities"
      )(function* (
        actor: OrganizationActor,
        job: JobActivityTarget,
        events: readonly JobActivityPayload[]
      ) {
        yield* Effect.forEach(events, (payload) =>
          repository
            .addActivity({
              actorUserId: actor.userId,
              organizationId: actor.organizationId,
              payload,
              workItemId: job.id,
            })
            .pipe(
              Effect.flatMap((activity) =>
                recordJobActivityEvent(actor, job, activity, activityEvents)
              )
            )
        );
      });

      const recordReopened = Effect.fn("JobsActivityRecorder.recordReopened")(
        function* (actor: OrganizationActor, job: Job) {
          const activity = yield* repository.addActivity({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
            payload: {
              eventType: "job_reopened",
            },
            workItemId: job.id,
          });

          yield* recordJobActivityEvent(actor, job, activity, activityEvents);
        }
      );

      const recordLabelAssigned = Effect.fn(
        "JobsActivityRecorder.recordLabelAssigned"
      )(function* (actor: OrganizationActor, job: Job, label: Label) {
        const activity = yield* repository.addActivity({
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          payload: {
            eventType: "label_added",
            labelId: label.id,
            labelName: label.name,
          },
          workItemId: job.id,
        });

        yield* recordJobActivityEvent(actor, job, activity, activityEvents);
      });

      const recordLabelRemoved = Effect.fn(
        "JobsActivityRecorder.recordLabelRemoved"
      )(function* (actor: OrganizationActor, job: Job, label: Label) {
        const activity = yield* addLabelRemovedActivity(actor, job.id, label);

        yield* recordJobActivityEvent(actor, job, activity, activityEvents);
      });

      const recordLabelRemovedFromWorkItem = Effect.fn(
        "JobsActivityRecorder.recordLabelRemovedFromWorkItem"
      )(function* (
        actor: OrganizationActor,
        workItemId: Job["id"],
        label: Label
      ) {
        const activity = yield* addLabelRemovedActivity(
          actor,
          workItemId,
          label
        );

        yield* recordJobActivityEvent(
          actor,
          { id: workItemId, title: label.name },
          activity,
          activityEvents
        );
      });

      const addLabelRemovedActivity = Effect.fn(
        "JobsActivityRecorder.addLabelRemovedActivity"
      )((actor: OrganizationActor, workItemId: Job["id"], label: Label) =>
        repository.addActivity({
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          payload: {
            eventType: "label_removed",
            labelId: label.id,
            labelName: label.name,
          },
          workItemId,
        })
      );

      const recordVisitLogged = Effect.fn(
        "JobsActivityRecorder.recordVisitLogged"
      )(function* (
        actor: OrganizationActor,
        input: {
          readonly job: JobActivityTarget;
          readonly visitId: VisitId;
        }
      ) {
        const activity = yield* repository.addActivity({
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          payload: {
            eventType: "visit_logged",
            visitId: input.visitId,
          },
          workItemId: input.job.id,
        });

        yield* recordJobActivityEvent(
          actor,
          input.job,
          activity,
          activityEvents
        );
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
              label: formatActivityDisplayText(
                job.title,
                ACTIVITY_ROUTE_LABEL_MAX_LENGTH
              ),
            },
            summary: formatJobCommentActivitySummary(job.title),
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
  return formatActivityDisplayText(body, ACTIVITY_DETAIL_MAX_LENGTH);
}

function formatJobCommentActivitySummary(jobTitle: string): string {
  return `${JOB_COMMENT_ACTIVITY_SUMMARY_PREFIX}${formatActivityDisplayText(
    jobTitle,
    ACTIVITY_SUMMARY_MAX_LENGTH - JOB_COMMENT_ACTIVITY_SUMMARY_PREFIX.length
  )}`;
}

function recordJobActivityEvent(
  actor: OrganizationActor,
  job: JobActivityTarget,
  activity: JobActivity,
  activityEvents: Context.Service.Shape<typeof ActivityEventsRepository>
) {
  if (activity.actor === undefined) {
    return Effect.void;
  }

  return activityEvents.recordEvent({
    actorId: activity.actor.id,
    createdAt: new Date(activity.createdAt),
    display: buildJobActivityDisplay(job, activity.payload),
    eventType: toActivityEventType(activity.payload.eventType),
    organizationId: actor.organizationId,
    sourceId: activity.id,
    sourceType: "job_activity",
    status: "synced",
    targetId: job.id,
    targetType: "job",
  });
}

function buildJobActivityDisplay(
  job: JobActivityTarget,
  payload: JobActivityPayload
): ProductActivityEventDisplayPayload {
  const route = {
    href: `/jobs-workspace?detailJobId=${job.id}`,
    label: formatActivityDisplayText(
      job.title,
      ACTIVITY_ROUTE_LABEL_MAX_LENGTH
    ),
  };
  const detail = buildJobActivityDetail(payload);
  const display = {
    route,
    summary: formatJobActivitySummary(
      JOB_ACTIVITY_SUMMARY_PREFIXES[payload.eventType],
      job.title
    ),
  };

  if (detail === undefined) {
    return display;
  }

  return { ...display, detail };
}

function toActivityEventType(
  eventType: JobActivityEventType
): ActivityEventType {
  return JOB_ACTIVITY_EVENT_TYPES[eventType];
}

function buildJobActivityDetail(
  payload: JobActivityPayload
): string | undefined {
  if (payload.eventType === "blocked_reason_changed") {
    return formatOptionalChange(
      payload.fromBlockedReason,
      payload.toBlockedReason
    );
  }

  if (payload.eventType === "job_created") {
    return `Priority: ${payload.priority}`;
  }

  if (payload.eventType === "label_added") {
    return formatActivityDisplayText(
      `Added label ${payload.labelName}`,
      ACTIVITY_DETAIL_MAX_LENGTH
    );
  }

  if (payload.eventType === "label_removed") {
    return formatActivityDisplayText(
      `Removed label ${payload.labelName}`,
      ACTIVITY_DETAIL_MAX_LENGTH
    );
  }

  if (payload.eventType === "priority_changed") {
    return `Priority changed from ${payload.fromPriority} to ${payload.toPriority}`;
  }

  if (payload.eventType === "status_changed") {
    return `Status changed from ${payload.fromStatus} to ${payload.toStatus}`;
  }

  return undefined;
}

function formatJobActivitySummary(prefix: string, jobTitle: string): string {
  return `${prefix} ${formatActivityDisplayText(
    jobTitle,
    ACTIVITY_SUMMARY_MAX_LENGTH - prefix.length - 1
  )}`;
}

function formatOptionalChange(
  fromValue: string | null,
  toValue: string | null
): string {
  return formatActivityDisplayText(
    `Changed from ${fromValue ?? "none"} to ${toValue ?? "none"}`,
    ACTIVITY_DETAIL_MAX_LENGTH
  );
}

function formatActivityDisplayText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
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
