import { render, screen } from "@testing-library/react";

import { Button } from "#/components/ui/button";

import { AppPageHeader } from "./app-page-header";

describe("app page header", () => {
  it(
    "renders the heading, supporting copy, actions, and secondary content",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppPageHeader
          eyebrow="Workspace"
          title="Crew access"
          description="Keep teammates moving without adding admin noise."
          actions={<Button type="button">Invite teammate</Button>}
        >
          <p>1 pending invitation</p>
        </AppPageHeader>
      );

      expect(
        screen.getByRole("heading", { name: "Crew access" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("Keep teammates moving without adding admin noise.")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Invite teammate" })
      ).toBeInTheDocument();
      expect(screen.getByText("Workspace")).toBeInTheDocument();
      expect(screen.getByText("1 pending invitation")).toBeInTheDocument();
    }
  );
});
