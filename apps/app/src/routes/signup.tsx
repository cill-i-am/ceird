import { createFileRoute } from "@tanstack/react-router";

import { redirectIfAuthenticated } from "#/features/auth/redirect-if-authenticated";
import { SignupPage } from "#/features/auth/signup-page";
import { validateInvitationContinuationSearch } from "#/features/organizations/invitation-continuation";

export const Route = createFileRoute("/signup")({
  validateSearch: validateInvitationContinuationSearch,
  beforeLoad: ({ search }) => redirectIfAuthenticated(search),
  component: SignupRoute,
});

function SignupRoute() {
  const search = Route.useSearch();

  return <SignupPage search={search} />;
}
