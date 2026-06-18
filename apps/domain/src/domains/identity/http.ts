import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { ConnectedAppGrantsService } from "./connected-apps.js";
import { OrganizationMembersService } from "./organization-members.js";
import { OrganizationSecurityActivityService } from "./security-activity.js";

const observeIdentityOperation = (operation: string, service: string) =>
  observeApiOperation({
    domain: "identity",
    operation,
    service,
  });

const IdentityHandlersLive = HttpApiBuilder.group(
  AppApi,
  "identity",
  (handlers) =>
    Effect.gen(function* () {
      const connectedAppGrantsService = yield* ConnectedAppGrantsService;
      const organizationMembersService = yield* OrganizationMembersService;
      const securityActivityService =
        yield* OrganizationSecurityActivityService;

      return handlers
        .handle("listOrganizationSecurityActivity", ({ query }) =>
          securityActivityService
            .list(query)
            .pipe(
              observeIdentityOperation(
                "listOrganizationSecurityActivity",
                "OrganizationSecurityActivityService"
              )
            )
        )
        .handle("listConnectedAppGrants", () =>
          connectedAppGrantsService
            .list()
            .pipe(
              observeIdentityOperation(
                "listConnectedAppGrants",
                "ConnectedAppGrantsService"
              )
            )
        )
        .handle("disconnectConnectedAppGrant", ({ params }) =>
          connectedAppGrantsService
            .disconnect({ grantId: params.grantId })
            .pipe(
              observeIdentityOperation(
                "disconnectConnectedAppGrant",
                "ConnectedAppGrantsService"
              )
            )
        )
        .handle("listOrganizationMembers", ({ query }) =>
          organizationMembersService
            .listMembers(query)
            .pipe(
              observeIdentityOperation(
                "listOrganizationMembers",
                "OrganizationMembersService"
              )
            )
        )
        .handle("listOrganizationInvitations", () =>
          organizationMembersService
            .listInvitations()
            .pipe(
              observeIdentityOperation(
                "listOrganizationInvitations",
                "OrganizationMembersService"
              )
            )
        )
        .handle("inviteOrganizationMember", ({ payload }) =>
          organizationMembersService
            .invite(payload)
            .pipe(
              observeIdentityOperation(
                "inviteOrganizationMember",
                "OrganizationMembersService"
              )
            )
        )
        .handle("cancelOrganizationInvitation", ({ params }) =>
          organizationMembersService
            .cancelInvitation({ invitationId: params.invitationId })
            .pipe(
              observeIdentityOperation(
                "cancelOrganizationInvitation",
                "OrganizationMembersService"
              )
            )
        )
        .handle("updateOrganizationMemberRole", ({ params, payload }) =>
          organizationMembersService
            .updateMemberRole({
              memberId: params.memberId,
              role: payload.role,
            })
            .pipe(
              observeIdentityOperation(
                "updateOrganizationMemberRole",
                "OrganizationMembersService"
              )
            )
        )
        .handle("removeOrganizationMember", ({ params }) =>
          organizationMembersService
            .removeMember({ memberId: params.memberId })
            .pipe(
              observeIdentityOperation(
                "removeOrganizationMember",
                "OrganizationMembersService"
              )
            )
        );
    })
);

export const IdentityHttpLive = Layer.mergeAll(
  DomainCorsLive,
  IdentityHandlersLive
).pipe(
  Layer.provide(
    Layer.mergeAll(
      ConnectedAppGrantsService.Default,
      OrganizationMembersService.Default,
      OrganizationSecurityActivityService.Default
    )
  )
);
