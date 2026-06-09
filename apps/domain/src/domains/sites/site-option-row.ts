import type { Label } from "@ceird/labels-core";
import { SiteOptionSchema } from "@ceird/sites-core";
import type {
  GoogleAddressComponent,
  SiteActiveJobPriority,
  SiteOption,
} from "@ceird/sites-core";
import { Schema } from "effect";

export interface SiteOptionRow {
  readonly access_notes: string | null;
  readonly address_components: readonly GoogleAddressComponent[] | null;
  readonly address_line_1: string | null;
  readonly address_line_2: string | null;
  readonly country: string | null;
  readonly county: string | null;
  readonly display_location: string;
  readonly eircode: string | null;
  readonly formatted_address: string | null;
  readonly google_place_id: string | null;
  readonly id: string;
  readonly latitude: number | null;
  readonly location_provider: string | null;
  readonly location_resolved_at: Date | null;
  readonly location_status: string;
  readonly longitude: number | null;
  readonly name: string;
  readonly raw_location_input: string | null;
  readonly town: string | null;
}

interface SiteOptionActiveJobSummary {
  readonly activeJobCount: number;
  readonly highestActiveJobPriority?: SiteActiveJobPriority;
}

const decodeSiteOption = Schema.decodeUnknownSync(SiteOptionSchema);

export function mapSiteOptionRow(
  row: SiteOptionRow,
  labels: readonly Label[] = [],
  activeJobSummary?: SiteOptionActiveJobSummary
): SiteOption {
  const hasUsableCoordinates =
    isUsableCoordinateStatus(row.location_status) &&
    row.latitude !== null &&
    row.longitude !== null;
  const displayLocation =
    row.display_location ||
    row.formatted_address ||
    row.raw_location_input ||
    "";

  return decodeSiteOption({
    accessNotes: nullableToUndefined(row.access_notes),
    ...(activeJobSummary === undefined
      ? {}
      : {
          activeJobCount: activeJobSummary.activeJobCount,
          ...(activeJobSummary.highestActiveJobPriority === undefined
            ? {}
            : {
                highestActiveJobPriority:
                  activeJobSummary.highestActiveJobPriority,
              }),
        }),
    addressComponents: nullableToUndefined(row.address_components),
    addressLine1: nullableToUndefined(row.address_line_1),
    addressLine2: nullableToUndefined(row.address_line_2),
    country: nullableToUndefined(row.country),
    county: nullableToUndefined(row.county),
    displayLocation,
    eircode: nullableToUndefined(row.eircode),
    formattedAddress: nullableToUndefined(row.formatted_address),
    googlePlaceId: nullableToUndefined(row.google_place_id),
    hasUsableCoordinates,
    id: row.id,
    labels,
    latitude: hasUsableCoordinates
      ? nullableToUndefined(row.latitude)
      : undefined,
    locationProvider: nullableToUndefined(row.location_provider),
    locationResolvedAt:
      row.location_resolved_at === null
        ? undefined
        : row.location_resolved_at.toISOString(),
    locationStatus: row.location_status,
    longitude: hasUsableCoordinates
      ? nullableToUndefined(row.longitude)
      : undefined,
    name: row.name,
    rawLocationInput: nullableToUndefined(row.raw_location_input),
    town: nullableToUndefined(row.town),
  });
}

function isUsableCoordinateStatus(status: string) {
  return (
    status === "google_resolved" ||
    status === "manually_adjusted" ||
    status === "validated"
  );
}

function nullableToUndefined<Value>(value: Value | null): Value | undefined {
  return value === null ? undefined : value;
}
