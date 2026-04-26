import {
  decodeCreateOrganizationInput,
  decodeUpdateOrganizationInput,
} from "./index.js";

describe("createOrganizationInputSchema", () => {
  it("trims valid organization inputs", () => {
    expect(
      decodeCreateOrganizationInput({
        name: "  Acme Field Ops  ",
        slug: "  acme-field-ops  ",
      })
    ).toStrictEqual({
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });
  }, 1000);

  it("rejects invalid organization slugs", () => {
    expect(() =>
      decodeCreateOrganizationInput({
        name: "Acme Field Ops",
        slug: "Acme Field Ops",
      })
    ).toThrow(/Expected/);
  }, 1000);
});

describe("updateOrganizationInputSchema", () => {
  it("trims a valid organization name update", () => {
    expect(
      decodeUpdateOrganizationInput({
        name: "  Northwind Field Ops  ",
      })
    ).toStrictEqual({
      name: "Northwind Field Ops",
    });
  }, 1000);

  it("rejects organization names shorter than the shared minimum", () => {
    expect(() =>
      decodeUpdateOrganizationInput({
        name: " A ",
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("rejects fields outside the organization settings update contract", () => {
    expect(() =>
      decodeUpdateOrganizationInput({
        name: "Northwind Field Ops",
        slug: "northwind-field-ops",
      })
    ).toThrow(/is unexpected/);
  }, 1000);
});
