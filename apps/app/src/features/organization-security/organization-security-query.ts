import type {
  OrganizationSecurityActivityQuery,
  OrganizationSecurityActivityQueryInput,
} from "@ceird/identity-core";
import { OrganizationSecurityActivityQuerySchema } from "@ceird/identity-core";
import { Schema } from "effect";

const decodeOrganizationSecurityActivityQuery = Schema.decodeUnknownSync(
  OrganizationSecurityActivityQuerySchema
);

export const DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY =
  decodeOrganizationSecurityActivityQuery({});

export function decodeOrganizationSecurityActivityQueryInput(
  input:
    | OrganizationSecurityActivityQueryInput
    | OrganizationSecurityActivityQuery
): OrganizationSecurityActivityQuery {
  return decodeOrganizationSecurityActivityQuery(input);
}
