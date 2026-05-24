import {
  decodeAppAuthContextSnapshot,
  decodeAuthenticatedAppContextSnapshot,
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
      },
      activeOrganizationId: "org_123",
      currentOrganizationRole: "owner",
      organizations: [{ id: "org_123", name: "Acme", slug: "acme" }],
    };

    expect(decodeAuthenticatedAppContextSnapshot(snapshot)).toStrictEqual(
      snapshot
    );
  });

  it("rejects malformed authenticated snapshots", () => {
    expect(() =>
      decodeAuthenticatedAppContextSnapshot({
        session: null,
        activeOrganizationId: null,
      })
    ).toThrow();
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
            token: "session-token",
            activeOrganizationId: "",
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
        },
        activeOrganizationId: "org_123",
      })
    ).toThrow();
  });
});
