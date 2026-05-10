import { render, screen } from "@testing-library/react";

import { DropdownMenuHeader } from "./dropdown-menu";

describe("dropdown menu", () => {
  it("allows standalone visual menu headers outside primitive groups", () => {
    expect(() => {
      render(<DropdownMenuHeader>Organizations</DropdownMenuHeader>);
    }).not.toThrow();

    expect(screen.getByText("Organizations")).toBeInTheDocument();
  });
});
