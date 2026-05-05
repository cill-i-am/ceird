import {
  decodeOrganizationId,
  type OrganizationSummary,
} from "@ceird/identity-core";
import { render, screen } from "@testing-library/react";
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

const { mockedRouterInvalidate } = vi.hoisted(() => ({
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
      value,
    }: {
      children?: ReactNode;
      value?: string;
    }) => (
      <div data-value={value} role="group">
        {children}
      </div>
    )) as typeof actual.DropdownMenuRadioGroup,
    DropdownMenuRadioItem: (({
      children,
      value,
      checked,
      disabled,
      onSelect,
    }: {
      children?: ReactNode;
      value?: string;
      checked?: boolean;
      disabled?: boolean;
      onSelect?: (event: Event) => void | Promise<void>;
    }) => (
      <button
        type="button"
        aria-checked={checked}
        disabled={disabled}
        role="menuitemradio"
        value={value}
        onClick={() => {
          const selectEvent = new Event("select", {
            cancelable: true,
          });

          void onSelect?.(selectEvent);
        }}
      >
        {children}
      </button>
    )) as typeof actual.DropdownMenuRadioItem,
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
    <OrganizationSwitcher activeOrganization={activeOrganization} />
  );
}

describe("organization switcher", () => {
  beforeEach(() => {
    mockedListOrganizations.mockReset();
    mockedSetActiveOrganization.mockReset();
    mockedRouterInvalidate.mockReset();
  });

  it("shows a loading state while organizations are loading", () => {
    mockedListOrganizations.mockReturnValue(new Promise(() => {}));

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
    expect(screen.getByText(/loading organizations/i)).toBeInTheDocument();
  });

  it("renders an empty disabled state when the user has no organizations", async () => {
    mockedListOrganizations.mockResolvedValue([]);

    renderSwitcher(null);

    expect(await screen.findByText(/no organizations/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /no active organization/i })
    ).toBeDisabled();
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
    expect(
      await screen.findByText(/couldn't load organizations/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(
      await screen.findByRole("menuitemradio", { name: /beta builds/i })
    ).toBeInTheDocument();
  });
});
