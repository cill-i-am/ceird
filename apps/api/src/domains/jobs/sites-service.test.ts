import { HttpServerRequest } from "@effect/platform";
import {
  JobAccessDeniedError,
  RegionNotFoundError,
  SiteGeocodingFailedError,
} from "@task-tracker/jobs-core";
import type {
  ContactIdType as ContactId,
  CreateSiteInput,
  JobActivityPayload,
  JobListResponse,
  JobMemberOption,
  JobRegionOption,
  JobSiteOption,
  OrganizationIdType as OrganizationId,
  SiteIdType as SiteId,
  UserId,
  WorkItemIdType as WorkItemId,
} from "@task-tracker/jobs-core";
import { Cause, Effect, Exit, Layer, Option } from "effect";

import { JobsAuthorization } from "./authorization.js";
import { CurrentJobsActor } from "./current-jobs-actor.js";
import type { JobsActor } from "./current-jobs-actor.js";
import {
  ContactsRepository,
  JobsRepository,
  SitesRepository,
} from "./repositories.js";
import { SiteGeocoder } from "./site-geocoder.js";
import { SitesService } from "./sites-service.js";

const siteId = "22222222-2222-4222-8222-222222222222" as SiteId;
const regionId = "33333333-3333-4333-8333-333333333333" as NonNullable<
  JobSiteOption["regionId"]
>;
const actorUserId = "44444444-4444-4444-8444-444444444444" as UserId;
const undefinedValue = undefined as undefined;
const geocodedAt = "2026-04-22T10:00:00.000Z";
const siteInput = {
  addressLine1: "1 Custom House Quay",
  country: "IE",
  county: "Dublin",
  eircode: "D01 X2X2",
  name: "Docklands Campus",
  regionId,
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

interface SitesServiceHarness {
  readonly calls: {
    createSite: number;
    ensureRegion: number;
    geocode: number;
    getOptionById: number;
  };
  readonly layer: Layer.Layer<
    SitesService | HttpServerRequest.HttpServerRequest
  >;
}

function makeHarness(
  options: {
    readonly actor?: JobsActor;
    readonly geocodingFailure?: SiteGeocodingFailedError;
    readonly regionFailure?: RegionNotFoundError;
  } = {}
): SitesServiceHarness {
  const actor = options.actor ?? makeActor("owner");
  const calls = {
    createSite: 0,
    ensureRegion: 0,
    geocode: 0,
    getOptionById: 0,
  };
  const createdSiteOption: JobSiteOption = {
    addressLine1: "1 Custom House Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    geocodedAt,
    geocodingProvider: "stub",
    id: siteId,
    latitude: 53.3498,
    longitude: -6.2603,
    name: "Docklands Campus",
    regionId,
    regionName: "Dublin",
    town: "Dublin",
  };
  const unexpected = (label: string) =>
    Effect.die(new Error(`Unexpected repository call: ${label}`));

  const jobsRepository = JobsRepository.make({
    addActivity: (_input: {
      readonly actorUserId?: UserId;
      readonly organizationId: OrganizationId;
      readonly payload: JobActivityPayload;
      readonly workItemId: WorkItemId;
    }) => unexpected("addActivity"),
    addComment: (_input: unknown) => unexpected("addComment"),
    addCostLine: (_input: unknown) => unexpected("addCostLine"),
    addVisit: (_input: unknown) => unexpected("addVisit"),
    create: (_input: unknown) => unexpected("create"),
    findById: (_organizationId: OrganizationId, _workItemId: WorkItemId) =>
      unexpected("findById"),
    findByIdForUpdate: (
      _organizationId: OrganizationId,
      _workItemId: WorkItemId
    ) => unexpected("findByIdForUpdate"),
    getDetail: (_organizationId: OrganizationId, _workItemId: WorkItemId) =>
      unexpected("getDetail"),
    list: (_organizationId: OrganizationId, _query: unknown) =>
      Effect.succeed({
        items: [],
        nextCursor: undefined,
      } satisfies JobListResponse),
    listMemberOptions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly JobMemberOption[]),
    patch: (
      _organizationId: OrganizationId,
      _workItemId: WorkItemId,
      _input: unknown
    ) => unexpected("patch"),
    reopen: (_organizationId: OrganizationId, _workItemId: WorkItemId) =>
      unexpected("reopen"),
    transition: (
      _organizationId: OrganizationId,
      _workItemId: WorkItemId,
      _input: unknown
    ) => unexpected("transition"),
    withTransaction: <Value, Error, Requirements>(
      effect: Effect.Effect<Value, Error, Requirements>
    ) => effect,
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
      readonly regionId?: typeof regionId;
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
          regionId,
          town: "Dublin",
        });

        return siteId;
      }),
    ensureRegionInOrganization: (
      organizationId: OrganizationId,
      requestedRegionId: typeof regionId
    ) =>
      Effect.gen(function* () {
        calls.ensureRegion += 1;
        expect(organizationId).toBe(actor.organizationId);
        expect(requestedRegionId).toBe(regionId);

        if (options.regionFailure !== undefined) {
          return yield* Effect.fail(options.regionFailure);
        }

        return requestedRegionId;
      }),
    findById: (_organizationId: OrganizationId, _siteId: SiteId) =>
      Effect.succeed(Option.some(siteId)),
    getOptionById: (organizationId: OrganizationId, requestedSiteId: SiteId) =>
      Effect.sync(() => {
        calls.getOptionById += 1;
        expect(organizationId).toBe(actor.organizationId);
        expect(requestedSiteId).toBe(siteId);

        return Option.some(createdSiteOption);
      }),
    linkContact: (_input: {
      readonly contactId: ContactId;
      readonly isPrimary?: boolean;
      readonly organizationId: OrganizationId;
      readonly siteId: SiteId;
    }) => Effect.succeed(undefinedValue),
    listOptions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly JobSiteOption[]),
    listRegions: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly JobRegionOption[]),
    update: (
      _organizationId: OrganizationId,
      _siteId: SiteId,
      _input: unknown
    ) => unexpected("sites.update"),
  });

  const contactsRepository = ContactsRepository.make({
    create: (_input: unknown) => unexpected("contacts.create"),
    findById: (_organizationId: OrganizationId, _contactId: ContactId) =>
      unexpected("contacts.findById"),
    listOptions: (_organizationId: OrganizationId) => Effect.succeed([]),
  });
  const siteGeocoder = SiteGeocoder.make({
    geocode: (input: CreateSiteInput) =>
      Effect.gen(function* () {
        calls.geocode += 1;
        expect(input).toStrictEqual(siteInput);

        if (options.geocodingFailure !== undefined) {
          return yield* Effect.fail(options.geocodingFailure);
        }

        return {
          geocodedAt,
          latitude: 53.3498,
          longitude: -6.2603,
          provider: "stub" as const,
        };
      }),
  });

  const serviceLayer = Layer.provide(
    SitesService.DefaultWithoutDependencies,
    Layer.mergeAll(
      Layer.succeed(
        CurrentJobsActor,
        CurrentJobsActor.make({
          get: () => Effect.succeed(actor),
        })
      ),
      Layer.succeed(JobsRepository, jobsRepository),
      Layer.succeed(SitesRepository, sitesRepository),
      Layer.succeed(ContactsRepository, contactsRepository),
      Layer.succeed(SiteGeocoder, siteGeocoder),
      JobsAuthorization.Default
    )
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

function runSitesService<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    SitesService | HttpServerRequest.HttpServerRequest
  >,
  harness: SitesServiceHarness
) {
  return Effect.runPromise(effect.pipe(Effect.provide(harness.layer)));
}

