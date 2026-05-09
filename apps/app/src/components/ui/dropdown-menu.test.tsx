import { render, screen } from "@testing-library/react";

import { DropdownMenuLabel } from "./dropdown-menu";

describe("dropdown menu", () => {
  it("allows labels to render as standalone menu headers", () => {
    expect(() => {
      render(<DropdownMenuLabel>Organizations</DropdownMenuLabel>);
    }).not.toThrow();

    expect(screen.getByText("Organizations")).toBeInTheDocument();
  });
});
