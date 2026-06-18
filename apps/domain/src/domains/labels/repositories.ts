import type { OrganizationId } from "@ceird/identity-core";
import {
  LabelId as LabelIdSchema,
  LabelColorSchema,
  LabelNameConflictError,
  LabelNameSchema,
  LabelNotFoundError,
  LabelRestoreConflictError,
  LabelSchema,
  LabelsResponseSchema,
  normalizeLabelDescription,
  normalizeLabelName,
} from "@ceird/labels-core";
import type {
  Label,
  LabelColor,
  LabelDescription,
  LabelIdType as LabelId,
  LabelListStatus,
  LabelName,
} from "@ceird/labels-core";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Layer, Context, Effect, Option, Schema } from "effect";

import { DomainDrizzle } from "../../platform/database/database.js";
import { label } from "../../platform/database/schema.js";
import { generateLabelId } from "./id-generation.js";

interface LabelRow {
  readonly archivedAt: Date | null;
  readonly color: string;
  readonly createdAt: Date;
  readonly description: string | null;
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly organizationId: string;
  readonly updatedAt: Date;
}

export interface CreateLabelRecordInput {
  readonly color: LabelColor;
  readonly description: LabelDescription | null;
  readonly name: LabelName;
  readonly organizationId: OrganizationId;
}

export interface UpdateLabelRecordInput {
  readonly color: LabelColor;
  readonly description: LabelDescription | null;
  readonly name: LabelName;
}

export type ArchiveLabelResult = Label;

const decodeLabel = Schema.decodeUnknownSync(LabelSchema);
const decodeLabelColor = Schema.decodeUnknownSync(LabelColorSchema);
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
        return yield* read(organizationId, labelId, "active");
      });

      const read = Effect.fn("LabelsRepository.read")(function* (
        organizationId: OrganizationId,
        labelId: LabelId,
        status: LabelListStatus = "active"
      ) {
        const clauses = [
          eq(label.organizationId, organizationId),
          eq(label.id, labelId),
        ];
        if (status === "active") {
          clauses.push(isNull(label.archivedAt));
        } else if (status === "archived") {
          clauses.push(isNotNull(label.archivedAt));
        }

        const rows = yield* db
          .select(labelSelection)
          .from(label)
          .where(and(...clauses))
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
        organizationId: OrganizationId,
        status: LabelListStatus = "active"
      ) {
        const clauses = [eq(label.organizationId, organizationId)];
        if (status === "active") {
          clauses.push(isNull(label.archivedAt));
        } else if (status === "archived") {
          clauses.push(isNotNull(label.archivedAt));
        }
        const rows = yield* db
          .select(labelSelection)
          .from(label)
          .where(and(...clauses))
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
        const color = decodeLabelColor(input.color);
        const description = normalizeLabelDescription(input.description);
        const rows = yield* db
          .insert(label)
          .values({
            color,
            description,
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
        const color = decodeLabelColor(input.color);
        const description = normalizeLabelDescription(input.description);
        const rows = yield* db
          .update(label)
          .set({
            color,
            description,
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

      const restore = Effect.fn("LabelsRepository.restore")(function* (
        organizationId: OrganizationId,
        labelId: LabelId
      ) {
        const archivedRows = yield* db
          .select(labelSelection)
          .from(label)
          .where(
            and(
              eq(label.organizationId, organizationId),
              eq(label.id, labelId),
              isNotNull(label.archivedAt)
            )
          )
          .limit(1)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));
        const [archivedRow] = archivedRows;

        if (archivedRow === undefined) {
          return Option.none<Label>();
        }

        const activeConflictRows = yield* db
          .select(labelSelection)
          .from(label)
          .where(
            and(
              eq(label.organizationId, organizationId),
              eq(label.normalizedName, archivedRow.normalizedName),
              isNull(label.archivedAt)
            )
          )
          .limit(1)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));
        const [activeConflict] = activeConflictRows;

        if (activeConflict !== undefined) {
          return yield* Effect.fail(
            new LabelRestoreConflictError({
              activeLabelId: decodeLabelId(activeConflict.id),
              labelId,
              message: "An active label already uses this name",
              name: decodeLabelName(archivedRow.name),
            })
          );
        }

        const rows = yield* db
          .update(label)
          .set({
            archivedAt: null,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(label.organizationId, organizationId),
              eq(label.id, labelId),
              isNotNull(label.archivedAt)
            )
          )
          .returning(labelSelection)
          .pipe(
            Effect.catchTag("EffectDrizzleQueryError", (error) =>
              mapLabelRestoreConflict(error, archivedRow, labelId)
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
        read,
        restore,
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
  static readonly read = (
    ...args: Parameters<Context.Service.Shape<typeof LabelsRepository>["read"]>
  ) => LabelsRepository.use((service) => service.read(...args));
  static readonly restore = (
    ...args: Parameters<
      Context.Service.Shape<typeof LabelsRepository>["restore"]
    >
  ) => LabelsRepository.use((service) => service.restore(...args));
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
  color: label.color,
  createdAt: label.createdAt,
  description: label.description,
  id: label.id,
  name: label.name,
  normalizedName: label.normalizedName,
  organizationId: label.organizationId,
  updatedAt: label.updatedAt,
} satisfies Record<keyof LabelRow, unknown>;

function mapLabelRow(row: LabelRow): Label {
  return decodeLabel({
    archivedAt: row.archivedAt?.toISOString() ?? null,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
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

function mapLabelRestoreConflict(
  error: EffectDrizzleQueryError,
  archivedRow: LabelRow,
  labelId: LabelId
): Effect.Effect<never, LabelRestoreConflictError | EffectDrizzleQueryError> {
  if (
    isUniqueConstraintError(error, "labels_organization_normalized_active_idx")
  ) {
    return Effect.fail(
      new LabelRestoreConflictError({
        labelId,
        message: "An active label already uses this name",
        name: decodeLabelName(archivedRow.name),
      })
    );
  }

  return Effect.fail(error);
}

function isUniqueConstraintError(
  error: unknown,
  constraintName: string
): boolean {
  return hasConstraintName(error, constraintName, new Set(), 0);
}

function hasConstraintName(
  value: unknown,
  constraintName: string,
  seen: Set<object>,
  depth: number
): boolean {
  if (typeof value !== "object" || value === null || depth > 6) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  if ("constraint" in value && value.constraint === constraintName) {
    return true;
  }

  return [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value),
  ].some((key) =>
    hasConstraintName(
      (value as Record<PropertyKey, unknown>)[key],
      constraintName,
      seen,
      depth + 1
    )
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
