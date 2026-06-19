import { getCurrentUserPreferences } from "./user-preferences-api";
import type { UserPreferencesLoadState } from "./user-preferences-api";

export interface UserSettingsRouteData {
  readonly preferences: UserPreferencesLoadState;
}

export async function loadUserSettingsRouteData(): Promise<UserSettingsRouteData> {
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
