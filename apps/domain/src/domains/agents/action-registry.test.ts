import {
  AGENT_ACTIONS,
  AGENT_EXECUTABLE_ACTIONS,
  AgentActionRejectedError,
} from "@ceird/agents-core";
import type { ExecutableAgentActionName } from "@ceird/agents-core";
import { Effect, Layer } from "effect";

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
  domainAgentActions,
  domainAgentActionsByName,
} from "./action-registry.js";
import { AgentActions } from "./actions.js";

const actor = {
  organizationId: "org_123",
  role: "owner",
  userId: "user_123",
} as OrganizationActor;

describe("domain agent action registry", () => {
  it("executes labels list through the registered domain handler", async () => {
    const result = await Effect.runPromise(
      runAgentAction("ceird.labels.list", {})
    );

    expect(result).toStrictEqual({ labels: [] });
  });

  it("rejects executable actions without a registered domain handler", async () => {
    const originalHandler = domainAgentActionsByName.get("ceird.labels.list");
    domainAgentActionsByName.delete("ceird.labels.list");

    try {
      const error = await Effect.runPromise(
        runAgentAction("ceird.labels.list", {}).pipe(Effect.flip)
      );

      expect(error).toBeInstanceOf(AgentActionRejectedError);
      expect(error).toMatchObject({
        message: "Unsupported agent action: ceird.labels.list",
        name: "ceird.labels.list",
      });
    } finally {
      if (originalHandler !== undefined) {
        domainAgentActionsByName.set("ceird.labels.list", originalHandler);
      }
    }
  });

  it("registers a domain handler for every executable action", () => {
    expect([...domainAgentActionsByName.keys()].toSorted()).toStrictEqual(
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
        (name) =>
          !domainAgentActionsByName.has(name as ExecutableAgentActionName)
      )
    ).toBeTruthy();
    expect(domainAgentActions).toHaveLength(AGENT_EXECUTABLE_ACTIONS.length);
  });
});

function runAgentAction(name: ExecutableAgentActionName, input: unknown) {
  return AgentActions.execute(actor, name, input).pipe(
    Effect.provide(
      Layer.provide(
        AgentActions.DefaultWithoutDependencies,
        makeAgentActionsTestLayer()
      )
    )
  );
}

function makeAgentActionsTestLayer() {
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
        list: () => Effect.succeed([]),
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
