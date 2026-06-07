import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type * as AuthClientModule from "#/lib/auth-client";

import { UserSettingsPage } from "./user-settings-page";

interface AuthClientError {
  readonly message?: string;
  readonly status?: number;
  readonly statusText?: string;
}
type GetSessionMock = () => Promise<{
  readonly data: { readonly session: { readonly token: string } } | null;
  readonly error: AuthClientError | null;
}>;
type ListSessionsMock = () => Promise<{
  readonly data:
    | readonly {
        readonly activeOrganizationId: string | null;
        readonly createdAt: string;
        readonly expiresAt: string;
        readonly id: string;
        readonly ipAddress: string;
        readonly token: string;
        readonly updatedAt: string;
        readonly userAgent: string;
        readonly userId: string;
      }[]
    | null;
  readonly error: AuthClientError | null;
}>;
type RevokeOtherSessionsMock = () => Promise<{
  readonly data: { readonly status: boolean } | null;
  readonly error: AuthClientError | null;
}>;
type RevokeSessionMock = (input: { readonly token: string }) => Promise<{
  readonly data: { readonly status: boolean } | null;
  readonly error: AuthClientError | null;
}>;
type EnableTwoFactorMock = (input: { readonly password: string }) => Promise<{
  readonly data: {
    readonly backupCodes: readonly string[];
    readonly totpURI: string;
  } | null;
  readonly error: AuthClientError | null;
}>;
type VerifyTotpMock = (input: { readonly code: string }) => Promise<{
  readonly data: { readonly token: string } | null;
  readonly error: AuthClientError | null;
}>;
type GenerateBackupCodesMock = (input: {
  readonly password: string;
}) => Promise<{
  readonly data: {
    readonly backupCodes: readonly string[];
    readonly status: boolean;
  } | null;
  readonly error: AuthClientError | null;
}>;
type DisableTwoFactorMock = (input: { readonly password: string }) => Promise<{
  readonly data: { readonly status: boolean } | null;
  readonly error: AuthClientError | null;
}>;
interface UseBlockerOptionsMock {
  readonly disabled?: boolean;
  readonly enableBeforeUnload?: (() => boolean) | boolean;
  readonly shouldBlockFn: () => boolean;
}

function isActiveBlockerOptions(
  options: unknown
): options is UseBlockerOptionsMock {
  if (typeof options !== "object" || options === null) {
    return false;
  }

  const candidate = options as Partial<UseBlockerOptionsMock>;
  return (
    candidate.disabled === false &&
    typeof candidate.shouldBlockFn === "function"
  );
}

