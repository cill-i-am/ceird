import type { OrganizationId } from "@ceird/identity-core";
import {
  IsoDateTimeString as IsoDateTimeStringSchema,
  ServiceAreaNotFoundError,
  SiteId as SiteIdSchema,
  SiteOptionSchema,
} from "@ceird/sites-core";
import type {
  IsoDateTimeStringType as IsoDateTimeString,
  ServiceAreaIdType as ServiceAreaId,
  SiteCountry,
  SiteGeocodingProvider,
  SiteIdType as SiteId,
  SiteOption,
} from "@ceird/sites-core";
import { SqlClient } from "@effect/sql";
import { Effect, Option, Schema } from "effect";

import { generateSiteId } from "./id-generation.js";
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

const decodeSiteId = Schema.decodeUnknownSync(SiteIdSchema);
const decodeSiteOption = Schema.decodeUnknownSync(SiteOptionSchema);
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
            and sites.archived_at is null
          order by sites.name asc nulls last, sites.created_at asc, sites.id asc
        `;

        return rows.map(mapSiteOptionRow);
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

          return Option.fromNullable(rows[0]).pipe(
            Option.map(mapSiteOptionRow)
          );
        }
      );

      return {
        create,
        ensureServiceAreaInOrganization,
        findById,
        getOptionById,
        listOptions,
        update,
        withTransaction,
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

function mapSiteOptionRow(row: SiteOptionRow): SiteOption {
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
    name: row.name,
    serviceAreaId: nullableToUndefined(row.service_area_id),
    serviceAreaName: nullableToUndefined(row.service_area_name),
    town: nullableToUndefined(row.town),
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
