import { validateHotkey } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";

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