const {
  mockedChangeEmail,
  mockedChangePassword,
  mockedDisableTwoFactor,
  mockedEnableTwoFactor,
  mockedGenerateBackupCodes,
  mockedGetSession,
  mockedListSessions,
  mockedRevokeOtherSessions,
  mockedRevokeSession,
  mockedRouterInvalidate,
  mockedUseBlocker,
  mockedUpdateUser,
  mockedVerifyTotp,
} = vi.hoisted(() => ({
  mockedChangeEmail: vi.fn<
    (input: { newEmail: string; callbackURL: string }) => Promise<{
      data: { ok: true } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedChangePassword: vi.fn<
    (input: {
      currentPassword: string;
      newPassword: string;
      revokeOtherSessions: true;
    }) => Promise<{
      data: { ok: true } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedDisableTwoFactor: vi.fn<DisableTwoFactorMock>(),
  mockedEnableTwoFactor: vi.fn<EnableTwoFactorMock>(),
  mockedGenerateBackupCodes: vi.fn<GenerateBackupCodesMock>(),
  mockedGetSession: vi.fn<GetSessionMock>(),
  mockedListSessions: vi.fn<ListSessionsMock>(),
  mockedRevokeOtherSessions: vi.fn<RevokeOtherSessionsMock>(),
  mockedRevokeSession: vi.fn<RevokeSessionMock>(),
  mockedRouterInvalidate: vi.fn<() => Promise<void>>(),
  mockedUseBlocker: vi.fn<(options: unknown) => void>(),
  mockedUpdateUser: vi.fn<
    (input: { image: string | null; name: string }) => Promise<{
      data: { ok: true } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedVerifyTotp: vi.fn<VerifyTotpMock>(),
}));

vi.mock(import("#/lib/auth-client"), async () => {
  const actual =
    await vi.importActual<typeof AuthClientModule>("#/lib/auth-client");

  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      changeEmail: mockedChangeEmail as typeof actual.authClient.changeEmail,
      changePassword:
        mockedChangePassword as typeof actual.authClient.changePassword,
      getSession:
        mockedGetSession as unknown as typeof actual.authClient.getSession,
      listSessions:
        mockedListSessions as unknown as typeof actual.authClient.listSessions,
      revokeOtherSessions:
        mockedRevokeOtherSessions as unknown as typeof actual.authClient.revokeOtherSessions,
      revokeSession:
        mockedRevokeSession as unknown as typeof actual.authClient.revokeSession,
      twoFactor: {
        ...actual.authClient.twoFactor,
        disable:
          mockedDisableTwoFactor as unknown as typeof actual.authClient.twoFactor.disable,
        enable:
          mockedEnableTwoFactor as unknown as typeof actual.authClient.twoFactor.enable,
        generateBackupCodes:
          mockedGenerateBackupCodes as unknown as typeof actual.authClient.twoFactor.generateBackupCodes,
        verifyTotp:
          mockedVerifyTotp as unknown as typeof actual.authClient.twoFactor.verifyTotp,
      },
      updateUser: mockedUpdateUser as typeof actual.authClient.updateUser,
    } satisfies typeof actual.authClient,
  };
});

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useBlocker: mockedUseBlocker as unknown as typeof actual.useBlocker,
    useRouter: (() => ({
      invalidate: mockedRouterInvalidate,
    })) as typeof actual.useRouter,
  };
});

