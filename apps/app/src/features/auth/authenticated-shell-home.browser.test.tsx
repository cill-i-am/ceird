import type { WorkItemIdType } from "@ceird/jobs-core";
import type { SiteIdType } from "@ceird/sites-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { AuthenticatedShellHome } from "./authenticated-shell-home";

const { mockedNavigate, mockedUseRouteContext } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
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
      params: _params,
      search: _search,
      to,
      ...props
    }: {
      children?: ReactNode;
      to: string;
      className?: string;
      params?: unknown;
      search?: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as unknown as typeof actual.Link,
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
    useRouteContext:
      mockedUseRouteContext as unknown as typeof actual.useRouteContext,
  };
});

describe("authenticated shell home", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/tasks");
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
    "shows an operations overview with outcome modules and next actions",
    {
      timeout: 10_000,
    },
    () => {
      renderHome(<AuthenticatedShellHome />);

      expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
      expect(
        screen.queryByText("Acme Field Ops / @acme-field-ops")
      ).not.toBeInTheDocument();
      const pageHeader = screen.getByRole("banner");
      expect(
        within(pageHeader).queryByRole("link", { name: /invite teammate/i })
      ).not.toBeInTheDocument();
      expect(
        within(pageHeader).getByRole("link", { name: /^new job/i })
      ).toHaveAttribute("href", "/jobs");
      expect(
        within(pageHeader).queryByRole("link", { name: /open jobs/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Workspace overview" })
      ).not.toBeInTheDocument();
      expect(screen.getByText("Active jobs")).toBeVisible();
      expect(screen.getAllByText("Sites").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
      expect(screen.queryByText("Email")).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Jobs at a glance" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Sites with active work" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Recent activity" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Next actions" })
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Dashboard modules")).toHaveClass(
        "lg:grid-cols-[minmax(0,1fr)_18rem]",
        "xl:grid-cols-[minmax(0,1fr)_24rem]"
      );
      expect(
        screen.queryByLabelText("Workspace shortcuts")
      ).not.toBeInTheDocument();

      const nextActions = screen
        .getByRole("heading", { name: /next actions/i })
        .closest("section");
      expect(nextActions).not.toBeNull();
      expect(
        within(nextActions as HTMLElement).getByRole("link", {
          name: /create the first job/i,
        })
      ).toHaveAttribute("href", "/jobs");
      expect(
        within(nextActions as HTMLElement).getByRole("link", {
          name: /invite your team/i,
        })
      ).toHaveAttribute("href", "/members");
      expect(
        within(nextActions as HTMLElement).getAllByRole("listitem")
      ).toHaveLength(4);
      expect(
        within(nextActions as HTMLElement).getByText(/verify your email/i)
      ).toBeInTheDocument();
      expect(
        within(nextActions as HTMLElement).getByText(
          "Confirm account email for trusted workspace actions."
        )
      ).toBeInTheDocument();
    }
  );

  it("opens new job from the home action hotkey", () => {
    renderHome(<AuthenticatedShellHome />);

    fireEvent.keyDown(document, { code: "KeyN", key: "n" });

    expect(mockedNavigate).toHaveBeenCalledWith({
      search: {
        sheets: [{ kind: "job.create" }],
      },
      to: "/jobs",
    });
  });

  it("disables the home action hotkey behind active sheets", () => {
    renderHome(<AuthenticatedShellHome routeHotkeysEnabled={false} />);

    fireEvent.keyDown(document, { code: "KeyN", key: "n" });

    expect(mockedNavigate).not.toHaveBeenCalled();
  });

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

      renderHome(<AuthenticatedShellHome />);

      const nextActions = screen
        .getByRole("heading", { name: /next actions/i })
        .closest("section");
      expect(nextActions).not.toBeNull();
      expect(
        within(nextActions as HTMLElement).getByText(/invite your team/i)
      ).toBeInTheDocument();
      expect(
        within(nextActions as HTMLElement).getAllByRole("listitem")
      ).toHaveLength(3);
      expect(screen.queryByText("Verified")).not.toBeInTheDocument();
      expect(screen.queryByText("Email")).not.toBeInTheDocument();
      expect(
        within(nextActions as HTMLElement).queryByText(/verify your email/i)
      ).not.toBeInTheDocument();
    }
  );

  it(
    "renders live jobs, sites, actions, and activity modules from dashboard data",
    {
      timeout: 10_000,
    },
    () => {
      renderHome(
        <AuthenticatedShellHome
          dashboard={{
            activity: {
              available: true,
              items: [
                {
                  actorName: "Jordan Admin",
                  createdAt: "2026-05-14T10:00:00.000Z",
                  description:
                    "Jordan Admin changed status from New to In progress.",
                  jobTitle: "Boiler replacement",
                  workItemId:
                    "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
                },
              ],
            },
            jobs: {
              items: [
                {
                  assigneeName: "James Stewart",
                  id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
                  priorityLabel: "Urgent",
                  siteName: "Apex House",
                  statusLabel: "In progress",
                  title: "Boiler replacement",
                  updatedAt: "2026-05-14T09:00:00.000Z",
                },
              ],
              stats: {
                activeJobs: 1,
                blockedJobs: 0,
                priorityWatchJobs: 1,
                totalJobs: 1,
                unassignedJobs: 0,
              },
            },
            members: {
              total: 2,
            },
            sites: {
              items: [
                {
                  activeJobCount: 1,
                  address: "1 North Wall Quay, Dublin",
                  id: "55555555-5555-4555-8555-555555555555" as SiteIdType,
                  name: "Apex House",
                  updatedAt: "2026-05-14T08:00:00.000Z",
                },
              ],
              stats: {
                mappedSites: 1,
                totalSites: 1,
              },
            },
          }}
        />
      );

      expect(
        screen.queryByRole("heading", { name: "Workspace overview" })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Jobs at a glance" })
      ).toBeInTheDocument();
      const jobsPanel = screen.getByRole("region", {
        name: "Jobs at a glance",
      });
      expect(within(jobsPanel).getByText("Boiler replacement")).toBeVisible();
      expect(within(jobsPanel).getByText("In progress")).toBeVisible();
      expect(within(jobsPanel).getByText("Apex House")).toBeVisible();
      const jobRowLink = within(jobsPanel)
        .getAllByRole("link")
        .find((link) =>
          [
            "Boiler replacement",
            "Apex House",
            "In progress",
            "James Stewart",
            "2026-05-14T09:00:00.000Z",
          ].every((text) => link.textContent?.includes(text))
        );
      expect(jobRowLink).toBeDefined();
      expect(jobRowLink).toHaveAttribute("href", "/jobs");
      expect(
        screen.getByRole("heading", { name: "Sites with active work" })
      ).toBeInTheDocument();
      const sitesPanel = screen.getByRole("region", {
        name: "Sites with active work",
      });
      expect(within(sitesPanel).getByText("Apex House")).toBeVisible();
      expect(within(sitesPanel).getByText("1 active job")).toBeVisible();
      const siteRowLink = within(sitesPanel)
        .getAllByRole("link")
        .find((link) =>
          [
            "Apex House",
            "1 active job",
            "1 North Wall Quay, Dublin",
            "2026-05-14T08:00:00.000Z",
          ].every((text) => link.textContent?.includes(text))
        );
      expect(siteRowLink).toBeDefined();
      expect(siteRowLink).toHaveAttribute("href", "/sites");
      expect(
        screen.getByRole("heading", { name: "Recent activity" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("Jordan Admin changed status from New to In progress.")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Next actions" })
      ).toBeInTheDocument();
      expect(screen.getByText("Review priority work")).toBeInTheDocument();
    }
  );
});

function renderHome(ui: ReactNode) {
  return render(<HotkeysProvider>{ui}</HotkeysProvider>);
}
