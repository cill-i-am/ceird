import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { AuthenticatedShellHome } from "./authenticated-shell-home";

const { mockedUseRouteContext } = vi.hoisted(() => ({
  mockedUseRouteContext: vi.fn<
    (options: { from: string }) => {
      activeOrganization?: {
        name: string;
        slug: string;
      };
      session?: {
        user: {
          email: string;
          emailVerified: boolean;
        };
      };
    }
  >(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: {
      children?: ReactNode;
      to: string;
      className?: string;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as unknown as typeof actual.Link,
    useRouteContext:
      mockedUseRouteContext as unknown as typeof actual.useRouteContext,
  };
});

describe("authenticated shell home", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "http://localhost:3000/tasks");
    mockedUseRouteContext.mockImplementation(({ from }) => {
      if (from === "/_app/_org") {
        return {
          activeOrganization: {
            name: "Acme Field Ops",
            slug: "acme-field-ops",
          },
        };
      }

      return {
        session: {
          user: {
            email: "taylor@example.com",
            emailVerified: false,
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "shows a quiet organization overview and a single next action",
    {
      timeout: 10_000,
    },
    () => {
      render(<AuthenticatedShellHome />);

      expect(
        screen.getByRole("heading", { name: "Acme Field Ops" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /next actions/i })
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open jobs/i })).toHaveAttribute(
        "href",
        "/jobs"
      );
      expect(
        screen.queryByRole("link", { name: /invite teammates/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /check system health/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: /workspace status/i })
      ).not.toBeInTheDocument();

      const nextActions = screen
        .getByRole("heading", { name: /next actions/i })
        .closest("section");
      expect(nextActions).not.toBeNull();
      expect(
        within(nextActions as HTMLElement).getByText(
          /invite the first teammate/i
        )
      ).toBeInTheDocument();
      expect(
        within(nextActions as HTMLElement).getByRole("link", { name: /open/i })
      ).toHaveAttribute("href", "/members");
      expect(
        within(nextActions as HTMLElement).getAllByRole("listitem")
      ).toHaveLength(1);
      expect(
        within(nextActions as HTMLElement).queryByText(
          /finish account verification/i
        )
      ).not.toBeInTheDocument();
      expect(
        within(nextActions as HTMLElement).queryByText(/check system health/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/verification pending/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/resend verification email/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/health checks ready/i)
      ).not.toBeInTheDocument();
      expect(screen.queryByText("/health")).not.toBeInTheDocument();
      expect(screen.queryByText("taylor@example.com")).not.toBeInTheDocument();
      expect(screen.queryByText("@acme-field-ops")).not.toBeInTheDocument();
    }
  );

  it(
    "keeps verified account state out of the home action list",
    {
      timeout: 10_000,
    },
    () => {
      mockedUseRouteContext.mockImplementation(({ from }) => {
        if (from === "/_app/_org") {
          return {
            activeOrganization: {
              name: "Acme Field Ops",
              slug: "acme-field-ops",
            },
          };
        }

        return {
          session: {
            user: {
              email: "taylor@example.com",
              emailVerified: true,
            },
          },
        };
      });

      render(<AuthenticatedShellHome />);

      const nextActions = screen
        .getByRole("heading", { name: /next actions/i })
        .closest("section");
      expect(nextActions).not.toBeNull();
      expect(
        within(nextActions as HTMLElement).getByText(
          /invite the first teammate/i
        )
      ).toBeInTheDocument();
      expect(
        within(nextActions as HTMLElement).getAllByRole("listitem")
      ).toHaveLength(1);
      expect(screen.queryByText(/email verified/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/account trust is in place/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /resend verification email/i })
      ).not.toBeInTheDocument();
    }
  );
});
