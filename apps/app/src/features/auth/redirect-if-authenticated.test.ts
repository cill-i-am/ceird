import { isRedirect } from "@tanstack/react-router";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { redirectIfAuthenticated } from "./redirect-if-authenticated";

const { mockedGetSession } = vi.hoisted(() => ({
  mockedGetSession: vi.fn<
    () => Promise<{
      data: {
        session: {
          id: string;
        };
      } | null;
      error: null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
  } as unknown as typeof AuthClient,
}));

describe("auth route redirect guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws a redirect to / when a session exists", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
      },
      error: null,
    });

    const result = redirectIfAuthenticated();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("resolves without throwing when no session exists", async () => {
    mockedGetSession.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
  }, 1000);
});
