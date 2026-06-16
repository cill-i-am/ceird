import {
  OrganizationId as IdentityOrganizationId,
  ProductActorId as IdentityProductActorId,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  ProductActorId as ProductActorIdType,
} from "@ceird/identity-core";
import { Schema } from "effect";

export const OrganizationId = IdentityOrganizationId;
export type OrganizationId = OrganizationIdType;

export const ProductActorId = IdentityProductActorId;
export type ProductActorId = ProductActorIdType;

export const ActivityEventId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/activity-core/ActivityEventId")
);
export type ActivityEventId = Schema.Schema.Type<typeof ActivityEventId>;
