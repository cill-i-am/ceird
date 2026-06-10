import { render, screen, within } from "@testing-library/react";

import { AppStatusStrip, AppStatusStripItem } from "./app-status-strip";

describe("app status strip", () => {
  it(
    "keeps primary values readable and secondary metadata on its own line",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppStatusStrip label="Workspace status">
          <AppStatusStripItem
            label="Organization"
            value="North County Site Services and Maintenance"
            meta="dispatch+ops-team@example-contracting-company.com"
          />
        </AppStatusStrip>
      );

      const item = within(
        screen.getByRole("region", { name: /workspace status/i })
      ).getByRole("listitem");

      expect(
        within(item).getByText("North County Site Services and Maintenance")
      ).not.toHaveClass("truncate");
      expect(
        within(item).getByText(
          "dispatch+ops-team@example-contracting-company.com"
        )
      ).toBeVisible();
      expect(item).not.toHaveClass("justify-between");
    }
  );
});
