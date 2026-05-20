import {
  AGENT_ACTIONS,
  AGENT_EXECUTABLE_ACTIONS,
  AgentAccessDeniedError,
  AgentActionRejectedError,
  AgentStorageError,
} from "@ceird/agents-core";
import type { AgentActionName } from "@ceird/agents-core";
import type { CommentIdType as CommentId } from "@ceird/comments-core";
import { LabelNameConflictError } from "@ceird/labels-core";
import type {
  Label,
  LabelIdType as LabelId,
  LabelName,
} from "@ceird/labels-core";
import type {
  ServiceArea,
  ServiceAreaIdType as ServiceAreaId,
  SiteIdType as SiteId,
  SiteOption,
} from "@ceird/sites-core";
import {
  ServiceAreaNotFoundError,
  SiteAccessDeniedError,
  SiteGeocodingProviderError,
  SiteNotFoundError,
  SiteStorageError,
} from "@ceird/sites-core";
import { HttpServerRequest } from "@effect/platform";
import { Effect, Layer, Option } from "effect";

import { CommentsRepository } from "../comments/repository.js";
import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
} from "../jobs/repositories.js";
import { LabelsRepository } from "../labels/repositories.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { SiteGeocoder } from "../sites/geocoder.js";
import type { SiteGeocoderImplementation } from "../sites/geocoder.js";
import {
  ServiceAreasRepository,
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "../sites/repositories.js";
import { SitesService } from "../sites/service.js";
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
const siteId = "33333333-3333-4333-8333-333333333333" as SiteId;
const commentId = "44444444-4444-4444-8444-444444444444" as CommentId;
const site = {
  accessNotes: "Use the side gate",
  addressLine1: "1 Main Street",
  country: "IE",
  county: "Dublin",
  eircode: "D02 XY01",
  geocodedAt: "2026-05-20T10:00:00.000Z",
  geocodingProvider: "stub",
  id: siteId,
  labels: [],
  latitude: 53.3498,
  longitude: -6.2603,
  name: "Main Site",
} satisfies SiteOption;

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

  it("executes site list through SitesService with decoded query", async () => {
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runDomainHandler("ceird.sites.list", {
        limit: "25",
        serviceAreaId,
      }).pipe(
        Effect.provideService(
          SitesService,
          makeSitesService({
            list: (query) => {
              calls.push(query);

              return Effect.succeed({ items: [site] });
            },
          })
        )
      )
    );

    expect(result).toStrictEqual({ items: [site] });
    expect(calls).toStrictEqual([{ limit: 25, serviceAreaId }]);
  });

  it("executes site create through SitesService with trimmed payload", async () => {
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runDomainHandler("ceird.sites.create", {
        accessNotes: "  Use the side gate  ",
        addressLine1: "  1 Main Street  ",
        country: "IE",
        county: "  Dublin  ",
        eircode: "  D02 XY01  ",
        name: "  Main Site  ",
      }).pipe(
        Effect.provideService(
          SitesService,
          makeSitesService({
            create: (input) => {
              calls.push(input);

              return Effect.succeed(site);
            },
          })
        )
      )
    );

    expect(result).toStrictEqual(site);
    expect(calls).toStrictEqual([
      {
        accessNotes: "Use the side gate",
        addressLine1: "1 Main Street",
        country: "IE",
        county: "Dublin",
        eircode: "D02 XY01",
        name: "Main Site",
      },
    ]);
  });

  it("executes site update through SitesService with decoded path and trimmed payload", async () => {
    const calls: unknown[] = [];
    const result = await Effect.runPromise(
      runDomainHandler("ceird.sites.update", {
        input: {
          addressLine1: "  2 Main Street  ",
          country: "IE",
          county: "  Dublin  ",
          eircode: "  D02 XY02  ",
          name: "  Updated Site  ",
        },
        siteId,
      }).pipe(
        Effect.provideService(
          SitesService,
          makeSitesService({
            update: (updatedSiteId, input) => {
              calls.push({ input, siteId: updatedSiteId });

              return Effect.succeed(site);
            },
          })
        )
      )
    );

    expect(result).toStrictEqual(site);
    expect(calls).toStrictEqual([
      {
        input: {
          addressLine1: "2 Main Street",
          country: "IE",
          county: "Dublin",
          eircode: "D02 XY02",
          name: "Updated Site",
        },
        siteId,
      },
    ]);
  });

  it("executes site comment and label handlers through SitesService", async () => {
    const calls: unknown[] = [];

    await Effect.runPromise(
      runDomainHandler("ceird.sites.comments.list", { siteId }).pipe(
        Effect.provideService(
          SitesService,
          makeSitesService({
            listComments: (commentsSiteId) => {
              calls.push({ method: "listComments", siteId: commentsSiteId });

              return Effect.succeed({ comments: [] });
            },
          })
        )
      )
    );
    await Effect.runPromise(
      runDomainHandler("ceird.sites.comments.add", {
        input: { body: "  Please call ahead  " },
        siteId,
      }).pipe(
        Effect.provideService(
          SitesService,
          makeSitesService({
            addComment: (commentSiteId, input) => {
              calls.push({
                input,
                method: "addComment",
                siteId: commentSiteId,
              });

              return Effect.succeed({
                authorUserId: actor.userId,
                body: input.body,
                createdAt: "2026-05-20T10:00:00.000Z",
                id: commentId,
                siteId,
              });
            },
          })
        )
      )
    );
    await Effect.runPromise(
      runDomainHandler("ceird.sites.assign_label", {
        input: { labelId },
        siteId,
      }).pipe(
        Effect.provideService(
          SitesService,
          makeSitesService({
            assignLabel: (assignedSiteId, input) => {
              calls.push({
                input,
                method: "assignLabel",
                siteId: assignedSiteId,
              });

              return Effect.succeed(site);
            },
          })
        )
      )
    );
    await Effect.runPromise(
      runDomainHandler("ceird.sites.remove_label", { labelId, siteId }).pipe(
        Effect.provideService(
          SitesService,
          makeSitesService({
            removeLabel: (removedSiteId, removedLabelId) => {
              calls.push({
                labelId: removedLabelId,
                method: "removeLabel",
                siteId: removedSiteId,
              });

              return Effect.succeed(site);
            },
          })
        )
      )
    );

    expect(calls).toStrictEqual([
      { method: "listComments", siteId },
      {
        input: { body: "Please call ahead" },
        method: "addComment",
        siteId,
      },
      { input: { labelId }, method: "assignLabel", siteId },
      { labelId, method: "removeLabel", siteId },
    ]);
  });

  it("maps site not found to an agent action rejection", async () => {
    const error = await Effect.runPromise(
      runAgentAction(
        "ceird.sites.comments.list",
        { siteId },
        {},
        {},
        {
          commentsRepository: {
            listForExistingSite: () => Effect.succeed(Option.none()),
          },
        }
      ).pipe(Effect.flip)
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      message: "Site does not exist",
      name: "ceird.sites.comments.list",
    });
  });

  it("maps site access denied to an agent access denied error", async () => {
    const error = await Effect.runPromise(
      runAgentAction(
        "ceird.sites.list",
        {},
        {},
        {},
        {
          actorOverride: { ...actor, role: "external" },
        }
      ).pipe(Effect.flip)
    );

    expect(error).toBeInstanceOf(AgentAccessDeniedError);
  });

  it("maps site geocoding provider and storage failures to agent storage errors", async () => {
    const providerError = await Effect.runPromise(
      runAgentAction(
        "ceird.sites.create",
        makeSiteCreateInput(),
        {},
        {},
        {
          siteGeocoder: {
            geocode: () =>
              Effect.fail(
                new SiteGeocodingProviderError({
                  country: "IE",
                  eircode: "D02 XY01",
                  message: "Site geocoding provider failed",
                  reason: "bad_response",
                })
              ),
          },
        }
      ).pipe(Effect.flip)
    );
    const storageError = await Effect.runPromise(
      runAgentAction(
        "ceird.sites.comments.list",
        { siteId },
        {},
        {},
        {
          commentsRepository: {
            listForExistingSite: () =>
              Effect.fail(
                new SiteStorageError({
                  message: "Sites storage operation failed",
                  siteId,
                })
              ) as never,
          },
        }
      ).pipe(Effect.flip)
    );

    expect(providerError).toBeInstanceOf(AgentStorageError);
    expect(storageError).toBeInstanceOf(AgentStorageError);
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
  > = {},
  options: AgentActionsTestOptions = {}
) {
  const currentActor = options.actorOverride ?? actor;

  return AgentActions.execute(currentActor, name, input).pipe(
    Effect.provide(
      Layer.provide(
        AgentActions.DefaultWithoutDependencies,
        makeAgentActionsTestLayer(
          labelsRepositoryOverrides,
          serviceAreasRepositoryOverrides,
          options
        )
      )
    )
  );
}

function makeAgentActionsTestLayer(
  labelsRepositoryOverrides: Partial<ContextService<typeof LabelsRepository>>,
  serviceAreasRepositoryOverrides: Partial<
    ContextService<typeof ServiceAreasRepository>
  >,
  options: AgentActionsTestOptions
) {
  return Layer.mergeAll(
    Layer.succeed(
      CommentsRepository,
      CommentsRepository.of({
        addForSite: () =>
          Effect.succeed(
            Option.some({
              authorUserId: actor.userId,
              body: "Please call ahead",
              createdAt: "2026-05-20T10:00:00.000Z",
              id: commentId,
              siteId,
            })
          ),
        listForExistingSite: () => Effect.succeed(Option.some([])),
        ...options.commentsRepository,
      } as unknown as ContextService<typeof CommentsRepository>)
    ),
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
      CurrentOrganizationActor,
      CurrentOrganizationActor.make({
        get: () => Effect.succeed(options.actorOverride ?? actor),
      })
    ),
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
    Layer.succeed(SiteGeocoder, {
      geocode: () =>
        Effect.succeed({
          geocodedAt: "2026-05-20T10:00:00.000Z",
          latitude: 53.3498,
          longitude: -6.2603,
          provider: "stub" as const,
        }),
      ...options.siteGeocoder,
    } satisfies SiteGeocoderImplementation),
    Layer.succeed(
      SiteLabelAssignmentsRepository,
      SiteLabelAssignmentsRepository.of({
        assignToSite: () => Effect.succeed({ changed: true, label }),
        removeFromSite: () => Effect.succeed({ changed: true, label }),
        ...options.siteLabelAssignmentsRepository,
      } as unknown as ContextService<typeof SiteLabelAssignmentsRepository>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({
        create: () => Effect.succeed(siteId),
        getOptionById: () => Effect.succeed(Option.some(site)),
        list: () => Effect.succeed({ items: [site] }),
        listOptions: () => Effect.succeed([site]),
        update: () => Effect.succeed(Option.some(site)),
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => effect,
        ...options.sitesRepository,
      } as unknown as ContextService<typeof SitesRepository>)
    )
  );
}

function runDomainHandler(name: AgentActionName, input: unknown) {
  const handler = getDomainAgentActionHandler(name);

  if (handler === undefined) {
    throw new Error(`Missing handler for ${name}`);
  }

  return (
    handler.execute(actor, input) as Effect.Effect<
      unknown,
      unknown,
      SitesService | HttpServerRequest.HttpServerRequest
    >
  ).pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    )
  );
}

