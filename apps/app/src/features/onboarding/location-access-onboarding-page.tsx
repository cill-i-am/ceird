import type { UserPreferences } from "@ceird/identity-core";
import { useNavigate } from "@tanstack/react-router";
import { Effect } from "effect";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { EntryShell, EntrySurfaceCard } from "#/features/auth/entry-shell";
import { LocationPreferencePanel } from "#/features/settings/location-preference-panel";
import { updateCurrentUserPreferences } from "#/features/settings/user-preferences-api";
import type { UserPreferencesLoadState } from "#/features/settings/user-preferences-api";
import {
  formatBrowserGeolocationError,
  requestBrowserGeolocation,
} from "#/lib/browser-geolocation";
import type { BrowserGeolocationError } from "#/lib/browser-geolocation";
import { cn } from "#/lib/utils";

export function LocationAccessOnboardingPage({
  initialPreferences,
}: {
  readonly initialPreferences: UserPreferencesLoadState;
}) {
  const navigate = useNavigate({ from: "/location-access" });
  const [savedPreferences, setSavedPreferences] =
    React.useState<UserPreferences | null>(null);
  const [locationPreferenceSaving, setLocationPreferenceSaving] =
    React.useState(false);
  const preferences: UserPreferencesLoadState =
    savedPreferences === null
      ? initialPreferences
      : {
          preferences: savedPreferences,
          status: "available",
        };
  const hasEnabledLocationAccess =
    preferences.status === "available"
      ? preferences.preferences.routeProximityLocationEnabled
      : false;

  return (
    <main className="flex min-h-screen">
      <EntryShell atmosphere="setup">
        <EntrySurfaceCard
          className="max-w-xl"
          title="Set up nearby work"
          titleLevel={1}
          description="Let Ceird rank jobs and sites by drive time when you use Near me."
          footer={
            <div
              className={cn(
                "flex flex-col items-stretch gap-2",
                hasEnabledLocationAccess ? undefined : "sm:items-start"
              )}
            >
              <Button
                type="button"
                variant={hasEnabledLocationAccess ? "default" : "ghost"}
                size={hasEnabledLocationAccess ? "lg" : "default"}
                className={cn(
                  "justify-center",
                  hasEnabledLocationAccess
                    ? "w-full [view-transition-name:auth-card-action]"
                    : "min-h-11 px-3 text-muted-foreground sm:min-h-9"
                )}
                disabled={locationPreferenceSaving}
                onClick={() => void navigate({ to: "/create-organization" })}
              >
                {hasEnabledLocationAccess
                  ? "Continue to Ceird"
                  : "Skip for now"}
              </Button>
            </div>
          }
        >
          <LocationPreferencePanel
            preferences={preferences}
            getPreferenceChangeFailureMessage={(error) =>
              error instanceof Error ? error.message : undefined
            }
            onBeforeEnable={async () => {
              try {
                await Effect.runPromise(requestBrowserGeolocation());
              } catch (error) {
                throw new Error(
                  formatBrowserGeolocationError(
                    error as BrowserGeolocationError
                  ),
                  { cause: error }
                );
              }
            }}
            onPreferenceChange={async (routeProximityLocationEnabled) => {
              setLocationPreferenceSaving(true);

              try {
                const response = await updateCurrentUserPreferences({
                  routeProximityLocationEnabled,
                });
                setSavedPreferences(response.preferences);
                return response.preferences;
              } finally {
                setLocationPreferenceSaving(false);
              }
            }}
          />
        </EntrySurfaceCard>
      </EntryShell>
    </main>
  );
}
