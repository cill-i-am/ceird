import type { JobListItem } from "@ceird/jobs-core";
import { JobListItemSchema } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import { LabelSchema } from "@ceird/labels-core";
import type {
  SiteActiveJobPriority,
  SiteIdType,
  SiteOption,
} from "@ceird/sites-core";
import {
  SiteActiveJobPrioritySchema,
  SiteOptionSchema,
} from "@ceird/sites-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Schema } from "effect";

import {
  COMPLETE_TENANT_COLLECTION,
  syncBackedCollectionCompleteness,
} from "#/data-plane/collection-contract";
import {
  createElectricCollectionFromContract,
  defineElectricCollectionContract,
} from "#/data-plane/electric-collection";
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";

type SitesWorkspaceElectricRowValue =
  | bigint
  | boolean
  | null
  | number
  | string
  | SitesWorkspaceElectricRowValue[]
  | { readonly [key: string]: SitesWorkspaceElectricRowValue };
type SitesWorkspaceElectricRow = Record<string, SitesWorkspaceElectricRowValue>;

const SiteActiveJobSummaryElectricRowSchema = Schema.Struct({
  activeJobCount: Schema.Number,
  highestActiveJobPriority: Schema.optional(
    Schema.NullOr(SiteActiveJobPrioritySchema)
  ),
  organizationId: Schema.String,
  siteId: Schema.String,
  updatedAt: Schema.String,
});
const SiteLabelAssignmentElectricRowSchema = Schema.Struct({
  createdAt: Schema.String,
  labelId: Schema.String,
  organizationId: Schema.String,
  siteId: Schema.String,
});
const SiteOptionElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteOptionSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const SiteActiveJobSummaryElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteActiveJobSummaryElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const SiteLabelAssignmentElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteLabelAssignmentElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const SiteRelatedJobElectricStandardSchema = Schema.toStandardSchemaV1(
  JobListItemSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const LabelElectricStandardSchema = Schema.toStandardSchemaV1(LabelSchema);

export interface SiteActiveJobSummaryElectricRow {
  readonly activeJobCount: number;
  readonly highestActiveJobPriority?: SiteActiveJobPriority | undefined;
  readonly organizationId: string;
  readonly siteId: SiteIdType;
  readonly updatedAt: string;
}

export interface SiteLabelAssignmentElectricRow {
  readonly createdAt: string;
  readonly labelId: Label["id"];
  readonly organizationId: string;
  readonly siteId: SiteIdType;
}

export type SitesWorkspaceFilter =
  | "all"
  | "with-active-jobs"
  | "needs-location";

export type SitesWorkspaceSort = "name" | "active-jobs" | "updated";

export interface SitesWorkspaceVisibleRow {
  readonly relatedJobs: readonly JobListItem[];
  readonly site: SiteOption;
}

export interface SitesWorkspaceReadModelRows {
  readonly activeJobSummaries: readonly SiteActiveJobSummaryElectricRow[];
  readonly labels: readonly Label[];
  readonly relatedJobs: readonly JobListItem[];
  readonly siteLabelAssignments: readonly SiteLabelAssignmentElectricRow[];
  readonly sites: readonly SiteOption[];
}

export function getOrCreateSitesWorkspaceReadModelCollectionState({
  scope,
  session,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}) {
  const registryKey = `${sitesWorkspaceCollectionId(scope)}:read-model`;
  const existing = session?.registry.get(registryKey);

  if (existing) {
    return existing as ReturnType<
      typeof createSitesWorkspaceReadModelCollections
    >;
  }

  const created = createSitesWorkspaceReadModelCollections(scope);
  session?.registry.set(registryKey, created);

  return created;
}

export function deriveSitesWorkspaceVisibleRows({
  activeJobSummaries,
  filter,
  labels,
  query,
  relatedJobs,
  siteLabelAssignments,
  sites,
  sort,
}: SitesWorkspaceReadModelRows & {
  readonly filter: SitesWorkspaceFilter;
  readonly query: string;
  readonly sort: SitesWorkspaceSort;
}): readonly SitesWorkspaceVisibleRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const joinedSites = joinSitesWorkspaceRows({
    activeJobSummaries,
    labels,
    siteLabelAssignments,
    sites,
  });

  return joinedSites
    .filter((site) => matchesSitesWorkspaceFilter(site, filter))
    .filter((site) => matchesSitesWorkspaceQuery(site, normalizedQuery))
    .toSorted((left, right) => compareSitesWorkspaceRows(left, right, sort))
    .map((site) => ({
      relatedJobs: selectSiteRelatedJobs(relatedJobs, site.id),
      site,
    }));
}

function createSitesWorkspaceReadModelCollections(
  scope: OrganizationDataScope
) {
  return {
    activeJobSummaries: createElectricCollectionFromContract(
      createSiteActiveJobSummariesElectricContract(scope)
    ),
    labels: createElectricCollectionFromContract(
      createLabelsElectricContract(scope)
    ),
    relatedJobs: createElectricCollectionFromContract(
      createSiteRelatedJobsElectricContract(scope)
    ),
    siteLabelAssignments: createElectricCollectionFromContract(
      createSiteLabelAssignmentsElectricContract(scope)
    ),
    sites: createElectricCollectionFromContract(
      createSitesElectricContract(scope)
    ),
  };
}

function createSitesElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "sites",
    completeness: syncBackedCollectionCompleteness({
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "sites",
    }),
    getKey: (site) => String(site.id),
    id: `${sitesWorkspaceCollectionId(scope)}:sites`,
    schema: SiteOptionElectricStandardSchema,
    shapeName: "sites",
    shapeOptions: {
      transformer: toSiteOptionElectricRow,
    },
  });
}

function createSiteLabelAssignmentsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "site-label-assignments",
    completeness: syncBackedCollectionCompleteness({
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "site-labels",
    }),
    getKey: (assignment) =>
      `${String(assignment.siteId)}:${String(assignment.labelId)}`,
    id: `${sitesWorkspaceCollectionId(scope)}:site-label-assignments`,
    schema: SiteLabelAssignmentElectricStandardSchema,
    shapeName: "site-labels",
    shapeOptions: {
      transformer: toSiteLabelAssignmentElectricRow,
    },
  });
}

function createSiteActiveJobSummariesElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "site-active-job-summaries",
    completeness: syncBackedCollectionCompleteness({
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "site-active-job-summaries",
    }),
    getKey: (summary) => String(summary.siteId),
    id: `${sitesWorkspaceCollectionId(scope)}:site-active-job-summaries`,
    schema: SiteActiveJobSummaryElectricStandardSchema,
    shapeName: "site-active-job-summaries",
    shapeOptions: {
      transformer: toSiteActiveJobSummaryElectricRow,
    },
  });
}

function createSiteRelatedJobsElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "site-related-jobs",
    completeness: syncBackedCollectionCompleteness({
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "jobs",
    }),
    getKey: (job) => String(job.id),
    id: `${organizationDataQueryKey("site-related-jobs", scope).join(":")}:workspace:electric`,
    schema: SiteRelatedJobElectricStandardSchema,
    shapeName: "jobs",
    shapeOptions: {
      transformer: toSiteRelatedJobElectricRow,
    },
  });
}

function createLabelsElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "labels",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "labels",
    }),
    getKey: (label: Label) => label.id,
    id: `${sitesWorkspaceCollectionId(scope)}:labels`,
    schema: LabelElectricStandardSchema,
    shapeName: "labels",
    shapeOptions: {
      transformer: toLabelElectricRow,
    },
  });
}

function joinSitesWorkspaceRows({
  activeJobSummaries,
  labels,
  siteLabelAssignments,
  sites,
}: Omit<SitesWorkspaceReadModelRows, "relatedJobs">): readonly SiteOption[] {
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const labelsBySiteId = new Map<SiteIdType, Label[]>();

  for (const assignment of siteLabelAssignments) {
    const label = labelsById.get(assignment.labelId);

    if (label === undefined) {
      continue;
    }

    const siteLabels = labelsBySiteId.get(assignment.siteId) ?? [];
    siteLabels.push(label);
    labelsBySiteId.set(assignment.siteId, siteLabels);
  }

  for (const siteLabels of labelsBySiteId.values()) {
    siteLabels.sort(compareLabels);
  }

  const summariesBySiteId = new Map(
    activeJobSummaries.map((summary) => [summary.siteId, summary])
  );

  return sites.map((site) => {
    const summary = summariesBySiteId.get(site.id);

    return {
      ...site,
      activeJobCount: summary?.activeJobCount ?? 0,
      highestActiveJobPriority: summary?.highestActiveJobPriority,
      labels: labelsBySiteId.get(site.id) ?? [],
    };
  });
}

function selectSiteRelatedJobs(
  jobs: readonly JobListItem[],
  siteId: SiteIdType
): readonly JobListItem[] {
  return jobs
    .filter((job) => job.siteId === siteId)
    .toSorted(compareRelatedJobs);
}

function toSiteOptionElectricRow(
  row: Record<string, unknown>
): SitesWorkspaceElectricRow {
  const site: Record<string, unknown> = {
    activeJobCount: 0,
    displayLocation: String(row.displayLocation ?? ""),
    hasUsableCoordinates:
      row.latitude !== null &&
      row.latitude !== undefined &&
      row.longitude !== null &&
      row.longitude !== undefined &&
      ["google_resolved", "manually_adjusted", "validated"].includes(
        String(row.locationStatus)
      ),
    id: String(row.id),
    labels: [],
    locationStatus: String(row.locationStatus),
    name: String(row.name),
  };

  addOptionalValue(site, "accessNotes", row.accessNotes);
  addOptionalValue(site, "addressComponents", row.addressComponents);
  addOptionalValue(site, "addressLine1", row.addressLine1);
  addOptionalValue(site, "addressLine2", row.addressLine2);
  addOptionalValue(site, "country", row.country);
  addOptionalValue(site, "county", row.county);
  addOptionalValue(site, "eircode", row.eircode);
  addOptionalValue(site, "formattedAddress", row.formattedAddress);
  addOptionalValue(site, "googlePlaceId", row.googlePlaceId);
  addOptionalValue(site, "latitude", row.latitude);
  addOptionalValue(site, "locationProvider", row.locationProvider);
  addOptionalValue(site, "locationResolvedAt", row.locationResolvedAt);
  addOptionalValue(site, "longitude", row.longitude);
  addOptionalValue(site, "rawLocationInput", row.rawLocationInput);
  addOptionalValue(site, "town", row.town);

  Schema.decodeUnknownSync(SiteOptionSchema)(site);

  return site as SitesWorkspaceElectricRow;
}

