import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  AppAgentCommandActions,
  AppGlobalCommandActions,
  AppOrganizationCommandActions,
} from "./app-global-command-actions";
import { CommandBarProvider } from "./command-bar";

const { mockedNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
  };
});

describe("app global command actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "registers only app-global actions in the app shell",
    { timeout: 10_000 },
    async () => {
      const user = userEvent.setup();

      render(
        <CommandBarProvider>
          <AppGlobalCommandActions />
        </CommandBarProvider>
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /open user settings/i })
        ).toBeInTheDocument();
      });

      expectCommandShortcut("Open user settings", ["G", "T"]);
      expect(
        screen.queryByRole("option", { name: /ask ceird/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to jobs/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /open organization settings/i })
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("option", { name: /open user settings/i })
      );

      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/settings" });
    }
  );

  it(
    "opens the app-level agent from the app shell command bar",
    { timeout: 10_000 },
    async () => {
      const user = userEvent.setup();
      const openListener = vi.fn<() => void>();
      window.addEventListener("ceird:agent-chat-open", openListener);

      try {
        render(
          <CommandBarProvider>
            <AppAgentCommandActions
              activeOrganizationId={"org_123" as never}
              currentOrganizationRole="owner"
            />
          </CommandBarProvider>
        );

        fireEvent.keyDown(window, { key: "k", metaKey: true });

        await user.click(
          await screen.findByRole("option", { name: /ask ceird/i })
        );

        expect(openListener).toHaveBeenCalledOnce();
      } finally {
        window.removeEventListener("ceird:agent-chat-open", openListener);
      }
    }
  );

  it(
    "hides the app-level agent command until agent access is available",
    { timeout: 10_000 },
    async () => {
      render(
        <CommandBarProvider>
          <AppAgentCommandActions activeOrganizationId={"org_123" as never} />
          <AppGlobalCommandActions />
        </CommandBarProvider>
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /open user settings/i })
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole("option", { name: /ask ceird/i })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "registers organization commands from the organization route boundary",
    { timeout: 10_000 },
    async () => {
      const user = userEvent.setup();

      render(
        <CommandBarProvider>
          <AppOrganizationCommandActions currentOrganizationRole="owner" />
        </CommandBarProvider>
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /go to jobs/i })
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole("option", { name: /go to sites/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /go to activity/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /go to security/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /open organization settings/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /ask ceird/i })
      ).not.toBeInTheDocument();
      expectCommandShortcut("Go to Home", ["G", "H"]);
      expectCommandShortcut("Go to Jobs", ["G", "J"]);
      expectCommandShortcut("Go to Sites", ["G", "S"]);
      expectCommandShortcut("Go to Activity", ["G", "A"]);
      expectCommandShortcut("Go to Security", ["G", "Y"]);
      expectCommandShortcut("Go to Members", ["G", "M"]);
      expectCommandShortcut("Open organization settings", ["G", "W"]);

      await user.click(screen.getByRole("option", { name: /go to jobs/i }));

      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/jobs" });
    }
  );

  it.each(["owner", "admin"] as const)(
    "registers administrator organization commands for %s role",
    { timeout: 10_000 },
    async (role) => {
      render(
        <CommandBarProvider>
          <AppOrganizationCommandActions currentOrganizationRole={role} />
        </CommandBarProvider>
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /go to activity/i })
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole("option", { name: /go to members/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /go to security/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /open organization settings/i })
      ).toBeInTheDocument();
      expectCommandShortcut("Go to Security", ["G", "Y"]);
      expectCommandShortcut("Open organization settings", ["G", "W"]);
    }
  );

  it.each(["member", undefined] as const)(
    "hides administrator organization commands for %s role",
    { timeout: 10_000 },
    async (role) => {
      render(
        <CommandBarProvider>
          <AppOrganizationCommandActions currentOrganizationRole={role} />
        </CommandBarProvider>
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /go to jobs/i })
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("option", { name: /go to activity/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to security/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to members/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to security/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", {
          name: /open organization settings/i,
        })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "registers only jobs, agent, and user settings commands for external users",
    { timeout: 10_000 },
    async () => {
      render(
        <CommandBarProvider>
          <AppGlobalCommandActions />
          <AppAgentCommandActions
            activeOrganizationId={"org_123" as never}
            currentOrganizationRole="external"
          />
          <AppOrganizationCommandActions currentOrganizationRole="external" />
        </CommandBarProvider>
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /go to jobs/i })
        ).toBeInTheDocument();
      });

      expectCommandShortcut("Go to Jobs", ["G", "J"]);
      expect(
        screen.getByRole("option", { name: /ask ceird/i })
      ).toBeInTheDocument();
      expectCommandShortcut("Ask Ceird", ["J"]);
      expect(
        screen.getByRole("option", { name: /open user settings/i })
      ).toBeInTheDocument();
      expectCommandShortcut("Open user settings", ["G", "T"]);
      expect(
        screen.queryByRole("option", { name: /go to home/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to sites/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to activity/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to members/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", {
          name: /open organization settings/i,
        })
      ).not.toBeInTheDocument();
    }
  );
});

function expectCommandShortcut(title: string, keys: readonly string[]) {
  const option = screen.getByRole("option", { name: title });

  for (const key of keys) {
    expect(within(option).getByText(key)).toBeVisible();
  }
}
