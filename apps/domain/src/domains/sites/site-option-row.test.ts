import { describe, expect, it } from "@effect/vitest";

import { mapSiteOptionRow } from "./site-option-row.js";

describe("site option rows", () => {
  it("maps active job summaries onto site options", () => {
    const site = mapSiteOptionRow(buildSiteOptionRow(), [], {
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
    });

    expect(site).toMatchObject({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
    });
  });

  it("omits active job summaries when they were not loaded", () => {
    const site = mapSiteOptionRow(buildSiteOptionRow());

    expect(site).not.toHaveProperty("activeJobCount");
    expect(site).not.toHaveProperty("highestActiveJobPriority");
  });

  it("keeps loaded zero-job summaries explicit", () => {
    const site = mapSiteOptionRow(buildSiteOptionRow(), [], {
      activeJobCount: 0,
    });

    expect(site).toMatchObject({ activeJobCount: 0 });
    expect(site).not.toHaveProperty("highestActiveJobPriority");
  });
});

function buildSiteOptionRow(): Parameters<typeof mapSiteOptionRow>[0] {
  return {
    access_notes: null,
    address_components: null,
    address_line_1: "1 Main Street",
    address_line_2: null,
    country: null,
    county: null,
    display_location: "1 Main Street, Limerick",
    eircode: null,
    formatted_address: null,
    google_place_id: "ChIJmainstreet",
    id: "11111111-1111-4111-8111-111111111111",
    latitude: 52.6638,
    location_provider: "google_places",
    location_resolved_at: new Date("2026-06-09T06:00:00.000Z"),
    location_status: "google_resolved",
    longitude: -8.6267,
    name: "Main Street Houses",
    raw_location_input: null,
    town: "Limerick",
    updated_at: new Date("2026-06-09T07:00:00.000Z"),
  };
}
