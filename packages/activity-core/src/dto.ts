import { Schema } from "effect";

import {
  ActivityEventSourceTypeSchema,
  ActivityEventStatusSchema,
  ActivityEventTargetTypeSchema,
  ActivityEventTypeSchema,
  IsoDateTimeString,
} from "./domain.js";
import { ActivityEventId, OrganizationId, ProductActorId } from "./ids.js";

const NonEmptyText = Schema.Trim.pipe(Schema.check(Schema.isMinLength(1)));

export const ProductActivityEventRouteSchema = Schema.Struct({
  href: NonEmptyText.pipe(Schema.check(Schema.isMaxLength(512))),
  label: NonEmptyText.pipe(Schema.check(Schema.isMaxLength(80))),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProductActivityEventRoute = Schema.Schema.Type<
  typeof ProductActivityEventRouteSchema
>;

export const ProductActivityEventDisplayPayloadSchema = Schema.Struct({
  detail: Schema.optional(
    NonEmptyText.pipe(Schema.check(Schema.isMaxLength(280)))
  ),
  route: Schema.optional(ProductActivityEventRouteSchema),
  summary: NonEmptyText.pipe(Schema.check(Schema.isMaxLength(160))),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProductActivityEventDisplayPayload = Schema.Schema.Type<
  typeof ProductActivityEventDisplayPayloadSchema
>;

export const ProductActivityEventSchema = Schema.Struct({
  actorId: ProductActorId,
  createdAt: IsoDateTimeString,
  display: ProductActivityEventDisplayPayloadSchema,
  eventType: ActivityEventTypeSchema,
  id: ActivityEventId,
  organizationId: OrganizationId,
  retainedUntil: IsoDateTimeString,
  sourceId: NonEmptyText.pipe(Schema.check(Schema.isMaxLength(160))),
  sourceType: ActivityEventSourceTypeSchema,
  status: ActivityEventStatusSchema,
  targetId: NonEmptyText.pipe(Schema.check(Schema.isMaxLength(160))),
  targetType: ActivityEventTargetTypeSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProductActivityEvent = Schema.Schema.Type<
  typeof ProductActivityEventSchema
>;

export const ProductActivityEventListSchema = Schema.Array(
  ProductActivityEventSchema
);
export type ProductActivityEventList = Schema.Schema.Type<
  typeof ProductActivityEventListSchema
>;
