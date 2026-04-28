import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type * as AuthClientModule from "#/lib/auth-client";

import { UserSettingsPage } from "./user-settings-page";

const {
  mockedChangeEmail,
  mockedChangePassword,
  mockedRouterInvalidate,
  mockedUpdateUser,
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
  mockedRouterInvalidate: vi.fn<() => Promise<void>>(),
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
      updateUser: mockedUpdateUser as typeof actual.authClient.updateUser,
    } satisfies typeof actual.authClient,
  };
});

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
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
    mockedRouterInvalidate.mockResolvedValue();
    mockedUpdateUser.mockResolvedValue({
      data: { ok: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("updates the profile and refreshes route data", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);

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

  it("disables unchanged profile saves", () => {
    render(<UserSettingsPage user={user} />);

    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(mockedUpdateUser).not.toHaveBeenCalled();
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  }, 10_000);

  it("clears stale profile status copy when profile fields change", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);

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

    await interaction.clear(screen.getByLabelText("Display name"));
    await interaction.type(
      screen.getByLabelText("Display name"),
      "Taylor Hotkey"
    );
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

    await interaction.click(screen.getByLabelText("Display name"));
    await interaction.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedUpdateUser).toHaveBeenCalledWith({
        name: "Taylor Hotkey",
        image: null,
      });
    });
    expect(mockedChangePassword).not.toHaveBeenCalled();

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

  it("rejects unchanged password submissions before calling Better Auth", async () => {
    const interaction = userEvent.setup();

    render(<UserSettingsPage user={user} />);

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
});
