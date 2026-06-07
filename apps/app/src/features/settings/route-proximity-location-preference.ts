import { getCurrentUserPreferences } from "./user-preferences-api";

export type RouteProximityLocationPreferenceStatus =
  | "disabled"
  | "enabled"
  | "unavailable";

export async function loadRouteProximityLocationPreferenceStatus(): Promise<RouteProximityLocationPreferenceStatus> {
  try {
    const response = await getCurrentUserPreferences();

    return response.preferences.routeProximityLocationEnabled
      ? "enabled"
      : "disabled";
  } catch {
    return "unavailable";
  }
}

export async function loadRouteProximityLocationPreferenceEnabled(): Promise<boolean> {
  return (await loadRouteProximityLocationPreferenceStatus()) === "enabled";
}
