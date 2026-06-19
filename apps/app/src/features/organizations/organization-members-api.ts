import type {
  CancelOrganizationInvitationInput,
  CancelOrganizationInvitationResponse,
  InviteOrganizationMemberInput,
  InviteOrganizationMemberResponse,
  OrganizationInvitationListResponse,
  OrganizationMemberListQuery,
  OrganizationMemberListResponse,
  RemoveOrganizationMemberInput,
  RemoveOrganizationMemberResponse,
  UpdateOrganizationMemberRoleInput,
  UpdateOrganizationMemberRoleResponse,
} from "@ceird/identity-core";
import { Effect } from "effect";

import type { AppApiClient } from "#/features/api/app-api-client";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

function runOrganizationMembersRequest<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

export async function listOrganizationMembers(
  input: Required<OrganizationMemberListQuery>
): Promise<OrganizationMemberListResponse> {
  return await runOrganizationMembersRequest(
    "OrganizationMembersClient.listOrganizationMembers",
    (client) =>
      client.identity.listOrganizationMembers({
        query: {
          limit: input.limit,
          offset: input.offset,
        },
      })
  );
}

export async function listOrganizationInvitations(): Promise<OrganizationInvitationListResponse> {
  return await runOrganizationMembersRequest(
    "OrganizationMembersClient.listOrganizationInvitations",
    (client) => client.identity.listOrganizationInvitations()
  );
}

export async function inviteOrganizationMember(
  input: InviteOrganizationMemberInput
): Promise<InviteOrganizationMemberResponse> {
  return await runOrganizationMembersRequest(
    "OrganizationMembersClient.inviteOrganizationMember",
    (client) =>
      client.identity.inviteOrganizationMember({
        payload: input,
      })
  );
}

export async function cancelOrganizationInvitation(
  input: CancelOrganizationInvitationInput
): Promise<CancelOrganizationInvitationResponse> {
  return await runOrganizationMembersRequest(
    "OrganizationMembersClient.cancelOrganizationInvitation",
    (client) =>
      client.identity.cancelOrganizationInvitation({
        params: { invitationId: input.invitationId },
      })
  );
}

export async function updateOrganizationMemberRole(
  input: UpdateOrganizationMemberRoleInput
): Promise<UpdateOrganizationMemberRoleResponse> {
  return await runOrganizationMembersRequest(
    "OrganizationMembersClient.updateOrganizationMemberRole",
    (client) =>
      client.identity.updateOrganizationMemberRole({
        params: { memberId: input.memberId },
        payload: { role: input.role },
      })
  );
}

export async function removeOrganizationMember(
  input: RemoveOrganizationMemberInput
): Promise<RemoveOrganizationMemberResponse> {
  return await runOrganizationMembersRequest(
    "OrganizationMembersClient.removeOrganizationMember",
    (client) =>
      client.identity.removeOrganizationMember({
        params: { memberId: input.memberId },
      })
  );
}
