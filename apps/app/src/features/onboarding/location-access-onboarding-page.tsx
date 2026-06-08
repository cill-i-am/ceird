import type { UserPreferences } from "@ceird/identity-core";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { EntryShell, EntrySurfaceCard } from "#/features/auth/entry-shell";
import { LocationPreferencePanel } from "#/features/settings/location-preference-panel";
import {
  DEFAULT_USER_PREFERENCES,
  updateCurrentUserPreferences,
} from "#/features/settings/user-preferences-api";
import { cn } from "#/lib/utils";

export function LocationAccessOnboardingPage() {
  const navigate = useNavigate({ from: "/location-access" });
  const [preferences, setPreferences] = React.useState<UserPreferences>(
    DEFAULT_USER_PREFERENCES
  );
  const [locationPreferenceSaving, setLocationPreferenceSaving] =
    React.useState(false);
  const hasEnabledLocationAccess = preferences.routeProximityLocationEnabled;

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
                onClick={() => void navigate({ to: "/" })}
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
            onPreferenceChange={async (routeProximityLocationEnabled) => {
              setLocationPreferenceSaving(true);

              try {
                const response = await updateCurrentUserPreferences({
                  routeProximityLocationEnabled,
                });
                setPreferences(response.preferences);
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
