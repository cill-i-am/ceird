import type { OrganizationId } from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { SiteOption } from "@ceird/sites-core";

import { createOrganizationDataScope } from "#/data-plane/query-scope";

import {
  deriveSitesWorkspaceVisibleRows,
  getOrCreateSitesWorkspaceReadModelCollectionState,
} from "./sites-workspace-data-plane";

describe("sites workspace data plane", () => {
  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });

  const urgentLabel = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "33333333-3333-4333-8333-333333333333",
    name: "Urgent Access",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as Label;
  const maintenanceLabel = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "88888888-8888-4888-8888-888888888888",
    name: "Maintenance",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as Label;
  const dublinSite = {
    displayLocation: "Dublin Port",
    formattedAddress: "Dublin Port, Dublin",
    hasUsableCoordinates: true,
    id: "22222222-2222-4222-8222-222222222222",
    labels: [],
    locationStatus: "validated",
    name: "Dublin Port",
    updatedAt: "2026-06-02T00:00:00.000Z",
  } as unknown as SiteOption;
  const corkSite = {
    displayLocation: "Cork Yard",
    hasUsableCoordinates: false,
    id: "66666666-6666-4666-8666-666666666666",
    labels: [],
    locationStatus: "unverified",
    name: "Cork Yard",
    updatedAt: "2026-06-01T00:00:00.000Z",
  } as unknown as SiteOption;
  const dublinJob = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "44444444-4444-4444-8444-444444444444",
    kind: "job",
    labels: [],
    priority: "medium",
    siteId: dublinSite.id,
    status: "new",
    title: "Gate repair",
    updatedAt: "2026-05-31T00:00:00.000Z",
  } as unknown as JobListItem;
  const corkJob = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "55555555-5555-4555-8555-555555555555",
    kind: "job",
    labels: [],
    priority: "low",
    siteId: corkSite.id,
    status: "new",
    title: "Yard inspection",
    updatedAt: "2026-06-03T00:00:00.000Z",
  } as unknown as JobListItem;

  it("creates disabled Electric collections for the browser-safe workspace graph during server render", () => {
    const state = getOrCreateSitesWorkspaceReadModelCollectionState({
      scope,
    });

    expect(state.sites.collection).toBeNull();
    expect(state.sites.health.current).toMatchObject({
      collection: "sites",
      source: "electric",
      status: "disabled",
      subscriptionName: "sites",
    });
    expect(state.labels.health.current).toMatchObject({
      collection: "labels",
      source: "electric",
      status: "disabled",
      subscriptionName: "labels",
    });
    expect(state.activeJobSummaries.health.current).toMatchObject({
      collection: "site-active-job-summaries",
      source: "electric",
      status: "disabled",
      subscriptionName: "site-active-job-summaries",
    });
  });

  it("derives selection-ready visible rows from the actual Sites workspace graph inputs", () => {
    const rows = deriveSitesWorkspaceVisibleRows({
      activeJobSummaries: [
        {
          activeJobCount: 3,
          highestActiveJobPriority: "urgent",
          organizationId: "org_123",
          siteId: dublinSite.id,
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
        {
          activeJobCount: 1,
          highestActiveJobPriority: "low",
          organizationId: "org_123",
          siteId: corkSite.id,
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      filter: "with-active-jobs",
      labels: [maintenanceLabel, urgentLabel],
      query: "urgent",
      relatedJobs: [corkJob, dublinJob],
      siteLabelAssignments: [
        {
          createdAt: "2026-05-30T00:00:00.000Z",
          labelId: urgentLabel.id,
          organizationId: "org_123",
          siteId: dublinSite.id,
        },
        {
          createdAt: "2026-05-30T00:00:00.000Z",
          labelId: maintenanceLabel.id,
          organizationId: "org_123",
          siteId: corkSite.id,
        },
      ],
      sites: [corkSite, dublinSite],
      sort: "active-jobs",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.site).toMatchObject({
      activeJobCount: 3,
      highestActiveJobPriority: "urgent",
      labels: [urgentLabel],
      name: "Dublin Port",
    });
    expect(rows[0]?.relatedJobs).toStrictEqual([dublinJob]);
  });

  it("sorts by recently updated and supports needs-location filters", () => {
    const rows = deriveSitesWorkspaceVisibleRows({
      activeJobSummaries: [],
      filter: "needs-location",
      labels: [],
      query: "",
      relatedJobs: [corkJob, dublinJob],
      siteLabelAssignments: [],
      sites: [dublinSite, corkSite],
      sort: "updated",
    });

    expect(rows.map((row) => row.site.name)).toStrictEqual(["Cork Yard"]);
    expect(rows[0]?.relatedJobs).toStrictEqual([corkJob]);
  });
});
