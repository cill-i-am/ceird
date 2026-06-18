import {
  makeOrganizationAuthRequestHeaders,
  mapOrganizationInvitationPayload,
  mapOrganizationInvitationRow,
  mapOrganizationMemberRow,
} from "./organization-members.js";

describe("organization member identity mapping", () => {
  it("scrubs body transport headers from synthetic Better Auth requests", () => {
    const headers = makeOrganizationAuthRequestHeaders({
      accept: "text/html",
      "accept-encoding": "gzip, br",
      "cdn-loop": "cloudflare",
      "cf-connecting-ip": "203.0.113.10",
      "cf-ipcountry": "US",
      "cf-ray": "ray-value",
      connection: "keep-alive",
      "content-encoding": "gzip",
      "content-length": "17",
      "content-md5": "f1b2d2f924e986ac86fdf7b36c94bcdf32beec15",
      "content-type": "text/plain",
      cookie: "better-auth.session_token=session-value",
      host: "api.pr-248.ceird.app",
      origin: "https://app.pr-248.ceird.app",
      "transfer-encoding": "chunked",
      "x-forwarded-for": "198.51.100.20",
      "x-forwarded-host": "api.pr-248.ceird.app",
      "x-request-id": "request-id",
    });

    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("accept-encoding")).toBeNull();
    expect(headers.get("cdn-loop")).toBeNull();
    expect(headers.get("cf-connecting-ip")).toBeNull();
    expect(headers.get("cf-ipcountry")).toBeNull();
    expect(headers.get("cf-ray")).toBeNull();
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("content-encoding")).toBeNull();
    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("content-md5")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("cookie")).toBe(
      "better-auth.session_token=session-value"
    );
    expect(headers.get("host")).toBeNull();
    expect(headers.get("origin")).toBe("https://app.pr-248.ceird.app");
    expect(headers.get("transfer-encoding")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBe("198.51.100.20");
    expect(headers.get("x-forwarded-host")).toBe("api.pr-248.ceird.app");
    expect(headers.get("x-request-id")).toBe("request-id");
  });

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
        createdAt: new Date("2026-04-01T09:30:00.000Z"),
        email: "pending@example.com",
        expiresAt: new Date("2026-04-12T09:30:00.000Z"),
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
