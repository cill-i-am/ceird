import type { OrganizationId } from "@ceird/identity-core";
import {
  ServiceAreaNotFoundError,
  ServiceAreaOptionSchema,
  ServiceAreaSchema,
} from "@ceird/sites-core";
import type {
  ServiceArea,
  ServiceAreaIdType as ServiceAreaId,
  ServiceAreaOption,
} from "@ceird/sites-core";
import { SqlClient } from "@effect/sql";
import { Effect, Schema } from "effect";

import { generateServiceAreaId } from "./id-generation.js";

interface ServiceAreaRow {
  readonly description: string | null;
  readonly id: string;
  readonly name: string;
}

interface ServiceAreaOptionRow {
  readonly id: string;
  readonly name: string;
}

export interface CreateServiceAreaRecordInput {
  readonly description?: string;
  readonly name: string;
  readonly organizationId: OrganizationId;
}

export interface UpdateServiceAreaRecordInput {
  readonly description?: string | null;
  readonly name?: string;
}

const decodeServiceArea = Schema.decodeUnknownSync(ServiceAreaSchema);
const decodeServiceAreaOption = Schema.decodeUnknownSync(
  ServiceAreaOptionSchema
);

export class ServiceAreasRepository extends Effect.Service<ServiceAreasRepository>()(
  "@ceird/domains/sites/ServiceAreasRepository",
  {
    accessors: true,
    effect: Effect.gen(function* ServiceAreasRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const list = Effect.fn("ServiceAreasRepository.list")(function* (
        organizationId: OrganizationId
      ) {
        const rows = yield* sql<ServiceAreaRow>`
          select id, name, description
          from service_areas
          where organization_id = ${organizationId}
            and archived_at is null
          order by name asc, id asc
        `;

        return rows.map(mapServiceAreaRow);
      });

      const listOptions = Effect.fn("ServiceAreasRepository.listOptions")(
        function* (organizationId: OrganizationId) {
          const rows = yield* sql<ServiceAreaOptionRow>`
            select id, name
            from service_areas
            where organization_id = ${organizationId}
              and archived_at is null
            order by name asc, id asc
          `;

          return rows.map(mapServiceAreaOptionRow);
        }
      );

      const create = Effect.fn("ServiceAreasRepository.create")(function* (
        input: CreateServiceAreaRecordInput
      ) {
        const rows = yield* sql<ServiceAreaRow>`
          insert into service_areas ${sql
            .insert({
              description: input.description ?? null,
              id: generateServiceAreaId(),
              name: input.name,
              organization_id: input.organizationId,
              slug: slugifyName(input.name),
            })
            .returning("*")}
        `;

        const row = yield* getRequiredRow(rows, "inserted service area");

        return mapServiceAreaRow(row);
      });

      const update = Effect.fn("ServiceAreasRepository.update")(function* (
        organizationId: OrganizationId,
        serviceAreaId: ServiceAreaId,
        input: UpdateServiceAreaRecordInput
      ) {
        const values: Record<string, unknown> = {
          updated_at: new Date(),
        };

        if (input.name !== undefined) {
          values.name = input.name;
          values.slug = slugifyName(input.name);
        }

        if (input.description !== undefined) {
          values.description = input.description;
        }

        const rows = yield* sql<ServiceAreaRow>`
          update service_areas
          set ${sql.update(values)}
          where organization_id = ${organizationId}
            and id = ${serviceAreaId}
            and archived_at is null
          returning *
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

        return mapServiceAreaRow(rows[0]);
      });

      return {
        create,
        list,
        listOptions,
        update,
      };
    }),
  }
) {}

function mapServiceAreaRow(row: ServiceAreaRow): ServiceArea {
  return decodeServiceArea({
    description: nullableToUndefined(row.description),
    id: row.id,
    name: row.name,
  });
}

function mapServiceAreaOptionRow(row: ServiceAreaOptionRow): ServiceAreaOption {
  return decodeServiceAreaOption({
    id: row.id,
    name: row.name,
  });
}

function nullableToUndefined<Value>(value: Value | null): Value | undefined {
  return value === null ? undefined : value;
}

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return slug.length === 0 ? "service-area" : slug;
}

function getRequiredRow<Value>(rows: readonly Value[], label: string) {
  const [row] = rows;

  if (row === undefined) {
    return Effect.die(new Error(`Expected ${label} row to be returned`));
  }

  return Effect.succeed(row);
}
