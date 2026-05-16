import { Schema } from "effect";

export const CommentId = Schema.UUID.pipe(
  Schema.brand("@ceird/comments-core/CommentId")
);
export type CommentId = Schema.Schema.Type<typeof CommentId>;
export type CommentIdType = CommentId;
