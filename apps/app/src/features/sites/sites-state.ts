"use client";

import { Atom } from "@effect-atom/atom-react";
import type {
  CreateSiteInput,
  CreateSiteResponse,
  JobOptionsResponse,
  JobSiteOption,
  SiteIdType,
  SitesOptionsResponse,
  UpdateSiteInput,
  UpdateSiteResponse,
} from "@task-tracker/jobs-core";
import { Effect, Option } from "effect";

import { runBrowserJobsRequest } from "#/features/jobs/jobs-client";
import type { AppJobsError } from "#/features/jobs/jobs-errors";
import { jobsOptionsStateAtom } from "#/features/jobs/jobs-state";

export interface SitesNotice {
  readonly kind: "created" | "updated";
  readonly name: string;
}

export const sitesNoticeAtom = Atom.make<SitesNotice | null>(null).pipe(
  Atom.keepAlive
);

export const createSiteMutationAtom = Atom.fn<
  AppJobsError,
  CreateSiteResponse,
  CreateSiteInput
>((input, get) =>
  createBrowserSite(input).pipe(
    Effect.tap((createdSite) =>
      Effect.gen(function* () {
        yield* refreshSiteOptionsOrUpsert(get, createdSite);

        get.set(sitesNoticeAtom, {
          kind: "created",
          name: createdSite.name,
        });
      })
    )
  )
);

export const updateSiteMutationAtomFamily = Atom.family((siteId: SiteIdType) =>
  Atom.fn<AppJobsError, UpdateSiteResponse, UpdateSiteInput>((input, get) =>
    updateBrowserSite(siteId, input).pipe(
      Effect.tap((updatedSite) =>
        Effect.gen(function* () {
          yield* refreshSiteOptionsOrUpsert(get, updatedSite);

          get.set(sitesNoticeAtom, {
            kind: "updated",
            name: updatedSite.name,
          });
        })
      )
    )
  )
);

export function upsertSiteOption(
  options: JobOptionsResponse,
  site: JobSiteOption
): JobOptionsResponse {
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
  options: JobOptionsResponse,
  siteOptions: SitesOptionsResponse
): JobOptionsResponse {
  return {
    ...options,
    serviceAreas: siteOptions.serviceAreas,
    sites: siteOptions.sites,
  };
}

function createBrowserSite(input: CreateSiteInput) {
  return runBrowserJobsRequest("SitesBrowser.createSite", (client) =>
    client.sites.createSite({ payload: input })
  );
}

function updateBrowserSite(siteId: SiteIdType, input: UpdateSiteInput) {
  return runBrowserJobsRequest("SitesBrowser.updateSite", (client) =>
    client.sites.updateSite({
      path: { siteId },
      payload: input,
    })
  );
}

function getBrowserSiteOptions() {
  return runBrowserJobsRequest("SitesBrowser.getSiteOptions", (client) =>
    client.sites.getSiteOptions()
  );
}

function refreshSiteOptionsOrUpsert(get: Atom.FnContext, site: JobSiteOption) {
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
    const currentOptionsState = get(jobsOptionsStateAtom);
    const nextOptions = Option.match(siteOptions, {
      onNone: () => upsertSiteOption(currentOptionsState.data, site),
      onSome: (freshOptions) =>
        mergeSiteOptions(currentOptionsState.data, freshOptions),
    });

    get.set(jobsOptionsStateAtom, {
      data: nextOptions,
      organizationId: currentOptionsState.organizationId,
    });
  });
}

function compareSiteOptions(left: JobSiteOption, right: JobSiteOption) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
