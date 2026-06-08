import type * as UserPreferencesApiModule from "#/features/settings/user-preferences-api";

import { loadLocationAccessRouteData } from "./location-access-route-loader";

const { mockedGetCurrentUserPreferences } = vi.hoisted(() => ({
  mockedGetCurrentUserPreferences:
    vi.fn<typeof UserPreferencesApiModule.getCurrentUserPreferences>(),
}));

vi.mock(import("#/features/settings/user-preferences-api"), () => ({
  DEFAULT_USER_PREFERENCES: {
    routeProximityLocationEnabled: false,
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  getCurrentUserPreferences: mockedGetCurrentUserPreferences,
}));

describe("location access route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the current route proximity preference", async () => {
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });

    await expect(loadLocationAccessRouteData()).resolves.toStrictEqual({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
      preferencesUnavailable: false,
    });
  });

  it("falls back when preferences cannot be loaded", async () => {
    mockedGetCurrentUserPreferences.mockRejectedValue(new Error("failed"));

    await expect(loadLocationAccessRouteData()).resolves.toStrictEqual({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
      preferencesUnavailable: true,
    });
  });
});
