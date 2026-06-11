import type * as RouterModule from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import type * as UserSettingsPageModule from "#/features/settings/user-settings-page";
import type * as UserSettingsRouteLoaderModule from "#/features/settings/user-settings-route-loader";
import type * as UserSettingsSearchModule from "#/features/settings/user-settings-search";

const {
  mockedUseLoaderData,
  mockedUseRouteContext,
  mockedUseSearch,
  mockedUserSettingsPage,
} = vi.hoisted(() => ({
  mockedUseLoaderData: vi.fn<() => unknown>(),
  mockedUseRouteContext: vi.fn<() => unknown>(),
  mockedUseSearch: vi.fn<() => unknown>(),
  mockedUserSettingsPage: vi.fn<(props: unknown) => ReactElement>(() => (
    <div data-testid="user-settings-page" />
  )),
}));

vi.mock(import("@tanstack/react-router"), () => ({
  createFileRoute: (() => (options: unknown) => ({
    options,
    useLoaderData: mockedUseLoaderData,
    useSearch: mockedUseSearch,
  })) as unknown as typeof RouterModule.createFileRoute,
  useRouteContext: mockedUseRouteContext as typeof RouterModule.useRouteContext,
}));

vi.mock(import("#/features/settings/user-settings-page"), () => ({
  UserSettingsPage:
    mockedUserSettingsPage as unknown as typeof UserSettingsPageModule.UserSettingsPage,
}));

vi.mock(import("#/features/settings/user-settings-route-loader"), () => ({
  loadUserSettingsRouteData:
    vi.fn<typeof UserSettingsRouteLoaderModule.loadUserSettingsRouteData>(),
}));

vi.mock(import("#/features/settings/user-settings-search"), () => ({
  decodeUserSettingsSearch: vi.fn<
    typeof UserSettingsSearchModule.decodeUserSettingsSearch
  >(
    (search) =>
      search as ReturnType<
        typeof UserSettingsSearchModule.decodeUserSettingsSearch
      >
  ),
}));

describe("settings route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes app context and search state into the user settings page", async () => {
    const user = {
      email: "person@example.com",
      emailVerified: true,
      image: null,
      name: "Taylor Example",
      twoFactorEnabled: true,
    };
    mockedUseRouteContext.mockReturnValue({
      currentOrganizationRole: "owner",
      session: { user },
    });
    mockedUseLoaderData.mockReturnValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-07T10:00:00.000Z",
      },
      preferencesUnavailable: false,
    });
    mockedUseSearch.mockReturnValue({ emailChange: "complete" });

    const { Route } = await import("./_app.settings");
    const SettingsRoute = Route.options.component;

    if (SettingsRoute === undefined) {
      throw new Error("Settings route component is not registered.");
    }

    render(<SettingsRoute />);

    expect(mockedUseRouteContext).toHaveBeenCalledWith({ from: "/_app" });
    expect(mockedUserSettingsPage).toHaveBeenCalledWith(
      {
        currentOrganizationRole: "owner",
        emailChangeStatus: "complete",
        preferences: {
          routeProximityLocationEnabled: true,
          updatedAt: "2026-06-07T10:00:00.000Z",
        },
        preferencesUnavailable: false,
        user,
      },
      undefined
    );
  });
});
