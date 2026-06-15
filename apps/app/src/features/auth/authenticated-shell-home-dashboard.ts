import type {
  HomeDashboardSummaryResponse,
  OrganizationActivityListResponse,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { SiteIdType } from "@ceird/sites-core";

import { describeJobActivity } from "#/features/activity/activity-formatting";
import {
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
  formatJobDateTime,
} from "#/features/jobs/job-display";
import { buildSiteAddressLines } from "#/features/sites/site-location";

export interface AuthenticatedHomeDashboard {
  readonly activity: {
    readonly available: boolean;
    readonly items: readonly AuthenticatedHomeActivityItem[];
  };
  readonly jobs: {
    readonly items: readonly AuthenticatedHomeJobItem[];
    readonly stats: AuthenticatedHomeJobStats;
  };
  readonly members: {
    readonly total: number;
  };
  readonly sites: {
    readonly items: readonly AuthenticatedHomeSiteItem[];
    readonly stats: AuthenticatedHomeSiteStats;
  };
}

interface AuthenticatedHomeActivityItem {
  readonly actorName?: string | undefined;
  readonly createdAt: string;
  readonly description: string;
  readonly jobTitle: string;
  readonly workItemId: WorkItemIdType;
}

export interface AuthenticatedHomeJobItem {
  readonly assigneeName?: string | undefined;
  readonly id: WorkItemIdType;
  readonly priorityLabel: string;
  readonly siteName?: string | undefined;
  readonly statusLabel: string;
  readonly title: string;
  readonly updatedAt: string;
}

interface AuthenticatedHomeJobStats {
  readonly activeJobs: number;
  readonly blockedJobs: number;
  readonly priorityWatchJobs: number;
  readonly totalJobs: number;
  readonly unassignedJobs: number;
}

export interface AuthenticatedHomeSiteItem {
  readonly activeJobCount: number;
  readonly address: string;
  readonly id: SiteIdType;
  readonly name: string;
  readonly updatedAt: string;
}

interface AuthenticatedHomeSiteStats {
  readonly mappedSites: number;
  readonly totalSites: number;
}

export const EMPTY_AUTHENTICATED_HOME_DASHBOARD: AuthenticatedHomeDashboard = {
  activity: {
    available: false,
    items: [],
  },
  jobs: {
    items: [],
    stats: {
      activeJobs: 0,
      blockedJobs: 0,
      priorityWatchJobs: 0,
      totalJobs: 0,
      unassignedJobs: 0,
    },
  },
  members: {
    total: 0,
  },
  sites: {
    items: [],
    stats: {
      mappedSites: 0,
      totalSites: 0,
    },
  },
};

export function buildAuthenticatedHomeDashboard({
  activity,
  activityAvailable,
  summary,
}: {
  readonly activity: OrganizationActivityListResponse;
  readonly activityAvailable: boolean;
  readonly summary: HomeDashboardSummaryResponse;
}): AuthenticatedHomeDashboard {
  return {
    activity: {
      available: activityAvailable,
      items: activity.items.slice(0, 5).map((item) => ({
        actorName: item.actor?.displayName,
        createdAt: formatJobDateTime(item.createdAt),
        description: describeJobActivity(item.actor?.displayName, item.payload),
        jobTitle: item.jobTitle,
        workItemId: item.workItemId,
      })),
    },
    jobs: {
      items: summary.jobs.items.map((job) => ({
        assigneeName: job.assigneeName,
        id: job.id,
        priorityLabel: JOB_PRIORITY_LABELS[job.priority],
        siteName: job.siteName,
        statusLabel: JOB_STATUS_LABELS[job.status],
        title: job.title,
        updatedAt: formatJobDateTime(job.updatedAt),
      })),
      stats: summary.jobs.stats,
    },
    members: {
      total: summary.members.total,
    },
    sites: {
      items: summary.sites.items.map((site) => ({
        activeJobCount: site.activeJobCount,
        address: buildSiteAddressLines(site).join(", "),
        id: site.id,
        name: site.name,
        updatedAt:
          site.locationResolvedAt === undefined
            ? "Unverified location"
            : formatJobDateTime(site.locationResolvedAt),
      })),
      stats: summary.sites.stats,
    },
  };
}
