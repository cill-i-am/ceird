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
    "uses an outline-only tooltip keycap",
    {
      timeout: 1000,
    },
    () => {
      render(
        <div data-slot="tooltip-content">
          <ShortcutHint hotkey="Mod+B" label="Toggle navigation" />
        </div>
      );

      const shortcut = screen.getByLabelText(
        /Toggle navigation shortcut: (Cmd|Ctrl)\+B/
      );
      const group = shortcut.querySelector('[data-slot="kbd-group"]');
      const key = shortcut.querySelector('[data-slot="kbd"]');

      expect(group).toHaveClass(
        "in-data-[slot=tooltip-content]:bg-transparent",
        "in-data-[slot=tooltip-content]:text-background/90",
        "in-data-[slot=tooltip-content]:ring-background/25"
      );
      expect(key).toHaveClass(
        "in-data-[slot=kbd-group]:bg-transparent",
        "in-data-[slot=kbd-group]:text-current",
        "in-data-[slot=tooltip-content]:ring-0"
      );
    }
  );

  it(
    "styles button shortcuts as desktop-only action hints",
    {
      timeout: 1000,
    },
    () => {
      render(
        <button data-slot="button" type="button">
          Invite teammate
          <ShortcutHint
            surface="button"
            hotkey="N"
            label="Invite teammate"
            decorative
          />
        </button>
      );

      const shortcut = screen
        .getByText("N")
        .closest('[data-slot="shortcut-hint"]');
      const group = shortcut?.querySelector('[data-slot="kbd-group"]');

      expect(shortcut).toHaveAttribute("data-surface", "button");
      expect(shortcut).toHaveClass(
        "hidden",
        "sm:inline-flex",
        "opacity-80",
        "group-hover/button:opacity-95"
      );
      expect(group).toHaveClass(
        "bg-muted-foreground/10",
        "ring-border/10",
        "in-data-[surface=button]:bg-transparent",
        "in-data-[surface=button]:text-current",
        "in-data-[surface=button]:ring-current/20"
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

  it("registers the Agent stop shortcut contract", () => {
    expect(HOTKEYS.agentStop).toMatchObject({
      group: "Agent",
      hotkey: "Mod+.",
      id: "agentStop",
      label: "Stop agent response",
      scope: "global",
      when: "Agent turn is active",
    });
  });

  it("keeps Jobs workspace Enter discoverability aligned with detail open", () => {
    const jobsWorkspaceEnterHotkeys = Object.values(HOTKEYS).filter(
      (definition) =>
        definition.scope === "jobs-workspace" && definition.hotkey === "Enter"
    );

    expect(jobsWorkspaceEnterHotkeys).toStrictEqual([
      HOTKEYS.jobsWorkspaceOpenDetail,
    ]);
    expect(HOTKEYS.jobsWorkspaceOpenDetail).toMatchObject({
      id: "jobsWorkspaceOpenDetail",
      label: "Open selected job detail",
    });
  });

  it("keeps the Jobs Near me sequence clear of active map single-key shortcuts", () => {
    const [jobsNearMeFirstChord] = HOTKEYS.jobsNearMe.hotkey.split(/\s+/);
    const [sitesNearMeFirstChord] = HOTKEYS.sitesNearMe.hotkey.split(/\s+/);
    const mapSingleKeyHotkeys: string[] = [];
    for (const definition of Object.values(HOTKEYS)) {
      if (
        definition.scope === "map" &&
        definition.hotkey.split(/\s+/).length === 1
      ) {
        mapSingleKeyHotkeys.push(definition.hotkey);
      }
    }

    expect(mapSingleKeyHotkeys).not.toContain(jobsNearMeFirstChord);
    expect(mapSingleKeyHotkeys).not.toContain(sitesNearMeFirstChord);
  });
});
