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
import type {
  ServiceArea,
  ServiceAreaIdType as ServiceAreaId,
} from "@ceird/sites-core";
import { ServiceAreaNotFoundError } from "@ceird/sites-core";
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
const serviceAreaId = "22222222-2222-4222-8222-222222222222" as ServiceAreaId;
const serviceArea = {
  description: "North city coverage",
  id: serviceAreaId,
  name: "North City",
} satisfies ServiceArea;

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

  it("executes service area list through the registered domain handler", async () => {
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runAgentAction(
        "ceird.service_areas.list",
        {},
        {},
        {
          list: (organizationId) => {
            calls.push({ organizationId });

            return Effect.succeed([serviceArea]);
          },
        }
      )
    );

    expect(result).toStrictEqual({ items: [serviceArea] });
    expect(calls).toStrictEqual([{ organizationId: actor.organizationId }]);
  });

  it("executes service area create through the registered domain handler", async () => {
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runAgentAction(
        "ceird.service_areas.create",
        { description: "  North city coverage  ", name: "  North City  " },
        {},
        {
          create: (input) => {
            calls.push(input);

            return Effect.succeed(serviceArea);
          },
        }
      )
    );

    expect(result).toStrictEqual(serviceArea);
    expect(calls).toStrictEqual([
      {
        description: "North city coverage",
        name: "North City",
        organizationId: actor.organizationId,
      },
    ]);
  });

  it("executes service area update through the registered domain handler", async () => {
    const updatedServiceArea = {
      description: "South city coverage",
      id: serviceAreaId,
      name: "South City",
    } satisfies ServiceArea;
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runAgentAction(
        "ceird.service_areas.update",
        {
          input: {
            description: "  South city coverage  ",
            name: "  South City  ",
          },
          serviceAreaId,
        },
        {},
        {
          update: (organizationId, updatedServiceAreaId, input) => {
            calls.push({
              input,
              organizationId,
              serviceAreaId: updatedServiceAreaId,
            });

            return Effect.succeed(updatedServiceArea);
          },
        }
      )
    );

    expect(result).toStrictEqual(updatedServiceArea);
    expect(calls).toStrictEqual([
      {
        input: {
          description: "South city coverage",
          name: "South City",
        },
        organizationId: actor.organizationId,
        serviceAreaId,
      },
    ]);
  });

  it("maps missing service areas to agent action rejections", async () => {
    const error = await Effect.runPromise(
      runAgentAction(
        "ceird.service_areas.update",
        { input: { name: "South City" }, serviceAreaId },
        {},
        {
          update: () =>
            Effect.fail(
              new ServiceAreaNotFoundError({
                message: "Service area does not exist in the organization",
                organizationId: actor.organizationId,
                serviceAreaId,
              })
            ),
        }
      ).pipe(Effect.flip)
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      message: "Service area does not exist in the organization",
      name: "ceird.service_areas.update",
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
  > = {},
  serviceAreasRepositoryOverrides: Partial<
    ContextService<typeof ServiceAreasRepository>
  > = {}
) {
  return AgentActions.execute(actor, name, input).pipe(
    Effect.provide(
      Layer.provide(
        AgentActions.DefaultWithoutDependencies,
        makeAgentActionsTestLayer(
          labelsRepositoryOverrides,
          serviceAreasRepositoryOverrides
        )
      )
    )
  );
}

function makeAgentActionsTestLayer(
  labelsRepositoryOverrides: Partial<ContextService<typeof LabelsRepository>>,
  serviceAreasRepositoryOverrides: Partial<
    ContextService<typeof ServiceAreasRepository>
  >
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
      ServiceAreasRepository.of({
        create: () => Effect.succeed(serviceArea),
        list: () => Effect.succeed([]),
        listOptions: () => Effect.succeed([]),
        update: () => Effect.succeed(serviceArea),
        ...serviceAreasRepositoryOverrides,
      } as unknown as ContextService<typeof ServiceAreasRepository>)
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
