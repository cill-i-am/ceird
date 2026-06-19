import type { LabelColor } from "@ceird/labels-core";
import { DEFAULT_LABEL_COLOR, LABEL_COLOR_OPTIONS } from "@ceird/labels-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { TooltipProvider } from "#/components/ui/tooltip";

import {
  LabelColorPicker,
  normalizeLabelColorInput,
} from "./label-color-picker";

describe("label color picker", () => {
  it("selects curated colors with a keyboard-accessible radio bank", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(color: LabelColor) => void>();

    renderColorPicker({ onChange });

    await user.tab();
    const trigger = screen.getByRole("button", { name: /choose label color/i });
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    const bank = await screen.findByRole("radiogroup", {
      name: /curated label colors/i,
    });
    const mutedRed = within(bank).getByRole("radio", {
      name: /muted red/i,
    });
    const blue = within(bank).getByRole("radio", { name: /blue/i });

    expect(mutedRed).toHaveAttribute("aria-checked", "true");
    expect(blue).toHaveAttribute("aria-checked", "false");
    expect(mutedRed).toHaveFocus();

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(blue).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith(LABEL_COLOR_OPTIONS[4].color);
  });

  it("opens the advanced picker in a popover and applies canonical OKLCH text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(color: LabelColor) => void>();

    renderColorPicker({ onChange });

    await user.click(
      screen.getByRole("button", { name: /choose label color/i })
    );
    await user.click(screen.getByRole("button", { name: /advanced/i }));

    await expect(
      screen.findByText("Custom label color")
    ).resolves.toBeVisible();

    const input = screen.getByRole("textbox", { name: /oklch or hex/i });
    await user.clear(input);
    await user.type(input, "oklch(69% 0.04 250)");
    await user.click(screen.getByRole("button", { name: /apply color/i }));

    expect(onChange).toHaveBeenCalledWith("oklch(69% 0.04 250)");
    await waitFor(() => {
      expect(screen.queryByText("Custom label color")).toBeNull();
    });
  });

  it("normalizes hex input to canonical OKLCH and rejects invalid colors", async () => {
    expect(normalizeLabelColorInput("#3b82f6")).toMatchObject({
      kind: "valid",
      color: "oklch(62.308% 0.188 259.815)",
    });
    expect(normalizeLabelColorInput("transparent")).toStrictEqual({
      kind: "invalid",
      message: "Use canonical OKLCH like oklch(64% 0.19 28) or a hex color.",
    });

    const user = userEvent.setup();
    const onChange = vi.fn<(color: LabelColor) => void>();

    renderColorPicker({ onChange });
    await user.click(
      screen.getByRole("button", { name: /choose label color/i })
    );
    await user.click(screen.getByRole("button", { name: /advanced/i }));
    const input = await screen.findByRole("textbox", {
      name: /oklch or hex/i,
    });

    await user.clear(input);
    await user.type(input, "transparent");

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "Use canonical OKLCH"
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

function renderColorPicker({
  onChange = () => null,
  value = DEFAULT_LABEL_COLOR,
}: {
  readonly onChange?: (color: LabelColor) => void;
  readonly value?: LabelColor;
} = {}) {
  function Harness() {
    const [color, setColor] = React.useState(value);

    return (
      <TooltipProvider>
        <LabelColorPicker
          value={color}
          onChange={(nextColor) => {
            setColor(nextColor);
            onChange(nextColor);
          }}
        />
      </TooltipProvider>
    );
  }

  return render(<Harness />);
}
