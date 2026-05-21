import {
  AGENT_ACTIONS,
  AGENT_EXECUTABLE_ACTIONS,
  AgentAccessDeniedError,
  AgentActionRejectedError,
  AgentStorageError,
} from "@ceird/agents-core";
import type { AgentActionName } from "@ceird/agents-core";
import type { CommentIdType as CommentId } from "@ceird/comments-core";
import {
  InvalidJobTransitionError,
  JobAccessDeniedError,
  JobCollaboratorConflictError,
  JobStorageError,
  RateCardNotFoundError,
} from "@ceird/jobs-core";
import type {
  CostLineIdType as CostLineId,
  Job,
  JobCollaborator,
  JobCollaboratorIdType as JobCollaboratorId,
  RateCard,
  RateCardIdType as RateCardId,
  RateCardLineIdType as RateCardLineId,
  UserIdType as JobUserId,
  VisitIdType as VisitId,
  WorkItemIdType,
} from "@ceird/jobs-core";
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
  SiteGeocodingProviderError,
  SiteStorageError,
} from "@ceird/sites-core";
import { Effect, Layer, Option } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { CommentsRepository } from "../comments/repository.js";
import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import { ConfigurationService } from "../jobs/configuration-service.js";
import { WorkItemOrganizationMismatchError } from "../jobs/errors.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
  RateCardsRepository,
} from "../jobs/repositories.js";
import { JobsService } from "../jobs/service.js";
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
const workItemId = "55555555-5555-4555-8555-555555555555" as WorkItemIdType;
const collaboratorId =
  "66666666-6666-4666-8666-666666666666" as JobCollaboratorId;
