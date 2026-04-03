import { signOutAndNavigate } from "./nav-user";

interface SignOutResult {
  data: {
    success: boolean;
  } | null;
  error: {
    message: string;
    status: number;
    statusText: string;
  } | null;
}

const { mockedNavigate, mockedSignOut } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(options: { to: string }) => Promise<void>>(),
  mockedSignOut: vi.fn<() => Promise<SignOutResult>>(),
}));

vi.mock(import("#/features/auth/sign-out"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    signOut: mockedSignOut as unknown as typeof actual.signOut,
  };
});

describe("nav user sign out", () => {
  beforeEach(() => {
    mockedNavigate.mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not redirect when sign out returns an error payload", async () => {
    mockedSignOut.mockResolvedValue({
      data: null,
      error: {
        message: "Session already ended",
        status: 401,
        statusText: "Unauthorized",
      },
    });

    await expect(signOutAndNavigate(mockedNavigate)).resolves.toMatchObject({
      error: {
        message: "Session already ended",
      },
    });
    expect(mockedNavigate).not.toHaveBeenCalled();
  }, 1000);

  it("redirects to login when sign out succeeds", async () => {
    mockedSignOut.mockResolvedValue({
      data: {
        success: true,
      },
      error: null,
    });

    await expect(signOutAndNavigate(mockedNavigate)).resolves.toMatchObject({
      data: {
        success: true,
      },
      error: null,
    });
    expect(mockedNavigate).toHaveBeenCalledExactlyOnceWith({
      to: "/login",
    });
  }, 1000);
});