function runSitesServiceExit<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    SitesService | HttpServerRequest.HttpServerRequest
  >,
  harness: SitesServiceHarness
) {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(harness.layer)));
}

function getFailure<Value, Error>(exit: Exit.Exit<Value, Error>) {
  return Exit.isFailure(exit)
    ? Option.getOrUndefined(Cause.failureOption(exit.cause))
    : undefined;
}

describe("sites service", () => {
  it("creates a standalone site and returns the created site option", async () => {
    const harness = makeHarness();

    await expect(
      runSitesService(
        Effect.gen(function* () {
          const sites = yield* SitesService;

          return yield* sites.create(siteInput);
        }),
        harness
      )
    ).resolves.toMatchObject({
      id: siteId,
      name: "Docklands Campus",
      regionId,
    });

    expect(harness.calls.geocode).toBe(1);
    expect(harness.calls.createSite).toBe(1);
    expect(harness.calls.ensureRegion).toBe(1);
    expect(harness.calls.getOptionById).toBe(1);
  }, 10_000);

  it("blocks organization members from creating standalone sites", async () => {
    const harness = makeHarness({ actor: makeActor("member") });

    const exit = await runSitesServiceExit(
      Effect.gen(function* () {
        const sites = yield* SitesService;

        return yield* sites.create(siteInput);
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(JobAccessDeniedError);
    expect(getFailure(exit)).toMatchObject({
      message: "Only organization owners and admins can create sites",
    });
    expect(harness.calls.geocode).toBe(0);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.ensureRegion).toBe(0);
    expect(harness.calls.getOptionById).toBe(0);
  }, 10_000);

  it("validates stale regions before geocoding standalone sites", async () => {
    const failure = new RegionNotFoundError({
      message: "Region does not exist in the organization",
      organizationId: makeActor("owner").organizationId,
      regionId,
    });
    const harness = makeHarness({ regionFailure: failure });

    const exit = await runSitesServiceExit(
      Effect.gen(function* () {
        const sites = yield* SitesService;

        return yield* sites.create(siteInput);
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(failure);
    expect(harness.calls.ensureRegion).toBe(1);
    expect(harness.calls.geocode).toBe(0);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.getOptionById).toBe(0);
  }, 10_000);

  it("does not create a site when geocoding fails", async () => {
    const failure = new SiteGeocodingFailedError({
      country: "IE",
      eircode: "D01 X2X2",
      message: "We could not locate that site address.",
    });
    const harness = makeHarness({ geocodingFailure: failure });

    const exit = await runSitesServiceExit(
      Effect.gen(function* () {
        const sites = yield* SitesService;

        return yield* sites.create(siteInput);
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(failure);
    expect(harness.calls.ensureRegion).toBe(1);
    expect(harness.calls.geocode).toBe(1);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.getOptionById).toBe(0);
  }, 10_000);
});
