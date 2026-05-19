import type { OrganizationId } from "@ceird/identity-core";
import { LabelId as LabelIdSchema, LabelSchema } from "@ceird/labels-core";
import type { Label } from "@ceird/labels-core";
import { SiteId as SiteIdSchema } from "@ceird/sites-core";
import type { SiteIdType as SiteId } from "@ceird/sites-core";
import type { SqlError } from "@effect/sql";
import type { SqlClient } from "@effect/sql/SqlClient";
import { Effect, Schema } from "effect";

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

type SiteLabelsBySiteIdEffect = Effect.Effect<
  Map<SiteId, Label[]>,
  SqlError.SqlError
>;

export const listSiteLabelsForSites: (
  sql: SqlClient,
  organizationId: OrganizationId,
  siteIds: readonly SiteId[]
) => SiteLabelsBySiteIdEffect = Effect.fn(
  "SiteLabelQueries.listSiteLabelsForSites"
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
    join labels on labels.id = site_labels.label_id
    join sites on sites.id = site_labels.site_id
    where site_labels.organization_id = ${organizationId}
      and labels.organization_id = ${organizationId}
      and sites.organization_id = ${organizationId}
      and site_labels.site_id in ${sql.in(siteIds)}
      and labels.archived_at is null
    order by labels.name asc, labels.id asc
  `;

  return groupSiteLabelsBySiteId(rows);
});

export const listSiteLabelsForOrganization: (
  sql: SqlClient,
  organizationId: OrganizationId
) => SiteLabelsBySiteIdEffect = Effect.fn(
  "SiteLabelQueries.listSiteLabelsForOrganization"
)(function* (sql, organizationId) {
  const rows = yield* sql<SiteLabelRow>`
    select
      site_labels.site_id,
      site_labels.label_id,
      labels.created_at,
      labels.name,
      labels.updated_at
    from site_labels
    join labels on labels.id = site_labels.label_id
    join sites on sites.id = site_labels.site_id
    where site_labels.organization_id = ${organizationId}
      and labels.organization_id = ${organizationId}
      and sites.organization_id = ${organizationId}
      and sites.archived_at is null
      and labels.archived_at is null
    order by site_labels.site_id asc, labels.name asc, labels.id asc
  `;

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
