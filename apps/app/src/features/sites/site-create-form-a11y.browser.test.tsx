import type {
  GooglePlaceIdType,
  GooglePlacesSessionTokenType,
  SiteLocationSuggestion,
} from "@ceird/sites-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import * as React from "react";

import type {
  AppApiClient,
  runBrowserAppApiRequest,
} from "#/features/api/app-api-client";

import {
  createDefaultSiteCreateDraft,
  SiteAddressFields,
} from "./site-create-form";
import type { SiteCreateDraft } from "./site-create-form";

const { mockedRunBrowserAppApiRequest } = vi.hoisted(() => ({
  mockedRunBrowserAppApiRequest:
    vi.fn<
      (
        operation: string,
        execute: (_client: AppApiClient) => Effect.Effect<unknown>
      ) => Effect.Effect<unknown>
    >(),
}));

vi.mock(import("#/features/api/app-api-client"), () => ({
  runBrowserAppApiRequest:
    mockedRunBrowserAppApiRequest as unknown as typeof runBrowserAppApiRequest,
}));

const suggestions = [
  {
    displayText: "Dublin Port",
    placeId: "ChIJ-port" as GooglePlaceIdType,
    secondaryText: "Dublin, Ireland",
  },
  {
    displayText: "Dublin Airport",
    placeId: "ChIJ-airport" as GooglePlaceIdType,
    secondaryText: "County Dublin, Ireland",
  },
] satisfies SiteLocationSuggestion[];

describe("site location autocomplete accessibility", () => {
  beforeEach(() => {
    mockedRunBrowserAppApiRequest.mockImplementation(
      (
        _operation: string,
        execute: (_client: AppApiClient) => Effect.Effect<unknown>
      ) =>
        execute({
          sites: {
            autocompleteSiteLocation: () =>
              Effect.succeed({
                suggestions,
              }),
          },
        } as unknown as AppApiClient)
    );
  });

  afterEach(() => {
    mockedRunBrowserAppApiRequest.mockReset();
  });

  it("exposes combobox state and selects suggestions with keyboard or pointer", async () => {
    const user = userEvent.setup();
    render(<SiteAddressFieldsHarness />);

    const locationInput = screen.getByRole("combobox", { name: "Location" });
    expect(locationInput).toHaveAttribute("aria-expanded", "false");

    await user.type(locationInput, "Dub");

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(locationInput).toHaveAttribute("aria-expanded", "true");
    expect(options[0]).toHaveAccessibleName("Dublin Port, Dublin, Ireland");
    await waitFor(() =>
      expect(options[0]).toHaveAttribute("aria-selected", "true")
    );
    expect(locationInput).toHaveAttribute(
      "aria-activedescendant",
      "site-test-location-suggestions-0"
    );

    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(locationInput).toHaveAttribute(
      "aria-activedescendant",
      "site-test-location-suggestions-1"
    );

    await user.keyboard("{Enter}");
    expect(locationInput).toHaveValue("Dublin Airport");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(locationInput).toHaveAttribute("aria-expanded", "false");

    await user.clear(locationInput);
    await user.type(locationInput, "Dub");
    await user.click(
      await screen.findByRole("option", {
        name: "Dublin Port, Dublin, Ireland",
      })
    );

    expect(locationInput).toHaveValue("Dublin Port");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("dismisses suggestions with Escape while returning focus to the combobox", async () => {
    const user = userEvent.setup();
    render(<SiteAddressFieldsHarness />);

    const locationInput = screen.getByRole("combobox", { name: "Location" });

    await user.type(locationInput, "Dub");
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    );
    expect(locationInput).toHaveFocus();
    expect(locationInput).toHaveAttribute("aria-expanded", "false");
  });
});

function SiteAddressFieldsHarness() {
  const [draft, setDraft] = React.useState<SiteCreateDraft>({
    ...createDefaultSiteCreateDraft(),
    locationSessionToken:
      "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType,
  });

  return (
    <SiteAddressFields
      draft={draft}
      errors={{}}
      idPrefix="site-test"
      onDraftPatch={(patch) =>
        setDraft((currentDraft) => ({ ...currentDraft, ...patch }))
      }
    />
  );
}
