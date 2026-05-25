import { SiteId } from "@ceird/sites-core";
import type { SiteIdType } from "@ceird/sites-core";
import { createFileRoute } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { JobsCreateSheet } from "#/features/jobs/jobs-create-sheet";
import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-route-access";

export const Route = createFileRoute("/_app/_org/jobs/new")({
  staticData: {
    breadcrumb: {
      label: "New job",
      to: "/jobs/new",
    },
  },
  validateSearch: decodeJobsNewSearch,
  beforeLoad: ({ context }) => {
    assertOrganizationAdministrationRouteContext(context);
  },
  component: JobsCreateRoute,
});

function decodeJobsNewSearch(input: unknown): { readonly siteId?: SiteIdType } {
  const siteId = readSearchParam(input, "siteId");

  return {
    siteId: Option.getOrUndefined(Schema.decodeUnknownOption(SiteId)(siteId)),
  };
}

function JobsCreateRoute() {
  const { siteId } = Route.useSearch();

  return <JobsCreateSheet initialSiteId={siteId} />;
}

function readSearchParam(input: unknown, key: string) {
  if (typeof input !== "object" || input === null) {
    return;
  }

  const value = (input as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}
