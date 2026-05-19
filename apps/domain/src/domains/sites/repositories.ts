/* oxlint-disable eslint/max-classes-per-file */

import { OrganizationId as OrganizationIdSchema } from "@ceird/identity-core";
import type { OrganizationId } from "@ceird/identity-core";
import {
  LabelId as LabelIdSchema,
  LabelNotFoundError,
  LabelSchema,
} from "@ceird/labels-core";
import type { Label, LabelIdType as LabelId } from "@ceird/labels-core";
import {
  IsoDateTimeString as IsoDateTimeStringSchema,
  ServiceAreaId as ServiceAreaIdSchema,
  ServiceAreaNotFoundError,
  SiteId as SiteIdSchema,
  SiteListCursor as SiteListCursorSchema,
  SiteListCursorInvalidError,
  SiteListResponseSchema,
  SiteNotFoundError,
  SiteOptionSchema,
} from "@ceird/sites-core";
import type {
  IsoDateTimeStringType as IsoDateTimeString,
  ServiceAreaIdType as ServiceAreaId,
  SiteCountry,
  SiteGeocodingProvider,
  SiteIdType as SiteId,
  SiteListCursorType as SiteListCursor,
  SiteListQuery,
  SiteOption,
} from "@ceird/sites-core";
import { SqlClient } from "@effect/sql";
import { Effect, Option, Schema } from "effect";

import { decodeJsonCursor, encodeJsonCursor } from "../json-cursor.js";
import { generateSiteId } from "./id-generation.js";
import {
  listSiteLabelsForOrganization,
  listSiteLabelsForSites,
} from "./site-label-queries.js";
export { ServiceAreasRepository } from "./service-areas-repository.js";

interface IdRow {
  readonly id: string;
}

interface SiteOptionRow {
  readonly access_notes: string | null;
  readonly address_line_1: string;
  readonly address_line_2: string | null;
  readonly country: string;
  readonly county: string;
  readonly eircode: string | null;
  readonly geocoded_at: Date;
  readonly geocoding_provider: string;
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly service_area_id: string | null;
  readonly service_area_name: string | null;
  readonly town: string | null;
}

interface SiteCursorState {
  readonly id: SiteId;
  readonly name: string;
  readonly organizationId: OrganizationId;
  readonly serviceAreaId?: ServiceAreaId | undefined;
}

interface LabelRow {
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly organization_id: string;
  readonly updated_at: Date;
}

interface LabelAssignmentRow extends LabelRow {
  readonly inserted_count: number;
  readonly site_id: string | null;
}

interface LabelRemovalRow extends LabelRow {
  readonly deleted_count: number;
  readonly site_id: string | null;
}

export interface CreateSiteRecordInput {
  readonly accessNotes?: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly country: SiteCountry;
  readonly county: string;
  readonly eircode?: string;
  readonly geocodedAt: IsoDateTimeString;
  readonly geocodingProvider: SiteGeocodingProvider;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly organizationId: OrganizationId;
  readonly serviceAreaId?: ServiceAreaId;
  readonly town?: string;
}

export interface UpdateSiteRecordInput {
  readonly accessNotes?: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly country: SiteCountry;
  readonly county: string;
  readonly eircode?: string;
  readonly geocodedAt: IsoDateTimeString;
  readonly geocodingProvider: SiteGeocodingProvider;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly serviceAreaId?: ServiceAreaId;
  readonly town?: string;
}

export interface AssignSiteLabelRecordInput {
  readonly labelId: LabelId;
  readonly organizationId: OrganizationId;
  readonly siteId: SiteId;
}

export interface SiteLabelAssignmentResult {
  readonly changed: boolean;
  readonly label: Label;
}

const decodeSiteId = Schema.decodeUnknownSync(SiteIdSchema);
const decodeSiteListCursor = Schema.decodeUnknownSync(SiteListCursorSchema);
const decodeSiteListResponse = Schema.decodeUnknownSync(SiteListResponseSchema);
const decodeSiteOption = Schema.decodeUnknownSync(SiteOptionSchema);
const decodeSiteCursorState = Schema.decodeUnknownSync(
  Schema.Struct({
    id: SiteIdSchema,
    name: Schema.String,
    organizationId: OrganizationIdSchema,
    serviceAreaId: Schema.optional(ServiceAreaIdSchema),
  })
);
const decodeLabel = Schema.decodeUnknownSync(LabelSchema);
const decodeLabelId = Schema.decodeUnknownSync(LabelIdSchema);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(
  IsoDateTimeStringSchema
);

