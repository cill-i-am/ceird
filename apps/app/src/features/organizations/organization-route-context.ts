"use client";

import { useMatch } from "@tanstack/react-router";

export function useCurrentOrganizationRoleFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.currentOrganizationRole,
  });
}

export function useIsInOrganizationRoute() {
  return Boolean(
    useMatch({
      from: "/_app/_org",
      shouldThrow: false,
    })
  );
}
