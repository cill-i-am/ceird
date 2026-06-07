import type { UserPreferences } from "@ceird/identity-core";

import {
  DEFAULT_USER_PREFERENCES,
  getCurrentUserPreferences,
} from "./user-preferences-api";

export interface UserSettingsRouteData {
  readonly preferences: UserPreferences;
  readonly preferencesUnavailable: boolean;
}

export async function loadUserSettingsRouteData(): Promise<UserSettingsRouteData> {
  try {
    const response = await getCurrentUserPreferences();

    return {
      preferences: response.preferences,
      preferencesUnavailable: false,
    };
  } catch {
    return {
      preferences: DEFAULT_USER_PREFERENCES,
      preferencesUnavailable: true,
    };
  }
}
