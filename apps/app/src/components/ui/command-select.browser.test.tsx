import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommandSelect, ResponsiveCommandSelect } from "./command-select";

function setViewportWidth(width: number) {
  const matches = (query: string) => {
    if (query.includes("display-mode")) {
      return false;
    }

    if (query.includes("max-width")) {
      return width < 768;
    }

    return false;
  };

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: vi.fn<() => void>(),
      addListener: vi.fn<() => void>(),
      dispatchEvent: vi.fn<() => boolean>(),
      matches: matches(query),
      media: query,
      onchange: null,
      removeEventListener: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
    }),
  });
  window.dispatchEvent(new Event("resize"));
}

describe("command select", () => {
  it(
    "renders option shortcuts through ShortcutHint",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      render(
        <CommandSelect
          emptyText="No priorities found"
          groups={[
            {
              label: "Priority",
              options: [
                { label: "None", shortcut: "0", value: "none" },
                { label: "Urgent", shortcut: "1", value: "urgent" },
              ],
            },
          ]}
          id="priority"
          onValueChange={vi.fn<(value: string) => void>()}
          placeholder="Select priority"
          value=""
        />
      );

      await user.click(screen.getByRole("button", { name: "Select priority" }));

      expect(screen.getByLabelText("Urgent shortcut: 1")).toBeVisible();
    }
  );

  it(
    "renders compact option descriptions when provided",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      render(
        <CommandSelect
          emptyText="No roles found"
          groups={[
            {
              label: "Role",
              options: [
                {
                  description: "Can manage members, settings, jobs, and sites.",
                  label: "Admin",
                  value: "admin",
                },
                {
                  description: "For teammates working day to day.",
                  label: "Member",
                  value: "member",
                },
              ],
            },
          ]}
          id="role"
          onValueChange={vi.fn<(value: string) => void>()}
          placeholder="Pick role"
          value="member"
        />
      );

      await user.click(screen.getByRole("button", { name: "Member" }));

      expect(
        screen.getByText("Can manage members, settings, jobs, and sites.")
      ).toBeVisible();
      expect(
        screen.getByRole("option", {
          name: "Admin. Can manage members, settings, jobs, and sites.",
        })
      ).toBeVisible();
    }
  );

  it(
    "can hide search for short option sets",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      render(
        <CommandSelect
          emptyText="No roles found"
          groups={[
            {
              label: "Role",
              options: [{ label: "Member", value: "member" }],
            },
          ]}
          id="role"
          onValueChange={vi.fn<(value: string) => void>()}
          placeholder="Pick role"
          searchable={false}
          value="member"
        />
      );

      await user.click(screen.getByRole("button", { name: "Member" }));

      expect(
        screen.queryByPlaceholderText("Pick role")
      ).not.toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Member" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    }
  );

  it(
    "keeps non-searchable selected state aligned with the current value",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      render(
        <CommandSelect
          emptyText="No roles found"
          groups={[
            {
              label: "Role",
              options: [
                {
                  description: "Can manage members, settings, jobs, and sites.",
                  label: "Admin",
                  value: "admin",
                },
                {
                  description: "For teammates working day to day.",
                  label: "Member",
                  value: "member",
                },
              ],
            },
          ]}
          id="role"
          onValueChange={vi.fn<(value: string) => void>()}
          placeholder="Pick role"
          searchable={false}
          value="member"
        />
      );

      await user.click(screen.getByRole("button", { name: "Member" }));

      expect(
        screen.getByRole("option", {
          name: "Admin. Can manage members, settings, jobs, and sites.",
        })
      ).toHaveAttribute("aria-selected", "false");
      expect(
        screen.getByRole("option", {
          name: "Member. For teammates working day to day.",
        })
      ).toHaveAttribute("aria-selected", "true");
    }
  );

  it(
    "uses a bottom drawer for responsive selects on mobile",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      act(() => {
        setViewportWidth(390);
      });

      render(
        <ResponsiveCommandSelect
          drawerTitle="Role"
          emptyText="No roles found"
          groups={[
            {
              label: "Role",
              options: [
                {
                  description: "Can manage members, settings, jobs, and sites.",
                  label: "Admin",
                  value: "admin",
                },
                {
                  description: "For teammates working day to day.",
                  label: "Member",
                  value: "member",
                },
              ],
            },
          ]}
          id="role"
          onValueChange={vi.fn<(value: string) => void>()}
          placeholder="Pick role"
          searchable={false}
          showGroupHeadings={false}
          value="member"
        />
      );

      await user.click(screen.getByRole("button", { name: "Member" }));

      expect(screen.getByRole("heading", { name: "Role" })).toBeVisible();
      expect(
        screen.queryByPlaceholderText("Pick role")
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("option", {
          name: "Admin. Can manage members, settings, jobs, and sites.",
        })
      ).toBeVisible();
    }
  );
});
