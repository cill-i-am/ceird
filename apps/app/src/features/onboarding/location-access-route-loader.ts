import type { UserPreferences } from "@ceird/identity-core";

import {
  DEFAULT_USER_PREFERENCES,
  getCurrentUserPreferences,
} from "#/features/settings/user-preferences-api";

export interface LocationAccessRouteData {
  readonly preferences: UserPreferences;
  readonly preferencesUnavailable: boolean;
}

export async function loadLocationAccessRouteData(): Promise<LocationAccessRouteData> {
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
