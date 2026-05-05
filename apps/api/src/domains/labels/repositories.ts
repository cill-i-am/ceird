import type { OrganizationId } from "@ceird/identity-core";
import {
  LabelId as LabelIdSchema,
  LabelNameConflictError,
  LabelNameSchema,
  LabelNotFoundError,
  LabelSchema,
  LabelsResponseSchema,
  normalizeLabelName,
} from "@ceird/labels-core";
import type {
  Label,
  LabelIdType as LabelId,
  LabelName,
} from "@ceird/labels-core";
import { SqlClient } from "@effect/sql";
import type { SqlError } from "@effect/sql";
import { Effect, Option, Schema } from "effect";

import { generateLabelId } from "./id-generation.js";

interface LabelRow {
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly organization_id: string;
  readonly updated_at: Date;
}

export interface CreateLabelRecordInput {
  readonly name: LabelName;
  readonly organizationId: OrganizationId;
}

export interface UpdateLabelRecordInput {
  readonly name: LabelName;
}

export type ArchiveLabelResult = Label;

const decodeLabel = Schema.decodeUnknownSync(LabelSchema);
const decodeLabelId = Schema.decodeUnknownSync(LabelIdSchema);
const decodeLabelName = Schema.decodeUnknownSync(LabelNameSchema);
const decodeLabelsResponse = Schema.decodeUnknownSync(LabelsResponseSchema);

export class LabelsRepository extends Effect.Service<LabelsRepository>()(
  "@ceird/domains/labels/LabelsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* LabelsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const findById = Effect.fn("LabelsRepository.findById")(function* (
        organizationId: OrganizationId,
        labelId: LabelId
      ) {
        const rows = yield* sql<LabelRow>`
          select *
          from labels
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          limit 1
        `;

        return Option.fromNullable(rows[0]).pipe(Option.map(mapLabelRow));
      });

      const getActiveLabelOrFail = Effect.fn(
        "LabelsRepository.getActiveLabelOrFail"
      )(function* (organizationId: OrganizationId, labelId: LabelId) {
        const label = yield* findById(organizationId, labelId).pipe(
          Effect.map(Option.getOrUndefined)
        );

        if (label === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        return label;
      });

      const list = Effect.fn("LabelsRepository.list")(function* (
        organizationId: OrganizationId
      ) {
        const rows = yield* sql<LabelRow>`
          select *
          from labels
          where organization_id = ${organizationId}
            and archived_at is null
          order by name asc, id asc
        `;

        return decodeLabelsResponse({
          labels: rows.map(mapLabelRow),
        }).labels;
      });

      const create = Effect.fn("LabelsRepository.create")(function* (
        input: CreateLabelRecordInput
      ) {
        const name = decodeLabelName(input.name);
        const rows = yield* sql<LabelRow>`
          insert into labels ${sql
            .insert({
              id: generateLabelId(),
              name,
              normalized_name: normalizeLabelName(name),
              organization_id: input.organizationId,
            })
            .returning("*")}
        `.pipe(
          Effect.catchTag("SqlError", (error) =>
            mapLabelNameConflict(error, name)
          )
        );

        const row = yield* getRequiredRow(rows, "inserted label");

        return mapLabelRow(row);
      });

      const update = Effect.fn("LabelsRepository.update")(function* (
        organizationId: OrganizationId,
        labelId: LabelId,
        input: UpdateLabelRecordInput
      ) {
        const name = decodeLabelName(input.name);
        const rows = yield* sql<LabelRow>`
          update labels
          set ${sql.update({
            name,
            normalized_name: normalizeLabelName(name),
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          returning *
        `.pipe(
          Effect.catchTag("SqlError", (error) =>
            mapLabelNameConflict(error, name)
          )
        );

        return Option.fromNullable(rows[0]).pipe(Option.map(mapLabelRow));
      });

      const archive = Effect.fn("LabelsRepository.archive")(function* (
        organizationId: OrganizationId,
        labelId: LabelId
      ) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<LabelRow>`
              update labels
              set archived_at = now(), updated_at = now()
              where organization_id = ${organizationId}
                and id = ${labelId}
                and archived_at is null
              returning *
            `;

            const label = Option.fromNullable(rows[0]).pipe(
              Option.map(mapLabelRow)
            );

            if (Option.isNone(label)) {
              return Option.none<ArchiveLabelResult>();
            }

            return Option.some(label.value);
          })
        );
      });

      return {
        archive,
        create,
        findById,
        getActiveLabelOrFail,
        list,
        update,
      };
    }),
  }
) {}

function mapLabelRow(row: LabelRow): Label {
  return decodeLabel({
    createdAt: row.created_at.toISOString(),
    id: decodeLabelId(row.id),
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapLabelNameConflict(
  error: SqlError.SqlError,
  name: LabelName
): Effect.Effect<never, LabelNameConflictError | SqlError.SqlError> {
  if (
    isUniqueConstraintError(error, "labels_organization_normalized_active_idx")
  ) {
    return Effect.fail(
      new LabelNameConflictError({
        message: "Label name already exists in the organization",
        name,
      })
    );
  }

  return Effect.fail(error);
}

function isUniqueConstraintError(
  error: unknown,
  constraintName: string
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "constraint" in error.cause &&
    error.cause.constraint === constraintName
  );
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
