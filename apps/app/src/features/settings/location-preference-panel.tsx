import type { UserPreferences } from "@ceird/identity-core";
import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";

import type { UserPreferencesLoadState } from "./user-preferences-api";

export interface LocationPreferencePanelProps {
  readonly getPreferenceChangeFailureMessage?:
    | ((error: unknown) => string | undefined)
    | undefined;
  readonly preferences: UserPreferencesLoadState;
  readonly onBeforeEnable?: (() => Promise<void>) | undefined;
  readonly onPreferenceChange: (enabled: boolean) => Promise<UserPreferences>;
}

export function LocationPreferencePanel({
  getPreferenceChangeFailureMessage,
  onBeforeEnable,
  preferences,
  onPreferenceChange,
}: LocationPreferencePanelProps) {
  const unavailable = preferences.status === "unavailable";
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(
    unavailable ? "Location preference could not be loaded." : null
  );

  React.useEffect(() => {
    if (unavailable) {
      setMessage("Location preference could not be loaded.");
      return;
    }

    setMessage((currentMessage) =>
      currentMessage === "Location preference could not be loaded."
        ? null
        : currentMessage
    );
  }, [unavailable]);

  const enabled =
    preferences.status === "available"
      ? preferences.preferences.routeProximityLocationEnabled
      : false;
  const statusLabel = getLocationPreferenceStatusLabel({
    enabled,
    unavailable,
  });

  async function handleUpdate(nextEnabled: boolean) {
    if (unavailable) {
      setMessage("Location preference could not be loaded.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      if (nextEnabled && onBeforeEnable) {
        await onBeforeEnable();
      }

      await onPreferenceChange(nextEnabled);

      if (!nextEnabled) {
        setMessage("Ceird will ask before using current location again.");
      } else if (onBeforeEnable) {
        setMessage(
          "Location permission granted. Ceird will use fresh location when you run nearby jobs or sites."
        );
      } else {
        setMessage(
          "Ceird will ask this browser for fresh location when you run nearby jobs or sites."
        );
      }
    } catch (error) {
      setMessage(
        getPreferenceChangeFailureMessage?.(error) ??
          "Location preference could not be updated."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border/70 bg-background p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={Location01Icon}
                size={16}
                strokeWidth={2}
                aria-hidden
              />
            </span>
            <h3 className="font-heading text-base font-medium text-foreground">
              Location access
            </h3>
            <Badge
              variant={enabled && !unavailable ? "secondary" : "outline"}
              render={<output aria-live="polite" />}
            >
              {statusLabel}
            </Badge>
          </div>
          <p className="max-w-[60ch] text-sm/6 text-muted-foreground">
            Let Ceird offer traffic-aware nearby jobs and sites. Coordinates are
            requested fresh from this device when you use nearby routes and are
            not stored in this preference.
          </p>
          {message ? (
            <output
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              {message}
            </output>
          ) : null}
        </div>

        <Button
          type="button"
          variant={enabled ? "outline" : "default"}
          className="shrink-0 max-sm:w-full"
          loading={isSaving}
          disabled={isSaving || unavailable}
          onClick={() => void handleUpdate(!enabled)}
        >
          <HugeiconsIcon
            icon={Location01Icon}
            size={16}
            strokeWidth={2}
            aria-hidden
          />
          {enabled ? "Disable location access" : "Enable location access"}
        </Button>
      </div>
    </section>
  );
}

function getLocationPreferenceStatusLabel({
  enabled,
  unavailable,
}: {
  readonly enabled: boolean;
  readonly unavailable: boolean;
}) {
  if (unavailable) {
    return "Unavailable";
  }

  return enabled ? "Enabled" : "Disabled";
}
