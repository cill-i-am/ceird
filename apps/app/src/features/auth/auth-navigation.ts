import { useNavigate } from "@tanstack/react-router";

import {
  buildInvitationContinuationSearch,
  getInvitationAcceptanceNavigationTarget,
} from "#/features/organizations/invitation-continuation";

export const authCardViewTransition = {
  types: ["auth-card"],
};

export function getLoginNavigationTarget(invitationId?: string) {
  return {
    to: "/login" as const,
    search: buildInvitationContinuationSearch(invitationId),
    viewTransition: authCardViewTransition,
  };
}

export type LoginNavigationTarget = ReturnType<typeof getLoginNavigationTarget>;

export function getSignupNavigationTarget(invitationId?: string) {
  return {
    to: "/signup" as const,
    search: buildInvitationContinuationSearch(invitationId),
    viewTransition: authCardViewTransition,
  };
}

export function getForgotPasswordNavigationTarget(invitationId?: string) {
  return {
    to: "/forgot-password" as const,
    search: buildInvitationContinuationSearch(invitationId),
    viewTransition: authCardViewTransition,
  };
}

export function getAuthSuccessNavigationTarget(invitationId?: string) {
  if (invitationId) {
    return getInvitationAcceptanceNavigationTarget(invitationId);
  }

  return {
    to: "/" as const,
    viewTransition: authCardViewTransition,
  };
}

function getInvitationAcceptanceHref(invitationId: string) {
  return `/accept-invitation/${encodeURIComponent(invitationId)}`;
}

export function useAuthSuccessNavigation(invitationId?: string) {
  const navigate = useNavigate({ from: "/" });

  return async () => {
    if (invitationId && typeof window !== "undefined") {
      window.location.assign(getInvitationAcceptanceHref(invitationId));
      return;
    }

    await navigate(getAuthSuccessNavigationTarget(invitationId));
  };
}
