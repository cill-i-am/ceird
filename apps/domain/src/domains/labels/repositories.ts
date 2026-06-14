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
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Layer, Context, Effect, Option, Schema } from "effect";

import { DomainDrizzle } from "../../platform/database/database.js";
import { label } from "../../platform/database/schema.js";
import { generateLabelId } from "./id-generation.js";

interface LabelRow {
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly organizationId: string;
  readonly updatedAt: Date;
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

export class LabelsRepository extends Context.Service<LabelsRepository>()(
  "@ceird/domains/labels/LabelsRepository",
  {
    make: Effect.gen(function* LabelsRepositoryLive() {
      const { db } = yield* DomainDrizzle;

      const findById = Effect.fn("LabelsRepository.findById")(function* (
        organizationId: OrganizationId,
        labelId: LabelId
      ) {
        const rows = yield* db
          .select(labelSelection)
          .from(label)
          .where(
            and(
              eq(label.organizationId, organizationId),
              eq(label.id, labelId),
              isNull(label.archivedAt)
            )
          )
          .limit(1)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        return Option.fromNullishOr(rows[0]).pipe(Option.map(mapLabelRow));
      });

      const getActiveLabelOrFail = Effect.fn(
        "LabelsRepository.getActiveLabelOrFail"
      )(function* (organizationId: OrganizationId, labelId: LabelId) {
        const activeLabel = yield* findById(organizationId, labelId).pipe(
          Effect.map(Option.getOrUndefined)
        );

        if (activeLabel === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        return activeLabel;
      });

      const list = Effect.fn("LabelsRepository.list")(function* (
        organizationId: OrganizationId
      ) {
        const rows = yield* db
          .select(labelSelection)
          .from(label)
          .where(
            and(
              eq(label.organizationId, organizationId),
              isNull(label.archivedAt)
            )
          )
          .orderBy(asc(label.name), asc(label.id))
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        return decodeLabelsResponse({
          labels: rows.map(mapLabelRow),
        }).labels;
      });

      const create = Effect.fn("LabelsRepository.create")(function* (
        input: CreateLabelRecordInput
      ) {
        const name = decodeLabelName(input.name);
        const rows = yield* db
          .insert(label)
          .values({
            id: generateLabelId(),
            name,
            normalizedName: normalizeLabelName(name),
            organizationId: input.organizationId,
          })
          .returning(labelSelection)
          .pipe(
            Effect.catchTag("EffectDrizzleQueryError", (error) =>
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
        const rows = yield* db
          .update(label)
          .set({
            name,
            normalizedName: normalizeLabelName(name),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(label.organizationId, organizationId),
              eq(label.id, labelId),
              isNull(label.archivedAt)
            )
          )
          .returning(labelSelection)
          .pipe(
            Effect.catchTag("EffectDrizzleQueryError", (error) =>
              mapLabelNameConflict(error, name)
            )
          );

        return Option.fromNullishOr(rows[0]).pipe(Option.map(mapLabelRow));
      });

      const archive = Effect.fn("LabelsRepository.archive")(function* (
        organizationId: OrganizationId,
        labelId: LabelId
      ) {
        const rows = yield* db
          .update(label)
          .set({
            archivedAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(label.organizationId, organizationId),
              eq(label.id, labelId),
              isNull(label.archivedAt)
            )
          )
          .returning(labelSelection)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        const archivedLabel = Option.fromNullishOr(rows[0]).pipe(
          Option.map(mapLabelRow)
        );

        return Option.isNone(archivedLabel)
          ? Option.none<ArchiveLabelResult>()
          : Option.some(archivedLabel.value);
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
) {
  static readonly archive = (
    ...args: Parameters<
      Context.Service.Shape<typeof LabelsRepository>["archive"]
    >
  ) => LabelsRepository.use((service) => service.archive(...args));
  static readonly create = (
    ...args: Parameters<
      Context.Service.Shape<typeof LabelsRepository>["create"]
    >
  ) => LabelsRepository.use((service) => service.create(...args));
  static readonly list = (
    ...args: Parameters<Context.Service.Shape<typeof LabelsRepository>["list"]>
  ) => LabelsRepository.use((service) => service.list(...args));
  static readonly update = (
    ...args: Parameters<
      Context.Service.Shape<typeof LabelsRepository>["update"]
    >
  ) => LabelsRepository.use((service) => service.update(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    LabelsRepository,
    LabelsRepository.make
  );
  static readonly Default = LabelsRepository.DefaultWithoutDependencies;
}

const labelSelection = {
  archivedAt: label.archivedAt,
  createdAt: label.createdAt,
  id: label.id,
  name: label.name,
  normalizedName: label.normalizedName,
  organizationId: label.organizationId,
  updatedAt: label.updatedAt,
} satisfies Record<keyof LabelRow, unknown>;

function mapLabelRow(row: LabelRow): Label {
  return decodeLabel({
    createdAt: row.createdAt.toISOString(),
    id: decodeLabelId(row.id),
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapLabelNameConflict(
  error: EffectDrizzleQueryError,
  name: LabelName
): Effect.Effect<never, LabelNameConflictError | EffectDrizzleQueryError> {
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
  description: string
): Effect.Effect<Value> {
  const [row] = rows;

  if (row === undefined) {
    return Effect.die(new Error(`Expected ${description} row to be returned`));
  }

  return Effect.succeed(row);
}
