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

describe("route proximity location preference helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads enabled preference status", async () => {
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });

    const {
      loadRouteProximityLocationPreferenceEnabled,
      loadRouteProximityLocationPreferenceStatus,
    } = await import("./route-proximity-location-preference");

    await expect(loadRouteProximityLocationPreferenceStatus()).resolves.toBe(
      "enabled"
    );
    await expect(
      loadRouteProximityLocationPreferenceEnabled()
    ).resolves.toBeTruthy();
  });

  it("loads disabled preference status", async () => {
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });

    const {
      loadRouteProximityLocationPreferenceEnabled,
      loadRouteProximityLocationPreferenceStatus,
    } = await import("./route-proximity-location-preference");

    await expect(loadRouteProximityLocationPreferenceStatus()).resolves.toBe(
      "disabled"
    );
    await expect(
      loadRouteProximityLocationPreferenceEnabled()
    ).resolves.toBeFalsy();
  });

  it("fails closed when preference loading is unavailable", async () => {
    mockedGetCurrentUserPreferences.mockRejectedValue(new Error("offline"));

    const {
      loadRouteProximityLocationPreferenceEnabled,
      loadRouteProximityLocationPreferenceStatus,
    } = await import("./route-proximity-location-preference");

    await expect(loadRouteProximityLocationPreferenceStatus()).resolves.toBe(
      "unavailable"
    );
    await expect(
      loadRouteProximityLocationPreferenceEnabled()
    ).resolves.toBeFalsy();
  });
});
