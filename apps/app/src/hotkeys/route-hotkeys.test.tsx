import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RouteHotkeys } from "./route-hotkeys";
import { ShortcutHelpOverlay } from "./shortcut-help-overlay";

const { mockedNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<() => Promise<void>>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe("route hotkeys", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers live global navigation sequences in the shortcut overlay", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <RouteHotkeys />
        <ShortcutHelpOverlay activeScopes={["global"]} />
      </HotkeysProvider>
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Go to Jobs")).toBeVisible();
    expect(within(dialog).getByText("Go to Sites")).toBeVisible();
    expect(within(dialog).getByText("Go to Members")).toBeVisible();
    expect(within(dialog).getByText("Go to Settings")).toBeVisible();
    expect(within(dialog).getByText("Go to Map")).toBeVisible();
  }, 10_000);

  it("navigates with global navigation sequences", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <RouteHotkeys />
      </HotkeysProvider>
    );

    await user.keyboard("gj");
    await user.keyboard("gs");
    await user.keyboard("gm");
    await user.keyboard("gt");
    await user.keyboard("gp");

    expect(mockedNavigate).toHaveBeenNthCalledWith(1, { to: "/jobs" });
    expect(mockedNavigate).toHaveBeenNthCalledWith(2, { to: "/sites" });
    expect(mockedNavigate).toHaveBeenNthCalledWith(3, { to: "/members" });
    expect(mockedNavigate).toHaveBeenNthCalledWith(4, { to: "/settings" });
    expect(mockedNavigate).toHaveBeenNthCalledWith(5, {
      search: { view: "map" },
      to: "/jobs",
    });
  }, 10_000);
});
