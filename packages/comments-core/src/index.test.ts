import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AddCommentInputSchema,
  CommentBodyInputSchema,
  CommentBodySchema,
  CommentSchema,
  EditableCommentSchema,
} from "./index.js";
import type { CommentId } from "./index.js";

const decodeBody = Schema.decodeUnknownSync(CommentBodySchema);
const decodeBodyInput = Schema.decodeUnknownSync(CommentBodyInputSchema);
const decodeInput = Schema.decodeUnknownSync(AddCommentInputSchema);
const decodeComment = Schema.decodeUnknownSync(CommentSchema);
const decodeEditableComment = Schema.decodeUnknownSync(EditableCommentSchema);

describe("@ceird/comments-core", () => {
  it("trims non-empty comment body inputs", () => {
    expect(decodeBodyInput("  Checked access gate.  ")).toBe(
      "Checked access gate."
    );
    expect(decodeInput({ body: "  Bring ladder.  " })).toStrictEqual({
      body: "Bring ladder.",
    });
  });

  it("rejects empty comment bodies", () => {
    expect(() => decodeBody("")).toThrow();
    expect(decodeBody("   ")).toBe("   ");
    expect(() => decodeBodyInput("   ")).toThrow();
    expect(() => decodeInput({ body: "" })).toThrow();
  });

  it("keeps persisted historical long comments decodable without mutating them", () => {
    const longBody = "Existing comment. ".repeat(700);

    expect(decodeBody(longBody)).toBe(longBody);
    expect(decodeBodyInput(longBody)).toBe(longBody.trim());
    expect(decodeInput({ body: longBody })).toStrictEqual({
      body: longBody.trim(),
    });
  });

  it("decodes shared comment DTOs", () => {
    expect(
      decodeComment({
        id: "77777777-7777-4777-8777-777777777777",
        authorUserId: "user_123",
        authorName: "Ciara",
        body: "Gate code changed.",
        createdAt: "2026-05-16T09:30:00.000Z",
      })
    ).toStrictEqual({
      id: "77777777-7777-4777-8777-777777777777" as Schema.Schema.Type<
        typeof CommentId
      >,
      authorUserId: "user_123",
      authorName: "Ciara",
      body: "Gate code changed.",
      createdAt: "2026-05-16T09:30:00.000Z",
    });
  });

  it("supports editable comment metadata for future editable targets", () => {
    expect(
      decodeEditableComment({
        id: "77777777-7777-4777-8777-777777777777",
        authorUserId: "user_123",
        authorName: "Ciara",
        body: "Gate code changed.",
        createdAt: "2026-05-16T09:30:00.000Z",
        updatedAt: "2026-05-16T09:45:00.000Z",
        updatedByUserId: "user_456",
      })
    ).toMatchObject({
      body: "Gate code changed.",
      updatedAt: "2026-05-16T09:45:00.000Z",
      updatedByUserId: "user_456",
    });
  });
});
