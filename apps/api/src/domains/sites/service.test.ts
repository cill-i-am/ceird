import type { OrganizationId, UserId } from "@ceird/identity-core";
import {
  SiteAccessDeniedError,
  ServiceAreaNotFoundError,
  SiteGeocodingFailedError,
  SiteStorageError,
} from "@ceird/sites-core";
import type {
  CreateSiteInput,
  ServiceArea,
  SiteIdType as SiteId,
  SiteOption as JobSiteOption,
  SitesOptionsResponse,
} from "@ceird/sites-core";
import { HttpServerRequest } from "@effect/platform";
import { SqlError } from "@effect/sql/SqlError";
import { Cause, Effect, Exit, Layer, Option } from "effect";

import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { SiteGeocoder } from "./geocoder.js";
import { ServiceAreasRepository, SitesRepository } from "./repositories.js";
import { SitesService } from "./service.js";

const siteId = "22222222-2222-4222-8222-222222222222" as SiteId;
const serviceAreaId = "33333333-3333-4333-8333-333333333333" as NonNullable<
  JobSiteOption["serviceAreaId"]
>;
const actorUserId = "44444444-4444-4444-8444-444444444444" as UserId;
const geocodedAt = "2026-04-22T10:00:00.000Z";
const siteInput = {
  addressLine1: "1 Custom House Quay",
  country: "IE",
  county: "Dublin",
  eircode: "D01 X2X2",
  name: "Docklands Campus",
  serviceAreaId,
  town: "Dublin",
} satisfies CreateSiteInput;

function makeActor(
  role: OrganizationActor["role"],
  overrides: Partial<OrganizationActor> = {}
): OrganizationActor {
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
    ensureServiceArea: number;
    geocode: number;
    getOptionById: number;
    listOptions: number;
    listServiceAreas: number;
  };
  readonly layer: Layer.Layer<
    SitesService | HttpServerRequest.HttpServerRequest
  >;
}

