import type * as UserPreferencesApiModule from "#/features/settings/user-preferences-api";

import { loadLocationAccessRouteData } from "./location-access-route-loader";

const { mockedGetCurrentUserPreferences } = vi.hoisted(() => ({
  mockedGetCurrentUserPreferences:
    vi.fn<typeof UserPreferencesApiModule.getCurrentUserPreferences>(),
}));

vi.mock(import("#/features/settings/user-preferences-api"), () => ({
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
        preferences: {
          routeProximityLocationEnabled: true,
          updatedAt: "2026-06-06T10:00:00.000Z",
        },
        status: "available",
      },
    });
  });

  it("returns unavailable state without forged preferences when preferences cannot be loaded", async () => {
    mockedGetCurrentUserPreferences.mockRejectedValue(new Error("failed"));

    await expect(loadLocationAccessRouteData()).resolves.toStrictEqual({
      preferences: {
        status: "unavailable",
      },
    });
  });
});
