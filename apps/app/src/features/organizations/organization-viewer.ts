import {
  isAdministrativeOrganizationRole,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
  UserId,
} from "@ceird/identity-core";
import type {
  OrganizationRole,
  UserId as UserIdType,
} from "@ceird/identity-core";
import { ParseResult } from "effect";

export type OrganizationViewerRole = OrganizationRole;

export interface OrganizationViewer {
  readonly role: OrganizationViewerRole;
  readonly userId: UserIdType;
}

export function hasOrganizationElevatedAccess(
  role: OrganizationViewerRole
): boolean {
  return isAdministrativeOrganizationRole(role);
}

export function isExternalOrganizationViewer(
  viewer: Pick<OrganizationViewer, "role">
): boolean {
  return isExternalOrganizationRole(viewer.role);
}

export function canUseInternalOrganizationOptions(
  viewer: Pick<OrganizationViewer, "role">
): boolean {
  return isInternalOrganizationRole(viewer.role);
}

export function decodeOrganizationViewerUserId(input: unknown): UserIdType {
  return ParseResult.decodeUnknownSync(UserId)(input);
}
