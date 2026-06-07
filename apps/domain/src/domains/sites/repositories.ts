import { OrganizationId as OrganizationIdSchema } from "@ceird/identity-core";
/* oxlint-disable eslint/max-classes-per-file */
import type { OrganizationId } from "@ceird/identity-core";
import {
  LabelId as LabelIdSchema,
  LabelNotFoundError,
  LabelSchema,
} from "@ceird/labels-core";
import type { Label, LabelIdType as LabelId } from "@ceird/labels-core";
import type { ProximityExcludedCount } from "@ceird/proximity-core";
import {
  IsoDateTimeString as IsoDateTimeStringSchema,
  SiteId as SiteIdSchema,
  SiteListCursor as SiteListCursorSchema,
  SiteListCursorInvalidError,
  SiteListResponseSchema,
  SiteNotFoundError,
  SITE_ACTIVE_JOB_PRIORITIES,
} from "@ceird/sites-core";
import type {
  GoogleAddressComponent,
  GooglePlaceIdType,
  IsoDateTimeStringType as IsoDateTimeString,
  SiteCountry,
  SiteActiveJobPriority,
  SiteIdType as SiteId,
  SiteLatitude,
  SiteListCursorType as SiteListCursor,
  SiteListQuery,
  SiteLocationProviderType,
  SiteLocationStatusType,
  SiteLongitude,
  SiteOption,
  SiteProximityFilters,
} from "@ceird/sites-core";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Option,
  Schema,
  pipe,
} from "effect";
import { SqlClient } from "effect/unstable/sql";

import { decodeJsonCursor, encodeJsonCursor } from "../json-cursor.js";
import { generateSiteId } from "./id-generation.js";
import {
  listSiteLabelsForOrganization,
  listSiteLabelsForSites,
} from "./site-label-queries.js";
import type { SiteOptionRow } from "./site-option-row.js";
import { mapSiteOptionRow } from "./site-option-row.js";

interface IdRow {
  readonly id: string;
}

