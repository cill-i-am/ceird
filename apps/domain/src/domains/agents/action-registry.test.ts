import {
  AGENT_ACTIONS,
  AGENT_EXECUTABLE_ACTIONS,
  AgentActionRejectedError,
} from "@ceird/agents-core";
import type { AgentActionName } from "@ceird/agents-core";
import { LabelNameConflictError } from "@ceird/labels-core";
import type {
  Label,
  LabelIdType as LabelId,
  LabelName,
} from "@ceird/labels-core";
import { Effect, Layer, Option } from "effect";

import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
} from "../jobs/repositories.js";
import { LabelsRepository } from "../labels/repositories.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import {
  ServiceAreasRepository,
  SitesRepository,
} from "../sites/repositories.js";
import {
  getDomainAgentActionHandler,
  getDomainAgentActionHandlerNames,
} from "./action-registry.js";
import { AgentActions } from "./actions.js";

const actor = {
  organizationId: "org_123",
  role: "owner",
  userId: "user_123",
} as OrganizationActor;
const labelId = "11111111-1111-4111-8111-111111111111" as LabelId;
const label = {
  createdAt: "2026-05-20T10:00:00.000Z",
  id: labelId,
  name: "Urgent" as LabelName,
  updatedAt: "2026-05-20T10:00:00.000Z",
} satisfies Label;

describe("domain agent action registry", () => {
  it("executes labels list through the registered domain handler", async () => {
    const result = await Effect.runPromise(
      runAgentAction("ceird.labels.list", {})
    );

    expect(result).toStrictEqual({ labels: [] });
  });

  it("executes labels create through the registered domain handler", async () => {
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runAgentAction(
        "ceird.labels.create",
        { name: "  Urgent  " },
        {
          create: (input) => {
            calls.push(input);

            return Effect.succeed(label);
          },
        }
      )
    );

    expect(result).toStrictEqual(label);
    expect(calls).toStrictEqual([
      { name: "Urgent", organizationId: actor.organizationId },
    ]);
  });

  it("executes labels update through the registered domain handler", async () => {
    const updatedLabel = {
      ...label,
      name: "Important" as LabelName,
      updatedAt: "2026-05-20T10:05:00.000Z",
    } satisfies Label;
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runAgentAction(
        "ceird.labels.update",
        { input: { name: "  Important  " }, labelId },
        {
          update: (organizationId, updatedLabelId, input) => {
            calls.push({ input, labelId: updatedLabelId, organizationId });

            return Effect.succeed(Option.some(updatedLabel));
          },
        }
      )
    );

    expect(result).toStrictEqual(updatedLabel);
    expect(calls).toStrictEqual([
      {
        input: { name: "Important" },
        labelId,
        organizationId: actor.organizationId,
      },
    ]);
  });

  it("rejects labels update when the label is missing", async () => {
    const error = await Effect.runPromise(
      runAgentAction(
        "ceird.labels.update",
        { input: { name: "Important" }, labelId },
        {
          update: () => Effect.succeed(Option.none()),
        }
      ).pipe(Effect.flip)
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      message: "Label does not exist in the organization",
      name: "ceird.labels.update",
    });
  });

  it("executes labels delete through the registered domain handler", async () => {
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runAgentAction(
        "ceird.labels.delete",
        { labelId },
        {
          archive: (organizationId, archivedLabelId) => {
            calls.push({ labelId: archivedLabelId, organizationId });

            return Effect.succeed(Option.some(label));
          },
        }
      )
    );

    expect(result).toStrictEqual(label);
    expect(calls).toStrictEqual([
      { labelId, organizationId: actor.organizationId },
    ]);
  });

  it("maps label name conflicts to agent action rejections", async () => {
    const error = await Effect.runPromise(
      runAgentAction(
        "ceird.labels.create",
        { name: "Urgent" },
        {
          create: () =>
            Effect.fail(
              new LabelNameConflictError({
                message: "Label name already exists in the organization",
                name: "Urgent" as LabelName,
              })
            ),
        }
      ).pipe(Effect.flip)
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      message: "Label name already exists in the organization",
      name: "ceird.labels.create",
    });
  });

  it("rejects unsupported action names without mutating the registry", async () => {
    const missingAction = "ceird.missing.action" as AgentActionName;
    const error = await Effect.runPromise(
      runAgentAction(missingAction, {}).pipe(Effect.flip)
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      message: "Unsupported agent action: ceird.missing.action",
      name: missingAction,
    });
  });

  it("registers a domain handler for every executable action", () => {
    expect(getDomainAgentActionHandlerNames().toSorted()).toStrictEqual(
      AGENT_EXECUTABLE_ACTIONS.map((action) => action.name).toSorted()
    );
  });

  it("does not require handlers for planned actions", () => {
    const plannedActionNames = AGENT_ACTIONS.filter(
      (action) => action.executionStatus === "planned"
    ).map((action) => action.name);

    expect(plannedActionNames.length).toBeGreaterThan(0);
    expect(
      plannedActionNames.every(
        (name) => getDomainAgentActionHandler(name) === undefined
      )
    ).toBeTruthy();
    expect(getDomainAgentActionHandlerNames()).toHaveLength(
      AGENT_EXECUTABLE_ACTIONS.length
    );
  });
});

function runAgentAction(
  name: AgentActionName,
  input: unknown,
  labelsRepositoryOverrides: Partial<
    ContextService<typeof LabelsRepository>
  > = {}
) {
  return AgentActions.execute(actor, name, input).pipe(
    Effect.provide(
      Layer.provide(
        AgentActions.DefaultWithoutDependencies,
        makeAgentActionsTestLayer(labelsRepositoryOverrides)
      )
    )
  );
}

function makeAgentActionsTestLayer(
  labelsRepositoryOverrides: Partial<ContextService<typeof LabelsRepository>>
) {
  return Layer.mergeAll(
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    Layer.succeed(
      JobsActivityRecorder,
      JobsActivityRecorder.of({} as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsAuthorization,
      JobsAuthorization.of({} as ContextService<typeof JobsAuthorization>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({} as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({
        archive: () => Effect.succeed(Option.none()),
        create: () => Effect.succeed(label),
        list: () => Effect.succeed([]),
        update: () => Effect.succeed(Option.none()),
        ...labelsRepositoryOverrides,
      } as unknown as ContextService<typeof LabelsRepository>)
    ),
    OrganizationAuthorization.Default,
    Layer.succeed(
      ServiceAreasRepository,
      ServiceAreasRepository.of(
        {} as ContextService<typeof ServiceAreasRepository>
      )
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}

type ContextService<Service> = Service extends {
  of: (service: infer Value) => unknown;
}
  ? Value
  : never;
