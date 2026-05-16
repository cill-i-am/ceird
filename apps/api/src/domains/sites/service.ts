import type {
  AddSiteCommentInput,
  CreateSiteInput,
  ServiceAreaOption,
  SiteIdType as SiteId,
  UpdateSiteInput,
} from "@ceird/sites-core";
import {
  SiteAccessDeniedError,
  SiteNotFoundError,
  SiteStorageError,
} from "@ceird/sites-core";
import { Array as EffectArray, Effect, HashMap, Option } from "effect";

import { CommentsRepository } from "../comments/repository.js";
import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import {
  hasElevatedOrganizationAccess,
  isExternalOrganizationActor,
  OrganizationAuthorization,
} from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import {
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
} from "../organizations/errors.js";
import { SiteGeocoder } from "./geocoder.js";
import { ServiceAreasRepository, SitesRepository } from "./repositories.js";

export class SitesService extends Effect.Service<SitesService>()(
  "@ceird/domains/sites/SitesService",
  {
    accessors: true,
    dependencies: [
      CommentsRepository.Default,
      CurrentOrganizationActor.Default,
      OrganizationAuthorization.Default,
      ServiceAreasRepository.Default,
      SitesRepository.Default,
    ],
    effect: Effect.gen(function* SitesServiceLive() {
      const authorization = yield* OrganizationAuthorization;
      const commentsRepository = yield* CommentsRepository;
      const serviceAreasRepository = yield* ServiceAreasRepository;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const siteGeocoder = yield* SiteGeocoder;
      const sitesRepository = yield* SitesRepository;

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
        input: CreateSiteInput
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

        if (input.serviceAreaId !== undefined) {
          yield* Effect.annotateCurrentSpan(
            "serviceAreaId",
            input.serviceAreaId
          );
        }

        const geocodedLocation = yield* siteGeocoder.geocode(input);

        return yield* sitesRepository
          .withTransaction(
            Effect.gen(function* () {
              const siteId = yield* sitesRepository.create({
                accessNotes: input.accessNotes,
                addressLine1: input.addressLine1,
                addressLine2: input.addressLine2,
                country: input.country,
                county: input.county,
                eircode: input.eircode,
                geocodedAt: geocodedLocation.geocodedAt,
                geocodingProvider: geocodedLocation.provider,
                latitude: geocodedLocation.latitude,
                longitude: geocodedLocation.longitude,
                name: input.name,
                organizationId: actor.organizationId,
                serviceAreaId: input.serviceAreaId,
                town: input.town,
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

        if (input.serviceAreaId !== undefined) {
          yield* Effect.annotateCurrentSpan(
            "serviceAreaId",
            input.serviceAreaId
          );
        }

        const geocodedLocation = yield* siteGeocoder.geocode(input);

        const site = yield* sitesRepository
          .withTransaction(
            sitesRepository
              .update(actor.organizationId, siteId, {
                accessNotes: input.accessNotes,
                addressLine1: input.addressLine1,
                addressLine2: input.addressLine2,
                country: input.country,
                county: input.county,
                eircode: input.eircode,
                geocodedAt: geocodedLocation.geocodedAt,
                geocodingProvider: geocodedLocation.provider,
                latitude: geocodedLocation.latitude,
                longitude: geocodedLocation.longitude,
                name: input.name,
                serviceAreaId: input.serviceAreaId,
                town: input.town,
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

        const [sites, serviceAreas] = hasElevatedOrganizationAccess(actor)
          ? yield* Effect.all([
              sitesRepository.listOptions(actor.organizationId),
              serviceAreasRepository.listOptions(actor.organizationId),
            ]).pipe(Effect.catchTag("SqlError", failSitesStorageError))
          : yield* sitesRepository.listOptions(actor.organizationId).pipe(
              Effect.map(
                (siteOptions) =>
                  [
                    siteOptions,
                    deriveServiceAreaOptionsFromSites(siteOptions),
                  ] as const
              ),
              Effect.catchTag("SqlError", failSitesStorageError)
            );

        return {
          serviceAreas,
          sites,
        } as const;
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

      return {
        addComment,
        create,
        getOptions,
        listComments,
        update,
      };
    }),
  }
) {}

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
  authorization: OrganizationAuthorization
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
  authorization: OrganizationAuthorization,
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

function deriveServiceAreaOptionsFromSites(
  sites: readonly {
    readonly serviceAreaId?: ServiceAreaOption["id"] | undefined;
    readonly serviceAreaName?: string | undefined;
  }[]
): readonly ServiceAreaOption[] {
  const serviceAreasById = EffectArray.reduce(
    sites,
    HashMap.empty<ServiceAreaOption["id"], ServiceAreaOption>(),
    (currentServiceAreasById, site) =>
      site.serviceAreaId === undefined || site.serviceAreaName === undefined
        ? currentServiceAreasById
        : HashMap.set(currentServiceAreasById, site.serviceAreaId, {
            id: site.serviceAreaId,
            name: site.serviceAreaName,
          })
  );

  return HashMap.toValues(serviceAreasById).toSorted(compareServiceAreaOptions);
}

function compareServiceAreaOptions(
  left: ServiceAreaOption,
  right: ServiceAreaOption
): number {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
