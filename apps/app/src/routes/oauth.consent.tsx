import { createFileRoute } from "@tanstack/react-router";

import { OAuthConsentPage } from "#/features/auth/oauth-consent-page";
import type { OAuthConsentSearch } from "#/features/auth/oauth-consent-page";

export const Route = createFileRoute("/oauth/consent")({
  validateSearch: (search: Record<string, unknown>): OAuthConsentSearch => {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(search)) {
      normalized[key] =
        typeof value === "string" || Array.isArray(value) ? value : undefined;
    }

    return {
      ...normalized,
      client_id:
        typeof search.client_id === "string" ? search.client_id : undefined,
      redirect_uri:
        typeof search.redirect_uri === "string"
          ? search.redirect_uri
          : undefined,
      scope: typeof search.scope === "string" ? search.scope : undefined,
    };
  },
  component: OAuthConsentRoute,
});

function OAuthConsentRoute() {
  const search = Route.useSearch();

  return <OAuthConsentPage search={search} />;
}
