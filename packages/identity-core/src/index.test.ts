import {
  appendOrganizationSlugSuffix,
  createOrganizationSlugFromName,
  decodeCreateOrganizationNameInput,
  decodeCreateOrganizationInput,
  decodeInvitationId,
  decodeOrganizationSummary,
  decodeOrganizationRole,
  decodeSessionId,
  decodeUpdateOrganizationInput,
  decodeUserId,
  ORGANIZATION_SLUG_MAX_LENGTH,
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

  it("keeps truncated slugs short enough for tenant stage host labels", () => {
    const slug = createOrganizationSlugFromName(`${"a".repeat(63)} & Beta`);

    expect(slug).toBe("a".repeat(40));
    expect(slug).toMatch(ORGANIZATION_SLUG_PATTERN);
  }, 1000);

  it("rejects organization slugs longer than the tenant-safe maximum", () => {
    expect(() =>
      decodeCreateOrganizationInput({
        name: "Acme Field Ops",
        slug: "a".repeat(41),
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("appends retry suffixes without exceeding the tenant-safe maximum", () => {
    const slug = appendOrganizationSlugSuffix("a".repeat(40), "retry123");

    expect(slug).toBe(`${"a".repeat(31)}-retry123`);
    expect(slug).toHaveLength(ORGANIZATION_SLUG_MAX_LENGTH);
    expect(slug).toMatch(ORGANIZATION_SLUG_PATTERN);
  }, 1000);

  it("trims trailing hyphens before appending retry suffixes", () => {
    const slug = appendOrganizationSlugSuffix(
      `${"a".repeat(31)}-${"b".repeat(8)}`,
      "retry123"
    );

    expect(slug).toBe(`${"a".repeat(31)}-retry123`);
    expect(slug).toMatch(ORGANIZATION_SLUG_PATTERN);
  }, 1000);
});

describe("organization summary boundary", () => {
  it("rejects summaries with slugs outside the organization slug contract", () => {
    expect(() =>
      decodeOrganizationSummary({
        id: "org_123",
        name: "Acme Field Ops",
        slug: "a".repeat(41),
      })
    ).toThrow(/Expected/);
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
    ).toThrow(/[Uu]nexpected/);
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
    ).toThrow(/[Uu]nexpected/);
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

describe("identity id boundaries", () => {
  it("brands user, session, and invitation ids", () => {
    expect(decodeUserId("user_123")).toBe("user_123");
    expect(decodeSessionId("session_123")).toBe("session_123");
    expect(decodeInvitationId("invitation_123")).toBe("invitation_123");
  }, 1000);

  it("rejects empty identity ids", () => {
    expect(() => decodeUserId("")).toThrow(/Expected/);
    expect(() => decodeSessionId("")).toThrow(/Expected/);
    expect(() => decodeInvitationId("")).toThrow(/Expected/);
  }, 1000);
});
