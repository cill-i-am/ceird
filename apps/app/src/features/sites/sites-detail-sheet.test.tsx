import { decodeOrganizationId } from "@ceird/identity-core";
import type { UserId as UserIdType } from "@ceird/identity-core";
import type { JobListItem, WorkItemIdType } from "@ceird/jobs-core";
import type {
  ServiceAreaIdType,
  SiteIdType,
  SitesOptionsResponse,
} from "@ceird/sites-core";
import { RegistryProvider } from "@effect-atom/atom-react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import { SitesDetailSheet } from "./sites-detail-sheet";
import { seedSitesOptionsState, sitesOptionsStateAtom } from "./sites-state";

const organizationId = decodeOrganizationId("org_123");
const userId = "user_123" as UserIdType;
const serviceAreaId =
  "33333333-3333-4333-8333-333333333333" as ServiceAreaIdType;
const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;

const { mockedNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
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
  };
});

describe("sites detail sheet", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("splits location details, notes, editing, and related jobs into tabs", () => {
    renderSiteDetailSheet();

    expect(screen.getByRole("tab", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Jobs 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Edit" })).toBeInTheDocument();

    const detailsPanel = screen.getByRole("tabpanel", { name: "Details" });
    expect(
      within(detailsPanel).getByRole("heading", { name: "Location summary" })
    ).toBeInTheDocument();
    expect(
      within(detailsPanel).queryByText(
        "Dispatch address, map readiness, and access context."
      )
    ).not.toBeInTheDocument();
    expect(within(detailsPanel).getByText("Mapped")).toBeInTheDocument();
    expect(
      within(detailsPanel).getByText("1 Custom House Quay")
    ).toBeInTheDocument();
    expect(
      within(detailsPanel).getByText("Dublin, Dublin, D01 X2X2")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    const notesPanel = screen.getByRole("tabpanel", { name: "Notes" });
    expect(
      within(notesPanel).getByRole("heading", { name: "Site notes" })
    ).toBeInTheDocument();
    expect(
      within(notesPanel).queryByText(
        "Dispatch instructions and arrival context for anyone heading to this location."
      )
    ).not.toBeInTheDocument();
    expect(
      within(notesPanel).getByText(
        "Use the quay entrance beside the loading bay."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Jobs 1" }));
    const jobsPanel = screen.getByRole("tabpanel", { name: "Jobs 1" });
    expect(
      within(jobsPanel).getByRole("heading", { name: "Associated jobs" })
    ).toBeInTheDocument();
    expect(
      within(jobsPanel).queryByText("Work currently attached to this site.")
    ).not.toBeInTheDocument();
    expect(within(jobsPanel).getByText("1 job linked")).toBeInTheDocument();
    expect(within(jobsPanel).getByText("Inspect boiler")).toBeInTheDocument();
    expect(within(jobsPanel).getByText("In Progress")).toBeInTheDocument();
    expect(within(jobsPanel).getByText("High")).toBeInTheDocument();
  });

  it("signals when the related jobs list is capped", () => {
    renderSiteDetailSheet({ hasMoreRelatedJobs: true });

    expect(screen.getByRole("tab", { name: "Jobs 1+" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Jobs 1+" }));

    const jobsPanel = screen.getByRole("tabpanel", { name: "Jobs 1+" });
    expect(within(jobsPanel).getByText("1+ jobs linked")).toBeInTheDocument();
    expect(
      within(jobsPanel).getByText(
        "Showing the first 1 jobs linked to this site."
      )
    ).toBeInTheDocument();
  });
});

function renderSiteDetailSheet({
  hasMoreRelatedJobs = false,
  options = siteOptions,
}: {
  readonly hasMoreRelatedJobs?: boolean;
  readonly options?: SitesOptionsResponse;
} = {}) {
  const [site] = options.sites;

  if (!site) {
    throw new Error("Expected a site fixture.");
  }

  render(
    <RegistryProvider
      initialValues={[
        [sitesOptionsStateAtom, seedSitesOptionsState(organizationId, options)],
      ]}
    >
      <SitesDetailSheet
        hasMoreRelatedJobs={hasMoreRelatedJobs}
        initialSite={site}
        relatedJobs={relatedJobs}
        siteId={site.id}
        viewer={{
          role: "owner",
          userId,
        }}
      />
    </RegistryProvider>
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
      latitude: 53.3498,
      longitude: -6.2603,
      name: "Docklands Campus",
      serviceAreaId,
      serviceAreaName: "Dublin",
      town: "Dublin",
    },
  ],
};
