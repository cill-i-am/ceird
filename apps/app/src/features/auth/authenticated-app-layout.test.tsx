import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import type { AppLayoutProps } from "#/components/app-layout";

import { AuthenticatedAppLayout } from "./authenticated-app-layout";

const { mockedUseRouteContext, mockedAppLayout } = vi.hoisted(() => ({
  mockedUseRouteContext: vi.fn<
    (...args: unknown[]) => {
      session: {
        user:
          | (NonNullable<AppLayoutProps["user"]> & {
              emailVerified: boolean;
            })
          | null;
      };
    }
  >(),
  mockedAppLayout: vi.fn<(props: AppLayoutProps) => ReactNode>(({ user }) => (
    <div data-testid="app-layout">{user?.name ?? "missing user"}</div>
  )),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useRouteContext: mockedUseRouteContext as typeof actual.useRouteContext,
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
});
