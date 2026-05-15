import { WorkItemId } from "@ceird/jobs-core";
import type { JobListItem, JobMemberOptionsResponse } from "@ceird/jobs-core";
import { SiteId } from "@ceird/sites-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import { Schema } from "effect";

import { buildAuthenticatedHomeDashboard } from "./authenticated-shell-home-dashboard";

const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);

describe("authenticated shell home dashboard model", () => {
  it("shows only sites with active work, sorted before slicing", () => {
    const inactiveSiteId = decodeSiteId("11111111-1111-4111-8111-111111111111");
    const activeSiteId = decodeSiteId("22222222-2222-4222-8222-222222222222");
    const sites: SitesOptionsResponse = {
      serviceAreas: [],
      sites: [
        buildSiteOption(inactiveSiteId, "Inactive first"),
        buildSiteOption(activeSiteId, "Active second"),
      ],
    };
    const jobs: readonly JobListItem[] = [
      buildJob({
        id: decodeWorkItemId("33333333-3333-4333-8333-333333333333"),
        siteId: activeSiteId,
        status: "in_progress",
      }),
    ];

    const dashboard = buildAuthenticatedHomeDashboard({
      activity: {
        items: [],
        nextCursor: undefined,
      },
      activityAvailable: true,
      jobs,
      jobMemberOptions: emptyJobMemberOptions,
      sites,
    });

    expect(dashboard.sites.items).toStrictEqual([
      expect.objectContaining({
        activeJobCount: 1,
        id: activeSiteId,
        name: "Active second",
      }),
    ]);
  });
});

const emptyJobMemberOptions: JobMemberOptionsResponse = {
  members: [],
};

function buildSiteOption(
  id: ReturnType<typeof decodeSiteId>,
  name: string
): SitesOptionsResponse["sites"][number] {
  return {
    addressLine1: "1 North Wall Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    geocodedAt: "2026-04-23T10:00:00.000Z",
    geocodingProvider: "stub",
    id,
    latitude: 53.3498,
    longitude: -6.2603,
    name,
  };
}

function buildJob({
  id,
  siteId,
  status,
}: {
  readonly id: ReturnType<typeof decodeWorkItemId>;
  readonly siteId: ReturnType<typeof decodeSiteId>;
  readonly status: JobListItem["status"];
}): JobListItem {
  return {
    createdAt: "2026-04-23T10:00:00.000Z",
    id,
    kind: "job",
    labels: [],
    priority: "medium",
    siteId,
    status,
    title: "Inspect boiler",
    updatedAt: "2026-04-23T12:00:00.000Z",
  };
}
