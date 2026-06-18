import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";

const organizationId = decodeOrganizationId("org_123");
const switchedOrganizationId = decodeOrganizationId("org_next");

const { mockedOrganizationRouteContext, mockedPathname } = vi.hoisted(() => ({
  mockedOrganizationRouteContext: {
    value: {
      activeOrganization: {
        id: "org_123" as never,
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      },
    },
  },
  mockedPathname: {
    value: "/organization/settings",
  },
}));

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const actual = await importOriginal();
  const { memo } = await import("react");
  const MockOutlet = memo(function MockOutlet() {
    return (
      <main data-testid="settings-child-outlet">
        <h1>Labels</h1>
      </main>
    );
  });
  const useRouterStateMock = (<TSelected,>(options: {
    select: (state: { location: { pathname: string } }) => TSelected;
  }) =>
    options.select({
      location: {
        pathname: mockedPathname.value,
      },
    })) as typeof actual.useRouterState;
  const useRouteContextMock = ((
    ..._args: Parameters<typeof actual.useRouteContext>
  ) => mockedOrganizationRouteContext.value) as typeof actual.useRouteContext;

  return {
    ...actual,
    Outlet: MockOutlet,
    useRouteContext: useRouteContextMock,
    useRouterState: useRouterStateMock,
  };
});

describe("settings route access", () => {
  afterEach(() => {
    mockedPathname.value = "/organization/settings";
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin"])(
    "allows %s users to load organization settings",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      const context = {
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: role,
      } as const;

      expect(() => assertSettingsRouteAccess(context)).not.toThrow();
    }
  );

  it.each<OrganizationRole>(["member", "external"])(
    "redirects %s users away from organization settings",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      let result: unknown;

      try {
        assertSettingsRouteAccess({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        });
      } catch (error) {
        result = error;
      }

      expect(result).toMatchObject({
        options: { to: "/" },
      });
      expect(result).toSatisfy(isRedirect);
    }
  );

  it.each<OrganizationRole>(["member", "external"])(
    "keeps organization settings unavailable after switching to a %s organization",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      let result: unknown;

      try {
        assertSettingsRouteAccess({
          activeOrganizationId: switchedOrganizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: switchedOrganizationId,
          },
          currentOrganizationRole: role,
        });
      } catch (error) {
        result = error;
      }

      expect(result).toMatchObject({
        options: { to: "/" },
      });
      expect(result).toSatisfy(isRedirect);
    }
  );

  it.each<OrganizationRole>(["owner", "admin"])(
    "keeps organization settings available after switching to a %s organization",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");

      expect(() =>
        assertSettingsRouteAccess({
          activeOrganizationId: switchedOrganizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: switchedOrganizationId,
          },
          currentOrganizationRole: role,
        })
      ).not.toThrow();
    }
  );

  it(
    "defers role checks while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      const context = {
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: true,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: undefined,
      } as const;

      expect(() => assertSettingsRouteAccess(context)).not.toThrow();
    }
  );
});

describe("settings route component", () => {
  afterEach(() => {
    mockedPathname.value = "/organization/settings";
    vi.restoreAllMocks();
  });

  it("renders the existing organization settings page on the settings index route", async () => {
    const { SettingsRoute } = await import("./_app._org.organization.settings");

    render(<SettingsRoute />);

    expect(
      screen.getByRole("heading", { name: "Organization settings" })
    ).toBeVisible();
    expect(
      screen.queryByTestId("settings-child-outlet")
    ).not.toBeInTheDocument();
  });

  it("mounts the nested labels settings route through the parent outlet", async () => {
    const { SettingsRoute } = await import("./_app._org.organization.settings");

    mockedPathname.value = "/organization/settings/labels";

    render(<SettingsRoute />);

    expect(screen.getByTestId("settings-child-outlet")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Labels" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Organization settings" })
    ).not.toBeInTheDocument();
  });
});
