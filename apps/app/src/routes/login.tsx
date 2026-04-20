import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "#/features/auth/login-page";
import { redirectIfAuthenticated } from "#/features/auth/redirect-if-authenticated";
import { validateInvitationContinuationSearch } from "#/features/organizations/invitation-continuation";

export const Route = createFileRoute("/login")({
  validateSearch: validateInvitationContinuationSearch,
  beforeLoad: ({ search }) => redirectIfAuthenticated(search),
  component: LoginRoute,
});

function LoginRoute() {
  const search = Route.useSearch();

  return <LoginPage search={search} />;
}
