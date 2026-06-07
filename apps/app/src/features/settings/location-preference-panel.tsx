import type { UserPreferences } from "@ceird/identity-core";
import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";

export interface LocationPreferencePanelProps {
  readonly preferences: UserPreferences;
  readonly unavailable?: boolean | undefined;
  readonly onPreferenceChange: (enabled: boolean) => Promise<UserPreferences>;
}

export function LocationPreferencePanel({
  preferences,
  unavailable = false,
  onPreferenceChange,
}: LocationPreferencePanelProps) {
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

  const enabled = preferences.routeProximityLocationEnabled;
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
      await onPreferenceChange(nextEnabled);
      setMessage(
        nextEnabled
          ? "Ceird will ask this browser for fresh location when you run nearby jobs or sites."
          : "Ceird will ask before using current location again."
      );
    } catch {
      setMessage("Location preference could not be updated.");
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
              role="status"
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
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
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
