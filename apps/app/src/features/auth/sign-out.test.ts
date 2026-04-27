import type { authClient as AuthClient } from "#/lib/auth-client";

import { signOut } from "./sign-out";

const { mockedResolveAuthBaseURL, mockedSignOut } = vi.hoisted(() => ({
  mockedResolveAuthBaseURL: vi.fn<() => string | undefined>(),
  mockedSignOut: vi.fn<() => Promise<{ success: boolean }>>(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    signOut: mockedSignOut,
  } as unknown as typeof AuthClient,
  resolveAuthBaseURL: mockedResolveAuthBaseURL,
}));

describe("sign out", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the Better Auth client and returns its result", async () => {
    const result = { success: true };
    mockedSignOut.mockResolvedValue(result);

    await expect(signOut()).resolves.toBe(result);
    expect(mockedSignOut).toHaveBeenCalledOnce();
  }, 1000);
});
