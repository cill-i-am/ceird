import { decodeOrganizationId } from "@ceird/identity-core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OrganizationActiveSyncBoundary } from "./organization-active-sync-boundary";

const {
  mockedRouter,
  mockedRouterInvalidate,
  mockedSynchronizeClientActiveOrganization,
} = vi.hoisted(() => {
  const invalidate = vi.fn<() => Promise<void>>();

  return {
    mockedRouter: {
      invalidate,
    },
    mockedRouterInvalidate: invalidate,
    mockedSynchronizeClientActiveOrganization: vi.fn<() => Promise<void>>(),
  };
});

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useRouter: (() => mockedRouter) as typeof actual.useRouter,
  };
});

vi.mock(import("./organization-access"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    synchronizeClientActiveOrganization:
      mockedSynchronizeClientActiveOrganization as unknown as typeof actual.synchronizeClientActiveOrganization,
  };
});

const promiseWithResolvers = Promise as unknown as {
  withResolvers<Value>(): {
    promise: Promise<Value>;
    reject: (reason?: unknown) => void;
    resolve: (value?: Value | PromiseLike<Value>) => void;
  };
};

describe("organization active sync boundary", () => {
  beforeEach(() => {
    mockedRouterInvalidate.mockResolvedValue();
    mockedSynchronizeClientActiveOrganization.mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("synchronizes the active organization and invalidates router state", async () => {
    const syncDeferred = promiseWithResolvers.withResolvers<undefined>();
    const invalidateDeferred = promiseWithResolvers.withResolvers<undefined>();

    mockedSynchronizeClientActiveOrganization.mockReturnValue(
      syncDeferred.promise
    );
    mockedRouterInvalidate.mockReturnValue(invalidateDeferred.promise);

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
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
    expect(screen.queryByText("Loaded app")).not.toBeInTheDocument();

    syncDeferred.resolve();

    await waitFor(() => {
      expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
    });
    expect(screen.queryByText("Loaded app")).not.toBeInTheDocument();

    invalidateDeferred.resolve();

    await expect(screen.findByText("Loaded app")).resolves.toBeInTheDocument();
  });

  it("renders children immediately when sync is not required", () => {
    render(
      <OrganizationActiveSyncBoundary
        activeOrganizationSync={{
          required: false,
          targetOrganizationId: null,
        }}
      >
        <div>Loaded app</div>
      </OrganizationActiveSyncBoundary>
    );

    expect(screen.getByText("Loaded app")).toBeInTheDocument();
    expect(mockedSynchronizeClientActiveOrganization).not.toHaveBeenCalled();
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  });

  it("synchronizes null active organization targets", async () => {
    render(
      <OrganizationActiveSyncBoundary
        activeOrganizationSync={{
          required: true,
          targetOrganizationId: null,
        }}
      >
        <div>Loaded app</div>
      </OrganizationActiveSyncBoundary>
    );

    await waitFor(() => {
      expect(mockedSynchronizeClientActiveOrganization).toHaveBeenCalledWith({
        required: true,
        targetOrganizationId: null,
      });
    });
    await waitFor(() => {
      expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
    });
    await expect(screen.findByText("Loaded app")).resolves.toBeInTheDocument();
  });

  it("shows an error when sync fails", async () => {
    mockedSynchronizeClientActiveOrganization.mockRejectedValue(
      new Error("sync failed")
    );

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

    await expect(
      screen.findByText(/couldn't load your organization/i)
    ).resolves.toBeInTheDocument();
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
    expect(screen.queryByText("Loaded app")).not.toBeInTheDocument();
  });

  it("retries active organization sync after an error", async () => {
    mockedSynchronizeClientActiveOrganization.mockRejectedValue(
      new Error("sync failed")
    );

    const user = userEvent.setup();
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

    await expect(
      screen.findByText(/couldn't load your organization/i)
    ).resolves.toBeInTheDocument();

    mockedSynchronizeClientActiveOrganization.mockResolvedValue();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    await expect(screen.findByText("Loaded app")).resolves.toBeInTheDocument();
    expect(mockedSynchronizeClientActiveOrganization).toHaveBeenCalledTimes(2);
    expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
  });

  it("shows an error when router invalidation fails after sync", async () => {
    mockedRouterInvalidate.mockRejectedValue(new Error("refresh failed"));

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

    await expect(
      screen.findByText(/couldn't load your organization/i)
    ).resolves.toBeInTheDocument();
    expect(mockedSynchronizeClientActiveOrganization).toHaveBeenCalledWith({
      required: true,
      targetOrganizationId: "org_next",
    });
    expect(screen.queryByText("Loaded app")).not.toBeInTheDocument();
  });
});
