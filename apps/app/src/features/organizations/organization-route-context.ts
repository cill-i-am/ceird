"use client";
import { useMatch } from "@tanstack/react-router";

export function useCurrentOrganizationRoleFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.currentOrganizationRole,
  });
}

export function useActiveOrganizationFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.activeOrganization,
  });
}

export function useActiveOrganizationIdFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.activeOrganizationId,
  });
}

export function useOrganizationsFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.organizations,
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
