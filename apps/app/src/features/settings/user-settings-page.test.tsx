import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";
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
      changeEmail: mockedChangeEmail,
      changePassword: mockedChangePassword,
      updateUser: mockedUpdateUser,
    } as unknown as typeof AuthClient,
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
        callbackURL: "http://localhost:3000/settings?emailChange=verified",
      });
    });
    await expect(
      screen.findByText("Check the new email address to confirm this change.")
    ).resolves.toHaveAttribute("role", "status");
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

    render(<UserSettingsPage user={user} />);

    await interaction.click(
      screen.getByRole("button", { name: "Save profile" })
    );

    await expect(
      screen.findByText("Name could not be updated")
    ).resolves.toBeInTheDocument();
  }, 10_000);
});
