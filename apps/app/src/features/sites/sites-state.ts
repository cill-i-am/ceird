"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type {
  AddSiteCommentInput,
  AddSiteCommentResponse,
  CreateSiteInput,
  CreateSiteResponse,
  SiteComment,
  SiteIdType,
  SiteOption,
  SitesOptionsResponse,
  UpdateSiteInput,
  UpdateSiteResponse,
} from "@ceird/sites-core";
import { Atom } from "@effect-atom/atom-react";
import { Effect, Option } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";

export interface SitesNotice {
  readonly kind: "created" | "updated";
  readonly name: string;
}

export interface SitesOptionsState {
  readonly data: SitesOptionsResponse;
  readonly organizationId: OrganizationId | null;
}

const emptySiteOptions: SitesOptionsResponse = {
  serviceAreas: [],
  sites: [],
};

export const sitesOptionsStateAtom = Atom.make<SitesOptionsState>({
  data: emptySiteOptions,
  organizationId: null,
}).pipe(Atom.keepAlive);

export const sitesNoticeAtom = Atom.make<SitesNotice | null>(null).pipe(
  Atom.keepAlive
);

export const siteCommentsStateAtomFamily = Atom.family((siteId: SiteIdType) => {
  void siteId;

  return Atom.make<readonly SiteComment[]>([]);
});

const siteCommentsRefreshVersionAtomFamily = Atom.family(
  (siteId: SiteIdType) => {
    void siteId;

    return Atom.make(0);
  }
);

export const refreshSiteCommentsAtomFamily = Atom.family((siteId: SiteIdType) =>
  Atom.fn<AppApiError, readonly SiteComment[]>((_, get) =>
    Effect.gen(function* () {
      const refreshVersion = yield* Effect.sync(() =>
        beginSiteCommentsRefresh(get, siteId)
      );
      const response = yield* listBrowserSiteComments(siteId);

      yield* Effect.sync(() => {
        replaceSiteCommentsIfCurrent(
          get,
          siteId,
          refreshVersion,
          response.comments
        );
      });

      return response.comments.toSorted(compareSiteComments);
    })
  )
);

function beginSiteCommentsRefresh(get: Atom.FnContext, siteId: SiteIdType) {
  const nextVersion = get(siteCommentsRefreshVersionAtomFamily(siteId)) + 1;
  get.set(siteCommentsRefreshVersionAtomFamily(siteId), nextVersion);

  return nextVersion;
}

function replaceSiteCommentsIfCurrent(
  get: Atom.FnContext,
  siteId: SiteIdType,
  refreshVersion: number,
  comments: readonly SiteComment[]
) {
  if (get(siteCommentsRefreshVersionAtomFamily(siteId)) === refreshVersion) {
    get.set(
      siteCommentsStateAtomFamily(siteId),
      comments.toSorted(compareSiteComments)
    );
  }
}

function refreshSiteCommentsIfPossible(
  get: Atom.FnContext,
  siteId: SiteIdType
) {
  return Effect.gen(function* () {
    const refreshVersion = yield* Effect.sync(() =>
      beginSiteCommentsRefresh(get, siteId)
    );
    const response = yield* listBrowserSiteComments(siteId).pipe(
      Effect.tapError((error) =>
        Effect.logWarning(
          "Site comments refresh failed; keeping optimistic state",
          {
            error: error.message,
            siteId,
          }
        )
      ),
      Effect.option
    );

    yield* Option.match(response, {
      onNone: () => Effect.void,
      onSome: (freshComments) =>
        Effect.sync(() => {
          replaceSiteCommentsIfCurrent(
            get,
            siteId,
            refreshVersion,
            freshComments.comments
          );
        }),
    });
  });
}

export const createSiteMutationAtom = Atom.fn<
  AppApiError,
  CreateSiteResponse,
  CreateSiteInput
>((input, get) =>
  withMinimumMutationPendingDurationEffect(createBrowserSite(input)).pipe(
    Effect.tap((createdSite) =>
      Effect.gen(function* () {
        yield* refreshSiteOptionsOrUpsert(get, createdSite);

        yield* Effect.sync(() => {
          get.set(sitesNoticeAtom, {
            kind: "created",
            name: createdSite.name,
          });
        });
      })
    )
  )
);

