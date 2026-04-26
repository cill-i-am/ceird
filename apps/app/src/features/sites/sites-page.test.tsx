import { RegistryProvider } from "@effect-atom/atom-react";
import type {
  JobOptionsResponse,
  RegionIdType,
  SiteIdType,
} from "@task-tracker/jobs-core";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import {
  jobsOptionsStateAtom,
  seedJobsOptionsState,
} from "#/features/jobs/jobs-state";

import { SitesPage } from "./sites-page";

const regionId = "33333333-3333-4333-8333-333333333333" as RegionIdType;
const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;

const options: JobOptionsResponse = {
  contacts: [],
  members: [],
  regions: [
    {
      id: regionId,
      name: "Dublin",
    },
  ],
  sites: [
    {
      addressLine1: "1 Custom House Quay",
      id: siteId,
      name: "Docklands Campus",
      regionId,
      regionName: "Dublin",
      town: "Dublin",
    },
  ],
};

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: ComponentProps<"a"> & { to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
  };
});

describe("sites page", () => {
  it(
    "lists organization sites and exposes standalone creation to admins",
    { timeout: 10_000 },
    () => {
      renderSitesPage();

      expect(
        screen.getByRole("heading", { name: "Sites" })
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /new site/i })).toHaveAttribute(
        "href",
        "/sites/new"
      );

      const row = screen.getByRole("row", { name: /docklands campus/i });
      expect(within(row).getByText("Dublin")).toBeInTheDocument();
      expect(within(row).getByText(/1 Custom House Quay/)).toBeInTheDocument();
    }
  );

  it(
    "hides standalone creation from organization members",
    { timeout: 10_000 },
    () => {
      renderSitesPage({ role: "member" });

      expect(
        screen.queryByRole("link", { name: /new site/i })
      ).not.toBeInTheDocument();
      expect(screen.getByText("Docklands Campus")).toBeInTheDocument();
    }
  );
});

function renderSitesPage({
  role = "owner",
}: { readonly role?: "owner" | "admin" | "member" } = {}) {
  render(
    <RegistryProvider
      initialValues={[
        [jobsOptionsStateAtom, seedJobsOptionsState("org_123", options)],
      ]}
    >
      <SitesPage viewer={{ role, userId: "user_123" }} />
    </RegistryProvider>
  );
}
