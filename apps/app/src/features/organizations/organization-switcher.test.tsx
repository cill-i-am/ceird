import {
  decodeOrganizationId,
  type OrganizationSummary,
} from "@ceird/identity-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import type { ComponentProps, ReactNode } from "react";

import { OrganizationSwitcher } from "./organization-switcher";

const { mockedListOrganizations, mockedSetActiveOrganization } = vi.hoisted(
  () => ({
    mockedListOrganizations:
      vi.fn<() => Promise<readonly OrganizationSummary[]>>(),
    mockedSetActiveOrganization: vi.fn<() => Promise<void>>(),
  })
);

const { mockedRadioCancel, mockedRouterInvalidate } = vi.hoisted(() => ({
  mockedRadioCancel: vi.fn<() => void>(),
  mockedRouterInvalidate: vi.fn<() => Promise<void>>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useRouter: (() => ({
      invalidate: mockedRouterInvalidate,
    })) as typeof actual.useRouter,
  };
});

vi.mock(import("./organization-access"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    listOrganizations:
      mockedListOrganizations as unknown as typeof actual.listOrganizations,
    setActiveOrganization:
      mockedSetActiveOrganization as unknown as typeof actual.setActiveOrganization,
  };
});

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    SidebarMenuButton: (({
      children,
      render: renderSlot,
      ...props
    }: ComponentProps<"button"> & {
      children?: ReactNode;
      render?: ReactNode;
      size?: string;
    }) => (
      <button type="button" {...props}>
        {renderSlot}
        {children}
      </button>
    )) as typeof actual.SidebarMenuButton,
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
  const DropdownMenuOpenContext = React.createContext<{
    readonly open: boolean;
    readonly setOpen: (open: boolean) => void;
  } | null>(null);

  return {
    ...actual,
    DropdownMenu: (({
      children,
      onOpenChange,
      open = false,
    }: {
      children?: ReactNode;
      onOpenChange?: (open: boolean) => void;
      open?: boolean;
    }) => (
      <DropdownMenuOpenContext.Provider
        value={{ open, setOpen: (nextOpen) => onOpenChange?.(nextOpen) }}
      >
        <div data-testid="dropdown-menu">{children}</div>
      </DropdownMenuOpenContext.Provider>
    )) as typeof actual.DropdownMenu,
    DropdownMenuContent: (({ children }: { children?: ReactNode }) => {
      const dropdownMenu = React.useContext(DropdownMenuOpenContext);

      if (!dropdownMenu?.open) {
        return null;
      }

      return <div data-testid="dropdown-menu-content">{children}</div>;
    }) as typeof actual.DropdownMenuContent,
    DropdownMenuGroup: (({ children }: { children?: ReactNode }) => (
      <div data-testid="dropdown-menu-group">{children}</div>
    )) as typeof actual.DropdownMenuGroup,
    DropdownMenuItem: (({
      children,
      onClick,
      onSelect,
      ...props
    }: ComponentProps<"button"> & {
      children?: ReactNode;
      onSelect?: (event: Event) => void | Promise<void>;
    }) => (
      <button
        type="button"
        {...props}
        onClick={(event) => {
          onClick?.(event);

          if (event.defaultPrevented) {
            return;
          }

          const selectEvent = new Event("select", {
            cancelable: true,
          });

          void onSelect?.(selectEvent);
        }}
      >
        {children}
      </button>
    )) as typeof actual.DropdownMenuItem,
    DropdownMenuLabel: (({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    )) as typeof actual.DropdownMenuLabel,
    DropdownMenuRadioGroup: (({
      children,
      onValueChange,
      value,
    }: {
      children?: ReactNode;
      onValueChange?: (
        value: string,
        eventDetails: { readonly cancel: () => void }
      ) => void;
      value?: string;
    }) => (
      <div data-value={value} role="group">
        {Array.isArray(children)
          ? children.map((child) => {
              if (!React.isValidElement(child)) {
                return child;
              }

              return React.cloneElement(
                child as React.ReactElement<{
                  onValueSelect?: (value: string) => void;
                }>,
                {
                  onValueSelect: (nextValue: string) => {
                    onValueChange?.(nextValue, {
                      cancel: mockedRadioCancel,
                    });
                  },
                }
              );
            })
          : children}
      </div>
    )) as typeof actual.DropdownMenuRadioGroup,
    DropdownMenuRadioItem: (({
      children,
      value,
      checked,
      disabled,
      onValueSelect,
    }: {
      children?: ReactNode;
      value?: string;
      checked?: boolean;
      disabled?: boolean;
      onValueSelect?: (value: string) => void;
    }) => (
      <button
        type="button"
        aria-checked={checked}
        disabled={disabled}
        role="menuitemradio"
        value={value}
        onClick={() => {
          if (value) {
            onValueSelect?.(value);
          }
        }}
      >
        {children}
      </button>
    )) as typeof actual.DropdownMenuRadioItem,
    DropdownMenuSeparator: (() => (
      <hr />
    )) as typeof actual.DropdownMenuSeparator,
    DropdownMenuShortcut: (({ children }: { children?: ReactNode }) => (
      <span>{children}</span>
    )) as typeof actual.DropdownMenuShortcut,
    DropdownMenuTrigger: (({
      children,
      render: renderSlot,
    }: {
      children?: ReactNode;
      render?: ReactNode;
    }) => {
      const dropdownMenu = React.useContext(DropdownMenuOpenContext);

      return (
        <div>
          {React.isValidElement(renderSlot)
            ? React.cloneElement(
                renderSlot as React.ReactElement<{
                  onClick?: React.MouseEventHandler;
                }>,
                {
                  onClick: () => {
                    dropdownMenu?.setOpen(!dropdownMenu.open);
                  },
                }
              )
            : renderSlot}
          {children}
        </div>
      );
    }) as typeof actual.DropdownMenuTrigger,
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

function organization(input: {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}): OrganizationSummary {
  return {
    id: decodeOrganizationId(input.id),
    name: input.name,
    slug: input.slug,
  };
}

function renderSwitcher(activeOrganization: OrganizationSummary | null) {
  return render(
    <HotkeysProvider>
      <OrganizationSwitcher activeOrganization={activeOrganization} />
    </HotkeysProvider>
  );
}

describe("organization switcher", () => {
  beforeEach(() => {
    mockedListOrganizations.mockReset();
    mockedRadioCancel.mockReset();
    mockedSetActiveOrganization.mockReset();
    mockedRouterInvalidate.mockReset();
  });

  it("shows a loading state while organizations are loading", async () => {
    mockedListOrganizations.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderSwitcher(
      organization({
        id: "org_acme",
        name: "Acme Field Ops",
        slug: "acme",
      })
    );

    expect(
      screen.getByRole("button", { name: /acme field ops/i })
    ).toHaveAttribute("aria-busy", "true");
    await user.click(screen.getByRole("button", { name: /acme field ops/i }));
    expect(screen.getByText(/loading organizations/i)).toBeInTheDocument();
  });

  it("renders an empty disabled state when the user has no organizations", async () => {
    mockedListOrganizations.mockResolvedValue([]);

    renderSwitcher(null);

    expect(
      await screen.findByRole("button", { name: /no active organization/i })
    ).toBeDisabled();
    expect(screen.queryByText(/no organizations/i)).not.toBeInTheDocument();
  });

  it("renders a single organization without switch actions", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
    ]);

    renderSwitcher(
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" })
    );

    expect(
      await screen.findByRole("button", { name: /acme field ops/i })
    ).toBeDisabled();
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("shows list failures with a retry action", async () => {
    mockedListOrganizations.mockRejectedValueOnce(new Error("network down"));
    mockedListOrganizations.mockResolvedValueOnce([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);

    const user = userEvent.setup();
    renderSwitcher(
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" })
    );

    await user.click(
      await screen.findByRole("button", { name: /acme field ops/i })
    );

    expect(
      await screen.findByText(/couldn't load organizations/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(
      await screen.findByRole("menuitemradio", { name: /beta builds/i })
    ).toBeInTheDocument();
  });

  it("keeps retry reachable when organization loading fails without an active organization", async () => {
    mockedListOrganizations.mockRejectedValueOnce(new Error("network down"));
    mockedListOrganizations.mockResolvedValueOnce([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);

    const user = userEvent.setup();
    renderSwitcher(null);

    const trigger = await screen.findByRole("button", {
      name: /no active organization/i,
    });

    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(
      await screen.findByText(/couldn't load organizations/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(
      await screen.findByRole("menuitemradio", { name: /beta builds/i })
    ).toBeInTheDocument();
  });

  it("switches organizations and invalidates router state synchronously", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);
    mockedSetActiveOrganization.mockResolvedValue();
    mockedRouterInvalidate.mockResolvedValue();

    const user = userEvent.setup();
    renderSwitcher(
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" })
    );

    await user.click(
      await screen.findByRole("button", { name: /acme field ops/i })
    );

    await user.click(
      await screen.findByRole("menuitemradio", { name: /beta builds/i })
    );

    expect(mockedSetActiveOrganization).toHaveBeenCalledWith("org_beta");
    expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
    expect(mockedRadioCancel).toHaveBeenCalledOnce();
    expect(
      mockedSetActiveOrganization.mock.invocationCallOrder[0]
    ).toBeLessThan(mockedRouterInvalidate.mock.invocationCallOrder[0]);
    expect(
      screen.queryByText(/couldn't switch organizations/i)
    ).not.toBeInTheDocument();
  });

  it("keeps the current organization visible when switching fails", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);
    mockedSetActiveOrganization.mockRejectedValue(new Error("switch failed"));

    const user = userEvent.setup();
    renderSwitcher(
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" })
    );

    await user.click(
      await screen.findByRole("button", { name: /acme field ops/i })
    );

    await user.click(
      await screen.findByRole("menuitemradio", { name: /beta builds/i })
    );

    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("alert", {
        name: /couldn't switch organizations/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /acme field ops/i })
    ).toBeInTheDocument();
  });

  it("does not call setActive for the already active organization", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);

    const user = userEvent.setup();
    renderSwitcher(
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" })
    );

    await user.click(
      await screen.findByRole("button", { name: /acme field ops/i })
    );

    await user.click(
      await screen.findByRole("menuitemradio", { name: /acme field ops/i })
    );

    expect(mockedSetActiveOrganization).not.toHaveBeenCalled();
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  });

  it("opens the switcher with G O when multiple organizations are available", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);

    const user = userEvent.setup();
    renderSwitcher(
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" })
    );

    await screen.findByRole("button", { name: /acme field ops/i });
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();

    await user.keyboard("go");

    expect(
      await screen.findByRole("menuitemradio", { name: /beta builds/i })
    ).toBeInTheDocument();
  });
});
