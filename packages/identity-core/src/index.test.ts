import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";

import {
  appendOrganizationSlugSuffix,
  createOrganizationSlugFromName,
  decodeCreateOrganizationNameInput,
  decodeCreateOrganizationInput,
  decodeInvitableOrganizationRole,
  decodeInvitationId,
  decodeProductMemberActorSummaryElectricRow,
  decodeOrganizationSummary,
  decodeOrganizationSecurityActivityListResponse,
  decodeOptionalOrganizationSecurityActivityTargetSearch,
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
  decodeAcceptedOrganizationId,
  decodeCancelOrganizationInvitationInput,
  decodeConnectedAppGrantListResponse,
  decodeDisconnectConnectedAppGrantInput,
  decodeInviteOrganizationMemberInput,
  decodeNativeAuthClientSessionResult,
  InviteOrganizationMemberResponseSchema,
  CancelOrganizationInvitationResponseSchema,
  decodeOrganizationInvitation,
  decodeOrganizationInvitationDetails,
  decodeOrganizationInvitationListResponse,
  decodeOrganizationMember,
  decodeOrganizationMemberListQuery,
  decodeOrganizationMemberId,
  decodeOrganizationMemberListResponse,
  decodeOrganizationMemberRoleResponse,
  decodePublicInvitationPreview,
  decodeRemoveOrganizationMemberInput,
  decodeUpdateOrganizationMemberRoleInput,
  IdentityApi,
  ORGANIZATION_INVITATION_STATUSES,
  OrganizationIdentityRateLimitError,
  OrganizationIdentityRejectedError,
  OrganizationInvitationNotFoundError,
  OrganizationMemberNotFoundError,
  ProductMemberActorSummaryElectricRowSchema,
  ProductMemberActorSummarySchema,
  ProductActorSchema,
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

describe("product-safe actor projection", () => {
  const decodeActor = Schema.decodeUnknownSync(ProductActorSchema);
  const decodeMemberActorSummary = Schema.decodeUnknownSync(
    ProductMemberActorSummarySchema
  );
  const decodeMemberActorSummaryElectricRow = Schema.decodeUnknownSync(
    ProductMemberActorSummaryElectricRowSchema
  );

  it("decodes member, agent, and system display actors without auth fields", () => {
    expect(
      decodeActor({
        displayDetail: "Team member",
        displayName: "Ciara",
        id: "77777777-7777-4777-8777-777777777777",
        kind: "member",
      })
    ).toStrictEqual({
      displayDetail: "Team member",
      displayName: "Ciara",
      id: "77777777-7777-4777-8777-777777777777",
      kind: "member",
    });

    expect(
      decodeActor({
        displayName: "Ceird Agent",
        id: "88888888-8888-4888-8888-888888888888",
        kind: "agent",
        route: {
          href: "/agent/threads/99999999-9999-4999-8999-999999999999",
          label: "Open thread",
        },
      })
    ).toMatchObject({ displayName: "Ceird Agent", kind: "agent" });

    expect(
      decodeActor({
        displayName: "Ceird",
        id: "99999999-9999-4999-8999-999999999999",
        kind: "system",
      })
    ).toMatchObject({ displayName: "Ceird", kind: "system" });
  });

  it("rejects Better Auth fields at the actor DTO boundary", () => {
    expect(() =>
      decodeActor({
        displayName: "Ciara",
        email: "ciara@example.com",
        id: "77777777-7777-4777-8777-777777777777",
        kind: "member",
        sessionId: "session_123",
        userId: "user_123",
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("decodes product member actor summaries with branded identity fields", () => {
    expect(
      decodeMemberActorSummary({
        displayDetail: "Team member",
        displayName: "Ciara",
        id: "77777777-7777-4777-8777-777777777777",
        kind: "member",
        organizationId: "org_123",
        route: {
          href: "/members/user_123",
          label: "Ciara",
        },
        userId: "user_123",
      })
    ).toStrictEqual({
      displayDetail: "Team member",
      displayName: "Ciara",
      id: "77777777-7777-4777-8777-777777777777",
      kind: "member",
      organizationId: "org_123",
      route: {
        href: "/members/user_123",
        label: "Ciara",
      },
      userId: "user_123",
    });
  });

  it("rejects partial product member actor summaries", () => {
    expect(() =>
      decodeMemberActorSummary({
        displayName: "Ciara",
        id: "77777777-7777-4777-8777-777777777777",
        kind: "member",
        userId: "user_123",
      })
    ).toThrow(/organizationId/);
  });

  it("decodes product member actor summary Electric rows to product rows", () => {
    expect(
      decodeProductMemberActorSummaryElectricRow({
        actorId: "77777777-7777-4777-8777-777777777777",
        createdAt: "2026-06-17 08:58:07.194174+00",
        displayDetail: "Team member",
        displayName: "Ciara",
        organizationId: "org_123",
        routeHref: "/members/user_123",
        routeLabel: "Ciara",
        updatedAt: "2026-06-17 08:58:07.194174+00",
        userId: "user_123",
      })
    ).toStrictEqual({
      displayDetail: "Team member",
      displayName: "Ciara",
      id: "77777777-7777-4777-8777-777777777777",
      kind: "member",
      organizationId: "org_123",
      route: {
        href: "/members/user_123",
        label: "Ciara",
      },
      userId: "user_123",
    });
  });

  it("decodes full product member actor summary Electric rows with DB-owned timestamps", () => {
    expect(
      decodeProductMemberActorSummaryElectricRow({
        actorId: "77777777-7777-4777-8777-777777777777",
        createdAt: "2026-06-17 08:58:07.194174+00",
        displayDetail: "Team member",
        displayName: "Ciara",
        organizationId: "org_123",
        routeHref: "/members/user_123",
        routeLabel: "Ciara",
        updatedAt: "2026-06-17 08:58:07.194174+00",
        userId: "user_123",
      })
    ).toStrictEqual({
      displayDetail: "Team member",
      displayName: "Ciara",
      id: "77777777-7777-4777-8777-777777777777",
      kind: "member",
      organizationId: "org_123",
      route: {
        href: "/members/user_123",
        label: "Ciara",
      },
      userId: "user_123",
    });
  });

  it("rejects invalid product member actor summary Electric rows", () => {
    expect(() =>
      decodeMemberActorSummaryElectricRow({
        createdAt: "2026-06-17 08:58:07.194174+00",
        updatedAt: "2026-06-17 08:58:07.194174+00",
      })
    ).toThrow(/actorId/);

    expect(() =>
      decodeMemberActorSummaryElectricRow({
        actorId: "77777777-7777-4777-8777-777777777777",
        createdAt: "2026-06-17 08:58:07.194174+00",
        displayName: "Ciara",
        email: "ciara@example.com",
        organizationId: "org_123",
        updatedAt: "2026-06-17 08:58:07.194174+00",
        userId: "user_123",
      })
    ).toThrow(/[Uu]nexpected/);

    expect(() =>
      decodeMemberActorSummaryElectricRow({
        actorId: "77777777-7777-4777-8777-777777777777",
        createdAt: "2026-06-17 08:58:07.194174+00",
        displayName: "Ciara",
        organizationId: "org_123",
        routeHref: "/members/user_123",
        updatedAt: "2026-06-17 08:58:07.194174+00",
        userId: "user_123",
      })
    ).toThrow(/route/);
  });
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
  it("brands user, session, invitation, and organization member ids", () => {
    expect(decodeUserId("user_123")).toBe("user_123");
    expect(decodeSessionId("session_123")).toBe("session_123");
    expect(decodeInvitationId("invitation_123")).toBe("invitation_123");
    expect(decodeOrganizationMemberId("member_123")).toBe("member_123");
  }, 1000);

  it("rejects empty identity ids", () => {
    expect(() => decodeUserId("")).toThrow(/Expected/);
    expect(() => decodeSessionId("")).toThrow(/Expected/);
    expect(() => decodeInvitationId("")).toThrow(/Expected/);
    expect(() => decodeOrganizationMemberId("")).toThrow(/Expected/);
  }, 1000);
});

describe("organization member identity boundary", () => {
  const member = {
    createdAt: "2026-04-01T09:30:00.000Z",
    email: "owner@example.com",
    id: "mem_owner",
    name: "Owner Example",
    organizationId: "org_123",
    role: "owner",
    userId: "user_owner",
  };
  const invitation = {
    createdAt: "2026-04-01T09:30:00.000Z",
    email: "pending@example.com",
    expiresAt: "2026-04-12T09:30:00.000Z",
    id: "inv_123",
    organizationId: "org_123",
    role: "member",
    status: "pending",
  };

  it("tracks Better Auth's invitation status lifecycle as a finite contract", () => {
    expect(ORGANIZATION_INVITATION_STATUSES).toStrictEqual([
      "pending",
      "accepted",
      "canceled",
      "rejected",
    ]);

    for (const status of ORGANIZATION_INVITATION_STATUSES) {
      expect(
        decodeOrganizationInvitation({ ...invitation, status }).status
      ).toBe(status);
    }

    expect(() =>
      decodeOrganizationInvitation({
        ...invitation,
        status: "expired",
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("decodes member and invitation DTOs without Better Auth payload fields", () => {
    expect(decodeOrganizationMember(member)).toStrictEqual(member);
    expect(decodeOrganizationInvitation(invitation)).toStrictEqual(invitation);
    expect(
      decodeOrganizationMemberListResponse({
        members: [member],
        total: 1,
      })
    ).toStrictEqual({
      members: [member],
      total: 1,
    });
    expect(
      decodeOrganizationInvitationListResponse({
        invitations: [invitation],
      })
    ).toStrictEqual({
      invitations: [invitation],
    });

    expect(() =>
      decodeOrganizationMember({
        ...member,
        user: {
          email: "owner@example.com",
          id: "user_owner",
          image: null,
          name: "Owner Example",
        },
      })
    ).toThrow(/[Uu]nexpected/);
    expect(() =>
      decodeOrganizationInvitation({
        ...invitation,
        inviter: { id: "user_owner" },
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("narrows invitation endpoint responses to their promised lifecycle statuses", () => {
    const decodeInviteResponse = Schema.decodeUnknownSync(
      InviteOrganizationMemberResponseSchema
    );
    const decodeCancelResponse = Schema.decodeUnknownSync(
      CancelOrganizationInvitationResponseSchema
    );

    expect(
      decodeInviteResponse({
        invitation,
      }).invitation.status
    ).toBe("pending");
    expect(
      decodeCancelResponse({
        invitation: {
          ...invitation,
          status: "canceled",
        },
      }).invitation.status
    ).toBe("canceled");

    expect(() =>
      decodeOrganizationInvitationListResponse({
        invitations: [{ ...invitation, status: "accepted" }],
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodeInviteResponse({
        invitation: {
          ...invitation,
          status: "canceled",
        },
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodeCancelResponse({
        invitation,
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("uses context-rich organization member and invitation identity errors", () => {
    const invitationError = new OrganizationInvitationNotFoundError({
      invitationId: decodeInvitationId("inv_123"),
      message: "Organization invitation was not found",
    });
    const memberError = new OrganizationMemberNotFoundError({
      memberId: decodeOrganizationMemberId("mem_member"),
      message: "Organization member was not found",
    });
    const rateLimitError = new OrganizationIdentityRateLimitError({
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many organization invitations.",
      operation: "inviteOrganizationMember",
      statusText: "Too Many Requests",
    });
    const rejectedError = new OrganizationIdentityRejectedError({
      code: "BAD_REQUEST",
      message: "Organization member update was rejected.",
      operation: "updateOrganizationMemberRole",
      status: 400,
      statusText: "Bad Request",
    });

    expect(invitationError._tag).toBe(
      "@ceird/identity-core/OrganizationInvitationNotFoundError"
    );
    expect(invitationError.invitationId).toBe("inv_123");
    expect(memberError._tag).toBe(
      "@ceird/identity-core/OrganizationMemberNotFoundError"
    );
    expect(memberError.memberId).toBe("mem_member");
    expect(rateLimitError._tag).toBe(
      "@ceird/identity-core/OrganizationIdentityRateLimitError"
    );
    expect(
      OpenApi.fromApi(IdentityApi).paths["/organization/invitations"]?.post
        ?.responses["429"]
    ).toBeDefined();
    expect(rejectedError.operation).toBe("updateOrganizationMemberRole");
  }, 1000);

  it("projects native signed-in invitation details into the Ceird DTO", () => {
    const nativeInvitationDetails = {
      createdAt: new Date("2026-04-01T09:30:00.000Z"),
      email: "pending@example.com",
      expiresAt: new Date("2026-04-12T09:30:00.000Z"),
      id: "inv_123",
      inviterEmail: "owner@example.com",
      inviterId: "user_owner",
      organizationId: "org_123",
      organizationName: "Acme Field Ops",
      organizationSlug: "acme-field-ops",
      role: "member",
      status: "pending",
    };

    expect(
      decodeOrganizationInvitationDetails(nativeInvitationDetails)
    ).toStrictEqual({
      email: "pending@example.com",
      id: "inv_123",
      inviterEmail: "owner@example.com",
      organizationName: "Acme Field Ops",
      role: "member",
    });
    expect(
      decodeOrganizationInvitationDetails({
        ...nativeInvitationDetails,
        expiresAt: "2026-04-12T09:30:00.000Z",
        teamId: null,
      })
    ).toStrictEqual({
      email: "pending@example.com",
      id: "inv_123",
      inviterEmail: "owner@example.com",
      organizationName: "Acme Field Ops",
      role: "member",
    });
    expect(() =>
      decodeOrganizationInvitationDetails({
        ...nativeInvitationDetails,
        createdAt: new Date("invalid"),
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodeOrganizationInvitationDetails({
        ...nativeInvitationDetails,
        unmodeledBetterAuthField: "raw",
      })
    ).toThrow(/[Uu]nexpected/);
    expect(() =>
      decodeOrganizationInvitationDetails({
        ...nativeInvitationDetails,
        email: "not-an-email",
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodeOrganizationInvitationDetails({
        ...nativeInvitationDetails,
        role: "owner",
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("strictly decodes public invitation previews", () => {
    expect(
      decodePublicInvitationPreview({
        email: "m***@e***.com",
        organizationName: "Acme Field Ops",
        role: "member",
      })
    ).toStrictEqual({
      email: "m***@e***.com",
      organizationName: "Acme Field Ops",
      role: "member",
    });
    expect(() =>
      decodePublicInvitationPreview({
        email: "not-an-email",
        organizationName: "Acme Field Ops",
        role: "member",
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodePublicInvitationPreview({
        email: "m***@e***.com",
        organizationName: "A",
        role: "member",
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodePublicInvitationPreview({
        email: "m***@e***.com",
        organizationName: "Acme Field Ops",
        role: "member",
        rawBetterAuthField: "raw",
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("decodes native accepted invitation payloads before using the organization id", () => {
    const payload = {
      invitation: {
        createdAt: new Date("2026-04-01T09:30:00.000Z"),
        email: "member@example.com",
        expiresAt: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        inviterId: "user_owner",
        organizationId: "org_123",
        role: "member",
        status: "accepted",
        teamId: null,
      },
      member: {
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
        id: "member_123",
        organizationId: "org_123",
        role: "member",
        userId: "user_member",
      },
    };

    expect(decodeAcceptedOrganizationId(payload)).toBe("org_123");
    expect(
      decodeAcceptedOrganizationId({
        ...payload,
        invitation: {
          ...payload.invitation,
          createdAt: "2026-04-01T09:30:00.000Z",
          expiresAt: "2026-04-12T09:30:00.000Z",
        },
        member: {
          ...payload.member,
          createdAt: "2026-04-01T10:00:00.000Z",
        },
      })
    ).toBe("org_123");
    expect(() =>
      decodeAcceptedOrganizationId({
        ...payload,
        member: {
          ...payload.member,
          organizationId: undefined,
        },
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodeAcceptedOrganizationId({
        ...payload,
        rawBetterAuthField: "raw",
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("decodes native auth client session results", () => {
    const session = {
      session: {
        activeOrganizationId: null,
        createdAt: new Date("2026-04-01T09:00:00.000Z"),
        expiresAt: new Date("2026-05-01T09:00:00.000Z"),
        id: "session_123",
        ipAddress: null,
        updatedAt: new Date("2026-04-01T09:00:00.000Z"),
        userAgent: null,
        userId: "user_member",
      },
      user: {
        createdAt: new Date("2026-04-01T08:00:00.000Z"),
        email: "member@example.com",
        emailVerified: true,
        id: "user_member",
        image: null,
        name: "Member Example",
        twoFactorEnabled: false,
        updatedAt: new Date("2026-04-01T08:00:00.000Z"),
      },
    };

    expect(
      decodeNativeAuthClientSessionResult({
        data: session,
        error: null,
      }).data?.user.email
    ).toBe("member@example.com");
    expect(
      decodeNativeAuthClientSessionResult({
        data: null,
        error: null,
      })
    ).toStrictEqual({ data: null, error: null });
    expect(() =>
      decodeNativeAuthClientSessionResult({
        data: {
          ...session,
          rawBetterAuthField: "raw",
        },
        error: null,
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("strictly decodes organization member role responses", () => {
    expect(
      decodeOrganizationMemberRoleResponse({ role: "admin" })
    ).toStrictEqual({
      role: "admin",
    });
    expect(() =>
      decodeOrganizationMemberRoleResponse({
        role: "admin",
        rawBetterAuthField: "raw",
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);

  it("rejects invalid organization member and invitation emails", () => {
    expect(() =>
      decodeOrganizationMember({ ...member, email: "not-an-email" })
    ).toThrow(/Expected/);
    expect(() =>
      decodeOrganizationInvitation({ ...invitation, email: "not-an-email" })
    ).toThrow(/Expected/);
    expect(() =>
      decodeInviteOrganizationMemberInput({
        email: "not-an-email",
        role: "member",
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("rejects owner invitations at the shared role contract", () => {
    expect(decodeInvitableOrganizationRole("admin")).toBe("admin");
    expect(() => decodeInvitableOrganizationRole("owner")).toThrow(/Expected/);
    expect(() =>
      decodeInviteOrganizationMemberInput({
        email: "owner@example.com",
        role: "owner",
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodeOrganizationInvitation({
        ...invitation,
        role: "owner",
      })
    ).toThrow(/Expected/);
    expect(() =>
      decodePublicInvitationPreview({
        email: "o***@e***.com",
        organizationName: "Acme Field Ops",
        role: "owner",
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("decodes organization member list query defaults at the schema boundary", () => {
    expect(decodeOrganizationMemberListQuery({})).toStrictEqual({
      limit: 100,
      offset: 0,
    });
    expect(
      decodeOrganizationMemberListQuery({ limit: "25", offset: "50" })
    ).toStrictEqual({
      limit: 25,
      offset: 50,
    });
  }, 1000);

  it("decodes organization member mutation inputs", () => {
    expect(
      decodeInviteOrganizationMemberInput({
        email: " member@example.com ",
        role: "external",
      })
    ).toStrictEqual({
      email: "member@example.com",
      role: "external",
    });
    expect(
      decodeInviteOrganizationMemberInput({
        email: "member@example.com",
        resend: true,
        role: "admin",
      })
    ).toStrictEqual({
      email: "member@example.com",
      resend: true,
      role: "admin",
    });
    expect(
      decodeCancelOrganizationInvitationInput({ invitationId: "inv_123" })
    ).toStrictEqual({ invitationId: "inv_123" });
    expect(
      decodeUpdateOrganizationMemberRoleInput({
        memberId: "mem_member",
        role: "admin",
      })
    ).toStrictEqual({ memberId: "mem_member", role: "admin" });
    expect(
      decodeRemoveOrganizationMemberInput({ memberId: "mem_member" })
    ).toStrictEqual({ memberId: "mem_member" });
    expect(() =>
      decodeInviteOrganizationMemberInput({
        email: "member@example.com",
        organizationId: "org_123",
        role: "member",
      })
    ).toThrow(/[Uu]nexpected/);
  }, 1000);
});

describe("organization security activity boundary", () => {
  it("decodes optional target search through the shared schema", () => {
    expect(
      decodeOptionalOrganizationSecurityActivityTargetSearch(" Taylor ")
    ).toBe("Taylor");
    expect(
      decodeOptionalOrganizationSecurityActivityTargetSearch("   ")
    ).toBeUndefined();
    expect(
      decodeOptionalOrganizationSecurityActivityTargetSearch(42)
    ).toBeUndefined();
  }, 1000);

  it("rejects malformed organization security activity date filters", () => {
    expect(
      Schema.decodeUnknownSync(OrganizationSecurityActivityQuerySchema)({
        fromDate: "2026-06-12",
        toDate: "2026-06-13",
      })
    ).toStrictEqual({
      fromDate: "2026-06-12",
      limit: 50,
      toDate: "2026-06-13",
    });
    expect(
      Schema.decodeUnknownSync(OrganizationSecurityActivityQuerySchema)({})
    ).toStrictEqual({
      limit: 50,
    });
    expect(
      Schema.decodeUnknownSync(OrganizationSecurityActivityQuerySchema)({
        limit: 25,
      })
    ).toStrictEqual({
      limit: 25,
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
