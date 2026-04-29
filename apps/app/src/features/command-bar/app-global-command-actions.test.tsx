import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
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
        screen.getByRole("option", { name: /open organization settings/i })
      ).toBeInTheDocument();

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
        screen.getByRole("option", { name: /open organization settings/i })
      ).toBeInTheDocument();
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
        screen.queryByRole("option", { name: /go to members/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", {
          name: /open organization settings/i,
        })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "registers only jobs and user settings commands for external users",
    { timeout: 10_000 },
    async () => {
      render(
        <CommandBarProvider>
          <AppGlobalCommandActions />
          <AppOrganizationCommandActions currentOrganizationRole="external" />
        </CommandBarProvider>
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /go to jobs/i })
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole("option", { name: /open user settings/i })
      ).toBeInTheDocument();
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