export const updateSiteMutationAtomFamily = Atom.family((siteId: SiteIdType) =>
  Atom.fn<AppApiError, UpdateSiteResponse, UpdateSiteInput>((input, get) =>
    withMinimumMutationPendingDurationEffect(
      updateBrowserSite(siteId, input)
    ).pipe(
      Effect.tap((response) =>
        Effect.gen(function* () {
          yield* refreshSiteOptionsOrUpsert(get, response);

          yield* Effect.sync(() => {
            get.set(sitesNoticeAtom, {
              kind: "updated",
              name: response.name,
            });
          });
        })
      )
    )
  )
);

export const addSiteCommentMutationAtomFamily = Atom.family(
  (siteId: SiteIdType) =>
    Atom.fn<AppApiError, AddSiteCommentResponse, AddSiteCommentInput>(
      (input, get) =>
        withMinimumMutationPendingDurationEffect(
          addBrowserSiteComment(siteId, input)
        ).pipe(
          Effect.tap((comment) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                upsertSiteComment(get, siteId, comment);
              });

              yield* refreshSiteCommentsIfPossible(get, siteId);
            })
          )
        )
    )
);

function upsertSiteOption(
  options: SitesOptionsResponse,
  site: SiteOption
): SitesOptionsResponse {
  return {
    ...options,
    sites: [
      site,
      ...options.sites.filter((existingSite) => existingSite.id !== site.id),
    ].toSorted(compareSiteOptions),
  };
}

function mergeSiteOptions(
  siteOptions: SitesOptionsResponse
): SitesOptionsResponse {
  return {
    serviceAreas: siteOptions.serviceAreas,
    sites: siteOptions.sites,
  };
}

function createBrowserSite(input: CreateSiteInput) {
  return runBrowserAppApiRequest("SitesBrowser.createSite", (client) =>
    client.sites.createSite({ payload: input })
  );
}

function updateBrowserSite(siteId: SiteIdType, input: UpdateSiteInput) {
  return runBrowserAppApiRequest("SitesBrowser.updateSite", (client) =>
    client.sites.updateSite({
      path: { siteId },
      payload: input,
    })
  );
}

function listBrowserSiteComments(siteId: SiteIdType) {
  return runBrowserAppApiRequest("SitesBrowser.listSiteComments", (client) =>
    client.sites.listSiteComments({
      path: { siteId },
    })
  );
}

function addBrowserSiteComment(siteId: SiteIdType, input: AddSiteCommentInput) {
  return runBrowserAppApiRequest("SitesBrowser.addSiteComment", (client) =>
    client.sites.addSiteComment({
      path: { siteId },
      payload: input,
    })
  );
}

function getBrowserSiteOptions() {
  return runBrowserAppApiRequest("SitesBrowser.getSiteOptions", (client) =>
    client.sites.getSiteOptions()
  );
}

function refreshSiteOptionsOrUpsert(get: Atom.FnContext, site: SiteOption) {
  return Effect.gen(function* () {
    const siteOptions = yield* getBrowserSiteOptions().pipe(
      Effect.tapError((error) =>
        Effect.logWarning(
          "Site options refresh failed; using optimistic site",
          {
            error: error.message,
            siteId: site.id,
          }
        )
      ),
      Effect.option
    );
    const currentOptionsState = get(sitesOptionsStateAtom);
    const nextOptions = Option.match(siteOptions, {
      onNone: () => upsertSiteOption(currentOptionsState.data, site),
      onSome: mergeSiteOptions,
    });

    yield* Effect.sync(() => {
      get.set(sitesOptionsStateAtom, {
        data: nextOptions,
        organizationId: currentOptionsState.organizationId,
      });
    });
  });
}

function compareSiteOptions(left: SiteOption, right: SiteOption) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function upsertSiteComment(
  get: Atom.FnContext,
  siteId: SiteIdType,
  comment: AddSiteCommentResponse
) {
  const comments = get(siteCommentsStateAtomFamily(siteId));

  get.set(
    siteCommentsStateAtomFamily(siteId),
    [
      ...comments.filter((current) => current.id !== comment.id),
      comment,
    ].toSorted(compareSiteComments)
  );
}

function compareSiteComments(left: SiteComment, right: SiteComment) {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);

  return createdAtComparison === 0
    ? left.id.localeCompare(right.id)
    : createdAtComparison;
}

export function seedSitesOptionsState(
  organizationId: OrganizationId,
  response: SitesOptionsResponse
): SitesOptionsState {
  return {
    data: response,
    organizationId,
  };
}
