import { createFileRoute } from "@tanstack/react-router";

import { PasswordResetPage } from "#/features/auth/password-reset-page";
import { decodePasswordResetSearch } from "#/features/auth/password-reset-search";

export const Route = createFileRoute("/reset-password")({
  validateSearch: decodePasswordResetSearch,
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const search = Route.useSearch();

  return <PasswordResetPage search={search} />;
}
