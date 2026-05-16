import {
  IsoDateTimeString as IdentityIsoDateTimeString,
  UserId as IdentityUserId,
} from "@ceird/identity-core";
import type { UserId as UserIdType } from "@ceird/identity-core";
import { Schema } from "effect";

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const UserId = IdentityUserId;
export type UserId = UserIdType;

export const CommentBodySchema = Schema.String.pipe(Schema.minLength(1));
export type CommentBody = Schema.Schema.Type<typeof CommentBodySchema>;

export const CommentBodyInputSchema = Schema.Trim.pipe(Schema.minLength(1));
export type CommentBodyInput = Schema.Schema.Type<
  typeof CommentBodyInputSchema
>;
