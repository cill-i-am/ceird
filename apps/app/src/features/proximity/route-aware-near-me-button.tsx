"use client";
import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "#/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";

const routeAwareUnavailableCopy =
  "Drive-time sorting needs the route-aware proximity endpoint. Straight-line distance is intentionally not used.";

export function RouteAwareNearMeButton({
  target,
}: {
  readonly target: "jobs" | "sites";
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
        <Button
          aria-label={`Find ${target} near me`}
          className="bg-background"
          disabled
          size="sm"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon
            icon={Location01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Near me
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty" side="bottom">
        {routeAwareUnavailableCopy}
      </TooltipContent>
    </Tooltip>
  );
}