function makeSiteCreateInput() {
  return {
    addressLine1: "1 Main Street",
    country: "IE",
    county: "Dublin",
    eircode: "D02 XY01",
    name: "Main Site",
  };
}

function makeSitesService(
  overrides: Partial<ContextService<typeof SitesService>>
) {
  return SitesService.of({
    addComment: () => Effect.die("Unexpected SitesService.addComment call"),
    assignLabel: () => Effect.die("Unexpected SitesService.assignLabel call"),
    create: () => Effect.die("Unexpected SitesService.create call"),
    getOptions: () => Effect.die("Unexpected SitesService.getOptions call"),
    list: () => Effect.die("Unexpected SitesService.list call"),
    listComments: () => Effect.die("Unexpected SitesService.listComments call"),
    removeLabel: () => Effect.die("Unexpected SitesService.removeLabel call"),
    update: () => Effect.die("Unexpected SitesService.update call"),
    ...overrides,
  } as unknown as ContextService<typeof SitesService>);
}

interface AgentActionsTestOptions {
  readonly actorOverride?: OrganizationActor;
  readonly commentsRepository?: Partial<
    ContextService<typeof CommentsRepository>
  >;
  readonly siteGeocoder?: Partial<SiteGeocoderImplementation>;
  readonly siteLabelAssignmentsRepository?: Partial<
    ContextService<typeof SiteLabelAssignmentsRepository>
  >;
  readonly sitesRepository?: Partial<ContextService<typeof SitesRepository>>;
}

type ContextService<Service> = Service extends {
  of: (service: infer Value) => unknown;
}
  ? Value
  : never;
