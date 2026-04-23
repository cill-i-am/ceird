"use client";

import { Location01Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";

import { JobsDetailLocationMapPreview } from "./jobs-detail-location-map-preview";
import {
  buildGoogleMapsUrl,
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "./jobs-location";
import type { SiteLocationLike } from "./jobs-location";

interface JobsDetailLocationProps {
  readonly site?: SiteLocationLike;
}

export function JobsDetailLocation({ site }: JobsDetailLocationProps) {
  if (!site) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
            <CardTitle>Location</CardTitle>
          </div>
          <CardDescription>
            Give dispatch the site context and the fastest way into navigation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="min-h-[180px] bg-muted/20">
            <EmptyHeader>
              <EmptyTitle>No site attached yet.</EmptyTitle>
              <EmptyDescription>
                The job can still move, but it will not show up on the map until
                a site is added.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const addressLines = buildSiteAddressLines(site);
  const googleMapsUrl = buildGoogleMapsUrl(site);
  const hasCoordinates = hasSiteCoordinates(site);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
          <CardTitle>Location</CardTitle>
        </div>
        <CardDescription>
          Give dispatch the site context and the fastest way into navigation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-3xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{site.name ?? "Pinned site"}</p>
            {site.regionName ? (
              <Badge variant="secondary">{site.regionName}</Badge>
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
            <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed bg-background/80 p-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
      </CardContent>
    </Card>
  );
}
