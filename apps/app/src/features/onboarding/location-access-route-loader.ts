import { getCurrentUserPreferences } from "#/features/settings/user-preferences-api";
import type { UserPreferencesLoadState } from "#/features/settings/user-preferences-api";

export interface LocationAccessRouteData {
  readonly preferences: UserPreferencesLoadState;
}

export async function loadLocationAccessRouteData(): Promise<LocationAccessRouteData> {
  try {
    const response = await getCurrentUserPreferences();

    return {
      preferences: {
        preferences: response.preferences,
        status: "available",
      },
    };
  } catch {
    return {
      preferences: {
        status: "unavailable",
      },
    };
  }
}
