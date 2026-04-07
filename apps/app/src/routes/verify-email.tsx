import { createFileRoute } from "@tanstack/react-router";

import { EmailVerificationPage } from "#/features/auth/email-verification-page";
import { decodeEmailVerificationSearch } from '#/features/auth/email-verification-search';
import type { EmailVerificationSearch } from '#/features/auth/email-verification-search';

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): EmailVerificationSearch =>
    decodeEmailVerificationSearch(search),
  component: VerifyEmailRoute,
});

function VerifyEmailRoute() {
  const search = Route.useSearch();

  return <EmailVerificationPage search={search} />;
}