interface SiteCursorState {
  readonly id: SiteId;
  readonly name: string;
  readonly organizationId: OrganizationId;
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

interface SiteRecordBaseWriteFields {
  readonly accessNotes?: string;
  readonly name: string;
}

interface SiteLocationRecordWriteFields {
  readonly addressComponents?: readonly GoogleAddressComponent[];
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly country?: SiteCountry;
  readonly county?: string;
  readonly displayLocation: string;
  readonly eircode?: string;
  readonly formattedAddress?: string;
  readonly googlePlaceId?: GooglePlaceIdType;
  readonly latitude?: SiteLatitude;
  readonly locationProvider?: SiteLocationProviderType;
  readonly locationResolvedAt?: IsoDateTimeString;
  readonly locationStatus: SiteLocationStatusType;
  readonly longitude?: SiteLongitude;
  readonly rawLocationInput?: string;
  readonly town?: string;
}

type SiteProximityCandidateRow = SiteOptionRow;

interface SiteProximityStatsRow {
  readonly candidate_count: number;
  readonly missing_coordinates_count: number;
  readonly unmapped_site_count: number;
}

interface SiteActiveJobSummaryRow {
  readonly active_job_count: number;
  readonly highest_active_job_priority: string | null;
  readonly site_id: string;
}

export interface CreateSiteRecordInput
  extends SiteRecordBaseWriteFields, SiteLocationRecordWriteFields {
  readonly organizationId: OrganizationId;
}

export interface UpdateSiteRecordInput extends SiteRecordBaseWriteFields {
  readonly location?: SiteLocationRecordWriteFields;
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

export interface SiteProximityCandidate {
  readonly activeJobCount: number;
  readonly highestActiveJobPriority?: SiteActiveJobPriority;
  readonly site: SiteOption;
}

export interface SiteActiveJobSummary {
  readonly activeJobCount: number;
  readonly highestActiveJobPriority?: SiteActiveJobPriority;
}

export interface SiteProximityCandidateSet {
  readonly candidateCount: number;
  readonly candidateLimitApplied: boolean;
  readonly candidates: readonly SiteProximityCandidate[];
  readonly excluded: readonly ProximityExcludedCount[];
}

const PROXIMITY_CANDIDATE_LIMIT = 100;
const USABLE_SITE_LOCATION_STATUSES = [
  "google_resolved",
  "manually_adjusted",
  "validated",
] as const;

const decodeSiteId = Schema.decodeUnknownSync(SiteIdSchema);
const decodeSiteListCursor = Schema.decodeUnknownSync(SiteListCursorSchema);
const decodeSiteListResponse = Schema.decodeUnknownSync(SiteListResponseSchema);
const decodeSiteCursorState = Schema.decodeUnknownSync(
  Schema.Struct({
    id: SiteIdSchema,
    name: Schema.String,
    organizationId: OrganizationIdSchema,
  })
);
const decodeLabel = Schema.decodeUnknownSync(LabelSchema);
const decodeLabelId = Schema.decodeUnknownSync(LabelIdSchema);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(
  IsoDateTimeStringSchema
);

export class SitesRepository extends Context.Service<SitesRepository>()(
  "@ceird/domains/sites/SitesRepository",
  {
    make: Effect.gen(function* SitesRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const withTransaction = Effect.fn("SitesRepository.withTransaction")(
        <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => sql.withTransaction(effect)
      );

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

        return Option.fromNullishOr(rows[0]?.id).pipe(Option.map(decodeSiteId));
      });

      const create = Effect.fn("SitesRepository.create")(function* (
        input: CreateSiteRecordInput
      ) {
        const values = {
          ...makeSiteBaseValues(input),
          ...makeSiteLocationValues(input),
          id: generateSiteId(),
          organization_id: input.organizationId,
        };

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
        const rows = yield* sql<IdRow>`
          update sites
          set ${sql.update({
            ...makeSiteBaseValues(input),
            ...(input.location === undefined
              ? {}
              : makeSiteLocationValues(input.location)),
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
                sites.address_components,
                sites.address_line_1,
                sites.address_line_2,
                sites.country,
                sites.county,
                sites.display_location,
                sites.eircode,
                sites.formatted_address,
                sites.google_place_id,
                sites.id,
                sites.latitude,
                sites.location_provider,
                sites.location_resolved_at,
                sites.location_status,
                sites.longitude,
                sites.name,
                sites.raw_location_input,
                sites.town
              from sites
              where sites.organization_id = ${organizationId}
                and sites.archived_at is null
              order by sites.name asc nulls last, sites.id asc
            `,
            listSiteLabelsForOrganization(sql, organizationId),
          ],
          { concurrency: 2 }
        );

        return pipe(
          rows,
          Arr.map((row) => {
            const siteId = decodeSiteId(row.id);

            return mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? []);
          })
        );
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