describe("user settings page", () => {
  const user = {
    email: "person@example.com",
    emailVerified: true,
    image: null,
    name: "Taylor Example",
    twoFactorEnabled: false,
  };

  beforeEach(() => {
    window.history.replaceState({}, "", "http://localhost:3000/settings");
    mockedChangeEmail.mockResolvedValue({
      data: { ok: true },
      error: null,
    });
    mockedChangePassword.mockResolvedValue({
      data: { ok: true },
      error: null,
    });
    mockedDisableTwoFactor.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    mockedEnableTwoFactor.mockResolvedValue({
      data: {
        backupCodes: ["alpha-0001", "bravo-0002", "charlie-0003"],
        totpURI:
          "otpauth://totp/Ceird:taylor@example.com?secret=ABC123&issuer=Ceird",
      },
      error: null,
    });
    mockedGenerateBackupCodes.mockResolvedValue({
      data: {
        backupCodes: ["delta-0004", "echo-0005", "foxtrot-0006"],
        status: true,
      },
      error: null,
    });
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          token: "token_current",
        },
      },
      error: null,
    });
    mockedListSessions.mockResolvedValue({
      data: [
        {
          activeOrganizationId: null,
          createdAt: "2026-06-01T10:00:00.000Z",
          expiresAt: "2026-07-01T10:00:00.000Z",
          id: "session_current",
          ipAddress: "203.0.113.10",
          token: "token_current",
          updatedAt: "2026-06-07T08:30:00.000Z",
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
          userId: "user_123",
        },
      ],
      error: null,
    });
    mockedRevokeOtherSessions.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    mockedRevokeSession.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    mockedRouterInvalidate.mockResolvedValue();
    mockedUpdateUser.mockResolvedValue({
      data: { ok: true },
      error: null,
    });
    mockedVerifyTotp.mockResolvedValue({
      data: { token: "two-factor-session-token" },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function selectTab(
    name: "Email" | "Password" | "Profile" | "Security"
  ) {
    await userEvent.click(screen.getByRole("tab", { name }));
  }

  it("frames account settings with direct form tabs", async () => {
    render(<UserSettingsPage user={user} />);

    expect(
      screen.getByRole("heading", { name: "Account settings" })
    ).toBeVisible();
    expect(screen.queryByText("ACCOUNT")).not.toBeInTheDocument();
    expect(screen.queryByText("SETTINGS")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Keep your sign-in details and account identity current for invites, recovery, and team updates."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Keep identity, sign-in email, and password details ready for invitations, recovery, and team activity."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /account status/i })
    ).not.toBeInTheDocument();
    const sectionTabs = screen.getByRole("tablist", {
      name: /settings sections/i,
    });

    expect(
      within(sectionTabs).queryByRole("tab", { name: "Overview" })
    ).not.toBeInTheDocument();
    expect(
      within(sectionTabs).getByRole("tab", { name: "Profile" })
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(sectionTabs).getByRole("tab", { name: "Profile" })
    ).toBeVisible();
    expect(
      within(sectionTabs).getByRole("tab", { name: "Security" })
    ).toBeVisible();
    expect(
      within(sectionTabs).getByRole("tab", { name: "Email" })
    ).toBeVisible();
    expect(
      within(sectionTabs).getByRole("tab", { name: "Password" })
    ).toBeVisible();
    expect(
      [...sectionTabs.querySelectorAll('[role="tab"]')].map((tab) =>
        tab.textContent?.trim()
      )
    ).toStrictEqual(["Profile", "Security", "Email", "Password"]);

    await selectTab("Profile");
    expect(screen.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  it("updates the profile and refreshes route data", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Profile");

    const nameInput = screen.getByLabelText("Display name");
    await interaction.clear(nameInput);
    await interaction.type(nameInput, "Taylor Updated");
    await interaction.click(
      screen.getByRole("button", { name: "Save profile" })
    );

    await waitFor(() => {
      expect(mockedUpdateUser).toHaveBeenCalledWith({
        name: "Taylor Updated",
        image: null,
      });
    });
    await expect(
      screen.findByText("Profile updated.")
    ).resolves.toHaveAttribute("role", "status");
    expect(mockedRouterInvalidate).toHaveBeenCalledOnce();
  }, 10_000);

  it("disables unchanged profile saves", async () => {
    render(<UserSettingsPage user={user} />);
    await selectTab("Profile");

    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(mockedUpdateUser).not.toHaveBeenCalled();
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  }, 10_000);

  it("clears stale profile status copy when profile fields change", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Profile");

    const nameInput = screen.getByLabelText("Display name");
    await interaction.clear(nameInput);
    await interaction.type(nameInput, "Taylor Updated");
    await interaction.click(
      screen.getByRole("button", { name: "Save profile" })
    );

    await expect(
      screen.findByText("Profile updated.")
    ).resolves.toHaveAttribute("role", "status");

    await interaction.type(screen.getByLabelText("Avatar image URL"), "x");

    expect(screen.queryByText("Profile updated.")).not.toBeInTheDocument();
  }, 10_000);

  it("starts a verified email change with the settings callback URL", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Email");

    await interaction.type(
      screen.getByLabelText("New email"),
      "new@example.com"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Send verification email" })
    );

    await waitFor(() => {
      expect(mockedChangeEmail).toHaveBeenCalledWith({
        newEmail: "new@example.com",
        callbackURL: "http://localhost:3000/settings?emailChange=complete",
      });
    });
    await expect(
      screen.findByText("Check the new email address to confirm this change.")
    ).resolves.toHaveAttribute("role", "status");
  }, 10_000);

  it("shows a neutral completion message after an email verification callback", () => {
    render(<UserSettingsPage user={user} emailChangeStatus="complete" />);

    expect(
      screen.getByText(
        "Email verification completed. Your current sign-in email is shown below."
      )
    ).toHaveAttribute("role", "status");
  }, 10_000);

  it("shows a failure message after an invalid email verification callback", () => {
    render(<UserSettingsPage user={user} emailChangeStatus="failed" />);

    expect(
      screen.getByText(
        "That email verification link is invalid or expired. Request a new email change to try again."
      )
    ).toHaveAttribute("role", "alert");
  }, 10_000);

  it("syncs the email callback message when route search changes", () => {
    const { rerender } = render(
      <UserSettingsPage user={user} emailChangeStatus="complete" />
    );

    expect(
      screen.getByText(
        "Email verification completed. Your current sign-in email is shown below."
      )
    ).toBeInTheDocument();

    rerender(<UserSettingsPage user={user} />);

    expect(
      screen.queryByText(
        "Email verification completed. Your current sign-in email is shown below."
      )
    ).not.toBeInTheDocument();
  }, 10_000);

  it("keeps the email callback failure ahead of success copy", () => {
    render(<UserSettingsPage user={user} emailChangeStatus="failed" />);

    expect(
      screen.queryByText(
        "Email verification completed. Your current sign-in email is shown below."
      )
    ).not.toBeInTheDocument();
  }, 10_000);

  it("rejects same-email changes before calling Better Auth", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Email");

    await interaction.type(
      screen.getByLabelText("New email"),
      "PERSON@example.com"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Send verification email" })
    );

    await expect(
      screen.findByText("Use a different email address.")
    ).resolves.toBeInTheDocument();
    expect(mockedChangeEmail).not.toHaveBeenCalled();
  }, 10_000);

  it("changes the password and revokes other sessions", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Password");

    await interaction.type(
      screen.getByLabelText("Current password"),
      "old-password"
    );
    await interaction.type(
      screen.getByLabelText("New password"),
      "new-password"
    );
    await interaction.type(
      screen.getByLabelText("Confirm new password"),
      "new-password"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Update password" })
    );

    await waitFor(() => {
      expect(mockedChangePassword).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password",
        revokeOtherSessions: true,
      });
    });
    await expect(
      screen.findByText("Password updated.")
    ).resolves.toHaveAttribute("role", "status");
  }, 10_000);

  it("submits only the focused settings form with the submit hotkey", async () => {
    const interaction = userEvent.setup();

    render(
      <HotkeysProvider>
        <UserSettingsPage user={user} />
      </HotkeysProvider>
    );

    await selectTab("Profile");
    await interaction.clear(screen.getByLabelText("Display name"));
    await interaction.type(
      screen.getByLabelText("Display name"),
      "Taylor Hotkey"
    );
    await selectTab("Email");
    await interaction.type(
      screen.getByLabelText("New email"),
      "hotkey@example.com"
    );
    await interaction.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedChangeEmail).toHaveBeenCalledWith({
        newEmail: "hotkey@example.com",
        callbackURL: "http://localhost:3000/settings?emailChange=complete",
      });
    });
    expect(mockedUpdateUser).not.toHaveBeenCalled();
    expect(mockedChangePassword).not.toHaveBeenCalled();

    await selectTab("Profile");
    await interaction.click(screen.getByLabelText("Display name"));
    await interaction.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedUpdateUser).toHaveBeenCalledWith({
        name: "Taylor Hotkey",
        image: null,
      });
    });
    expect(mockedChangePassword).not.toHaveBeenCalled();

    await selectTab("Password");
    await interaction.type(
      screen.getByLabelText("Current password"),
      "old-password"
    );
    await interaction.type(
      screen.getByLabelText("New password"),
      "new-password"
    );
    await interaction.type(
      screen.getByLabelText("Confirm new password"),
      "new-password"
    );
    await interaction.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedChangePassword).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password",
        revokeOtherSessions: true,
      });
    });
  }, 10_000);

  it("submits the focused two-factor setup form with the settings hotkey", async () => {
    const interaction = userEvent.setup();

    render(
      <HotkeysProvider>
        <UserSettingsPage user={user} />
      </HotkeysProvider>
    );

    await selectTab("Security");
    await interaction.type(
      screen.getByLabelText("Current password for 2FA setup"),
      "current-password"
    );
    await interaction.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedEnableTwoFactor).toHaveBeenCalledWith({
        password: "current-password",
      });
    });

    await interaction.type(
      screen.getByLabelText("Authenticator code"),
      "123456"
    );
    await interaction.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedVerifyTotp).toHaveBeenCalledWith({ code: "123456" });
    });
  }, 10_000);

  it("rejects unchanged password submissions before calling Better Auth", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Password");

    await interaction.type(
      screen.getByLabelText("Current password"),
      "same-password"
    );
    await interaction.type(
      screen.getByLabelText("New password"),
      "same-password"
    );
    await interaction.type(
      screen.getByLabelText("Confirm new password"),
      "same-password"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Update password" })
    );

    await expect(
      screen.findByText(
        "Use a new password that is different from your current password"
      )
    ).resolves.toBeInTheDocument();
    expect(mockedChangePassword).not.toHaveBeenCalled();
  }, 10_000);

  it("shows a helpful failure message when a settings save fails", async () => {
    const interaction = userEvent.setup();
    mockedUpdateUser.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Name could not be updated",
        status: 400,
        statusText: "Bad Request",
      },
    });

    render(<UserSettingsPage user={{ ...user, name: "Original Name" }} />);
    await selectTab("Profile");

    const nameInput = screen.getByLabelText("Display name");
    await interaction.clear(nameInput);
    await interaction.type(nameInput, "Updated Name");

    await interaction.click(
      screen.getByRole("button", { name: "Save profile" })
    );

    await expect(
      screen.findByText("We couldn't update your profile. Please try again.")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows action-specific email change failure copy", async () => {
    const interaction = userEvent.setup();
    mockedChangeEmail.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Backend email detail",
        status: 400,
        statusText: "Bad Request",
      },
    });

    render(<UserSettingsPage user={user} />);
    await selectTab("Email");

    await interaction.type(
      screen.getByLabelText("New email"),
      "new@example.com"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Send verification email" })
    );

    await expect(
      screen.findByText("We couldn't send that email change. Please try again.")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows shared rate-limit copy for password failures", async () => {
    const interaction = userEvent.setup();
    mockedChangePassword.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Too many requests",
        status: 429,
        statusText: "Too Many Requests",
      },
    });

    render(<UserSettingsPage user={user} />);
    await selectTab("Password");

    await interaction.type(
      screen.getByLabelText("Current password"),
      "old-password"
    );
    await interaction.type(
      screen.getByLabelText("New password"),
      "new-password"
    );
    await interaction.type(
      screen.getByLabelText("Confirm new password"),
      "new-password"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Update password" })
    );

    await expect(
      screen.findByText("Too many attempts. Please wait and try again.")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("blocks two-factor setup until the account email is verified", async () => {
    render(
      <UserSettingsPage
        user={{ ...user, emailVerified: false }}
        currentOrganizationRole="owner"
      />
    );
    await selectTab("Security");

    expect(
      screen.getByRole("heading", { name: "Two-factor authentication" })
    ).toBeVisible();
    expect(
      screen.getByText("Verify your email before setting up 2FA.")
    ).toBeVisible();
    expect(
      screen.getByText(
        "We use your verified email for account recovery and security notices."
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Set up 2FA" })
    ).not.toBeInTheDocument();
    expect(mockedEnableTwoFactor).not.toHaveBeenCalled();
  }, 10_000);

  it("keeps two-factor management available for enrolled unverified accounts", async () => {
    render(
      <UserSettingsPage
        user={{ ...user, emailVerified: false, twoFactorEnabled: true }}
      />
    );
    await selectTab("Security");

    expect(
      screen.queryByText("Verify your email before setting up 2FA.")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate backup codes" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Disable 2FA" })).toBeVisible();
  }, 10_000);

  it("enables two-factor authentication and requires backup-code acknowledgement", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} currentOrganizationRole="owner" />);
    await selectTab("Security");

    expect(
      screen.getByText(
        "Owners and admins should protect this account with 2FA before inviting teammates or changing workspace access."
      )
    ).toBeVisible();

    await interaction.type(
      screen.getByLabelText("Current password for 2FA setup"),
      "current-password"
    );
    await interaction.click(screen.getByRole("button", { name: "Set up 2FA" }));

    await waitFor(() => {
      expect(mockedEnableTwoFactor).toHaveBeenCalledWith({
        password: "current-password",
      });
    });
    expect(
      screen.getByRole("img", { name: "Authenticator app QR code" })
    ).toBeVisible();
    expect(screen.getByText(/otpauth:\/\/totp\/Ceird/)).toBeVisible();
    expect(screen.getByLabelText("Authenticator code")).toHaveAttribute(
      "autocomplete",
      "one-time-code"
    );

    await interaction.type(
      screen.getByLabelText("Authenticator code"),
      "123456"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Verify code" })
    );

    await waitFor(() => {
      expect(mockedVerifyTotp).toHaveBeenCalledWith({ code: "123456" });
    });
    await waitFor(() => {
      expect(mockedRouterInvalidate).toHaveBeenCalledOnce();
    });
    expect(mockedVerifyTotp).not.toHaveBeenCalledWith(
      expect.objectContaining({ trustDevice: expect.any(Boolean) })
    );
    await expect(
      screen.findByText(
        "Save these backup codes now. Each code works once, and they are the only self-service recovery path if you lose your authenticator."
      )
    ).resolves.toBeVisible();
    expect(screen.getByText("alpha-0001")).toBeVisible();

    const finishButton = screen.getByRole("button", {
      name: "I saved these backup codes",
    });
    expect(finishButton).toBeDisabled();

    await interaction.click(
      screen.getByRole("checkbox", { name: "I saved my backup codes" })
    );
    expect(finishButton).toBeEnabled();
    await interaction.click(finishButton);

    await expect(screen.findByText("2FA is enabled.")).resolves.toHaveAttribute(
      "role",
      "status"
    );
  }, 10_000);

  it("keeps backup codes visible while switching settings tabs before acknowledgement", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Security");

    await interaction.type(
      screen.getByLabelText("Current password for 2FA setup"),
      "current-password"
    );
    await interaction.click(screen.getByRole("button", { name: "Set up 2FA" }));
    await interaction.type(
      await screen.findByLabelText("Authenticator code"),
      "123456"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Verify code" })
    );

    await expect(screen.findByText("alpha-0001")).resolves.toBeVisible();
    await selectTab("Profile");
    await selectTab("Security");

    expect(screen.getByText("alpha-0001")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "I saved these backup codes" })
    ).toBeDisabled();
  }, 10_000);

  it("warns before route navigation while backup codes are unacknowledged", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);
    await selectTab("Security");

    await interaction.type(
      screen.getByLabelText("Current password for 2FA setup"),
      "current-password"
    );
    await interaction.click(screen.getByRole("button", { name: "Set up 2FA" }));
    await interaction.type(
      await screen.findByLabelText("Authenticator code"),
      "123456"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Verify code" })
    );

    await expect(screen.findByText("alpha-0001")).resolves.toBeVisible();
    const blockerOptions = mockedUseBlocker.mock.calls
      .map(([options]) => options)
      .find(isActiveBlockerOptions);

    expect(blockerOptions).toBeDefined();
    expect(
      typeof blockerOptions?.enableBeforeUnload === "function"
        ? blockerOptions.enableBeforeUnload()
        : blockerOptions?.enableBeforeUnload
    ).toBeTruthy();

    const confirmSpy = vi.spyOn(window, "confirm");
    try {
      confirmSpy.mockReturnValueOnce(false);
      expect(blockerOptions?.shouldBlockFn()).toBeTruthy();
      confirmSpy.mockReturnValueOnce(true);
      expect(blockerOptions?.shouldBlockFn()).toBeFalsy();
    } finally {
      confirmSpy.mockRestore();
    }
  }, 10_000);

  it("ignores duplicate authenticator verification while the first request is pending", async () => {
    const interaction = userEvent.setup();
    const pendingVerification =
      Promise.withResolvers<Awaited<ReturnType<VerifyTotpMock>>>();
    mockedVerifyTotp.mockReturnValueOnce(pendingVerification.promise);

    render(<UserSettingsPage user={user} />);
    await selectTab("Security");

    await interaction.type(
      screen.getByLabelText("Current password for 2FA setup"),
      "current-password"
    );
    await interaction.click(screen.getByRole("button", { name: "Set up 2FA" }));
    await interaction.type(
      await screen.findByLabelText("Authenticator code"),
      "123456"
    );

    const verifyForm = screen
      .getByLabelText("Authenticator code")
      .closest("form");
    expect(verifyForm).not.toBeNull();

    fireEvent.submit(verifyForm as HTMLFormElement);
    fireEvent.submit(verifyForm as HTMLFormElement);

    expect(mockedVerifyTotp).toHaveBeenCalledOnce();

    pendingVerification.resolve({
      data: { token: "two-factor-session-token" },
      error: null,
    });
    await expect(screen.findByText("alpha-0001")).resolves.toBeVisible();
  }, 10_000);

  it("regenerates backup codes only after password confirmation", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={{ ...user, twoFactorEnabled: true }} />);
    await selectTab("Security");

    await interaction.click(
      screen.getByRole("button", { name: "Regenerate backup codes" })
    );
    expect(
      screen.getByText("Previous backup codes will stop working immediately.")
    ).toBeVisible();
    await interaction.type(
      screen.getByLabelText("Current password for backup code regeneration"),
      "current-password"
    );
    await interaction.click(
      screen.getByRole("button", { name: "Regenerate codes" })
    );

    await waitFor(() => {
      expect(mockedGenerateBackupCodes).toHaveBeenCalledWith({
        password: "current-password",
      });
    });
    await expect(screen.findByText("delta-0004")).resolves.toBeVisible();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    await interaction.click(
      screen.getByRole("checkbox", { name: "I saved my backup codes" })
    );
    await interaction.click(screen.getByRole("button", { name: "Done" }));

    await expect(screen.findByText("2FA is enabled.")).resolves.toBeVisible();
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  }, 10_000);

  it("disables two-factor authentication after explicit password confirmation", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={{ ...user, twoFactorEnabled: true }} />);
    await selectTab("Security");

    await interaction.click(
      screen.getByRole("button", { name: "Disable 2FA" })
    );
    expect(
      screen.getByText("Future sign-ins will only require your password.")
    ).toBeVisible();
    await interaction.type(
      screen.getByLabelText("Current password to disable 2FA"),
      "current-password"
    );
    await interaction.click(
      screen.getByRole("checkbox", {
        name: "I understand future sign-ins will only require my password",
      })
    );
    await interaction.click(
      screen.getByRole("button", { name: "Disable 2FA" })
    );

    await waitFor(() => {
      expect(mockedDisableTwoFactor).toHaveBeenCalledWith({
        password: "current-password",
      });
    });
    await expect(
      screen.findByText("2FA is disabled.")
    ).resolves.toHaveAttribute("role", "status");
    await waitFor(() => {
      expect(mockedRouterInvalidate).toHaveBeenCalledOnce();
    });
  }, 10_000);
});
