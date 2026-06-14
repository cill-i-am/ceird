import type { OrganizationId } from "@ceird/identity-core";
import { LabelId as LabelIdSchema, LabelSchema } from "@ceird/labels-core";
import type { Label } from "@ceird/labels-core";
import { SiteId as SiteIdSchema } from "@ceird/sites-core";
import type { SiteIdType as SiteId } from "@ceird/sites-core";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Effect, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql";
import type { SqlClient } from "effect/unstable/sql/SqlClient";

import type {
  DomainDrizzleDatabase,
  DomainDrizzleStorageFailure,
} from "../../platform/database/database.js";
import { label } from "../labels/schema.js";
import { site, siteLabel } from "./schema.js";

interface SiteLabelRow {
  readonly created_at: Date;
  readonly label_id: string;
  readonly name: string;
  readonly site_id: string;
  readonly updated_at: Date;
}

const decodeLabel = Schema.decodeUnknownSync(LabelSchema);
const decodeLabelId = Schema.decodeUnknownSync(LabelIdSchema);
const decodeSiteId = Schema.decodeUnknownSync(SiteIdSchema);

type RawSiteLabelsBySiteIdEffect = Effect.Effect<
  Map<SiteId, Label[]>,
  SqlError.SqlError
>;

type DrizzleSiteLabelsBySiteIdEffect = Effect.Effect<
  Map<SiteId, Label[]>,
  DomainDrizzleStorageFailure
>;

export const listSiteLabelsForSitesWithSql: (
  sql: SqlClient,
  organizationId: OrganizationId,
  siteIds: readonly SiteId[]
) => RawSiteLabelsBySiteIdEffect = Effect.fn(
  "SiteLabelQueries.listSiteLabelsForSitesWithSql"
)(function* (sql, organizationId, siteIds) {
  if (siteIds.length === 0) {
    return new Map<SiteId, Label[]>();
  }

  const rows = yield* sql<SiteLabelRow>`
    select
      site_labels.site_id,
      site_labels.label_id,
      labels.created_at,
      labels.name,
      labels.updated_at
    from site_labels
    join labels
      on labels.id = site_labels.label_id
      and labels.organization_id = site_labels.organization_id
    join sites
      on sites.id = site_labels.site_id
      and sites.organization_id = site_labels.organization_id
    where site_labels.organization_id = ${organizationId}
      and labels.organization_id = ${organizationId}
      and sites.organization_id = ${organizationId}
      and site_labels.site_id in ${sql.in(siteIds)}
      and labels.archived_at is null
    order by labels.name asc, labels.id asc
  `;

  return groupSiteLabelsBySiteId(rows);
});

export const listSiteLabelsForSitesWithDrizzle: (
  db: DomainDrizzleDatabase,
  organizationId: OrganizationId,
  siteIds: readonly SiteId[]
) => DrizzleSiteLabelsBySiteIdEffect = Effect.fn(
  "SiteLabelQueries.listSiteLabelsForSitesWithDrizzle"
)(function* (db, organizationId, siteIds) {
  if (siteIds.length === 0) {
    return new Map<SiteId, Label[]>();
  }

  const rows = yield* db
    .select({
      created_at: label.createdAt,
      label_id: siteLabel.labelId,
      name: label.name,
      site_id: siteLabel.siteId,
      updated_at: label.updatedAt,
    })
    .from(siteLabel)
    .innerJoin(
      label,
      and(
        eq(label.id, siteLabel.labelId),
        eq(label.organizationId, siteLabel.organizationId)
      )
    )
    .innerJoin(
      site,
      and(
        eq(site.id, siteLabel.siteId),
        eq(site.organizationId, siteLabel.organizationId)
      )
    )
    .where(
      and(
        eq(siteLabel.organizationId, organizationId),
        eq(label.organizationId, organizationId),
        eq(site.organizationId, organizationId),
        inArray(siteLabel.siteId, siteIds),
        isNull(label.archivedAt)
      )
    )
    .orderBy(asc(label.name), asc(label.id));

  return groupSiteLabelsBySiteId(rows);
});

export const listSiteLabelsForOrganizationWithDrizzle: (
  db: DomainDrizzleDatabase,
  organizationId: OrganizationId
) => DrizzleSiteLabelsBySiteIdEffect = Effect.fn(
  "SiteLabelQueries.listSiteLabelsForOrganizationWithDrizzle"
)(function* (db, organizationId) {
  const rows = yield* db
    .select({
      created_at: label.createdAt,
      label_id: siteLabel.labelId,
      name: label.name,
      site_id: siteLabel.siteId,
      updated_at: label.updatedAt,
    })
    .from(siteLabel)
    .innerJoin(
      label,
      and(
        eq(label.id, siteLabel.labelId),
        eq(label.organizationId, siteLabel.organizationId)
      )
    )
    .innerJoin(
      site,
      and(
        eq(site.id, siteLabel.siteId),
        eq(site.organizationId, siteLabel.organizationId)
      )
    )
    .where(
      and(
        eq(siteLabel.organizationId, organizationId),
        eq(label.organizationId, organizationId),
        eq(site.organizationId, organizationId),
        isNull(site.archivedAt),
        isNull(label.archivedAt)
      )
    )
    .orderBy(asc(siteLabel.siteId), asc(label.name), asc(label.id));

  return groupSiteLabelsBySiteId(rows);
});

function groupSiteLabelsBySiteId(rows: readonly SiteLabelRow[]) {
  const labelsBySiteId = new Map<SiteId, Label[]>();

  for (const row of rows) {
    const siteId = decodeSiteId(row.site_id);
    const labels = labelsBySiteId.get(siteId) ?? [];
    labels.push(
      decodeLabel({
        createdAt: row.created_at.toISOString(),
        id: decodeLabelId(row.label_id),
        name: row.name,
        updatedAt: row.updated_at.toISOString(),
      })
    );
    labelsBySiteId.set(siteId, labels);
  }

  return labelsBySiteId;
}
