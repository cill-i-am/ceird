import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "#/components/ui/field";

const SIGNUP_LOCATION_ACCESS_ID = "signup-location-access";

export function LocationAccessStep({
  enabled,
  onEnabledChange,
}: {
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <section
      aria-labelledby="signup-location-access-title"
      className="rounded-lg border border-border/70 bg-muted/20 p-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} aria-hidden />
          </span>
          <h2
            id="signup-location-access-title"
            className="font-heading text-base font-medium"
          >
            Location access
          </h2>
          <Badge variant="outline">Optional</Badge>
        </div>

        <p className="text-sm/6 text-muted-foreground">
          Let Ceird find traffic-aware nearby jobs and sites when you use Near
          me. Current coordinates are requested fresh from this device for each
          route request and are not stored in this preference.
        </p>

        <Field orientation="horizontal">
          <Checkbox
            id={SIGNUP_LOCATION_ACCESS_ID}
            checked={enabled}
            onCheckedChange={(checked) => onEnabledChange(checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor={SIGNUP_LOCATION_ACCESS_ID}>
              Ask this device for location when I use Near me
            </FieldLabel>
            <FieldDescription>
              You can skip this now and change it later in Settings.
            </FieldDescription>
          </FieldContent>
        </Field>
      </div>
    </section>
  );
}
