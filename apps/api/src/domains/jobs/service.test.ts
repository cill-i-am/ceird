import { HttpServerRequest } from "@effect/platform";
import { SqlError } from "@effect/sql/SqlError";
import {
  ActivityId,
  BlockedReasonRequiredError,
  calculateJobCostLineTotalMinor,
  calculateJobCostSummary,
  CommentId,
  CostLineId,
  JobCollaboratorId,
  JobLabelId,
  JobAccessDeniedError,
  JobCostSummaryLimitExceededError,
  JobSchema,
  JobStorageError,
  OrganizationMemberNotFoundError,
  ServiceAreaNotFoundError,
  VisitId,
  VisitDurationIncrementError,
  WorkItemId,
} from "@task-tracker/jobs-core";
import type {
  ContactIdType as ContactId,
  CreateSiteInput,
  Job,
  JobComment,
  JobCostLine,
  JobCollaborator,
  JobCollaboratorAccessLevel,
  JobActivity,
  JobActivityPayload,
  JobDetail,
  JobLabel,
  JobListResponse,
  JobMemberOption,
  JobOptionsResponse,
  ServiceArea,
  JobSiteOption,
  JobVisit,
  OrganizationActivityListResponse,
  OrganizationActivityQuery,
  OrganizationIdType as OrganizationId,
  ServiceAreaIdType as ServiceAreaId,
  SiteIdType as SiteId,
  UserId,
} from "@task-tracker/jobs-core";
import {
  Cause,
  Effect,
  Exit,
  Layer,
  Option,
  ParseResult,
  Schema,
} from "effect";

import { JobsActivityRecorder } from "./activity-recorder.js";
import { JobsAuthorization } from "./authorization.js";
import { CurrentJobsActor } from "./current-jobs-actor.js";
import type { JobsActor } from "./current-jobs-actor.js";
import {
  ConfigurationRepository,
  ContactsRepository,
  JobsRepository,
  JobLabelsRepository,
  SitesRepository,
} from "./repositories.js";
import { JobsService } from "./service.js";
import { SiteGeocoder } from "./site-geocoder.js";

const decodeJob = ParseResult.decodeUnknownSync(JobSchema);
const decodeActivityId = Schema.decodeUnknownSync(ActivityId);
const decodeCommentId = Schema.decodeUnknownSync(CommentId);
const decodeJobCollaboratorId = Schema.decodeUnknownSync(JobCollaboratorId);
const decodeJobLabelId = Schema.decodeUnknownSync(JobLabelId);
const decodeCostLineId = Schema.decodeUnknownSync(CostLineId);
const decodeVisitId = Schema.decodeUnknownSync(VisitId);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);
const undefinedValue = undefined as undefined;

const workItemId = decodeWorkItemId("11111111-1111-4111-8111-111111111111");
const siteId = "22222222-2222-4222-8222-222222222222" as SiteId;
const contactId = "33333333-3333-4333-8333-333333333333" as ContactId;
const actorUserId = "44444444-4444-4444-8444-444444444444" as UserId;
const serviceAreaId = "99999999-9999-4999-8999-999999999999" as ServiceAreaId;
const visitId = decodeVisitId("55555555-5555-4555-8555-555555555555");
const labelId = decodeJobLabelId("88888888-8888-4888-8888-888888888888");
const costLineId = decodeCostLineId("99999999-9999-4999-8999-999999999998");
const collaboratorId = decodeJobCollaboratorId(
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
);
const externalUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as UserId;
const geocodedAt = "2026-04-22T10:00:00.000Z";
const inlineSiteInput = {
  addressLine1: "1 Custom House Quay",
  country: "IE",
  county: "Dublin",
  eircode: "D01 X2X2",
  name: "Docklands Campus",
  town: "Dublin",
} satisfies CreateSiteInput;

