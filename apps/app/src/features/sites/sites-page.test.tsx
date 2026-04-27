import { RegistryProvider } from "@effect-atom/atom-react";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  JobOptionsResponse,
  RegionIdType,
  SiteIdType,
} from "@task-tracker/jobs-core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { CommandBarProvider } from "#/features/command-bar/command-bar";
import {
  jobsOptionsStateAtom,
  seedJobsOptionsState,
} from "#/features/jobs/jobs-state";

import { SitesPage } from "./sites-page";

const regionId = "33333333-3333-4333-8333-333333333333" as RegionIdType;
const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;
const organizationId = decodeOrganizationId("org_123");

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

describe("sites page", () => {
  afterEach(() => {
    vi.clearAllMocks();
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

function renderSitesPage({
  options: pageOptions = options,
  role = "owner",
  withCommandBar = false,
}: {
  readonly options?: JobOptionsResponse;
  readonly role?: "owner" | "admin" | "member";
  readonly withCommandBar?: boolean;
} = {}) {
  const page = (
    <RegistryProvider
      initialValues={[
        [
          jobsOptionsStateAtom,
          seedJobsOptionsState(organizationId, pageOptions),
        ],
      ]}
    >
      <SitesPage viewer={{ role, userId: "user_123" }} />
    </RegistryProvider>
  );

  render(
    withCommandBar ? <CommandBarProvider>{page}</CommandBarProvider> : page
  );
}
