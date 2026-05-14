import {
  createOrganizationSlugFromName,
  decodeCreateOrganizationNameInput,
  decodeCreateOrganizationInput,
  decodeOrganizationRole,
  decodeUpdateOrganizationInput,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
  ORGANIZATION_SLUG_PATTERN,
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

describe("organization slug generation", () => {
  it("generates lowercase durable slugs from organization names", () => {
    expect(createOrganizationSlugFromName("  Acme Field Ops  ")).toBe(
      "acme-field-ops"
    );
    expect(createOrganizationSlugFromName("O'Connor & Sons")).toBe(
      "oconnor-sons"
    );
  }, 1000);

  it("falls back when a name has no slug-safe characters", () => {
    expect(createOrganizationSlugFromName("!!")).toBe("team");
  }, 1000);

  it("keeps truncated slugs inside the slug pattern", () => {
    const slug = createOrganizationSlugFromName(`${"a".repeat(63)} & Beta`);

    expect(slug).toBe("a".repeat(63));
    expect(slug).toMatch(ORGANIZATION_SLUG_PATTERN);
  }, 1000);
});

describe("createOrganizationNameInputSchema", () => {
  it("trims a valid organization name", () => {
    expect(
      decodeCreateOrganizationNameInput({
        name: "  Acme Field Ops  ",
      })
    ).toStrictEqual({
      name: "Acme Field Ops",
    });
  }, 1000);

  it("rejects client-supplied organization slugs", () => {
    expect(() =>
      decodeCreateOrganizationNameInput({
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      })
    ).toThrow(/is unexpected/);
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

describe("organization role boundary", () => {
  it("decodes external as an organization role", () => {
    expect(decodeOrganizationRole("external")).toBe("external");
  }, 1000);

  it("classifies internal and external organization roles", () => {
    expect(
      (["owner", "admin", "member", "external"] as const).map((role) =>
        isInternalOrganizationRole(role)
      )
    ).toStrictEqual([true, true, true, false]);
    expect(
      (["owner", "admin", "member", "external"] as const).map((role) =>
        isExternalOrganizationRole(role)
      )
    ).toStrictEqual([false, false, false, true]);
  }, 1000);
});