function makeActor(
  role: JobsActor["role"],
  overrides: Partial<JobsActor> = {}
): JobsActor {
  return {
    organizationId: "org_123" as OrganizationId,
    role,
    userId: actorUserId,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return decodeJob({
    assigneeId: actorUserId,
    blockedReason: undefined,
    completedAt: undefined,
    completedByUserId: undefined,
    contactId: undefined,
    coordinatorId: undefined,
    createdAt: "2026-04-22T10:00:00.000Z",
    createdByUserId: "user_creator" as UserId,
    id: workItemId,
    kind: "job",
    labels: [],
    priority: "medium",
    siteId: undefined,
    status: "in_progress",
    title: "Replace boiler valve",
    updatedAt: "2026-04-22T10:00:00.000Z",
    ...overrides,
  });
}

interface JobsServiceHarnessOptions {
  readonly actor?: JobsActor;
  readonly archiveRemovedWorkItemIds?: readonly WorkItemId[];
  readonly assignLabelChanged?: boolean;
  readonly lockedJob?: Job;
  readonly removeLabelChanged?: boolean;
  readonly costLineFailure?: JobCostSummaryLimitExceededError;
  readonly grantAccessLevel?: JobCollaboratorAccessLevel;
  readonly serviceAreaFailure?: ServiceAreaNotFoundError;
  readonly serviceAreaStorageFailure?: SqlError;
  readonly transactionFailure?: OrganizationMemberNotFoundError;
}

interface JobsServiceHarness {
  readonly activityPayloads: JobActivityPayload[];
  readonly calls: {
    addActivity: number;
    addCostLine: number;
    addVisit: number;
    archiveLabel: number;
    assignLabel: number;
    create: number;
    createLabel: number;
    createSite: number;
    ensureServiceArea: number;
    findByIdForUpdate: number;
    findUserCollaboratorGrant: number;
    geocode: number;
    list: number;
    listCollaborators: number;
    listLabels: number;
    listExternalMemberOptions: number;
    listMemberOptions: number;
    linkContact: number;
    listOrganizationActivity: number;
    patch: number;
    attachCollaborator: number;
    removeCollaborator: number;
    removeLabel: number;
    reopen: number;
    transition: number;
    updateLabel: number;
    updateCollaborator: number;
  };
  readonly layer: Layer.Layer<
    JobsService | HttpServerRequest.HttpServerRequest
  >;
}

function makeHarness(
  options: JobsServiceHarnessOptions = {}
): JobsServiceHarness {
  const actor = options.actor ?? makeActor("owner");
  const lockedJob = options.lockedJob ?? makeJob();
  const calls = {
    addActivity: 0,
    addCostLine: 0,
    addVisit: 0,
    archiveLabel: 0,
    assignLabel: 0,
    create: 0,
    createLabel: 0,
    createSite: 0,
    ensureServiceArea: 0,
    findByIdForUpdate: 0,
    findUserCollaboratorGrant: 0,
    geocode: 0,
    list: 0,
    listCollaborators: 0,
    listLabels: 0,
    listExternalMemberOptions: 0,
    listMemberOptions: 0,
    linkContact: 0,
    listOrganizationActivity: 0,
    patch: 0,
    attachCollaborator: 0,
    removeCollaborator: 0,
    removeLabel: 0,
    reopen: 0,
    transition: 0,
    updateLabel: 0,
    updateCollaborator: 0,
  };
  const jobLabel = {
    createdAt: "2026-04-22T10:00:00.000Z",
    id: labelId,
    name: "Waiting on PO",
    updatedAt: "2026-04-22T10:00:00.000Z",
  } satisfies JobLabel;
  const activityPayloads: JobActivityPayload[] = [];
  const collaborator = {
    accessLevel: options.grantAccessLevel ?? "comment",
    createdAt: "2026-04-22T10:00:00.000Z",
    id: collaboratorId,
    roleLabel: "Tenant contact",
    subjectType: "user",
    updatedAt: "2026-04-22T10:00:00.000Z",
    userId: actor.userId,
    workItemId,
  } satisfies JobCollaborator;

  const jobsRepository = JobsRepository.make({
    addActivity: (input: {
      readonly actorUserId?: UserId;
      readonly organizationId: OrganizationId;
      readonly payload: JobActivityPayload;
      readonly workItemId: Job["id"];
    }) =>
      Effect.sync(() => {
        calls.addActivity += 1;
        activityPayloads.push(input.payload);

        return {
          actorUserId: input.actorUserId,
          createdAt: "2026-04-22T11:00:00.000Z",
          id: decodeActivityId("66666666-6666-4666-8666-666666666666"),
          payload: input.payload,
          workItemId: input.workItemId,
        } satisfies JobActivity;
      }),
    addComment: (input: {
      readonly authorUserId: UserId;
      readonly body: string;
      readonly organizationId: OrganizationId;
      readonly workItemId: Job["id"];
    }) =>
      Effect.succeed({
        authorUserId: input.authorUserId,
        body: input.body,
        createdAt: "2026-04-22T12:00:00.000Z",
        id: decodeCommentId("77777777-7777-4777-8777-777777777777"),
        workItemId: input.workItemId,
      } satisfies JobComment),
    addCostLine: (input: {
      readonly authorUserId: UserId;
      readonly description: string;
      readonly organizationId: OrganizationId;
      readonly quantity: number;
      readonly taxRateBasisPoints?: number;
      readonly type: "labour" | "material";
      readonly unitPriceMinor: number;
      readonly workItemId: Job["id"];
    }) =>
      options.costLineFailure === undefined
        ? Effect.sync(() => {
            calls.addCostLine += 1;

            return {
              authorUserId: input.authorUserId,
              createdAt: "2026-04-22T14:00:00.000Z",
              description: input.description,
              id: costLineId,
              lineTotalMinor: calculateJobCostLineTotalMinor({
                quantity: input.quantity,
                unitPriceMinor: input.unitPriceMinor,
              }),
              quantity: input.quantity,
              taxRateBasisPoints: input.taxRateBasisPoints,
              type: input.type,
              unitPriceMinor: input.unitPriceMinor,
              workItemId: input.workItemId,
            } satisfies JobCostLine;
          })
        : Effect.fail(options.costLineFailure),
    addVisit: (input: {
      readonly authorUserId: UserId;
      readonly durationMinutes: number;
      readonly note: string;
      readonly organizationId: OrganizationId;
      readonly visitDate: string;
      readonly workItemId: Job["id"];
    }) =>
      Effect.sync(() => {
        calls.addVisit += 1;

        return {
          authorUserId: input.authorUserId,
          createdAt: "2026-04-22T13:00:00.000Z",
          durationMinutes: input.durationMinutes,
          id: visitId,
          note: input.note,
          visitDate: input.visitDate,
          workItemId: input.workItemId,
        } satisfies JobVisit;
      }),
    create: (input: {
      readonly contactId?: ContactId;
      readonly createdByUserId: UserId;
      readonly organizationId: OrganizationId;
      readonly priority?: Job["priority"];
      readonly siteId?: SiteId;
      readonly title: string;
    }) =>
      Effect.sync(() => {
        calls.create += 1;

        return makeJob({
          contactId: input.contactId,
          createdByUserId: input.createdByUserId,
          priority: input.priority ?? "none",
          siteId: input.siteId,
          title: input.title,
        });
      }),
    attachCollaborator: (input: {
      readonly accessLevel: JobCollaboratorAccessLevel;
      readonly createdByUserId: UserId;
      readonly organizationId: OrganizationId;
      readonly roleLabel: string;
      readonly userId: UserId;
      readonly workItemId: Job["id"];
    }) =>
      Effect.sync(() => {
        calls.attachCollaborator += 1;
        expect(input.createdByUserId).toBe(actor.userId);
        expect(input.organizationId).toBe(actor.organizationId);

        return {
          ...collaborator,
          accessLevel: input.accessLevel,
          roleLabel: input.roleLabel,
          userId: input.userId,
          workItemId: input.workItemId,
        } satisfies JobCollaborator;
      }),
    findUserCollaboratorGrant: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"],
      _userId: UserId
    ) =>
      Effect.sync(() => {
        calls.findUserCollaboratorGrant += 1;

        return options.grantAccessLevel === undefined
          ? Option.none<JobCollaborator>()
          : Option.some({
              ...collaborator,
              accessLevel: options.grantAccessLevel,
            });
      }),
    findById: (_organizationId: OrganizationId, _workItemId: Job["id"]) =>
      Effect.succeed(Option.some(lockedJob)),
    findByIdForUpdate: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"]
    ) =>
      Effect.sync(() => {
        calls.findByIdForUpdate += 1;

        return Option.some(lockedJob);
      }),
    getDetail: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"],
      access?: { readonly visibility: "external" | "internal" }
    ) =>
      Effect.succeed(
        Option.some({
          activity: [],
          comments: [],
          costs:
            access?.visibility === "external"
              ? undefined
              : {
                  lines: [],
                  summary: calculateJobCostSummary([]),
                },
          job: {
            ...lockedJob,
            labels:
              calls.assignLabel > calls.removeLabel
                ? [jobLabel]
                : lockedJob.labels,
          },
          viewerAccess: {
            canComment:
              access?.visibility === "external"
                ? options.grantAccessLevel === "comment"
                : true,
            visibility: access?.visibility ?? "internal",
          },
          visits: [],
        } satisfies JobDetail)
      ),
    list: (
      _organizationId: OrganizationId,
      _query: unknown,
      _access?: { readonly visibility: "external" | "internal" }
    ) =>
      Effect.sync(() => {
        calls.list += 1;

        return {
          items: [],
          nextCursor: undefined,
        } satisfies JobListResponse;
      }),
    listAccessibleWorkItemIdsForUser: (
      _organizationId: OrganizationId,
      _userId: UserId
    ) =>
      Effect.succeed(
        options.grantAccessLevel === undefined ? [] : [workItemId]
      ),
    listCollaborators: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"]
    ) =>
      Effect.sync(() => {
        calls.listCollaborators += 1;

        return [collaborator] satisfies readonly JobCollaborator[];
      }),
    listMemberOptions: (_organizationId: OrganizationId) =>
      Effect.sync(() => {
        calls.listMemberOptions += 1;

        return [] satisfies readonly JobMemberOption[];
      }),
    listExternalMemberOptions: (_organizationId: OrganizationId) =>
      Effect.sync(() => {
        calls.listExternalMemberOptions += 1;

        return [];
      }),
    listOrganizationActivity: (
      _organizationId: OrganizationId,
      _query: OrganizationActivityQuery
    ) =>
      Effect.sync(() => {
        calls.listOrganizationActivity += 1;

        return {
          items: [],
          nextCursor: undefined,
        } satisfies OrganizationActivityListResponse;
      }),
    patch: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"],
      _input: unknown
    ) =>
      Effect.sync(() => {
        calls.patch += 1;

        return Option.some(lockedJob);
      }),
    removeCollaborator: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"],
      _collaboratorId: JobCollaborator["id"]
    ) =>
      Effect.sync(() => {
        calls.removeCollaborator += 1;

        return collaborator;
      }),
    reopen: (_organizationId: OrganizationId, _workItemId: Job["id"]) =>
      Effect.sync(() => {
        calls.reopen += 1;

        return Option.some(makeJob({ status: "in_progress" }));
      }),
    transition: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"],
      input: {
        readonly blockedReason?: string;
        readonly completedAt?: string;
        readonly completedByUserId?: UserId | null;
        readonly status: Job["status"];
      }
    ) =>
      Effect.sync(() => {
        calls.transition += 1;

        return Option.some(
          makeJob({
            blockedReason: input.blockedReason,
            completedAt: input.completedAt,
            completedByUserId: input.completedByUserId ?? undefined,
            status: input.status,
          })
        );
      }),
    updateCollaborator: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"],
      _collaboratorId: JobCollaborator["id"],
      input: Partial<Pick<JobCollaborator, "accessLevel" | "roleLabel">>
    ) =>
      Effect.sync(() => {
        calls.updateCollaborator += 1;

        return {
          ...collaborator,
          ...input,
        };
      }),
    withTransaction: <Value, Error, Requirements>(
      effect: Effect.Effect<Value, Error, Requirements>
    ) =>
      options.transactionFailure === undefined
        ? effect
        : Effect.fail(options.transactionFailure as Error),
  });

  const sitesRepository = SitesRepository.make({
    create: (input: {
      readonly addressLine1: string;
      readonly country: string;
      readonly county: string;
      readonly eircode?: string;
      readonly geocodedAt: string;
      readonly geocodingProvider: string;
      readonly latitude: number;
      readonly longitude: number;
      readonly name: string;
      readonly organizationId: OrganizationId;
      readonly serviceAreaId?: ServiceAreaId;
      readonly town?: string;
    }) =>
      Effect.sync(() => {
        calls.createSite += 1;
        expect(input).toMatchObject({
          addressLine1: "1 Custom House Quay",
          country: "IE",
          county: "Dublin",
          eircode: "D01 X2X2",
          geocodedAt,
          geocodingProvider: "stub",
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Docklands Campus",
          organizationId: actor.organizationId,
          town: "Dublin",
        });

        return siteId;
      }),
    ensureServiceAreaInOrganization: (
      organizationId: OrganizationId,
      requestedServiceAreaId: ServiceAreaId
    ) =>
      Effect.gen(function* () {
        calls.ensureServiceArea += 1;
        expect(organizationId).toBe(actor.organizationId);
        expect(requestedServiceAreaId).toBe(serviceAreaId);

        if (options.serviceAreaFailure !== undefined) {
          return yield* Effect.fail(options.serviceAreaFailure);
        }

        if (options.serviceAreaStorageFailure !== undefined) {
          return yield* Effect.fail(options.serviceAreaStorageFailure);
        }

        return requestedServiceAreaId;
      }),
    findById: (_organizationId: OrganizationId, _siteId: SiteId) =>
      Effect.succeed(Option.some(siteId)),
    getOptionById: (_organizationId: OrganizationId, _siteId: SiteId) =>
      Effect.succeed(Option.none()),
    linkContact: (_input: {
      readonly contactId: ContactId;
      readonly isPrimary?: boolean;
      readonly organizationId: OrganizationId;
      readonly siteId: SiteId;
    }) =>
      Effect.sync(() => {
        calls.linkContact += 1;
      }).pipe(Effect.as(undefinedValue)),
    listOptions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly JobSiteOption[]),
    update: (
      _organizationId: OrganizationId,
      _siteId: SiteId,
      _input: unknown
    ) => Effect.succeed(Option.none()),
  });

  const configurationRepository = ConfigurationRepository.make({
    createServiceArea: (_input: unknown) =>
      Effect.die(new Error("Unexpected repository call: createServiceArea")),
    listServiceAreaOptions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies JobOptionsResponse["serviceAreas"]),
    listServiceAreas: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly ServiceArea[]),
    updateServiceArea: (
      _organizationId: OrganizationId,
      _serviceAreaId: ServiceAreaId,
      _input: unknown
    ) => Effect.die(new Error("Unexpected repository call: updateServiceArea")),
  });

  const contactsRepository = ContactsRepository.make({
    create: (_input: unknown) => Effect.succeed(contactId),
    findById: (_organizationId: OrganizationId, _contactId: ContactId) =>
      Effect.succeed(Option.some(contactId)),
    listOptions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies JobOptionsResponse["contacts"]),
  });
  const jobLabelsRepository = JobLabelsRepository.make({
    archive: (
      organizationId: OrganizationId,
      requestedLabelId: JobLabel["id"]
    ) =>
      Effect.sync(() => {
        calls.archiveLabel += 1;
        expect(organizationId).toBe(actor.organizationId);
        expect(requestedLabelId).toBe(labelId);

        return Option.some({
          label: jobLabel,
          removedWorkItemIds: options.archiveRemovedWorkItemIds ?? [],
        });
      }),
    assignToJob: (input: {
      readonly labelId: JobLabel["id"];
      readonly organizationId: OrganizationId;
      readonly workItemId: Job["id"];
    }) =>
      Effect.sync(() => {
        calls.assignLabel += 1;
        expect(input).toStrictEqual({
          labelId,
          organizationId: actor.organizationId,
          workItemId,
        });

        return {
          changed: options.assignLabelChanged ?? true,
          label: jobLabel,
        };
      }),
    create: (input: {
      readonly name: JobLabel["name"];
      readonly organizationId: OrganizationId;
    }) =>
      Effect.sync(() => {
        calls.createLabel += 1;
        expect(input).toStrictEqual({
          name: "Waiting on PO",
          organizationId: actor.organizationId,
        });

        return jobLabel;
      }),
    findById: (
      _organizationId: OrganizationId,
      _requestedLabelId: JobLabel["id"]
    ) => Effect.succeed(Option.some(jobLabel)),
    list: (organizationId: OrganizationId) =>
      Effect.sync(() => {
        calls.listLabels += 1;
        expect(organizationId).toBe(actor.organizationId);

        return [jobLabel];
      }),
    removeFromJob: (input: {
      readonly labelId: JobLabel["id"];
      readonly organizationId: OrganizationId;
      readonly workItemId: Job["id"];
    }) =>
      Effect.sync(() => {
        calls.removeLabel += 1;
        expect(input).toStrictEqual({
          labelId,
          organizationId: actor.organizationId,
          workItemId,
        });

        return {
          changed: options.removeLabelChanged ?? true,
          label: jobLabel,
        };
      }),
    update: (
      organizationId: OrganizationId,
      requestedLabelId: JobLabel["id"],
      input: { readonly name: JobLabel["name"] }
    ) =>
      Effect.sync(() => {
        calls.updateLabel += 1;
        expect(organizationId).toBe(actor.organizationId);
        expect(requestedLabelId).toBe(labelId);
        expect(input).toStrictEqual({ name: "Waiting on PO" });

        return Option.some(jobLabel);
      }),
  });
  const siteGeocoder = SiteGeocoder.make({
    geocode: (input: CreateSiteInput) =>
      Effect.sync(() => {
        calls.geocode += 1;
        expect(input).toStrictEqual(inlineSiteInput);

        return {
          geocodedAt,
          latitude: 53.3498,
          longitude: -6.2603,
          provider: "stub" as const,
        };
      }),
  });

  const repositoriesLayer = Layer.mergeAll(
    Layer.succeed(JobsRepository, jobsRepository),
    Layer.succeed(JobLabelsRepository, jobLabelsRepository),
    Layer.succeed(SitesRepository, sitesRepository),
    Layer.succeed(ConfigurationRepository, configurationRepository),
    Layer.succeed(ContactsRepository, contactsRepository),
    Layer.succeed(SiteGeocoder, siteGeocoder)
  );

  const activityRecorderLayer = Layer.provide(
    JobsActivityRecorder.DefaultWithoutDependencies,
    Layer.succeed(JobsRepository, jobsRepository)
  );

  const serviceDependencies = Layer.mergeAll(
    Layer.succeed(
      CurrentJobsActor,
      CurrentJobsActor.make({
        get: () => Effect.succeed(actor),
      })
    ),
    repositoriesLayer,
    JobsAuthorization.Default,
    activityRecorderLayer
  );

  const serviceLayer = Layer.provide(
    JobsService.DefaultWithoutDependencies,
    serviceDependencies
  );

  return {
    activityPayloads,
    calls,
    layer: Layer.mergeAll(
      serviceLayer,
      Layer.succeed(
        HttpServerRequest.HttpServerRequest,
        {} as HttpServerRequest.HttpServerRequest
      )
    ),
  };
}

