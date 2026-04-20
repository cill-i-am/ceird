import { createFileRoute } from "@tanstack/react-router";

import { PasswordResetRequestPage } from "#/features/auth/password-reset-request-page";
import { validateInvitationContinuationSearch } from "#/features/organizations/invitation-continuation";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: validateInvitationContinuationSearch,
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const search = Route.useSearch();

  return <PasswordResetRequestPage search={search} />;
}