const visitId = "77777777-7777-4777-8777-777777777777" as VisitId;
const costLineId = "88888888-8888-4888-8888-888888888888" as CostLineId;
const rateCardId = "99999999-9999-4999-8999-999999999999" as RateCardId;
const rateCardLineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as RateCardLineId;
const collaboratorUserId = "user_collaborator" as JobUserId;
const job = {
  createdAt: "2026-05-20T10:00:00.000Z",
  createdByUserId: actor.userId as JobUserId,
  id: workItemId,
  kind: "job",
  labels: [],
  priority: "medium",
  status: "new",
  title: "Repair boiler",
  updatedAt: "2026-05-20T10:00:00.000Z",
} satisfies Job;
const collaborator = {
  accessLevel: "comment",
  createdAt: "2026-05-20T10:00:00.000Z",
  id: collaboratorId,
  roleLabel: "Coordinator",
  subjectType: "user",
  updatedAt: "2026-05-20T10:00:00.000Z",
  userId: collaboratorUserId,
  workItemId,
} satisfies JobCollaborator;
const rateCard = {
  createdAt: "2026-05-20T10:00:00.000Z",
  id: rateCardId,
  lines: [
    {
      id: rateCardLineId,
      kind: "callout",
      name: "Standard callout",
      position: 1,
      rateCardId,
      unit: "visit",
      value: 125,
    },
  ],
  name: "Standard",
  updatedAt: "2026-05-20T10:00:00.000Z",
} satisfies RateCard;
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
      actionName: "ceird.labels.update",
      message: "Label does not exist in the organization",
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
      actionName: "ceird.labels.create",
      message: "Label name already exists in the organization",
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
      actionName: "ceird.sites.comments.list",
      message: "Site does not exist",
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

  it("executes job handlers through JobsService with decoded payloads", async () => {
    const calls: unknown[] = [];
    const jobsService = makeJobsService({
      addCostLine: (jobId, input) => {
        calls.push({ input, method: "addCostLine", workItemId: jobId });

        return Effect.succeed({
          authorUserId: actor.userId,
          createdAt: "2026-05-20T10:00:00.000Z",
          description: input.description,
          id: costLineId,
          lineTotalMinor: input.unitPriceMinor * input.quantity,
          quantity: input.quantity,
          taxRateBasisPoints: input.taxRateBasisPoints,
          type: input.type,
          unitPriceMinor: input.unitPriceMinor,
          workItemId,
        });
      },
      addVisit: (jobId, input) => {
        calls.push({ input, method: "addVisit", workItemId: jobId });

        return Effect.succeed({
          authorUserId: actor.userId,
          createdAt: "2026-05-20T10:00:00.000Z",
          durationMinutes: input.durationMinutes,
          id: visitId,
          note: input.note,
          visitDate: input.visitDate,
          workItemId,
        });
      },
      attachCollaborator: (jobId, input) => {
        calls.push({ input, method: "attachCollaborator", workItemId: jobId });

        return Effect.succeed(collaborator);
      },
      create: (input) => {
        calls.push({ input, method: "create" });

        return Effect.succeed(job);
      },
      list: (query) => {
        calls.push({ method: "list", query });

        return Effect.succeed({ items: [job] });
      },
      listCollaborators: (jobId) => {
        calls.push({ method: "listCollaborators", workItemId: jobId });

        return Effect.succeed({ collaborators: [collaborator] });
      },
      listOrganizationActivity: (query) => {
        calls.push({ method: "listOrganizationActivity", query });

        return Effect.succeed({ items: [] });
      },
      patch: (jobId, input) => {
        calls.push({ input, method: "patch", workItemId: jobId });

        return Effect.succeed(job);
      },
      removeCollaborator: (jobId, removedCollaboratorId) => {
        calls.push({
          collaboratorId: removedCollaboratorId,
          method: "removeCollaborator",
          workItemId: jobId,
        });

        return Effect.succeed(collaborator);
      },
      reopen: (jobId) => {
        calls.push({ method: "reopen", workItemId: jobId });

        return Effect.succeed(job);
      },
      transition: (jobId, input) => {
        calls.push({ input, method: "transition", workItemId: jobId });

        return Effect.succeed(job);
      },
      updateCollaborator: (jobId, updatedCollaboratorId, input) => {
        calls.push({
          collaboratorId: updatedCollaboratorId,
          input,
          method: "updateCollaborator",
          workItemId: jobId,
        });

        return Effect.succeed(collaborator);
      },
    });

    await Effect.runPromise(
      Effect.all(
        [
          runDomainHandler("ceird.jobs.list", { limit: "25" }),
          runDomainHandler("ceird.jobs.create", { title: "  Repair boiler  " }),
          runDomainHandler("ceird.jobs.update", {
            input: { title: "  Repair pump  " },
            workItemId,
          }),
          runDomainHandler("ceird.jobs.transition", {
            input: { status: "in_progress" },
            workItemId,
          }),
          runDomainHandler("ceird.jobs.reopen", { workItemId }),
          runDomainHandler("ceird.jobs.activity.list", { limit: "10" }),
          runDomainHandler("ceird.jobs.visits.add", {
            input: {
              durationMinutes: 45,
              note: "  Checked pressure  ",
              visitDate: "2026-05-20",
            },
            workItemId,
          }),
          runDomainHandler("ceird.jobs.cost_lines.add", {
            input: {
              description: "  Labour  ",
              quantity: 2,
              taxRateBasisPoints: 2300,
              type: "labour",
              unitPriceMinor: 5000,
            },
            workItemId,
          }),
          runDomainHandler("ceird.jobs.collaborators.list", { workItemId }),
          runDomainHandler("ceird.jobs.collaborators.attach", {
            input: {
              accessLevel: "comment",
              roleLabel: "  Coordinator  ",
              userId: collaboratorUserId,
            },
            workItemId,
          }),
          runDomainHandler("ceird.jobs.collaborators.update", {
            collaboratorId,
            input: { roleLabel: "  Viewer  " },
            workItemId,
          }),
          runDomainHandler("ceird.jobs.collaborators.detach", {
            collaboratorId,
            workItemId,
          }),
        ],
        { concurrency: 1 }
      ).pipe(Effect.provideService(JobsService, jobsService))
    );

    expect(calls).toStrictEqual([
      { method: "list", query: { limit: 25 } },
      { input: { title: "Repair boiler" }, method: "create" },
      {
        input: { title: "Repair pump" },
        method: "patch",
        workItemId,
      },
      {
        input: { status: "in_progress" },
        method: "transition",
        workItemId,
      },
      { method: "reopen", workItemId },
      { method: "listOrganizationActivity", query: { limit: 10 } },
      {
        input: {
          durationMinutes: 45,
          note: "Checked pressure",
          visitDate: "2026-05-20",
        },
        method: "addVisit",
        workItemId,
      },
      {
        input: {
          description: "Labour",
          quantity: 2,
          taxRateBasisPoints: 2300,
          type: "labour",
          unitPriceMinor: 5000,
        },
        method: "addCostLine",
        workItemId,
      },
      { method: "listCollaborators", workItemId },
      {
        input: {
          accessLevel: "comment",
          roleLabel: "Coordinator",
          userId: collaboratorUserId,
        },
        method: "attachCollaborator",
        workItemId,
      },
      {
        collaboratorId,
        input: { roleLabel: "Viewer" },
        method: "updateCollaborator",
        workItemId,
      },
      { collaboratorId, method: "removeCollaborator", workItemId },
    ]);
  });

  it("maps representative job service errors to agent action errors", async () => {
    const accessDenied = await Effect.runPromise(
      runAgentAction(
        "ceird.jobs.list",
        {},
        {},
        {},
        {
          jobsAuthorization: {
            ensureCanView: () =>
              Effect.fail(
                new JobAccessDeniedError({
                  message: "Cannot view jobs",
                })
              ) as never,
          },
        }
      ).pipe(Effect.flip)
    );
    const invalidTransition = await Effect.runPromise(
      runAgentAction(
        "ceird.jobs.transition",
        { input: { status: "completed" }, workItemId },
        {},
        {},
        {
          jobsRepository: {
            withTransaction: () =>
              Effect.fail(
                new InvalidJobTransitionError({
                  fromStatus: "new",
                  message: "Invalid transition",
                  toStatus: "completed",
                  workItemId,
                })
              ) as never,
          },
        }
      ).pipe(Effect.flip)
    );
    const collaboratorConflict = await Effect.runPromise(
      runAgentAction(
        "ceird.jobs.collaborators.attach",
        {
          input: {
            accessLevel: "read",
            roleLabel: "Viewer",
            userId: collaboratorUserId,
          },
          workItemId,
        },
        {},
        {},
        {
          jobsAuthorization: {
            ensureCanManageCollaborators: () => Effect.void,
          },
          jobsRepository: {
            attachCollaborator: () =>
              Effect.fail(
                new JobCollaboratorConflictError({
                  message: "Collaborator already exists",
                  userId: collaboratorUserId,
                  workItemId,
                })
              ),
          },
        }
      ).pipe(Effect.flip)
    );
    const storage = await Effect.runPromise(
      runAgentAction(
        "ceird.jobs.activity.list",
        {},
        {},
        {},
        {
          jobsAuthorization: {
            ensureCanViewOrganizationActivity: () => Effect.void,
          },
          jobsRepository: {
            listOrganizationActivity: () =>
              Effect.fail(
                new JobStorageError({
                  message: "Jobs storage operation failed",
                })
              ) as never,
          },
        }
      ).pipe(Effect.flip)
    );

    expect(accessDenied).toBeInstanceOf(AgentAccessDeniedError);
    expect(invalidTransition).toBeInstanceOf(AgentActionRejectedError);
    expect(collaboratorConflict).toBeInstanceOf(AgentActionRejectedError);
    expect(storage).toBeInstanceOf(AgentStorageError);
  });

  it("maps job collaborator organization mismatches to rejected agent errors", async () => {
    const listMismatch = await Effect.runPromise(
      runAgentAction(
        "ceird.jobs.collaborators.list",
        { workItemId },
        {},
        {},
        {
          jobsAuthorization: {
            ensureCanManageCollaborators: () => Effect.void,
          },
          jobsRepository: {
            listCollaborators: () =>
              Effect.fail(
                new WorkItemOrganizationMismatchError({
                  message: "Job does not belong to the organization",
                  organizationId: actor.organizationId,
                  workItemId,
                })
              ),
          },
        }
      ).pipe(Effect.flip)
    );
    const attachMismatch = await Effect.runPromise(
      runAgentAction(
        "ceird.jobs.collaborators.attach",
        {
          input: {
            accessLevel: "read",
            roleLabel: "Viewer",
            userId: collaboratorUserId,
          },
          workItemId,
        },
        {},
        {},
        {
          jobsAuthorization: {
            ensureCanManageCollaborators: () => Effect.void,
          },
          jobsRepository: {
            attachCollaborator: () =>
              Effect.fail(
                new WorkItemOrganizationMismatchError({
                  message: "Job does not belong to the organization",
                  organizationId: actor.organizationId,
                  workItemId,
                })
              ),
          },
        }
      ).pipe(Effect.flip)
    );

    expect(listMismatch).toBeInstanceOf(AgentActionRejectedError);
    expect(attachMismatch).toBeInstanceOf(AgentActionRejectedError);
  });

  it("executes rate card handlers through ConfigurationService with decoded payloads", async () => {
    const calls: unknown[] = [];
    const configurationService = makeConfigurationService({
      createRateCard: (input) => {
        calls.push({ input, method: "createRateCard" });

        return Effect.succeed(rateCard);
      },
      listRateCards: () => {
        calls.push({ method: "listRateCards" });

        return Effect.succeed({ items: [rateCard] });
      },
      updateRateCard: (updatedRateCardId, input) => {
        calls.push({
          input,
          method: "updateRateCard",
          rateCardId: updatedRateCardId,
        });

        return Effect.succeed(rateCard);
      },
    });

    await Effect.runPromise(
      Effect.all(
        [
          runDomainHandler("ceird.rate_cards.list", {}),
          runDomainHandler("ceird.rate_cards.create", {
            lines: [
              {
                kind: "callout",
                name: "  Standard callout  ",
                position: 1,
                unit: "  visit  ",
                value: 125,
              },
            ],
            name: "  Standard  ",
          }),
          runDomainHandler("ceird.rate_cards.update", {
            input: { name: "  Standard 2026  " },
            rateCardId,
          }),
        ],
        { concurrency: 1 }
      ).pipe(Effect.provideService(ConfigurationService, configurationService))
    );

    expect(calls).toStrictEqual([
      { method: "listRateCards" },
      {
        input: {
          lines: [
            {
              kind: "callout",
              name: "Standard callout",
              position: 1,
              unit: "visit",
              value: 125,
            },
          ],
          name: "Standard",
        },
        method: "createRateCard",
      },
      {
        input: { name: "Standard 2026" },
        method: "updateRateCard",
        rateCardId,
      },
    ]);
  });

  it("rejects non-empty list rate card input before calling ConfigurationService", async () => {
    const error = await Effect.runPromise(
      runDomainHandler("ceird.rate_cards.list", { unexpected: true }).pipe(
        Effect.provideService(
          ConfigurationService,
          makeConfigurationService({
            listRateCards: () =>
              Effect.die("Unexpected ConfigurationService.listRateCards call"),
          })
        ),
        Effect.flip
      )
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      actionName: "ceird.rate_cards.list",
      message: "Invalid input for ceird.rate_cards.list",
    });
  });

  it("maps missing rate cards to agent action rejections", async () => {
    const error = await Effect.runPromise(
      runAgentAction(
        "ceird.rate_cards.update",
        { input: { name: "Standard 2026" }, rateCardId },
        {},
        {},
        {
          rateCardsRepository: {
            update: () =>
              Effect.fail(
                new RateCardNotFoundError({
                  message: "Rate card does not exist in the organization",
                  organizationId: actor.organizationId,
                  rateCardId,
                })
              ),
          },
        }
      ).pipe(Effect.flip)
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      actionName: "ceird.rate_cards.update",
      message: "Rate card does not exist in the organization",
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
      actionName: "ceird.service_areas.update",
      message: "Service area does not exist in the organization",
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
    });
    expect(error).not.toHaveProperty("actionName", missingAction);
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
    ),
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
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
      JobsAuthorization.of({
        ensureCanManageConfiguration: () => Effect.void,
        ensureCanManageCollaborators: () => Effect.void,
        ensureCanView: () => Effect.void,
        ensureCanViewOrganizationActivity: () => Effect.void,
        ...options.jobsAuthorization,
      } as unknown as ContextService<typeof JobsAuthorization>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        attachCollaborator: () => Effect.succeed(collaborator),
        list: () => Effect.succeed({ items: [job] }),
        listOrganizationActivity: () => Effect.succeed({ items: [] }),
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => effect,
        ...options.jobsRepository,
      } as unknown as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      RateCardsRepository,
      RateCardsRepository.of({
        create: () => Effect.succeed(rateCard),
        list: () => Effect.succeed([rateCard]),
        update: () => Effect.succeed(rateCard),
        ...options.rateCardsRepository,
      } as unknown as ContextService<typeof RateCardsRepository>)
    ),
    Layer.succeed(JobsService, makeJobsService(options.jobsService ?? {})),
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
      CurrentOrganizationActor.of({
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
    handler.execute(actor, input) as Effect.Effect<unknown, unknown, never>
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

function makeJobsService(
  overrides: Partial<ContextService<typeof JobsService>>
) {
  return JobsService.of({
    addComment: () => Effect.die("Unexpected JobsService.addComment call"),
    addCostLine: () => Effect.die("Unexpected JobsService.addCostLine call"),
    addVisit: () => Effect.die("Unexpected JobsService.addVisit call"),
    assignLabel: () => Effect.die("Unexpected JobsService.assignLabel call"),
    attachCollaborator: () =>
      Effect.die("Unexpected JobsService.attachCollaborator call"),
    create: () => Effect.die("Unexpected JobsService.create call"),
    getDetail: () => Effect.die("Unexpected JobsService.getDetail call"),
    getExternalMemberOptions: () =>
      Effect.die("Unexpected JobsService.getExternalMemberOptions call"),
    getMemberOptions: () =>
      Effect.die("Unexpected JobsService.getMemberOptions call"),
    getOptions: () => Effect.die("Unexpected JobsService.getOptions call"),
    list: () => Effect.die("Unexpected JobsService.list call"),
    listCollaborators: () =>
      Effect.die("Unexpected JobsService.listCollaborators call"),
    listOrganizationActivity: () =>
      Effect.die("Unexpected JobsService.listOrganizationActivity call"),
    patch: () => Effect.die("Unexpected JobsService.patch call"),
    removeCollaborator: () =>
      Effect.die("Unexpected JobsService.removeCollaborator call"),
    removeLabel: () => Effect.die("Unexpected JobsService.removeLabel call"),
    reopen: () => Effect.die("Unexpected JobsService.reopen call"),
    transition: () => Effect.die("Unexpected JobsService.transition call"),
    updateCollaborator: () =>
      Effect.die("Unexpected JobsService.updateCollaborator call"),
    ...overrides,
  } as unknown as ContextService<typeof JobsService>);
}

function makeConfigurationService(
  overrides: Partial<ContextService<typeof ConfigurationService>>
) {
  return ConfigurationService.of({
    createRateCard: () =>
      Effect.die("Unexpected ConfigurationService.createRateCard call"),
    listRateCards: () =>
      Effect.die("Unexpected ConfigurationService.listRateCards call"),
    updateRateCard: () =>
      Effect.die("Unexpected ConfigurationService.updateRateCard call"),
    ...overrides,
  } as unknown as ContextService<typeof ConfigurationService>);
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
  readonly jobsAuthorization?: Partial<
    ContextService<typeof JobsAuthorization>
  >;
  readonly jobsRepository?: Partial<ContextService<typeof JobsRepository>>;
  readonly jobsService?: Partial<ContextService<typeof JobsService>>;
  readonly rateCardsRepository?: Partial<
    ContextService<typeof RateCardsRepository>
  >;
  readonly sitesRepository?: Partial<ContextService<typeof SitesRepository>>;
}

type ContextService<Service> = Service extends {
  of: (service: infer Value) => unknown;
}
  ? Value
  : never;
