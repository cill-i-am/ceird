import {
  mapOrganizationInvitationPayload,
  mapOrganizationInvitationRow,
  mapOrganizationMemberRow,
} from "./organization-members.js";

describe("organization member identity mapping", () => {
  it("maps joined member rows into a safe member DTO", () => {
    expect(
      mapOrganizationMemberRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "owner@example.com",
        id: "mem_owner",
        name: "Owner Example",
        organization_id: "org_123",
        role: "owner",
        user_id: "user_owner",
      })
    ).toStrictEqual({
      createdAt: "2026-04-01T09:30:00.000Z",
      email: "owner@example.com",
      id: "mem_owner",
      name: "Owner Example",
      organizationId: "org_123",
      role: "owner",
      userId: "user_owner",
    });
  });

  it("rejects member rows outside the Ceird identity contract", () => {
    expect(() =>
      mapOrganizationMemberRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "owner@example.com",
        id: "mem_owner",
        name: "Owner Example",
        organization_id: "org_123",
        role: "billing-manager",
        user_id: "user_owner",
      })
    ).toThrow(/Expected/);
  });

  it("maps Better Auth invitation rows into a safe invitation DTO", () => {
    expect(
      mapOrganizationInvitationRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "pending@example.com",
        expires_at: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        organization_id: "org_123",
        role: "member",
        status: "pending",
      })
    ).toStrictEqual({
      createdAt: "2026-04-01T09:30:00.000Z",
      email: "pending@example.com",
      expiresAt: "2026-04-12T09:30:00.000Z",
      id: "inv_123",
      organizationId: "org_123",
      role: "member",
      status: "pending",
    });
  });

  it("maps Better Auth invitation mutation payloads into a safe invitation DTO", () => {
    expect(
      mapOrganizationInvitationPayload({
        createdAt: "2026-04-01T09:30:00.000Z",
        email: "pending@example.com",
        expiresAt: "2026-04-12T09:30:00.000Z",
        id: "inv_123",
        inviterId: "user_owner",
        organizationId: "org_123",
        role: "member",
        status: "pending",
        teamId: null,
      })
    ).toStrictEqual({
      createdAt: "2026-04-01T09:30:00.000Z",
      email: "pending@example.com",
      expiresAt: "2026-04-12T09:30:00.000Z",
      id: "inv_123",
      organizationId: "org_123",
      role: "member",
      status: "pending",
    });
  });

  it("rejects Better Auth invitation mutation payloads with unknown fields", () => {
    expect(() =>
      mapOrganizationInvitationPayload({
        createdAt: "2026-04-01T09:30:00.000Z",
        email: "pending@example.com",
        expiresAt: "2026-04-12T09:30:00.000Z",
        id: "inv_123",
        inviterId: "user_owner",
        organizationId: "org_123",
        role: "member",
        status: "pending",
        teamId: null,
        unmodeledBetterAuthField: true,
      })
    ).toThrow(/Unexpected key/);
  });

  it("rejects invitation rows with unsupported statuses", () => {
    expect(() =>
      mapOrganizationInvitationRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "pending@example.com",
        expires_at: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        organization_id: "org_123",
        role: "member",
        status: "expired",
      })
    ).toThrow(/Expected/);
  });

  it("rejects owner invitation rows outside the Ceird invitation contract", () => {
    expect(() =>
      mapOrganizationInvitationRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "owner@example.com",
        expires_at: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        organization_id: "org_123",
        role: "owner",
        status: "pending",
      })
    ).toThrow(/Expected/);
  });
});
