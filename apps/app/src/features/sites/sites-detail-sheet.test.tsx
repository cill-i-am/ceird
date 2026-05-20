import { decodeOrganizationId } from "@ceird/identity-core";
import type { UserId as UserIdType } from "@ceird/identity-core";
import type { JobListItem, WorkItemIdType } from "@ceird/jobs-core";
import type {
  ServiceAreaIdType,
  SiteIdType,
  SitesOptionsResponse,
} from "@ceird/sites-core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";

import { SitesDetailSheet } from "./sites-detail-sheet";
import { SitesStateProvider } from "./sites-state";

const organizationId = decodeOrganizationId("org_123");
const userId = "user_123" as UserIdType;
const serviceAreaId =
  "33333333-3333-4333-8333-333333333333" as ServiceAreaIdType;
const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;

const { mockedNavigate, mockedPathname } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
  mockedPathname: {
    current: "/sites/55555555-5555-4555-8555-555555555555",
  },
}));

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
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
    useRouterState: (({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown;
    }) =>
      select({
        location: {
          pathname: mockedPathname.current,
        },
      })) as typeof actual.useRouterState,
  };
});

describe("sites detail sheet", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockedPathname.current = `/sites/${siteId}`;
  });

  it("shows site location, notes, and related jobs in one overview", () => {
    renderSiteDetailSheet();

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit site" })
    ).not.toBeInTheDocument();

    const overview = screen.getByRole("region", {
      name: "Docklands Campus overview",
    });
    const siteDetails = within(overview).getByRole("region", {
      name: "Site details",
    });
    expect(
      within(siteDetails).getByRole("heading", { name: "Location" })
    ).toBeInTheDocument();
    expect(
      within(siteDetails).getByText("1 Custom House Quay")
    ).toBeInTheDocument();
    expect(
      within(siteDetails).getByText("Dublin, Dublin, D01 X2X2")
    ).toBeInTheDocument();
    expect(within(siteDetails).getByText("Service area")).toBeInTheDocument();
    expect(within(siteDetails).getByText("Dublin")).toBeInTheDocument();
    expect(
      within(siteDetails).queryByText("53.3498, -6.2603")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Map ready")).not.toBeInTheDocument();

    expect(
      within(siteDetails).getByRole("heading", { name: "Notes summary" })
    ).toBeInTheDocument();
    expect(
      within(siteDetails).getByText(
        "Use the quay entrance beside the loading bay."
      )
    ).toBeInTheDocument();
    expect(
      within(siteDetails).getByLabelText("Map preview")
    ).toBeInTheDocument();

    const relatedJobsRegion = within(overview).getByRole("region", {
      name: "Related jobs",
    });
    expect(
      within(relatedJobsRegion).getByRole("heading", { name: "Related jobs" })
    ).toBeInTheDocument();
    expect(within(relatedJobsRegion).getByText("1")).toBeInTheDocument();
    expect(
      within(relatedJobsRegion).getByText("Inspect boiler")
    ).toBeInTheDocument();
    expect(
      within(relatedJobsRegion).getByText("In progress")
    ).toBeInTheDocument();
    expect(within(relatedJobsRegion).getByText("High")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit site name" })
    ).toBeInTheDocument();
  });

  it("signals when the related jobs list is capped", () => {
    renderSiteDetailSheet({ hasMoreRelatedJobs: true });

    const overview = screen.getByRole("region", {
      name: "Docklands Campus overview",
    });
    expect(within(overview).getByText("1+")).toBeInTheDocument();
    expect(
      within(overview).getByText(
        "Showing the first 1 jobs linked to this site."
      )
    ).toBeInTheDocument();
  });

  it("links the empty jobs state to the new job route for admins", () => {
    renderSiteDetailSheet({ relatedJobs: [] });

    const relatedJobsRegion = screen.getByRole("region", {
      name: "Related jobs",
    });
    expect(within(relatedJobsRegion).getByText("0")).toBeInTheDocument();
    expect(
      within(relatedJobsRegion).getByRole("link", { name: "New job" })
    ).toHaveAttribute("href", "/jobs/new");
  });

  it("hides the empty jobs creation link from members", () => {
    renderSiteDetailSheet({ relatedJobs: [], role: "member" });

    const relatedJobsRegion = screen.getByRole("region", {
      name: "Related jobs",
    });
    expect(
      within(relatedJobsRegion).queryByRole("link", { name: "New job" })
    ).not.toBeInTheDocument();
  });

  it("edits the site name inline from the drawer header", () => {
    renderSiteDetailSheet();

    fireEvent.click(screen.getByRole("button", { name: "Edit site name" }));

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Edit Docklands Campus" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Site name")).toHaveValue("Docklands Campus");
    expect(
      screen.getByRole("button", { name: "Save site name" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel site name editing" })
    ).toBeInTheDocument();
  });

  it("lets Vaul close the base route drawer before routing back", async () => {
    renderSiteDetailSheet();

    fireEvent.click(screen.getByRole("button", { name: "Close site details" }));

    expect(mockedNavigate).not.toHaveBeenCalled();

    await waitFor(
      () => {
        expect(mockedNavigate).toHaveBeenCalledWith({ to: "/sites" });
      },
      { timeout: 1000 }
    );
  });

  it("opens scoped editors for service area, notes, and location", async () => {
    renderSiteDetailSheet();

    fireEvent.click(screen.getByRole("button", { name: "Edit service area" }));
    expect(
      screen.getByRole("dialog", { name: "Edit service area" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Service area")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save service area" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Edit notes summary" })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit notes summary" }));
    expect(
      screen.getByRole("dialog", { name: "Edit notes summary" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Notes summary")).toHaveValue(
      "Use the quay entrance beside the loading bay."
    );
    expect(
      screen.getByRole("button", { name: "Save notes" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Edit location" })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    expect(
      screen.getByRole("dialog", { name: "Edit location" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Address line 1")).toHaveValue(
      "1 Custom House Quay"
    );
    expect(
      screen.getByRole("button", { name: "Save location" })
    ).toBeInTheDocument();
  });
});

function renderSiteDetailSheet({
  hasMoreRelatedJobs = false,
  options = siteOptions,
  relatedJobs: jobs = relatedJobs,
  role = "owner",
}: {
  readonly hasMoreRelatedJobs?: boolean;
  readonly options?: SitesOptionsResponse;
  readonly relatedJobs?: readonly JobListItem[];
  readonly role?: "admin" | "member" | "owner";
} = {}) {
  const [site] = options.sites;

  if (!site) {
    throw new Error("Expected a site fixture.");
  }

  render(
    <SitesStateProvider
      activeOrganizationId={organizationId}
      options={options}
      viewer={{
        role,
        userId,
      }}
    >
      <SitesDetailSheet
        hasMoreRelatedJobs={hasMoreRelatedJobs}
        initialSite={site}
        relatedJobs={jobs}
        siteId={site.id}
        viewer={{
          role,
          userId,
        }}
      />
    </SitesStateProvider>
  );
}

const relatedJobs: readonly JobListItem[] = [
  {
    createdAt: "2026-04-23T10:00:00.000Z",
    id: "77777777-7777-4777-8777-777777777777" as WorkItemIdType,
    kind: "job",
    labels: [],
    priority: "high",
    siteId,
    status: "in_progress",
    title: "Inspect boiler",
    updatedAt: "2026-04-23T12:00:00.000Z",
  },
];

const siteOptions: SitesOptionsResponse = {
  serviceAreas: [
    {
      id: serviceAreaId,
      name: "Dublin",
    },
  ],
  sites: [
    {
      accessNotes: "Use the quay entrance beside the loading bay.",
      addressLine1: "1 Custom House Quay",
      country: "IE",
      county: "Dublin",
      eircode: "D01 X2X2",
      geocodedAt: "2026-04-27T10:00:00.000Z",
      geocodingProvider: "stub",
      id: siteId,
      labels: [],
      latitude: 53.3498,
      longitude: -6.2603,
      name: "Docklands Campus",
      serviceAreaId,
      serviceAreaName: "Dublin",
      town: "Dublin",
    },
  ],
};
