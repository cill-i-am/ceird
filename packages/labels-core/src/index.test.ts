import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import type { LabelId } from "./index.js";
import {
  CreateLabelInputSchema,
  LabelAccessDeniedError,
  LabelNameConflictError,
  LabelNameSchema,
  LabelNotFoundError,
  LabelSchema,
  LabelsApi,
  LabelsApiGroup,
  LabelsResponseSchema,
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
      createdAt: "2026-04-28T10:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
      name: "Waiting on PO",
      updatedAt: "2026-04-28T10:00:00.000Z",
    });

    expect(label.name).toBe("Waiting on PO");
    expect(
      Schema.decodeUnknownSync(LabelsResponseSchema)({ labels: [label] })
    ).toStrictEqual({ labels: [label] });
  });

  it("keeps label mutation inputs strict", () => {
    expect(
      Schema.decodeUnknownSync(CreateLabelInputSchema)({
        name: "  Access issue  ",
      })
    ).toStrictEqual({ name: "Access issue" });
    expect(
      Schema.decodeUnknownSync(UpdateLabelInputSchema)({
        name: "  Access resolved  ",
      })
    ).toStrictEqual({ name: "Access resolved" });

    expect(() =>
      Schema.decodeUnknownSync(CreateLabelInputSchema)({
        extra: true,
        name: "Access issue",
      })
    ).toThrow(/[Uu]nexpected/);
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
    expect(new LabelAccessDeniedError({ message: "No access" })._tag).toBe(
      "@ceird/labels-core/LabelAccessDeniedError"
    );
    expect(new LabelStorageError({ message: "Storage failed" })._tag).toBe(
      "@ceird/labels-core/LabelStorageError"
    );
  });
});
