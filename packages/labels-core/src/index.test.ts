import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import type { LabelId } from "./index.js";
import {
  CreateLabelInputSchema,
  DEFAULT_LABEL_COLOR,
  LabelColorSchema,
  LabelDescriptionSchema,
  LabelAccessDeniedError,
  LabelWriteResponseSchema,
  LabelNameConflictError,
  LabelNameSchema,
  LabelNotFoundError,
  LabelReadResponseSchema,
  LabelRestoreConflictError,
  LabelSchema,
  LabelsApi,
  LabelsApiGroup,
  LabelsResponseSchema,
  ListLabelsQuerySchema,
  normalizeLabelDescription,
  LabelStorageError,
  normalizeLabelName,
  UpdateLabelInputSchema,
} from "./index.js";

describe("labels-core", () => {
  it("decodes generic organization label DTOs", () => {
    expect(Schema.decodeUnknownSync(LabelNameSchema)("  Waiting on PO  ")).toBe(
      "Waiting on PO"
    );
    expect(normalizeLabelName("  Waiting   on PO  ")).toBe("waiting on po");

    expect(() =>
      Schema.decodeUnknownSync(LabelNameSchema)(" ".repeat(4))
    ).toThrow(/at least 1/);

    const label = Schema.decodeUnknownSync(LabelSchema)({
      archivedAt: null,
      color: DEFAULT_LABEL_COLOR,
      createdAt: "2026-04-28T10:00:00.000Z",
      description: "Admin-only procurement state",
      id: "11111111-1111-4111-8111-111111111111",
      name: "Waiting on PO",
      updatedAt: "2026-04-28T10:00:00.000Z",
    });

    expect(label.name).toBe("Waiting on PO");
    expect(
      Schema.decodeUnknownSync(LabelsResponseSchema)({ labels: [label] })
    ).toStrictEqual({ labels: [label] });
    expect(
      Schema.decodeUnknownSync(LabelReadResponseSchema)({ label })
    ).toStrictEqual({ label });

    expect(
      Schema.decodeUnknownSync(LabelWriteResponseSchema)({
        label,
        mutation: { txid: 42 },
      })
    ).toStrictEqual({
      label,
      mutation: { txid: 42 },
    });
  });

  it("keeps label mutation inputs strict", () => {
    expect(
      Schema.decodeUnknownSync(CreateLabelInputSchema)({
        color: "oklch(67% 0.15 196)",
        description: "Gate deliveries here",
        name: "  Access issue  ",
      })
    ).toStrictEqual({
      color: "oklch(67% 0.15 196)",
      description: "Gate deliveries here",
      name: "Access issue",
    });
    expect(
      Schema.decodeUnknownSync(UpdateLabelInputSchema)({
        color: "oklch(63% 0.18 255)",
        description: null,
        name: "  Access resolved  ",
      })
    ).toStrictEqual({
      color: "oklch(63% 0.18 255)",
      description: null,
      name: "Access resolved",
    });
    expect(
      Schema.decodeUnknownSync(ListLabelsQuerySchema)({ status: "archived" })
    ).toStrictEqual({ status: "archived" });

    expect(() =>
      Schema.decodeUnknownSync(CreateLabelInputSchema)({
        color: DEFAULT_LABEL_COLOR,
        extra: true,
        name: "Access issue",
      })
    ).toThrow(/[Uu]nexpected/);

    expect(() =>
      Schema.decodeUnknownSync(LabelWriteResponseSchema)({
        label: {
          archivedAt: null,
          color: DEFAULT_LABEL_COLOR,
          createdAt: "2026-04-28T10:00:00.000Z",
          description: null,
          id: "11111111-1111-4111-8111-111111111111",
          name: "Access issue",
          updatedAt: "2026-04-28T10:00:00.000Z",
        },
        mutation: { txid: -1 },
      })
    ).toThrow(/greater than or equal to 0/);

    expect(() =>
      Schema.decodeUnknownSync(LabelWriteResponseSchema)({
        label: {
          archivedAt: null,
          color: DEFAULT_LABEL_COLOR,
          createdAt: "2026-04-28T10:00:00.000Z",
          description: null,
          id: "11111111-1111-4111-8111-111111111111",
          name: "Access issue",
          updatedAt: "2026-04-28T10:00:00.000Z",
        },
        mutation: { txid: 4_294_967_296 },
      })
    ).toThrow(/less than or equal to 4294967295/);
  });

  it("validates canonical OKLCH colors and optional descriptions", () => {
    expect(
      Schema.decodeUnknownSync(LabelColorSchema)("  oklch(64% 0.19 28)  ")
    ).toBe("oklch(64% 0.19 28)");
    expect(
      Schema.decodeUnknownSync(LabelDescriptionSchema)(
        "  Admin-only description  "
      )
    ).toBe("Admin-only description");
    expect(normalizeLabelDescription("  ")).toBeNull();
    expect(normalizeLabelDescription(null)).toBeNull();
    expect(normalizeLabelDescription("  Crew planning  ")).toBe(
      "Crew planning"
    );

    expect(() => Schema.decodeUnknownSync(LabelColorSchema)("#f97316")).toThrow(
      /canonical OKLCH/
    );
    expect(() =>
      Schema.decodeUnknownSync(LabelColorSchema)("oklch(64, 0.19, 28)")
    ).toThrow(/canonical OKLCH/);
    expect(() =>
      Schema.decodeUnknownSync(LabelColorSchema)("oklch(64% 0.9 28)")
    ).toThrow(/canonical OKLCH/);
  });

  it("exports labels API group and typed errors", () => {
    expect(LabelsApi).toBeDefined();
    expect(LabelsApiGroup).toBeDefined();

    expect(
      new LabelNotFoundError({
        labelId: "11111111-1111-4111-8111-111111111111" as LabelId,
        message: "Label does not exist",
      })._tag
    ).toBe("@ceird/labels-core/LabelNotFoundError");
    expect(
      new LabelNameConflictError({
        message: "Label already exists",
        name: "Waiting on PO",
      })._tag
    ).toBe("@ceird/labels-core/LabelNameConflictError");
    expect(
      new LabelRestoreConflictError({
        labelId: "11111111-1111-4111-8111-111111111111" as LabelId,
        message: "An active label already uses this name",
        name: "Waiting on PO",
      })._tag
    ).toBe("@ceird/labels-core/LabelRestoreConflictError");
    expect(new LabelAccessDeniedError({ message: "No access" })._tag).toBe(
      "@ceird/labels-core/LabelAccessDeniedError"
    );
    expect(new LabelStorageError({ message: "Storage failed" })._tag).toBe(
      "@ceird/labels-core/LabelStorageError"
    );
  });
});
