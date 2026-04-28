"use client";

import { useMatch } from "@tanstack/react-router";

export function useCurrentOrganizationRoleFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.currentOrganizationRole,
  });
}
