import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";
import type { ComponentProps, ReactElement } from "react";

import { AppLayout } from "./app-layout";

const { mockedAppSidebar, mockedEmailVerificationBanner, mockedSidebarInset } =
  vi.hoisted(() => ({
    mockedAppSidebar: vi.fn<
      ({
        user,
      }: {
        user?: {
          name: string;
          email: string;
          image?: string | null;
        } | null;
      } & ComponentProps<"div">) => ReactElement
    >(
      ({
        currentOrganizationRole: _currentOrganizationRole,
        user,
        ...props
      }: {
        currentOrganizationRole?: unknown;
        user?: {
          name: string;
          email: string;
          image?: string | null;
        } | null;
      } & ComponentProps<"div">) => (
        <aside data-testid="app-sidebar" {...props}>
          {user?.name ?? "missing user"}
        </aside>
      )
    ),
    mockedEmailVerificationBanner: vi.fn<
      ({
        email,
        emailVerified,
      }: {
        email: string;
        emailVerified: boolean;
      }) => ReactElement
    >(({ email, emailVerified }) => (
      <div data-testid="email-verification-banner">
        {email}:{String(emailVerified)}
      </div>
    )),
    mockedSidebarInset: vi.fn<
      ({ children, ...props }: ComponentProps<"div">) => ReactElement
    >(({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-inset" {...props}>
        {children}
      </div>
    )),
  }));

const { mockedNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Outlet: memo(() => <div data-testid="app-layout-outlet" />),
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
  };
});

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    SidebarInset: mockedSidebarInset as typeof actual.SidebarInset,
    SidebarProvider: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-provider" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarProvider,
  };
});

vi.mock(import("#/components/site-header"), () => ({
  SiteHeader: () => <header data-testid="site-header" />,
}));

vi.mock(import("#/components/app-sidebar"), () => ({
  AppSidebar: mockedAppSidebar,
}));

vi.mock(import("#/features/auth/email-verification-banner"), () => ({
  EmailVerificationBanner: mockedEmailVerificationBanner,
}));

describe("app layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "passes the provided session user into the app sidebar",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppLayout
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: false,
            image: null,
          }}
        />
      );

      expect(mockedAppSidebar).toHaveBeenCalledOnce();
      expect(mockedAppSidebar.mock.calls[0]?.[0]).toStrictEqual({
        currentOrganizationRole: undefined,
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          emailVerified: false,
          image: null,
        },
      });
      expect(mockedEmailVerificationBanner).toHaveBeenCalledOnce();
      expect(mockedEmailVerificationBanner.mock.calls[0]?.[0]).toStrictEqual({
        email: "person@example.com",
        emailVerified: false,
      });
      expect(screen.getByTestId("email-verification-banner")).toHaveTextContent(
        "person@example.com:false"
      );
      expect(screen.getByTestId("app-sidebar")).toHaveTextContent(
        "Taylor Example"
      );
      expect(mockedSidebarInset).toHaveBeenCalledOnce();
      expect(mockedSidebarInset.mock.calls[0]?.[0].className).toContain(
        "overflow-hidden"
      );
      expect(screen.getByTestId("sidebar-inset")).toContainElement(
        screen.getByTestId("app-layout-outlet")
      );
    }
  );

  it(
    "skips the verification banner for verified users",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppLayout
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: true,
            image: null,
          }}
        />
      );

      expect(mockedEmailVerificationBanner).not.toHaveBeenCalled();
      expect(
        screen.queryByTestId("email-verification-banner")
      ).not.toBeInTheDocument();
    }
  );

  it(
    "does not expose organization commands from the app shell",
    {
      timeout: 10_000,
    },
    async () => {
      render(
        <AppLayout
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: true,
            image: null,
          }}
        />
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /open user settings/i })
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("option", { name: /go to jobs/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to sites/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /open organization settings/i })
      ).not.toBeInTheDocument();
    }
  );
});
