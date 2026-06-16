import { ActivityEventId } from "@ceird/activity-core";
import type { ActivityEventId as ActivityEventIdType } from "@ceird/activity-core";
import { ProductActorId } from "@ceird/identity-core";
import type { ProductActorId as ProductActorIdType } from "@ceird/identity-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeActivityEventId = Schema.decodeUnknownSync(ActivityEventId);
const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);

export function generateActivityEventId(): ActivityEventIdType {
  return decodeActivityEventId(uuidv7());
}

export function generateProductActorId(): ProductActorIdType {
  return decodeProductActorId(uuidv7());
}
