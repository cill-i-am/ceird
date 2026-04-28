import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommandSelect } from "./command-select";

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
});