export class SitesRepository extends Effect.Service<SitesRepository>()(
  "@ceird/domains/sites/SitesRepository",
  {
    accessors: true,
    effect: Effect.gen(function* SitesRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const withTransaction = Effect.fn("SitesRepository.withTransaction")(
        <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => sql.withTransaction(effect)
      );

      const ensureServiceAreaInOrganization = Effect.fn(
        "SitesRepository.ensureServiceAreaInOrganization"
      )(function* (
        organizationId: OrganizationId,
        serviceAreaId: ServiceAreaId
      ) {
        const rows = yield* sql<IdRow>`
          select id
          from service_areas
          where organization_id = ${organizationId}
            and id = ${serviceAreaId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new ServiceAreaNotFoundError({
              message: "Service area does not exist in the organization",
              organizationId,
              serviceAreaId,
            })
          );
        }

        return serviceAreaId;
      });

      const findById = Effect.fn("SitesRepository.findById")(function* (
        organizationId: OrganizationId,
        siteId: SiteId
      ) {
        const rows = yield* sql<IdRow>`
          select id
          from sites
          where organization_id = ${organizationId}
            and id = ${siteId}
            and archived_at is null
          limit 1
        `;

        return Option.fromNullable(rows[0]?.id).pipe(Option.map(decodeSiteId));
      });

      const create = Effect.fn("SitesRepository.create")(function* (
        input: CreateSiteRecordInput
      ) {
        if (input.serviceAreaId !== undefined) {
          yield* ensureServiceAreaInOrganization(
            input.organizationId,
            input.serviceAreaId
          );
        }

        const values = makeSiteValues(input, {
          id: generateSiteId(),
          organization_id: input.organizationId,
        });

        const rows = yield* sql<IdRow>`
          insert into sites ${sql.insert(values).returning("id")}
        `;

        const row = yield* getRequiredRow(rows, "inserted site id");

        return decodeSiteId(row.id);
      });

      const update = Effect.fn("SitesRepository.update")(function* (
        organizationId: OrganizationId,
        siteId: SiteId,
        input: UpdateSiteRecordInput
      ) {
        if (input.serviceAreaId !== undefined) {
          yield* ensureServiceAreaInOrganization(
            organizationId,
            input.serviceAreaId
          );
        }

        const rows = yield* sql<IdRow>`
          update sites
          set ${sql.update({
            ...makeSiteValues(input, {}),
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${siteId}
            and archived_at is null
          returning id
        `;

        if (rows[0] === undefined) {
          return Option.none<SiteOption>();
        }

        return yield* getOptionById(organizationId, siteId);
      });

      const listOptions = Effect.fn("SitesRepository.listOptions")(function* (
        organizationId: OrganizationId
      ) {
        const [rows, labelsBySiteId] = yield* Effect.all(
          [
            sql<SiteOptionRow>`
              select
                sites.access_notes,
                sites.address_line_1,
                sites.address_line_2,
                sites.country,
                sites.county,
                sites.eircode,
                sites.geocoded_at,
                sites.geocoding_provider,
                sites.id,
                sites.latitude,
                sites.longitude,
                sites.name,
                service_areas.id as service_area_id,
                service_areas.name as service_area_name,
                sites.town
              from sites
              left join service_areas on service_areas.id = sites.service_area_id
              where sites.organization_id = ${organizationId}
                and sites.archived_at is null
              order by sites.name asc nulls last, sites.id asc
            `,
            listSiteLabelsForOrganization(sql, organizationId),
          ],
          { concurrency: 2 }
        );

        return rows.map((row) => {
          const siteId = decodeSiteId(row.id);

          return mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? []);
        });
      });

      const list = Effect.fn("SitesRepository.list")(function* (
        organizationId: OrganizationId,
        query: SiteListQuery
      ) {
        const limit = clampSiteListLimit(query.limit ?? 50);
        const clauses = [
          sql`sites.organization_id = ${organizationId}`,
          sql`sites.archived_at is null`,
        ];

        if (query.serviceAreaId !== undefined) {
          clauses.push(sql`sites.service_area_id = ${query.serviceAreaId}`);
        }

        if (query.cursor !== undefined) {
          const encodedCursor = query.cursor;
          const cursor = yield* Effect.try({
            try: () => decodeSiteCursor(encodedCursor),
            catch: () =>
              new SiteListCursorInvalidError({
                cursor: encodedCursor,
                message: "Site list cursor is invalid",
              }),
          });

          if (
            cursor.organizationId !== organizationId ||
            cursor.serviceAreaId !== query.serviceAreaId
          ) {
            return yield* Effect.fail(
              new SiteListCursorInvalidError({
                cursor: encodedCursor,
                message: "Site list cursor does not match the requested scope",
              })
            );
          }

          clauses.push(
            sql`(
              sites.name > ${cursor.name}
              or (
                sites.name = ${cursor.name}
                and sites.id > ${cursor.id}
              )
            )`
          );
        }

        const rows = yield* sql<SiteOptionRow>`
          select
            sites.access_notes,
            sites.address_line_1,
            sites.address_line_2,
            sites.country,
            sites.county,
            sites.eircode,
            sites.geocoded_at,
            sites.geocoding_provider,
            sites.id,
            sites.latitude,
            sites.longitude,
            sites.name,
            service_areas.id as service_area_id,
            service_areas.name as service_area_name,
            sites.town
          from sites
          left join service_areas on service_areas.id = sites.service_area_id
          where ${sql.and(clauses)}
          order by sites.name asc nulls last, sites.id asc
          limit ${limit + 1}
        `;

        const pageRows = rows.slice(0, limit);
        const labelsBySiteId = yield* listSiteLabelsForSites(
          sql,
          organizationId,
          pageRows.map((row) => decodeSiteId(row.id))
        );
        const items = pageRows.map((row) => {
          const siteId = decodeSiteId(row.id);

          return mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? []);
        });
        const nextCursorRow = rows.length > limit ? rows[limit - 1] : undefined;
        const nextCursor =
          nextCursorRow === undefined
            ? undefined
            : encodeSiteCursor(nextCursorRow, {
                organizationId,
                serviceAreaId: query.serviceAreaId,
              });

        return decodeSiteListResponse({ items, nextCursor });
      });

      const getOptionById = Effect.fn("SitesRepository.getOptionById")(
        function* (organizationId: OrganizationId, siteId: SiteId) {
          const rows = yield* sql<SiteOptionRow>`
            select
              sites.access_notes,
              sites.address_line_1,
              sites.address_line_2,
              sites.country,
              sites.county,
              sites.eircode,
              sites.geocoded_at,
              sites.geocoding_provider,
              sites.id,
              sites.latitude,
              sites.longitude,
              sites.name,
              service_areas.id as service_area_id,
              service_areas.name as service_area_name,
              sites.town
            from sites
            left join service_areas on service_areas.id = sites.service_area_id
            where sites.organization_id = ${organizationId}
              and sites.id = ${siteId}
              and sites.archived_at is null
            limit 1
          `;

          const [row] = rows;

          if (row === undefined) {
            return Option.none<SiteOption>();
          }

          const labelsBySiteId = yield* listSiteLabelsForSites(
            sql,
            organizationId,
            [siteId]
          );

          return Option.some(
            mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? [])
          );
        }
      );

      return {
        create,
        ensureServiceAreaInOrganization,
        findById,
        getOptionById,
        list,
        listOptions,
        update,
        withTransaction,
      };
    }),
  }
) {}

export class SiteLabelAssignmentsRepository extends Effect.Service<SiteLabelAssignmentsRepository>()(
  "@ceird/domains/sites/SiteLabelAssignmentsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* SiteLabelAssignmentsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const ensureSiteInOrganization = Effect.fn(
        "SiteLabelAssignmentsRepository.ensureSiteInOrganization"
      )(function* (organizationId: OrganizationId, siteId: SiteId) {
        const rows = yield* sql<IdRow>`
          select id
          from sites
          where organization_id = ${organizationId}
            and id = ${siteId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new SiteNotFoundError({
              message: "Site does not exist in the organization",
              siteId,
            })
          );
        }

        return siteId;
      });

      const assignToSite = Effect.fn(
        "SiteLabelAssignmentsRepository.assignToSite"
      )(function* (input: AssignSiteLabelRecordInput) {
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", input.siteId);
        yield* Effect.annotateCurrentSpan("labelId", input.labelId);

        const rows = yield* sql<LabelAssignmentRow>`
          with active_label as (
            select *
            from labels
            where organization_id = ${input.organizationId}
              and id = ${input.labelId}
              and archived_at is null
            for share
          ),
          organization_site as (
            select id
            from sites
            where organization_id = ${input.organizationId}
              and id = ${input.siteId}
              and archived_at is null
          ),
          inserted_label as (
            insert into site_labels (
              site_id,
              label_id,
              organization_id
            )
            select
              organization_site.id,
              active_label.id,
              active_label.organization_id
            from active_label
            join organization_site on true
            on conflict do nothing
            returning label_id
          )
          select
            active_label.*,
            organization_site.id as site_id,
            (select count(*) from inserted_label)::integer as inserted_count
          from active_label
          left join organization_site on true
          limit 1
        `;

        const [row] = rows;

        if (row === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId: input.labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        if (row.site_id === null) {
          yield* ensureSiteInOrganization(input.organizationId, input.siteId);
        }

        return {
          changed: row.inserted_count > 0,
          label: mapLabelRow(row),
        };
      });

      const removeFromSite = Effect.fn(
        "SiteLabelAssignmentsRepository.removeFromSite"
      )(function* (input: AssignSiteLabelRecordInput) {
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", input.siteId);
        yield* Effect.annotateCurrentSpan("labelId", input.labelId);

        const rows = yield* sql<LabelRemovalRow>`
          with active_label as (
            select *
            from labels
            where organization_id = ${input.organizationId}
              and id = ${input.labelId}
              and archived_at is null
            for share
          ),
          organization_site as (
            select id
            from sites
            where organization_id = ${input.organizationId}
              and id = ${input.siteId}
              and archived_at is null
          ),
          deleted_label as (
            delete from site_labels
            using active_label, organization_site
            where site_labels.organization_id = ${input.organizationId}
              and site_labels.label_id = active_label.id
              and site_labels.site_id = organization_site.id
            returning site_labels.label_id
          )
          select
            active_label.*,
            organization_site.id as site_id,
            (select count(*) from deleted_label)::integer as deleted_count
          from active_label
          left join organization_site on true
          limit 1
        `;

        const [row] = rows;

        if (row === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId: input.labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        if (row.site_id === null) {
          yield* ensureSiteInOrganization(input.organizationId, input.siteId);
        }

        return {
          changed: row.deleted_count > 0,
          label: mapLabelRow(row),
        };
      });

      return {
        assignToSite,
        removeFromSite,
      };
    }),
  }
) {}

function makeSiteValues(
  input: CreateSiteRecordInput | UpdateSiteRecordInput,
  base: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...base,
    access_notes: input.accessNotes ?? null,
    address_line_1: input.addressLine1,
    address_line_2: input.addressLine2 ?? null,
    country: input.country,
    county: input.county,
    eircode: input.eircode ?? null,
    geocoded_at: isoDateTimeStringToDate(input.geocodedAt),
    geocoding_provider: input.geocodingProvider,
    latitude: input.latitude,
    longitude: input.longitude,
    name: input.name,
    service_area_id: input.serviceAreaId ?? null,
    town: input.town ?? null,
  };
}

function mapSiteOptionRow(
  row: SiteOptionRow,
  labels: readonly Label[] = []
): SiteOption {
  return decodeSiteOption({
    accessNotes: nullableToUndefined(row.access_notes),
    addressLine1: row.address_line_1,
    addressLine2: nullableToUndefined(row.address_line_2),
    country: row.country,
    county: row.county,
    eircode: nullableToUndefined(row.eircode),
    geocodedAt: row.geocoded_at.toISOString(),
    geocodingProvider: row.geocoding_provider,
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    labels,
    name: row.name,
    serviceAreaId: nullableToUndefined(row.service_area_id),
    serviceAreaName: nullableToUndefined(row.service_area_name),
    town: nullableToUndefined(row.town),
  });
}

function encodeSiteCursor(
  row: Pick<SiteOptionRow, "id" | "name">,
  state: Pick<SiteCursorState, "organizationId" | "serviceAreaId">
) {
  return encodeJsonCursor(
    {
      id: decodeSiteId(row.id),
      name: row.name,
      organizationId: state.organizationId,
      serviceAreaId: state.serviceAreaId,
    } satisfies SiteCursorState,
    decodeSiteListCursor
  );
}

function decodeSiteCursor(cursor: SiteListCursor): {
  readonly id: SiteId;
  readonly name: string;
  readonly organizationId: OrganizationId;
  readonly serviceAreaId?: ServiceAreaId | undefined;
} {
  const value = decodeJsonCursor(cursor, decodeSiteCursorState);

  return {
    id: value.id,
    name: value.name,
    organizationId: value.organizationId,
    serviceAreaId: value.serviceAreaId,
  };
}

function mapLabelRow(row: LabelRow): Label {
  return decodeLabel({
    createdAt: row.created_at.toISOString(),
    id: decodeLabelId(row.id),
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
  });
}

function isoDateTimeStringToDate(value: IsoDateTimeString): Date {
  return new Date(decodeIsoDateTimeString(value));
}

function nullableToUndefined<Value>(value: Value | null): Value | undefined {
  return value === null ? undefined : value;
}

function getRequiredRow<Value>(
  rows: readonly Value[],
  label: string
): Effect.Effect<Value> {
  const [row] = rows;

  if (row === undefined) {
    return Effect.die(new Error(`Expected ${label} row to be returned`));
  }

  return Effect.succeed(row);
}

function clampSiteListLimit(limit: number): number {
  return Math.min(100, Math.max(1, limit));
}
