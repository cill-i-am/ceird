import { decodeOrganizationId } from "@ceird/identity-core";
import { isRedirect } from "@tanstack/react-router";
import type { ReactNode } from "react";

const {
  mockedEnsureActiveOrganizationIdForSession,
  mockedGetCurrentOrganizationMemberRole,
} = vi.hoisted(() => ({
  mockedEnsureActiveOrganizationIdForSession:
    vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mockedGetCurrentOrganizationMemberRole:
    vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock(import("#/features/command-bar/app-global-command-actions"), () => ({
  AppOrganizationCommandActions: () => null,
}));

vi.mock(
  import("#/features/organizations/organization-active-sync-boundary"),
  () => ({
    OrganizationActiveSyncBoundary: ({
      children,
    }: {
      readonly children: ReactNode;
    }) => children,
  })
);

vi.mock(
  import("#/features/organizations/organization-access"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      ensureActiveOrganizationIdForSession:
        mockedEnsureActiveOrganizationIdForSession as typeof actual.ensureActiveOrganizationIdForSession,
      getCurrentOrganizationMemberRole:
        mockedGetCurrentOrganizationMemberRole as typeof actual.getCurrentOrganizationMemberRole,
    };
  }
);

describe("organization app route boundary", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("suppresses stale role context while active organization sync is pending", async () => {
    const activeOrganizationId = decodeOrganizationId("org_next");
    const { Route } = await import("./_app._org");

    mockedEnsureActiveOrganizationIdForSession.mockResolvedValue({
      activeOrganization: {
        id: activeOrganizationId,
        name: "Next Org",
        slug: "next-org",
      },
      activeOrganizationId,
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: activeOrganizationId,
      },
      organizations: [
        {
          id: activeOrganizationId,
          name: "Next Org",
          slug: "next-org",
        },
      ],
      session: {
        user: {
          id: "user_123",
        },
      },
    });

    await expect(
      Route.options.beforeLoad?.({
        context: {
          currentOrganizationRole: "owner",
          session: {
            user: {
              id: "user_123",
            },
          },
        },
      } as never)
    ).resolves.toMatchObject({
      activeOrganizationId,
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: activeOrganizationId,
      },
      currentOrganizationRole: undefined,
    });
    expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("redirects to /create-organization when preloaded organizations are empty", async () => {
    const { Route } = await import("./_app._org");

    const result = Route.options.beforeLoad?.({
      context: {
        activeOrganizationId: null,
        organizations: [],
        session: {
          session: {
            activeOrganizationId: null,
          },
          user: {
            id: "user_123",
          },
        },
      },
    } as never);

    await expect(result).rejects.toMatchObject({
      options: { to: "/create-organization" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
    expect(mockedEnsureActiveOrganizationIdForSession).not.toHaveBeenCalled();
    expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
  });

  it("resolves the first preloaded organization without reloading access state", async () => {
    const activeOrganizationId = decodeOrganizationId("org_first");
    const { Route } = await import("./_app._org");

    await expect(
      Route.options.beforeLoad?.({
        context: {
          activeOrganizationId: null,
          organizations: [
            {
              id: activeOrganizationId,
              name: "First Org",
              slug: "first-org",
            },
          ],
          session: {
            session: {
              activeOrganizationId: null,
            },
            user: {
              id: "user_123",
            },
          },
        },
      } as never)
    ).resolves.toMatchObject({
      activeOrganizationId,
      activeOrganizationSync: {
        required: true,
        targetOrganizationId: activeOrganizationId,
      },
      organizations: [
        {
          id: activeOrganizationId,
          name: "First Org",
          slug: "first-org",
        },
      ],
    });
    expect(mockedEnsureActiveOrganizationIdForSession).not.toHaveBeenCalled();
    expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
  });
});
