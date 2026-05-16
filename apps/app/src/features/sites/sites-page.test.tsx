import { decodeOrganizationId } from "@ceird/identity-core";
import type { UserId as UserIdType } from "@ceird/identity-core";
import type {
  ServiceAreaIdType,
  SiteIdType,
  SitesOptionsResponse,
} from "@ceird/sites-core";
import { RegistryProvider } from "@effect-atom/atom-react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { CommandBarProvider } from "#/features/command-bar/command-bar";

import { SitesPage } from "./sites-page";
import { seedSitesOptionsState, sitesOptionsStateAtom } from "./sites-state";

const serviceAreaId =
  "33333333-3333-4333-8333-333333333333" as ServiceAreaIdType;
const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;
const userId = "user_123" as UserIdType;
const organizationId = decodeOrganizationId("org_123");
const originalInnerWidth = window.innerWidth;

const options: SitesOptionsResponse = {
  serviceAreas: [
    {
      id: serviceAreaId,
      name: "Dublin",
    },
  ],
  sites: [
    {
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

const mixedSitesOptions: SitesOptionsResponse = {
  ...options,
  serviceAreas: [
    ...options.serviceAreas,
    {
      id: "44444444-4444-4444-8444-444444444444" as ServiceAreaIdType,
      name: "South Dublin",
    },
  ],
  sites: [
    options.sites[0],
    {
      addressLine1: "2 North Point",
      country: "IE",
      county: "Dublin",
      eircode: "D09 A1B2",
      geocodedAt: "2026-04-27T10:00:00.000Z",
      geocodingProvider: "stub",
      id: "66666666-6666-4666-8666-666666666666" as SiteIdType,
      labels: [],
      latitude: 53.4049,
      longitude: -6.2462,
      name: "Northpoint Office",
      serviceAreaId:
        "44444444-4444-4444-8444-444444444444" as ServiceAreaIdType,
      serviceAreaName: "South Dublin",
      town: "Santry",
    },
  ],
};

const { mockedNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      params,
      to,
      ...props
    }: ComponentProps<"a"> & {
      params?: { siteId?: string };
      to?: string;
    }) => (
      <a href={buildMockLinkHref(to, params)} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
  };
});

describe("sites page", () => {
  afterEach(() => {
    vi.clearAllMocks();
    act(() => {
      setViewportWidth(originalInnerWidth);
    });
  });

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
      expect(screen.getByText("N")).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: /site coverage/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Keep job locations, service areas, and map readiness in one operational directory."
        )
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Site directory" })
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Sites mobile directory")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Addresses, service areas, and map readiness for active work."
        )
      ).not.toBeInTheDocument();
      expect(screen.queryByText("1 mapped / 1 total")).not.toBeInTheDocument();

      const row = screen.getByRole("row", { name: /docklands campus/i });
      expect(within(row).getByText("Dublin")).toBeInTheDocument();
      expect(within(row).getByText(/1 Custom House Quay/)).toBeInTheDocument();
      expect(
        screen.queryByRole("columnheader", { name: "Map" })
      ).not.toBeInTheDocument();
      expect(within(row).getByLabelText("Map ready")).toBeInTheDocument();
      expect(within(row).queryByText("Mapped")).not.toBeInTheDocument();
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

  it("mounts the mobile directory instead of the desktop table on mobile", () => {
    act(() => {
      setViewportWidth(390);
    });

    renderSitesPage();

    expect(screen.getByLabelText("Sites mobile directory")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /docklands campus/i })
    ).toHaveAttribute("href", `/sites/${siteId}`);
    expect(
      screen.queryByRole("row", { name: /docklands campus/i })
    ).not.toBeInTheDocument();
  });

  it("opens a site detail route when the row is clicked", () => {
    renderSitesPage();

    fireEvent.click(screen.getByRole("row", { name: /docklands campus/i }));

    expect(mockedNavigate).toHaveBeenCalledWith({
      params: { siteId },
      to: "/sites/$siteId",
    });
  });

  it("filters sites by supported site text", async () => {
    const user = userEvent.setup();

    renderSitesPage({ options: mixedSitesOptions });

    await user.type(
      screen.getByRole("searchbox", { name: "Search sites" }),
      "north"
    );

    expect(screen.getByText("Northpoint Office")).toBeInTheDocument();
    expect(screen.queryByText("Docklands Campus")).not.toBeInTheDocument();
    expect(screen.queryByText("1 site shown")).not.toBeInTheDocument();
  });

  it("filters sites by service area without exposing unsupported status fields", async () => {
    const user = userEvent.setup();

    renderSitesPage({ options: mixedSitesOptions });

    await user.selectOptions(
      screen.getByLabelText("Filter by service area"),
      "44444444-4444-4444-8444-444444444444"
    );

    expect(screen.getByText("Northpoint Office")).toBeInTheDocument();
    expect(screen.queryByText("Docklands Campus")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Status" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Lead" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Labels" })
    ).not.toBeInTheDocument();
  });

  it("keeps the empty state informational instead of duplicating creation", () => {
    renderSitesPage({
      options: {
        ...options,
        sites: [],
      },
    });

    expect(screen.getByText("No sites in this workspace.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /site coverage/i })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /new site/i })).toHaveLength(1);
  });

  it(
    "registers site page actions in the command bar",
    { timeout: 10_000 },
    async () => {
      const user = userEvent.setup();

      renderSitesPage({ withCommandBar: true });

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /open docklands campus/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("option", { name: /open docklands campus/i })
      );

      expect(mockedNavigate).toHaveBeenCalledWith({
        params: { siteId },
        to: "/sites/$siteId",
      });
    }
  );

  it("opens site creation with the route hotkey", () => {
    renderSitesPage();

    fireEvent.keyDown(document, { code: "KeyN", key: "n" });

    expect(mockedNavigate).toHaveBeenCalledWith({ to: "/sites/new" });
  });

  it(
    "caps eager site entity commands in the command bar",
    { timeout: 10_000 },
    async () => {
      renderSitesPage({
        options: {
          ...options,
          sites: Array.from({ length: 26 }, (_, index) => ({
            ...options.sites[0],
            id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}` as SiteIdType,
            name: `Site ${String(index + 1).padStart(2, "0")}`,
          })),
        },
        withCommandBar: true,
      });

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /open site 25/i })
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("option", { name: /open site 26/i })
      ).not.toBeInTheDocument();
    }
  );
});

function buildMockLinkHref(
  to: string | undefined,
  params: { readonly siteId?: string } | undefined
) {
  if (!to) {
    return;
  }

  return params?.siteId ? to.replace("$siteId", params.siteId) : to;
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

function renderSitesPage({
  options: pageOptions = options,
  role = "owner",
  withCommandBar = false,
}: {
  readonly options?: SitesOptionsResponse;
  readonly role?: "owner" | "admin" | "member";
  readonly withCommandBar?: boolean;
} = {}) {
  const page = (
    <HotkeysProvider>
      <RegistryProvider
        initialValues={[
          [
            sitesOptionsStateAtom,
            seedSitesOptionsState(organizationId, pageOptions),
          ],
        ]}
      >
        <SitesPage viewer={{ role, userId }} />
      </RegistryProvider>
    </HotkeysProvider>
  );

  render(
    withCommandBar ? <CommandBarProvider>{page}</CommandBarProvider> : page
  );
}
