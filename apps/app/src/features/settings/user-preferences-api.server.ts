import type {
  UpdateUserPreferencesInput,
  UserPreferencesResponse,
} from "@ceird/identity-core";

import { runAppApiClient } from "#/features/api/app-api-client";
import { readServerAppApiRequestStrict } from "#/features/api/app-api-server-ssr";

export async function getCurrentServerUserPreferencesDirect(): Promise<UserPreferencesResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "UserPreferencesServer.getUserPreferences",
    (client) => client.userPreferences.getUserPreferences()
  );
}

export async function updateCurrentServerUserPreferencesDirect(
  input: UpdateUserPreferencesInput
): Promise<UserPreferencesResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "UserPreferencesServer.updateUserPreferences",
    (client) =>
      client.userPreferences.updateUserPreferences({
        payload: input,
      })
  );
}
