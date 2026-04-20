import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEventHandler, ReactNode } from "react";

import type { NavUserNavigate } from "./nav-user";
import { NavUser } from "./nav-user";

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

declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }
}

const { mockedNavigate, mockedSignOut } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<NavUserNavigate>(),
  mockedSignOut: vi.fn<() => Promise<SignOutResult>>(),
}));

const { mockedHardRedirectToLogin } = vi.hoisted(() => ({
  mockedHardRedirectToLogin: vi.fn<() => boolean>(),
}));

vi.mock(import("#/features/auth/sign-out"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    signOut: mockedSignOut as unknown as typeof actual.signOut,
  };
});

vi.mock(
  import("#/features/auth/hard-redirect-to-login"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      hardRedirectToLogin:
        mockedHardRedirectToLogin as unknown as typeof actual.hardRedirectToLogin,
    };
  }
);

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    SidebarMenu: (({ children }: { children?: ReactNode }) => (
      <div data-testid="sidebar-menu">{children}</div>
    )) as typeof actual.SidebarMenu,
    SidebarMenuButton: (({
      children,
      render: renderSlot,
      ...props
    }: {
      children?: ReactNode;
      render?: ReactNode;
      disabled?: boolean;
      className?: string;
      size?: string;
      onClick?: MouseEventHandler<HTMLButtonElement>;
    }) => (
      <button type="button" data-testid="sidebar-menu-button" {...props}>
        {renderSlot}
        {children}
      </button>
    )) as typeof actual.SidebarMenuButton,
    SidebarMenuItem: (({ children }: { children?: ReactNode }) => (
      <div data-testid="sidebar-menu-item">{children}</div>
    )) as typeof actual.SidebarMenuItem,
    useSidebar: () => ({
      state: "expanded" as const,
      open: true,
      setOpen: () => {},
      openMobile: false,
      setOpenMobile: () => {},
      isMobile: false,
      toggleSidebar: () => {},
    }),
  };
});

vi.mock(import("#/components/ui/dropdown-menu"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    DropdownMenu: (({ children }: { children?: ReactNode }) => (
      <div data-testid="dropdown-menu">{children}</div>
    )) as typeof actual.DropdownMenu,
    DropdownMenuContent: (({ children }: { children?: ReactNode }) => (
      <div data-testid="dropdown-menu-content">{children}</div>
    )) as typeof actual.DropdownMenuContent,
    DropdownMenuGroup: (({ children }: { children?: ReactNode }) => (
      <div data-testid="dropdown-menu-group">{children}</div>
    )) as typeof actual.DropdownMenuGroup,
    DropdownMenuItem: (({
      children,
      onSelect,
      ...props
    }: {
      children?: ReactNode;
      onSelect?: (event: Event) => void | Promise<void>;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        {...props}
        onClick={() => {
          const event = new Event("select", {
            cancelable: true,
          });

          void onSelect?.(event);
        }}
      >
        {children}
      </button>
    )) as typeof actual.DropdownMenuItem,
    DropdownMenuLabel: (({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    )) as typeof actual.DropdownMenuLabel,
    DropdownMenuSeparator: (() => (
      <hr />
    )) as typeof actual.DropdownMenuSeparator,
    DropdownMenuTrigger: (({
      children,
      render: renderSlot,
    }: {
      children?: ReactNode;
      render?: ReactNode;
    }) => (
      <div>
        {renderSlot}
        {children}
      </div>
    )) as typeof actual.DropdownMenuTrigger,
  };
});

vi.mock(import("#/components/ui/avatar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Avatar: (({ children }: { children?: ReactNode }) => (
      <div data-testid="avatar">{children}</div>
    )) as typeof actual.Avatar,
    AvatarFallback: (({ children }: { children?: ReactNode }) => (
      <div data-testid="avatar-fallback">{children}</div>
    )) as typeof actual.AvatarFallback,
    AvatarImage: (({ alt }: { alt?: string }) => (
      <img alt={alt} />
    )) as typeof actual.AvatarImage,
  };
});

vi.mock(import("@hugeicons/react"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    HugeiconsIcon: (({ icon }: { icon?: unknown }) => (
      <span data-testid="hugeicon">{String(icon ?? "icon")}</span>
    )) as typeof actual.HugeiconsIcon,
  };
});

