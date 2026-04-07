import {
  decodeCreateOrganizationInput,
  organizationOnboardingSchema,
} from "./organization-schemas";

describe("organization onboarding schema", () => {
  it("accepts a valid organization name and slug", () => {
    expect(
      decodeCreateOrganizationInput({
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      })
    ).toStrictEqual({
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });
    expect(organizationOnboardingSchema).toBeDefined();
  }, 1000);

  it("trims the organization name and slug before returning them", () => {
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

  it("rejects slugs with uppercase letters or spaces", () => {
    expect(() =>
      decodeCreateOrganizationInput({
        name: "Acme Field Ops",
        slug: "Acme Field Ops",
      })
    ).toThrow(/Expected/);
  }, 1000);
});
