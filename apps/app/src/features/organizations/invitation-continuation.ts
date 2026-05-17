export interface InvitationContinuationSearch {
  readonly invitation: string | undefined;
}

export function validateInvitationContinuationSearch(
  search: Record<string, unknown>
): InvitationContinuationSearch {
  return {
    invitation:
      typeof search.invitation === "string" ? search.invitation : undefined,
  };
}

export function buildInvitationContinuationSearch(
  invitationId?: string
): InvitationContinuationSearch {
  return {
    invitation: invitationId,
  };
}

export function getInvitationAcceptanceNavigationTarget(invitationId: string) {
  return {
    to: "/accept-invitation/$invitationId" as const,
    params: {
      invitationId,
    },
  };
}
