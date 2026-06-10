import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import type { AppLayoutProps } from "#/components/app-layout";

import { AuthenticatedAppLayout } from "./authenticated-app-layout";

const {
  mockedUseRouteContext,
  mockedUseRouter,
  mockedUseRouterState,
  mockedAppLayout,
} = vi.hoisted(() => ({
  mockedUseRouteContext: vi.fn<
    (...args: unknown[]) => {
      activeOrganizationId?: AppLayoutProps["activeOrganizationId"];
      currentOrganizationRole?: AppLayoutProps["currentOrganizationRole"];
      session: {
        user:
          | (NonNullable<AppLayoutProps["user"]> & {
              emailVerified: boolean;
            })
          | null;
      };
    }
  >(),
  mockedUseRouter: vi.fn<
    () => {
      latestLocation: {
        pathname: string;
      };
    }
  >(() => ({
    latestLocation: {
      pathname: "/",
    },
  })),
  mockedUseRouterState: vi.fn<
    (options?: {
      select?: (state: {
        location: { pathname: string };
        matches?: readonly { routeId: string }[];
      }) => unknown;
    }) => unknown
  >(
    (options?: {
      select?: (state: {
        location: { pathname: string };
        matches?: readonly { routeId: string }[];
      }) => unknown;
    }) => options?.select?.({ location: { pathname: "/" } }) ?? false
  ),
  mockedAppLayout: vi.fn<(props: AppLayoutProps) => ReactNode>(({ user }) => (
    <div data-testid="app-layout">{user?.name ?? "missing user"}</div>
  )),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Outlet: (() => (
      <div data-testid="onboarding-outlet" />
    )) as unknown as typeof actual.Outlet,
    useRouteContext: mockedUseRouteContext as typeof actual.useRouteContext,
    useRouter: mockedUseRouter as unknown as typeof actual.useRouter,
    useRouterState:
      mockedUseRouterState as unknown as typeof actual.useRouterState,
  };
});

vi.mock(import("#/components/app-layout"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    AppLayout: mockedAppLayout as typeof actual.AppLayout,
  };
});

describe("authenticated app layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "passes the authenticated route session user into the app layout",
    {
      timeout: 10_000,
    },
    () => {
      mockedUseRouteContext.mockReturnValue({
        activeOrganizationId: undefined,
        currentOrganizationRole: undefined,
        session: {
          user: {
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: false,
            image: null,
          },
        },
      });

      render(<AuthenticatedAppLayout />);

      expect(mockedUseRouteContext).toHaveBeenCalledWith({
        from: "/_app",
      });
      expect(mockedAppLayout).toHaveBeenCalledOnce();
      expect(mockedAppLayout.mock.calls[0]?.[0]).toStrictEqual({
        activeOrganizationId: undefined,
        currentOrganizationRole: undefined,
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          emailVerified: false,
          image: null,
        },
      });
    }
  );

  it(
    "renders the organization creation route without the app shell",
    {
      timeout: 10_000,
    },
    () => {
      mockedUseRouteContext.mockReturnValue({
        activeOrganizationId: undefined,
        currentOrganizationRole: undefined,
        session: {
          user: {
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: false,
            image: null,
          },
        },
      });
      mockedUseRouterState.mockImplementationOnce(
        (options) =>
          options?.select?.({
            location: { pathname: "/create-organization" },
          }) ?? false
      );

      const { getByTestId, queryByTestId } = render(<AuthenticatedAppLayout />);

      expect(getByTestId("onboarding-outlet")).toBeInTheDocument();
      expect(queryByTestId("app-layout")).not.toBeInTheDocument();
      expect(mockedAppLayout).not.toHaveBeenCalled();
    }
  );

  it(
    "renders the location access onboarding route without the app shell",
    {
      timeout: 10_000,
    },
    () => {
      mockedUseRouteContext.mockReturnValue({
        activeOrganizationId: undefined,
        currentOrganizationRole: undefined,
        session: {
          user: {
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: false,
            image: null,
          },
        },
      });
      mockedUseRouterState.mockImplementationOnce(
        (options) =>
          options?.select?.({
            location: { pathname: "/location-access" },
          }) ?? false
      );

      const { getByTestId, queryByTestId } = render(<AuthenticatedAppLayout />);

      expect(getByTestId("onboarding-outlet")).toBeInTheDocument();
      expect(queryByTestId("app-layout")).not.toBeInTheDocument();
      expect(mockedAppLayout).not.toHaveBeenCalled();
    }
  );

  it(
    "bypasses the app shell while a shellless onboarding route is pending",
    {
      timeout: 10_000,
    },
    () => {
      mockedUseRouteContext.mockReturnValue({
        activeOrganizationId: undefined,
        currentOrganizationRole: undefined,
        session: {
          user: {
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: false,
            image: null,
          },
        },
      });
      mockedUseRouter.mockReturnValueOnce({
        latestLocation: {
          pathname: "/location-access",
        },
      });
      mockedUseRouterState.mockImplementationOnce(
        (options) =>
          options?.select?.({
            location: { pathname: "/" },
            matches: [{ routeId: "/_app" }, { routeId: "/_app/" }],
          }) ?? false
      );

      const { getByTestId, queryByTestId } = render(<AuthenticatedAppLayout />);

      expect(getByTestId("onboarding-outlet")).toBeInTheDocument();
      expect(queryByTestId("app-layout")).not.toBeInTheDocument();
      expect(mockedAppLayout).not.toHaveBeenCalled();
    }
  );
});