          if (cursor.organizationId !== organizationId) {
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
            sites.address_components,
            sites.address_line_1,
            sites.address_line_2,
            sites.country,
            sites.county,
            sites.display_location,
            sites.eircode,
            sites.formatted_address,
            sites.google_place_id,
            sites.id,
            sites.latitude,
            sites.location_provider,
            sites.location_resolved_at,
            sites.location_status,
            sites.longitude,
            sites.name,
            sites.raw_location_input,
            sites.town
          from sites
          where ${sql.and(clauses)}
          order by sites.name asc nulls last, sites.id asc
          limit ${limit + 1}
        `;

        const pageRows = Arr.take(rows, limit);
        const labelsBySiteId = yield* listSiteLabelsForSites(
          sql,
          organizationId,
          pipe(
            pageRows,
            Arr.map((row) => decodeSiteId(row.id))
          )
        );
        const items = pipe(
          pageRows,
          Arr.map((row) => {
            const siteId = decodeSiteId(row.id);

            return mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? []);
          })
        );
        const nextCursorRow = rows.length > limit ? rows[limit - 1] : undefined;
        const nextCursor =
          nextCursorRow === undefined
            ? undefined
            : encodeSiteCursor(nextCursorRow, {
                organizationId,
              });

        return decodeSiteListResponse({ items, nextCursor });
      });

      const getOptionById = Effect.fn("SitesRepository.getOptionById")(
        function* (organizationId: OrganizationId, siteId: SiteId) {
          const rows = yield* sql<SiteOptionRow>`
            select
              sites.access_notes,
              sites.address_components,
              sites.address_line_1,
              sites.address_line_2,
              sites.country,
              sites.county,
              sites.display_location,
              sites.eircode,
              sites.formatted_address,
              sites.google_place_id,
              sites.id,
              sites.latitude,
              sites.location_provider,
              sites.location_resolved_at,
              sites.location_status,
              sites.longitude,
              sites.name,
              sites.raw_location_input,
              sites.town
            from sites
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

      const getActiveJobSummary = Effect.fn(
        "SitesRepository.getActiveJobSummary"
      )(function* (organizationId: OrganizationId, siteId: SiteId) {
        const rows = yield* sql<{
          readonly active_job_count: number;
          readonly highest_active_job_priority: string | null;
        }>`
          select
            count(*)::integer as active_job_count,
            case max(
              case work_items.priority
                when 'urgent' then 4
                when 'high' then 3
                when 'medium' then 2
                when 'low' then 1
                else 0
              end
            )
              when 4 then 'urgent'
              when 3 then 'high'
              when 2 then 'medium'
              when 1 then 'low'
              when 0 then case when count(*) > 0 then 'none' else null end
              else null
            end as highest_active_job_priority
          from work_items
          where work_items.organization_id = ${organizationId}
            and work_items.site_id = ${siteId}
            and work_items.status not in ('completed', 'canceled')
        `;
        const [row] = rows;

        return {
          activeJobCount: row?.active_job_count ?? 0,
          highestActiveJobPriority: mapHighestActiveJobPriority(
            row?.highest_active_job_priority ?? null
          ),
        } satisfies SiteActiveJobSummary;
      });

      const listProximityCandidates = Effect.fn(
        "SitesRepository.listProximityCandidates"
      )(function* (
        organizationId: OrganizationId,
        filters: SiteProximityFilters
      ) {
        const clauses = [
          sql`sites.organization_id = ${organizationId}`,
          sql`sites.archived_at is null`,
        ];

        if (filters.query !== undefined) {
          const queryPattern = `%${filters.query}%`;
          clauses.push(sql`
            concat_ws(
              ' ',
              sites.name,
              coalesce(
                nullif(
                  concat_ws(
                    ', ',
                    nullif(concat_ws(', ', sites.address_line_1, sites.address_line_2), ''),
                    nullif(concat_ws(', ', sites.town, sites.county, sites.eircode), '')
                  ),
                  ''
                ),
                nullif(sites.display_location, ''),
                nullif(sites.formatted_address, ''),
                nullif(sites.raw_location_input, ''),
                'No address'
              )
            ) ilike ${queryPattern}
          `);
        }

        const routeableSiteClause = sql`
          sites.location_status in ${sql.in(USABLE_SITE_LOCATION_STATUSES)}
          and sites.latitude is not null
          and sites.longitude is not null
        `;
        const statsRows = yield* sql<SiteProximityStatsRow>`
          select
            count(*) filter (where ${routeableSiteClause})::integer as candidate_count,
            count(*) filter (
              where sites.location_status not in ${sql.in(USABLE_SITE_LOCATION_STATUSES)}
            )::integer as unmapped_site_count,
            count(*) filter (
              where sites.location_status in ${sql.in(USABLE_SITE_LOCATION_STATUSES)}
                and (sites.latitude is null or sites.longitude is null)
            )::integer as missing_coordinates_count
          from sites
          where ${sql.and(clauses)}
        `;
        const stats = statsRows[0] ?? {
          candidate_count: 0,
          missing_coordinates_count: 0,
          unmapped_site_count: 0,
        };
        const rows = yield* sql<SiteProximityCandidateRow>`
          select
            sites.access_notes,
            sites.address_components,
            sites.address_line_1,
            sites.address_line_2,
            sites.country,
            sites.county,
            sites.display_location,
            sites.eircode,
            sites.formatted_address,
            sites.google_place_id,
            sites.id,
            sites.latitude,
            sites.location_provider,
            sites.location_resolved_at,
            sites.location_status,
            sites.longitude,
            sites.name,
            sites.raw_location_input,
            sites.town
          from sites
          where ${sql.and([...clauses, routeableSiteClause])}
          order by sites.updated_at desc, sites.id desc
          limit ${PROXIMITY_CANDIDATE_LIMIT + 1}
        `;
        const pageRows = Arr.take(rows, PROXIMITY_CANDIDATE_LIMIT);
        const siteIds = pageRows.map((row) => decodeSiteId(row.id));
        const activeJobSummariesBySiteId =
          yield* listActiveJobSummariesForSites(sql, organizationId, siteIds);
        const labelsBySiteId = yield* listSiteLabelsForSites(
          sql,
          organizationId,
          siteIds
        );
        const excluded = new Map<ProximityExcludedCount["reason"], number>();
        addExcluded(excluded, "unmapped_site", stats.unmapped_site_count);
        addExcluded(
          excluded,
          "missing_coordinates",
          stats.missing_coordinates_count
        );
        const candidates: SiteProximityCandidate[] = [];

        for (const row of pageRows) {
          const siteId = decodeSiteId(row.id);
          const site = mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? []);
          const activeJobSummary = activeJobSummariesBySiteId.get(siteId);

          candidates.push({
            activeJobCount: activeJobSummary?.activeJobCount ?? 0,
            highestActiveJobPriority:
              activeJobSummary?.highestActiveJobPriority,
            site,
          });
        }

        return {
          candidateCount: stats.candidate_count,
          candidateLimitApplied:
            stats.candidate_count > PROXIMITY_CANDIDATE_LIMIT,
          candidates,
          excluded: [...excluded.entries()].map(([reason, count]) => ({
            count,
            reason,
          })),
        } satisfies SiteProximityCandidateSet;
      });

