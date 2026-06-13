import { WorkItemId } from "@ceird/jobs-core";
import type { HomeDashboardSummaryResponse } from "@ceird/jobs-core";
import { SiteId } from "@ceird/sites-core";
import { Schema } from "effect";

import { buildAuthenticatedHomeDashboard } from "./authenticated-shell-home-dashboard";

const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);

describe("authenticated shell home dashboard model", () => {
  it("renders bounded home summary rows", () => {
    const activeSiteId = decodeSiteId("22222222-2222-4222-8222-222222222222");
    const summary: HomeDashboardSummaryResponse = {
      jobs: {
        items: [
          {
            id: decodeWorkItemId("33333333-3333-4333-8333-333333333333"),
            priority: "medium",
            status: "in_progress",
            title: "Inspect boiler",
            updatedAt: "2026-04-23T12:00:00.000Z",
          },
        ],
        stats: {
          activeJobs: 1,
          blockedJobs: 0,
          priorityWatchJobs: 0,
          totalJobs: 1,
          unassignedJobs: 1,
        },
      },
      members: {
        total: 0,
      },
      sites: {
        items: [
          buildSiteSummaryItem({
            activeJobCount: 1,
            id: activeSiteId,
            name: "Active second",
          }),
        ],
        stats: {
          mappedSites: 1,
          totalSites: 2,
        },
      },
    };

    const dashboard = buildAuthenticatedHomeDashboard({
      activity: {
        items: [],
        nextCursor: undefined,
      },
      activityAvailable: true,
      summary,
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

function buildSiteSummaryItem(
  overrides: Partial<HomeDashboardSummaryResponse["sites"]["items"][number]> &
    Pick<HomeDashboardSummaryResponse["sites"]["items"][number], "id">
): HomeDashboardSummaryResponse["sites"]["items"][number] {
  const { id, ...rest } = overrides;

  return {
    addressLine1: "1 North Wall Quay",
    activeJobCount: 0,
    county: "Dublin",
    displayLocation: "1 North Wall Quay, Dublin, D01 X2X2",
    eircode: "D01 X2X2",
    formattedAddress: "1 North Wall Quay, Dublin, D01 X2X2, Ireland",
    id,
    locationResolvedAt: "2026-04-23T10:00:00.000Z",
    name: "Site",
    ...rest,
  };
}
