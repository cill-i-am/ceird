import { OrganizationId, UserId } from "@ceird/identity-core";
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
import { SiteGeocoder } from "./geocoder.js";
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
  it("keeps site creation focused on location and access details", () => {
    expect(
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        addressLine1: "  1 Custom House Quay  ",
        country: "IE",
        county: "  Dublin  ",
        eircode: "  D01 X2X2  ",
        name: "  Docklands Campus  ",
      })
    ).toStrictEqual({
      addressLine1: "1 Custom House Quay",
      country: "IE",
      county: "Dublin",
      eircode: "D01 X2X2",
      name: "Docklands Campus",
    });

    expect(() =>
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        addressLine1: "1 Custom House Quay",
        country: "IE",
        county: "Dublin",
        eircode: "D01 X2X2",
        name: "Docklands Campus",
        removedField: "33333333-3333-4333-8333-333333333333",
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("accepts an empty site options response", () => {
    expect(
      Schema.decodeUnknownSync(SitesOptionsResponseSchema)({ sites: [] })
    ).toStrictEqual({ sites: [] });
  });

  it("reuses existing geocode metadata when an update keeps the location unchanged", async () => {
    const siteId = decodeSiteId("11111111-1111-4111-8111-111111111111");
    const existingSite = decodeSiteOption({
      accessNotes: "Use north gate.",
      addressLine1: "1 Custom House Quay",
      country: "IE",
      county: "Dublin",
      eircode: "D01 X2X2",
      geocodedAt: "2026-05-20T09:00:00.000Z",
      geocodingProvider: "google",
      id: siteId,
      labels: [],
      latitude: 53.348,
      longitude: -6.246,
      name: "Docklands Campus",
    });
    const updatedSite = {
      ...existingSite,
      accessNotes: "Use north gate. Reception has keys.",
      name: "Docklands Campus North",
    };
    let geocodeCallCount = 0;
    let updatedRecord:
      | Parameters<ContextService<typeof SitesRepository>["update"]>[2]
      | undefined;

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sites = yield* SitesService;

        return yield* sites.update(siteId, {
          accessNotes: updatedSite.accessNotes,
          addressLine1: existingSite.addressLine1,
          country: existingSite.country,
          county: existingSite.county,
          eircode: existingSite.eircode,
          name: updatedSite.name,
        });
      }).pipe(
        Effect.provide(SitesService.DefaultWithoutDependencies),
        Effect.provide(
          makeSitesServiceTestLayer({
            geocode: () => {
              geocodeCallCount += 1;
              return Effect.die("SiteGeocoder.geocode should not be called");
            },
            getOptionById: () => Effect.succeed(Option.some(existingSite)),
            update: (_organizationId, _siteId, input) => {
              updatedRecord = input;
              return Effect.succeed(Option.some(updatedSite));
            },
          })
        )
      )
    );

    expect(result).toStrictEqual(updatedSite);
    expect(geocodeCallCount).toBe(0);
    expect(updatedRecord).toMatchObject({
      geocodedAt: existingSite.geocodedAt,
      geocodingProvider: existingSite.geocodingProvider,
      latitude: existingSite.latitude,
      longitude: existingSite.longitude,
    });
  });
});

function makeSitesServiceTestLayer(options: {
  readonly geocode: ContextService<typeof SiteGeocoder>["geocode"];
  readonly getOptionById: ContextService<
    typeof SitesRepository
  >["getOptionById"];
  readonly update: ContextService<typeof SitesRepository>["update"];
}) {
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
      } as unknown as ContextService<typeof OrganizationAuthorization>)
    ),
    Layer.succeed(
      SiteGeocoder,
      SiteGeocoder.of({
        geocode: options.geocode,
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
        getOptionById: options.getOptionById,
        update: options.update,
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => effect,
      } as unknown as ContextService<typeof SitesRepository>)
    )
  );
}
