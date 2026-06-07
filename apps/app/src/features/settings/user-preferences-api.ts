import type {
  UpdateUserPreferencesInput,
  UserPreferences,
  UserPreferencesResponse,
} from "@ceird/identity-core";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect } from "effect";

import type { AppApiClient } from "#/features/api/app-api-client";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

const importUserPreferencesServerSsr = () =>
  import("./user-preferences-api.server");

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  routeProximityLocationEnabled: false,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

const getCurrentUserPreferencesIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerUserPreferencesDirect } =
      await importUserPreferencesServerSsr();

    return await getCurrentServerUserPreferencesDirect();
  })
  .client(() => getCurrentBrowserUserPreferences());

const updateCurrentUserPreferencesIsomorphic = createIsomorphicFn()
  .server(async (input: UpdateUserPreferencesInput) => {
    const { updateCurrentServerUserPreferencesDirect } =
      await importUserPreferencesServerSsr();

    return await updateCurrentServerUserPreferencesDirect(input);
  })
  .client((input: UpdateUserPreferencesInput) =>
    updateCurrentBrowserUserPreferences(input)
  );

function runBrowserAppApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

async function getCurrentBrowserUserPreferences(): Promise<UserPreferencesResponse> {
  return await runBrowserAppApiClient(
    "UserPreferencesClient.getUserPreferences",
    (client) => client.userPreferences.getUserPreferences()
  );
}

async function updateCurrentBrowserUserPreferences(
  input: UpdateUserPreferencesInput
): Promise<UserPreferencesResponse> {
  return await runBrowserAppApiClient(
    "UserPreferencesClient.updateUserPreferences",
    (client) =>
      client.userPreferences.updateUserPreferences({
        payload: input,
      })
  );
}

export function getCurrentUserPreferences(): Promise<UserPreferencesResponse> {
  return getCurrentUserPreferencesIsomorphic();
}

export function updateCurrentUserPreferences(
  input: UpdateUserPreferencesInput
): Promise<UserPreferencesResponse> {
  return updateCurrentUserPreferencesIsomorphic(input);
}
