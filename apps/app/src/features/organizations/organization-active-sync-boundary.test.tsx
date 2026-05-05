import { decodeOrganizationId } from "@ceird/identity-core";
import { render, screen, waitFor } from "@testing-library/react";

import { OrganizationActiveSyncBoundary } from "./organization-active-sync-boundary";

const { mockedRouterInvalidate, mockedSynchronizeClientActiveOrganization } =
  vi.hoisted(() => ({
    mockedRouterInvalidate: vi.fn<() => Promise<void>>(),
    mockedSynchronizeClientActiveOrganization: vi.fn<() => Promise<void>>(),
  }));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useRouter: (() => ({
      invalidate: mockedRouterInvalidate,
    })) as typeof actual.useRouter,
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
});
