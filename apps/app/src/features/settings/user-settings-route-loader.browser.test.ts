import { describe, expect, it, vi } from "vitest";

const { mockedGetCurrentUserPreferences } = vi.hoisted(() => ({
  mockedGetCurrentUserPreferences: vi.fn<
    () => Promise<{
      preferences: {
        routeProximityLocationEnabled: boolean;
        updatedAt: string;
      };
    }>
  >(),
}));

vi.mock(import("./user-preferences-api"), () => ({
  DEFAULT_USER_PREFERENCES: {
    routeProximityLocationEnabled: false,
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  getCurrentUserPreferences: mockedGetCurrentUserPreferences,
}));

describe("user settings route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns preferences when loading succeeds", async () => {
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });

    const { loadUserSettingsRouteData } =
      await import("./user-settings-route-loader");

    await expect(loadUserSettingsRouteData()).resolves.toStrictEqual({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
      preferencesUnavailable: false,
    });
  });

  it("returns default preferences when loading fails", async () => {
    mockedGetCurrentUserPreferences.mockRejectedValue(new Error("offline"));

    const { loadUserSettingsRouteData } =
      await import("./user-settings-route-loader");

    await expect(loadUserSettingsRouteData()).resolves.toStrictEqual({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
      preferencesUnavailable: true,
    });
  });
});
