import {
  decodeAppAuthContextSnapshot,
  decodeAuthenticatedAppContextSnapshot,
  decodeServerAuthSession,
} from "./app-context-types";

describe("app auth context types", () => {
  it("decodes an unauthenticated app context snapshot", () => {
    expect(
      decodeAppAuthContextSnapshot({
        session: null,
        activeOrganizationId: null,
        currentOrganizationRole: undefined,
        organizations: undefined,
      })
    ).toStrictEqual({
      session: null,
      activeOrganizationId: null,
      currentOrganizationRole: undefined,
      organizations: undefined,
    });
  });

  it("decodes an authenticated app context snapshot", () => {
    const snapshot = {
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-05-31T10:00:00.000Z",
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
          image: null,
          emailVerified: false,
          twoFactorEnabled: false,
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
        },
      },
      activeOrganizationId: "org_123",
      currentOrganizationRole: "owner",
      organizations: [{ id: "org_123", name: "Acme", slug: "acme" }],
    };

    expect(decodeAuthenticatedAppContextSnapshot(snapshot)).toStrictEqual(
      snapshot
    );
  });

  it("validates and strips the Better Auth session token at the app boundary", () => {
    expect(
      decodeServerAuthSession({
        session: {
          id: "session_123",
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-05-31T10:00:00.000Z",
          token: "session-token",
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
          image: null,
          emailVerified: false,
          twoFactorEnabled: true,
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
        },
      })
    ).toMatchObject({
      session: expect.not.objectContaining({ token: expect.any(String) }),
      user: {
        twoFactorEnabled: true,
      },
    });
  });

  it("accepts Better Auth session payloads that omit the session token", () => {
    expect(
      decodeServerAuthSession({
        session: {
          id: "session_123",
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-05-31T10:00:00.000Z",
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
          image: null,
          emailVerified: false,
          twoFactorEnabled: false,
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
        },
      })
    ).toMatchObject({
      session: expect.not.objectContaining({ token: expect.any(String) }),
      user: {
        twoFactorEnabled: false,
      },
    });
  });

  it("strips accidental session tokens from app context snapshots", () => {
    const snapshot = decodeAppAuthContextSnapshot({
      session: {
        session: {
          id: "session_123",
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-05-31T10:00:00.000Z",
          token: "session-token",
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
          image: null,
          emailVerified: false,
          twoFactorEnabled: false,
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
        },
      },
      activeOrganizationId: "org_123",
    });

    expect(snapshot.session?.session).not.toHaveProperty("token");
  });

  it("rejects malformed authenticated snapshots", () => {
    expect(() =>
      decodeAuthenticatedAppContextSnapshot({
        session: null,
        activeOrganizationId: null,
      })
    ).toThrow(/Expected/);
  });

  it("rejects authenticated sessions without explicit 2FA state", () => {
    expect(() =>
      decodeServerAuthSession({
        session: {
          id: "session_123",
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
          userId: "user_123",
          expiresAt: "2026-05-31T10:00:00.000Z",
          token: "session-token",
          activeOrganizationId: "org_123",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
          image: null,
          emailVerified: false,
          createdAt: "2026-05-24T10:00:00.000Z",
          updatedAt: "2026-05-24T10:00:00.000Z",
        },
      })
    ).toThrow(/twoFactorEnabled/);
  });

  it("rejects malformed session active organization ids", () => {
    expect(() =>
      decodeAuthenticatedAppContextSnapshot({
        session: {
          session: {
            id: "session_123",
            createdAt: "2026-05-24T10:00:00.000Z",
            updatedAt: "2026-05-24T10:00:00.000Z",
            userId: "user_123",
            expiresAt: "2026-05-31T10:00:00.000Z",
            activeOrganizationId: "",
          },
          user: {
            id: "user_123",
            name: "Taylor Example",
            email: "taylor@example.com",
            image: null,
            emailVerified: false,
            twoFactorEnabled: false,
            createdAt: "2026-05-24T10:00:00.000Z",
            updatedAt: "2026-05-24T10:00:00.000Z",
          },
        },
        activeOrganizationId: "org_123",
      })
    ).toThrow(/Expected/);
  });
});
