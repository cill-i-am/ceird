import { decodeUserId } from "@ceird/identity-core";
import type { SiteIdType, SitesOptionsResponse } from "@ceird/sites-core";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";

import { SitesPage } from "./sites-page";
import type { SitesProximityPanelProps } from "./sites-proximity-panel";

const stateProbe = vi.hoisted(() => ({
  isMobile: false,
  options: { sites: [] } as SitesOptionsResponse,
}));

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
    useNavigate: () =>
      vi.fn<(options?: unknown) => Promise<void>>(() => Promise.resolve()),
  };
});

vi.mock(import("#/features/command-bar/command-bar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useRegisterCommandActions: vi.fn<(actions?: unknown) => void>(),
  };
});

vi.mock(import("#/hotkeys/use-app-hotkey"), () => ({
  useAppHotkey: vi.fn<(...args: readonly unknown[]) => void>(),
  useAppHotkeySequence: vi.fn<(...args: readonly unknown[]) => void>(),
}));

vi.mock(import("#/hooks/use-mobile"), () => ({
  useIsMobile: () => stateProbe.isMobile,
}));

vi.mock(import("./sites-state"), () => ({
  useSitesNotice: () => [null, vi.fn<() => void>()] as const,
  useSitesOptions: () => stateProbe.options,
}));

vi.mock(import("./sites-proximity-panel"), () => ({
  SitesProximityPanel: ({
    children,
  }: PropsWithChildren<SitesProximityPanelProps>) => <>{children}</>,
}));

describe("site directory page", () => {
  afterEach(() => {
    stateProbe.isMobile = false;
    stateProbe.options = { sites: [] };
  });

  it("shows active job signals in the desktop site directory", () => {
    stateProbe.options = {
      sites: [
        buildSite({
          activeJobCount: 3,
          highestActiveJobPriority: "urgent",
          id: "11111111-1111-4111-8111-111111111111" as SiteIdType,
          name: "Annacotty Road Homes",
        }),
        buildSite({
          activeJobCount: 0,
          id: "22222222-2222-4222-8222-222222222222" as SiteIdType,
          name: "Barrington Street Clinic",
        }),
      ],
    };

    render(
      <SitesPage viewer={{ role: "owner", userId: decodeUserId("user_123") }} />
    );

    const activeSiteRow = screen.getByRole("row", {
      name: /open annacotty road homes/i,
    });
    const inactiveSiteRow = screen.getByRole("row", {
      name: /open barrington street clinic/i,
    });

    expect(within(activeSiteRow).getByText("3 active jobs")).toBeVisible();
    expect(within(activeSiteRow).getByText("Urgent")).toBeVisible();
    expect(within(inactiveSiteRow).queryByText(/active jobs/i)).toBeNull();
  });

  it("shows active job signals in the mobile site directory", () => {
    stateProbe.isMobile = true;
    stateProbe.options = {
      sites: [
        buildSite({
          activeJobCount: 1,
          highestActiveJobPriority: "high",
          id: "11111111-1111-4111-8111-111111111111" as SiteIdType,
          name: "Annacotty Road Homes",
        }),
        buildSite({
          activeJobCount: 0,
          id: "22222222-2222-4222-8222-222222222222" as SiteIdType,
          name: "Barrington Street Clinic",
        }),
      ],
    };

    render(
      <SitesPage viewer={{ role: "owner", userId: decodeUserId("user_123") }} />
    );

    const mobileDirectory = screen.getByRole("list", {
      name: "Sites mobile directory",
    });

    expect(within(mobileDirectory).getByText("1 active job")).toBeVisible();
    expect(within(mobileDirectory).getByText("High")).toBeVisible();
    expect(
      within(mobileDirectory).queryByText(/0 active jobs/i)
    ).not.toBeInTheDocument();
  });
});

function buildSite(
  overrides: Partial<SitesOptionsResponse["sites"][number]> &
    Pick<SitesOptionsResponse["sites"][number], "id">
): SitesOptionsResponse["sites"][number] {
  return {
    activeJobCount: 0,
    displayLocation: "Limerick",
    hasUsableCoordinates: true,
    labels: [],
    latitude: 52.6638,
    locationStatus: "google_resolved",
    longitude: -8.6267,
    name: "Site",
    updatedAt: "2026-06-06T10:00:00.000Z",
    ...overrides,
  };
}
