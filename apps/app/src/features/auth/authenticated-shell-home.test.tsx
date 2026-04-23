import { render, screen } from "@testing-library/react";
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
    "shows the active organization overview and quick links",
    {
      timeout: 10_000,
    },
    () => {
      render(<AuthenticatedShellHome />);

      expect(
        screen.getByRole("heading", { name: "Acme Field Ops" })
      ).toBeInTheDocument();
      expect(screen.getByText(/@acme-field-ops/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open jobs/i })).toHaveAttribute(
        "href",
        "/jobs"
      );
      expect(
        screen.getByRole("link", { name: /invite teammates/i })
      ).toHaveAttribute("href", "/members");
      expect(
        screen.getByRole("link", { name: /check system health/i })
      ).toHaveAttribute("href", "/health");
      expect(screen.getAllByText(/verification pending/i)).not.toHaveLength(0);
    }
  );

  it(
    "shows a verified account badge when the session email is verified",
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

      expect(screen.getAllByText(/email verified/i)).not.toHaveLength(0);
    }
  );
});