function runJobsService<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    JobsService | HttpServerRequest.HttpServerRequest
  >,
  harness: JobsServiceHarness
) {
  return Effect.runPromise(effect.pipe(Effect.provide(harness.layer)));
}

function runJobsServiceExit<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    JobsService | HttpServerRequest.HttpServerRequest
  >,
  harness: JobsServiceHarness
) {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(harness.layer)));
}

function getFailure<Value, Error>(exit: Exit.Exit<Value, Error>) {
  return Exit.isFailure(exit)
    ? Option.getOrUndefined(Cause.failureOption(exit.cause))
    : undefined;
}

describe("jobs service", () => {
  it("lets owners list organization activity", async () => {
    const harness = makeHarness({ actor: makeActor("owner") });

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.listOrganizationActivity({});
        }),
        harness
      )
    ).resolves.toStrictEqual({
      items: [],
      nextCursor: undefined,
    });

    expect(harness.calls.listOrganizationActivity).toBe(1);
  }, 10_000);

  it("lets elevated users create, list, update, and archive organization job labels", async () => {
    const harness = makeHarness();

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          const created = yield* jobs.createJobLabel({
            name: "Waiting on PO",
          });
          const labels = yield* jobs.listJobLabels();
          const updated = yield* jobs.updateJobLabel(labelId, {
            name: "Waiting on PO",
          });
          const archived = yield* jobs.archiveJobLabel(labelId);

          return { archived, created, labels, updated };
        }),
        harness
      )
    ).resolves.toStrictEqual({
      archived: expect.objectContaining({ id: labelId, name: "Waiting on PO" }),
      created: expect.objectContaining({ id: labelId, name: "Waiting on PO" }),
      labels: {
        labels: [
          expect.objectContaining({ id: labelId, name: "Waiting on PO" }),
        ],
      },
      updated: expect.objectContaining({ id: labelId, name: "Waiting on PO" }),
    });

    expect(harness.calls.createLabel).toBe(1);
    expect(harness.calls.listLabels).toBe(1);
    expect(harness.calls.updateLabel).toBe(1);
    expect(harness.calls.archiveLabel).toBe(1);
  }, 10_000);

  it("records runtime-valid activity when assigning and removing a job label", async () => {
    const harness = makeHarness({
      lockedJob: makeJob({ labels: [] }),
    });

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          const assigned = yield* jobs.assignJobLabel(workItemId, { labelId });
          const removed = yield* jobs.removeJobLabel(workItemId, labelId);

          return { assigned, removed };
        }),
        harness
      )
    ).resolves.toStrictEqual({
      assigned: expect.objectContaining({
        job: expect.objectContaining({
          labels: [
            expect.objectContaining({ id: labelId, name: "Waiting on PO" }),
          ],
        }),
      }),
      removed: expect.objectContaining({
        job: expect.objectContaining({ labels: [] }),
      }),
    });

    expect(harness.calls.assignLabel).toBe(1);
    expect(harness.calls.removeLabel).toBe(1);
    expect(harness.calls.addActivity).toBe(2);
    expect(harness.activityPayloads).toStrictEqual([
      {
        eventType: "label_added",
        labelId,
        labelName: "Waiting on PO",
      },
      {
        eventType: "label_removed",
        labelId,
        labelName: "Waiting on PO",
      },
    ]);
  }, 10_000);

  it("records label removal activity for jobs affected by archived labels", async () => {
    const harness = makeHarness({
      archiveRemovedWorkItemIds: [workItemId],
    });

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.archiveJobLabel(labelId);
        }),
        harness
      )
    ).resolves.toMatchObject({ id: labelId, name: "Waiting on PO" });

    expect(harness.calls.archiveLabel).toBe(1);
    expect(harness.calls.addActivity).toBe(1);
    expect(harness.activityPayloads).toStrictEqual([
      {
        eventType: "label_removed",
        labelId,
        labelName: "Waiting on PO",
      },
    ]);
  }, 10_000);

  it("lets assigned members assign and remove labels on their jobs", async () => {
    const actor = makeActor("member");
    const harness = makeHarness({
      actor,
      lockedJob: makeJob({ assigneeId: actor.userId }),
    });

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          const assigned = yield* jobs.assignJobLabel(workItemId, { labelId });
          const removed = yield* jobs.removeJobLabel(workItemId, labelId);

          return { assigned, removed };
        }),
        harness
      )
    ).resolves.toMatchObject({
      assigned: {
        job: {
          id: workItemId,
        },
      },
      removed: {
        job: {
          id: workItemId,
        },
      },
    });

    expect(harness.calls.findByIdForUpdate).toBe(2);
    expect(harness.calls.assignLabel).toBe(1);
    expect(harness.calls.removeLabel).toBe(1);
  }, 10_000);

  it("does not record label activity when assignment state does not change", async () => {
    const harness = makeHarness({
      assignLabelChanged: false,
      lockedJob: makeJob({ labels: [] }),
      removeLabelChanged: false,
    });

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          yield* jobs.assignJobLabel(workItemId, { labelId });
          yield* jobs.removeJobLabel(workItemId, labelId);
        }),
        harness
      )
    ).resolves.toBeUndefined();

    expect(harness.calls.assignLabel).toBe(1);
    expect(harness.calls.removeLabel).toBe(1);
    expect(harness.calls.addActivity).toBe(0);
    expect(harness.activityPayloads).toStrictEqual([]);
  }, 10_000);

  it("denies members listing organization activity", async () => {
    const harness = makeHarness({ actor: makeActor("member") });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.listOrganizationActivity({});
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
    expect(harness.calls.listOrganizationActivity).toBe(0);
  }, 10_000);

  it("denies external actors loading ungranted job detail", async () => {
    const harness = makeHarness({ actor: makeActor("external") });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.getDetail(workItemId);
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(
      new JobAccessDeniedError({
        message: "External collaborators can only view jobs granted to them",
        workItemId,
      })
    );
    expect(harness.calls.findUserCollaboratorGrant).toBe(1);
  }, 10_000);

  it("allows external actors to list granted jobs and load redacted detail", async () => {
    const harness = makeHarness({
      actor: makeActor("external"),
      grantAccessLevel: "read",
    });

    const [list, detail] = await Promise.all([
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.list({});
        }),
        harness
      ),
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.getDetail(workItemId);
        }),
        harness
      ),
    ]);

    expect(list.items).toHaveLength(0);
    expect(detail.costs).toBeUndefined();
    expect(detail.viewerAccess).toStrictEqual({
      canComment: false,
      visibility: "external",
    });
    expect(harness.calls.list).toBe(1);
    expect(harness.calls.findUserCollaboratorGrant).toBe(1);
  }, 10_000);

  it("denies external actors adding ungranted job comments", async () => {
    const harness = makeHarness({ actor: makeActor("external") });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addComment(workItemId, {
          body: "Can you share the access code?",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(
      new JobAccessDeniedError({
        message:
          "External collaborators need comment access to comment on jobs",
        workItemId,
      })
    );
    expect(harness.calls.findByIdForUpdate).toBe(0);
    expect(harness.calls.findUserCollaboratorGrant).toBe(1);
  }, 10_000);

  it("allows external actors with comment grants to add comments", async () => {
    const harness = makeHarness({
      actor: makeActor("external"),
      grantAccessLevel: "comment",
    });

    const comment = await runJobsService(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addComment(workItemId, {
          body: "Can you share the access code?",
        });
      }),
      harness
    );

    expect(comment.body).toBe("Can you share the access code?");
    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.findUserCollaboratorGrant).toBe(1);
  }, 10_000);

  it("lets owners manage job collaborators", async () => {
    const harness = makeHarness({ actor: makeActor("owner") });

    const [attached, listed, updated, removed] = await runJobsService(
      Effect.gen(function* () {
        const jobs = yield* JobsService;
        const attachedCollaborator = yield* jobs.attachCollaborator(
          workItemId,
          {
            accessLevel: "comment",
            roleLabel: "Tenant contact",
            userId: externalUserId,
          }
        );
        const collaborators = yield* jobs.listCollaborators(workItemId);
        const updatedCollaborator = yield* jobs.updateCollaborator(
          workItemId,
          collaboratorId,
          {
            accessLevel: "read",
          }
        );
        const removedCollaborator = yield* jobs.removeCollaborator(
          workItemId,
          collaboratorId
        );

        return [
          attachedCollaborator,
          collaborators,
          updatedCollaborator,
          removedCollaborator,
        ] as const;
      }),
      harness
    );

    expect(attached.userId).toBe(externalUserId);
    expect(listed.collaborators).toHaveLength(1);
    expect(updated.accessLevel).toBe("read");
    expect(removed.id).toBe(collaboratorId);
    expect(harness.calls.attachCollaborator).toBe(1);
    expect(harness.calls.listCollaborators).toBe(1);
    expect(harness.calls.updateCollaborator).toBe(1);
    expect(harness.calls.removeCollaborator).toBe(1);
  }, 10_000);

  it("denies external actors loading organization-wide options data", async () => {
    const harness = makeHarness({ actor: makeActor("external") });

    const list = await runJobsService(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.list({});
      }),
      harness
    );
    const exits = await Promise.all([
      runJobsServiceExit(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.getOptions();
        }),
        harness
      ),
      runJobsServiceExit(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.listJobLabels();
        }),
        harness
      ),
      runJobsServiceExit(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.getMemberOptions();
        }),
        harness
      ),
    ]);

    const failures = exits.map((exit) =>
      getFailure(exit as Exit.Exit<unknown, unknown>)
    );

    expect(failures).toStrictEqual([
      new JobAccessDeniedError({
        message:
          "External collaborators cannot view organization-wide jobs data",
      }),
      new JobAccessDeniedError({
        message:
          "External collaborators cannot view organization-wide jobs data",
      }),
      new JobAccessDeniedError({
        message:
          "External collaborators cannot view organization-wide jobs data",
      }),
    ]);
    expect(list.items).toHaveLength(0);
    expect(harness.calls.list).toBe(1);
    expect(harness.calls.listLabels).toBe(0);
    expect(harness.calls.listMemberOptions).toBe(0);
  }, 10_000);

  it("geocodes inline site creation before creating the job", async () => {
    const harness = makeHarness();

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.create({
            site: {
              input: inlineSiteInput,
              kind: "create",
            },
            title: "Replace circulation pump",
          });
        }),
        harness
      )
    ).resolves.toMatchObject({
      siteId,
      title: "Replace circulation pump",
    });

    expect(harness.calls.geocode).toBe(1);
    expect(harness.calls.createSite).toBe(1);
    expect(harness.calls.create).toBe(1);
    expect(harness.calls.addActivity).toBe(1);
  }, 10_000);

  it("does not geocode when creating a job for an existing site", async () => {
    const harness = makeHarness();

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.create({
            site: {
              kind: "existing",
              siteId,
            },
            title: "Replace circulation pump",
          });
        }),
        harness
      )
    ).resolves.toMatchObject({
      siteId,
      title: "Replace circulation pump",
    });

    expect(harness.calls.geocode).toBe(0);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.create).toBe(1);
    expect(harness.calls.addActivity).toBe(1);
  }, 10_000);

  it("validates inline site service areas before geocoding", async () => {
    const actor = makeActor("owner");
    const failure = new ServiceAreaNotFoundError({
      message: "Service area does not exist in the organization",
      organizationId: actor.organizationId,
      serviceAreaId,
    });
    const harness = makeHarness({
      actor,
      serviceAreaFailure: failure,
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.create({
          site: {
            input: {
              ...inlineSiteInput,
              serviceAreaId,
            },
            kind: "create",
          },
          title: "Replace circulation pump",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(failure);
    expect(harness.calls.ensureServiceArea).toBe(1);
    expect(harness.calls.geocode).toBe(0);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.create).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("maps inline site service area storage failures before geocoding", async () => {
    const harness = makeHarness({
      serviceAreaStorageFailure: new SqlError({
        message: "database unavailable",
      }),
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.create({
          site: {
            input: {
              ...inlineSiteInput,
              serviceAreaId,
            },
            kind: "create",
          },
          title: "Replace circulation pump",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(JobStorageError);
    expect(getFailure(exit)).toMatchObject({
      cause: "database unavailable",
      message: "Jobs storage operation failed",
    });
    expect(harness.calls.ensureServiceArea).toBe(1);
    expect(harness.calls.geocode).toBe(0);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.create).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("requires a blocked reason before transitioning a job to blocked", async () => {
    const harness = makeHarness({
      lockedJob: makeJob({ status: "in_progress" }),
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.transition(workItemId, {
          status: "blocked",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(BlockedReasonRequiredError);

    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.transition).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("denies external actors before validating transition input", async () => {
    const harness = makeHarness({
      actor: makeActor("external"),
      lockedJob: makeJob({ status: "in_progress" }),
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.transition(workItemId, {
          status: "blocked",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
    expect(getFailure(exit)).toMatchObject({
      message: "External collaborators cannot change job status",
      workItemId,
    });

    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.transition).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("denies external actors before validating reopen eligibility", async () => {
    const harness = makeHarness({
      actor: makeActor("external"),
      lockedJob: makeJob({ status: "in_progress" }),
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.reopen(workItemId);
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
    expect(getFailure(exit)).toMatchObject({
      message: "Members can only reopen jobs assigned to them",
      workItemId,
    });

    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.reopen).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("rejects visit durations that are not whole-hour increments before hitting persistence", async () => {
    const harness = makeHarness();

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addVisit(workItemId, {
          durationMinutes: 90,
          note: "Stayed late to retest the relay.",
          visitDate: "2026-04-22",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(VisitDurationIncrementError);

    expect(harness.calls.findByIdForUpdate).toBe(0);
    expect(harness.calls.addVisit).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("denies external actors before validating visit duration", async () => {
    const harness = makeHarness({ actor: makeActor("external") });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addVisit(workItemId, {
          durationMinutes: 90,
          note: "Stayed late to retest the relay.",
          visitDate: "2026-04-22",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
    expect(getFailure(exit)).toMatchObject({
      message: "Members can only log visits on jobs assigned to them",
      workItemId,
    });

    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.addVisit).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("adds a job cost line and records activity for the assigned user", async () => {
    const harness = makeHarness({
      actor: makeActor("member"),
      lockedJob: makeJob({
        assigneeId: actorUserId,
      }),
    });

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.addCostLine(workItemId, {
            description: "Replacement valve",
            quantity: 1.5,
            taxRateBasisPoints: 2300,
            type: "material",
            unitPriceMinor: 4200,
          });
        }),
        harness
      )
    ).resolves.toMatchObject({
      description: "Replacement valve",
      lineTotalMinor: 6300,
      type: "material",
    });

    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.addCostLine).toBe(1);
    expect(harness.calls.addActivity).toBe(1);
  }, 10_000);

  it("rejects cost line creation for unassigned regular members", async () => {
    const harness = makeHarness({
      actor: makeActor("member"),
      lockedJob: makeJob({
        assigneeId: "unassigned_user" as UserId,
      }),
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addCostLine(workItemId, {
          description: "Replacement valve",
          quantity: 1,
          type: "material",
          unitPriceMinor: 4200,
        });
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.addCostLine).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("surfaces the cost summary limit error without recording activity", async () => {
    const failure = new JobCostSummaryLimitExceededError({
      message: "Job cost summary subtotal would exceed a safe integer",
      workItemId,
    });
    const harness = makeHarness({
      actor: makeActor("member"),
      costLineFailure: failure,
      lockedJob: makeJob({
        assigneeId: actorUserId,
      }),
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addCostLine(workItemId, {
          description: "Replacement valve",
          quantity: 1,
          type: "material",
          unitPriceMinor: 4200,
        });
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(failure);
    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.addCostLine).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("returns the existing job without writing when a patch request has no changes", async () => {
    const job = makeJob({
      assigneeId: actorUserId,
      coordinatorId: undefined,
      priority: "high",
      siteId,
      title: "Inspect generator",
    });
    const harness = makeHarness({
      lockedJob: job,
    });

    await expect(
      runJobsService(
        Effect.gen(function* () {
          const jobs = yield* JobsService;

          return yield* jobs.patch(workItemId, {});
        }),
        harness
      )
    ).resolves.toStrictEqual(job);

    expect(harness.calls.findByIdForUpdate).toBe(1);
    expect(harness.calls.patch).toBe(0);
    expect(harness.calls.linkContact).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);

  it("maps actor membership loss during create into a user-facing access error", async () => {
    const actor = makeActor("owner");
    const harness = makeHarness({
      actor,
      transactionFailure: new OrganizationMemberNotFoundError({
        message: "User is not a member of the organization",
        organizationId: actor.organizationId,
        userId: actor.userId,
      }),
    });

    const exit = await runJobsServiceExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.create({
          title: "Replace circulation pump",
        });
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(
      new JobAccessDeniedError({
        message:
          "Your organization access changed while the request was running",
      })
    );

    expect(harness.calls.create).toBe(0);
    expect(harness.calls.addActivity).toBe(0);
  }, 10_000);
});
