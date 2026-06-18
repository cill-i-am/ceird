import type { ProductActivityEvent } from "@ceird/activity-core";
import { ProductActivityEventDisplayPayloadSchema } from "@ceird/activity-core";
import { CommentId } from "@ceird/comments-core";
import {
  decodeUserPreferences,
  OrganizationId,
  ProductActorId,
  UserId,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import { LabelId } from "@ceird/labels-core";
import {
  GooglePlaceId,
  ProximityAccessDeniedError,
  signProximityOriginToken,
} from "@ceird/proximity-core";
import type { TypedOrigin, UnsignedTypedOrigin } from "@ceird/proximity-core";
import type {
  GooglePlaceIdType,
  GooglePlacesSessionTokenType,
  IsoDateTimeStringType,
  SiteLatitude,
  SiteLongitude,
  SiteComment,
  SiteProximityFilters,
} from "@ceird/sites-core";
import {
  CreateSiteInputSchema,
  SiteAccessDeniedError,
  SiteId,
  SiteOptionSchema,
  SitesOptionsResponseSchema,
} from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";

import { DomainDrizzle } from "../../platform/database/database.js";
import type { DomainDrizzleService } from "../../platform/database/database.js";
import {
  configProviderFromMap,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import {
  ActivityEventsRepository,
  ProductActivityActorsRepository,
} from "../activity/repository.js";
import type { RecordActivityEventInput } from "../activity/repository.js";
import { CommentsRepository } from "../comments/repository.js";
import { UserPreferencesRepository } from "../identity/preferences/repository.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { RouteProvider } from "../proximity/route-provider.js";
import type {
  RankRoutesInput,
  RoutePreviewInput,
} from "../proximity/route-provider.js";
import { RouteProximityService } from "../proximity/service.js";
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
const decodeGooglePlaceId = Schema.decodeUnknownSync(GooglePlaceId);
const decodeLabelId = Schema.decodeUnknownSync(LabelId);
const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);
const decodeCommentId = Schema.decodeUnknownSync(CommentId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeSiteOption = Schema.decodeUnknownSync(SiteOptionSchema);
const decodeUserId = Schema.decodeUnknownSync(UserId);
const PROXIMITY_ORIGIN_TOKEN_SECRET = "proximity-origin-secret";
const proximityOriginConfigProvider = configProviderFromMap(
  new Map([["AGENT_INTERNAL_SECRET", PROXIMITY_ORIGIN_TOKEN_SECRET]])
);

const actor = {
  organizationId: decodeOrganizationId("org_123"),
  role: "admin",
  userId: decodeUserId("user_admin"),
} satisfies OrganizationActor;

async function makeSignedTypedOrigin(
  input: Partial<UnsignedTypedOrigin> = {}
): Promise<TypedOrigin> {
  const origin = {
    coordinates: input.coordinates ?? { latitude: 53.34, longitude: -6.26 },
    displayText: input.displayText ?? "Heuston Station",
    mode: "typed_origin" as const,
    placeId: input.placeId ?? decodeGooglePlaceId("google-place-origin"),
  } satisfies UnsignedTypedOrigin;

  return {
    ...origin,
    originToken: await signProximityOriginToken({
      origin,
      secret: PROXIMITY_ORIGIN_TOKEN_SECRET,
      ttlSeconds: 300,
    }),
  };
}

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
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    let createdRecord:
      | Parameters<ContextService<typeof SitesRepository>["create"]>[0]
      | undefined;
    const recordedEvents: RecordActivityEventInput[] = [];

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
        recordActivityEvent: (input) => {
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(result).toStrictEqual({
      mutation: { txid: 701 },
      site: createdSite,
    });
    expect(createdRecord).toMatchObject({
      displayLocation: "",
      locationStatus: "unverified",
      name: "Laydown yard",
      organizationId: actor.organizationId,
    });
    expect(recordedEvents).toStrictEqual([
      expect.objectContaining({
        actorId: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
        display: {
          detail: "Site details updated.",
          route: {
            href: `/sites?selectedSiteId=${siteId}`,
            label: "Laydown yard",
          },
          summary: "Created Laydown yard",
        },
        eventType: "site.created",
        organizationId: actor.organizationId,
        sourceId: expect.stringMatching(`^site:${siteId}:created:`),
        sourceType: "site",
        status: "synced",
        targetId: siteId,
        targetType: "site",
      }),
    ]);
  });

  it("does not emit site activity when creation is unauthorized", async () => {
    const recordedEvents: RecordActivityEventInput[] = [];
    let createCalls = 0;

    const exit = await Effect.runPromiseExit(
      sitesServiceCall((sites) =>
        sites.create({
          name: "Unauthorized yard",
        })
      ).pipe(
        Effect.provide(SitesService.DefaultWithoutDependencies),
        Effect.provide(
          makeSitesServiceTestLayer({
            create: () => {
              createCalls += 1;
              return Effect.die("SitesRepository.create should not be called");
            },
            ensureCanCreateSite: () =>
              Effect.fail(
                new OrganizationAuthorizationDeniedError({
                  message: "Not allowed",
                })
              ),
            recordActivityEvent: (input) => {
              recordedEvents.push(input);
              return Effect.succeed({} as ProductActivityEvent);
            },
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

      expect(failure).toBeInstanceOf(SiteAccessDeniedError);
    }
    expect(createCalls).toBe(0);
    expect(recordedEvents).toStrictEqual([]);
  });

  it("adds site comments with product-safe actors and records Activity compatibility events", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111121");
    const site = decodeSiteOption({
      displayLocation: "Dublin Port",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Dublin Port",
      updatedAt: "2026-06-15T09:00:00.000Z",
    });
    const comment = {
      actor: {
        displayDetail: "Team member",
        displayName: "Taylor Member",
        id: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
        kind: "member",
      },
      actorId: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
      authorName: "Taylor Member",
      body: "Bring the dock gate key.",
      createdAt: "2026-06-15T09:10:00.000Z",
      id: decodeCommentId("55555555-5555-4555-8555-555555555555"),
      siteId,
    } satisfies SiteComment;
    let addInput:
      | Parameters<ContextService<typeof CommentsRepository>["addForSite"]>[0]
      | undefined;
    const recordedEvents: RecordActivityEventInput[] = [];

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.addComment(siteId, { body: "Bring the dock gate key." })
      ),
      {
        addCommentForSite: (input) => {
          addInput = input;
          return Effect.succeed(Option.some(comment));
        },
        getOptionById: () => Effect.succeed(Option.some(site)),
        recordActivityEvent: (input) => {
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(result).toStrictEqual(comment);
    expect(addInput).toMatchObject({
      authorUserId: actor.userId,
      body: "Bring the dock gate key.",
      organizationId: actor.organizationId,
      siteId,
    });
    expect(recordedEvents).toStrictEqual([
      expect.objectContaining({
        actorId: comment.actor.id,
        display: {
          detail: "Bring the dock gate key.",
          route: {
            href: `/sites?selectedSiteId=${siteId}`,
            label: "Dublin Port",
          },
          summary: "Commented on Dublin Port",
        },
        eventType: "site.comment_created",
        organizationId: actor.organizationId,
        sourceId: comment.id,
        sourceType: "comment",
        status: "synced",
        targetId: comment.id,
        targetType: "comment",
      }),
    ]);
  });

  it("adds site comments for long valid site names without rolling back Activity validation", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111122");
    const longSiteName = `Dublin Port ${"North Yard ".repeat(24)}`.trim();
    const site = decodeSiteOption({
      displayLocation: "Dublin Port",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: longSiteName,
      updatedAt: "2026-06-15T09:00:00.000Z",
    });
    const comment = {
      actor: {
        displayDetail: "Team member",
        displayName: "Taylor Member",
        id: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
        kind: "member",
      },
      actorId: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
      authorName: "Taylor Member",
      body: "Bring the dock gate key.",
      createdAt: "2026-06-15T09:10:00.000Z",
      id: decodeCommentId("55555555-5555-4555-8555-555555555556"),
      siteId,
    } satisfies SiteComment;
    const recordedEvents: RecordActivityEventInput[] = [];

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.addComment(siteId, { body: "Bring the dock gate key." })
      ),
      {
        addCommentForSite: () => Effect.succeed(Option.some(comment)),
        getOptionById: () => Effect.succeed(Option.some(site)),
        recordActivityEvent: (input) => {
          Schema.decodeUnknownSync(ProductActivityEventDisplayPayloadSchema)(
            input.display
          );
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(result).toStrictEqual(comment);
    expect(recordedEvents).toHaveLength(1);
    expect(recordedEvents[0]?.display.route?.href).toBe(
      `/sites?selectedSiteId=${siteId}`
    );
    expect(recordedEvents[0]?.display.route?.label.length).toBeLessThanOrEqual(
      80
    );
    expect(recordedEvents[0]?.display.summary).toMatch(/^Commented on /);
    expect(recordedEvents[0]?.display.summary.length).toBeLessThanOrEqual(160);
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
      updatedAt: "2026-05-20T09:30:00.000Z",
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
        autocomplete: () =>
          Effect.die("SiteLocationProvider.autocomplete should not be called"),
        getOptionById: () => Effect.succeed(Option.some(createdSite)),
        resolvePlace: () =>
          Effect.die("SiteLocationProvider.resolvePlace should not be called"),
      }
    );

    expect(result.site).toStrictEqual(createdSite);
    expect(createdRecord).toMatchObject({
      country: "IE",
      displayLocation: "gate beside old quarry",
      locationStatus: "unverified",
      rawLocationInput: "gate beside old quarry",
    });
  });

  it("canonicalizes manual Irish Eircodes without provider resolution", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111114");
    const createdSite = decodeSiteOption({
      country: "IE",
      displayLocation: "V31 R968",
      eircode: "V31 R968",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Listowel Yard",
      rawLocationInput: "V31R968",
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    let createdRecord:
      | Parameters<ContextService<typeof SitesRepository>["create"]>[0]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.create({
          location: {
            kind: "manual",
            rawInput: "V31R968",
          },
          name: "Listowel Yard",
        })
      ),
      {
        autocomplete: () =>
          Effect.die("SiteLocationProvider.autocomplete should not be called"),
        create: (input) => {
          createdRecord = input;
          return Effect.succeed(siteId);
        },
        getOptionById: () => Effect.succeed(Option.some(createdSite)),
        resolvePlace: () =>
          Effect.die("SiteLocationProvider.resolvePlace should not be called"),
      }
    );

    expect(result.site).toStrictEqual(createdSite);
    expect(createdRecord).toMatchObject({
      country: "IE",
      displayLocation: "V31 R968",
      eircode: "V31 R968",
      locationStatus: "unverified",
      rawLocationInput: "V31R968",
    });
  });

  it("resolves Google-first manual Irish Eircodes with one Places session", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111115");
    const googlePlaceId = "ChIJlistowel" as GooglePlaceIdType;
    const createdSite = decodeSiteOption({
      country: "IE",
      displayLocation: "Listowel, Co. Kerry, Ireland",
      eircode: "V31 R968",
      formattedAddress: "Listowel, Co. Kerry, Ireland",
      googlePlaceId,
      hasUsableCoordinates: true,
      id: siteId,
      labels: [],
      latitude: 52.446 as SiteLatitude,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -9.485 as SiteLongitude,
      name: "Listowel Yard",
      rawLocationInput: "V31R968",
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    let autocompleteInput:
      | Parameters<
          ContextService<typeof SiteLocationProvider>["autocomplete"]
        >[0]
      | undefined;
    let resolvePlaceInput:
      | Parameters<
          ContextService<typeof SiteLocationProvider>["resolvePlace"]
        >[0]
      | undefined;
    let createdRecord:
      | Parameters<ContextService<typeof SitesRepository>["create"]>[0]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.create(
          {
            location: {
              kind: "manual",
              rawInput: "V31R968",
            },
            name: "Listowel Yard",
          },
          { manualLocationResolution: "google-first" }
        )
      ),
      {
        autocomplete: (input) => {
          autocompleteInput = input;
          return Effect.succeed({
            suggestions: [{ displayText: "V31 R968", placeId: googlePlaceId }],
          });
        },
        create: (input) => {
          createdRecord = input;
          return Effect.succeed(siteId);
        },
        getOptionById: () => Effect.succeed(Option.some(createdSite)),
        resolvePlace: (input) => {
          resolvePlaceInput = input;
          return Effect.succeed({
            addressComponents: [],
            displayLocation: "Listowel, Co. Kerry, Ireland",
            formattedAddress: "Listowel, Co. Kerry, Ireland",
            googlePlaceId,
            latitude: 52.446 as SiteLatitude,
            locationProvider: "google_places",
            locationResolvedAt:
              "2026-05-26T08:00:00.000Z" as IsoDateTimeStringType,
            locationStatus: "google_resolved" as const,
            longitude: -9.485 as SiteLongitude,
            rawLocationInput: "provider raw",
          });
        },
      }
    );

    expect(result.site).toStrictEqual(createdSite);
    expect(autocompleteInput).toMatchObject({
      country: "IE",
      input: "V31 R968",
    });
    expect(resolvePlaceInput).toMatchObject({
      placeId: googlePlaceId,
      rawInput: "V31R968",
    });
    expect(resolvePlaceInput?.sessionToken).toBe(
      autocompleteInput?.sessionToken
    );
    expect(createdRecord).toMatchObject({
      country: "IE",
      displayLocation: "Listowel, Co. Kerry, Ireland",
      eircode: "V31 R968",
      formattedAddress: "Listowel, Co. Kerry, Ireland",
      googlePlaceId,
      latitude: 52.446,
      locationProvider: "google_places",
      locationStatus: "google_resolved",
      longitude: -9.485,
      rawLocationInput: "V31R968",
    });
  });

  it("falls back to an unverified canonical Eircode when Google-first has no suggestions", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111116");
    const createdSite = decodeSiteOption({
      country: "IE",
      displayLocation: "V31 R968",
      eircode: "V31 R968",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Listowel Yard",
      rawLocationInput: "V31R968",
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    let createdRecord:
      | Parameters<ContextService<typeof SitesRepository>["create"]>[0]
      | undefined;

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.create(
          {
            location: {
              kind: "manual",
              rawInput: "V31R968",
            },
            name: "Listowel Yard",
          },
          { manualLocationResolution: "google-first" }
        )
      ),
      {
        autocomplete: () => Effect.succeed({ suggestions: [] }),
        create: (input) => {
          createdRecord = input;
          return Effect.succeed(siteId);
        },
        getOptionById: () => Effect.succeed(Option.some(createdSite)),
        resolvePlace: () =>
          Effect.die("SiteLocationProvider.resolvePlace should not be called"),
      }
    );

    expect(result.site).toStrictEqual(createdSite);
    expect(createdRecord).toMatchObject({
      country: "IE",
      displayLocation: "V31 R968",
      eircode: "V31 R968",
      locationStatus: "unverified",
      rawLocationInput: "V31R968",
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
      updatedAt: "2026-05-20T09:30:00.000Z",
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

    expect(result.site).toStrictEqual(createdSite);
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
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    const updatedSite = decodeSiteOption({
      ...existingSite,
      accessNotes: "Use yard gate",
      name: "Existing Depot Updated",
    });
    let updatedRecord:
      | Parameters<ContextService<typeof SitesRepository>["update"]>[2]
      | undefined;
    const recordedEvents: RecordActivityEventInput[] = [];

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
        recordActivityEvent: (input) => {
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(result.site).toStrictEqual(updatedSite);
    expect(updatedRecord).toStrictEqual({
      accessNotes: "Use yard gate",
      name: "Existing Depot Updated",
    });
    expect(recordedEvents).toStrictEqual([
      expect.objectContaining({
        eventType: "site.updated",
        organizationId: actor.organizationId,
        sourceId: expect.stringMatching(`^site:${siteId}:updated:[0-9a-z]+$`),
        sourceType: "site",
        targetId: siteId,
        targetType: "site",
      }),
    ]);
    expect(recordedEvents[0]?.display).toStrictEqual({
      detail: "Existing Depot · Use yard gate",
      route: {
        href: `/sites?selectedSiteId=${siteId}`,
        label: "Existing Depot Updated",
      },
      summary: "Updated Existing Depot Updated",
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
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    let updatedRecord:
      | Parameters<ContextService<typeof SitesRepository>["update"]>[2]
      | undefined;
    const recordedEvents: RecordActivityEventInput[] = [];

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
        recordActivityEvent: (input) => {
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(result.site).toStrictEqual(existingSite);
    expect(updatedRecord).toStrictEqual({
      accessNotes: undefined,
      name: "Unchanged Depot",
    });
    expect(recordedEvents).toStrictEqual([]);
  });

  it("uses stable update activity source ids for equivalent retry attempts", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111119");
    const existingSite = decodeSiteOption({
      accessNotes: "Use side gate",
      displayLocation: "",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Retry Depot",
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    const updatedSite = decodeSiteOption({
      ...existingSite,
      accessNotes: "Use side gate after 5pm",
      updatedAt: "2026-05-20T09:35:00.000Z",
    });
    const recordedEvents: RecordActivityEventInput[] = [];

    await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        Effect.gen(function* () {
          yield* sites.update(siteId, {
            accessNotes: "Use side gate after 5pm",
            name: "Retry Depot",
          });
          yield* sites.update(siteId, {
            accessNotes: "Use side gate after 5pm",
            name: "Retry Depot",
          });
        })
      ),
      {
        getOptionById: () => Effect.succeed(Option.some(existingSite)),
        update: () => Effect.succeed(Option.some(updatedSite)),
        recordActivityEvent: (input) => {
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(recordedEvents.map((event) => event.sourceId)).toStrictEqual([
      expect.stringMatching(`^site:${siteId}:updated:[0-9a-z]+$`),
      recordedEvents[0]?.sourceId,
    ]);
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
      updatedAt: "2026-05-20T09:30:00.000Z",
    });
    const updatedSite = decodeSiteOption({
      displayLocation: "",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Existing Depot",
      updatedAt: "2026-05-20T09:35:00.000Z",
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

    expect(result.site).toStrictEqual(updatedSite);
    expect(updatedRecord).toStrictEqual({
      accessNotes: undefined,
      location: {
        displayLocation: "",
        locationStatus: "unverified",
      },
      name: "Existing Depot",
    });
  });

  it("assigns a label through the domain repository and returns mutation confirmation", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111117");
    const labelId = decodeLabelId("22222222-2222-4222-8222-222222222222");
    const label = {
      createdAt: "2026-05-20T09:00:00.000Z",
      id: labelId,
      name: "Fire safety",
      updatedAt: "2026-05-20T09:00:00.000Z",
    };
    const labeledSite = decodeSiteOption({
      displayLocation: "",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [label],
      locationStatus: "unverified",
      name: "Labelled depot",
      updatedAt: "2026-05-20T09:35:00.000Z",
    });
    let assigned:
      | Parameters<
          ContextService<typeof SiteLabelAssignmentsRepository>["assignToSite"]
        >[0]
      | undefined;
    const recordedEvents: RecordActivityEventInput[] = [];

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) => sites.assignLabel(siteId, { labelId })),
      {
        assignLabelToSite: (input) => {
          assigned = input;
          return Effect.succeed({
            changed: true,
            label,
          });
        },
        getOptionById: () => Effect.succeed(Option.some(labeledSite)),
        recordActivityEvent: (input) => {
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(result).toStrictEqual({
      mutation: { txid: 701 },
      site: labeledSite,
    });
    expect(assigned).toStrictEqual({
      labelId,
      organizationId: actor.organizationId,
      siteId,
    });
    expect(recordedEvents).toStrictEqual([
      expect.objectContaining({
        eventType: "site.label_added",
        organizationId: actor.organizationId,
        sourceId: expect.stringMatching(
          `^site:${siteId}:label_added:${labelId}:`
        ),
        sourceType: "site",
        targetId: siteId,
        targetType: "site",
      }),
    ]);
    expect(recordedEvents[0]?.display).toStrictEqual({
      detail: "Added label Fire safety",
      route: {
        href: `/sites?selectedSiteId=${siteId}`,
        label: "Labelled depot",
      },
      summary: "Added label to Labelled depot",
    });
  });

  it("removes a label through the domain repository and returns mutation confirmation", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111118");
    const labelId = decodeLabelId("33333333-3333-4333-8333-333333333333");
    const label = {
      createdAt: "2026-05-20T09:00:00.000Z",
      id: labelId,
      name: "Fire safety",
      updatedAt: "2026-05-20T09:00:00.000Z",
    };
    const unlabeledSite = decodeSiteOption({
      displayLocation: "",
      hasUsableCoordinates: false,
      id: siteId,
      labels: [],
      locationStatus: "unverified",
      name: "Unlabelled depot",
      updatedAt: "2026-05-20T09:40:00.000Z",
    });
    let removed:
      | Parameters<
          ContextService<
            typeof SiteLabelAssignmentsRepository
          >["removeFromSite"]
        >[0]
      | undefined;
    const recordedEvents: RecordActivityEventInput[] = [];

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) => sites.removeLabel(siteId, labelId)),
      {
        getOptionById: () => Effect.succeed(Option.some(unlabeledSite)),
        removeLabelFromSite: (input) => {
          removed = input;
          return Effect.succeed({
            changed: true,
            label,
          });
        },
        recordActivityEvent: (input) => {
          recordedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      }
    );

    expect(result).toStrictEqual({
      mutation: { txid: 701 },
      site: unlabeledSite,
    });
    expect(removed).toStrictEqual({
      labelId,
      organizationId: actor.organizationId,
      siteId,
    });
    expect(recordedEvents).toStrictEqual([
      expect.objectContaining({
        eventType: "site.label_removed",
        organizationId: actor.organizationId,
        sourceId: expect.stringMatching(
          `^site:${siteId}:label_removed:${labelId}:`
        ),
        sourceType: "site",
        targetId: siteId,
        targetType: "site",
      }),
    ]);
    expect(recordedEvents[0]?.display).toStrictEqual({
      detail: "Removed label Fire safety",
      route: {
        href: `/sites?selectedSiteId=${siteId}`,
        label: "Unlabelled depot",
      },
      summary: "Removed label from Unlabelled depot",
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

  it("ranks mapped sites by driving time with active job summaries", async () => {
    let capturedFilters: SiteProximityFilters | undefined;
    let capturedRankInput: RankRoutesInput | undefined;
    let previewCalls = 0;
    const closestSite = makeMappedSite(
      "11111111-1111-4111-8111-111111111301",
      "Canal Terrace",
      53.341,
      -6.261
    );
    const urgentSite = makeMappedSite(
      "11111111-1111-4111-8111-111111111302",
      "Harbour Row",
      53.347,
      -6.23
    );
    const noRouteSite = makeMappedSite(
      "11111111-1111-4111-8111-111111111303",
      "Private Avenue",
      53.361,
      -6.305
    );

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.rankNearbySites({
          filters: { query: "Dublin" },
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        })
      ),
      {
        listProximityCandidates: (_organizationId, filters) => {
          capturedFilters = filters;
          return Effect.succeed({
            candidateCount: 4,
            candidateLimitApplied: false,
            candidates: [
              {
                activeJobCount: 1,
                highestActiveJobPriority: "medium",
                site: closestSite,
              },
              {
                activeJobCount: 2,
                highestActiveJobPriority: "urgent",
                site: urgentSite,
              },
              {
                activeJobCount: 1,
                highestActiveJobPriority: "high",
                site: noRouteSite,
              },
            ],
            excluded: [{ count: 1, reason: "missing_coordinates" }],
          });
        },
        previewRoute: (_input) => {
          previewCalls += 1;
          return Effect.die("RouteProvider.previewRoute was not expected");
        },
        rankRoutes: (input) => {
          capturedRankInput = input;
          return Effect.succeed({
            rows: [
              {
                destinationId: urgentSite.id,
                routeSummary: makeRouteSummary(320, 1600),
              },
              {
                destinationId: closestSite.id,
                routeSummary: makeRouteSummary(360, 900),
              },
            ],
            unavailableDestinationIds: [noRouteSite.id],
          });
        },
      }
    );

    expect(capturedFilters).toStrictEqual({ query: "Dublin" });
    expect(capturedRankInput?.destinations).toStrictEqual([
      {
        coordinates: { latitude: 53.341, longitude: -6.261 },
        destinationId: closestSite.id,
      },
      {
        coordinates: { latitude: 53.347, longitude: -6.23 },
        destinationId: urgentSite.id,
      },
      {
        coordinates: { latitude: 53.361, longitude: -6.305 },
        destinationId: noRouteSite.id,
      },
    ]);
    expect(previewCalls).toBe(0);
    expect(result.rows.map((row) => row.site.id)).toStrictEqual([
      urgentSite.id,
      closestSite.id,
    ]);
    expect(result.rows[0]).toMatchObject({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
      site: urgentSite,
    });
    expect(result.meta).toMatchObject({
      candidateCount: 4,
      candidateLimitApplied: false,
      excluded: [
        { count: 1, reason: "missing_coordinates" },
        { count: 1, reason: "no_driving_route" },
      ],
      rankedCandidateLimit: 100,
    });
  });

  it("returns an inline route preview for a mapped site", async () => {
    let capturedPreviewInput: RoutePreviewInput | undefined;
    const site = makeMappedSite(
      "11111111-1111-4111-8111-111111111401",
      "Mill Lane",
      53.344,
      -6.248
    );

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.getSiteRoutePreview(site.id, {
          includeRouteLine: true,
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        })
      ),
      {
        getActiveJobSummary: () =>
          Effect.succeed({
            activeJobCount: 3,
            highestActiveJobPriority: "high",
          }),
        getOptionById: () => Effect.succeed(Option.some(site)),
        previewRoute: (input) => {
          capturedPreviewInput = input;
          return Effect.succeed({
            line: {
              encodedPolyline: "encoded-site-route",
              format: "encoded_polyline" as const,
            },
            routeSummary: {
              ...makeRouteSummary(510, 2300),
              providerRequestKind: "route_preview" as const,
            },
          });
        },
        rankRoutes: () =>
          Effect.die("RouteProvider.rankRoutes should not be called"),
      }
    );

    expect(capturedPreviewInput).toMatchObject({
      destination: {
        coordinates: { latitude: 53.344, longitude: -6.248 },
        destinationId: site.id,
      },
      includeLine: true,
      origin: { latitude: 53.34, longitude: -6.26 },
    });
    expect(result).toMatchObject({
      activeJobCount: 3,
      highestActiveJobPriority: "high",
      site,
    });
    expect(result.routeLine).toStrictEqual({
      encodedPolyline: "encoded-site-route",
      format: "encoded_polyline",
    });
    expect(result.routeSummary.providerRequestKind).toBe("route_preview");
  });

  it("rejects current-location site ranking when location preference is disabled", async () => {
    let candidateCalls = 0;
    let routeCalls = 0;

    const exit = await Effect.runPromiseExit(
      sitesServiceCall((sites) =>
        sites.rankNearbySites({
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        })
      ).pipe(
        Effect.provide(SitesService.DefaultWithoutDependencies),
        Effect.provide(
          makeSitesServiceTestLayer({
            listProximityCandidates: () => {
              candidateCalls += 1;
              return Effect.die(
                "SitesRepository.listProximityCandidates should not be called"
              );
            },
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute should not be called"),
            rankRoutes: () => {
              routeCalls += 1;
              return Effect.die(
                "RouteProvider.rankRoutes should not be called"
              );
            },
            routeProximityLocationEnabled: false,
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

      expect(failure).toBeInstanceOf(ProximityAccessDeniedError);
      expect(failure).toMatchObject({
        message: "Current location access is disabled for this user.",
      });
    }
    expect(candidateCalls).toBe(0);
    expect(routeCalls).toBe(0);
  });

  it("allows typed-origin site ranking when location preference is disabled", async () => {
    let candidateCalls = 0;
    const origin = await makeSignedTypedOrigin();

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.rankNearbySites({
          origin,
        })
      ),
      {
        listProximityCandidates: () => {
          candidateCalls += 1;
          return Effect.succeed({
            candidateCount: 0,
            candidateLimitApplied: false,
            candidates: [],
            excluded: [],
          });
        },
        previewRoute: () =>
          Effect.die("RouteProvider.previewRoute should not be called"),
        rankRoutes: (input) =>
          Effect.succeed({
            rows: input.destinations.map((destination) => ({
              destinationId: destination.destinationId,
              routeSummary: makeRouteSummary(120, 1000),
            })),
            unavailableDestinationIds: [],
          }),
        routeProximityLocationEnabled: false,
      },
      { withProximityOriginConfig: true }
    );

    expect(candidateCalls).toBe(1);
    expect(result.origin).toMatchObject({
      displayText: "Heuston Station",
      mode: "typed_origin",
    });
  });

  it("rejects tampered typed-origin site ranking before loading candidates", async () => {
    let candidateCalls = 0;
    const signedOrigin = await makeSignedTypedOrigin();

    const exit = await Effect.runPromiseExit(
      sitesServiceCall((sites) =>
        sites.rankNearbySites({
          origin: {
            ...signedOrigin,
            coordinates: { latitude: 53.35, longitude: -6.27 },
          },
        })
      ).pipe(
        Effect.provide(SitesService.DefaultWithoutDependencies),
        Effect.provide(
          makeSitesServiceTestLayer({
            listProximityCandidates: () => {
              candidateCalls += 1;
              return Effect.die(
                "SitesRepository.listProximityCandidates should not be called"
              );
            },
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute should not be called"),
            rankRoutes: () =>
              Effect.die("RouteProvider.rankRoutes should not be called"),
            routeProximityLocationEnabled: false,
          })
        ),
        withConfigProvider(proximityOriginConfigProvider)
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

      expect(failure).toBeInstanceOf(ProximityAccessDeniedError);
      expect(failure).toMatchObject({
        message: "Typed origin access could not be verified.",
      });
    }
    expect(candidateCalls).toBe(0);
  });

  it("rejects current-location site route previews before loading the site when location preference is unavailable", async () => {
    let getOptionCalls = 0;
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111402");

    const exit = await Effect.runPromiseExit(
      sitesServiceCall((sites) =>
        sites.getSiteRoutePreview(siteId, {
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        })
      ).pipe(
        Effect.provide(SitesService.DefaultWithoutDependencies),
        Effect.provide(
          makeSitesServiceTestLayer({
            getOptionById: () => {
              getOptionCalls += 1;
              return Effect.die(
                "SitesRepository.getOptionById should not be called"
              );
            },
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute should not be called"),
            rankRoutes: () =>
              Effect.die("RouteProvider.rankRoutes should not be called"),
            userPreferencesGet: () =>
              Effect.fail(
                new UserPreferencesStorageError({
                  message: "User preferences storage operation failed",
                })
              ),
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

      expect(failure).toBeInstanceOf(ProximityAccessDeniedError);
      expect(failure).toMatchObject({
        message: "Current location access could not be verified.",
      });
    }
    expect(getOptionCalls).toBe(0);
  });

  it("reports how many routeable sites were omitted by the 100-candidate cap", async () => {
    const mappedSites = Array.from({ length: 100 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");

      return {
        activeJobCount: index % 3,
        highestActiveJobPriority: "medium" as const,
        site: makeMappedSite(
          `11111111-1111-4111-8111-${suffix}`,
          `Site ${index + 1}`,
          53.3 + index / 10_000,
          -6.2 - index / 10_000
        ),
      };
    });

    const result = await runSitesServiceEffect(
      sitesServiceCall((sites) =>
        sites.rankNearbySites({
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        })
      ),
      {
        listProximityCandidates: () =>
          Effect.succeed({
            candidateCount: 126,
            candidateLimitApplied: true,
            candidates: mappedSites,
            excluded: [],
          }),
        previewRoute: () =>
          Effect.die("RouteProvider.previewRoute was not expected"),
        rankRoutes: (input) =>
          Effect.succeed({
            rows: input.destinations.slice(0, 10).map((destination, index) => ({
              destinationId: destination.destinationId,
              routeSummary: makeRouteSummary(180 + index, 1500 + index),
            })),
            unavailableDestinationIds: [],
          }),
      }
    );

    expect(result.rows).toHaveLength(10);
    expect(result.meta.excluded).toContainEqual({
      count: 26,
      reason: "candidate_cap",
    });
  });
});

type TestSitesServiceRequirements =
  | ActivityEventsRepository
  | CommentsRepository
  | CurrentOrganizationActor
  | DomainDrizzleService
  | HttpServerRequest.HttpServerRequest
  | OrganizationAuthorization
  | ProductActivityActorsRepository
  | RouteProximityService
  | SiteLabelAssignmentsRepository
  | SiteLocationProvider
  | SqlClient.SqlClient
  | SitesRepository
  | UserPreferencesRepository;

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
  options: Partial<TestSitesDependencies> = {},
  testOptions: { readonly withProximityOriginConfig?: boolean } = {}
) {
  const provided = effect.pipe(
    Effect.provide(SitesService.DefaultWithoutDependencies),
    Effect.provide(makeSitesServiceTestLayer(options))
  );

  return Effect.runPromise(
    testOptions.withProximityOriginConfig === true
      ? provided.pipe(withConfigProvider(proximityOriginConfigProvider))
      : provided
  );
}

interface TestSitesDependencies {
  readonly addCommentForSite: ContextService<
    typeof CommentsRepository
  >["addForSite"];
  readonly autocomplete: ContextService<
    typeof SiteLocationProvider
  >["autocomplete"];
  readonly assignLabelToSite: ContextService<
    typeof SiteLabelAssignmentsRepository
  >["assignToSite"];
  readonly create: ContextService<typeof SitesRepository>["create"];
  readonly getOptionById: ContextService<
    typeof SitesRepository
  >["getOptionById"];
  readonly getActiveJobSummary: ContextService<
    typeof SitesRepository
  >["getActiveJobSummary"];
  readonly ensureCanCreateSite: ContextService<
    typeof OrganizationAuthorization
  >["ensureCanCreateSite"];
  readonly ensureCanManageLabels: ContextService<
    typeof OrganizationAuthorization
  >["ensureCanManageLabels"];
  readonly ensureCanViewOrganizationData: ContextService<
    typeof OrganizationAuthorization
  >["ensureCanViewOrganizationData"];
  readonly listProximityCandidates: ContextService<
    typeof SitesRepository
  >["listProximityCandidates"];
  readonly previewRoute: (
    input: RoutePreviewInput
  ) => ReturnType<ContextService<typeof RouteProvider>["previewRoute"]>;
  readonly rankRoutes: ContextService<typeof RouteProvider>["rankRoutes"];
  readonly recordActivityEvent: ContextService<
    typeof ActivityEventsRepository
  >["recordEvent"];
  readonly routeProximityLocationEnabled: boolean;
  readonly resolvePlace: ContextService<
    typeof SiteLocationProvider
  >["resolvePlace"];
  readonly removeLabelFromSite: ContextService<
    typeof SiteLabelAssignmentsRepository
  >["removeFromSite"];
  readonly update: ContextService<typeof SitesRepository>["update"];
  readonly userPreferencesGet: ContextService<
    typeof UserPreferencesRepository
  >["get"];
}

function makeSitesServiceTestLayer(options: Partial<TestSitesDependencies>) {
  let nextTxid = 700;

  return Layer.mergeAll(
    Layer.succeed(
      ActivityEventsRepository,
      ActivityEventsRepository.of({
        applyRetention: () => Effect.void,
        listRecent: () => Effect.succeed([]),
        recordEvent:
          options.recordActivityEvent ??
          (() => Effect.succeed({} as ProductActivityEvent)),
      } as unknown as ContextService<typeof ActivityEventsRepository>)
    ),
    Layer.succeed(
      CommentsRepository,
      CommentsRepository.of({
        addForSite:
          options.addCommentForSite ??
          (() => Effect.die("CommentsRepository.addForSite not stubbed")),
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => effect,
      } as unknown as ContextService<typeof CommentsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(actor),
      })
    ),
    makeUnusedDomainDrizzleLayer(),
    Layer.succeed(
      SqlClient.SqlClient,
      makeFakeSqlClient(() => {
        nextTxid += 1;
        return nextTxid;
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      OrganizationAuthorization,
      OrganizationAuthorization.of({
        ensureCanCreateSite: options.ensureCanCreateSite ?? (() => Effect.void),
        ensureCanManageLabels:
          options.ensureCanManageLabels ?? (() => Effect.void),
        ensureCanViewOrganizationData:
          options.ensureCanViewOrganizationData ?? (() => Effect.void),
      } as unknown as ContextService<typeof OrganizationAuthorization>)
    ),
    Layer.succeed(
      ProductActivityActorsRepository,
      ProductActivityActorsRepository.of({
        ensureMemberActor: () =>
          Effect.succeed({
            actor: {
              displayDetail: "Team member",
              displayName: "Taylor Member",
              id: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
              kind: "member",
            },
            sourceUserId: actor.userId,
          }),
      } as unknown as ContextService<typeof ProductActivityActorsRepository>)
    ),
    makeUserPreferencesRepositoryLayer({
      get: options.userPreferencesGet,
      routeProximityLocationEnabled: options.routeProximityLocationEnabled,
    }),
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
    options.rankRoutes === undefined
      ? Layer.succeed(
          RouteProximityService,
          RouteProximityService.of(
            {} as ContextService<typeof RouteProximityService>
          )
        )
      : RouteProximityService.DefaultWithoutDependencies.pipe(
          Layer.provide(
            Layer.succeed(
              RouteProvider,
              RouteProvider.of({
                previewRoute:
                  options.previewRoute ??
                  (() => Effect.die("RouteProvider.previewRoute not stubbed")),
                rankRoutes: options.rankRoutes,
              })
            )
          )
        ),
    Layer.succeed(
      SiteLabelAssignmentsRepository,
      SiteLabelAssignmentsRepository.of({
        assignToSite:
          options.assignLabelToSite ??
          (() =>
            Effect.die(
              "SiteLabelAssignmentsRepository.assignToSite not stubbed"
            )),
        removeFromSite:
          options.removeLabelFromSite ??
          (() =>
            Effect.die(
              "SiteLabelAssignmentsRepository.removeFromSite not stubbed"
            )),
      } as unknown as ContextService<typeof SiteLabelAssignmentsRepository>)
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
        getActiveJobSummary:
          options.getActiveJobSummary ??
          (() => Effect.die("SitesRepository.getActiveJobSummary not stubbed")),
        listProximityCandidates:
          options.listProximityCandidates ??
          (() =>
            Effect.die("SitesRepository.listProximityCandidates not stubbed")),
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

function makeFakeSqlClient(nextTxid: () => number): SqlClient.SqlClient {
  const sql = Object.assign(
    <Row>() =>
      Effect.succeed([
        {
          txid: String(nextTxid()),
        },
      ] as Row[]),
    {
      withTransaction: <Value, Error, Requirements>(
        effect: Effect.Effect<Value, Error, Requirements>
      ) => effect,
    }
  );

  return sql as unknown as SqlClient.SqlClient;
}

function makeUnusedDomainDrizzleLayer() {
  return Layer.succeed(
    DomainDrizzle,
    DomainDrizzle.of({
      db: new Proxy(
        {},
        {
          get: (_target, property) => {
            throw new Error(
              `DomainDrizzle.${String(property)} should not be called in SitesService unit tests`
            );
          },
        }
      ) as never,
    })
  );
}

function makeUserPreferencesRepositoryLayer(
  options: {
    readonly get?:
      | ContextService<typeof UserPreferencesRepository>["get"]
      | undefined;
    readonly routeProximityLocationEnabled?: boolean | undefined;
  } = {}
) {
  return Layer.succeed(
    UserPreferencesRepository,
    UserPreferencesRepository.of({
      get:
        options.get ??
        (() =>
          Effect.succeed(
            decodeUserPreferences({
              routeProximityLocationEnabled:
                options.routeProximityLocationEnabled ?? true,
              updatedAt: "2026-05-20T09:00:00.000Z",
            })
          )),
      update: () => Effect.die("UserPreferencesRepository.update not stubbed"),
    })
  );
}

function makeMappedSite(
  id: string,
  name: string,
  latitude: number,
  longitude: number
) {
  return decodeSiteOption({
    displayLocation: `${name}, Dublin`,
    formattedAddress: `${name}, Dublin, Ireland`,
    googlePlaceId: `place-${id}`,
    hasUsableCoordinates: true,
    id,
    labels: [],
    latitude,
    locationProvider: "google_places",
    locationResolvedAt: "2026-05-20T09:00:00.000Z",
    locationStatus: "google_resolved",
    longitude,
    name,
    rawLocationInput: name,
    updatedAt: "2026-05-20T09:30:00.000Z",
  });
}

function makeRouteSummary(durationSeconds: number, distanceMeters: number) {
  return {
    computedAt: "2026-05-20T10:15:00.000Z",
    distanceMeters,
    durationSeconds,
    provider: "google_routes" as const,
    providerRequestKind: "matrix" as const,
    routeStatus: "ok" as const,
    trafficAware: true,
  };
}
