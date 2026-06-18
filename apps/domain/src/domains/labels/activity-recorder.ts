import type {
  ActivityEventType,
  ProductActivityEventDisplayPayload,
} from "@ceird/activity-core";
import type { Label } from "@ceird/labels-core";
import { Context, Effect, Layer, Option } from "effect";

import {
  ActivityEventsRepository,
  ProductActivityActorsRepository,
} from "../activity/repository.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { RouteInvocationContext } from "../proximity/service.js";

const ACTIVITY_DETAIL_MAX_LENGTH = 280;
const ACTIVITY_ROUTE_LABEL_MAX_LENGTH = 80;

export class LabelActivityRecorder extends Context.Service<LabelActivityRecorder>()(
  "@ceird/domains/labels/LabelActivityRecorder",
  {
    make: Effect.gen(function* LabelActivityRecorderLive() {
      const activityEventsRepository = yield* ActivityEventsRepository;
      const productActivityActorsRepository =
        yield* ProductActivityActorsRepository;

      const recordCreated = Effect.fn("LabelActivityRecorder.recordCreated")(
        function* (actor: OrganizationActor, label: Label) {
          yield* recordLabelActivity({
            activityEventsRepository,
            actor,
            eventType: "label.created",
            label,
            productActivityActorsRepository,
          });
        }
      );

      const recordUpdated = Effect.fn("LabelActivityRecorder.recordUpdated")(
        function* (actor: OrganizationActor, label: Label) {
          yield* recordLabelActivity({
            activityEventsRepository,
            actor,
            eventType: "label.updated",
            label,
            productActivityActorsRepository,
          });
        }
      );

      const recordArchived = Effect.fn("LabelActivityRecorder.recordArchived")(
        function* (actor: OrganizationActor, label: Label) {
          yield* recordLabelActivity({
            activityEventsRepository,
            actor,
            eventType: "label.archived",
            label,
            productActivityActorsRepository,
          });
        }
      );

      return {
        recordArchived,
        recordCreated,
        recordUpdated,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    LabelActivityRecorder,
    LabelActivityRecorder.make
  );
  static readonly Default =
    LabelActivityRecorder.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          ActivityEventsRepository.Default,
          ProductActivityActorsRepository.Default
        )
      )
    );
}

function recordLabelActivity({
  activityEventsRepository,
  actor,
  eventType,
  label,
  productActivityActorsRepository,
}: {
  readonly activityEventsRepository: Context.Service.Shape<
    typeof ActivityEventsRepository
  >;
  readonly actor: OrganizationActor;
  readonly eventType: ActivityEventType;
  readonly label: Label;
  readonly productActivityActorsRepository: Context.Service.Shape<
    typeof ProductActivityActorsRepository
  >;
}) {
  return Effect.gen(function* () {
    const routeInvocation = yield* Effect.serviceOption(RouteInvocationContext);
    const agentContext = Option.getOrUndefined(routeInvocation);
    const productActor = agentContext?.agentThreadId
      ? yield* productActivityActorsRepository.ensureAgentActor({
          agentThreadId: agentContext.agentThreadId,
          organizationId: actor.organizationId,
          userId: actor.userId,
        })
      : yield* productActivityActorsRepository.ensureMemberActor({
          organizationId: actor.organizationId,
          userId: actor.userId,
        });
    const source = agentContext?.agentActionRunId
      ? {
          sourceId: buildAgentLabelActivitySourceId(
            agentContext.agentActionRunId,
            eventType,
            label
          ),
          sourceType: "agent_action_run" as const,
        }
      : {
          sourceId: buildLabelActivitySourceId(eventType, label),
          sourceType: "label" as const,
        };

    yield* activityEventsRepository.recordEvent({
      actorId: productActor.actor.id,
      display: buildLabelActivityDisplay(eventType, label),
      eventType,
      organizationId: actor.organizationId,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      status: "synced",
      targetId: label.id,
      targetType: "label",
    });
  });
}

function buildLabelActivityDisplay(
  eventType: ActivityEventType,
  label: Label
): ProductActivityEventDisplayPayload {
  const labelName = formatActivityDisplayText(
    label.name,
    ACTIVITY_DETAIL_MAX_LENGTH
  );
  const routeLabel = formatActivityDisplayText(
    label.name,
    ACTIVITY_ROUTE_LABEL_MAX_LENGTH
  );

  switch (eventType) {
    case "label.created": {
      return {
        detail: `Label "${labelName}" was created.`,
        route: {
          href: "/organization/settings/labels",
          label: routeLabel,
        },
        summary: "Label created",
      };
    }
    case "label.updated": {
      return {
        detail: `Label was renamed to "${labelName}".`,
        route: {
          href: "/organization/settings/labels",
          label: routeLabel,
        },
        summary: "Label renamed",
      };
    }
    case "label.archived": {
      return {
        detail: `Label "${labelName}" was archived.`,
        route: {
          href: "/organization/settings/labels",
          label: routeLabel,
        },
        summary: "Label archived",
      };
    }
    default: {
      throw new Error(`Unsupported label activity event type: ${eventType}`);
    }
  }
}

function buildLabelActivitySourceId(
  eventType: ActivityEventType,
  label: Label
): string {
  if (eventType === "label.created") {
    return `${eventType}:${label.id}`;
  }

  return `${eventType}:${label.id}:${label.updatedAt}`;
}

function buildAgentLabelActivitySourceId(
  agentActionRunId: string,
  eventType: ActivityEventType,
  label: Label
): string {
  return `${agentActionRunId}:${buildLabelActivitySourceId(eventType, label)}`;
}

function formatActivityDisplayText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}
