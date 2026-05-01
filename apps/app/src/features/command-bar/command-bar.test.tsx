import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  CommandBarProvider,
  useCommandActions,
  useRegisterCommandActions,
} from "./command-bar";
import type { CommandAction } from "./command-bar";

const baseAction = {
  group: "Navigation",
  run: vi.fn<() => void>(),
  scope: "global",
} satisfies Omit<CommandAction, "id" | "title">;

describe("command bar registry", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "registers mounted actions and removes them when the owner unmounts",
    { timeout: 10_000 },
    () => {
      const { rerender } = render(
        <CommandBarProvider>
          <ActionRegistrar
            actions={[
              {
                ...baseAction,
                id: "go-jobs",
                title: "Go to Jobs",
              },
            ]}
          />
          <RegisteredActionTitles />
        </CommandBarProvider>
      );

      expect(screen.getByTestId("registered-actions")).toHaveTextContent(
        "Go to Jobs"
      );

      rerender(
        <CommandBarProvider>
          <RegisteredActionTitles />
        </CommandBarProvider>
      );

      expect(screen.getByTestId("registered-actions")).toHaveTextContent(
        "none"
      );
    }
  );

  it(
    "orders current context actions before global actions",
    { timeout: 10_000 },
    () => {
      render(
        <CommandBarProvider>
          <ActionRegistrar
            actions={[
              {
                ...baseAction,
                id: "go-sites",
                title: "Go to Sites",
              },
              {
                ...baseAction,
                group: "Current page",
                id: "clear-filters",
                scope: "route",
                title: "Clear filters",
              },
              {
                ...baseAction,
                id: "go-members",
                scope: "org",
                title: "Go to Members",
              },
            ]}
          />
          <RegisteredActionTitles />
        </CommandBarProvider>
      );

      expect(screen.getByTestId("registered-actions")).toHaveTextContent(
        "Clear filters, Go to Members, Go to Sites"
      );
    }
  );
});

function ActionRegistrar({
  actions,
}: {
  readonly actions: readonly CommandAction[];
}) {
  useRegisterCommandActions(actions);

  return null;
}

function RegisteredActionTitles({
  children,
}: {
  readonly children?: ReactNode;
}) {
  const actions = useCommandActions();

  return (
    <div data-testid="registered-actions">
      {actions.map((action) => action.title).join(", ") || "none"}
      {children}
    </div>
  );
}