function makeHarness(
  options: {
    readonly actor?: OrganizationActor;
    readonly geocodingFailure?: SiteGeocodingFailedError;
    readonly serviceAreaFailure?: ServiceAreaNotFoundError;
    readonly serviceAreaStorageFailure?: SqlError;
  } = {}
): SitesServiceHarness {
  const actor = options.actor ?? makeActor("owner");
  const calls = {
    createSite: 0,
    ensureServiceArea: 0,
    geocode: 0,
    getOptionById: 0,
    listOptions: 0,
    listServiceAreas: 0,
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
    serviceAreaId,
    serviceAreaName: "Dublin",
    town: "Dublin",
  };
  const unexpected = (label: string) =>
    Effect.die(new Error(`Unexpected repository call: ${label}`));

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
      readonly serviceAreaId?: typeof serviceAreaId;
      readonly town?: string;
    }) =>
      Effect.gen(function* () {
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
          serviceAreaId,
          town: "Dublin",
        });

        if (options.serviceAreaFailure !== undefined) {
          return yield* Effect.fail(options.serviceAreaFailure);
        }

        if (options.serviceAreaStorageFailure !== undefined) {
          return yield* Effect.fail(options.serviceAreaStorageFailure);
        }

        return siteId;
      }),
    ensureServiceAreaInOrganization: (
      organizationId: OrganizationId,
      requestedServiceAreaId: typeof serviceAreaId
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
    getOptionById: (organizationId: OrganizationId, requestedSiteId: SiteId) =>
      Effect.sync(() => {
        calls.getOptionById += 1;
        expect(organizationId).toBe(actor.organizationId);
        expect(requestedSiteId).toBe(siteId);

        return Option.some(createdSiteOption);
      }),
    listOptions: (organizationId: OrganizationId) =>
      Effect.sync(() => {
        calls.listOptions += 1;
        expect(organizationId).toBe(actor.organizationId);

        return [] satisfies readonly JobSiteOption[];
      }),
    update: (
      _organizationId: OrganizationId,
      _siteId: SiteId,
      _input: unknown
    ) => unexpected("sites.update"),
    withTransaction: <Value, Error, Requirements>(
      effect: Effect.Effect<Value, Error, Requirements>
    ) => effect,
  });

  const serviceAreasRepository = ServiceAreasRepository.make({
    create: (_input: unknown) => unexpected("configuration.createServiceArea"),
    list: (_organizationId: OrganizationId) =>
      Effect.succeed([] satisfies readonly ServiceArea[]),
    listOptions: (organizationId: OrganizationId) =>
      Effect.sync(() => {
        calls.listServiceAreas += 1;
        expect(organizationId).toBe(actor.organizationId);

        return [] satisfies SitesOptionsResponse["serviceAreas"];
      }),
    update: (
      _organizationId: OrganizationId,
      _serviceAreaId: typeof serviceAreaId,
      _input: unknown
    ) => unexpected("configuration.updateServiceArea"),
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
        CurrentOrganizationActor,
        CurrentOrganizationActor.make({
          get: () => Effect.succeed(actor),
        })
      ),
      Layer.succeed(SitesRepository, sitesRepository),
      Layer.succeed(ServiceAreasRepository, serviceAreasRepository),
      Layer.succeed(SiteGeocoder, siteGeocoder),
      OrganizationAuthorization.Default
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
      serviceAreaId,
    });

    expect(harness.calls.geocode).toBe(1);
    expect(harness.calls.createSite).toBe(1);
    expect(harness.calls.ensureServiceArea).toBe(0);
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

    expect(getFailure(exit)).toBeInstanceOf(SiteAccessDeniedError);
    expect(getFailure(exit)).toMatchObject({
      message: "Only organization owners and admins can create sites",
    });
    expect(harness.calls.geocode).toBe(0);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.ensureServiceArea).toBe(0);
    expect(harness.calls.getOptionById).toBe(0);
  }, 10_000);

  it("denies external actors loading organization-wide site options", async () => {
    const harness = makeHarness({ actor: makeActor("external") });

    const exit = await runSitesServiceExit(
      Effect.gen(function* () {
        const sites = yield* SitesService;

        return yield* sites.getOptions();
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(SiteAccessDeniedError);
    expect(getFailure(exit)).toMatchObject({
      message:
        "External collaborators cannot view organization-wide site options",
    });
    expect(harness.calls.listOptions).toBe(0);
    expect(harness.calls.listServiceAreas).toBe(0);
  }, 10_000);

  it("maps stale service areas from site creation", async () => {
    const failure = new ServiceAreaNotFoundError({
      message: "Service area does not exist in the organization",
      organizationId: makeActor("owner").organizationId,
      serviceAreaId,
    });
    const harness = makeHarness({ serviceAreaFailure: failure });

    const exit = await runSitesServiceExit(
      Effect.gen(function* () {
        const sites = yield* SitesService;

        return yield* sites.create(siteInput);
      }),
      harness
    );

    expect(getFailure(exit)).toStrictEqual(failure);
    expect(harness.calls.ensureServiceArea).toBe(0);
    expect(harness.calls.geocode).toBe(1);
    expect(harness.calls.createSite).toBe(1);
    expect(harness.calls.getOptionById).toBe(0);
  }, 10_000);

  it("maps service area validation storage failures from site creation", async () => {
    const harness = makeHarness({
      serviceAreaStorageFailure: new SqlError({
        message: "database unavailable",
      }),
    });

    const exit = await runSitesServiceExit(
      Effect.gen(function* () {
        const sites = yield* SitesService;

        return yield* sites.create(siteInput);
      }),
      harness
    );

    expect(getFailure(exit)).toBeInstanceOf(SiteStorageError);
    expect(getFailure(exit)).toMatchObject({
      cause: "database unavailable",
      message: "Sites storage operation failed",
    });
    expect(harness.calls.ensureServiceArea).toBe(0);
    expect(harness.calls.geocode).toBe(1);
    expect(harness.calls.createSite).toBe(1);
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
    expect(harness.calls.ensureServiceArea).toBe(0);
    expect(harness.calls.geocode).toBe(1);
    expect(harness.calls.createSite).toBe(0);
    expect(harness.calls.getOptionById).toBe(0);
  }, 10_000);
});