      return {
        create,
        findById,
        getActiveJobSummary,
        getOptionById,
        list,
        listProximityCandidates,
        listOptions,
        update,
        withTransaction,
      };
    }),
  }
) {
  static readonly create = (
    ...args: Parameters<Context.Service.Shape<typeof SitesRepository>["create"]>
  ) => SitesRepository.use((service) => service.create(...args));
  static readonly findById = (
    ...args: Parameters<
      Context.Service.Shape<typeof SitesRepository>["findById"]
    >
  ) => SitesRepository.use((service) => service.findById(...args));
  static readonly getOptionById = (
    ...args: Parameters<
      Context.Service.Shape<typeof SitesRepository>["getOptionById"]
    >
  ) => SitesRepository.use((service) => service.getOptionById(...args));
  static readonly getActiveJobSummary = (
    ...args: Parameters<
      Context.Service.Shape<typeof SitesRepository>["getActiveJobSummary"]
    >
  ) => SitesRepository.use((service) => service.getActiveJobSummary(...args));
  static readonly list = (
    ...args: Parameters<Context.Service.Shape<typeof SitesRepository>["list"]>
  ) => SitesRepository.use((service) => service.list(...args));
  static readonly listProximityCandidates = (
    ...args: Parameters<
      Context.Service.Shape<typeof SitesRepository>["listProximityCandidates"]
    >
  ) =>
    SitesRepository.use((service) => service.listProximityCandidates(...args));
  static readonly listOptions = (
    ...args: Parameters<
      Context.Service.Shape<typeof SitesRepository>["listOptions"]
    >
  ) => SitesRepository.use((service) => service.listOptions(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    SitesRepository,
    SitesRepository.make
  );
  static readonly Default = SitesRepository.DefaultWithoutDependencies;
}

export class SiteLabelAssignmentsRepository extends Context.Service<SiteLabelAssignmentsRepository>()(
  "@ceird/domains/sites/SiteLabelAssignmentsRepository",
  {
    make: Effect.gen(function* SiteLabelAssignmentsRepositoryLive() {
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
) {
  static readonly assignToSite = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof SiteLabelAssignmentsRepository
      >["assignToSite"]
    >
  ) =>
    SiteLabelAssignmentsRepository.use((service) =>
      service.assignToSite(...args)
    );
  static readonly removeFromSite = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof SiteLabelAssignmentsRepository
      >["removeFromSite"]
    >
  ) =>
    SiteLabelAssignmentsRepository.use((service) =>
      service.removeFromSite(...args)
    );
  static readonly DefaultWithoutDependencies = Layer.effect(
    SiteLabelAssignmentsRepository,
    SiteLabelAssignmentsRepository.make
  );
  static readonly Default =
    SiteLabelAssignmentsRepository.DefaultWithoutDependencies;
}

function makeSiteBaseValues(input: SiteRecordBaseWriteFields) {
  return {
    access_notes: input.accessNotes ?? null,
    name: input.name,
  };
}

function makeSiteLocationValues(input: SiteLocationRecordWriteFields) {
  return {
    address_components: input.addressComponents ?? null,
    address_line_1: input.addressLine1 ?? null,
    address_line_2: input.addressLine2 ?? null,
    country: input.country ?? null,
    county: input.county ?? null,
    display_location: input.displayLocation,
    eircode: input.eircode ?? null,
    formatted_address: input.formattedAddress ?? null,
    google_place_id: input.googlePlaceId ?? null,
    latitude: input.latitude ?? null,
    location_provider: input.locationProvider ?? null,
    location_resolved_at:
      input.locationResolvedAt === undefined
        ? null
        : isoDateTimeStringToDate(input.locationResolvedAt),
    location_status: input.locationStatus,
    longitude: input.longitude ?? null,
    raw_location_input: input.rawLocationInput ?? null,
    town: input.town ?? null,
  };
}

function encodeSiteCursor(
  row: Pick<SiteOptionRow, "id" | "name">,
  state: Pick<SiteCursorState, "organizationId">
) {
  return encodeJsonCursor(
    {
      id: decodeSiteId(row.id),
      name: row.name,
      organizationId: state.organizationId,
    } satisfies SiteCursorState,
    decodeSiteListCursor
  );
}

function decodeSiteCursor(cursor: SiteListCursor): {
  readonly id: SiteId;
  readonly name: string;
  readonly organizationId: OrganizationId;
} {
  const value = decodeJsonCursor(cursor, decodeSiteCursorState);

  return {
    id: value.id,
    name: value.name,
    organizationId: value.organizationId,
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

function mapHighestActiveJobPriority(
  value: string | null
): SiteActiveJobPriority | undefined {
  return SITE_ACTIVE_JOB_PRIORITIES.includes(value as SiteActiveJobPriority)
    ? (value as SiteActiveJobPriority)
    : undefined;
}

function addExcluded(
  excluded: Map<ProximityExcludedCount["reason"], number>,
  reason: ProximityExcludedCount["reason"],
  count: number
) {
  if (count <= 0) {
    return;
  }

  excluded.set(reason, (excluded.get(reason) ?? 0) + count);
}

function listActiveJobSummariesForSites(
  sql: SqlClient.SqlClient,
  organizationId: OrganizationId,
  siteIds: readonly SiteId[]
) {
  if (siteIds.length === 0) {
    return Effect.succeed(new Map<SiteId, SiteActiveJobSummary>());
  }

  return Effect.gen(function* () {
    const rows = yield* sql<SiteActiveJobSummaryRow>`
      select
        work_items.site_id,
        count(*)::integer as active_job_count,
        case max(
          case work_items.priority
            when 'urgent' then 4
            when 'high' then 3
            when 'medium' then 2
            when 'low' then 1
            else 0
          end
        )
          when 4 then 'urgent'
          when 3 then 'high'
          when 2 then 'medium'
          when 1 then 'low'
          when 0 then case when count(*) > 0 then 'none' else null end
          else null
        end as highest_active_job_priority
      from work_items
      where work_items.organization_id = ${organizationId}
        and work_items.site_id in ${sql.in(siteIds)}
        and work_items.status not in ('completed', 'canceled')
      group by work_items.site_id
    `;
    const summaries = new Map<SiteId, SiteActiveJobSummary>();

    for (const row of rows) {
      const siteId = decodeSiteId(row.site_id);
      summaries.set(siteId, {
        activeJobCount: row.active_job_count,
        highestActiveJobPriority: mapHighestActiveJobPriority(
          row.highest_active_job_priority
        ),
      });
    }

    return summaries;
  });
}

function isoDateTimeStringToDate(value: IsoDateTimeString): Date {
  return new Date(decodeIsoDateTimeString(value));
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
