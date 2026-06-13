import type { OrganizationId } from "@ceird/identity-core";
import type {
  SiteComment,
  SiteCommentsResponse,
  SiteListResponse,
  SiteOption,
} from "@ceird/sites-core";
import { SiteListCursor } from "@ceird/sites-core";
import { QueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { getDataPlaneSessionKey } from "#/data-plane/session";

import {
  createSiteCommentsSeed,
  createSitesListSeed,
  getOrCreateSiteCommentsCollectionState,
  getOrCreateSitesCollectionState,
  siteCommentsCollectionId,
  siteCommentsCollectionKey,
  sitesCollectionId,
  sitesCollectionKey,
} from "./sites-data-plane";

describe("sites data plane", () => {
  const decodeSiteListCursor = Schema.decodeUnknownSync(SiteListCursor);
  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });

  const site = {
    displayLocation: "No location",
    hasUsableCoordinates: false,
    id: "22222222-2222-4222-8222-222222222222",
    labels: [],
    locationStatus: "unverified",
    name: "Dublin Port",
  } as unknown as SiteOption;

  const comment = {
    authorName: "Ciara",
    authorUserId: "user_123",
    body: "Gate code changed.",
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "77777777-7777-4777-8777-777777777777",
    siteId: site.id,
  } as unknown as SiteComment;

  it("uses organization scoped sites collection identity", () => {
    expect(sitesCollectionKey(scope)).toStrictEqual([
      "sites",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
      "page",
      {
        limit: 50,
        type: "cursor",
      },
    ]);
    expect(sitesCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:sites"
    );
  });

  it("uses per-site scoped comments collection identity", () => {
    expect(siteCommentsCollectionKey(scope, site.id)).toStrictEqual([
      "site-comments",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
      "site",
      site.id,
    ]);
    expect(siteCommentsCollectionId(scope, site.id)).toBe(
      `organization:org_123:user:user_123:role:owner:site:${site.id}:comments`
    );
  });

  it("creates page-aware seed envelopes for sites and comments", () => {
    const sitesResponse = {
      items: [site],
      nextCursor: undefined,
    } satisfies SiteListResponse;
    const commentsResponse = {
      comments: [comment],
    } satisfies SiteCommentsResponse;

    expect(createSitesListSeed(scope, sitesResponse, 1000)).toMatchObject({
      collection: "sites",
      completeness: {
        mode: "paged-query",
        page: {
          hasNextPage: false,
          limit: 50,
          type: "cursor",
        },
        queryName: "sites-list",
      },
      data: [site],
      queryKey: sitesCollectionKey(scope),
      requestStartedAt: 1000,
    });
    expect(
      createSiteCommentsSeed(scope, site.id, commentsResponse, 2000)
    ).toMatchObject({
      collection: "site-comments",
      completeness: {
        entityId: site.id,
        entityType: "site",
        mode: "entity-detail",
      },
      data: [comment],
      queryKey: siteCommentsCollectionKey(scope, site.id),
      requestStartedAt: 2000,
    });
  });

  it("reuses collection state through the data-plane registry", () => {
    const queryClient = new QueryClient();
    const session = {
      mutationJournal: createDataPlaneMutationJournal(),
      queryClient,
      registry: new Map<string, unknown>(),
      scope,
    };

    const firstSites = getOrCreateSitesCollectionState({
      initialSites: [site],
      queryClient,
      scope,
      session,
    });
    const secondSites = getOrCreateSitesCollectionState({
      initialSites: [],
      queryClient,
      scope,
      session,
    });
    const firstComments = getOrCreateSiteCommentsCollectionState({
      initialComments: [comment],
      queryClient,
      scope,
      session,
      siteId: site.id,
    });
    const secondComments = getOrCreateSiteCommentsCollectionState({
      initialComments: [],
      queryClient,
      scope,
      session,
      siteId: site.id,
    });

    expect(firstSites).toBe(secondSites);
    expect(firstComments).toBe(secondComments);
    expect(session.registry.has(sitesCollectionId(scope))).toBeTruthy();
    expect(
      session.registry.has(siteCommentsCollectionId(scope, site.id))
    ).toBeTruthy();
    expect(getDataPlaneSessionKey(session.scope)).toBe(
      "organization:org_123:user:user_123:role:owner"
    );
  });

  it("marks sites pages as non-complete when another cursor exists", () => {
    const sitesResponse = {
      items: [site],
      nextCursor: decodeSiteListCursor("next-sites-page"),
    } satisfies SiteListResponse;

    expect(
      createSitesListSeed(scope, sitesResponse).completeness
    ).toStrictEqual({
      mode: "paged-query",
      page: {
        hasNextPage: true,
        limit: 50,
        type: "cursor",
      },
      queryName: "sites-list",
    });
  });
});
