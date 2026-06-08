import type { LabelIdType as LabelId } from "@ceird/labels-core";
import { ProximityRouteUnavailableError } from "@ceird/proximity-core";
import type {
  AddSiteCommentInput,
  AssignSiteLabelInput,
  CreateSiteInput,
  SiteIdType as SiteId,
  SiteOption,
  SiteListQuery,
  SiteLocationInput,
  SiteLocationAutocompleteInput,
  SiteLocationPlaceDetailsInput,
  SiteProximityInput,
  SiteProximityResponse,
  SiteRoutePreviewInput,
  SiteRoutePreviewResponse,
  UpdateSiteInput,
} from "@ceird/sites-core";
import {
  SiteAccessDeniedError,
  SiteNotFoundError,
  SiteStorageError,
} from "@ceird/sites-core";
import { Layer, Context, Effect, Option } from "effect";

import { CommentsRepository } from "../comments/repository.js";
import { UserPreferencesRepository } from "../identity/preferences/repository.js";
import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import {
  isExternalOrganizationActor,
  OrganizationAuthorization,
} from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import {
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
} from "../organizations/errors.js";
import { ensureCurrentLocationOriginAllowed } from "../proximity/current-location-access.js";
import {
  makeCurrentRouteCostContext,
  RouteProximityService,
} from "../proximity/service.js";
import { SiteLocationProvider } from "./location-provider.js";
import {
  resolveCreateSiteLocation,
  resolveUpdateSiteLocation,
} from "./location-resolution.js";
import type { ResolveCreateSiteLocationOptions } from "./location-resolution.js";
import {
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "./repositories.js";

type OrganizationAuthorizationService = Context.Service.Shape<
  typeof OrganizationAuthorization
>;
type SitesRepositoryService = Context.Service.Shape<typeof SitesRepository>;

export class SitesService extends Context.Service<SitesService>()(
  "@ceird/domains/sites/SitesService",
  {
    make: Effect.gen(function* SitesServiceLive() {
      const authorization = yield* OrganizationAuthorization;
      const commentsRepository = yield* CommentsRepository;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const siteLabelAssignmentsRepository =
        yield* SiteLabelAssignmentsRepository;
      const siteLocationProvider = yield* SiteLocationProvider;
      const routeProximityService = yield* RouteProximityService;
      const sitesRepository = yield* SitesRepository;
      const userPreferencesRepository = yield* UserPreferencesRepository;

      const loadActor = Effect.fn("SitesService.loadActor")(function* () {
        return yield* currentOrganizationActor
          .get()
          .pipe(
            mapSitesActorErrors,
            Effect.catchTag(
              ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
              failSitesStorageError
            )
          );
      });

      const create = Effect.fn("SitesService.create")(function* (
        input: CreateSiteInput,
        options: ResolveCreateSiteLocationOptions = {}
      ) {
        const actor = yield* loadActor();
        yield* authorization
          .ensureCanCreateSite(actor)
          .pipe(
            Effect.catchTag(
              ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
              failSiteAccessDenied
            )
          );
        yield* Effect.annotateCurrentSpan("action", "create");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const location = yield* resolveCreateSiteLocation(
          input.location,
          siteLocationProvider,
          options
        );

        return yield* sitesRepository
          .withTransaction(
            Effect.gen(function* () {
              const siteId = yield* sitesRepository.create({
                ...location,
                accessNotes: input.accessNotes,
                name: input.name,
                organizationId: actor.organizationId,
              });
              yield* Effect.annotateCurrentSpan("siteId", siteId);

              const site = yield* sitesRepository
                .getOptionById(actor.organizationId, siteId)
                .pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () =>
                        Effect.die(
                          new Error(
                            `Created site could not be loaded: organizationId=${actor.organizationId} siteId=${siteId}`
                          )
                        ),
                      onSome: Effect.succeed,
                    })
                  )
                );

              return site;
            })
          )
          .pipe(Effect.catchTag("SqlError", failSitesStorageError));
      });

      const update = Effect.fn("SitesService.update")(function* (
        siteId: SiteId,
        input: UpdateSiteInput
      ) {
        const actor = yield* loadActor();
        yield* authorization
          .ensureCanCreateSite(actor)
          .pipe(
            Effect.catchTag(
              ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
              failSiteAccessDenied
            )
          );
        yield* Effect.annotateCurrentSpan("action", "update");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", siteId);
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const existingSite = yield* sitesRepository
          .getOptionById(actor.organizationId, siteId)
          .pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => failSiteNotFound(siteId),
                onSome: Effect.succeed,
              })
            ),
            Effect.catchTag("SqlError", failSitesStorageError)
          );

        const location =
          input.location === undefined ||
          (input.location !== null &&
            siteLocationInputMatchesExistingSite(input.location, existingSite))
            ? undefined
            : yield* resolveUpdateSiteLocation(
                input.location,
                siteLocationProvider
              );

        const site = yield* sitesRepository
          .withTransaction(
            sitesRepository
              .update(actor.organizationId, siteId, {
                accessNotes: input.accessNotes,
                ...(location === undefined ? {} : { location }),
                name: input.name,
              })
              .pipe(Effect.map(Option.getOrUndefined))
          )
          .pipe(Effect.catchTag("SqlError", failSitesStorageError));

        if (site !== undefined) {
          return site;
        }

        return yield* Effect.fail(
          new SiteNotFoundError({
            message: "Site does not exist",
            siteId,
          })
        );
      });

      const list = Effect.fn("SitesService.list")(function* (
        query: SiteListQuery
      ) {
        const actor = yield* loadActor();
        yield* ensureCanViewOrganizationSiteOptions(actor, authorization);
        yield* Effect.annotateCurrentSpan("action", "list");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);
        yield* Effect.annotateCurrentSpan("limit", query.limit ?? 50);
        yield* Effect.annotateCurrentSpan(
          "hasCursor",
          query.cursor !== undefined
        );

        const result = yield* sitesRepository
          .list(actor.organizationId, query)
          .pipe(Effect.catchTag("SqlError", failSitesStorageError));

        yield* Effect.annotateCurrentSpan("resultCount", result.items.length);
        yield* Effect.annotateCurrentSpan(
          "hasNextCursor",
          result.nextCursor !== undefined
        );

        return result;
      });

      const getOptions = Effect.fn("SitesService.getOptions")(function* () {
        const actor = yield* loadActor();
        yield* ensureCanViewOrganizationSiteOptions(actor, authorization);
        yield* Effect.annotateCurrentSpan("action", "getOptions");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const sites = yield* sitesRepository
          .listOptions(actor.organizationId)
          .pipe(Effect.catchTag("SqlError", failSitesStorageError));

        return {
          sites,
        } as const;
      });

      const rankNearbySites = Effect.fn("SitesService.rankNearbySites")(
        function* (input: SiteProximityInput) {
          const actor = yield* loadActor();
          yield* ensureCanViewOrganizationSiteOptions(actor, authorization);
          yield* Effect.annotateCurrentSpan("action", "rankNearbySites");
          yield* Effect.annotateCurrentSpan(
            "organizationId",
            actor.organizationId
          );
          yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
          yield* Effect.annotateCurrentSpan("actorRole", actor.role);
          yield* Effect.annotateCurrentSpan("limit", input.limit ?? 10);
          yield* Effect.annotateCurrentSpan(
            "includeRouteLines",
            input.includeRouteLines === true
          );
          yield* ensureCurrentLocationOriginAllowed({
            origin: input.origin,
            userId: actor.userId,
            userPreferencesRepository,
          });

          const candidateSet = yield* sitesRepository
            .listProximityCandidates(actor.organizationId, input.filters ?? {})
            .pipe(Effect.catchTag("SqlError", failSitesStorageError));
          const routeCostContext = yield* makeCurrentRouteCostContext({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
          });
          const ranked = yield* routeProximityService.rank({
            candidateCount: candidateSet.candidateCount,
            candidateLimitApplied: candidateSet.candidateLimitApplied,
            candidates: candidateSet.candidates.flatMap((candidate) =>
              candidate.site.latitude === undefined ||
              candidate.site.longitude === undefined
                ? []
                : [
                    {
                      coordinates: {
                        latitude: candidate.site.latitude,
                        longitude: candidate.site.longitude,
                      },
                      destinationId: candidate.site.id,
                      row: candidate,
                    },
                  ]
            ),
            context: routeCostContext,
            excluded: candidateSet.excluded,
            includeRouteLines: input.includeRouteLines,
            limit: input.limit,
            origin: input.origin,
          });

          return {
            meta: ranked.meta,
            origin: ranked.origin,
            rows: ranked.rows.map((row) => ({
              activeJobCount: row.row.activeJobCount,
              highestActiveJobPriority: row.row.highestActiveJobPriority,
              routeLine: row.routeLine,
              routeSummary: row.routeSummary,
              site: row.row.site,
            })),
          } satisfies SiteProximityResponse;
        }
      );

      const getSiteRoutePreview = Effect.fn("SitesService.getSiteRoutePreview")(
        function* (siteId: SiteId, input: SiteRoutePreviewInput) {
          const actor = yield* loadActor();
          yield* ensureCanViewOrganizationSiteOptions(actor, authorization);
          yield* ensureCurrentLocationOriginAllowed({
            origin: input.origin,
            userId: actor.userId,
            userPreferencesRepository,
          });
          const site = yield* loadSiteDetailOrFail(
            actor.organizationId,
            siteId,
            sitesRepository
          );
          yield* Effect.annotateCurrentSpan("action", "getSiteRoutePreview");
          yield* Effect.annotateCurrentSpan(
            "organizationId",
            actor.organizationId
          );
          yield* Effect.annotateCurrentSpan("siteId", siteId);
          yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
          yield* Effect.annotateCurrentSpan("actorRole", actor.role);
          yield* Effect.annotateCurrentSpan(
            "includeRouteLine",
            input.includeRouteLine === true
          );

          if (site.latitude === undefined || site.longitude === undefined) {
            return yield* failDestinationUnmapped(
              "Site does not have usable coordinates."
            );
          }

          const summary = yield* sitesRepository
            .getActiveJobSummary(actor.organizationId, siteId)
            .pipe(Effect.catchTag("SqlError", failSitesStorageError));
          const routeCostContext = yield* makeCurrentRouteCostContext({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
          });
          const preview = yield* routeProximityService.preview({
            context: routeCostContext,
            destination: {
              coordinates: {
                latitude: site.latitude,
                longitude: site.longitude,
              },
              destinationId: siteId,
            },
            includeRouteLine: input.includeRouteLine,
            origin: input.origin,
          });

          return {
            activeJobCount: summary.activeJobCount,
            highestActiveJobPriority: summary.highestActiveJobPriority,
            origin: preview.origin,
            routeLine: preview.routeLine,
            routeSummary: preview.routeSummary,
            site,
          } satisfies SiteRoutePreviewResponse;
        }
      );

      const autocompleteLocation = Effect.fn(
        "SitesService.autocompleteLocation"
      )(function* (input: SiteLocationAutocompleteInput) {
        const actor = yield* loadActor();
        yield* ensureCanUseSiteLocationProvider(actor, authorization);
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("action", "autocompleteLocation");
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        return yield* siteLocationProvider.autocomplete(input);
      });

      const getLocationPlaceDetails = Effect.fn(
        "SitesService.getLocationPlaceDetails"
      )(function* (input: SiteLocationPlaceDetailsInput) {
        const actor = yield* loadActor();
        yield* ensureCanUseSiteLocationProvider(actor, authorization);
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("action", "getLocationPlaceDetails");
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const location = yield* siteLocationProvider.resolvePlace(input);

        return {
          addressComponents: [...location.addressComponents],
          displayLocation: location.displayLocation,
          formattedAddress: location.formattedAddress,
          googlePlaceId: location.googlePlaceId,
          latitude: location.latitude,
          longitude: location.longitude,
        };
      });

      const listComments = Effect.fn("SitesService.listComments")(function* (
        siteId: SiteId
      ) {
        const actor = yield* loadActor();
        yield* ensureCanUseSiteComments(actor, authorization, siteId);
        yield* Effect.annotateCurrentSpan("action", "listComments");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", siteId);
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const comments = yield* commentsRepository
          .listForExistingSite(actor.organizationId, siteId)
          .pipe(
            Effect.catchTag("SqlError", (error) =>
              failSitesStorageError(error, { siteId })
            )
          );

        return yield* Option.match(comments, {
          onNone: () => failSiteNotFound(siteId),
          onSome: (siteComments) => Effect.succeed({ comments: siteComments }),
        });
      });

      const addComment = Effect.fn("SitesService.addComment")(function* (
        siteId: SiteId,
        input: AddSiteCommentInput
      ) {
        const actor = yield* loadActor();
        yield* ensureCanUseSiteComments(actor, authorization, siteId);
        yield* Effect.annotateCurrentSpan("action", "addComment");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", siteId);
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const comment = yield* commentsRepository
          .addForSite({
            authorUserId: actor.userId,
            body: input.body,
            organizationId: actor.organizationId,
            siteId,
          })
          .pipe(
            Effect.catchTag("SqlError", (error) =>
              failSitesStorageError(error, { siteId })
            )
          );

        return yield* Option.match(comment, {
          onNone: () => failSiteNotFound(siteId),
          onSome: Effect.succeed,
        });
      });

      const assignLabel = Effect.fn("SitesService.assignLabel")(function* (
        siteId: SiteId,
        input: AssignSiteLabelInput
      ) {
        const actor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(actor)
          .pipe(
            Effect.catchTag(
              ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
              failSiteAccessDenied
            )
          );
        yield* Effect.annotateCurrentSpan("action", "assignLabel");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", siteId);
        yield* Effect.annotateCurrentSpan("labelId", input.labelId);
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        yield* sitesRepository
          .withTransaction(
            siteLabelAssignmentsRepository.assignToSite({
              labelId: input.labelId,
              organizationId: actor.organizationId,
              siteId,
            })
          )
          .pipe(
            Effect.catchTag("SqlError", (error) =>
              failSitesStorageError(error, { siteId })
            )
          );

        return yield* loadSiteDetailOrFail(
          actor.organizationId,
          siteId,
          sitesRepository
        );
      });

      const removeLabel = Effect.fn("SitesService.removeLabel")(function* (
        siteId: SiteId,
        labelId: LabelId
      ) {
        const actor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(actor)
          .pipe(
            Effect.catchTag(
              ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
              failSiteAccessDenied
            )
          );
        yield* Effect.annotateCurrentSpan("action", "removeLabel");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", siteId);
        yield* Effect.annotateCurrentSpan("labelId", labelId);
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        yield* sitesRepository
          .withTransaction(
            siteLabelAssignmentsRepository.removeFromSite({
              labelId,
              organizationId: actor.organizationId,
              siteId,
            })
          )
          .pipe(
            Effect.catchTag("SqlError", (error) =>
              failSitesStorageError(error, { siteId })
            )
          );

        return yield* loadSiteDetailOrFail(
          actor.organizationId,
          siteId,
          sitesRepository
        );
      });

      return {
        addComment,
        assignLabel,
        autocompleteLocation,
        create,
        getLocationPlaceDetails,
        getOptions,
        getSiteRoutePreview,
        list,
        listComments,
        rankNearbySites,
        removeLabel,
        update,
      };
    }),
  }
) {
  static readonly getOptions = (
    ...args: Parameters<
      Context.Service.Shape<typeof SitesService>["getOptions"]
    >
  ) => SitesService.use((service) => service.getOptions(...args));
  static readonly rankNearbySites = (
    ...args: Parameters<
      Context.Service.Shape<typeof SitesService>["rankNearbySites"]
    >
  ) => SitesService.use((service) => service.rankNearbySites(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    SitesService,
    SitesService.make
  );
  static readonly Default = SitesService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        CommentsRepository.Default,
        CurrentOrganizationActor.Default,
        OrganizationAuthorization.Default,
        RouteProximityService.Default,
        SiteLabelAssignmentsRepository.Default,
        SitesRepository.Default,
        UserPreferencesRepository.Default
      )
    )
  );
}

