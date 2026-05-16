"use client";
import { SquareArrowDiagonal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  buildGoogleMapsUrl,
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "#/features/sites/site-location";
import type { SiteLocationLike } from "#/features/sites/site-location";
import { SiteLocationMapPreview } from "#/features/sites/site-location-map-preview";

import { DetailSection } from "./jobs-detail-section";

interface JobsDetailLocationProps {
  readonly site?: SiteLocationLike;
}

export function JobsDetailLocation({ site }: JobsDetailLocationProps) {
  if (!site) {
    return (
      <DetailSection title="Site">
        <Empty className="min-h-0 items-start border-0 bg-transparent p-0 text-left">
          <EmptyHeader className="items-start text-left">
            <EmptyTitle className="text-base">No site attached yet.</EmptyTitle>
            <EmptyDescription>
              The job can still move, but it will not show up on the map until a
              site is added.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </DetailSection>
    );
  }

  const addressLines = buildSiteAddressLines(site);
  const googleMapsUrl = buildGoogleMapsUrl(site);
  const hasCoordinates = hasSiteCoordinates(site);

  return (
    <DetailSection title="Site">
      <div className="grid items-stretch gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,1.05fr)]">
        <div className="flex min-h-44 min-w-0 flex-col">
          <div className="space-y-2">
            <p className="font-medium">{site.name ?? "Mapped site"}</p>
            {addressLines.length > 0 ? (
              <div className="space-y-1.5">
                {addressLines.map((line) => (
                  <p
                    key={line}
                    className="text-sm leading-6 text-muted-foreground"
                  >
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No address saved yet.
              </p>
            )}
          </div>

          {googleMapsUrl ? (
            <div className="mt-auto pt-4">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                View on map
                <HugeiconsIcon
                  icon={SquareArrowDiagonal01Icon}
                  strokeWidth={2}
                  data-icon="inline-end"
                />
              </a>
            </div>
          ) : null}
        </div>

        {hasCoordinates ? (
          <SiteLocationMapPreview site={site} variant="embedded" />
        ) : (
          <div className="flex min-h-44 rounded-md border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
            Map preview needs site coordinates.
          </div>
        )}
      </div>

      {site.accessNotes ? (
        <div className="mt-4 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Access notes
          </p>
          <p className="mt-1 text-sm leading-6 whitespace-pre-wrap">
            {site.accessNotes}
          </p>
        </div>
      ) : null}
    </DetailSection>
  );
}
