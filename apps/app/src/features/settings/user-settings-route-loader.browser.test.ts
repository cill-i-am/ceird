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
        preferences: {
          routeProximityLocationEnabled: true,
          updatedAt: "2026-06-06T10:00:00.000Z",
        },
        status: "available",
      },
    });
  });

  it("returns unavailable state without forged preferences when loading fails", async () => {
    mockedGetCurrentUserPreferences.mockRejectedValue(new Error("offline"));

    const { loadUserSettingsRouteData } =
      await import("./user-settings-route-loader");

    await expect(loadUserSettingsRouteData()).resolves.toStrictEqual({
      preferences: {
        status: "unavailable",
      },
    });
  });
});
