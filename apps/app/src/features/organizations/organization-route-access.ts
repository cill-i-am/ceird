import {
  isAdministrativeOrganizationRole,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
} from "@ceird/identity-core";
import type {
  OrganizationId,
  OrganizationRole,
  UserId,
} from "@ceird/identity-core";
import { redirect } from "@tanstack/react-router";

export interface ActiveOrganizationSync {
  readonly required: boolean;
  readonly targetOrganizationId: OrganizationId | null;
}

export interface OrganizationRoleRouteContext {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export interface OrganizationProductRouteContext extends OrganizationRoleRouteContext {
  readonly activeOrganizationId: OrganizationId;
  readonly currentUserId: UserId;
}

export function requireOrganizationRouteContextRole(
  context: OrganizationRoleRouteContext
) {
  const role = context.currentOrganizationRole;

  if (role === undefined) {
    throw redirect({ to: "/" });
  }

  return role;
}

export function assertOrganizationAdministrationRole(input: {
  readonly role: OrganizationRole;
}) {
  if (!isAdministrativeOrganizationRole(input.role)) {
    throw redirect({ to: "/" });
  }
}

export function assertOrganizationAdministrationRouteContext(
  context: OrganizationRoleRouteContext
) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  assertOrganizationAdministrationRole({
    role: requireOrganizationRouteContextRole(context),
  });
}

export function assertOrganizationInternalRole(input: {
  readonly role: OrganizationRole;
}) {
  if (!isInternalOrganizationRole(input.role)) {
    throw redirect({
      to: isExternalOrganizationRole(input.role) ? "/jobs" : "/",
    });
  }
}

export function assertOrganizationInternalRouteContext(
  context: OrganizationRoleRouteContext
) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  assertOrganizationInternalRole({
    role: requireOrganizationRouteContextRole(context),
  });
}
