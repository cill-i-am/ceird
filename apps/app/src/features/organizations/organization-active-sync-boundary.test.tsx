import { decodeOrganizationId } from "@ceird/identity-core";
import { render, screen, waitFor } from "@testing-library/react";

import { OrganizationActiveSyncBoundary } from "./organization-active-sync-boundary";

const { mockedRouterInvalidate, mockedSynchronizeClientActiveOrganization } =
  vi.hoisted(() => ({
    mockedRouterInvalidate: vi.fn<() => Promise<void>>(),
    mockedSynchronizeClientActiveOrganization: vi.fn<() => Promise<void>>(),
  }));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: mockedRouterInvalidate,
  }),
}));

vi.mock("./organization-access", () => ({
  synchronizeClientActiveOrganization:
    mockedSynchronizeClientActiveOrganization,
}));

describe("OrganizationActiveSyncBoundary", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("synchronizes the active organization and invalidates router state", async () => {
    mockedSynchronizeClientActiveOrganization.mockResolvedValue();
    mockedRouterInvalidate.mockResolvedValue();

    render(
      <OrganizationActiveSyncBoundary
        activeOrganizationSync={{
          required: true,
          targetOrganizationId: decodeOrganizationId("org_next"),
        }}
      >
        <div>Loaded app</div>
      </OrganizationActiveSyncBoundary>
    );

    expect(screen.getByText(/loading your organization/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedSynchronizeClientActiveOrganization).toHaveBeenCalledWith({
        required: true,
        targetOrganizationId: "org_next",
      });
    });
    expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
    expect(await screen.findByText("Loaded app")).toBeInTheDocument();
  });
});
