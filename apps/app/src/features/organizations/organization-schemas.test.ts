import {
  decodeCreateOrganizationNameInput,
  organizationOnboardingSchema,
} from "./organization-schemas";

describe("organization onboarding schema", () => {
  it("accepts a valid organization name", () => {
    expect(
      decodeCreateOrganizationNameInput({
        name: "Acme Field Ops",
      })
    ).toStrictEqual({
      name: "Acme Field Ops",
    });
    expect(organizationOnboardingSchema).toBeDefined();
  }, 1000);

  it("trims the organization name before returning it", () => {
    expect(
      decodeCreateOrganizationNameInput({
        name: "  Acme Field Ops  ",
      })
    ).toStrictEqual({
      name: "Acme Field Ops",
    });
  }, 1000);

  it("rejects slugs because onboarding does not accept client slugs", () => {
    expect(() =>
      decodeCreateOrganizationNameInput({
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      })
    ).toThrow(/is unexpected/);
  }, 1000);
});
