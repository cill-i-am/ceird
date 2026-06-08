import { render } from "@testing-library/react";

const {
  mockedUseLoaderData,
  mockedUseRouteContext,
  mockedUseSearch,
  mockedUserSettingsPage,
} = vi.hoisted(() => ({
  mockedUseLoaderData: vi.fn<() => unknown>(),
  mockedUseRouteContext: vi.fn<() => unknown>(),
  mockedUseSearch: vi.fn<() => unknown>(),
  mockedUserSettingsPage: vi.fn<(props: unknown) => null>(() => null),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    createFileRoute: (() => (options: unknown) => ({
      options,
      useLoaderData: mockedUseLoaderData,
      useSearch: mockedUseSearch,
    })) as unknown as typeof actual.createFileRoute,
    useRouteContext: mockedUseRouteContext as typeof actual.useRouteContext,
  };
});

vi.mock(
  import("#/features/settings/user-settings-page"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      UserSettingsPage:
        mockedUserSettingsPage as unknown as typeof actual.UserSettingsPage,
    };
  }
);

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
