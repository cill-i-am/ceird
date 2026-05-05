"use client";
import { Location01Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
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

import { JobsDetailLocationMapPreview } from "./jobs-detail-location-map-preview";

interface JobsDetailLocationProps {
  readonly site?: SiteLocationLike;
}

export function JobsDetailLocation({ site }: JobsDetailLocationProps) {
  if (!site) {
    return (
      <DetailLocationSection>
        <Empty className="min-h-0 items-start border-0 bg-transparent p-0 text-left">
          <EmptyHeader className="items-start text-left">
            <EmptyTitle className="text-base">No site attached yet.</EmptyTitle>
            <EmptyDescription>
              The job can still move, but it will not show up on the map until a
              site is added.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </DetailLocationSection>
    );
  }

  const addressLines = buildSiteAddressLines(site);
  const googleMapsUrl = buildGoogleMapsUrl(site);
  const hasCoordinates = hasSiteCoordinates(site);

  return (
    <DetailLocationSection>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{site.name ?? "Mapped site"}</p>
            {site.serviceAreaName ? (
              <Badge variant="secondary">{site.serviceAreaName}</Badge>
            ) : null}
          </div>

          {addressLines.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {addressLines.map((line) => (
                <p
                  key={line}
                  className="text-sm leading-6 text-muted-foreground"
                >
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {site.accessNotes ? (
            <div className="flex flex-col gap-1.5 border-l pl-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                Access notes
              </p>
              <p className="text-sm leading-6 whitespace-pre-wrap">
                {site.accessNotes}
              </p>
            </div>
          ) : null}
        </div>

        {googleMapsUrl ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <HugeiconsIcon
              icon={MapsLocation01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Open in Google Maps
          </a>
        ) : null}

        {hasCoordinates ? <JobsDetailLocationMapPreview site={site} /> : null}
      </div>
    </DetailLocationSection>
  );
}

function DetailLocationSection({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <section className="border-b py-5">
      <div className="grid gap-4 md:grid-cols-[9.5rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
            <h3 className="text-sm font-medium text-foreground">Location</h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Give dispatch the site context and the fastest way into navigation.
          </p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
