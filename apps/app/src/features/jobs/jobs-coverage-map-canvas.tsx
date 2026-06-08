"use client";
import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Map,
  MapControls,
  MapFitBounds,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MarkerPopup,
} from "#/components/ui/map";
import {
  buildGoogleMapsUrl,
  buildSiteAddressLines,
  DEFAULT_SITE_MAP_CENTER,
  DEFAULT_SITE_MAP_ZOOM,
} from "#/features/sites/site-location";
import { openWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";

import type { MappedSiteGroup } from "./jobs-coverage-map";
import { markerToneClassName, STATUS_LABELS } from "./jobs-coverage-map";

export function JobsCoverageMapCanvas({
  groups,
}: {
  readonly groups: readonly MappedSiteGroup[];
}) {
  const mapCoordinates = React.useMemo(
    () =>
      groups.map(
        (group) => [group.site.longitude, group.site.latitude] as const
      ),
    [groups]
  );

  return (
    <div className="h-full min-h-[520px]">
      <Map
        center={[DEFAULT_SITE_MAP_CENTER[0], DEFAULT_SITE_MAP_CENTER[1]]}
        zoom={DEFAULT_SITE_MAP_ZOOM}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
      >
        <MapFitBounds
          coordinates={mapCoordinates}
          duration={600}
          maxZoom={12}
          padding={72}
          singleZoom={11}
        />
        <MapControls
          position="bottom-right"
          controls={["zoom", "fullscreen"]}
        />
        {groups.map((group) => {
          const googleMapsUrl = buildGoogleMapsUrl(group.site);

          return (
            <MapMarker
              key={group.site.id}
              latitude={group.site.latitude}
              longitude={group.site.longitude}
            >
              <MarkerContent
                interactive
                ariaLabel={`Open jobs at ${group.site.name ?? "Mapped site"}`}
              >
                <div className={markerToneClassName(group.tone)}>
                  {group.jobs.length}
                </div>
                <MarkerLabel visibility="hover">
                  {group.site.name ?? "Mapped site"}
                </MarkerLabel>
              </MarkerContent>
              <MarkerPopup
                closeButton
                className="max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto overscroll-contain"
                offset={24}
              >
                <div className="flex w-72 flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {group.site.name ?? "Mapped site"}
                      </p>
                      <Badge variant="secondary">
                        {group.jobs.length} job
                        {group.jobs.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    {buildSiteAddressLines(group.site).map((line) => (
                      <p
                        key={line}
                        className="text-sm leading-6 text-muted-foreground"
                      >
                        {line}
                      </p>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {group.statuses.map((status) => (
                      <Badge key={status.status} variant="outline">
                        {status.count} {STATUS_LABELS[status.status]}
                      </Badge>
                    ))}
                  </div>

                  <ul className="flex flex-col gap-2">
                    {group.jobs.slice(0, 3).map((job) => (
                      <li
                        key={job.id}
                        className="rounded-lg border bg-muted/20 p-3"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                job.status === "blocked"
                                  ? "outline"
                                  : "secondary"
                              }
                            >
                              {STATUS_LABELS[job.status]}
                            </Badge>
                            <Badge
                              variant={
                                job.priority === "none"
                                  ? "outline"
                                  : "secondary"
                              }
                            >
                              {job.priority === "none"
                                ? "No priority"
                                : job.priority}
                            </Badge>
                          </div>
                          <Link
                            to="/jobs"
                            search={(current) =>
                              openWorkspaceSheetSearch(current, {
                                jobId: job.id,
                                kind: "job.detail",
                              })
                            }
                            className="leading-6 font-medium hover:underline"
                          >
                            {job.title}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {group.jobs.length > 3 ? (
                    <p className="text-sm text-muted-foreground">
                      +{group.jobs.length - 3} more job
                      {group.jobs.length - 3 === 1 ? "" : "s"} at this site.
                    </p>
                  ) : null}

                  {googleMapsUrl ? (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                    >
                      <HugeiconsIcon
                        icon={MapsLocation01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
              </MarkerPopup>
            </MapMarker>
          );
        })}
      </Map>
    </div>
  );
}
