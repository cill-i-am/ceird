import { useNavigate } from "@tanstack/react-router";

import {
  buildInvitationContinuationSearch,
  getInvitationAcceptanceNavigationTarget,
} from "#/features/organizations/invitation-continuation";

export function getLoginNavigationTarget(invitationId?: string) {
  return {
    to: "/login" as const,
    search: buildInvitationContinuationSearch(invitationId),
  };
}

export type LoginNavigationTarget = ReturnType<typeof getLoginNavigationTarget>;

export function getSignupNavigationTarget(invitationId?: string) {
  return {
    to: "/signup" as const,
    search: buildInvitationContinuationSearch(invitationId),
  };
}

export function getForgotPasswordNavigationTarget(invitationId?: string) {
  return {
    to: "/forgot-password" as const,
    search: buildInvitationContinuationSearch(invitationId),
  };
}

export function getAuthSuccessNavigationTarget(invitationId?: string) {
  if (invitationId) {
    return getInvitationAcceptanceNavigationTarget(invitationId);
  }

  return {
    to: "/" as const,
  };
}

export function useAuthSuccessNavigation(invitationId?: string) {
  const navigate = useNavigate();

  return async () => {
    await navigate(getAuthSuccessNavigationTarget(invitationId));
  };
}
