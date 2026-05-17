import { createFileRoute } from "@tanstack/react-router";

import { OAuthConsentPage } from "#/features/auth/oauth-consent-page";
import type { OAuthConsentSearch } from "#/features/auth/oauth-consent-page";

export const Route = createFileRoute("/oauth/consent")({
  validateSearch: (search: Record<string, unknown>): OAuthConsentSearch => {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(search)) {
      normalized[key] = normalizeOAuthConsentSearchValue(value);
    }

    return {
      ...normalized,
      client_id: normalizeOAuthConsentSearchString(search.client_id),
      redirect_uri: normalizeOAuthConsentSearchString(search.redirect_uri),
      scope: normalizeOAuthConsentSearchString(search.scope),
    };
  },
  component: OAuthConsentRoute,
});

export function normalizeOAuthConsentSearchValue(
  value: unknown
):
  | string
  | number
  | boolean
  | readonly (string | number | boolean)[]
  | undefined {
  if (Array.isArray(value)) {
    const values = value.flatMap((item) => {
      const normalized = normalizeOAuthConsentSearchPrimitive(item);

      return normalized === undefined ? [] : [normalized];
    });

    return values.length > 0 ? values : undefined;
  }

  return normalizeOAuthConsentSearchPrimitive(value);
}

function normalizeOAuthConsentSearchString(value: unknown): string | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return undefined;
}

function normalizeOAuthConsentSearchPrimitive(
  value: unknown
): string | number | boolean | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

function OAuthConsentRoute() {
  const search = Route.useSearch();

  return <OAuthConsentPage search={search} />;
}
