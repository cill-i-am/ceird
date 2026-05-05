import {
  isExternalOrganizationRole,
  isInternalOrganizationRole,
} from "@ceird/identity-core";
import { Effect } from "effect";

import type { OrganizationActor } from "./current-actor.js";
import { OrganizationAuthorizationDeniedError } from "./errors.js";

export class OrganizationAuthorization extends Effect.Service<OrganizationAuthorization>()(
  "@ceird/domains/organizations/OrganizationAuthorization",
  {
    accessors: true,
    effect: Effect.sync(() => {
      const ensureCanCreateSite = Effect.fn(
        "OrganizationAuthorization.ensureCanCreateSite"
      )((actor: OrganizationActor) =>
        hasElevatedOrganizationAccess(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message: "Only organization owners and admins can create sites",
              })
            )
      );

      const ensureCanManageLabels = Effect.fn(
        "OrganizationAuthorization.ensureCanManageLabels"
      )((actor: OrganizationActor) =>
        hasElevatedOrganizationAccess(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message:
                  "Only organization owners and admins can manage labels",
              })
            )
      );

      const ensureCanManageConfiguration = Effect.fn(
        "OrganizationAuthorization.ensureCanManageConfiguration"
      )((actor: OrganizationActor) =>
        hasElevatedOrganizationAccess(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message:
                  "Only organization owners and admins can manage organization configuration",
              })
            )
      );

      const ensureCanViewOrganizationData = Effect.fn(
        "OrganizationAuthorization.ensureCanViewOrganizationData"
      )((actor: OrganizationActor) =>
        isInternalOrganizationActor(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message:
                  "External collaborators cannot view organization-wide data",
              })
            )
      );

      return {
        ensureCanCreateSite,
        ensureCanManageConfiguration,
        ensureCanManageLabels,
        ensureCanViewOrganizationData,
      };
    }),
  }
) {}

export function hasElevatedOrganizationAccess(
  actor: OrganizationActor
): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

export function isInternalOrganizationActor(actor: OrganizationActor): boolean {
  return isInternalOrganizationRole(actor.role);
}

export function isExternalOrganizationActor(actor: OrganizationActor): boolean {
  return isExternalOrganizationRole(actor.role);
}
