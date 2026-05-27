import type {
  JobListItem,
  JobMemberOptionsResponse,
  OrganizationActivityListResponse,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { SiteIdType, SitesOptionsResponse } from "@ceird/sites-core";

import { describeJobActivity } from "#/features/activity/activity-formatting";
import {
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
  formatJobDateTime,
} from "#/features/jobs/job-display";
import { buildSiteAddressLines } from "#/features/sites/site-location";

const ACTIVE_JOB_STATUSES = new Set<JobListItem["status"]>([
  "blocked",
  "in_progress",
  "new",
  "triaged",
]);

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
  jobs,
  jobMemberOptions,
  sites,
}: {
  readonly activity: OrganizationActivityListResponse;
  readonly activityAvailable: boolean;
  readonly jobs: readonly JobListItem[];
  readonly jobMemberOptions: JobMemberOptionsResponse;
  readonly sites: SitesOptionsResponse;
}): AuthenticatedHomeDashboard {
  const memberById = new Map(
    jobMemberOptions.members.map((member) => [member.id, member])
  );
  const siteById = new Map(sites.sites.map((site) => [site.id, site]));
  const activeJobs = jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
  const activeJobCountBySiteId = new Map<SiteIdType, number>();

  for (const job of activeJobs) {
    if (!job.siteId) {
      continue;
    }

    activeJobCountBySiteId.set(
      job.siteId,
      (activeJobCountBySiteId.get(job.siteId) ?? 0) + 1
    );
  }

  return {
    activity: {
      available: activityAvailable,
      items: activity.items.slice(0, 5).map((item) => ({
        actorName: item.actor?.name,
        createdAt: formatJobDateTime(item.createdAt),
        description: describeJobActivity(item.actor?.name, item.payload),
        jobTitle: item.jobTitle,
        workItemId: item.workItemId,
      })),
    },
    jobs: {
      items: activeJobs.slice(0, 5).map((job) => ({
        assigneeName: job.assigneeId
          ? memberById.get(job.assigneeId)?.name
          : undefined,
        id: job.id,
        priorityLabel: JOB_PRIORITY_LABELS[job.priority],
        siteName: job.siteId ? siteById.get(job.siteId)?.name : undefined,
        statusLabel: JOB_STATUS_LABELS[job.status],
        title: job.title,
        updatedAt: formatJobDateTime(job.updatedAt),
      })),
      stats: {
        activeJobs: activeJobs.length,
        blockedJobs: jobs.filter((job) => job.status === "blocked").length,
        priorityWatchJobs: jobs.filter(
          (job) => job.priority === "urgent" || job.priority === "high"
        ).length,
        totalJobs: jobs.length,
        unassignedJobs: activeJobs.filter((job) => !job.assigneeId).length,
      },
    },
    members: {
      total: jobMemberOptions.members.length,
    },
    sites: {
      items: sites.sites
        .map((site) => ({
          activeJobCount: activeJobCountBySiteId.get(site.id) ?? 0,
          address: buildSiteAddressLines(site).join(", "),
          id: site.id,
          name: site.name,
          updatedAt:
            site.locationResolvedAt === undefined
              ? "Unverified location"
              : formatJobDateTime(site.locationResolvedAt),
        }))
        .filter((site) => site.activeJobCount > 0)
        .toSorted((left, right) => {
          if (left.activeJobCount !== right.activeJobCount) {
            return right.activeJobCount - left.activeJobCount;
          }

          return left.name.localeCompare(right.name);
        })
        .slice(0, 5),
      stats: {
        mappedSites: sites.sites.length,
        totalSites: sites.sites.length,
      },
    },
  };
}
