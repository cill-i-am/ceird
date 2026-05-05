"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type {
  CreateSiteInput,
  CreateSiteResponse,
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

export interface SitesNotice {
  readonly kind: "created" | "updated";
  readonly name: string;
}

export interface SitesOptionsState {
  readonly data: SitesOptionsResponse;
  readonly organizationId: OrganizationId | null;
}

export const emptySiteOptions: SitesOptionsResponse = {
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

export const createSiteMutationAtom = Atom.fn<
  AppApiError,
  CreateSiteResponse,
  CreateSiteInput
>((input, get) =>
  createBrowserSite(input).pipe(
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
    updateBrowserSite(siteId, input).pipe(
      Effect.tap((updatedSite) =>
        Effect.gen(function* () {
          yield* refreshSiteOptionsOrUpsert(get, updatedSite);

          yield* Effect.sync(() => {
            get.set(sitesNoticeAtom, {
              kind: "updated",
              name: updatedSite.name,
            });
          });
        })
      )
    )
  )
);

export function upsertSiteOption(
  options: SitesOptionsResponse,
  site: SiteOption
): SitesOptionsResponse {
  const sites = [
    site,
    ...options.sites.filter((existingSite) => existingSite.id !== site.id),
  ];
  sites.sort(compareSiteOptions);

  return {
    ...options,
    sites,
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

export function seedSitesOptionsState(
  organizationId: OrganizationId,
  response: SitesOptionsResponse
): SitesOptionsState {
  return {
    data: response,
    organizationId,
  };
}
