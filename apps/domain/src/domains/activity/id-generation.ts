import { ProductActorId } from "@ceird/identity-core";
import type { ProductActorId as ProductActorIdType } from "@ceird/identity-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);

export function generateProductActorId(): ProductActorIdType {
  return decodeProductActorId(uuidv7());
}