function failDestinationUnmapped(
  message: string
): Effect.Effect<never, ProximityRouteUnavailableError> {
  return Effect.fail(
    new ProximityRouteUnavailableError({
      message,
      reason: "destination_unmapped",
    })
  );
}

const loadSiteDetailOrFail = Effect.fn("SitesService.loadSiteDetailOrFail")(
  function* (
    organizationId: OrganizationActor["organizationId"],
    siteId: SiteId,
    sitesRepository: SitesRepositoryService
  ) {
    yield* Effect.annotateCurrentSpan("organizationId", organizationId);
    yield* Effect.annotateCurrentSpan("siteId", siteId);

    const site = yield* sitesRepository
      .getOptionById(organizationId, siteId)
      .pipe(
        Effect.catchTag("SqlError", (error) =>
          failSitesStorageError(error, { siteId })
        ),
        Effect.map(Option.getOrUndefined)
      );

    if (site !== undefined) {
      return site;
    }

    return yield* Effect.fail(
      new SiteNotFoundError({
        message: "Site does not exist",
        siteId,
      })
    );
  }
);

function siteLocationInputMatchesExistingSite(
  input: SiteLocationInput,
  site: SiteOption
) {
  if (input.kind === "manual") {
    return (
      site.locationStatus === "unverified" &&
      site.rawLocationInput === input.rawInput &&
      site.country === input.country &&
      site.googlePlaceId === undefined
    );
  }

  return (
    site.googlePlaceId === input.placeId &&
    site.displayLocation === input.displayText &&
    site.rawLocationInput === input.rawInput
  );
}