describe("nav user", () => {
  const user = {
    name: "Taylor Example",
    email: "person@example.com",
    image: null,
  };

  beforeEach(() => {
    mockedNavigate.mockResolvedValue();
    mockedSignOut.mockReset();
    mockedHardRedirectToLogin.mockReset();
    mockedHardRedirectToLogin.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderNavUser() {
    return render(<NavUser user={user} navigate={mockedNavigate} />);
  }

  it(
    "shows a pending label and blocks repeat clicks while sign-out is in flight",
    {
      timeout: 10_000,
    },
    async () => {
      const signOutPromise = Promise.withResolvers<SignOutResult>();

      mockedSignOut.mockReturnValue(signOutPromise.promise);

      const userInteraction = userEvent.setup();
      renderNavUser();

      const signOutButton = screen.getByRole("button", {
        name: /sign out/i,
      });

      await userInteraction.click(signOutButton);

      await expect(
        screen.findByRole("button", {
          name: /signing out/i,
        })
      ).resolves.toBeDisabled();

      await userInteraction.click(
        screen.getByRole("button", {
          name: /signing out/i,
        })
      );
      expect(mockedSignOut).toHaveBeenCalledOnce();

      signOutPromise.resolve({
        data: {
          success: true,
        },
        error: null,
      });

      await waitFor(() => {
        expect(mockedNavigate).toHaveBeenCalledExactlyOnceWith({
          search: {
            invitation: undefined,
          },
          to: "/login",
        });
      });
    }
  );

  it(
    "shows the fallback error message when sign-out returns an error payload",
    {
      timeout: 10_000,
    },
    async () => {
      mockedSignOut.mockResolvedValue({
        data: null,
        error: {
          message: "Session already ended",
          status: 401,
          statusText: "Unauthorized",
        },
      });

      const userInteraction = userEvent.setup();
      renderNavUser();

      await userInteraction.click(
        screen.getByRole("button", {
          name: /sign out/i,
        })
      );

      await expect(screen.findByRole("status")).resolves.toHaveTextContent(
        "Couldn't sign out. Please try again."
      );
      expect(mockedNavigate).not.toHaveBeenCalled();
    }
  );

  it(
    "redirects to /login on successful sign-out",
    {
      timeout: 10_000,
    },
    async () => {
      mockedSignOut.mockResolvedValue({
        data: {
          success: true,
        },
        error: null,
      });

      const userInteraction = userEvent.setup();
      renderNavUser();

      await userInteraction.click(
        screen.getByRole("button", {
          name: /sign out/i,
        })
      );

      await waitFor(() => {
        expect(mockedNavigate).toHaveBeenCalledExactlyOnceWith({
          search: {
            invitation: undefined,
          },
          to: "/login",
        });
      });
    }
  );

  it(
    "falls back to a hard redirect when client navigation rejects after sign-out succeeds",
    {
      timeout: 10_000,
    },
    async () => {
      mockedSignOut.mockResolvedValue({
        data: {
          success: true,
        },
        error: null,
      });
      mockedNavigate.mockRejectedValueOnce(new Error("navigation failed"));

      const userInteraction = userEvent.setup();
      renderNavUser();

      await userInteraction.click(
        screen.getByRole("button", {
          name: /sign out/i,
        })
      );

      await waitFor(() => {
        expect(mockedHardRedirectToLogin).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(mockedSignOut).toHaveBeenCalledOnce();
      expect(mockedNavigate).toHaveBeenCalledOnce();
    }
  );

  it(
    "shows the fallback error message when hard redirect also fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedSignOut.mockResolvedValue({
        data: {
          success: true,
        },
        error: null,
      });
      mockedNavigate.mockRejectedValueOnce(new Error("navigation failed"));
      mockedHardRedirectToLogin.mockReturnValueOnce(false);

      const userInteraction = userEvent.setup();
      renderNavUser();

      await userInteraction.click(
        screen.getByRole("button", {
          name: /sign out/i,
        })
      );

      await expect(screen.findByRole("status")).resolves.toHaveTextContent(
        "Couldn't redirect after sign out. Please try again."
      );
      expect(mockedHardRedirectToLogin).toHaveBeenCalledOnce();
    }
  );
});
