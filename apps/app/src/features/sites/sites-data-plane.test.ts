import type { OrganizationId } from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
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
  createSitesElectricReadModelCollections,
  createSitesElectricReadModelContracts,
  createSitesListSeed,
  getOrCreateSiteCommentsCollectionState,
  getOrCreateSitesCollectionState,
  joinSitesElectricReadModel,
  selectSiteRelatedJobs,
  siteActiveJobSummariesCollectionId,
  siteActiveJobSummariesCollectionKey,
  siteCommentsCollectionId,
  siteCommentsCollectionKey,
  siteLabelAssignmentsCollectionId,
  siteLabelAssignmentsCollectionKey,
  siteRelatedJobsCollectionId,
  siteRelatedJobsCollectionKey,
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
  const urgentLabel = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "33333333-3333-4333-8333-333333333333",
    name: "Urgent Access",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as Label;

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

  it("uses organization scoped Electric read model collection identities", () => {
    expect(siteActiveJobSummariesCollectionKey(scope)).toStrictEqual([
      "site-active-job-summaries",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
    ]);
    expect(siteLabelAssignmentsCollectionKey(scope)).toStrictEqual([
      "site-label-assignments",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
    ]);
    expect(siteRelatedJobsCollectionKey(scope, site.id)).toStrictEqual([
      "site-related-jobs",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
      "site",
      site.id,
    ]);
    expect(siteActiveJobSummariesCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:site-active-job-summaries"
    );
    expect(siteLabelAssignmentsCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:site-label-assignments"
    );
    expect(siteRelatedJobsCollectionId(scope, site.id)).toBe(
      `organization:org_123:user:user_123:role:owner:site:${site.id}:related-jobs`
    );
  });

  it("defines named Electric contracts for the Sites read model graph", () => {
    const contracts = createSitesElectricReadModelContracts({
      scope,
      siteId: site.id,
    });

    expect(contracts.sites).toMatchObject({
      collection: "sites",
      completeness: {
        covers: { mode: "complete-tenant" },
        mode: "sync-backed",
        source: "electric",
        subscriptionName: "sites",
      },
      shapeName: "sites",
    });
    expect(contracts.siteLabelAssignments).toMatchObject({
      collection: "site-label-assignments",
      completeness: {
        covers: { mode: "complete-tenant" },
        mode: "sync-backed",
        source: "electric",
        subscriptionName: "site-labels",
      },
      shapeName: "site-labels",
    });
    expect(contracts.activeJobSummaries).toMatchObject({
      collection: "site-active-job-summaries",
      completeness: {
        covers: { mode: "complete-tenant" },
        mode: "sync-backed",
        source: "electric",
        subscriptionName: "site-active-job-summaries",
      },
      shapeName: "site-active-job-summaries",
    });
    expect(contracts.relatedJobs).toMatchObject({
      collection: "site-related-jobs",
      completeness: {
        covers: {
          filters: [{ field: "siteId", operator: "eq", value: site.id }],
          mode: "filtered-query",
          queryName: "site-related-jobs",
        },
        mode: "sync-backed",
        source: "electric",
        subscriptionName: "jobs",
      },
      shapeName: "jobs",
    });
  });

  it("surfaces shared Electric health for every Sites read model collection", () => {
    const collections = createSitesElectricReadModelCollections({
      scope,
      siteId: site.id,
    });

    expect(collections.sites.status).toBe("disabled");
    expect(collections.sites.health.current).toMatchObject({
      collection: "sites",
      source: "electric",
      status: "disabled",
      subscriptionName: "sites",
    });
    expect(collections.activeJobSummaries.health.current).toMatchObject({
      collection: "site-active-job-summaries",
      status: "disabled",
      subscriptionName: "site-active-job-summaries",
    });
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

  it("joins sites, labels, assignments, and domain-owned active summaries locally", () => {
    const [joined] = joinSitesElectricReadModel({
      activeJobSummaries: [
        {
          activeJobCount: 2,
          highestActiveJobPriority: "urgent",
          organizationId: "org_123",
          siteId: site.id,
          updatedAt: "2026-05-30T00:00:00.000Z",
        },
      ],
      labels: [urgentLabel],
      siteLabelAssignments: [
        {
          createdAt: "2026-05-30T00:00:00.000Z",
          labelId: urgentLabel.id,
          organizationId: "org_123",
          siteId: site.id,
        },
      ],
      sites: [site],
    });

    expect(joined).toMatchObject({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
      labels: [urgentLabel],
    });
  });

  it("selects related jobs from the synced jobs row set without redefining active-job meaning", () => {
    const jobs = [
      {
        createdAt: "2026-05-30T00:00:00.000Z",
        id: "44444444-4444-4444-8444-444444444444",
        kind: "job",
        labels: [],
        priority: "medium",
        siteId: site.id,
        status: "new",
        title: "Gate repair",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
      {
        createdAt: "2026-05-30T00:00:00.000Z",
        id: "55555555-5555-4555-8555-555555555555",
        kind: "job",
        labels: [],
        priority: "low",
        status: "new",
        title: "No site job",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ] as unknown as readonly JobListItem[];
    const related = selectSiteRelatedJobs(jobs, site.id);

    expect(related.map((job) => job.title)).toStrictEqual(["Gate repair"]);
  });
});
