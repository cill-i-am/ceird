import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShortcutHelpOverlay } from "./shortcut-help-overlay";
import { ShortcutIntroNotice } from "./shortcut-intro-notice";
import { useAppHotkey, useAppHotkeySequence } from "./use-app-hotkey";

function RegisteredShortcut({
  enabled,
  id,
}: {
  readonly enabled?: boolean;
  readonly id: Parameters<typeof useAppHotkey>[0];
}) {
  useAppHotkey(id, vi.fn(), enabled === undefined ? {} : { enabled });

  return null;
}

function RegisteredShortcutSequence({
  id,
}: {
  readonly id: Parameters<typeof useAppHotkeySequence>[0];
}) {
  useAppHotkeySequence(id, vi.fn());

  return null;
}

function renderShortcutHelpOverlay(
  activeScopes: React.ComponentProps<
    typeof ShortcutHelpOverlay
  >["activeScopes"],
  registeredShortcuts: React.ReactNode = null
) {
  return render(
    <HotkeysProvider>
      {registeredShortcuts}
      <ShortcutHelpOverlay activeScopes={activeScopes} />
    </HotkeysProvider>
  );
}

describe("shortcut help overlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from the trigger and lists global shortcuts", async () => {
    const user = userEvent.setup();

    renderShortcutHelpOverlay(
      ["global"],
      <>
        <RegisteredShortcut id="toggleSidebar" />
        <RegisteredShortcutSequence id="goJobs" />
      </>
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Toggle sidebar")).toBeVisible();
    expect(within(dialog).getByText("Go to Jobs")).toBeVisible();
    expect(within(dialog).queryByText("Go to Sites")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Search jobs")).not.toBeInTheDocument();
  }, 1000);

  it("includes shortcuts for every active scope", async () => {
    const user = userEvent.setup();

    renderShortcutHelpOverlay(
      ["global", "jobs"],
      <RegisteredShortcut id="jobsSearch" />
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Search jobs")).toBeVisible();
    expect(within(dialog).queryByText("Create job")).not.toBeInTheDocument();
  }, 1000);

  it("does not list disabled registered shortcuts", async () => {
    const user = userEvent.setup();

    renderShortcutHelpOverlay(
      ["global"],
      <RegisteredShortcut id="toggleSidebar" enabled={false} />
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(
      within(dialog).queryByText("Toggle sidebar")
    ).not.toBeInTheDocument();
  }, 1000);

  it("does not treat a same-key shortcut in another scope as registered", async () => {
    const user = userEvent.setup();

    renderShortcutHelpOverlay(
      ["global", "jobs", "job-create"],
      <RegisteredShortcut id="jobCreateContact" />
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Open contact select")).toBeVisible();
    expect(within(dialog).queryByText("Clear filters")).not.toBeInTheDocument();
  }, 1000);
});

describe("shortcut intro notice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides for the session when localStorage access is denied", async () => {
    const user = userEvent.setup();

    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });

    render(<ShortcutIntroNotice />);

    await expect(
      screen.findByText("Keyboard shortcuts are available. Press ? anytime.")
    ).resolves.toBeVisible();

    await user.click(screen.getByRole("button", { name: /got it/i }));

    expect(
      screen.queryByText("Keyboard shortcuts are available. Press ? anytime.")
    ).not.toBeInTheDocument();
  }, 1000);
});