function toSiteLabelAssignmentElectricRow(
  row: Record<string, unknown>
): SitesWorkspaceElectricRow {
  const assignment = {
    createdAt: String(row.createdAt),
    labelId: String(row.labelId),
    organizationId: String(row.organizationId),
    siteId: String(row.siteId),
  };

  Schema.decodeUnknownSync(SiteLabelAssignmentElectricRowSchema)(assignment);

  return assignment;
}

function toSiteActiveJobSummaryElectricRow(
  row: Record<string, unknown>
): SitesWorkspaceElectricRow {
  const highestActiveJobPriority =
    row.highestActiveJobPriority === null ||
    row.highestActiveJobPriority === undefined
      ? undefined
      : (String(row.highestActiveJobPriority) as SiteActiveJobPriority);

  const summary = {
    activeJobCount: Number(row.activeJobCount ?? 0),
    ...(highestActiveJobPriority === undefined
      ? {}
      : { highestActiveJobPriority }),
    organizationId: String(row.organizationId),
    siteId: String(row.siteId),
    updatedAt: String(row.updatedAt),
  };

  Schema.decodeUnknownSync(SiteActiveJobSummaryElectricRowSchema)(summary);

  return summary;
}

function toSiteRelatedJobElectricRow(
  row: Record<string, unknown>
): SitesWorkspaceElectricRow {
  const job: Record<string, unknown> = {
    createdAt: String(row.createdAt),
    id: String(row.id),
    kind: String(row.kind),
    labels: [],
    priority: String(row.priority),
    status: String(row.status),
    title: String(row.title),
    updatedAt: String(row.updatedAt),
  };

  addOptionalValue(job, "assigneeId", row.assigneeId);
  addOptionalValue(job, "contactId", row.contactId);
  addOptionalValue(job, "coordinatorId", row.coordinatorId);
  addOptionalValue(job, "siteId", row.siteId);

  Schema.decodeUnknownSync(JobListItemSchema)(job);

  return job as SitesWorkspaceElectricRow;
}

function toLabelElectricRow(row: Record<string, unknown>) {
  return {
    createdAt: String(row.createdAt),
    id: String(row.id),
    name: String(row.name),
    updatedAt: String(row.updatedAt),
  };
}

function addOptionalValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown
) {
  if (value === null || value === undefined) {
    return;
  }

  target[key] = value;
}

function matchesSitesWorkspaceFilter(
  site: SiteOption,
  filter: SitesWorkspaceFilter
) {
  if (filter === "with-active-jobs") {
    return (site.activeJobCount ?? 0) > 0;
  }

  if (filter === "needs-location") {
    return !site.hasUsableCoordinates;
  }

  return true;
}

function matchesSitesWorkspaceQuery(site: SiteOption, query: string) {
  if (query.length === 0) {
    return true;
  }

  const searchableText = [
    site.name,
    site.displayLocation,
    site.formattedAddress,
    site.accessNotes,
    ...site.labels.map((label) => label.name),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();

  return searchableText.includes(query);
}

function compareSitesWorkspaceRows(
  left: SiteOption,
  right: SiteOption,
  sort: SitesWorkspaceSort
) {
  if (sort === "active-jobs") {
    const activeJobComparison =
      (right.activeJobCount ?? 0) - (left.activeJobCount ?? 0);

    if (activeJobComparison !== 0) {
      return activeJobComparison;
    }
  }

  if (sort === "updated") {
    const updatedAtComparison = getSiteUpdatedAt(right).localeCompare(
      getSiteUpdatedAt(left)
    );

    if (updatedAtComparison !== 0) {
      return updatedAtComparison;
    }
  }

  return compareSiteOptions(left, right);
}

function compareSiteOptions(left: SiteOption, right: SiteOption) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function compareLabels(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function compareRelatedJobs(left: JobListItem, right: JobListItem) {
  const updatedAtComparison = right.updatedAt.localeCompare(left.updatedAt);

  return updatedAtComparison === 0
    ? right.id.localeCompare(left.id)
    : updatedAtComparison;
}

function getSiteUpdatedAt(site: SiteOption) {
  return "updatedAt" in site && typeof site.updatedAt === "string"
    ? site.updatedAt
    : "";
}

function sitesWorkspaceCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:sites-workspace`;
}
