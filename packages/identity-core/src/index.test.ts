import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";

import {
  appendOrganizationSlugSuffix,
  createOrganizationSlugFromName,
  decodeCreateOrganizationNameInput,
  decodeCreateOrganizationInput,
  decodeInvitationId,
  decodeOrganizationSummary,
  decodeOrganizationSecurityActivityListResponse,
  decodeOrganizationRole,
  decodeOrganizationSlug,
  decodeSessionId,
  decodeUpdateOrganizationInput,
  decodeUserId,
  decodeUpdateUserPreferencesInput,
  decodeUserPreferences,
  isOrganizationSlug,
  ORGANIZATION_SLUG_MAX_LENGTH,
  RESERVED_ORGANIZATION_SLUGS,
  isReservedOrganizationSlug,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES,
  ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES,
  OrganizationSecurityActivityQuerySchema,
  ORGANIZATION_SLUG_PATTERN,
  UserPreferencesAccessDeniedError,
  UserPreferencesApi,
  UserPreferencesApiGroup,
  UserPreferencesStorageError,
  CONNECTED_APP_SCOPE_GROUP_KEYS,
  ConnectedAppGrantAccessDeniedError,
  ConnectedAppGrantNotFoundError,
  ConnectedAppGrantStorageError,
  decodeConnectedAppGrantListResponse,
  decodeDisconnectConnectedAppGrantInput,
  IdentityApi,
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

  it("rejects slugs reserved for system hosts", () => {
    for (const slug of RESERVED_ORGANIZATION_SLUGS) {
      expect(() =>
        decodeCreateOrganizationInput({
          name: "Reserved Host",
          slug,
        })
      ).toThrow(/reserved/);
    }
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

  it("avoids slugs reserved for system hosts when generating from names", () => {
    for (const slug of RESERVED_ORGANIZATION_SLUGS) {
      expect(createOrganizationSlugFromName(slug.toUpperCase())).toBe(
        `${slug}-org`
      );
      expect(isReservedOrganizationSlug(slug)).toBeTruthy();
    }
  }, 1000);

  it("classifies organization slugs through the shared predicate", () => {
    expect(isOrganizationSlug("acme-field-ops")).toBeTruthy();
    expect(isOrganizationSlug("Acme Field Ops")).toBeFalsy();
    expect(isOrganizationSlug("a")).toBeFalsy();
    expect(isOrganizationSlug("a".repeat(41))).toBeFalsy();

    for (const slug of RESERVED_ORGANIZATION_SLUGS) {
      expect(isOrganizationSlug(slug)).toBeFalsy();
      expect(isOrganizationSlug(`${slug}-org`)).toBeTruthy();
    }
  }, 1000);

  it("decodes organization slugs through the shared boundary helper", () => {
    expect(decodeOrganizationSlug("  acme-field-ops  ")).toBe("acme-field-ops");
    expect(() => decodeOrganizationSlug("app")).toThrow(/reserved/);
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

describe("organization security activity boundary", () => {
  it("rejects malformed organization security activity date filters", () => {
    expect(
      Schema.decodeUnknownSync(OrganizationSecurityActivityQuerySchema)({
        fromDate: "2026-06-12",
        toDate: "2026-06-13",
      })
    ).toStrictEqual({
      fromDate: "2026-06-12",
      toDate: "2026-06-13",
    });
    expect(() =>
      Schema.decodeUnknownSync(OrganizationSecurityActivityQuerySchema)({
        fromDate: "2026-02-30",
      })
    ).toThrow(/ISO-8601 date/);
    expect(() =>
      Schema.decodeUnknownSync(OrganizationSecurityActivityQuerySchema)({
        fromDate: "2026-06-aa",
      })
    ).toThrow(/ISO-8601 date/);
  }, 1000);

  it("decodes safe organization security activity responses", () => {
    expect(
      decodeOrganizationSecurityActivityListResponse({
        items: [
          {
            actor: {
              email: "owner@example.com",
              id: "user_owner",
              name: "Owner User",
            },
            createdAt: "2026-06-07T10:30:00.000Z",
            eventType: "organization_member_role_updated",
            id: "audit_123",
            organizationId: "org_123",
            roleChange: {
              after: "admin",
              before: "member",
            },
            summary: "Changed a member role from Member to Admin.",
            target: {
              label: "Taylor Member",
              type: "member",
              userId: "user_member",
            },
          },
        ],
        nextCursor: "cursor_123",
      })
    ).toStrictEqual({
      items: [
        {
          actor: {
            email: "owner@example.com",
            id: "user_owner",
            name: "Owner User",
          },
          createdAt: "2026-06-07T10:30:00.000Z",
          eventType: "organization_member_role_updated",
          id: "audit_123",
          organizationId: "org_123",
          roleChange: {
            after: "admin",
            before: "member",
          },
          summary: "Changed a member role from Member to Admin.",
          target: {
            label: "Taylor Member",
            type: "member",
            userId: "user_member",
          },
        },
      ],
      nextCursor: "cursor_123",
    });
  }, 1000);

  it("rejects raw provenance fields in organization security activity items", () => {
    expect(() =>
      decodeOrganizationSecurityActivityListResponse({
        items: [
          {
            actor: {
              email: "owner@example.com",
              id: "user_owner",
              name: "Owner User",
            },
            createdAt: "2026-06-07T10:30:00.000Z",
            eventType: "organization_created",
            id: "audit_123",
            organizationId: "org_123",
            sourceIp: "203.0.113.10",
            summary: "Created the organization.",
            target: {
              label: "Acme Field Ops",
              type: "organization",
            },
            userAgent: "Ceird Test Browser",
          },
        ],
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("catalogs the owner/admin-visible event and target type allowlists", () => {
    expect(ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES).toStrictEqual([
      "organization_created",
      "organization_updated",
      "organization_invitation_created",
      "organization_invitation_resent",
      "organization_invitation_canceled",
      "organization_invitation_accepted",
      "organization_member_role_updated",
      "organization_member_removed",
    ]);
    expect(ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES).toStrictEqual([
      "organization",
      "invitation",
      "member",
    ]);
  }, 1000);
});

describe("user preferences boundary", () => {
  it("decodes strict route proximity location preferences", () => {
    expect(
      decodeUserPreferences({
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      })
    ).toStrictEqual({
      routeProximityLocationEnabled: true,
      updatedAt: "2026-06-06T10:00:00.000Z",
    });

    expect(() =>
      decodeUserPreferences({
        currentLatitude: 53.349_805,
        currentLongitude: -6.260_31,
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("decodes strict user preference updates without coordinate fields", () => {
    expect(
      decodeUpdateUserPreferencesInput({
        routeProximityLocationEnabled: false,
      })
    ).toStrictEqual({
      routeProximityLocationEnabled: false,
    });

    expect(() =>
      decodeUpdateUserPreferencesInput({
        routeProximityLocationEnabled: true,
        coordinates: {
          latitude: 53.349_805,
          longitude: -6.260_31,
        },
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("exposes non-coordinate user preferences endpoints", () => {
    const spec = OpenApi.fromApi(UserPreferencesApi);

    expect(UserPreferencesApiGroup.identifier).toBe("userPreferences");
    expect(spec.paths["/user/preferences"]?.get?.operationId).toBe(
      "userPreferences.getUserPreferences"
    );
    expect(spec.paths["/user/preferences"]?.patch?.operationId).toBe(
      "userPreferences.updateUserPreferences"
    );
  }, 1000);

  it("exposes typed user preference errors", () => {
    expect(
      new UserPreferencesAccessDeniedError({
        message: "Authentication is required",
      })._tag
    ).toBe("@ceird/identity-core/UserPreferencesAccessDeniedError");
    expect(
      new UserPreferencesStorageError({
        cause: "database unavailable",
        message: "User preferences storage failed",
      })._tag
    ).toBe("@ceird/identity-core/UserPreferencesStorageError");
  }, 1000);
});

describe("connected app grants boundary", () => {
  it("decodes connected app grants without exposing raw token material", () => {
    expect(
      decodeConnectedAppGrantListResponse({
        grants: [
          {
            activeAccessTokenCount: 1,
            activeRefreshTokenCount: 1,
            clientId: "client_external_mcp",
            clientName: "External MCP",
            clientUri: "https://mcp.example.com",
            context: {
              organizationId: "org_acme",
              organizationName: "Acme Field Ops",
              type: "organization",
            },
            grantId: "consent_123",
            grantedAt: "2026-06-08T10:30:00.000Z",
            latestAccessTokenExpiresAt: "2026-06-08T11:30:00.000Z",
            latestRefreshTokenExpiresAt: "2026-07-08T10:30:00.000Z",
            offlineAccess: true,
            redirectHosts: ["mcp.example.com"],
            scopes: ["openid", "profile", "ceird:read", "offline_access"],
            scopeGroups: [
              {
                key: "identity",
                label: "Identity",
                scopes: ["openid", "profile"],
              },
              {
                key: "read",
                label: "Read",
                scopes: ["ceird:read"],
              },
              {
                key: "offline",
                label: "Offline access",
                scopes: ["offline_access"],
              },
            ],
            updatedAt: "2026-06-08T10:45:00.000Z",
          },
        ],
      })
    ).toStrictEqual({
      grants: [
        expect.objectContaining({
          clientId: "client_external_mcp",
          context: {
            organizationId: "org_acme",
            organizationName: "Acme Field Ops",
            type: "organization",
          },
          grantId: "consent_123",
          offlineAccess: true,
        }),
      ],
    });

    expect(() =>
      decodeConnectedAppGrantListResponse({
        grants: [
          {
            accessToken: "secret",
            activeAccessTokenCount: 1,
            activeRefreshTokenCount: 1,
            clientId: "client_external_mcp",
            context: { type: "account" },
            grantId: "consent_123",
            grantedAt: "2026-06-08T10:30:00.000Z",
            offlineAccess: true,
            redirectHosts: [],
            refreshToken: "secret",
            scopes: ["offline_access"],
            scopeGroups: [],
            updatedAt: "2026-06-08T10:45:00.000Z",
          },
        ],
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("exposes typed connected app endpoints and errors", () => {
    const spec = OpenApi.fromApi(IdentityApi);

    expect(CONNECTED_APP_SCOPE_GROUP_KEYS).toStrictEqual([
      "identity",
      "read",
      "write",
      "admin",
      "offline",
      "other",
    ]);
    expect(spec.paths["/user/connected-apps"]?.get?.operationId).toBe(
      "identity.listConnectedAppGrants"
    );
    expect(
      spec.paths["/user/connected-apps/{grantId}"]?.delete?.operationId
    ).toBe("identity.disconnectConnectedAppGrant");
    expect(
      decodeDisconnectConnectedAppGrantInput({ grantId: "consent_123" })
    ).toStrictEqual({ grantId: "consent_123" });
    expect(
      new ConnectedAppGrantAccessDeniedError({
        message: "Authentication is required",
      })._tag
    ).toBe("@ceird/identity-core/ConnectedAppGrantAccessDeniedError");
    expect(
      new ConnectedAppGrantNotFoundError({
        grantId: decodeDisconnectConnectedAppGrantInput({
          grantId: "consent_123",
        }).grantId,
        message: "Connected app grant was not found",
      })._tag
    ).toBe("@ceird/identity-core/ConnectedAppGrantNotFoundError");
    expect(
      new ConnectedAppGrantStorageError({
        cause: "database unavailable",
        message: "Connected app storage failed",
      })._tag
    ).toBe("@ceird/identity-core/ConnectedAppGrantStorageError");
  }, 1000);
});