function failSitesStorageError(
  error: unknown,
  context: { readonly siteId?: SiteId } = {}
): Effect.Effect<never, SiteStorageError> {
  const siteContext =
    context.siteId === undefined ? {} : { siteId: context.siteId };

  return Effect.fail(
    new SiteStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Sites storage operation failed",
      ...siteContext,
    })
  );
}

function ensureCanViewOrganizationSiteOptions(
  actor: OrganizationActor,
  authorization: OrganizationAuthorizationService
) {
  return Effect.gen(function* () {
    if (isExternalOrganizationActor(actor)) {
      return yield* Effect.fail(
        new SiteAccessDeniedError({
          message:
            "External collaborators cannot view organization-wide site options",
        })
      );
    }

    yield* authorization
      .ensureCanViewOrganizationData(actor)
      .pipe(
        Effect.catchTag(
          ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
          failSiteAccessDenied
        )
      );
  });
}

function ensureCanUseSiteComments(
  actor: OrganizationActor,
  authorization: OrganizationAuthorizationService,
  siteId: SiteId
) {
  return authorization
    .ensureCanViewOrganizationData(actor)
    .pipe(
      Effect.catchTag(ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG, (error) =>
        failSiteAccessDenied(error, { siteId })
      )
    );
}

function ensureCanUseSiteLocationProvider(
  actor: OrganizationActor,
  authorization: OrganizationAuthorizationService
) {
  return authorization
    .ensureCanCreateSite(actor)
    .pipe(
      Effect.catchTag(
        ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
        failSiteAccessDenied
      )
    );
}

const mapSitesActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new SiteAccessDeniedError({ message })
);

function failSiteAccessDenied(
  error: { readonly message: string },
  context: { readonly siteId?: SiteId } = {}
) {
  const siteContext =
    context.siteId === undefined ? {} : { siteId: context.siteId };

  return Effect.fail(
    new SiteAccessDeniedError({
      message: error.message,
      ...siteContext,
    })
  );
}

function failSiteNotFound(siteId: SiteId) {
  return Effect.fail(
    new SiteNotFoundError({
      message: "Site does not exist",
      siteId,
    })
  );
}
