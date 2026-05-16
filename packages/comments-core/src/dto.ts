import { Schema } from "effect";

import {
  CommentBodyInputSchema,
  CommentBodySchema,
  IsoDateTimeString,
  UserId,
} from "./domain.js";
import { CommentId } from "./ids.js";

export const CommentSchema = Schema.Struct({
  id: CommentId,
  authorUserId: UserId,
  authorName: Schema.optional(Schema.String),
  body: CommentBodySchema,
  createdAt: IsoDateTimeString,
});
export type Comment = Schema.Schema.Type<typeof CommentSchema>;

export const EditableCommentSchema = Schema.extend(
  CommentSchema,
  Schema.Struct({
    updatedAt: IsoDateTimeString,
    updatedByUserId: Schema.optional(UserId),
  })
);
export type EditableComment = Schema.Schema.Type<typeof EditableCommentSchema>;

export const AddCommentInputSchema = Schema.Struct({
  body: CommentBodyInputSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type AddCommentInput = Schema.Schema.Type<typeof AddCommentInputSchema>;

export const AddCommentResponseSchema = CommentSchema;
export type AddCommentResponse = Schema.Schema.Type<
  typeof AddCommentResponseSchema
>;
