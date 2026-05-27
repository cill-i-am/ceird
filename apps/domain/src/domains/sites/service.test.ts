import { OrganizationId, UserId } from "@ceird/identity-core";
import type {
  GooglePlaceIdType,
  GooglePlacesSessionTokenType,
  IsoDateTimeStringType,
  SiteLatitude,
  SiteLongitude,
} from "@ceird/sites-core";
import {
  CreateSiteInputSchema,
  SiteId,
  SiteOptionSchema,
  SitesOptionsResponseSchema,
} from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { CommentsRepository } from "../comments/repository.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { SiteLocationProvider } from "./location-provider.js";
import {
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "./repositories.js";
import { SitesService } from "./service.js";

type ContextService<Service> = Service extends {
  readonly Service: infer Shape;
}
  ? Shape
  : never;

const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeSiteOption = Schema.decodeUnknownSync(SiteOptionSchema);
const decodeUserId = Schema.decodeUnknownSync(UserId);

const actor = {
  organizationId: decodeOrganizationId("org_123"),
  role: "admin",
  userId: decodeUserId("user_admin"),
} satisfies OrganizationActor;

describe("SitesService contracts", () => {
  it("keeps site creation focused on optional location and access details", () => {
    expect(
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        accessNotes: "  Use north gate  ",
        location: {
          country: "IE",
          kind: "manual",
          rawInput: "  near the old quarry gate  ",
        },
        name: "  Quarry Gate  ",
      })
    ).toStrictEqual({
      accessNotes: "Use north gate",
      location: {
        country: "IE",
        kind: "manual",
        rawInput: "near the old quarry gate",
      },
      name: "Quarry Gate",
    });

    expect(() =>
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        location: {
          kind: "manual",
          rawInput: "near the old quarry gate",
        },
        name: "Quarry Gate",
        removedField: "33333333-3333-4333-8333-333333333333",
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("accepts an empty site options response", () => {
    expect(
      Schema.decodeUnknownSync(SitesOptionsResponseSchema)({ sites: [] })
    ).toStrictEqual({ sites: [] });
  });

  it("creates an unverified site when location is omitted", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111111");
    const createdSite = decodeSiteOption({
      displayLocation: "",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Laydown yard",
    });
    let createdRecord:
      | Parameters<ContextService<typeof SitesRepository>["create"]>[0]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.create({
          name: "Laydown yard",
        })
      ),
      {
        create: (input) => {
          createdRecord = input;
          return Effect.succeed(siteId);
        },
        getOptionById: () => Effect.succeed(Option.some(createdSite)),
      }
    );

    expect(result).toStrictEqual(createdSite);
    expect(createdRecord).toMatchObject({
      displayLocation: "",
      locationStatus: "unverified",
      name: "Laydown yard",
      organizationId: actor.organizationId,
    });
  });

  it("does not call the location provider for manual locations", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111112");
    const createdSite = decodeSiteOption({
      country: "IE",
      displayLocation: "gate beside old quarry",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Quarry gate",
      rawLocationInput: "gate beside old quarry",
    });
    let createdRecord:
      | Parameters<ContextService<typeof SitesRepository>["create"]>[0]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.create({
          location: {
            country: "IE",
            kind: "manual",
            rawInput: "gate beside old quarry",
          },
          name: "Quarry gate",
        })
      ),
      {
        create: (input) => {
          createdRecord = input;
          return Effect.succeed(siteId);
        },
        getOptionById: () => Effect.succeed(Option.some(createdSite)),
        resolvePlace: () =>
          Effect.die("SiteLocationProvider.resolvePlace should not be called"),
      }
    );

    expect(result).toStrictEqual(createdSite);
    expect(createdRecord).toMatchObject({
      country: "IE",
      displayLocation: "gate beside old quarry",
      locationStatus: "unverified",
      rawLocationInput: "gate beside old quarry",
    });
  });

  it("resolves Google place inputs before persisting", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111113");
    const googlePlaceId = "ChIJabc" as GooglePlaceIdType;
    const createdSite = decodeSiteOption({
      displayLocation: "Dublin Port",
      formattedAddress: "Dublin Port, Dublin, Ireland",
      googlePlaceId,
      hasUsableCoordinates: true,
      id: siteId,
      labels: [],
      latitude: 53.3478,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.1956,
      name: "Dublin Port",
      rawLocationInput: "dub port",
    });
    let createdRecord:
      | Parameters<ContextService<typeof SitesRepository>["create"]>[0]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.create({
          location: {
            displayText: "Dublin Port",
            kind: "google_place",
            placeId: googlePlaceId,
            rawInput: "dub port",
            sessionToken:
              "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType,
          },
          name: "Dublin Port",
        })
      ),
      {
        create: (input) => {
          createdRecord = input;
          return Effect.succeed(siteId);
        },
        getOptionById: () => Effect.succeed(Option.some(createdSite)),
        resolvePlace: () =>
          Effect.succeed({
            addressComponents: [],
            displayLocation: "Dublin Port",
            formattedAddress: "Dublin Port, Dublin, Ireland",
            googlePlaceId,
            latitude: 53.3478 as SiteLatitude,
            locationProvider: "google_places",
            locationResolvedAt:
              "2026-05-26T08:00:00.000Z" as IsoDateTimeStringType,
            locationStatus: "google_resolved" as const,
            longitude: -6.1956 as SiteLongitude,
            rawLocationInput: "dub port",
          }),
      }
    );

    expect(result).toStrictEqual(createdSite);
    expect(createdRecord).toMatchObject({
      displayLocation: "Dublin Port",
      googlePlaceId,
      latitude: 53.3478,
      locationProvider: "google_places",
      locationStatus: "google_resolved",
      longitude: -6.1956,
      rawLocationInput: "dub port",
    });
  });

  it("preserves the existing location when an update omits location", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111114");
    const googlePlaceId = "ChIJexisting" as GooglePlaceIdType;
    const existingSite = decodeSiteOption({
      displayLocation: "Existing Depot",
      formattedAddress: "Existing Depot, Dublin, Ireland",
      googlePlaceId,
      hasUsableCoordinates: true,
      id: siteId,
      labels: [],
      latitude: 53.3,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.2,
      name: "Existing Depot",
      rawLocationInput: "existing dep",
    });
    const updatedSite = decodeSiteOption({
      ...existingSite,
      accessNotes: "Use yard gate",
      name: "Existing Depot Updated",
    });
    let updatedRecord:
      | Parameters<ContextService<typeof SitesRepository>["update"]>[2]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.update(siteId, {
          accessNotes: "Use yard gate",
          name: "Existing Depot Updated",
        })
      ),
      {
        getOptionById: () => Effect.succeed(Option.some(existingSite)),
        update: (_organizationId, _siteId, input) => {
          updatedRecord = input;
          return Effect.succeed(Option.some(updatedSite));
        },
      }
    );

    expect(result).toStrictEqual(updatedSite);
    expect(updatedRecord).toStrictEqual({
      accessNotes: "Use yard gate",
      name: "Existing Depot Updated",
    });
  });

  it("does not resolve Google again when an update submits the unchanged location", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111115");
    const googlePlaceId = "ChIJunchanged" as GooglePlaceIdType;
    const existingSite = decodeSiteOption({
      displayLocation: "Unchanged Depot",
      formattedAddress: "Unchanged Depot, Dublin, Ireland",
      googlePlaceId,
      hasUsableCoordinates: true,
      id: siteId,
      labels: [],
      latitude: 53.3,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.2,
      name: "Unchanged Depot",
      rawLocationInput: "unchanged dep",
    });
    let updatedRecord:
      | Parameters<ContextService<typeof SitesRepository>["update"]>[2]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.update(siteId, {
          location: {
            displayText: "Unchanged Depot",
            kind: "google_place",
            placeId: googlePlaceId,
            rawInput: "unchanged dep",
            sessionToken:
              "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType,
          },
          name: "Unchanged Depot",
        })
      ),
      {
        getOptionById: () => Effect.succeed(Option.some(existingSite)),
        resolvePlace: () =>
          Effect.die("SiteLocationProvider.resolvePlace should not be called"),
        update: (_organizationId, _siteId, input) => {
          updatedRecord = input;
          return Effect.succeed(Option.some(existingSite));
        },
      }
    );

    expect(result).toStrictEqual(existingSite);
    expect(updatedRecord).toStrictEqual({
      accessNotes: undefined,
      name: "Unchanged Depot",
    });
  });

  it("clears an existing location when an update explicitly sends null", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111116");
    const existingSite = decodeSiteOption({
      displayLocation: "Existing Depot",
      formattedAddress: "Existing Depot, Dublin, Ireland",
      googlePlaceId: "ChIJexisting" as GooglePlaceIdType,
      hasUsableCoordinates: true,
      id: siteId,
      labels: [],
      latitude: 53.3,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.2,
      name: "Existing Depot",
      rawLocationInput: "existing dep",
    });
    const updatedSite = decodeSiteOption({
      displayLocation: "",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Existing Depot",
    });
    let updatedRecord:
      | Parameters<ContextService<typeof SitesRepository>["update"]>[2]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.update(siteId, {
          location: null,
          name: "Existing Depot",
        })
      ),
      {
        getOptionById: () => Effect.succeed(Option.some(existingSite)),
        update: (_organizationId, _siteId, input) => {
          updatedRecord = input;
          return Effect.succeed(Option.some(updatedSite));
        },
      }
    );

    expect(result).toStrictEqual(updatedSite);
    expect(updatedRecord).toStrictEqual({
      accessNotes: undefined,
      location: {
        displayLocation: "",
        locationStatus: "unverified",
      },
      name: "Existing Depot",
    });
  });

  it("proxies location autocomplete through the provider", async () => {
    let autocompleteInput:
      | Parameters<
          ContextService<typeof SiteLocationProvider>["autocomplete"]
        >[0]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.autocompleteLocation({
          country: "IE",
          input: "dub port",
          sessionToken:
            "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType,
        })
      ),
      {
        autocomplete: (input) => {
          autocompleteInput = input;
          return Effect.succeed({
            suggestions: [
              {
                displayText: "Dublin Port",
                placeId: "ChIJabc" as GooglePlaceIdType,
              },
            ],
          });
        },
      }
    );

    expect(result.suggestions[0]).toMatchObject({
      displayText: "Dublin Port",
      placeId: "ChIJabc",
    });
    expect(autocompleteInput).toMatchObject({
      country: "IE",
      input: "dub port",
    });
  });

  it("returns place details resolved by the provider", async () => {
    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.getLocationPlaceDetails({
          placeId: "ChIJabc" as GooglePlaceIdType,
          rawInput: "dub port",
          sessionToken:
            "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType,
        })
      ),
      {
        resolvePlace: () =>
          Effect.succeed({
            addressComponents: [],
            displayLocation: "Dublin Port",
            formattedAddress: "Dublin Port, Dublin, Ireland",
            googlePlaceId: "ChIJabc" as GooglePlaceIdType,
            latitude: 53.3478 as SiteLatitude,
            locationProvider: "google_places",
            locationResolvedAt:
              "2026-05-26T08:00:00.000Z" as IsoDateTimeStringType,
            locationStatus: "google_resolved" as const,
            longitude: -6.1956 as SiteLongitude,
            rawLocationInput: "dub port",
          }),
      }
    );

    expect(result).toMatchObject({
      displayLocation: "Dublin Port",
      formattedAddress: "Dublin Port, Dublin, Ireland",
      googlePlaceId: "ChIJabc",
      latitude: 53.3478,
      longitude: -6.1956,
    });
  });
});

