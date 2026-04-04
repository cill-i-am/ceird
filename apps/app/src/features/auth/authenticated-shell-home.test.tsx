import { render, screen } from "@testing-library/react";

import { AuthenticatedShellHome } from "./authenticated-shell-home";

describe("authenticated shell home", () => {
  it(
    "shows the work heading and hides the starter copy",
    {
      timeout: 10_000,
    },
    () => {
      render(<AuthenticatedShellHome />);

      expect(
        screen.getByRole("heading", { name: /your work/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/start simple, ship quickly/i)
      ).not.toBeInTheDocument();
    }
  );
});
