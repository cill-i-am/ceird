import { render, screen } from "@testing-library/react";

import { Button } from "#/components/ui/button";

import {
  AppRowList,
  AppRowListActions,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "./app-row-list";

describe("app row list", () => {
  it(
    "renders dense operational rows with list semantics",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppRowList aria-label="Pending invitations">
          <AppRowListItem>
            <AppRowListLeading aria-hidden="true">01</AppRowListLeading>
            <AppRowListBody
              eyebrow="Member"
              title="person@example.com"
              description="Awaiting a response from the invited teammate."
            />
            <AppRowListMeta>
              <span>Pending</span>
            </AppRowListMeta>
            <AppRowListActions>
              <Button type="button" size="sm" variant="outline">
                Resend
              </Button>
            </AppRowListActions>
          </AppRowListItem>
          <AppRowListItem>
            <AppRowListBody
              title="owner@example.com"
              description="Signed in and active."
            />
          </AppRowListItem>
        </AppRowList>
      );

      expect(
        screen.getByRole("list", { name: "Pending invitations" })
      ).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      expect(screen.getByText("person@example.com")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Resend" })
      ).toBeInTheDocument();
    }
  );
});
