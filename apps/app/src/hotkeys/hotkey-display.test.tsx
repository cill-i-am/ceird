import { validateHotkey } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { ShortcutHint } from "./hotkey-display";
import { HOTKEYS } from "./hotkey-registry";

describe("shortcut hint", () => {
  it(
    "renders a single key as a keyboard key",
    {
      timeout: 1000,
    },
    () => {
      render(<ShortcutHint hotkey="N" label="New job" />);

      expect(screen.getByLabelText("New job shortcut: N")).toBeVisible();
      expect(screen.getByText("N")).toBeVisible();
    }
  );

  it(
    "renders modifier chords as grouped keys",
    {
      timeout: 1000,
    },
    () => {
      render(<ShortcutHint hotkey="Mod+Enter" label="Submit form" />);

      const group = screen.getByLabelText(
        /Submit form shortcut: (Cmd|Ctrl)\+Enter/
      );
      expect(within(group).getByText(/Cmd|Ctrl/)).toBeVisible();
      expect(within(group).getByText("Enter")).toBeVisible();
    }
  );

  it(
    "keeps Mod shortcut markup stable for SSR hydration",
    {
      timeout: 1000,
    },
    () => {
      const platformSpy = vi
        .spyOn(window.navigator, "platform", "get")
        .mockReturnValue("MacIntel");
      const userAgentSpy = vi
        .spyOn(window.navigator, "userAgent", "get")
        .mockReturnValue("Macintosh");

      try {
        const html = renderToString(
          <ShortcutHint hotkey="Mod+Enter" label="Submit form" />
        );

        expect(html).toContain("Ctrl");
        expect(html).not.toContain("Cmd");
      } finally {
        platformSpy.mockRestore();
        userAgentSpy.mockRestore();
      }
    }
  );

  it(
    "styles grouped shortcuts as a single subtle pill",
    {
      timeout: 1000,
    },
    () => {
      render(<ShortcutHint hotkey="Mod+Enter" label="Submit form" />);

      const shortcut = screen.getByLabelText(
        /Submit form shortcut: (Cmd|Ctrl)\+Enter/
      );
      const group = shortcut.querySelector('[data-slot="kbd-group"]');
      const key = shortcut.querySelector('[data-slot="kbd"]');

      expect(group).toHaveClass("rounded-full", "bg-muted-foreground/10");
      expect(key).toHaveClass(
        "in-data-[slot=kbd-group]:bg-transparent",
        "in-data-[slot=kbd-group]:ring-0"
      );
    }
  );

  it(
    "renders sequences with separate groups",
    {
      timeout: 1000,
    },
    () => {
      render(<ShortcutHint hotkey="G J" label="Go to Jobs" />);

      expect(
        screen.getByLabelText("Go to Jobs shortcut: G then J")
      ).toBeVisible();
      expect(screen.getByText("G")).toBeVisible();
      expect(screen.getByText("J")).toBeVisible();
      expect(screen.queryByText("then")).not.toBeInTheDocument();
    }
  );

  it(
    "can render decorative shortcuts without changing the accessible name",
    {
      timeout: 1000,
    },
    () => {
      render(
        <a href="/jobs">
          <span>Jobs</span>
          <ShortcutHint decorative hotkey="G J" label="Go to Jobs" />
        </a>
      );

      expect(
        screen.queryByLabelText("Go to Jobs shortcut: G then J")
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Jobs" })).toBeVisible();
      expect(screen.getByText("G")).toBeVisible();
      expect(screen.getByText("J")).toBeVisible();
    }
  );
});

describe("hotkey registry", () => {
  it(
    "only contains valid TanStack hotkey chords",
    {
      timeout: 1000,
    },
    () => {
      for (const definition of Object.values(HOTKEYS)) {
        for (const chord of definition.hotkey.split(/\s+/)) {
          expect(validateHotkey(chord)).toMatchObject({
            errors: [],
            valid: true,
          });
        }
      }
    }
  );
});
