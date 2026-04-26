import type {
  JobListItem,
  SiteIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { JobsCoverageMap } from "./jobs-coverage-map";

const depotJobId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const schoolJobId = "22222222-2222-4222-8222-222222222222" as WorkItemIdType;
const depotSiteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const schoolSiteId = "44444444-4444-4444-8444-444444444444" as SiteIdType;

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

vi.mock(import("./jobs-coverage-map-canvas"), () => ({
  JobsCoverageMapCanvas: ({
    groups,
  }: {
    readonly groups: readonly { readonly site: { readonly name?: string } }[];
  }) => (
    <output data-testid="coverage-map-canvas">
      {groups.map((group) => group.site.name ?? "Pinned site").join(" | ")}
    </output>
  ),
}));

describe("jobs coverage map", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn<() => string>(() => "blob:test"),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  it("groups mapped jobs into the interactive canvas and lists unmapped work", async () => {
    render(
      <JobsCoverageMap
        jobs={[
          buildJob({
            id: depotJobId,
            priority: "high",
            siteId: depotSiteId,
            status: "blocked",
            title: "Await switchgear",
          }),
          buildJob({
            id: schoolJobId,
            priority: "medium",
            siteId: schoolSiteId,
            status: "triaged",
            title: "Check classroom snag",
          }),
        ]}
        sites={
          new Map([
            [
              depotSiteId,
              {
                id: depotSiteId,
                latitude: 53.3498,
                longitude: -6.2603,
                name: "Depot",
                regionName: "North",
              },
            ],
            [
              schoolSiteId,
              {
                addressLine1: "Main Street",
                id: schoolSiteId,
                name: "School",
                town: "Galway",
              },
            ],
          ])
        }
      />
    );

    await expect(
      screen.findByTestId("coverage-map-canvas")
    ).resolves.toHaveTextContent("Depot");
    expect(screen.getByText(/1 without pin/i)).toBeInTheDocument();
    expect(screen.getByText("Check classroom snag")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /maps/i })).toHaveAttribute(
      "href",
      expect.stringContaining("Main+Street")
    );
  }, 1000);

  it("renders the empty state when no visible jobs have mapped sites", () => {
    render(<JobsCoverageMap jobs={[]} sites={new Map()} />);

    expect(screen.getByText(/no mapped jobs/i)).toBeInTheDocument();
    expect(screen.queryByTestId("coverage-map-canvas")).not.toBeInTheDocument();
  }, 1000);
});

function buildJob(
  overrides: Partial<JobListItem> & Pick<JobListItem, "id" | "status" | "title">
): JobListItem {
  const { id, status, title, ...rest } = overrides;

  return {
    createdAt: "2026-04-23T11:00:00.000Z",
    id,
    kind: "job",
    priority: "none",
    status,
    title,
    updatedAt: "2026-04-23T12:00:00.000Z",
    ...rest,
  };
}
