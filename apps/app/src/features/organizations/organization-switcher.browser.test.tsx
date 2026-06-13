import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationSummary } from "@ceird/identity-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const { mockedSidebarState } = vi.hoisted(() => ({
  mockedSidebarState: {
    isMobile: false,
  },
}));

const { mockedReloadAfterActiveOrganizationRefreshFailure } = vi.hoisted(
  () => ({
    mockedReloadAfterActiveOrganizationRefreshFailure: vi.fn<() => void>(),
  })
);

const {
  mockedGetBrowserLocationHref,
  mockedGetBrowserLocationPath,
  mockedNavigateBrowserTo,
} = vi.hoisted(() => ({
  mockedGetBrowserLocationHref: vi.fn<() => string>(),
  mockedGetBrowserLocationPath: vi.fn<() => string>(),
  mockedNavigateBrowserTo: vi.fn<(url: string) => void>(),
}));

const promiseWithResolvers = Promise as unknown as {
  withResolvers<Value>(): {
    promise: Promise<Value>;
    reject: (reason?: unknown) => void;
    resolve: (value: Value | PromiseLike<Value>) => void;
  };
};

vi.mock(import("#/lib/browser-navigation"), () => ({
  getBrowserLocationHref: mockedGetBrowserLocationHref,
  getBrowserLocationPath: mockedGetBrowserLocationPath,
  navigateBrowserTo: mockedNavigateBrowserTo,
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

vi.mock(import("./organization-access"), () => ({
  listOrganizations: mockedListOrganizations,
  setActiveOrganization: mockedSetActiveOrganization,
}));

vi.mock(import("./organization-refresh-recovery"), () => ({
  reloadAfterActiveOrganizationRefreshFailure:
    mockedReloadAfterActiveOrganizationRefreshFailure,
}));

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    SidebarMenuButton: (({
      children,
      render: renderSlot,
      tooltip: _tooltip,
      ...props
    }: ComponentProps<"button"> & {
      children?: ReactNode;
      render?: ReactNode;
      size?: string;
      tooltip?: unknown;
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
      isMobile: mockedSidebarState.isMobile,
      toggleSidebar: () => {},
    }),
  };
});

vi.mock(import("#/components/ui/dropdown-menu"), async (importActual) => {
  const [actual, React] = await Promise.all([importActual(), import("react")]);
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
    DropdownMenuContent: (({
      children,
      side,
    }: {
      children?: ReactNode;
      side?: string;
    }) => {
      const dropdownMenu = React.use(DropdownMenuOpenContext);

      if (!dropdownMenu?.open) {
        return null;
      }

      return (
        <div data-side={side} data-testid="dropdown-menu-content">
          {children}
        </div>
      );
    }) as typeof actual.DropdownMenuContent,
    DropdownMenuGroup: (({ children }: { children?: ReactNode }) => (
      <div data-testid="dropdown-menu-group">{children}</div>
    )) as typeof actual.DropdownMenuGroup,
    DropdownMenuHeader: (({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    )) as typeof actual.DropdownMenuHeader,
    DropdownMenuItem: (({
      children,
      closeOnClick: _closeOnClick,
      onClick,
      ...props
    }: ComponentProps<"button"> & {
      children?: ReactNode;
      closeOnClick?: boolean;
    }) => (
      <button type="button" {...props} onClick={onClick}>
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
      <fieldset data-value={value}>
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
      </fieldset>
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
      const dropdownMenu = React.use(DropdownMenuOpenContext);

      return (
        <div>
          {React.isValidElement(renderSlot)
            ? React.cloneElement(
                renderSlot as React.ReactElement<{
                  children?: ReactNode;
                  onClick?: React.MouseEventHandler;
                }>,
                {
                  children,
                  onClick: () => {
                    dropdownMenu?.setOpen(!dropdownMenu.open);
                  },
                }
              )
            : renderSlot}
          {React.isValidElement(renderSlot) ? null : children}
        </div>
      );
    }) as typeof actual.DropdownMenuTrigger,
  };
});

vi.mock(import("@hugeicons/react"), async (importActual) => {
  const [actual, { UnfoldMoreIcon }] = await Promise.all([
    importActual(),
    import("@hugeicons/core-free-icons"),
  ]);

  return {
    ...actual,
    HugeiconsIcon: (({ icon }: { icon?: unknown }) => {
      const iconName =
        icon === UnfoldMoreIcon ? "unfold-more-icon" : "hugeicon";

      return <span data-testid={iconName}>{String(icon ?? "icon")}</span>;
    }) as typeof actual.HugeiconsIcon,
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

function renderSwitcher(
  activeOrganization: OrganizationSummary | null,
  organizations?: readonly OrganizationSummary[],
  activeOrganizationId: OrganizationId | null = activeOrganization?.id ?? null
) {
  return render(
    <HotkeysProvider>
      <OrganizationSwitcher
        activeOrganization={activeOrganization}
        activeOrganizationId={activeOrganizationId}
        organizations={organizations}
      />
    </HotkeysProvider>
  );
}

function getModNumberKeyboardInput(number: number) {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? `{Meta>}${number}{/Meta}`
    : `{Control>}${number}{/Control}`;
}

describe("organization switcher", () => {
  beforeEach(() => {
    mockedGetBrowserLocationHref.mockReset();
    mockedGetBrowserLocationPath.mockReset();
    mockedNavigateBrowserTo.mockReset();
    mockedListOrganizations.mockReset();
    mockedRadioCancel.mockReset();
    mockedReloadAfterActiveOrganizationRefreshFailure.mockReset();
    mockedSetActiveOrganization.mockReset();
    mockedRouterInvalidate.mockReset();
    mockedSidebarState.isMobile = false;
    vi.unstubAllEnvs();
    setTestLocation({
      hash: "#activity",
      pathname: "/jobs/42",
      search: "?tab=notes",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setTestLocation({
    hash = "",
    pathname,
    search = "",
  }: {
    readonly hash?: string;
    readonly pathname: string;
    readonly search?: string;
  }) {
    mockedGetBrowserLocationHref.mockReturnValue(
      `https://app.pr-123.ceird.app${pathname}${search}${hash}`
    );
    mockedGetBrowserLocationPath.mockReturnValue(`${pathname}${search}${hash}`);
    window.history.replaceState({}, "", `${pathname}${search}${hash}`);
  }

  it("shows a loading state while organizations are loading", async () => {
    const loadingOrganizations =
      promiseWithResolvers.withResolvers<readonly OrganizationSummary[]>();

    mockedListOrganizations.mockReturnValue(loadingOrganizations.promise);

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
    expect(screen.getByText(/loading teams/i)).toBeInTheDocument();
  });

  it("renders an empty disabled state when the user has no organizations", async () => {
    mockedListOrganizations.mockResolvedValue([]);

    renderSwitcher(null);

    await expect(
      screen.findByRole("button", { name: /no active organization/i })
    ).resolves.toBeDisabled();
    expect(screen.queryByText(/no organizations/i)).not.toBeInTheDocument();
  });

  it("renders a single organization in the teams menu with add team disabled", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
    ]);

    const user = userEvent.setup();
    renderSwitcher(
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" })
    );

    const trigger = await screen.findByRole("button", {
      name: /acme field ops/i,
    });

    expect(trigger).toBeEnabled();
    await user.click(trigger);

    expect(screen.getByText("Teams")).toBeVisible();
    expect(
      screen.getByRole("menuitemradio", { name: /acme field ops/i })
    ).toBeVisible();
    expect(screen.queryByText("Only organization")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add team/i })).toBeDisabled();
    expect(screen.getByText("Coming soon")).toBeVisible();
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

    await expect(
      screen.findByText(/couldn't load teams/i)
    ).resolves.toBeInTheDocument();
    expect(screen.getByTestId("unfold-more-icon")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await expect(
      screen.findByRole("menuitemradio", { name: /beta builds/i })
    ).resolves.toBeInTheDocument();
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
    await expect(
      screen.findByText(/couldn't load teams/i)
    ).resolves.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await expect(
      screen.findByRole("menuitemradio", { name: /beta builds/i })
    ).resolves.toBeInTheDocument();
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

    expect(screen.getByTestId("unfold-more-icon")).toBeInTheDocument();

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

  it("switches active organization before navigating to the target tenant URL", async () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
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
    expect(mockedNavigateBrowserTo).toHaveBeenCalledWith(
      "https://beta--pr-123.ceird.app/jobs/42?tab=notes#activity"
    );
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  });

  it("waits for active organization switching before navigating to the target tenant URL", async () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    const activeOrganizationSwitch = promiseWithResolvers.withResolvers<null>();

    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);
    mockedSetActiveOrganization.mockImplementation(async () => {
      await activeOrganizationSwitch.promise;
    });
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
    expect(mockedNavigateBrowserTo).not.toHaveBeenCalled();

    act(() => {
      activeOrganizationSwitch.resolve(null);
    });

    await waitFor(() => {
      expect(mockedNavigateBrowserTo).toHaveBeenCalledWith(
        "https://beta--pr-123.ceird.app/jobs/42?tab=notes#activity"
      );
    });
  });

  it("uses the tenant root when switching from auth-only paths", async () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
    setTestLocation({ pathname: "/settings" });
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

    expect(mockedNavigateBrowserTo).toHaveBeenCalledWith(
      "https://beta--pr-123.ceird.app/"
    );
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  });

  it("falls back to router invalidation when tenant hosts are disabled", async () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "disabled");
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

    expect(mockedNavigateBrowserTo).not.toHaveBeenCalled();
    expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
  });

  it("falls back to router invalidation when no tenant URL can be built", async () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "bad/stage");
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

    expect(mockedNavigateBrowserTo).not.toHaveBeenCalled();
    expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
  });

  it("uses provided organizations without loading the list again", async () => {
    const organizations = [
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ];

    const user = userEvent.setup();
    renderSwitcher(organizations[0], organizations);

    expect(mockedListOrganizations).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /acme field ops/i }));

    expect(
      screen.getByRole("menuitemradio", { name: /beta builds/i })
    ).toBeInTheDocument();
  });

  it("opens the organization menu below the trigger on mobile", async () => {
    mockedSidebarState.isMobile = true;
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

    expect(screen.getByTestId("dropdown-menu-content")).toHaveAttribute(
      "data-side",
      "bottom"
    );
  });

  it("resolves the active organization from the listed organizations", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);

    const user = userEvent.setup();
    renderSwitcher(null, undefined, decodeOrganizationId("org_acme"));

    const trigger = await screen.findByRole("button", {
      name: /acme field ops/i,
    });

    expect(trigger).toBeEnabled();
    await user.click(trigger);

    expect(
      screen.getByRole("menuitemradio", { name: /beta builds/i })
    ).toBeInTheDocument();
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
    await expect(
      screen.findByRole("alert", {
        name: /couldn't switch organizations/i,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /acme field ops/i })
    ).toBeInTheDocument();
  });

  it("reloads the page when active organization refresh fails after switching", async () => {
    mockedListOrganizations.mockResolvedValue([
      organization({ id: "org_acme", name: "Acme Field Ops", slug: "acme" }),
      organization({ id: "org_beta", name: "Beta Builds", slug: "beta" }),
    ]);
    mockedSetActiveOrganization.mockResolvedValue();
    mockedRouterInvalidate.mockRejectedValue(new Error("refresh failed"));

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
    expect(
      mockedReloadAfterActiveOrganizationRefreshFailure
    ).toHaveBeenCalledOnce();
    expect(
      screen.queryByText(/couldn't switch organizations/i)
    ).not.toBeInTheDocument();
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

  it("navigates the already active organization to its tenant URL", async () => {
    vi.stubEnv("VITE_TENANT_BASE_DOMAIN", "ceird.app");
    vi.stubEnv("VITE_TENANT_HOST_MODE", "stage");
    vi.stubEnv("VITE_TENANT_RESERVED_HOSTNAMES", "app.pr-123.ceird.app");
    vi.stubEnv("VITE_TENANT_STAGE_ALIAS", "pr-123");
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
    expect(screen.getByText("Current")).toBeVisible();

    await user.click(
      await screen.findByRole("menuitemradio", { name: /acme field ops/i })
    );

    expect(mockedSetActiveOrganization).not.toHaveBeenCalled();
    expect(mockedRouterInvalidate).not.toHaveBeenCalled();
    expect(mockedNavigateBrowserTo).toHaveBeenCalledWith(
      "https://acme--pr-123.ceird.app/jobs/42?tab=notes#activity"
    );
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

    await expect(
      screen.findByRole("menuitemradio", { name: /beta builds/i })
    ).resolves.toBeInTheDocument();
  });

  it("switches organizations with the visible team index shortcut", async () => {
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
    await user.keyboard(getModNumberKeyboardInput(2));

    await waitFor(() => {
      expect(mockedSetActiveOrganization).toHaveBeenCalledWith("org_beta");
    });
    expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
  });
});