type TestSitesServiceRequirements =
  | CommentsRepository
  | CurrentOrganizationActor
  | HttpServerRequest.HttpServerRequest
  | OrganizationAuthorization
  | SiteLabelAssignmentsRepository
  | SiteLocationProvider
  | SitesRepository;

function sitesServiceCall<
  Value,
  Error,
  Requirements extends TestSitesServiceRequirements = never,
>(
  call: (
    service: ContextService<typeof SitesService>
  ) => Effect.Effect<Value, Error, Requirements>
) {
  return Effect.gen(function* () {
    const sites = yield* SitesService;

    return yield* call(sites);
  });
}

function runSitesServiceEffect<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    SitesService | TestSitesServiceRequirements
  >,
  options: Partial<TestSitesDependencies> = {}
) {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(SitesService.DefaultWithoutDependencies),
      Effect.provide(makeSitesServiceTestLayer(options))
    )
  );
}

interface TestSitesDependencies {
  readonly autocomplete: ContextService<
    typeof SiteLocationProvider
  >["autocomplete"];
  readonly create: ContextService<typeof SitesRepository>["create"];
  readonly getOptionById: ContextService<
    typeof SitesRepository
  >["getOptionById"];
  readonly resolvePlace: ContextService<
    typeof SiteLocationProvider
  >["resolvePlace"];
  readonly update: ContextService<typeof SitesRepository>["update"];
}

