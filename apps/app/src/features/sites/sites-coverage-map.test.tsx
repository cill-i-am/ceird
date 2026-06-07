import { setTimeout as sleep } from "node:timers/promises";

import type { SiteIdType, SiteOption } from "@ceird/sites-core";
import { act, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { SitesCoverageMap } from "./sites-coverage-map";

const depotSiteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const schoolSiteId = "44444444-4444-4444-8444-444444444444" as SiteIdType;

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      search: _search,
      to,
      ...props
    }: ComponentProps<"a"> & { search?: unknown; to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
  };
});

vi.mock(import("./sites-coverage-map-canvas"), () => ({
  SitesCoverageMapCanvas: ({
    sites,
  }: {
    readonly sites: readonly { readonly site: { readonly name?: string } }[];
  }) => (
    <output data-testid="sites-coverage-map-canvas">
      {sites.map((site) => site.site.name ?? "Mapped site").join(" | ")}
    </output>
  ),
}));

describe("sites coverage map", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn<() => string>(() => "blob:test"),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  it("renders mapped sites into the canvas and lists unmapped sites", async () => {
    render(
      <SitesCoverageMap
        sites={[
          buildSite({
            hasUsableCoordinates: true,
            id: depotSiteId,
            latitude: 53.3498,
            longitude: -6.2603,
            name: "Depot",
          }),
          buildSite({
            addressLine1: "Main Street",
            id: schoolSiteId,
            name: "School",
            town: "Galway",
          }),
        ]}
      />
    );

    await expect(
      screen.findByTestId("sites-coverage-map-canvas")
    ).resolves.toHaveTextContent("Depot");
    expect(
      screen.getByRole("heading", { name: /mapped sites/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Depot" })).toHaveAttribute(
      "href",
      "/sites"
    );
    expect(screen.getByText(/1 mapped/i)).toBeInTheDocument();
    expect(screen.getByText(/1 unmapped/i)).toBeInTheDocument();
    expect(screen.getByText(/unverified location/i)).toBeInTheDocument();
    expect(screen.getByText("School")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: /maps/i })
        .map((link) => link.getAttribute("href"))
    ).toContainEqual(expect.stringContaining("Main+Street"));
    await flushScrollAreaEffects();
  });

  it("bounds the map panel and makes the site rail scrollable", async () => {
    render(
      <SitesCoverageMap
        sites={Array.from({ length: 12 }, (_, index) =>
          buildSite({
            hasUsableCoordinates: true,
            id: `55555555-5555-4555-8555-55555555555${index}` as SiteIdType,
            latitude: 53.3498 + index * 0.001,
            longitude: -6.2603 - index * 0.001,
            name: `Mapped site ${index + 1}`,
          })
        )}
      />
    );

    await expect(
      screen.findByTestId("sites-coverage-map-canvas")
    ).resolves.toHaveTextContent("Mapped site 1");
    expect(screen.getByLabelText("Site coverage map")).toHaveClass(
      "h-[clamp(20rem,calc(100vh-24rem),42rem)]"
    );
    const railScrollArea = screen.getByTestId("sites-map-site-rail-scroll");

    expect(railScrollArea).toHaveAttribute("data-slot", "scroll-area");
    await flushScrollAreaEffects();
  });

  it("renders the empty state when no visible sites have mapped coordinates", async () => {
    render(
      <SitesCoverageMap
        sites={[
          buildSite({
            addressLine1: "Main Street",
            id: schoolSiteId,
            name: "School",
            town: "Galway",
          }),
        ]}
      />
    );

    expect(screen.getByText(/no mapped sites/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /add coordinates to site addresses to make this view useful/i
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("sites-coverage-map-canvas")
    ).not.toBeInTheDocument();
    await flushScrollAreaEffects();
  });
});

async function flushScrollAreaEffects() {
  await act(async () => {
    await sleep(0);
  });
}

function buildSite(overrides: Partial<SiteOption> & Pick<SiteOption, "id">) {
  return {
    displayLocation: "Main Street, Galway",
    hasUsableCoordinates: false,
    labels: [],
    locationStatus: "unverified",
    name: "Site",
    ...overrides,
  } satisfies SiteOption;
}
