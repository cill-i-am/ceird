import { CommentId } from "@ceird/comments-core";
import type { CommentIdType } from "@ceird/comments-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeCommentId = Schema.decodeUnknownSync(CommentId);

export function generateCommentId(): CommentIdType {
  return decodeCommentId(uuidv7());
}