function makeSitesServiceTestLayer(options: Partial<TestSitesDependencies>) {
  return Layer.mergeAll(
    Layer.succeed(
      CommentsRepository,
      CommentsRepository.of({} as ContextService<typeof CommentsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(actor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      OrganizationAuthorization,
      OrganizationAuthorization.of({
        ensureCanCreateSite: () => Effect.void,
        ensureCanViewOrganizationData: () => Effect.void,
      } as unknown as ContextService<typeof OrganizationAuthorization>)
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({
        autocomplete:
          options.autocomplete ??
          (() => Effect.die("SiteLocationProvider.autocomplete not stubbed")),
        resolvePlace:
          options.resolvePlace ??
          (() => Effect.die("SiteLocationProvider.resolvePlace not stubbed")),
      })
    ),
    Layer.succeed(
      SiteLabelAssignmentsRepository,
      SiteLabelAssignmentsRepository.of(
        {} as ContextService<typeof SiteLabelAssignmentsRepository>
      )
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({
        create:
          options.create ??
          (() => Effect.die("SitesRepository.create not stubbed")),
        getOptionById:
          options.getOptionById ??
          (() => Effect.die("SitesRepository.getOptionById not stubbed")),
        update:
          options.update ??
          (() => Effect.die("SitesRepository.update not stubbed")),
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => effect,
      } as unknown as ContextService<typeof SitesRepository>)
    )
  );
}
