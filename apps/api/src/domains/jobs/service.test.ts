import { HttpServerRequest } from "@effect/platform";
import {
  ActivityId,
  BlockedReasonRequiredError,
  CommentId,
  JobAccessDeniedError,
  JobSchema,
  OrganizationMemberNotFoundError,
  VisitId,
  VisitDurationIncrementError,
  WorkItemId,
} from "@task-tracker/jobs-core";
import type {
  ContactIdType as ContactId,
  Job,
  JobComment,
  JobActivity,
  JobActivityPayload,
  JobListResponse,
  JobMemberOption,
  JobOptionsResponse,
  JobRegionOption,
  JobSiteOption,
  JobVisit,
  OrganizationIdType as OrganizationId,
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
  ContactsRepository,
  JobsRepository,
  SitesRepository,
} from "./repositories.js";
import { JobsService } from "./service.js";

const decodeJob = ParseResult.decodeUnknownSync(JobSchema);
const decodeActivityId = Schema.decodeUnknownSync(ActivityId);
const decodeCommentId = Schema.decodeUnknownSync(CommentId);
const decodeVisitId = Schema.decodeUnknownSync(VisitId);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);
const undefinedValue = undefined as undefined;

const workItemId = decodeWorkItemId("11111111-1111-4111-8111-111111111111");
const siteId = "22222222-2222-4222-8222-222222222222" as SiteId;
const contactId = "33333333-3333-4333-8333-333333333333" as ContactId;
const actorUserId = "44444444-4444-4444-8444-444444444444" as UserId;
const visitId = decodeVisitId("55555555-5555-4555-8555-555555555555");

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
  readonly lockedJob?: Job;
  readonly transactionFailure?: OrganizationMemberNotFoundError;
}

interface JobsServiceHarness {
  readonly calls: {
    addActivity: number;
    addVisit: number;
    create: number;
    findByIdForUpdate: number;
    linkContact: number;
    patch: number;
    transition: number;
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
    addVisit: 0,
    create: 0,
    findByIdForUpdate: 0,
    linkContact: 0,
    patch: 0,
    transition: 0,
  };

  const jobsRepository = JobsRepository.make({
    addActivity: (input: {
      readonly actorUserId?: UserId;
      readonly organizationId: OrganizationId;
      readonly payload: JobActivityPayload;
      readonly workItemId: Job["id"];
    }) =>
      Effect.sync(() => {
        calls.addActivity += 1;

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
      readonly workItemId: Job["id"];
    }) =>
      Effect.succeed({
        authorUserId: input.authorUserId,
        body: input.body,
        createdAt: "2026-04-22T12:00:00.000Z",
        id: decodeCommentId("77777777-7777-4777-8777-777777777777"),
        workItemId: input.workItemId,
      } satisfies JobComment),
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
    getDetail: (_organizationId: OrganizationId, _workItemId: Job["id"]) =>
      Effect.succeed(Option.none()),
    list: (_organizationId: OrganizationId, _query: unknown) =>
      Effect.succeed({
        items: [],
        nextCursor: undefined,
      } satisfies JobListResponse),
    listMemberOptions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly JobMemberOption[]),
    patch: (
      _organizationId: OrganizationId,
      _workItemId: Job["id"],
      _input: unknown
    ) =>
      Effect.sync(() => {
        calls.patch += 1;

        return Option.some(lockedJob);
      }),
    reopen: (_organizationId: OrganizationId, _workItemId: Job["id"]) =>
      Effect.succeed(Option.some(makeJob({ status: "in_progress" }))),
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
    withTransaction: <Value, Error, Requirements>(
      effect: Effect.Effect<Value, Error, Requirements>
    ) =>
      options.transactionFailure === undefined
        ? effect
        : Effect.fail(options.transactionFailure as Error),
  });

  const sitesRepository = SitesRepository.make({
    create: (_input: unknown) => Effect.succeed(siteId),
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
    listRegions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly JobRegionOption[]),
  });

  const contactsRepository = ContactsRepository.make({
    create: (_input: unknown) => Effect.succeed(contactId),
    findById: (_organizationId: OrganizationId, _contactId: ContactId) =>
      Effect.succeed(Option.some(contactId)),
    listOptions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies JobOptionsResponse["contacts"]),
  });

  const repositoriesLayer = Layer.mergeAll(
    Layer.succeed(JobsRepository, jobsRepository),
    Layer.succeed(SitesRepository, sitesRepository),
    Layer.succeed(ContactsRepository, contactsRepository)
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
