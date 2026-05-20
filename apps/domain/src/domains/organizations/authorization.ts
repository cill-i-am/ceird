import {
  isExternalOrganizationRole,
  isInternalOrganizationRole,
} from "@ceird/identity-core";
import { Layer, Context, Effect } from "effect";

import type { OrganizationActor } from "./current-actor.js";
import { OrganizationAuthorizationDeniedError } from "./errors.js";

type OrganizationAuthorizationCheck = (
  actor: OrganizationActor
) => Effect.Effect<void, OrganizationAuthorizationDeniedError>;

export class OrganizationAuthorization extends Context.Service<OrganizationAuthorization>()(
  "@ceird/domains/organizations/OrganizationAuthorization",
  {
    make: Effect.sync(() => {
      const ensureCanCreateSite: OrganizationAuthorizationCheck = (
        actor: OrganizationActor
      ) =>
        hasElevatedOrganizationAccess(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message: "Only organization owners and admins can create sites",
              })
            );

      const ensureCanManageLabels: OrganizationAuthorizationCheck = (
        actor: OrganizationActor
      ) =>
        hasElevatedOrganizationAccess(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message:
                  "Only organization owners and admins can manage labels",
              })
            );

      const ensureCanManageConfiguration: OrganizationAuthorizationCheck = (
        actor: OrganizationActor
      ) =>
        hasElevatedOrganizationAccess(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message:
                  "Only organization owners and admins can manage organization configuration",
              })
            );

      const ensureCanViewOrganizationData: OrganizationAuthorizationCheck = (
        actor: OrganizationActor
      ) =>
        isInternalOrganizationActor(actor)
          ? Effect.void
          : Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message:
                  "External collaborators cannot view organization-wide data",
              })
            );

      return {
        ensureCanCreateSite,
        ensureCanManageConfiguration,
        ensureCanManageLabels,
        ensureCanViewOrganizationData,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    OrganizationAuthorization,
    OrganizationAuthorization.make
  );
  static readonly Default =
    OrganizationAuthorization.DefaultWithoutDependencies;
}

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
