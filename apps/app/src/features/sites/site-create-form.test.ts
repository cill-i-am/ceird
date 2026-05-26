import { describe, expect, it } from "@effect/vitest";

import {
  buildCreateSiteInputFromDraft,
  defaultSiteCreateDraft,
  validateSiteCreateDraft,
} from "./site-create-form";

describe("site create form helpers", () => {
  it("omits blank Eircode values for non-Irish sites", () => {
    expect(
      buildCreateSiteInputFromDraft({
        ...defaultSiteCreateDraft,
        addressLine1: "  10 Downing Street  ",
        country: "GB",
        county: "  Greater London  ",
        eircode: "   ",
        name: "  London Depot  ",
      })
    ).toStrictEqual({
      addressLine1: "10 Downing Street",
      country: "GB",
      county: "Greater London",
      name: "London Depot",
    });
  });

  it("keeps Eircode required only for Irish sites", () => {
    expect(
      validateSiteCreateDraft({
        ...defaultSiteCreateDraft,
        addressLine1: "10 Downing Street",
        country: "GB",
        county: "Greater London",
        name: "London Depot",
      }).eircode
    ).toBeUndefined();

    expect(
      validateSiteCreateDraft({
        ...defaultSiteCreateDraft,
        addressLine1: "1 Custom House Quay",
        country: "IE",
        county: "Dublin",
        name: "Docklands Campus",
      }).eircode
    ).toBe("Add Eircode.");
  });
});
